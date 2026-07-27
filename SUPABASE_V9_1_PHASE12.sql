-- Quality Project Control MAIN V9.1 — Fase 12 (corregido V2)
-- Compatible con el esquema real creado en las fases anteriores.
-- Corrige:
--   1) role_permissions usa permission_id, no permission_code.
--   2) El rol interno del Gerente de Calidad es COORDINADOR_CALIDAD.
--   3) qpc_visit_deductions usa las columnas reales de qpc_visit_answers.
--   4) No marca como resueltas incidencias legacy cuya fuente Base64 ya no está disponible.

begin;

-- -----------------------------------------------------------------------------
-- 1. Compatibilidad de columnas de auditoría
-- -----------------------------------------------------------------------------
alter table public.permissions
  add column if not exists updated_at timestamptz not null default now();

alter table public.role_permissions
  add column if not exists updated_at timestamptz not null default now();

-- -----------------------------------------------------------------------------
-- 2. Permiso para gestionar incidencias de integridad
-- -----------------------------------------------------------------------------
insert into public.permissions(
  code,
  name,
  description,
  category,
  sort_order,
  created_at,
  updated_at
)
values (
  'integrity.resolve',
  'Resolver incidencias de integridad',
  'Permite resolver, reabrir o ignorar incidencias de migración.',
  'GENERAL',
  94,
  now(),
  now()
)
on conflict (code) do update
set name = excluded.name,
    description = excluded.description,
    category = excluded.category,
    sort_order = excluded.sort_order,
    updated_at = now();

-- role_permissions referencia permissions.id mediante permission_id.
insert into public.role_permissions(role, permission_id, allowed, updated_at)
select r.role, p.id, true, now()
from (
  values
    ('IT'),
    ('COORDINADOR_CALIDAD')
) as r(role)
cross join public.permissions p
where p.code = 'integrity.resolve'
on conflict (role, permission_id) do update
set allowed = excluded.allowed,
    updated_at = now();

-- IT conserva todos los permisos presentes en el catálogo.
insert into public.role_permissions(role, permission_id, allowed, updated_at)
select 'IT', p.id, true, now()
from public.permissions p
on conflict (role, permission_id) do update
set allowed = true,
    updated_at = now();

-- -----------------------------------------------------------------------------
-- 3. Metadatos opcionales para incidencias y anotaciones legacy
-- -----------------------------------------------------------------------------
alter table if exists public.qpc_mapping_annotations
  add column if not exists legacy_source jsonb,
  add column if not exists migrated_from_issue_id uuid;

alter table if exists public.qpc_migration_issues
  add column if not exists resolution_note text not null default '',
  add column if not exists updated_at timestamptz not null default now();

-- -----------------------------------------------------------------------------
-- 4. Vista real de puntos descontados por visita
-- -----------------------------------------------------------------------------
-- Se elimina primero para permitir cambios seguros en nombres/orden de columnas.
drop view if exists public.qpc_visit_deductions;

create view public.qpc_visit_deductions
with (security_invoker = true)
as
select
  a.visit_id,
  v.inspection_id,
  a.criterion_id,
  a.criterion_id as criterion_code,
  coalesce(c.name, a.criterion_name, 'Criterio') as criterion_name,
  coalesce(a.criterion_stage, v.stage, 'General') as stage_name,
  a.is_visit_criterion,
  a.selected_label as response_label,
  a.weight as criterion_weight,
  a.points_earned,
  coalesce(
    a.points_lost,
    greatest(coalesce(a.weight, 0) - coalesce(a.points_earned, 0), 0)
  ) as points_lost,
  a.observation as comment,
  a.sort_order
from public.qpc_visit_answers a
join public.qpc_inspection_visits v
  on v.id = a.visit_id
left join public.qpc_template_criteria c
  on c.template_id = v.template_id
 and c.criterion_id = a.criterion_id
where coalesce(a.is_na, false) = false
  and coalesce(
        a.points_lost,
        greatest(coalesce(a.weight, 0) - coalesce(a.points_earned, 0), 0)
      ) > 0;

comment on view public.qpc_visit_deductions is
  'Criterios donde se descontaron puntos, con visita, inspección, respuesta, peso, puntos perdidos y observación.';

grant select on public.qpc_visit_deductions to authenticated;

-- -----------------------------------------------------------------------------
-- 5. Incidencias legacy de mapeos
-- -----------------------------------------------------------------------------
-- Las incidencias creadas en V9.0 solo conservaron la longitud del Base64, no el
-- contenido original. Por integridad, este script NO inventa trazos ni las marca
-- automáticamente como resueltas. Se añade una nota explicativa a las abiertas.
update public.qpc_migration_issues
set resolution_note = case
      when coalesce(resolution_note, '') = '' then
        'No puede reconstruirse automáticamente: el registro conserva la longitud, pero no el contenido Base64 original. Revise el mapeo y vuelva a guardar la anotación si aún está visible en el respaldo histórico.'
      else resolution_note
    end,
    updated_at = now()
where issue_code = 'LEGACY_BASE64_MAPPING_ANNOTATION'
  and status = 'OPEN';

commit;

-- -----------------------------------------------------------------------------
-- 6. Verificación final
-- -----------------------------------------------------------------------------
select
  p.code,
  rp.role,
  rp.allowed
from public.permissions p
join public.role_permissions rp on rp.permission_id = p.id
where p.code = 'integrity.resolve'
order by rp.role;

select count(*) as puntos_descontados_registrados
from public.qpc_visit_deductions;

select
  status,
  count(*) as incidencias_legacy_mapeos
from public.qpc_migration_issues
where issue_code = 'LEGACY_BASE64_MAPPING_ANNOTATION'
group by status
order by status;
