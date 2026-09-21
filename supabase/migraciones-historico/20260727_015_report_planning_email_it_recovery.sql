-- Quality Project Control MAIN V9.4 · Fase 15
-- Preparación avanzada de informes, cambio seguro de correo y recuperación break-glass de IT.
-- Ejecutar después de V9.3. Idempotente y no destructivo.

begin;

alter table public.permissions add column if not exists updated_at timestamptz not null default now();
alter table public.role_permissions add column if not exists updated_at timestamptz not null default now();

insert into public.permissions(code,name,description,category,sort_order,updated_at)
values
  ('users.email.update','Cambiar correo de usuarios','Permite cambiar el correo de inicio de sesión y sincronizar Auth, perfil y directorio.','USUARIOS',95,now()),
  ('it.recovery.manage','Gestionar recuperación IT','Permite generar el kit de códigos de recuperación de una cuenta Tecnología (IT).','USUARIOS',100,now()),
  ('reports.content.copy_period','Copiar contenido entre periodos','Permite copiar registros de contenido desde otro periodo del mismo proyecto.','INFORMES',50,now()),
  ('reports.layout.manage','Organizar láminas del informe','Permite decidir orden, inclusión y diseño sugerido de las láminas manuales.','INFORMES',60,now())
on conflict(code) do update set
  name=excluded.name,
  description=excluded.description,
  category=excluded.category,
  sort_order=excluded.sort_order,
  updated_at=now();

-- Quienes ya pueden administrar usuarios reciben el cambio de correo.
insert into public.role_permissions(role,permission_id,allowed,updated_at)
select r.role,p.id,true,now()
from (values('CALIDAD'),('COORDINADOR_CALIDAD'),('GERENCIA'),('PRESIDENTE'),('IT')) r(role)
cross join public.permissions p
where p.code='users.email.update'
on conflict(role,permission_id) do update set allowed=true,updated_at=now();

-- Solo IT genera sus códigos. Calidad y perfiles gerenciales pueden preparar informes.
insert into public.role_permissions(role,permission_id,allowed,updated_at)
select 'IT',p.id,true,now() from public.permissions p where p.code='it.recovery.manage'
on conflict(role,permission_id) do update set allowed=true,updated_at=now();

insert into public.role_permissions(role,permission_id,allowed,updated_at)
select r.role,p.id,true,now()
from (values('CALIDAD'),('COORDINADOR_CALIDAD'),('GERENCIA'),('PRESIDENTE'),('IT')) r(role)
cross join public.permissions p
where p.code in ('reports.content.copy_period','reports.layout.manage')
on conflict(role,permission_id) do update set allowed=true,updated_at=now();

-- IT siempre conserva todos los permisos existentes.
insert into public.role_permissions(role,permission_id,allowed,updated_at)
select 'IT',id,true,now() from public.permissions
on conflict(role,permission_id) do update set allowed=true,updated_at=now();

-- -----------------------------------------------------------------------------
-- 1. Organización de láminas por proyecto y periodo
-- -----------------------------------------------------------------------------
create table if not exists public.qpc_report_slide_plan(
  id uuid primary key default gen_random_uuid(),
  project_id text not null references public.qpc_projects(id) on delete cascade,
  period_mode text not null check(period_mode in ('week','month')),
  period_value text not null,
  entry_id uuid not null references public.qpc_report_entries(id) on delete cascade,
  section_code text not null,
  sort_order integer not null default 0,
  included boolean not null default true,
  layout text not null default 'AUTO' check(layout in ('AUTO','ONE_IMAGE','TWO_IMAGES','TEXT')),
  notes text not null default '',
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id,period_mode,period_value,entry_id)
);
create index if not exists qpc_report_slide_plan_period_idx
  on public.qpc_report_slide_plan(project_id,period_mode,period_value,sort_order);

drop trigger if exists trg_qpc_report_slide_plan_updated_at on public.qpc_report_slide_plan;
create trigger trg_qpc_report_slide_plan_updated_at
before update on public.qpc_report_slide_plan
for each row execute function public.qpc_touch_updated_at();

alter table public.qpc_report_slide_plan enable row level security;
drop policy if exists qpc_report_slide_plan_select on public.qpc_report_slide_plan;
create policy qpc_report_slide_plan_select on public.qpc_report_slide_plan
for select to authenticated using(
  public.qpc_user_can_access_project(auth.uid(),project_id)
  and public.user_has_permission_for(auth.uid(),'reports.content.view')
);

create or replace function public.qpc_report_slide_plan_for_period(
  p_project_id text,
  p_period_mode text,
  p_period_value text
)
returns table(
  entry_id uuid,
  section_code text,
  sort_order integer,
  included boolean,
  layout text,
  notes text
)
language plpgsql
stable
security definer
set search_path=public
as $$
begin
  if auth.uid() is null then raise exception 'Sesión no válida'; end if;
  if not public.qpc_user_can_access_project(auth.uid(),p_project_id) then raise exception 'No tiene acceso al proyecto'; end if;
  if not public.user_has_permission_for(auth.uid(),'reports.content.view') then raise exception 'No tiene permiso para consultar el informe'; end if;
  return query
  select s.entry_id,s.section_code,s.sort_order,s.included,s.layout,s.notes
  from public.qpc_report_slide_plan s
  where s.project_id=p_project_id and s.period_mode=p_period_mode and s.period_value=p_period_value
  order by s.sort_order,s.created_at,s.id;
end;
$$;

create or replace function public.qpc_save_report_slide_plan(
  p_project_id text,
  p_period_mode text,
  p_period_value text,
  p_items jsonb
)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  v_actor uuid:=auth.uid();
  v_item jsonb;
  v_entry public.qpc_report_entries%rowtype;
begin
  if v_actor is null then raise exception 'Sesión no válida'; end if;
  if not public.qpc_user_can_access_project(v_actor,p_project_id) then raise exception 'No tiene acceso al proyecto'; end if;
  if not public.user_has_permission_for(v_actor,'reports.layout.manage') then raise exception 'No tiene permiso para organizar láminas'; end if;
  if p_period_mode not in ('week','month') then raise exception 'Tipo de periodo no válido'; end if;

  delete from public.qpc_report_slide_plan
  where project_id=p_project_id and period_mode=p_period_mode and period_value=p_period_value;

  for v_item in select value from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) loop
    select * into v_entry from public.qpc_report_entries
    where id=(v_item->>'entry_id')::uuid
      and project_id=p_project_id
      and period_mode=p_period_mode
      and period_value=p_period_value
      and is_active=true and archived_at is null;
    if not found then raise exception 'El plan contiene un registro inválido'; end if;
    insert into public.qpc_report_slide_plan(
      project_id,period_mode,period_value,entry_id,section_code,sort_order,included,layout,notes,created_by,updated_by
    ) values(
      p_project_id,p_period_mode,p_period_value,v_entry.id,v_entry.section_code,
      coalesce((v_item->>'sort_order')::integer,v_entry.sort_order),
      coalesce((v_item->>'included')::boolean,true),
      case when coalesce(v_item->>'layout','AUTO') in ('AUTO','ONE_IMAGE','TWO_IMAGES','TEXT') then coalesce(v_item->>'layout','AUTO') else 'AUTO' end,
      coalesce(v_item->>'notes',''),v_actor,v_actor
    );
  end loop;

  insert into public.audit_logs(project_id,actor_id,action,entity_type,entity_id,new_data)
  values(p_project_id,v_actor,'REPORT_SLIDE_PLAN_SAVED','report_period',p_period_mode||':'||p_period_value,
         jsonb_build_object('items',jsonb_array_length(coalesce(p_items,'[]'::jsonb))));
end;
$$;

-- -----------------------------------------------------------------------------
-- 2. Copiar contenido desde otro periodo
-- -----------------------------------------------------------------------------
create or replace function public.qpc_clone_report_period_content(
  p_project_id text,
  p_period_mode text,
  p_source_period text,
  p_target_period text,
  p_section_codes text[] default null,
  p_include_evidence boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_actor uuid:=auth.uid();
  v_source public.qpc_report_entries%rowtype;
  v_new_id uuid;
  v_cloned integer:=0;
  v_skipped integer:=0;
  v_evidence integer:=0;
  v_rows integer:=0;
begin
  if v_actor is null then raise exception 'Sesión no válida'; end if;
  if p_source_period=p_target_period then raise exception 'El periodo de origen y destino no pueden ser iguales'; end if;
  if not public.qpc_user_can_access_project(v_actor,p_project_id) then raise exception 'No tiene acceso al proyecto'; end if;
  if not public.user_has_permission_for(v_actor,'reports.content.copy_period') then raise exception 'No tiene permiso para copiar contenido'; end if;

  for v_source in
    select * from public.qpc_report_entries
    where project_id=p_project_id
      and period_mode=p_period_mode
      and period_value=p_source_period
      and is_active=true and archived_at is null
      and (p_section_codes is null or section_code=any(p_section_codes))
    order by section_code,sort_order,created_at,id
  loop
    if exists(
      select 1 from public.qpc_report_entries target
      where target.project_id=p_project_id and target.period_mode=p_period_mode and target.period_value=p_target_period
        and target.is_active=true and target.archived_at is null
        and target.metadata->>'cloned_from_entry_id'=v_source.id::text
    ) then
      v_skipped:=v_skipped+1;
      continue;
    end if;

    insert into public.qpc_report_entries(
      project_id,period_mode,period_value,section_code,title,description,location_text,responsible,
      action_plan,reference_code,quantity,result_status,notes,file_id,sort_order,is_active,metadata,
      created_by,updated_by
    ) values(
      p_project_id,p_period_mode,p_target_period,v_source.section_code,v_source.title,v_source.description,
      v_source.location_text,v_source.responsible,v_source.action_plan,v_source.reference_code,v_source.quantity,
      v_source.result_status,v_source.notes,case when p_include_evidence then v_source.file_id else null end,
      v_source.sort_order,true,coalesce(v_source.metadata,'{}'::jsonb)||jsonb_build_object(
        'cloned_from_entry_id',v_source.id::text,'cloned_from_period',p_source_period,'cloned_at',now()
      ),v_actor,v_actor
    ) returning id into v_new_id;
    v_cloned:=v_cloned+1;

    if p_include_evidence then
      insert into public.qpc_report_entry_files(entry_id,file_id,caption,sort_order,created_by,created_at,updated_at)
      select v_new_id,l.file_id,l.caption,l.sort_order,v_actor,now(),now()
      from public.qpc_report_entry_files l
      join public.qpc_files f on f.id=l.file_id and f.deleted_at is null
      where l.entry_id=v_source.id and l.archived_at is null
      on conflict(entry_id,file_id) do nothing;
      get diagnostics v_rows = row_count;
      v_evidence:=v_evidence+v_rows;
    end if;
  end loop;

  insert into public.audit_logs(project_id,actor_id,action,entity_type,entity_id,new_data)
  values(p_project_id,v_actor,'REPORT_PERIOD_CONTENT_CLONED','report_period',p_period_mode||':'||p_target_period,
    jsonb_build_object('source_period',p_source_period,'target_period',p_target_period,'cloned_entries',v_cloned,'skipped_entries',v_skipped,'linked_evidence',v_evidence));

  return jsonb_build_object('cloned_entries',v_cloned,'skipped_entries',v_skipped,'linked_evidence',v_evidence);
end;
$$;

-- -----------------------------------------------------------------------------
-- 3. Kit de recuperación de Tecnología (IT)
-- -----------------------------------------------------------------------------
create table if not exists public.qpc_it_recovery_codes(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  code_hash text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  revoked_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(user_id,code_hash)
);
create index if not exists qpc_it_recovery_codes_active_idx
  on public.qpc_it_recovery_codes(user_id,expires_at)
  where used_at is null and revoked_at is null;

create table if not exists public.qpc_it_recovery_attempts(
  id bigint generated always as identity primary key,
  email_hash text not null,
  success boolean not null default false,
  attempted_at timestamptz not null default now()
);
create index if not exists qpc_it_recovery_attempts_rate_idx
  on public.qpc_it_recovery_attempts(email_hash,attempted_at desc);

alter table public.qpc_it_recovery_codes enable row level security;
alter table public.qpc_it_recovery_attempts enable row level security;
-- No se exponen políticas al cliente. La Edge Function usa service_role.

create or replace function public.qpc_consume_it_recovery_code(p_user_id uuid,p_code_hash text)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  v_id uuid;
begin
  update public.qpc_it_recovery_codes
  set used_at=now()
  where user_id=p_user_id and code_hash=p_code_hash
    and used_at is null and revoked_at is null and expires_at>now()
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.qpc_report_slide_plan_for_period(text,text,text) from public,anon;
revoke all on function public.qpc_save_report_slide_plan(text,text,text,jsonb) from public,anon;
revoke all on function public.qpc_clone_report_period_content(text,text,text,text,text[],boolean) from public,anon;
revoke all on function public.qpc_consume_it_recovery_code(uuid,text) from public,anon,authenticated;
grant execute on function public.qpc_report_slide_plan_for_period(text,text,text) to authenticated;
grant execute on function public.qpc_save_report_slide_plan(text,text,text,jsonb) to authenticated;
grant execute on function public.qpc_clone_report_period_content(text,text,text,text,text[],boolean) to authenticated;
grant execute on function public.qpc_consume_it_recovery_code(uuid,text) to service_role;

commit;
