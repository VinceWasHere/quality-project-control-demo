-- Quality Project Control MAIN V8.4 · Fase 5
-- Calificaciones, puntos débiles, reportes y exportaciones relacionales.
-- Ejecutar después de V8.0, V8.1, V8.2 y V8.3.
-- Idempotente y no destructiva.

begin;

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- 1. Bitácora de exportaciones
-- -----------------------------------------------------------------------------
create table if not exists public.qpc_export_runs (
  id uuid primary key default gen_random_uuid(),
  project_id text references public.qpc_projects(id) on delete set null,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  report_kind text not null,
  export_format text not null,
  period_mode text not null,
  period_value text not null,
  filters jsonb not null default '{}'::jsonb,
  row_count integer not null default 0,
  file_id uuid references public.qpc_files(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint qpc_export_runs_format_check check (export_format in ('CSV','PDF')),
  constraint qpc_export_runs_period_check check (period_mode in ('week','month'))
);

create index if not exists qpc_export_runs_project_created_idx
  on public.qpc_export_runs(project_id,created_at desc);
create index if not exists qpc_export_runs_actor_created_idx
  on public.qpc_export_runs(actor_id,created_at desc);

-- -----------------------------------------------------------------------------
-- 2. Vistas relacionales de reporting.
-- SECURITY INVOKER hace que las vistas respeten el RLS de las tablas base.
-- -----------------------------------------------------------------------------
create or replace view public.qpc_reporting_inspections
with (security_invoker=true)
as
select
  i.id as inspection_id,
  i.request_code,
  i.closure_code,
  i.project_id,
  pr.name as project_name,
  pr.short_code as project_short_code,
  i.template_id,
  i.activity,
  i.stage,
  i.location_text,
  i.requested_date,
  i.requested_time,
  i.status,
  i.objective,
  i.current_technical_score as technical_score,
  i.current_preparation_score as preparation_score,
  i.current_final_score as final_score,
  i.latest_decision,
  i.requested_by,
  exec.full_name as execution_name,
  exec.email as execution_email,
  exec.execution_area,
  i.assigned_quality_id,
  assigned.full_name as assigned_quality_name,
  i.closed_by,
  closer.full_name as closed_by_name,
  i.closed_at,
  coalesce(vs.visit_count,0)::integer as visit_count,
  vs.first_visit_decision,
  coalesce(vs.first_visit_decision='Liberada',false) as first_visit_released,
  vs.last_finished_at,
  coalesce(i.closed_at,vs.last_finished_at,i.updated_at) as completed_at,
  coalesce(i.closed_at,vs.last_finished_at,i.updated_at)::date as completed_date
from public.qpc_inspections i
join public.qpc_projects pr on pr.id=i.project_id
join public.profiles exec on exec.id=i.requested_by
left join public.profiles assigned on assigned.id=i.assigned_quality_id
left join public.profiles closer on closer.id=i.closed_by
left join lateral (
  select
    count(*) filter (where v.status='FINALIZADA') as visit_count,
    max(v.finished_at) filter (where v.status='FINALIZADA') as last_finished_at,
    max(v.decision) filter (where v.status='FINALIZADA' and v.visit_number=1) as first_visit_decision
  from public.qpc_inspection_visits v
  where v.inspection_id=i.id
) vs on true
where exists (
  select 1
  from public.qpc_inspection_visits vf
  where vf.inspection_id=i.id and vf.status='FINALIZADA'
);

create or replace view public.qpc_reporting_visits
with (security_invoker=true)
as
select
  v.id as visit_id,
  v.inspection_id,
  i.request_code,
  i.closure_code,
  i.project_id,
  pr.name as project_name,
  pr.short_code as project_short_code,
  i.location_text,
  i.requested_date,
  i.requested_by,
  exec.full_name as execution_name,
  exec.email as execution_email,
  exec.execution_area,
  v.visit_number,
  v.visit_type,
  v.template_id,
  v.activity,
  v.stage,
  v.started_by,
  starter.full_name as started_by_name,
  v.finished_by,
  finisher.full_name as quality_name,
  v.started_at,
  v.finished_at,
  v.finished_at::date as completed_date,
  v.status,
  v.technical_score,
  v.preparation_score,
  v.final_score,
  v.objective,
  v.decision,
  v.general_observation
from public.qpc_inspection_visits v
join public.qpc_inspections i on i.id=v.inspection_id
join public.qpc_projects pr on pr.id=i.project_id
join public.profiles exec on exec.id=i.requested_by
join public.profiles starter on starter.id=v.started_by
left join public.profiles finisher on finisher.id=v.finished_by
where v.status='FINALIZADA';

create or replace view public.qpc_reporting_answers
with (security_invoker=true)
as
select
  a.id as answer_id,
  a.visit_id,
  v.inspection_id,
  i.request_code,
  i.closure_code,
  i.project_id,
  pr.name as project_name,
  i.location_text,
  i.requested_by,
  exec.full_name as execution_name,
  exec.execution_area,
  v.visit_number,
  v.visit_type,
  v.activity,
  v.stage,
  v.finished_at,
  v.finished_at::date as completed_date,
  v.final_score as visit_final_score,
  v.objective as visit_objective,
  a.criterion_id,
  a.criterion_name,
  a.criterion_stage,
  a.weight,
  a.is_visit_criterion,
  a.selected_label,
  a.factor,
  a.observation,
  a.points_earned,
  a.points_lost,
  a.is_na,
  a.sort_order
from public.qpc_visit_answers a
join public.qpc_inspection_visits v on v.id=a.visit_id and v.status='FINALIZADA'
join public.qpc_inspections i on i.id=v.inspection_id
join public.qpc_projects pr on pr.id=i.project_id
join public.profiles exec on exec.id=i.requested_by;

-- -----------------------------------------------------------------------------
-- 3. Registro seguro de exportaciones.
-- -----------------------------------------------------------------------------
create or replace function public.qpc_log_export(
  p_project_id text,
  p_report_kind text,
  p_export_format text,
  p_period_mode text,
  p_period_value text,
  p_filters jsonb default '{}'::jsonb,
  p_row_count integer default 0,
  p_file_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  v_actor uuid:=auth.uid();
  v_id uuid;
  v_permission text;
begin
  if v_actor is null then raise exception 'Sesión no válida'; end if;
  if not public.qpc_user_can_access_project(v_actor,p_project_id) then
    raise exception 'No tiene acceso al proyecto';
  end if;
  v_permission:=case upper(p_export_format)
    when 'CSV' then 'exports.csv'
    when 'PDF' then 'exports.pdf'
    else null
  end;
  if v_permission is null then raise exception 'Formato no permitido'; end if;
  if not public.user_has_permission_for(v_actor,v_permission) then
    raise exception 'No tiene permiso para exportar en este formato';
  end if;
  insert into public.qpc_export_runs(
    project_id,actor_id,report_kind,export_format,period_mode,period_value,filters,row_count,file_id
  ) values(
    p_project_id,v_actor,coalesce(nullif(trim(p_report_kind),''),'unknown'),upper(p_export_format),
    p_period_mode,p_period_value,coalesce(p_filters,'{}'::jsonb),greatest(coalesce(p_row_count,0),0),p_file_id
  ) returning id into v_id;
  insert into public.audit_logs(project_id,actor_id,action,entity_type,entity_id,new_data)
  values(
    p_project_id,v_actor,'report.exported','export',v_id::text,
    jsonb_build_object('kind',p_report_kind,'format',upper(p_export_format),'period_mode',p_period_mode,'period_value',p_period_value,'row_count',p_row_count,'filters',coalesce(p_filters,'{}'::jsonb))
  );
  return v_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- 4. Seguridad
-- -----------------------------------------------------------------------------
alter table public.qpc_export_runs enable row level security;

drop policy if exists qpc_export_runs_select on public.qpc_export_runs;
create policy qpc_export_runs_select
on public.qpc_export_runs for select to authenticated
using (
  actor_id=auth.uid()
  or (
    public.qpc_user_can_access_project(auth.uid(),project_id)
    and (
      public.current_user_has_permission('audit.view')
      or public.current_user_has_permission('exports.pdf')
    )
  )
);

-- Las inserciones directas quedan bloqueadas; se usa qpc_log_export().
revoke insert,update,delete on public.qpc_export_runs from anon,authenticated;
grant select on public.qpc_export_runs to authenticated;
grant select on public.qpc_reporting_inspections,public.qpc_reporting_visits,public.qpc_reporting_answers to authenticated;
revoke all on function public.qpc_log_export(text,text,text,text,text,jsonb,integer,uuid) from public,anon;
grant execute on function public.qpc_log_export(text,text,text,text,text,jsonb,integer,uuid) to authenticated;

commit;

-- Verificación final
select 'qpc_reporting_inspections' as objeto,count(*) as registros from public.qpc_reporting_inspections
union all select 'qpc_reporting_visits',count(*) from public.qpc_reporting_visits
union all select 'qpc_reporting_answers',count(*) from public.qpc_reporting_answers
union all select 'qpc_export_runs',count(*) from public.qpc_export_runs;
