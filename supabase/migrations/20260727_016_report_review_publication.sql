-- Quality Project Control MAIN V9.5 · Fase 16
-- Revisión, aprobación y publicación de informes corporativos.
-- Idempotente. No elimina reportes ni contenido existente.

begin;

alter table public.permissions
  add column if not exists updated_at timestamptz not null default now();
alter table public.role_permissions
  add column if not exists updated_at timestamptz not null default now();

insert into public.permissions(code,name,description,category,sort_order,created_at,updated_at)
values
 ('reports.review.view','Ver revisión de informes','Consultar el estado de preparación, revisión y publicación.','reports',950,now(),now()),
 ('reports.review.manage','Preparar informes para revisión','Guardar notas, marcar como listo y reabrir borradores.','reports',951,now(),now()),
 ('reports.review.approve','Aprobar informes','Aprobar un informe listo para revisión.','reports',952,now(),now()),
 ('reports.review.publish','Publicar informes','Publicar la versión corporativa final del periodo.','reports',953,now(),now())
on conflict (code) do update
set name=excluded.name,
    description=excluded.description,
    category=excluded.category,
    sort_order=excluded.sort_order,
    updated_at=now();

-- IT siempre recibe todos los permisos.
insert into public.role_permissions(role,permission_id,allowed,updated_at)
select 'IT',id,true,now() from public.permissions
on conflict (role,permission_id) do update set allowed=true,updated_at=now();

-- Defaults por rol.
insert into public.role_permissions(role,permission_id,allowed,updated_at)
select r.role,p.id,true,now()
from (values
 ('CALIDAD','reports.review.view'),
 ('CALIDAD','reports.review.manage'),
 ('COORDINADOR_CALIDAD','reports.review.view'),
 ('COORDINADOR_CALIDAD','reports.review.manage'),
 ('COORDINADOR_CALIDAD','reports.review.approve'),
 ('COORDINADOR_CALIDAD','reports.review.publish'),
 ('GERENCIA','reports.review.view'),
 ('GERENCIA','reports.review.approve'),
 ('PRESIDENTE','reports.review.view'),
 ('PRESIDENTE','reports.review.approve'),
 ('PRESIDENTE','reports.review.publish')
) as r(role,code)
join public.permissions p on p.code=r.code
on conflict (role,permission_id) do update set allowed=true,updated_at=now();

create table if not exists public.qpc_report_cycles (
  id uuid primary key default gen_random_uuid(),
  project_id text not null references public.qpc_projects(id) on delete restrict,
  period_mode text not null check (period_mode in ('week','month')),
  period_value text not null,
  status text not null default 'DRAFT' check (status in ('DRAFT','READY_FOR_REVIEW','APPROVED','PUBLISHED')),
  revision_number integer not null default 0 check (revision_number>=0),
  review_notes text not null default '',
  snapshot jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  published_by uuid references public.profiles(id) on delete set null,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id,period_mode,period_value)
);

create table if not exists public.qpc_report_cycle_events (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references public.qpc_report_cycles(id) on delete cascade,
  project_id text not null references public.qpc_projects(id) on delete restrict,
  action text not null,
  previous_status text,
  new_status text not null,
  revision_number integer not null default 0,
  notes text not null default '',
  actor_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists qpc_report_cycles_period_idx
  on public.qpc_report_cycles(project_id,period_mode,period_value);
create index if not exists qpc_report_cycle_events_cycle_idx
  on public.qpc_report_cycle_events(cycle_id,created_at desc);

alter table public.qpc_report_cycles enable row level security;
alter table public.qpc_report_cycle_events enable row level security;

drop policy if exists qpc_report_cycles_read on public.qpc_report_cycles;
create policy qpc_report_cycles_read on public.qpc_report_cycles
for select to authenticated
using (
  public.current_user_has_permission('reports.review.view')
  or exists (
    select 1 from public.project_members pm
    where pm.project_id=qpc_report_cycles.project_id
      and pm.user_id=auth.uid()
      and pm.is_active
  )
);

drop policy if exists qpc_report_cycle_events_read on public.qpc_report_cycle_events;
create policy qpc_report_cycle_events_read on public.qpc_report_cycle_events
for select to authenticated
using (
  public.current_user_has_permission('reports.review.view')
  or exists (
    select 1 from public.project_members pm
    where pm.project_id=qpc_report_cycle_events.project_id
      and pm.user_id=auth.uid()
      and pm.is_active
  )
);

create or replace function public.qpc_set_report_cycle_status(
  p_project_id text,
  p_period_mode text,
  p_period_value text,
  p_action text,
  p_notes text default ''
)
returns public.qpc_report_cycles
language plpgsql
security definer
set search_path=public
as $$
declare
  v_actor uuid:=auth.uid();
  v_cycle public.qpc_report_cycles;
  v_previous text;
  v_new text;
  v_permission text;
  v_snapshot jsonb;
begin
  if v_actor is null then raise exception 'Sesión no válida.'; end if;
  if p_period_mode not in ('week','month') then raise exception 'Tipo de periodo no válido.'; end if;
  if coalesce(trim(p_period_value),'')='' then raise exception 'Periodo requerido.'; end if;

  v_permission:=case upper(p_action)
    when 'SAVE_DRAFT' then 'reports.review.manage'
    when 'MARK_READY' then 'reports.review.manage'
    when 'APPROVE' then 'reports.review.approve'
    when 'PUBLISH' then 'reports.review.publish'
    when 'REOPEN' then 'reports.review.manage'
    else null end;
  if v_permission is null then raise exception 'Acción no válida.'; end if;
  if not public.user_has_permission_for(v_actor,v_permission) then
    raise exception 'No tiene permiso para completar esta acción.';
  end if;

  select * into v_cycle
  from public.qpc_report_cycles
  where project_id=p_project_id and period_mode=p_period_mode and period_value=p_period_value
  for update;

  if not found then
    insert into public.qpc_report_cycles(project_id,period_mode,period_value,created_by,updated_by)
    values(p_project_id,p_period_mode,p_period_value,v_actor,v_actor)
    returning * into v_cycle;
  end if;

  v_previous:=v_cycle.status;
  v_new:=case upper(p_action)
    when 'SAVE_DRAFT' then 'DRAFT'
    when 'MARK_READY' then 'READY_FOR_REVIEW'
    when 'APPROVE' then 'APPROVED'
    when 'PUBLISH' then 'PUBLISHED'
    when 'REOPEN' then 'DRAFT'
  end;

  if upper(p_action)='APPROVE' and v_previous<>'READY_FOR_REVIEW' then
    raise exception 'Solo se puede aprobar un informe listo para revisión.';
  end if;
  if upper(p_action)='PUBLISH' and v_previous<>'APPROVED' then
    raise exception 'Solo se puede publicar un informe aprobado.';
  end if;
  if upper(p_action)='MARK_READY' and v_previous not in ('DRAFT','READY_FOR_REVIEW') then
    raise exception 'Reabra el informe antes de marcarlo para revisión.';
  end if;

  select jsonb_build_object(
    'entries',count(*),
    'sections',count(distinct section_code),
    'generated_at',now()
  ) into v_snapshot
  from public.qpc_report_entries
  where project_id=p_project_id
    and period_mode=p_period_mode
    and period_value=p_period_value
    and coalesce(is_archived,false)=false;

  update public.qpc_report_cycles
  set status=v_new,
      review_notes=coalesce(p_notes,''),
      snapshot=coalesce(v_snapshot,'{}'::jsonb),
      updated_by=v_actor,
      updated_at=now(),
      revision_number=case when upper(p_action)='PUBLISH' then revision_number+1 else revision_number end,
      approved_by=case when upper(p_action)='APPROVE' then v_actor when upper(p_action)='REOPEN' then null else approved_by end,
      approved_at=case when upper(p_action)='APPROVE' then now() when upper(p_action)='REOPEN' then null else approved_at end,
      published_by=case when upper(p_action)='PUBLISH' then v_actor when upper(p_action)='REOPEN' then null else published_by end,
      published_at=case when upper(p_action)='PUBLISH' then now() when upper(p_action)='REOPEN' then null else published_at end
  where id=v_cycle.id
  returning * into v_cycle;

  insert into public.qpc_report_cycle_events(
    cycle_id,project_id,action,previous_status,new_status,revision_number,notes,actor_id
  ) values(
    v_cycle.id,p_project_id,upper(p_action),v_previous,v_new,v_cycle.revision_number,coalesce(p_notes,''),v_actor
  );

  insert into public.audit_logs(project_id,actor_id,action,entity_type,entity_id,previous_data,new_data,created_at)
  values(
    p_project_id,v_actor,'REPORT_'||upper(p_action),'REPORT_CYCLE',v_cycle.id::text,
    jsonb_build_object('status',v_previous),
    jsonb_build_object('status',v_new,'revision',v_cycle.revision_number),now()
  );

  return v_cycle;
end;
$$;

revoke all on function public.qpc_set_report_cycle_status(text,text,text,text,text) from public;
grant execute on function public.qpc_set_report_cycle_status(text,text,text,text,text) to authenticated;
grant select on public.qpc_report_cycles,public.qpc_report_cycle_events to authenticated;

commit;
