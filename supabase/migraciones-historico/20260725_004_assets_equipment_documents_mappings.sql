-- Quality Project Control MAIN V8.3 · Fase 4
-- Equipos, instructivos, mapeos, archivos y anotaciones relacionales.
-- Ejecutar después de V8.0, V8.1 y V8.2.
-- Idempotente y no destructivo: app_state queda como respaldo histórico.

begin;

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- 1. Registro universal de archivos
-- -----------------------------------------------------------------------------
create table if not exists public.qpc_files (
  id uuid primary key default gen_random_uuid(),
  project_id text references public.qpc_projects(id) on delete restrict,
  bucket text,
  storage_path text,
  external_url text,
  original_name text not null default 'archivo',
  mime_type text not null default 'application/octet-stream',
  size_bytes bigint,
  checksum text,
  uploaded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint qpc_files_location_check check (
    storage_path is not null or external_url is not null
  ),
  unique(bucket,storage_path)
);

create unique index if not exists qpc_files_external_url_uidx on public.qpc_files(external_url) where external_url is not null;
create index if not exists qpc_files_project_created_idx on public.qpc_files(project_id,created_at desc);
create index if not exists qpc_files_uploaded_by_idx on public.qpc_files(uploaded_by,created_at desc);
create index if not exists qpc_files_active_idx on public.qpc_files(project_id) where deleted_at is null;

-- -----------------------------------------------------------------------------
-- 2. Equipos y eventos de verificación/calibración
-- -----------------------------------------------------------------------------
create table if not exists public.qpc_equipment (
  id uuid primary key default gen_random_uuid(),
  legacy_id text,
  project_id text not null references public.qpc_projects(id) on delete restrict,
  equipment_code text not null,
  equipment_type text not null default '',
  description text not null default '',
  brand_model text not null default '',
  block_id uuid references public.qpc_project_blocks(id) on delete set null,
  level_id uuid references public.qpc_project_levels(id) on delete set null,
  area_id uuid references public.qpc_project_areas(id) on delete set null,
  location_text text not null default '',
  responsible text not null default '',
  frequency_days integer not null default 180 check (frequency_days > 0),
  calibration_required boolean not null default false,
  verification_required boolean not null default true,
  last_calibration_date date,
  last_verification_date date,
  observations text not null default '',
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id,equipment_code)
);

create table if not exists public.qpc_equipment_events (
  id uuid primary key default gen_random_uuid(),
  equipment_id uuid not null references public.qpc_equipment(id) on delete cascade,
  event_type text not null check (event_type in ('CALIBRATION','VERIFICATION','MAINTENANCE','IMPORT')),
  event_date date not null,
  performed_by uuid references public.profiles(id) on delete set null,
  notes text not null default '',
  file_id uuid references public.qpc_files(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists qpc_equipment_project_code_idx on public.qpc_equipment(project_id,equipment_code);
create index if not exists qpc_equipment_project_type_idx on public.qpc_equipment(project_id,equipment_type);
create index if not exists qpc_equipment_responsible_idx on public.qpc_equipment(project_id,responsible);
create index if not exists qpc_equipment_events_equipment_idx on public.qpc_equipment_events(equipment_id,event_date desc);

-- -----------------------------------------------------------------------------
-- 3. Instructivos y versiones
-- -----------------------------------------------------------------------------
create table if not exists public.qpc_instructives (
  id uuid primary key default gen_random_uuid(),
  legacy_id text,
  project_id text references public.qpc_projects(id) on delete restrict,
  project_scope text generated always as (coalesce(project_id,'GLOBAL')) stored,
  document_code text not null,
  title text not null,
  activity text not null default '',
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_scope,document_code)
);

create table if not exists public.qpc_instructive_versions (
  id uuid primary key default gen_random_uuid(),
  instructive_id uuid not null references public.qpc_instructives(id) on delete cascade,
  legacy_id text,
  version_number integer not null default 0 check (version_number >= 0),
  version_label text not null,
  lifecycle_status text not null default 'VIGENTE' check (lifecycle_status in ('VIGENTE','OBSOLETO')),
  file_id uuid references public.qpc_files(id) on delete set null,
  note text not null default '',
  source_snapshot jsonb,
  uploaded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  availability_status text generated always as (
    case when file_id is null then 'PENDIENTE_DE_CARGAR' else 'DISPONIBLE' end
  ) stored,
  unique(instructive_id,version_label)
);

create unique index if not exists qpc_one_current_instructive_version_idx
on public.qpc_instructive_versions(instructive_id)
where lifecycle_status='VIGENTE' and deleted_at is null;
create index if not exists qpc_instructives_project_title_idx on public.qpc_instructives(project_scope,title);
create index if not exists qpc_instructive_versions_sort_idx on public.qpc_instructive_versions(instructive_id,version_number desc);

-- -----------------------------------------------------------------------------
-- 4. Mapeos, versiones y trazos
-- -----------------------------------------------------------------------------
create table if not exists public.qpc_mappings (
  id uuid primary key default gen_random_uuid(),
  legacy_id text,
  project_id text not null references public.qpc_projects(id) on delete restrict,
  block_id uuid references public.qpc_project_blocks(id) on delete set null,
  level_id uuid references public.qpc_project_levels(id) on delete set null,
  area_id uuid references public.qpc_project_areas(id) on delete set null,
  block_code text not null default '',
  level_code text not null default '',
  area_name text not null default '',
  title text not null,
  base_code text not null,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.qpc_mapping_versions (
  id uuid primary key default gen_random_uuid(),
  mapping_id uuid not null references public.qpc_mappings(id) on delete cascade,
  legacy_id text,
  version_number integer not null default 1 check (version_number > 0),
  version_label text not null,
  lifecycle_status text not null default 'VIGENTE' check (lifecycle_status in ('VIGENTE','OBSOLETO')),
  file_id uuid references public.qpc_files(id) on delete set null,
  thumbnail_file_id uuid references public.qpc_files(id) on delete set null,
  source_snapshot jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique(mapping_id,version_label)
);

create table if not exists public.qpc_mapping_annotations (
  id uuid primary key default gen_random_uuid(),
  mapping_version_id uuid not null references public.qpc_mapping_versions(id) on delete cascade,
  inspection_id uuid references public.qpc_inspections(id) on delete cascade,
  visit_id uuid references public.qpc_inspection_visits(id) on delete cascade,
  strokes jsonb not null default '[]'::jsonb,
  preview_file_id uuid references public.qpc_files(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists qpc_one_current_mapping_version_idx
on public.qpc_mapping_versions(mapping_id)
where lifecycle_status='VIGENTE' and deleted_at is null;
create index if not exists qpc_mappings_project_location_idx on public.qpc_mappings(project_id,block_code,level_code,area_name);
create index if not exists qpc_mapping_versions_sort_idx on public.qpc_mapping_versions(mapping_id,version_number desc);
create index if not exists qpc_annotations_inspection_idx on public.qpc_mapping_annotations(inspection_id,created_at desc);

-- updated_at triggers
create or replace function public.qpc_touch_updated_at()
returns trigger language plpgsql set search_path=public as $$
begin new.updated_at=now(); return new; end; $$;

do $$
declare t text;
begin
  foreach t in array array[
    'qpc_equipment','qpc_instructives','qpc_instructive_versions',
    'qpc_mappings','qpc_mapping_versions','qpc_mapping_annotations'
  ] loop
    execute format('drop trigger if exists %I on public.%I','trg_'||t||'_updated_at',t);
    execute format('create trigger %I before update on public.%I for each row execute function public.qpc_touch_updated_at()','trg_'||t||'_updated_at',t);
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- 5. Semáforo de equipos calculado, nunca escrito manualmente
-- -----------------------------------------------------------------------------
create or replace function public.qpc_equipment_due_date(p_equipment public.qpc_equipment)
returns date
language sql stable set search_path=public as $$
  select case
    when p_equipment.calibration_required and p_equipment.verification_required then
      least(
        case when p_equipment.last_calibration_date is null then null else p_equipment.last_calibration_date + p_equipment.frequency_days end,
        case when p_equipment.last_verification_date is null then null else p_equipment.last_verification_date + p_equipment.frequency_days end
      )
    when p_equipment.calibration_required then
      case when p_equipment.last_calibration_date is null then null else p_equipment.last_calibration_date + p_equipment.frequency_days end
    when p_equipment.verification_required then
      case when p_equipment.last_verification_date is null then null else p_equipment.last_verification_date + p_equipment.frequency_days end
    else null
  end;
$$;

create or replace function public.qpc_equipment_status(p_equipment public.qpc_equipment)
returns text
language plpgsql stable set search_path=public as $$
declare v_due date;
begin
  v_due=public.qpc_equipment_due_date(p_equipment);
  if v_due is null then return 'SIN INFORMACIÓN'; end if;
  if v_due < current_date then return 'VENCIDO'; end if;
  if v_due <= current_date + 30 then return 'PRÓXIMO'; end if;
  return 'VIGENTE';
end;
$$;

-- -----------------------------------------------------------------------------
-- 6. Semillas documentales y de mapeos conocidas por la aplicación
-- -----------------------------------------------------------------------------
do $$
declare r record; v_doc uuid;
begin
  for r in select * from (values
    ('DOC-IT-CP-04','IT-CP-04','V08',8,'Colocación de Pisos','Colocación de Pisos','Archivo PDF pendiente de cargar al repositorio.'),
    ('DOC-IT-CP-05','IT-CP-05','V03',3,'Colocación de Bloques / Mampostería','Mampostería','Archivo PDF pendiente de cargar al repositorio.'),
    ('DOC-IT-CP-06','IT-CP-06','V06',6,'Control de Pañete','Pañete','Archivo PDF pendiente de cargar al repositorio.'),
    ('DOC-IT-CP-09','IT-CP-09','V05',5,'Aplicación de Pintura','Pintura','Archivo PDF pendiente de cargar al repositorio.'),
    ('DOC-IT-CP-15','IT-CP-15','V03',3,'Torta de Piso','Torta de Piso','Archivo PDF pendiente de cargar al repositorio.'),
    ('DOC-IT-CP-16','IT-CP-16','V06',6,'Drywall','Drywall - Muros','Archivo PDF pendiente de cargar al repositorio.'),
    ('DOC-IT-CP-17','IT-CP-17','V04',4,'Revestimiento Vertical','Revestimiento Vertical','Archivo PDF pendiente de cargar al repositorio.'),
    ('DOC-IT-CP-18','IT-CP-18','V04',4,'Derretido','Derretido','Archivo PDF pendiente de cargar al repositorio.'),
    ('DOC-IT-CP-12','IT-CP-12','Pendiente',0,'Impermeabilización','Impermeabilización','Confirmar versión vigente antes de publicación.'),
    ('DOC-EST-HOR','Referencia Estructural','Pendiente',0,'Hormigonado, Acero y Encofrado','Hormigonado','Vincular los instructivos estructurales vigentes.')
  ) as x(legacy_id,code,version_label,version_number,title,activity,note)
  loop
    insert into public.qpc_instructives(legacy_id,project_id,document_code,title,activity,is_active)
    values(r.legacy_id,null,r.code,r.title,r.activity,true)
    on conflict(project_scope,document_code) do update
      set title=excluded.title,activity=excluded.activity,is_active=true
    returning id into v_doc;

    insert into public.qpc_instructive_versions(instructive_id,legacy_id,version_number,version_label,lifecycle_status,note)
    values(v_doc,r.legacy_id,r.version_number,r.version_label,'VIGENTE',r.note)
    on conflict(instructive_id,version_label) do update set note=excluded.note;
  end loop;
end $$;

do $$
declare r record; v_file uuid; v_map uuid; v_project text;
begin
  v_project=case when exists(select 1 from public.qpc_projects where id='LCE') then 'LCE' else (select id from public.qpc_projects order by created_at limit 1) end;
  if v_project is null then return; end if;
  for r in select * from (values
    ('MAP-LCE-D1-N02-H2101','MAP-LLC-D1-N02','Mapeo Habitación 2101','D1','N02','Habitación 2101',1,'V01','assets/mapeos/map_d1_n02_h2101.svg'),
    ('MAP-LCE-D1-N02-H2102','MAP-LLC-D1-N02','Mapeo Habitación 2102','D1','N02','Habitación 2102',1,'V01','assets/mapeos/map_d1_n02_h2102.svg'),
    ('MAP-LCE-D1-N02-PASILLO','MAP-LLC-D1-N02','Mapeo Pasillo Nivel 02','D1','N02','Pasillo Nivel 02',2,'V02','assets/mapeos/map_d1_n02_pasillo.svg'),
    ('MAP-LCE-D2-N03-H3204','MAP-LLC-D2-N03','Mapeo Habitación 3204','D2','N03','Habitación 3204',1,'V01','assets/mapeos/map_d2_n03_h3204.svg'),
    ('MAP-LCE-EST-LOSA-A','MAP-LLC-EST-N02','Mapeo Losa Sector A','EST','N02','Losa Sector A · Ejes 3-6 / A-D',3,'V03','assets/mapeos/map_estructura_losa_a.svg')
  ) as x(legacy_id,base_code,title,block_code,level_code,area_name,version_number,version_label,external_url)
  loop
    insert into public.qpc_files(project_id,external_url,original_name,mime_type)
    values(v_project,r.external_url,split_part(r.external_url,'/',3),'image/svg+xml')
    on conflict do nothing;
    select id into v_file from public.qpc_files where external_url=r.external_url and deleted_at is null order by created_at limit 1;

    select id into v_map from public.qpc_mappings
    where project_id=v_project and legacy_id=r.legacy_id limit 1;
    if v_map is null then
      insert into public.qpc_mappings(legacy_id,project_id,block_code,level_code,area_name,title,base_code,is_active)
      values(r.legacy_id,v_project,r.block_code,r.level_code,r.area_name,r.title,r.base_code,true)
      returning id into v_map;
    end if;

    insert into public.qpc_mapping_versions(mapping_id,legacy_id,version_number,version_label,lifecycle_status,file_id)
    values(v_map,r.legacy_id,r.version_number,r.version_label,'VIGENTE',v_file)
    on conflict(mapping_id,version_label) do update set file_id=coalesce(public.qpc_mapping_versions.file_id,excluded.file_id);
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- 7. Migración no destructiva desde app_state
-- -----------------------------------------------------------------------------
do $$
declare v_payload jsonb; e jsonb; d jsonb; m jsonb; v_project text; v_file uuid; v_parent uuid; v_number integer;
begin
  select payload into v_payload from public.app_state where id='main';
  if v_payload is null then return; end if;

  -- Equipos
  for e in select value from jsonb_array_elements(coalesce(v_payload->'equipmentRecords','[]'::jsonb)) loop
    v_project=upper(coalesce(nullif(e->>'projectId',''),'LCE'));
    if not exists(select 1 from public.qpc_projects where id=v_project) then
      select id into v_project from public.qpc_projects order by created_at limit 1;
    end if;
    if v_project is null or coalesce(e->>'id','')='' then continue; end if;
    insert into public.qpc_equipment(
      legacy_id,project_id,equipment_code,equipment_type,description,brand_model,location_text,responsible,
      frequency_days,calibration_required,verification_required,last_calibration_date,last_verification_date,observations
    ) values(
      e->>'id',v_project,e->>'id',coalesce(e->>'type',''),coalesce(e->>'description',''),coalesce(e->>'brandModel',''),
      coalesce(e->>'location',''),coalesce(e->>'responsible',''),greatest(coalesce(nullif(e->>'frequencyDays','')::integer,180),1),
      nullif(e->>'calibrationDate','') is not null and e->>'calibrationDate'<>'N/A',true,
      case when e->>'calibrationDate' ~ '^\d{4}-\d{2}-\d{2}$' then (e->>'calibrationDate')::date else null end,
      case when e->>'verificationDate' ~ '^\d{4}-\d{2}-\d{2}$' then (e->>'verificationDate')::date else null end,
      case when upper(coalesce(e->>'observations','')) in ('VIGENTE','PRÓXIMO','PROXIMO','VENCIDO') then '' else coalesce(e->>'observations','') end
    ) on conflict(project_id,equipment_code) do update set
      equipment_type=excluded.equipment_type,description=excluded.description,brand_model=excluded.brand_model,
      location_text=excluded.location_text,responsible=excluded.responsible,frequency_days=excluded.frequency_days,
      calibration_required=excluded.calibration_required,verification_required=excluded.verification_required,
      last_calibration_date=excluded.last_calibration_date,last_verification_date=excluded.last_verification_date,
      observations=excluded.observations,updated_at=now();
  end loop;

  -- Instructivos personalizados
  for d in select value from jsonb_array_elements(coalesce(v_payload->'customDocuments','[]'::jsonb)) loop
    v_project=upper(coalesce(nullif(d->>'projectId',''),'LCE'));
    if not exists(select 1 from public.qpc_projects where id=v_project) then v_project=null; end if;
    v_file=null;
    if coalesce(d->>'storagePath','')<>'' then
      insert into public.qpc_files(project_id,bucket,storage_path,original_name,mime_type,size_bytes,uploaded_by)
      values(v_project,coalesce(nullif(d->>'bucket',''),'qpc-attachments'),d->>'storagePath',coalesce(d->>'fileName',d->>'title','archivo'),coalesce(d->>'fileType','application/octet-stream'),nullif(d->>'fileSize','')::bigint,public.qpc_profile_id_from_legacy(d->>'updatedBy'))
      on conflict(bucket,storage_path) do update set deleted_at=null
      returning id into v_file;
    elsif coalesce(d->>'file','')<>'' and left(d->>'file',5)<>'data:' then
      insert into public.qpc_files(project_id,external_url,original_name,mime_type)
      values(v_project,d->>'file',coalesce(d->>'fileName',d->>'title','archivo'),coalesce(d->>'fileType','application/octet-stream'))
      on conflict do nothing;
      select id into v_file from public.qpc_files where external_url=d->>'file' and deleted_at is null order by created_at limit 1;
    end if;

    insert into public.qpc_instructives(legacy_id,project_id,document_code,title,activity,is_active,created_by)
    values(d->>'id',v_project,coalesce(nullif(d->>'code',''),'SIN-CODIGO'),coalesce(nullif(d->>'title',''),'Sin título'),coalesce(d#>>'{activities,0}',d->>'activity',''),true,public.qpc_profile_id_from_legacy(d->>'updatedBy'))
    on conflict(project_scope,document_code) do update set title=excluded.title,activity=excluded.activity,is_active=true,updated_at=now()
    returning id into v_parent;
    v_number=coalesce(nullif(regexp_replace(coalesce(d->>'version',''),'[^0-9]','','g'),'')::integer,0);
    update public.qpc_instructive_versions set lifecycle_status='OBSOLETO' where instructive_id=v_parent and version_label<>coalesce(nullif(d->>'version',''),'Pendiente');
    insert into public.qpc_instructive_versions(instructive_id,legacy_id,version_number,version_label,lifecycle_status,file_id,note,source_snapshot,uploaded_by)
    values(v_parent,d->>'id',v_number,coalesce(nullif(d->>'version',''),'Pendiente'),'VIGENTE',v_file,coalesce(d->>'note',''),d,public.qpc_profile_id_from_legacy(d->>'updatedBy'))
    on conflict(instructive_id,version_label) do update set file_id=coalesce(excluded.file_id,public.qpc_instructive_versions.file_id),note=excluded.note,source_snapshot=excluded.source_snapshot,lifecycle_status='VIGENTE',updated_at=now();
  end loop;

  -- Mapeos personalizados
  for m in select value from jsonb_array_elements(coalesce(v_payload->'customMappings','[]'::jsonb)) loop
    v_project=upper(coalesce(nullif(m->>'projectId',''),'LCE'));
    if not exists(select 1 from public.qpc_projects where id=v_project) then
      select id into v_project from public.qpc_projects order by created_at limit 1;
    end if;
    if v_project is null then continue; end if;
    v_file=null;
    if coalesce(m->>'storagePath','')<>'' then
      insert into public.qpc_files(project_id,bucket,storage_path,original_name,mime_type,size_bytes,uploaded_by)
      values(v_project,coalesce(nullif(m->>'bucket',''),'qpc-attachments'),m->>'storagePath',coalesce(m->>'fileName',m->>'title','mapa'),coalesce(m->>'fileType','application/octet-stream'),nullif(m->>'fileSize','')::bigint,public.qpc_profile_id_from_legacy(m->>'uploadedBy'))
      on conflict(bucket,storage_path) do update set deleted_at=null
      returning id into v_file;
    elsif coalesce(m->>'file','')<>'' and left(m->>'file',5)<>'data:' then
      insert into public.qpc_files(project_id,external_url,original_name,mime_type)
      values(v_project,m->>'file',coalesce(m->>'fileName',m->>'title','mapa'),coalesce(m->>'fileType','image/svg+xml'))
      on conflict do nothing;
      select id into v_file from public.qpc_files where external_url=m->>'file' and deleted_at is null order by created_at limit 1;
    end if;

    select id into v_parent from public.qpc_mappings where legacy_id=m->>'id' limit 1;
    if v_parent is null then
      insert into public.qpc_mappings(legacy_id,project_id,block_code,level_code,area_name,title,base_code,is_active,created_by)
      values(m->>'id',v_project,coalesce(m->>'block',''),coalesce(m->>'level',''),coalesce(m->>'area',''),coalesce(m->>'title','Mapeo'),coalesce(m->>'code','MAP-'||v_project),true,public.qpc_profile_id_from_legacy(m->>'uploadedBy'))
      returning id into v_parent;
    end if;
    v_number=greatest(coalesce(nullif(regexp_replace(coalesce(m->>'version',''),'[^0-9]','','g'),'')::integer,1),1);
    update public.qpc_mapping_versions set lifecycle_status='OBSOLETO' where mapping_id=v_parent and version_label<>coalesce(nullif(m->>'version',''),'V01');
    insert into public.qpc_mapping_versions(mapping_id,legacy_id,version_number,version_label,lifecycle_status,file_id,source_snapshot,created_by)
    values(v_parent,m->>'id',v_number,coalesce(nullif(m->>'version',''),'V01'),'VIGENTE',v_file,m,public.qpc_profile_id_from_legacy(m->>'uploadedBy'))
    on conflict(mapping_id,version_label) do update set file_id=coalesce(excluded.file_id,public.qpc_mapping_versions.file_id),source_snapshot=excluded.source_snapshot,lifecycle_status='VIGENTE',updated_at=now();
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- 8. RLS: lectura por proyecto y permiso; escrituras mediante Edge Function
-- -----------------------------------------------------------------------------
alter table public.qpc_files enable row level security;
alter table public.qpc_equipment enable row level security;
alter table public.qpc_equipment_events enable row level security;
alter table public.qpc_instructives enable row level security;
alter table public.qpc_instructive_versions enable row level security;
alter table public.qpc_mappings enable row level security;
alter table public.qpc_mapping_versions enable row level security;
alter table public.qpc_mapping_annotations enable row level security;

drop policy if exists qpc_files_select on public.qpc_files;
create policy qpc_files_select on public.qpc_files for select to authenticated using (
  deleted_at is null and (project_id is null or public.qpc_current_user_can_access_project(project_id))
);

drop policy if exists qpc_equipment_select on public.qpc_equipment;
create policy qpc_equipment_select on public.qpc_equipment for select to authenticated using (
  public.qpc_current_user_can_access_project(project_id) and public.current_user_has_permission('equipment.view')
);

drop policy if exists qpc_equipment_events_select on public.qpc_equipment_events;
create policy qpc_equipment_events_select on public.qpc_equipment_events for select to authenticated using (
  exists(select 1 from public.qpc_equipment e where e.id=equipment_id and public.qpc_current_user_can_access_project(e.project_id) and public.current_user_has_permission('equipment.view'))
);

drop policy if exists qpc_instructives_select on public.qpc_instructives;
create policy qpc_instructives_select on public.qpc_instructives for select to authenticated using (
  is_active and (project_id is null or public.qpc_current_user_can_access_project(project_id)) and public.current_user_has_permission('instructives.view')
);

drop policy if exists qpc_instructive_versions_select on public.qpc_instructive_versions;
create policy qpc_instructive_versions_select on public.qpc_instructive_versions for select to authenticated using (
  deleted_at is null and exists(select 1 from public.qpc_instructives i where i.id=instructive_id and i.is_active and (i.project_id is null or public.qpc_current_user_can_access_project(i.project_id)) and public.current_user_has_permission('instructives.view'))
);

drop policy if exists qpc_mappings_select on public.qpc_mappings;
create policy qpc_mappings_select on public.qpc_mappings for select to authenticated using (
  is_active and public.qpc_current_user_can_access_project(project_id) and public.current_user_has_permission('mappings.view')
);

drop policy if exists qpc_mapping_versions_select on public.qpc_mapping_versions;
create policy qpc_mapping_versions_select on public.qpc_mapping_versions for select to authenticated using (
  deleted_at is null and exists(select 1 from public.qpc_mappings m where m.id=mapping_id and m.is_active and public.qpc_current_user_can_access_project(m.project_id) and public.current_user_has_permission('mappings.view'))
);

drop policy if exists qpc_mapping_annotations_select on public.qpc_mapping_annotations;
create policy qpc_mapping_annotations_select on public.qpc_mapping_annotations for select to authenticated using (
  exists(select 1 from public.qpc_mapping_versions v join public.qpc_mappings m on m.id=v.mapping_id where v.id=mapping_version_id and public.qpc_current_user_can_access_project(m.project_id) and public.current_user_has_permission('mappings.view'))
);

grant select on public.qpc_files,public.qpc_equipment,public.qpc_equipment_events,public.qpc_instructives,public.qpc_instructive_versions,public.qpc_mappings,public.qpc_mapping_versions,public.qpc_mapping_annotations to authenticated;
grant execute on function public.qpc_equipment_due_date(public.qpc_equipment),public.qpc_equipment_status(public.qpc_equipment) to authenticated;

-- Storage: se conserva el bucket privado existente y se amplían permisos por función.
update storage.buckets
set file_size_limit=52428800,
    allowed_mime_types=array[
      'image/jpeg','image/png','image/webp','image/gif','image/svg+xml',
      'application/pdf','text/plain','text/csv','application/json',
      'application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/octet-stream'
    ]
where id='qpc-attachments';

drop policy if exists qpc_phase4_upload_own on storage.objects;
create policy qpc_phase4_upload_own on storage.objects for insert to authenticated with check (
  bucket_id='qpc-attachments' and (storage.foldername(name))[2]=auth.uid()::text
);

drop policy if exists qpc_phase4_update_assets on storage.objects;
create policy qpc_phase4_update_assets on storage.objects for update to authenticated using (
  bucket_id='qpc-attachments' and (
    (storage.foldername(name))[2]=auth.uid()::text
    or public.current_user_has_permission('instructives.edit')
    or public.current_user_has_permission('mappings.edit')
    or public.current_user_has_permission('equipment.edit')
  )
) with check (bucket_id='qpc-attachments');

drop policy if exists qpc_phase4_delete_assets on storage.objects;
create policy qpc_phase4_delete_assets on storage.objects for delete to authenticated using (
  bucket_id='qpc-attachments' and (
    (storage.foldername(name))[2]=auth.uid()::text
    or public.current_user_has_permission('instructives.delete')
    or public.current_user_has_permission('mappings.delete')
    or public.current_user_has_permission('equipment.delete')
  )
);

commit;

-- Verificación final
select 'qpc_equipment' as tabla,count(*) as registros from public.qpc_equipment
union all select 'qpc_equipment_events',count(*) from public.qpc_equipment_events
union all select 'qpc_instructives',count(*) from public.qpc_instructives
union all select 'qpc_instructive_versions',count(*) from public.qpc_instructive_versions
union all select 'qpc_mappings',count(*) from public.qpc_mappings
union all select 'qpc_mapping_versions',count(*) from public.qpc_mapping_versions
union all select 'qpc_files',count(*) from public.qpc_files;
