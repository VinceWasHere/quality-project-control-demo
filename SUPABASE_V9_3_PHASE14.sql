-- Quality Project Control MAIN V9.3 · Fase 14
-- Evidencias múltiples reales para el contenido de informes.
-- Ejecutar después de V9.2. Idempotente y no destructivo.

begin;

alter table public.qpc_report_entry_files
  add column if not exists updated_at timestamptz not null default now();

-- Llevar la evidencia principal histórica al catálogo de evidencias múltiples.
insert into public.qpc_report_entry_files(
  entry_id,file_id,caption,sort_order,created_by,created_at,updated_at
)
select
  e.id,e.file_id,
  case when coalesce(f.original_name,'')<>'' then f.original_name else 'Evidencia principal' end,
  0,e.created_by,coalesce(e.created_at,now()),now()
from public.qpc_report_entries e
join public.qpc_files f on f.id=e.file_id and f.deleted_at is null
where e.file_id is not null
on conflict(entry_id,file_id) do update set
  archived_at=null,
  updated_at=now();

create index if not exists qpc_report_entry_files_active_sort_idx
  on public.qpc_report_entry_files(entry_id,sort_order,created_at)
  where archived_at is null;

-- Evidencias enriquecidas del periodo.
create or replace function public.qpc_report_evidence_for_period(
  p_project_id text,
  p_period_mode text,
  p_period_value text
)
returns table(
  link_id uuid,
  entry_id uuid,
  file_id uuid,
  caption text,
  sort_order integer,
  is_primary boolean,
  bucket text,
  storage_path text,
  original_name text,
  mime_type text,
  size_bytes bigint,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path=public
as $$
begin
  if auth.uid() is null then raise exception 'Sesión no válida'; end if;
  if not public.qpc_user_can_access_project(auth.uid(),p_project_id) then
    raise exception 'No tiene acceso al proyecto';
  end if;
  if not public.user_has_permission_for(auth.uid(),'reports.content.view') then
    raise exception 'No tiene permiso para consultar evidencias de informes';
  end if;

  return query
  select
    l.id,l.entry_id,l.file_id,l.caption,l.sort_order,
    (e.file_id=l.file_id) as is_primary,
    f.bucket,f.storage_path,f.original_name,f.mime_type,f.size_bytes,l.created_at
  from public.qpc_report_entry_files l
  join public.qpc_report_entries e on e.id=l.entry_id
  join public.qpc_files f on f.id=l.file_id and f.deleted_at is null
  where e.project_id=p_project_id
    and e.period_mode=p_period_mode
    and e.period_value=p_period_value
    and e.is_active=true
    and e.archived_at is null
    and l.archived_at is null
  order by e.section_code,e.sort_order,l.sort_order,l.created_at,l.id;
end;
$$;

-- Vincular un archivo subido a un registro.
create or replace function public.qpc_attach_report_entry_file(
  p_entry_id uuid,
  p_file jsonb,
  p_caption text default '',
  p_sort_order integer default null
)
returns table(link_id uuid,file_id uuid,is_primary boolean)
language plpgsql
security definer
set search_path=public
as $$
declare
  v_actor uuid:=auth.uid();
  v_entry public.qpc_report_entries%rowtype;
  v_file_id uuid;
  v_link_id uuid;
  v_order integer;
  v_primary boolean:=false;
begin
  if v_actor is null then raise exception 'Sesión no válida'; end if;
  select * into v_entry from public.qpc_report_entries where id=p_entry_id for update;
  if not found then raise exception 'Registro de informe no encontrado'; end if;
  if not public.qpc_user_can_access_project(v_actor,v_entry.project_id) then raise exception 'No tiene acceso al proyecto'; end if;
  if not public.user_has_permission_for(v_actor,'reports.content.evidence.manage') then raise exception 'No tiene permiso para gestionar evidencias'; end if;
  if nullif(p_file->>'storage_path','') is null then raise exception 'Ruta de Storage obligatoria'; end if;

  insert into public.qpc_files(project_id,bucket,storage_path,original_name,mime_type,size_bytes,uploaded_by)
  values(
    v_entry.project_id,
    coalesce(nullif(p_file->>'bucket',''),'qpc-attachments'),
    p_file->>'storage_path',
    coalesce(nullif(p_file->>'original_name',''),'archivo'),
    coalesce(nullif(p_file->>'mime_type',''),'application/octet-stream'),
    nullif(p_file->>'size_bytes','')::bigint,
    v_actor
  )
  on conflict(bucket,storage_path) do update set
    original_name=excluded.original_name,
    mime_type=excluded.mime_type,
    size_bytes=excluded.size_bytes,
    deleted_at=null
  returning id into v_file_id;

  select coalesce(p_sort_order,max(sort_order)+10,0) into v_order
  from public.qpc_report_entry_files
  where entry_id=p_entry_id and archived_at is null;

  insert into public.qpc_report_entry_files(entry_id,file_id,caption,sort_order,created_by,created_at,updated_at)
  values(p_entry_id,v_file_id,coalesce(p_caption,''),v_order,v_actor,now(),now())
  on conflict(entry_id,file_id) do update set
    caption=excluded.caption,
    sort_order=excluded.sort_order,
    archived_at=null,
    updated_at=now()
  returning id into v_link_id;

  if v_entry.file_id is null then
    update public.qpc_report_entries set file_id=v_file_id,updated_by=v_actor where id=p_entry_id;
    v_primary:=true;
  else
    v_primary:=v_entry.file_id=v_file_id;
  end if;

  insert into public.audit_logs(project_id,actor_id,action,entity_type,entity_id,new_data)
  values(v_entry.project_id,v_actor,'report_content.evidence_attached','report_entry',p_entry_id::text,
    jsonb_build_object('link_id',v_link_id,'file_id',v_file_id,'caption',coalesce(p_caption,'')));

  return query select v_link_id,v_file_id,v_primary;
end;
$$;

create or replace function public.qpc_update_report_entry_file(
  p_link_id uuid,
  p_caption text default null,
  p_make_primary boolean default false
)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  v_actor uuid:=auth.uid();
  v_link public.qpc_report_entry_files%rowtype;
  v_entry public.qpc_report_entries%rowtype;
begin
  if v_actor is null then raise exception 'Sesión no válida'; end if;
  select * into v_link from public.qpc_report_entry_files where id=p_link_id and archived_at is null for update;
  if not found then raise exception 'Evidencia no encontrada'; end if;
  select * into v_entry from public.qpc_report_entries where id=v_link.entry_id for update;
  if not public.qpc_user_can_access_project(v_actor,v_entry.project_id) then raise exception 'No tiene acceso al proyecto'; end if;
  if not public.user_has_permission_for(v_actor,'reports.content.evidence.manage') then raise exception 'No tiene permiso para gestionar evidencias'; end if;

  update public.qpc_report_entry_files
  set caption=case when p_caption is null then caption else p_caption end,updated_at=now()
  where id=p_link_id;

  if p_make_primary then
    update public.qpc_report_entries set file_id=v_link.file_id,updated_by=v_actor where id=v_entry.id;
  end if;

  insert into public.audit_logs(project_id,actor_id,action,entity_type,entity_id,new_data)
  values(v_entry.project_id,v_actor,'report_content.evidence_updated','report_entry',v_entry.id::text,
    jsonb_build_object('link_id',p_link_id,'caption',p_caption,'make_primary',p_make_primary));
end;
$$;

create or replace function public.qpc_reorder_report_entry_files(
  p_entry_id uuid,
  p_link_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  v_actor uuid:=auth.uid();
  v_entry public.qpc_report_entries%rowtype;
  v_expected integer;
  v_received integer;
begin
  if v_actor is null then raise exception 'Sesión no válida'; end if;
  select * into v_entry from public.qpc_report_entries where id=p_entry_id;
  if not found then raise exception 'Registro no encontrado'; end if;
  if not public.qpc_user_can_access_project(v_actor,v_entry.project_id) then raise exception 'No tiene acceso al proyecto'; end if;
  if not public.user_has_permission_for(v_actor,'reports.content.evidence.manage') then raise exception 'No tiene permiso para ordenar evidencias'; end if;

  select count(*) into v_expected from public.qpc_report_entry_files where entry_id=p_entry_id and archived_at is null;
  select count(distinct x) into v_received from unnest(coalesce(p_link_ids,array[]::uuid[])) x;
  if v_expected<>v_received then raise exception 'La lista de evidencias está incompleta'; end if;
  if exists(
    select 1 from unnest(p_link_ids) x
    where not exists(select 1 from public.qpc_report_entry_files l where l.id=x and l.entry_id=p_entry_id and l.archived_at is null)
  ) then raise exception 'La lista contiene una evidencia inválida'; end if;

  update public.qpc_report_entry_files l
  set sort_order=u.ord*10,updated_at=now()
  from unnest(p_link_ids) with ordinality u(id,ord)
  where l.id=u.id;

  insert into public.audit_logs(project_id,actor_id,action,entity_type,entity_id,new_data)
  values(v_entry.project_id,v_actor,'report_content.evidence_reordered','report_entry',p_entry_id::text,to_jsonb(p_link_ids));
end;
$$;

create or replace function public.qpc_archive_report_entry_file(p_link_id uuid)
returns table(remove_bucket text,remove_storage_path text)
language plpgsql
security definer
set search_path=public
as $$
declare
  v_actor uuid:=auth.uid();
  v_link public.qpc_report_entry_files%rowtype;
  v_entry public.qpc_report_entries%rowtype;
  v_file public.qpc_files%rowtype;
  v_next_file uuid;
  v_can_remove boolean:=false;
begin
  if v_actor is null then raise exception 'Sesión no válida'; end if;
  select * into v_link from public.qpc_report_entry_files where id=p_link_id and archived_at is null for update;
  if not found then raise exception 'Evidencia no encontrada'; end if;
  select * into v_entry from public.qpc_report_entries where id=v_link.entry_id for update;
  if not public.qpc_user_can_access_project(v_actor,v_entry.project_id) then raise exception 'No tiene acceso al proyecto'; end if;
  if not public.user_has_permission_for(v_actor,'reports.content.evidence.manage') then raise exception 'No tiene permiso para eliminar evidencias'; end if;
  select * into v_file from public.qpc_files where id=v_link.file_id;

  update public.qpc_report_entry_files set archived_at=now(),updated_at=now() where id=p_link_id;

  if v_entry.file_id=v_link.file_id then
    select file_id into v_next_file
    from public.qpc_report_entry_files
    where entry_id=v_entry.id and archived_at is null
    order by sort_order,created_at,id limit 1;
    update public.qpc_report_entries set file_id=v_next_file,updated_by=v_actor where id=v_entry.id;
  end if;

  v_can_remove:=not exists(select 1 from public.qpc_report_entry_files where file_id=v_link.file_id and archived_at is null)
    and not exists(select 1 from public.qpc_file_links where file_id=v_link.file_id and deleted_at is null);
  if v_can_remove then update public.qpc_files set deleted_at=now() where id=v_link.file_id; end if;

  insert into public.audit_logs(project_id,actor_id,action,entity_type,entity_id,new_data)
  values(v_entry.project_id,v_actor,'report_content.evidence_archived','report_entry',v_entry.id::text,
    jsonb_build_object('link_id',p_link_id,'file_id',v_link.file_id));

  return query select case when v_can_remove then v_file.bucket else null end,
                      case when v_can_remove then v_file.storage_path else null end;
end;
$$;

create or replace function public.qpc_archive_report_entry_v2(p_entry_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_actor uuid:=auth.uid();
  v_entry public.qpc_report_entries%rowtype;
  v_files jsonb:='[]'::jsonb;
begin
  if v_actor is null then raise exception 'Sesión no válida'; end if;
  select * into v_entry from public.qpc_report_entries where id=p_entry_id for update;
  if not found then raise exception 'Registro no encontrado'; end if;
  if not public.qpc_user_can_access_project(v_actor,v_entry.project_id) then raise exception 'No tiene acceso al proyecto'; end if;
  if not public.user_has_permission_for(v_actor,'reports.content.manage') then raise exception 'No tiene permiso para archivar contenido'; end if;

  update public.qpc_report_entry_files
  set archived_at=now(),updated_at=now()
  where entry_id=p_entry_id and archived_at is null;

  -- Solo se devuelven al cliente las rutas que realmente pueden eliminarse de
  -- Storage. Un archivo compartido con otra entidad no debe borrarse físicamente.
  select coalesce(jsonb_agg(jsonb_build_object('bucket',f.bucket,'storage_path',f.storage_path)),'[]'::jsonb)
  into v_files
  from public.qpc_files f
  where f.id in (select file_id from public.qpc_report_entry_files where entry_id=p_entry_id)
    and not exists(select 1 from public.qpc_report_entry_files l2 where l2.file_id=f.id and l2.archived_at is null)
    and not exists(select 1 from public.qpc_file_links fl where fl.file_id=f.id and fl.deleted_at is null);

  update public.qpc_files f set deleted_at=now()
  where f.id in (select file_id from public.qpc_report_entry_files where entry_id=p_entry_id)
    and not exists(select 1 from public.qpc_report_entry_files l2 where l2.file_id=f.id and l2.archived_at is null)
    and not exists(select 1 from public.qpc_file_links fl where fl.file_id=f.id and fl.deleted_at is null);
  update public.qpc_report_entries set is_active=false,archived_at=now(),updated_by=v_actor,file_id=null where id=p_entry_id;

  insert into public.audit_logs(project_id,actor_id,action,entity_type,entity_id,previous_data,new_data)
  values(v_entry.project_id,v_actor,'report_content.archived','report_entry',p_entry_id::text,to_jsonb(v_entry),jsonb_build_object('archived_at',now(),'evidence_count',jsonb_array_length(v_files)));
  return v_files;
end;
$$;

revoke all on function public.qpc_report_evidence_for_period(text,text,text) from public,anon;
revoke all on function public.qpc_attach_report_entry_file(uuid,jsonb,text,integer) from public,anon;
revoke all on function public.qpc_update_report_entry_file(uuid,text,boolean) from public,anon;
revoke all on function public.qpc_reorder_report_entry_files(uuid,uuid[]) from public,anon;
revoke all on function public.qpc_archive_report_entry_file(uuid) from public,anon;
revoke all on function public.qpc_archive_report_entry_v2(uuid) from public,anon;
grant execute on function public.qpc_report_evidence_for_period(text,text,text) to authenticated;
grant execute on function public.qpc_attach_report_entry_file(uuid,jsonb,text,integer) to authenticated;
grant execute on function public.qpc_update_report_entry_file(uuid,text,boolean) to authenticated;
grant execute on function public.qpc_reorder_report_entry_files(uuid,uuid[]) to authenticated;
grant execute on function public.qpc_archive_report_entry_file(uuid) to authenticated;
grant execute on function public.qpc_archive_report_entry_v2(uuid) to authenticated;

commit;
