-- Quality Project Control MAIN V9.0 · Fase 11
-- Recursos relacionales, anotaciones de mapeos, integridad y retiro progresivo de app_state.
-- Idempotente: puede ejecutarse más de una vez.

begin;

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- 1. Permisos de integridad y recursos
-- -----------------------------------------------------------------------------
alter table if exists public.permissions
  add column if not exists updated_at timestamptz not null default now();
alter table if exists public.role_permissions
  add column if not exists updated_at timestamptz not null default now();

insert into public.permissions(code,name,description,category,sort_order,updated_at)
values
  ('data.integrity.view','Ver integridad de datos','Consultar incidencias de migración y estado de normalización.','GENERAL',90,now()),
  ('data.integrity.manage','Gestionar integridad de datos','Resolver o descartar incidencias de migración.','GENERAL',91,now()),
  ('files.view','Ver archivos vinculados','Consultar archivos privados vinculados a entidades autorizadas.','GENERAL',92,now()),
  ('files.manage','Gestionar archivos vinculados','Vincular, archivar y retirar archivos privados.','GENERAL',93,now())
on conflict (code) do update set
  name=excluded.name,
  description=excluded.description,
  category=excluded.category,
  sort_order=excluded.sort_order,
  updated_at=now();

insert into public.role_permissions(role,permission_id,allowed,updated_at)
select r.role,p.id,true,now()
from (values
  ('CALIDAD','data.integrity.view'),
  ('COORDINADOR_CALIDAD','data.integrity.view'),
  ('COORDINADOR_CALIDAD','data.integrity.manage'),
  ('GERENCIA','data.integrity.view'),
  ('PRESIDENTE','data.integrity.view'),
  ('PRESIDENTE','data.integrity.manage'),
  ('CALIDAD','files.view'),
  ('CALIDAD','files.manage'),
  ('COORDINADOR_CALIDAD','files.view'),
  ('COORDINADOR_CALIDAD','files.manage'),
  ('GERENCIA','files.view'),
  ('PRESIDENTE','files.view')
) as r(role,code)
join public.permissions p on p.code=r.code
on conflict (role,permission_id) do update set allowed=excluded.allowed,updated_at=now();

-- IT continúa recibiendo todos los permisos por user_has_permission_for().

-- -----------------------------------------------------------------------------
-- 2. Acceso a proyectos reutilizable por RLS y RPC
-- -----------------------------------------------------------------------------
create or replace function public.qpc_user_has_project_access(
  p_user_id uuid,
  p_project_id text
)
returns boolean
language sql
stable
security definer
set search_path=public
as $$
  select exists(
    select 1
    from public.profiles p
    where p.id=p_user_id
      and p.is_active=true
      and (
        p.role in ('IT','PRESIDENTE')
        or exists(
          select 1 from public.project_members pm
          where pm.user_id=p_user_id
            and pm.project_id=p_project_id
            and pm.is_active=true
        )
      )
  );
$$;

-- -----------------------------------------------------------------------------
-- 3. Vínculos polimórficos de archivos
-- -----------------------------------------------------------------------------
create table if not exists public.qpc_file_links (
  id uuid primary key default gen_random_uuid(),
  project_id text not null references public.qpc_projects(id) on delete restrict,
  file_id uuid not null references public.qpc_files(id) on delete cascade,
  entity_type text not null check (entity_type in (
    'INSPECTION','VISIT','MAPPING_ANNOTATION','REPORT_ENTRY','EQUIPMENT','PROFILE','OTHER'
  )),
  entity_id uuid not null,
  file_role text not null default 'DOCUMENT' check (file_role in (
    'PHOTO','DOCUMENT','PLAN','EVIDENCE','MAPPING_ANNOTATION_PREVIEW','AVATAR','SOURCE','PREVIEW','OTHER'
  )),
  caption text not null default '',
  sort_order integer not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique(file_id,entity_type,entity_id,file_role)
);

create index if not exists qpc_file_links_entity_idx
  on public.qpc_file_links(entity_type,entity_id,sort_order)
  where deleted_at is null;
create index if not exists qpc_file_links_project_idx
  on public.qpc_file_links(project_id,created_at desc)
  where deleted_at is null;
create index if not exists qpc_file_links_file_idx
  on public.qpc_file_links(file_id)
  where deleted_at is null;

-- -----------------------------------------------------------------------------
-- 4. Incidencias de migración / integridad
-- -----------------------------------------------------------------------------
create table if not exists public.qpc_migration_issues (
  id uuid primary key default gen_random_uuid(),
  project_id text references public.qpc_projects(id) on delete set null,
  entity_type text not null,
  entity_id text,
  issue_code text not null,
  detail text not null default '',
  source_data jsonb,
  fingerprint text not null unique,
  status text not null default 'OPEN' check (status in ('OPEN','RESOLVED','IGNORED')),
  resolved_by uuid references public.profiles(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists qpc_migration_issues_status_idx
  on public.qpc_migration_issues(status,created_at desc);
create index if not exists qpc_migration_issues_project_idx
  on public.qpc_migration_issues(project_id,status,created_at desc);

-- -----------------------------------------------------------------------------
-- 5. Anotaciones: metadatos y unicidad por inspección/version
-- -----------------------------------------------------------------------------
alter table public.qpc_mapping_annotations
  add column if not exists title text not null default 'Mapeo marcado',
  add column if not exists opacity numeric(4,3) not null default 0.180,
  add column if not exists tool_version text not null default 'QPC-HIGHLIGHTER-V1',
  add column if not exists deleted_at timestamptz;

create unique index if not exists qpc_annotation_current_inspection_version_uidx
  on public.qpc_mapping_annotations(inspection_id,mapping_version_id)
  where inspection_id is not null and deleted_at is null;

-- -----------------------------------------------------------------------------
-- 6. Normalización de metadatos JSON de archivos
-- -----------------------------------------------------------------------------
create or replace function public.qpc_normalize_file_role(p_kind text,p_mime text)
returns text
language sql
immutable
set search_path=public
as $$
  select case
    when upper(coalesce(p_kind,'')) like '%FOTO%' or coalesce(p_mime,'') like 'image/%' then 'PHOTO'
    when upper(coalesce(p_kind,'')) like '%PLANO%' then 'PLAN'
    when upper(coalesce(p_kind,'')) like '%EVID%' then 'EVIDENCE'
    else 'DOCUMENT'
  end;
$$;

create or replace function public.qpc_register_file_metadata(
  p_project_id text,
  p_metadata jsonb,
  p_uploaded_by uuid
)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  v_bucket text;
  v_path text;
  v_url text;
  v_name text;
  v_type text;
  v_size bigint;
  v_id uuid;
begin
  v_bucket=coalesce(nullif(p_metadata->>'bucket',''),'qpc-attachments');
  v_path=coalesce(nullif(p_metadata->>'storagePath',''),nullif(p_metadata->>'storage_path',''));
  v_url=coalesce(nullif(p_metadata->>'externalUrl',''),nullif(p_metadata->>'external_url',''));
  v_name=coalesce(nullif(p_metadata->>'name',''),nullif(p_metadata->>'original_name',''),'archivo');
  v_type=coalesce(nullif(p_metadata->>'type',''),nullif(p_metadata->>'mime_type',''),'application/octet-stream');
  begin v_size=nullif(coalesce(p_metadata->>'size',p_metadata->>'size_bytes'),'')::bigint; exception when others then v_size=null; end;

  if v_path is null and v_url is null then return null; end if;
  if v_path is null and v_url is not null then
    select id into v_id from public.qpc_files where external_url=v_url limit 1;
    if v_id is not null then return v_id; end if;
  end if;

  insert into public.qpc_files(project_id,bucket,storage_path,external_url,original_name,mime_type,size_bytes,uploaded_by)
  values(p_project_id,v_bucket,v_path,v_url,v_name,v_type,v_size,p_uploaded_by)
  on conflict (bucket,storage_path) do update set
    project_id=coalesce(public.qpc_files.project_id,excluded.project_id),
    original_name=excluded.original_name,
    mime_type=excluded.mime_type,
    size_bytes=coalesce(excluded.size_bytes,public.qpc_files.size_bytes),
    deleted_at=null
  returning id into v_id;

  if v_id is null and v_url is not null then
    select id into v_id from public.qpc_files where external_url=v_url limit 1;
  end if;
  return v_id;
end;
$$;

create or replace function public.qpc_find_mapping_version(p_mapping_reference text)
returns uuid
language sql
stable
security definer
set search_path=public
as $$
  select mv.id
  from public.qpc_mapping_versions mv
  join public.qpc_mappings m on m.id=mv.mapping_id
  where mv.deleted_at is null
    and (
      mv.id::text=p_mapping_reference
      or mv.legacy_id=p_mapping_reference
      or m.legacy_id=p_mapping_reference
      or m.base_code=p_mapping_reference
    )
  order by (mv.lifecycle_status='VIGENTE') desc,mv.version_number desc
  limit 1;
$$;

create or replace function public.qpc_sync_inspection_resources(p_inspection_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_ins public.qpc_inspections%rowtype;
  v_item jsonb;
  v_file uuid;
  v_index integer:=0;
  v_annotation jsonb;
  v_mapping_version uuid;
  v_annotation_id uuid;
  v_linked integer:=0;
begin
  select * into v_ins from public.qpc_inspections where id=p_inspection_id;
  if not found then return jsonb_build_object('ok',false,'message','Inspección no encontrada'); end if;

  for v_item in select value from jsonb_array_elements(coalesce(v_ins.attachments,'[]'::jsonb)) loop
    v_index=v_index+1;
    v_file=public.qpc_register_file_metadata(v_ins.project_id,v_item,v_ins.requested_by);
    if v_file is not null then
      insert into public.qpc_file_links(project_id,file_id,entity_type,entity_id,file_role,caption,sort_order,created_by)
      values(
        v_ins.project_id,v_file,'INSPECTION',v_ins.id,
        public.qpc_normalize_file_role(v_item->>'kind',coalesce(v_item->>'type',v_item->>'mime_type')),
        coalesce(v_item->>'kind','Adjunto'),v_index,v_ins.requested_by
      )
      on conflict (file_id,entity_type,entity_id,file_role) do update set
        caption=excluded.caption,sort_order=excluded.sort_order,deleted_at=null;
      v_linked=v_linked+1;
    elsif coalesce(v_item->>'dataUrl',v_item->>'data_url','')<>'' then
      insert into public.qpc_migration_issues(project_id,entity_type,entity_id,issue_code,detail,source_data,fingerprint)
      values(v_ins.project_id,'INSPECTION',v_ins.id::text,'LEGACY_BASE64_ATTACHMENT','Adjunto Base64 histórico pendiente de carga a Storage.',v_item,encode(digest(v_ins.id::text||':attachment:'||v_index,'sha256'),'hex'))
      on conflict (fingerprint) do nothing;
    end if;
  end loop;

  v_annotation=v_ins.mapping_annotation;
  if v_annotation is not null then
    if jsonb_typeof(v_annotation)='object' then
      v_file=public.qpc_register_file_metadata(v_ins.project_id,v_annotation,v_ins.requested_by);
      v_mapping_version=coalesce(
        case when coalesce(v_annotation->>'mappingVersionId','') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then (v_annotation->>'mappingVersionId')::uuid else null end,
        public.qpc_find_mapping_version(v_ins.mapping_id)
      );
      if v_file is not null and v_mapping_version is not null then
        insert into public.qpc_mapping_annotations(mapping_version_id,inspection_id,strokes,preview_file_id,created_by,title,opacity,tool_version,deleted_at)
        values(
          v_mapping_version,v_ins.id,coalesce(v_annotation->'strokes','[]'::jsonb),v_file,v_ins.requested_by,
          coalesce(nullif(v_annotation->>'title',''),'Mapeo marcado'),
          coalesce(nullif(v_annotation->>'opacity','')::numeric,0.180),
          coalesce(nullif(v_annotation->>'toolVersion',''),'QPC-HIGHLIGHTER-V2'),null
        )
        on conflict (inspection_id,mapping_version_id) where inspection_id is not null and deleted_at is null
        do update set strokes=excluded.strokes,preview_file_id=excluded.preview_file_id,title=excluded.title,opacity=excluded.opacity,tool_version=excluded.tool_version,updated_at=now()
        returning id into v_annotation_id;

        insert into public.qpc_file_links(project_id,file_id,entity_type,entity_id,file_role,caption,created_by)
        values(v_ins.project_id,v_file,'MAPPING_ANNOTATION',v_annotation_id,'MAPPING_ANNOTATION_PREVIEW','Mapeo marcado',v_ins.requested_by)
        on conflict (file_id,entity_type,entity_id,file_role) do update set deleted_at=null;
      end if;
    elsif jsonb_typeof(v_annotation)='string' and trim(both '"' from v_annotation::text) like 'data:image/%' then
      insert into public.qpc_migration_issues(project_id,entity_type,entity_id,issue_code,detail,source_data,fingerprint)
      values(v_ins.project_id,'INSPECTION',v_ins.id::text,'LEGACY_BASE64_MAPPING_ANNOTATION','Mapeo marcado histórico en Base64 pendiente de migración.',jsonb_build_object('length',length(v_annotation::text)),encode(digest(v_ins.id::text||':mapping-annotation','sha256'),'hex'))
      on conflict (fingerprint) do nothing;
    end if;
  end if;

  return jsonb_build_object('ok',true,'linked',v_linked,'annotation_id',v_annotation_id);
end;
$$;

-- Sincronización automática para nuevas solicitudes o actualizaciones de recursos.
create or replace function public.qpc_trigger_sync_inspection_resources()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  perform public.qpc_sync_inspection_resources(new.id);
  return new;
end;
$$;

drop trigger if exists trg_qpc_sync_inspection_resources on public.qpc_inspections;
create trigger trg_qpc_sync_inspection_resources
after insert or update of attachments,mapping_annotation on public.qpc_inspections
for each row execute function public.qpc_trigger_sync_inspection_resources();

-- Migra de forma idempotente todos los registros existentes.
do $$
declare r record;
begin
  for r in select id from public.qpc_inspections loop
    perform public.qpc_sync_inspection_resources(r.id);
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- 7. Vistas de recursos normalizados
-- -----------------------------------------------------------------------------
drop view if exists public.qpc_inspection_resource_files;
create view public.qpc_inspection_resource_files
with (security_invoker=true)
as
select
  fl.id as link_id,
  fl.project_id,
  fl.entity_id as inspection_id,
  fl.file_role,
  fl.caption,
  fl.sort_order,
  f.id as file_id,
  f.bucket,
  f.storage_path,
  f.external_url,
  f.original_name,
  f.mime_type,
  f.size_bytes,
  f.created_at
from public.qpc_file_links fl
join public.qpc_files f on f.id=fl.file_id
where fl.entity_type='INSPECTION'
  and fl.deleted_at is null
  and f.deleted_at is null;

drop view if exists public.qpc_inspection_mapping_annotations;
create view public.qpc_inspection_mapping_annotations
with (security_invoker=true)
as
select
  a.id,
  a.inspection_id,
  a.visit_id,
  a.mapping_version_id,
  a.title,
  a.strokes,
  a.opacity,
  a.tool_version,
  a.updated_at,
  f.id as file_id,
  f.bucket,
  f.storage_path,
  f.external_url,
  f.original_name,
  f.mime_type,
  f.size_bytes
from public.qpc_mapping_annotations a
left join public.qpc_files f on f.id=a.preview_file_id and f.deleted_at is null
where a.deleted_at is null;

drop view if exists public.qpc_data_integrity_summary;
create view public.qpc_data_integrity_summary
with (security_invoker=true)
as
select
  (select count(*) from public.qpc_inspections) as inspections,
  (select count(*) from public.qpc_file_links where deleted_at is null and entity_type='INSPECTION') as normalized_inspection_files,
  (select count(*) from public.qpc_mapping_annotations where deleted_at is null) as mapping_annotations,
  (select count(*) from public.qpc_migration_issues where status='OPEN') as open_migration_issues,
  (select count(*) from public.qpc_files where deleted_at is null) as active_files,
  now() as checked_at;

-- -----------------------------------------------------------------------------
-- 8. RPC para resolver incidencias
-- -----------------------------------------------------------------------------
create or replace function public.qpc_set_migration_issue_status(
  p_issue_id uuid,
  p_status text
)
returns public.qpc_migration_issues
language plpgsql
security definer
set search_path=public
as $$
declare v_row public.qpc_migration_issues%rowtype;
begin
  if p_status not in ('RESOLVED','IGNORED','OPEN') then raise exception 'Estado inválido'; end if;
  if not public.user_has_permission_for(auth.uid(),'data.integrity.manage') then raise exception 'No tiene permiso para gestionar integridad'; end if;
  update public.qpc_migration_issues
  set status=p_status,
      resolved_by=case when p_status='OPEN' then null else auth.uid() end,
      resolved_at=case when p_status='OPEN' then null else now() end
  where id=p_issue_id
  returning * into v_row;
  if not found then raise exception 'Incidencia no encontrada'; end if;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,new_data,created_at)
  values(auth.uid(),'MIGRATION_ISSUE_STATUS_CHANGED','qpc_migration_issues',p_issue_id,jsonb_build_object('status',p_status),now());
  return v_row;
end;
$$;

-- -----------------------------------------------------------------------------
-- 9. RLS
-- -----------------------------------------------------------------------------
alter table public.qpc_file_links enable row level security;
alter table public.qpc_migration_issues enable row level security;

revoke all on public.qpc_file_links from anon;
revoke all on public.qpc_migration_issues from anon;
grant select on public.qpc_file_links,public.qpc_migration_issues to authenticated;
grant select on public.qpc_inspection_resource_files,public.qpc_inspection_mapping_annotations,public.qpc_data_integrity_summary to authenticated;
grant execute on function public.qpc_set_migration_issue_status(uuid,text) to authenticated;

-- file links
 drop policy if exists qpc_file_links_select on public.qpc_file_links;
create policy qpc_file_links_select on public.qpc_file_links
for select to authenticated
using (
  public.qpc_user_has_project_access(auth.uid(),project_id)
  and (
    public.user_has_permission_for(auth.uid(),'files.view')
    or public.user_has_permission_for(auth.uid(),'inspections.attachments.view')
  )
);

drop policy if exists qpc_file_links_insert on public.qpc_file_links;
create policy qpc_file_links_insert on public.qpc_file_links
for insert to authenticated
with check (
  created_by=auth.uid()
  and public.qpc_user_has_project_access(auth.uid(),project_id)
  and (
    public.user_has_permission_for(auth.uid(),'files.manage')
    or public.user_has_permission_for(auth.uid(),'inspections.attachments.upload')
  )
);

drop policy if exists qpc_file_links_update on public.qpc_file_links;
create policy qpc_file_links_update on public.qpc_file_links
for update to authenticated
using (
  public.qpc_user_has_project_access(auth.uid(),project_id)
  and public.user_has_permission_for(auth.uid(),'files.manage')
)
with check (
  public.qpc_user_has_project_access(auth.uid(),project_id)
  and public.user_has_permission_for(auth.uid(),'files.manage')
);

-- migration issues
 drop policy if exists qpc_migration_issues_select on public.qpc_migration_issues;
create policy qpc_migration_issues_select on public.qpc_migration_issues
for select to authenticated
using (
  public.user_has_permission_for(auth.uid(),'data.integrity.view')
  and (project_id is null or public.qpc_user_has_project_access(auth.uid(),project_id))
);

-- -----------------------------------------------------------------------------
-- 10. app_state queda solo como respaldo histórico
-- -----------------------------------------------------------------------------
comment on table public.app_state is
'RESPALDO HISTÓRICO. Desde V9.0 los módulos de usuarios, proyectos, inspecciones, visitas, equipos, instructivos, mapeos, archivos y contenido de informes usan tablas relacionales. No agregar nuevas funciones operativas a este JSON.';

commit;

-- Verificación final
select * from public.qpc_data_integrity_summary;
select issue_code,status,count(*) as cantidad
from public.qpc_migration_issues
group by issue_code,status
order by status,issue_code;
