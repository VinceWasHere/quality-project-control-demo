-- Quality Project Control MAIN V8.9 · Fase 10
-- Contenido corporativo de informes semanal/mensual.
-- Ejecutar después de V8.0–V8.8. Idempotente y no destructivo.

begin;

create extension if not exists pgcrypto;

-- Compatibilidad con esquemas iniciales.
alter table public.permissions
  add column if not exists updated_at timestamptz not null default now();
alter table public.role_permissions
  add column if not exists updated_at timestamptz not null default now();

-- -----------------------------------------------------------------------------
-- 1. Permisos del módulo
-- -----------------------------------------------------------------------------
insert into public.permissions(code,name,description,category,sort_order)
values
  ('reports.content.view','Ver contenido de informes','Consultar buenas prácticas, NC, capacitaciones y demás contenido corporativo.','INFORMES',10),
  ('reports.content.manage','Gestionar contenido de informes','Crear, modificar, ordenar y archivar contenido corporativo de informes.','INFORMES',20)
on conflict(code) do update set
  name=excluded.name,
  description=excluded.description,
  category=excluded.category,
  sort_order=excluded.sort_order,
  updated_at=now();

-- Lectura para Calidad y perfiles ejecutivos; edición para Calidad.
select public.qpc_set_role_permission('CALIDAD','reports.content.view',true);
select public.qpc_set_role_permission('CALIDAD','reports.content.manage',true);
select public.qpc_set_role_permission('COORDINADOR_CALIDAD','reports.content.view',true);
select public.qpc_set_role_permission('COORDINADOR_CALIDAD','reports.content.manage',true);
select public.qpc_set_role_permission('GERENCIA','reports.content.view',true);
select public.qpc_set_role_permission('PRESIDENTE','reports.content.view',true);
select public.qpc_set_role_permission('IT','reports.content.view',true);
select public.qpc_set_role_permission('IT','reports.content.manage',true);

-- Garantía absoluta de permisos para IT, incluyendo permisos nuevos.
insert into public.role_permissions(role,permission_id,allowed)
select 'IT',p.id,true from public.permissions p
on conflict(role,permission_id)
do update set allowed=true,updated_at=now();

-- -----------------------------------------------------------------------------
-- 2. Registros de contenido corporativo
-- -----------------------------------------------------------------------------
create table if not exists public.qpc_report_entries (
  id uuid primary key default gen_random_uuid(),
  project_id text not null references public.qpc_projects(id) on delete restrict,
  period_mode text not null check (period_mode in ('week','month')),
  period_value text not null,
  section_code text not null check (section_code in (
    'GOOD_PRACTICES',
    'WORKSHOPS_TO_IMPROVE',
    'NONCONFORMITIES',
    'TRAININGS',
    'SPECIAL_ATTENTION',
    'MATERIAL_TESTS',
    'LESSONS_LEARNED',
    'CONCLUSIONS',
    'RECOMMENDATIONS',
    'MOTIVATIONAL_ACTION'
  )),
  title text not null default '',
  description text not null default '',
  location_text text not null default '',
  responsible text not null default '',
  action_plan text not null default '',
  reference_code text not null default '',
  quantity integer,
  result_status text not null default '',
  notes text not null default '',
  file_id uuid references public.qpc_files(id) on delete set null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint qpc_report_entries_period_value_check check (
    (period_mode='week' and period_value ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$')
    or
    (period_mode='month' and period_value ~ '^[0-9]{4}-[0-9]{2}$')
  )
);

create index if not exists qpc_report_entries_period_idx
  on public.qpc_report_entries(project_id,period_mode,period_value,section_code,sort_order,created_at);
create index if not exists qpc_report_entries_active_idx
  on public.qpc_report_entries(project_id,period_mode,period_value)
  where archived_at is null and is_active=true;

-- Trigger de actualización.
drop trigger if exists trg_qpc_report_entries_updated_at on public.qpc_report_entries;
create trigger trg_qpc_report_entries_updated_at
before update on public.qpc_report_entries
for each row execute function public.qpc_touch_updated_at();

-- -----------------------------------------------------------------------------
-- 3. Consulta enriquecida del periodo
-- -----------------------------------------------------------------------------
create or replace function public.qpc_report_entries_for_period(
  p_project_id text,
  p_period_mode text,
  p_period_value text
)
returns table (
  id uuid,
  project_id text,
  period_mode text,
  period_value text,
  section_code text,
  title text,
  description text,
  location_text text,
  responsible text,
  action_plan text,
  reference_code text,
  quantity integer,
  result_status text,
  notes text,
  sort_order integer,
  metadata jsonb,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz,
  updated_at timestamptz,
  file_id uuid,
  file_bucket text,
  file_storage_path text,
  file_name text,
  file_mime_type text,
  file_size_bytes bigint
)
language plpgsql
stable
security definer
set search_path=public
as $$
begin
  if auth.uid() is null then raise exception 'Sesión no válida'; end if;
  if p_period_mode not in ('week','month') then raise exception 'Tipo de periodo no válido'; end if;
  if not public.qpc_user_can_access_project(auth.uid(),p_project_id) then
    raise exception 'No tiene acceso al proyecto';
  end if;
  if not public.user_has_permission_for(auth.uid(),'reports.content.view') then
    raise exception 'No tiene permiso para consultar el contenido de informes';
  end if;

  return query
  select
    e.id,e.project_id,e.period_mode,e.period_value,e.section_code,
    e.title,e.description,e.location_text,e.responsible,e.action_plan,
    e.reference_code,e.quantity,e.result_status,e.notes,e.sort_order,e.metadata,
    e.created_by,e.updated_by,e.created_at,e.updated_at,
    f.id,f.bucket,f.storage_path,f.original_name,f.mime_type,f.size_bytes
  from public.qpc_report_entries e
  left join public.qpc_files f on f.id=e.file_id and f.deleted_at is null
  where e.project_id=p_project_id
    and e.period_mode=p_period_mode
    and e.period_value=p_period_value
    and e.is_active=true
    and e.archived_at is null
  order by e.section_code,e.sort_order,e.created_at,e.id;
end;
$$;

-- -----------------------------------------------------------------------------
-- 4. Alta y modificación atómica
-- El archivo físico se sube antes a Storage. Esta RPC registra sus metadatos,
-- enlaza el contenido y devuelve la ruta anterior que el cliente puede retirar.
-- -----------------------------------------------------------------------------
create or replace function public.qpc_upsert_report_entry(
  p_entry jsonb,
  p_file jsonb default null
)
returns table (
  entry_id uuid,
  remove_bucket text,
  remove_storage_path text
)
language plpgsql
security definer
set search_path=public
as $$
declare
  v_actor uuid:=auth.uid();
  v_id uuid;
  v_project text:=nullif(trim(p_entry->>'project_id'),'');
  v_mode text:=lower(nullif(trim(p_entry->>'period_mode'),''));
  v_period text:=nullif(trim(p_entry->>'period_value'),'');
  v_section text:=upper(nullif(trim(p_entry->>'section_code'),''));
  v_old public.qpc_report_entries%rowtype;
  v_file_id uuid;
  v_remove_bucket text;
  v_remove_path text;
begin
  if v_actor is null then raise exception 'Sesión no válida'; end if;
  if v_project is null then raise exception 'Proyecto obligatorio'; end if;
  if not public.qpc_user_can_access_project(v_actor,v_project) then
    raise exception 'No tiene acceso al proyecto';
  end if;
  if not public.user_has_permission_for(v_actor,'reports.content.manage') then
    raise exception 'No tiene permiso para gestionar contenido de informes';
  end if;
  if v_mode not in ('week','month') then raise exception 'Tipo de periodo no válido'; end if;
  if v_period is null then raise exception 'Periodo obligatorio'; end if;
  if v_section not in (
    'GOOD_PRACTICES','WORKSHOPS_TO_IMPROVE','NONCONFORMITIES','TRAININGS',
    'SPECIAL_ATTENTION','MATERIAL_TESTS','LESSONS_LEARNED','CONCLUSIONS',
    'RECOMMENDATIONS','MOTIVATIONAL_ACTION'
  ) then raise exception 'Sección de informe no válida'; end if;

  if nullif(p_entry->>'id','') is not null then
    select * into v_old
    from public.qpc_report_entries
    where id=(p_entry->>'id')::uuid
    for update;
    if not found then raise exception 'Registro no encontrado'; end if;
    if v_old.project_id<>v_project then raise exception 'El proyecto del registro no coincide'; end if;
    v_id:=v_old.id;
  end if;

  if p_file is not null and nullif(p_file->>'storage_path','') is not null then
    insert into public.qpc_files(
      project_id,bucket,storage_path,original_name,mime_type,size_bytes,uploaded_by
    ) values (
      v_project,
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

    if v_old.file_id is not null and v_old.file_id<>v_file_id then
      select bucket,storage_path into v_remove_bucket,v_remove_path
      from public.qpc_files where id=v_old.file_id;
      update public.qpc_files set deleted_at=now() where id=v_old.file_id;
    end if;
  else
    v_file_id:=v_old.file_id;
  end if;

  if v_id is null then
    insert into public.qpc_report_entries(
      project_id,period_mode,period_value,section_code,title,description,
      location_text,responsible,action_plan,reference_code,quantity,result_status,
      notes,file_id,sort_order,metadata,created_by,updated_by
    ) values (
      v_project,v_mode,v_period,v_section,
      coalesce(p_entry->>'title',''),coalesce(p_entry->>'description',''),
      coalesce(p_entry->>'location_text',''),coalesce(p_entry->>'responsible',''),
      coalesce(p_entry->>'action_plan',''),coalesce(p_entry->>'reference_code',''),
      nullif(p_entry->>'quantity','')::integer,coalesce(p_entry->>'result_status',''),
      coalesce(p_entry->>'notes',''),v_file_id,
      coalesce(nullif(p_entry->>'sort_order','')::integer,0),
      coalesce(p_entry->'metadata','{}'::jsonb),v_actor,v_actor
    ) returning id into v_id;
  else
    update public.qpc_report_entries set
      period_mode=v_mode,
      period_value=v_period,
      section_code=v_section,
      title=coalesce(p_entry->>'title',''),
      description=coalesce(p_entry->>'description',''),
      location_text=coalesce(p_entry->>'location_text',''),
      responsible=coalesce(p_entry->>'responsible',''),
      action_plan=coalesce(p_entry->>'action_plan',''),
      reference_code=coalesce(p_entry->>'reference_code',''),
      quantity=nullif(p_entry->>'quantity','')::integer,
      result_status=coalesce(p_entry->>'result_status',''),
      notes=coalesce(p_entry->>'notes',''),
      file_id=v_file_id,
      sort_order=coalesce(nullif(p_entry->>'sort_order','')::integer,0),
      metadata=coalesce(p_entry->'metadata','{}'::jsonb),
      updated_by=v_actor,
      is_active=true,
      archived_at=null
    where id=v_id;
  end if;

  insert into public.audit_logs(project_id,actor_id,action,entity_type,entity_id,previous_data,new_data)
  values(
    v_project,v_actor,
    case when v_old.id is null then 'report_content.created' else 'report_content.updated' end,
    'report_entry',v_id::text,
    case when v_old.id is null then null else to_jsonb(v_old) end,
    (select to_jsonb(e) from public.qpc_report_entries e where e.id=v_id)
  );

  return query select v_id,v_remove_bucket,v_remove_path;
end;
$$;

-- -----------------------------------------------------------------------------
-- 5. Archivo no destructivo
-- -----------------------------------------------------------------------------
create or replace function public.qpc_archive_report_entry(p_entry_id uuid)
returns table (
  remove_bucket text,
  remove_storage_path text
)
language plpgsql
security definer
set search_path=public
as $$
declare
  v_actor uuid:=auth.uid();
  v_entry public.qpc_report_entries%rowtype;
  v_bucket text;
  v_path text;
begin
  if v_actor is null then raise exception 'Sesión no válida'; end if;
  select * into v_entry from public.qpc_report_entries where id=p_entry_id for update;
  if not found then raise exception 'Registro no encontrado'; end if;
  if not public.qpc_user_can_access_project(v_actor,v_entry.project_id) then
    raise exception 'No tiene acceso al proyecto';
  end if;
  if not public.user_has_permission_for(v_actor,'reports.content.manage') then
    raise exception 'No tiene permiso para archivar contenido de informes';
  end if;

  if v_entry.file_id is not null then
    select bucket,storage_path into v_bucket,v_path from public.qpc_files where id=v_entry.file_id;
    update public.qpc_files set deleted_at=now() where id=v_entry.file_id;
  end if;

  update public.qpc_report_entries
  set is_active=false,archived_at=now(),updated_by=v_actor
  where id=p_entry_id;

  insert into public.audit_logs(project_id,actor_id,action,entity_type,entity_id,previous_data,new_data)
  values(v_entry.project_id,v_actor,'report_content.archived','report_entry',p_entry_id::text,to_jsonb(v_entry),jsonb_build_object('archived_at',now()));

  return query select v_bucket,v_path;
end;
$$;

-- -----------------------------------------------------------------------------
-- 6. Seguridad
-- -----------------------------------------------------------------------------
alter table public.qpc_report_entries enable row level security;

drop policy if exists qpc_report_entries_select on public.qpc_report_entries;
create policy qpc_report_entries_select
on public.qpc_report_entries for select to authenticated
using (
  is_active=true
  and archived_at is null
  and public.qpc_current_user_can_access_project(project_id)
  and public.current_user_has_permission('reports.content.view')
);

-- Las escrituras se realizan únicamente mediante RPC validadas.
revoke insert,update,delete on public.qpc_report_entries from anon,authenticated;
grant select on public.qpc_report_entries to authenticated;

revoke all on function public.qpc_report_entries_for_period(text,text,text) from public,anon;
revoke all on function public.qpc_upsert_report_entry(jsonb,jsonb) from public,anon;
revoke all on function public.qpc_archive_report_entry(uuid) from public,anon;
grant execute on function public.qpc_report_entries_for_period(text,text,text) to authenticated;
grant execute on function public.qpc_upsert_report_entry(jsonb,jsonb) to authenticated;
grant execute on function public.qpc_archive_report_entry(uuid) to authenticated;

-- Storage: ampliar edición/eliminación para evidencia de informes.
drop policy if exists qpc_phase4_update_assets on storage.objects;
create policy qpc_phase4_update_assets on storage.objects for update to authenticated using (
  bucket_id='qpc-attachments' and (
    (storage.foldername(name))[2]=auth.uid()::text
    or public.current_user_has_permission('instructives.edit')
    or public.current_user_has_permission('mappings.edit')
    or public.current_user_has_permission('equipment.edit')
    or public.current_user_has_permission('reports.content.manage')
  )
) with check (bucket_id='qpc-attachments');

drop policy if exists qpc_phase4_delete_assets on storage.objects;
create policy qpc_phase4_delete_assets on storage.objects for delete to authenticated using (
  bucket_id='qpc-attachments' and (
    (storage.foldername(name))[2]=auth.uid()::text
    or public.current_user_has_permission('instructives.delete')
    or public.current_user_has_permission('mappings.delete')
    or public.current_user_has_permission('equipment.delete')
    or public.current_user_has_permission('reports.content.manage')
  )
);

commit;

-- Verificación final.
select 'permisos_informes' as objeto,count(*)::bigint as registros
from public.permissions where code like 'reports.content.%'
union all
select 'contenido_informes',count(*) from public.qpc_report_entries;
