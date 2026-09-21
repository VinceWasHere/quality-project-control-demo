-- Quality Project Control MAIN V9.8 · Fase 19
-- Validación inteligente del informe y control previo a publicación.
-- Idempotente, no destructivo y compatible con las fases anteriores.

begin;

alter table public.permissions
  add column if not exists updated_at timestamptz not null default now();
alter table public.role_permissions
  add column if not exists updated_at timestamptz not null default now();

insert into public.permissions(code,name,description,category,sort_order,created_at,updated_at)
values
 ('reports.validation.view','Ver validación de informes','Consultar el checklist de preparación previo a la publicación.','reports',980,now(),now()),
 ('reports.validation.manage','Gestionar validación de informes','Marcar secciones como revisadas, completas o no aplicables.','reports',981,now(),now()),
 ('reports.validation.override','Autorizar excepción de publicación','Permitir publicar con secciones pendientes dejando una justificación auditada.','reports',982,now(),now())
on conflict(code) do update set
  name=excluded.name,
  description=excluded.description,
  category=excluded.category,
  sort_order=excluded.sort_order,
  updated_at=now();

insert into public.role_permissions(role,permission_id,allowed,updated_at)
select r.role,p.id,true,now()
from (values
 ('CALIDAD','reports.validation.view'),
 ('CALIDAD','reports.validation.manage'),
 ('COORDINADOR_CALIDAD','reports.validation.view'),
 ('COORDINADOR_CALIDAD','reports.validation.manage'),
 ('COORDINADOR_CALIDAD','reports.validation.override'),
 ('GERENCIA','reports.validation.view'),
 ('PRESIDENTE','reports.validation.view'),
 ('PRESIDENTE','reports.validation.override'),
 ('IT','reports.validation.view'),
 ('IT','reports.validation.manage'),
 ('IT','reports.validation.override')
) as r(role,code)
join public.permissions p on p.code=r.code
on conflict(role,permission_id) do update set allowed=true,updated_at=now();

-- IT conserva todos los permisos presentes y futuros.
insert into public.role_permissions(role,permission_id,allowed,updated_at)
select 'IT',id,true,now() from public.permissions
on conflict(role,permission_id) do update set allowed=true,updated_at=now();

create table if not exists public.qpc_report_section_checks(
  id uuid primary key default gen_random_uuid(),
  project_id text not null references public.qpc_projects(id) on delete restrict,
  period_mode text not null check(period_mode in ('week','month')),
  period_value text not null,
  section_code text not null,
  review_status text not null default 'PENDING' check(review_status in ('PENDING','COMPLETE','NOT_APPLICABLE')),
  notes text not null default '',
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id,period_mode,period_value,section_code)
);

create table if not exists public.qpc_report_validation_overrides(
  id uuid primary key default gen_random_uuid(),
  project_id text not null references public.qpc_projects(id) on delete restrict,
  period_mode text not null check(period_mode in ('week','month')),
  period_value text not null,
  is_active boolean not null default true,
  reason text not null,
  authorized_by uuid references public.profiles(id) on delete set null,
  authorized_at timestamptz,
  revoked_by uuid references public.profiles(id) on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id,period_mode,period_value)
);

create index if not exists qpc_report_section_checks_period_idx
  on public.qpc_report_section_checks(project_id,period_mode,period_value,section_code);
create index if not exists qpc_report_validation_overrides_period_idx
  on public.qpc_report_validation_overrides(project_id,period_mode,period_value)
  where is_active=true;

alter table public.qpc_report_section_checks enable row level security;
alter table public.qpc_report_validation_overrides enable row level security;

drop policy if exists qpc_report_section_checks_read on public.qpc_report_section_checks;
create policy qpc_report_section_checks_read on public.qpc_report_section_checks
for select to authenticated
using(
  public.user_has_permission_for(auth.uid(),'reports.validation.view')
  and public.qpc_user_can_access_project(auth.uid(),project_id)
);

drop policy if exists qpc_report_validation_overrides_read on public.qpc_report_validation_overrides;
create policy qpc_report_validation_overrides_read on public.qpc_report_validation_overrides
for select to authenticated
using(
  public.user_has_permission_for(auth.uid(),'reports.validation.view')
  and public.qpc_user_can_access_project(auth.uid(),project_id)
);

-- Catálogo oficial de las secciones manuales que deben revisarse por tipo de informe.
create or replace function public.qpc_report_validation_catalog(p_period_mode text)
returns table(
  section_code text,
  section_label text,
  sort_order integer,
  expects_evidence boolean
)
language sql
immutable
as $$
  select code,label,position,evidence
  from (
    values
      ('GOOD_PRACTICES','Buenas prácticas',10,true,true,true),
      ('WORKSHOPS_TO_IMPROVE','Talleres a mejorar por meta incumplida',20,true,true,true),
      ('NONCONFORMITIES','No conformidades del proyecto',30,true,true,true),
      ('TRAININGS','Capacitaciones realizadas',40,true,true,true),
      ('SPECIAL_ATTENTION','Actividades de atención especial',50,true,true,true),
      ('MATERIAL_TESTS','Pruebas a materiales',60,false,true,true),
      ('LESSONS_LEARNED','Lecciones aprendidas',70,false,true,false),
      ('CONCLUSIONS','Conclusiones',80,true,true,false),
      ('RECOMMENDATIONS','Observaciones y recomendaciones',90,true,true,false),
      ('MOTIVATIONAL_ACTION','Acción motivacional',100,false,true,false)
  ) as c(code,label,position,weekly,monthly,evidence)
  where (p_period_mode='week' and weekly) or (p_period_mode='month' and monthly)
  order by position;
$$;

create or replace function public.qpc_report_validation_for_period(
  p_project_id text,
  p_period_mode text,
  p_period_value text
)
returns table(
  section_code text,
  section_label text,
  sort_order integer,
  expects_evidence boolean,
  entry_count integer,
  evidence_count integer,
  review_status text,
  notes text,
  reviewed_by_name text,
  reviewed_at timestamptz,
  is_blocker boolean,
  warning_text text,
  override_active boolean,
  override_reason text
)
language plpgsql
stable
security definer
set search_path=public
as $$
begin
  if auth.uid() is null then raise exception 'Sesión no válida.'; end if;
  if p_period_mode not in ('week','month') then raise exception 'Tipo de periodo no válido.'; end if;
  if not public.user_has_permission_for(auth.uid(),'reports.validation.view') then
    raise exception 'No tiene permiso para consultar la validación del informe.';
  end if;
  if not public.qpc_user_can_access_project(auth.uid(),p_project_id) then
    raise exception 'No tiene acceso al proyecto.';
  end if;

  return query
  with catalog as (
    select * from public.qpc_report_validation_catalog(p_period_mode)
  ), counts as (
    select
      c.section_code,
      count(distinct e.id)::integer as entry_count,
      count(distinct ef.id)::integer as evidence_count
    from catalog c
    left join public.qpc_report_entries e
      on e.project_id=p_project_id
     and e.period_mode=p_period_mode
     and e.period_value=p_period_value
     and e.section_code=c.section_code
     and e.is_active=true
     and e.archived_at is null
    left join public.qpc_report_entry_files ef
      on ef.entry_id=e.id and ef.archived_at is null
    group by c.section_code
  ), active_override as (
    select o.is_active,o.reason
    from public.qpc_report_validation_overrides o
    where o.project_id=p_project_id
      and o.period_mode=p_period_mode
      and o.period_value=p_period_value
      and o.is_active=true
    limit 1
  )
  select
    c.section_code,
    c.section_label,
    c.sort_order,
    c.expects_evidence,
    coalesce(n.entry_count,0),
    coalesce(n.evidence_count,0),
    coalesce(ch.review_status,'PENDING'),
    coalesce(ch.notes,''),
    coalesce(pr.full_name,pr.email,''),
    ch.reviewed_at,
    coalesce(ch.review_status,'PENDING')='PENDING',
    case
      when coalesce(ch.review_status,'PENDING')='COMPLETE' and coalesce(n.entry_count,0)=0
        then 'La sección fue marcada completa, pero no contiene registros.'
      when c.expects_evidence and coalesce(n.entry_count,0)>0 and coalesce(n.evidence_count,0)=0
        then 'Hay contenido sin evidencia adjunta.'
      when coalesce(ch.review_status,'PENDING')='PENDING'
        then 'Revise la sección y márquela completa o no aplicable.'
      else ''
    end,
    coalesce((select ao.is_active from active_override ao),false),
    coalesce((select ao.reason from active_override ao),'')
  from catalog c
  left join counts n on n.section_code=c.section_code
  left join public.qpc_report_section_checks ch
    on ch.project_id=p_project_id
   and ch.period_mode=p_period_mode
   and ch.period_value=p_period_value
   and ch.section_code=c.section_code
  left join public.profiles pr on pr.id=ch.reviewed_by
  order by c.sort_order;
end;
$$;

create or replace function public.qpc_set_report_section_check(
  p_project_id text,
  p_period_mode text,
  p_period_value text,
  p_section_code text,
  p_status text,
  p_notes text default ''
)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
declare
  v_actor uuid:=auth.uid();
  v_entry_count integer;
begin
  if v_actor is null then raise exception 'Sesión no válida.'; end if;
  if not public.user_has_permission_for(v_actor,'reports.validation.manage') then
    raise exception 'No tiene permiso para actualizar la validación.';
  end if;
  if not public.qpc_user_can_access_project(v_actor,p_project_id) then
    raise exception 'No tiene acceso al proyecto.';
  end if;
  if upper(p_status) not in ('PENDING','COMPLETE','NOT_APPLICABLE') then
    raise exception 'Estado de validación no válido.';
  end if;
  if not exists(select 1 from public.qpc_report_validation_catalog(p_period_mode) c where c.section_code=upper(p_section_code)) then
    raise exception 'Sección no válida para este tipo de informe.';
  end if;

  select count(*)::integer into v_entry_count
  from public.qpc_report_entries e
  where e.project_id=p_project_id
    and e.period_mode=p_period_mode
    and e.period_value=p_period_value
    and e.section_code=upper(p_section_code)
    and e.is_active=true
    and e.archived_at is null;

  if upper(p_status)='COMPLETE' and v_entry_count=0 then
    raise exception 'La sección no contiene registros. Utilice No aplica o agregue contenido.';
  end if;

  insert into public.qpc_report_section_checks(
    project_id,period_mode,period_value,section_code,review_status,notes,reviewed_by,reviewed_at,updated_at
  ) values(
    p_project_id,p_period_mode,p_period_value,upper(p_section_code),upper(p_status),coalesce(p_notes,''),
    case when upper(p_status)='PENDING' then null else v_actor end,
    case when upper(p_status)='PENDING' then null else now() end,
    now()
  )
  on conflict(project_id,period_mode,period_value,section_code) do update set
    review_status=excluded.review_status,
    notes=excluded.notes,
    reviewed_by=excluded.reviewed_by,
    reviewed_at=excluded.reviewed_at,
    updated_at=now();

  insert into public.audit_logs(project_id,actor_id,action,entity_type,entity_id,new_data,created_at)
  values(
    p_project_id,v_actor,'REPORT_VALIDATION_'||upper(p_status),'REPORT_SECTION',
    p_period_mode||':'||p_period_value||':'||upper(p_section_code),
    jsonb_build_object('period_mode',p_period_mode,'period_value',p_period_value,'section_code',upper(p_section_code),'status',upper(p_status),'notes',coalesce(p_notes,'')),
    now()
  );
  return true;
end;
$$;

create or replace function public.qpc_set_report_validation_override(
  p_project_id text,
  p_period_mode text,
  p_period_value text,
  p_enabled boolean,
  p_reason text default ''
)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
declare
  v_actor uuid:=auth.uid();
begin
  if v_actor is null then raise exception 'Sesión no válida.'; end if;
  if not public.user_has_permission_for(v_actor,'reports.validation.override') then
    raise exception 'No tiene permiso para autorizar excepciones.';
  end if;
  if not public.qpc_user_can_access_project(v_actor,p_project_id) then
    raise exception 'No tiene acceso al proyecto.';
  end if;
  if p_enabled and length(trim(coalesce(p_reason,'')))<10 then
    raise exception 'Indique una justificación de al menos 10 caracteres.';
  end if;

  insert into public.qpc_report_validation_overrides(
    project_id,period_mode,period_value,is_active,reason,authorized_by,authorized_at,revoked_by,revoked_at,updated_at
  ) values(
    p_project_id,p_period_mode,p_period_value,p_enabled,trim(coalesce(p_reason,'')),
    case when p_enabled then v_actor else null end,
    case when p_enabled then now() else null end,
    case when not p_enabled then v_actor else null end,
    case when not p_enabled then now() else null end,
    now()
  )
  on conflict(project_id,period_mode,period_value) do update set
    is_active=excluded.is_active,
    reason=case when excluded.is_active then excluded.reason else public.qpc_report_validation_overrides.reason end,
    authorized_by=case when excluded.is_active then excluded.authorized_by else public.qpc_report_validation_overrides.authorized_by end,
    authorized_at=case when excluded.is_active then excluded.authorized_at else public.qpc_report_validation_overrides.authorized_at end,
    revoked_by=excluded.revoked_by,
    revoked_at=excluded.revoked_at,
    updated_at=now();

  insert into public.audit_logs(project_id,actor_id,action,entity_type,entity_id,new_data,created_at)
  values(
    p_project_id,v_actor,
    case when p_enabled then 'REPORT_VALIDATION_OVERRIDE_ENABLED' else 'REPORT_VALIDATION_OVERRIDE_REVOKED' end,
    'REPORT_CYCLE',p_period_mode||':'||p_period_value,
    jsonb_build_object('enabled',p_enabled,'reason',trim(coalesce(p_reason,''))),now()
  );
  return true;
end;
$$;

-- Cuando cambia el contenido, la sección vuelve a pendiente y se invalida cualquier excepción previa.
create or replace function public.qpc_invalidate_report_validation_from_entry()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  v_project text:=coalesce(new.project_id,old.project_id);
  v_mode text:=coalesce(new.period_mode,old.period_mode);
  v_period text:=coalesce(new.period_value,old.period_value);
  v_section text:=coalesce(new.section_code,old.section_code);
begin
  update public.qpc_report_section_checks
  set review_status='PENDING',reviewed_by=null,reviewed_at=null,updated_at=now()
  where project_id=v_project and period_mode=v_mode and period_value=v_period and section_code=v_section;
  update public.qpc_report_validation_overrides
  set is_active=false,revoked_at=now(),updated_at=now()
  where project_id=v_project and period_mode=v_mode and period_value=v_period and is_active=true;
  if TG_OP='DELETE' then return old; else return new; end if;
end;
$$;

drop trigger if exists trg_qpc_report_entries_invalidate_validation on public.qpc_report_entries;
create trigger trg_qpc_report_entries_invalidate_validation
after insert or update or delete on public.qpc_report_entries
for each row execute function public.qpc_invalidate_report_validation_from_entry();

create or replace function public.qpc_invalidate_report_validation_from_file()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  v_entry_id uuid:=coalesce(new.entry_id,old.entry_id);
  v_entry public.qpc_report_entries%rowtype;
begin
  select * into v_entry from public.qpc_report_entries where id=v_entry_id;
  if found then
    update public.qpc_report_section_checks
    set review_status='PENDING',reviewed_by=null,reviewed_at=null,updated_at=now()
    where project_id=v_entry.project_id and period_mode=v_entry.period_mode and period_value=v_entry.period_value and section_code=v_entry.section_code;
    update public.qpc_report_validation_overrides
    set is_active=false,revoked_at=now(),updated_at=now()
    where project_id=v_entry.project_id and period_mode=v_entry.period_mode and period_value=v_entry.period_value and is_active=true;
  end if;
  if TG_OP='DELETE' then return old; else return new; end if;
end;
$$;

drop trigger if exists trg_qpc_report_entry_files_invalidate_validation on public.qpc_report_entry_files;
create trigger trg_qpc_report_entry_files_invalidate_validation
after insert or update or delete on public.qpc_report_entry_files
for each row execute function public.qpc_invalidate_report_validation_from_file();

-- Bloqueo central: ninguna vía puede publicar con secciones pendientes, salvo una excepción autorizada.
create or replace function public.qpc_enforce_report_validation_before_publish()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  v_blockers integer;
  v_override boolean;
begin
  if new.status='PUBLISHED' and old.status is distinct from new.status then
    select count(*)::integer into v_blockers
    from public.qpc_report_validation_catalog(new.period_mode) c
    left join public.qpc_report_section_checks ch
      on ch.project_id=new.project_id
     and ch.period_mode=new.period_mode
     and ch.period_value=new.period_value
     and ch.section_code=c.section_code
    where coalesce(ch.review_status,'PENDING')='PENDING';

    select coalesce(bool_or(o.is_active),false) into v_override
    from public.qpc_report_validation_overrides o
    where o.project_id=new.project_id
      and o.period_mode=new.period_mode
      and o.period_value=new.period_value;

    if v_blockers>0 and not v_override then
      raise exception 'El informe tiene % secciones pendientes de validación. Complete el checklist o autorice una excepción.',v_blockers;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_qpc_report_cycle_validation_gate on public.qpc_report_cycles;
create trigger trg_qpc_report_cycle_validation_gate
before update of status on public.qpc_report_cycles
for each row execute function public.qpc_enforce_report_validation_before_publish();

revoke all on function public.qpc_report_validation_catalog(text) from public,anon;
revoke all on function public.qpc_report_validation_for_period(text,text,text) from public,anon;
revoke all on function public.qpc_set_report_section_check(text,text,text,text,text,text) from public,anon;
revoke all on function public.qpc_set_report_validation_override(text,text,text,boolean,text) from public,anon;
grant execute on function public.qpc_report_validation_catalog(text) to authenticated;
grant execute on function public.qpc_report_validation_for_period(text,text,text) to authenticated;
grant execute on function public.qpc_set_report_section_check(text,text,text,text,text,text) to authenticated;
grant execute on function public.qpc_set_report_validation_override(text,text,text,boolean,text) to authenticated;
grant select on public.qpc_report_section_checks,public.qpc_report_validation_overrides to authenticated;

commit;
