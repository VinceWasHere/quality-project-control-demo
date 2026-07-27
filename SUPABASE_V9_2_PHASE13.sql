-- Quality Project Control MAIN V9.2 · Fase 13
-- Mejora de reportes y contenido: requisitos de secciones, preparación del informe
-- y soporte documental para evidencias múltiples futuras.

begin;

alter table public.permissions add column if not exists updated_at timestamptz not null default now();
alter table public.role_permissions add column if not exists updated_at timestamptz not null default now();

insert into public.permissions(code,name,description,category,sort_order,updated_at)
values
  ('reports.content.prepare','Preparar informes corporativos','Consultar estado de preparación por sección y validar contenido manual del informe.','INFORMES',30,now()),
  ('reports.content.evidence.manage','Gestionar evidencias de informe','Agregar o retirar evidencias vinculadas a registros de contenido de informes.','INFORMES',40,now())
on conflict(code) do update set
  name=excluded.name,
  description=excluded.description,
  category=excluded.category,
  sort_order=excluded.sort_order,
  updated_at=now();

insert into public.role_permissions(role,permission_id,allowed,updated_at)
select r.role,p.id,true,now()
from (values('CALIDAD'),('COORDINADOR_CALIDAD'),('IT')) as r(role)
cross join public.permissions p
where p.code in ('reports.content.prepare','reports.content.evidence.manage')
on conflict(role,permission_id) do update set allowed=excluded.allowed,updated_at=now();

insert into public.role_permissions(role,permission_id,allowed,updated_at)
select r.role,p.id,true,now()
from (values('GERENCIA'),('PRESIDENTE')) as r(role)
cross join public.permissions p
where p.code='reports.content.prepare'
on conflict(role,permission_id) do update set allowed=excluded.allowed,updated_at=now();

-- Catálogo de requisitos por formato y sección.
create table if not exists public.qpc_report_section_requirements(
  report_mode text not null check(report_mode in ('week','month')),
  section_code text not null,
  section_label text not null,
  requires_manual_content boolean not null default true,
  requires_evidence boolean not null default false,
  sort_order integer not null default 0,
  helper text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(report_mode,section_code)
);

drop trigger if exists trg_qpc_report_section_requirements_updated_at on public.qpc_report_section_requirements;
create trigger trg_qpc_report_section_requirements_updated_at
before update on public.qpc_report_section_requirements
for each row execute function public.qpc_touch_updated_at();

insert into public.qpc_report_section_requirements(report_mode,section_code,section_label,requires_manual_content,requires_evidence,sort_order,helper)
values
 ('week','GOOD_PRACTICES','Buenas prácticas',true,true,10,'Fotografía, descripción, ubicación y responsable.'),
 ('week','WORKSHOPS_TO_IMPROVE','Talleres a mejorar por meta incumplida',true,true,20,'Criterio incumplido, ubicación, plan de acción y responsable.'),
 ('week','NONCONFORMITIES','NC’s del proyecto',false,true,30,'Número o referencia de NC, descripción y estatus.'),
 ('week','TRAININGS','Capacitaciones realizadas',false,true,40,'Cantidad, tema y ubicación.'),
 ('week','SPECIAL_ATTENTION','Actividades de atención especial',true,true,50,'Texto y/o evidencia de actividades de atención especial.'),
 ('week','CONCLUSIONS','Conclusiones',true,false,60,'Conclusiones del periodo semanal.'),
 ('week','RECOMMENDATIONS','Recomendaciones',true,false,70,'Recomendaciones accionables del periodo.'),
 ('month','GOOD_PRACTICES','Buenas prácticas',true,true,10,'Fotografía, descripción, ubicación y responsable.'),
 ('month','WORKSHOPS_TO_IMPROVE','Talleres a mejorar por meta incumplida',true,true,20,'Criterio incumplido, ubicación, plan de acción y responsable.'),
 ('month','NONCONFORMITIES','NC’s del proyecto',false,true,30,'Número o referencia de NC, descripción y estatus.'),
 ('month','MATERIAL_TESTS','Pruebas a materiales',false,true,40,'Probeta, ensayo, ubicación y resultado.'),
 ('month','TRAININGS','Capacitaciones realizadas',false,true,50,'Cantidad, tema y ubicación.'),
 ('month','SPECIAL_ATTENTION','Actividades de atención especial',true,true,60,'Texto y/o evidencia de actividades de atención especial.'),
 ('month','LESSONS_LEARNED','Lecciones aprendidas',false,false,70,'Aprendizajes del periodo.'),
 ('month','RECOMMENDATIONS','Observaciones y recomendaciones',true,false,80,'Observaciones y recomendaciones del periodo.'),
 ('month','MOTIVATIONAL_ACTION','Acción motivacional',false,false,90,'Frase o actividad motivacional.')
on conflict(report_mode,section_code) do update set
  section_label=excluded.section_label,
  requires_manual_content=excluded.requires_manual_content,
  requires_evidence=excluded.requires_evidence,
  sort_order=excluded.sort_order,
  helper=excluded.helper,
  updated_at=now();

-- Soporte futuro para más de una evidencia por registro de informe.
create table if not exists public.qpc_report_entry_files(
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.qpc_report_entries(id) on delete cascade,
  file_id uuid not null references public.qpc_files(id) on delete cascade,
  caption text not null default '',
  sort_order integer not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  unique(entry_id,file_id)
);

create index if not exists qpc_report_entry_files_entry_idx on public.qpc_report_entry_files(entry_id,sort_order) where archived_at is null;

alter table public.qpc_report_section_requirements enable row level security;
alter table public.qpc_report_entry_files enable row level security;

drop policy if exists qpc_report_section_requirements_select on public.qpc_report_section_requirements;
create policy qpc_report_section_requirements_select on public.qpc_report_section_requirements
for select to authenticated using (public.user_has_permission_for(auth.uid(),'reports.content.view'));

drop policy if exists qpc_report_entry_files_select on public.qpc_report_entry_files;
create policy qpc_report_entry_files_select on public.qpc_report_entry_files
for select to authenticated using (
  exists(
    select 1 from public.qpc_report_entries e
    where e.id=qpc_report_entry_files.entry_id
      and public.qpc_user_can_access_project(auth.uid(),e.project_id)
      and public.user_has_permission_for(auth.uid(),'reports.content.view')
  )
);

-- Vista de estado de preparación por sección.
create or replace view public.qpc_report_content_status as
select
  r.report_mode,
  r.section_code,
  r.section_label,
  r.requires_manual_content,
  r.requires_evidence,
  r.sort_order,
  e.project_id,
  e.period_value,
  count(e.id) filter(where e.archived_at is null and e.is_active) as entries_count,
  count(e.id) filter(where e.archived_at is null and e.is_active and e.file_id is not null) as evidence_count
from public.qpc_report_section_requirements r
left join public.qpc_report_entries e
  on e.period_mode=r.report_mode and e.section_code=r.section_code
group by r.report_mode,r.section_code,r.section_label,r.requires_manual_content,r.requires_evidence,r.sort_order,e.project_id,e.period_value;

commit;
