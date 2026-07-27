-- Quality Project Control MAIN V10.0 · Fase 21
-- Centro de notificaciones internas e interconexión de eventos.

begin;

alter table public.permissions
  add column if not exists updated_at timestamptz not null default now();
alter table public.role_permissions
  add column if not exists updated_at timestamptz not null default now();

insert into public.permissions(code,name,description,category,sort_order,created_at,updated_at)
values
  ('notifications.view','Ver notificaciones','Permite consultar las notificaciones personales de la plataforma.','general',25,now(),now()),
  ('notifications.manage','Administrar notificaciones','Permite ejecutar tareas administrativas del centro de notificaciones.','general',26,now(),now())
on conflict (code) do update
set name=excluded.name,
    description=excluded.description,
    category=excluded.category,
    sort_order=excluded.sort_order,
    updated_at=now();

insert into public.role_permissions(role,permission_id,allowed,updated_at)
select roles.role,p.id,true,now()
from (values
  ('EJECUCION'),('CALIDAD'),('COORDINADOR_CALIDAD'),('GERENCIA'),('PRESIDENTE'),('IT')
) roles(role)
join public.permissions p on p.code='notifications.view'
on conflict (role,permission_id) do update
set allowed=true,updated_at=now();

insert into public.role_permissions(role,permission_id,allowed,updated_at)
select roles.role,p.id,true,now()
from (values ('IT')) roles(role)
join public.permissions p on p.code='notifications.manage'
on conflict (role,permission_id) do update
set allowed=true,updated_at=now();

create table if not exists public.qpc_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  project_id text references public.qpc_projects(id) on delete cascade,
  category text not null default 'GENERAL',
  title text not null,
  body text not null default '',
  entity_type text,
  entity_id text,
  action_view text,
  event_key text unique,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  archived_at timestamptz
);

create index if not exists qpc_notifications_recipient_created_idx
  on public.qpc_notifications(recipient_id,created_at desc);
create index if not exists qpc_notifications_recipient_unread_idx
  on public.qpc_notifications(recipient_id,read_at,created_at desc)
  where archived_at is null;
create index if not exists qpc_notifications_project_idx
  on public.qpc_notifications(project_id,created_at desc);

alter table public.qpc_notifications enable row level security;

drop policy if exists qpc_notifications_select_own on public.qpc_notifications;
create policy qpc_notifications_select_own
on public.qpc_notifications for select
to authenticated
using (recipient_id=auth.uid());

drop policy if exists qpc_notifications_update_own on public.qpc_notifications;
create policy qpc_notifications_update_own
on public.qpc_notifications for update
to authenticated
using (recipient_id=auth.uid())
with check (recipient_id=auth.uid());

grant select,update on public.qpc_notifications to authenticated;

create or replace function public.qpc_create_notification(
  p_recipient_id uuid,
  p_project_id text,
  p_category text,
  p_title text,
  p_body text default '',
  p_entity_type text default null,
  p_entity_id text default null,
  p_action_view text default null,
  p_event_key text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare v_id uuid;
begin
  if p_recipient_id is null then return null; end if;
  insert into public.qpc_notifications(
    recipient_id,project_id,category,title,body,entity_type,entity_id,
    action_view,event_key,metadata
  ) values(
    p_recipient_id,p_project_id,coalesce(nullif(p_category,''),'GENERAL'),p_title,
    coalesce(p_body,''),p_entity_type,p_entity_id,p_action_view,p_event_key,
    coalesce(p_metadata,'{}'::jsonb)
  )
  on conflict(event_key) do nothing
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.qpc_create_notification(uuid,text,text,text,text,text,text,text,text,jsonb) from public,anon,authenticated;

create or replace function public.qpc_notifications_for_current_user(
  p_limit integer default 40,
  p_unread_only boolean default false
)
returns table(
  id uuid,
  project_id text,
  category text,
  title text,
  body text,
  entity_type text,
  entity_id text,
  action_view text,
  metadata jsonb,
  created_at timestamptz,
  read_at timestamptz
)
language sql
security definer
set search_path=public
as $$
  select n.id,n.project_id,n.category,n.title,n.body,n.entity_type,n.entity_id,
         n.action_view,n.metadata,n.created_at,n.read_at
  from public.qpc_notifications n
  where n.recipient_id=auth.uid()
    and n.archived_at is null
    and (not p_unread_only or n.read_at is null)
  order by n.created_at desc
  limit greatest(1,least(coalesce(p_limit,40),100));
$$;

grant execute on function public.qpc_notifications_for_current_user(integer,boolean) to authenticated;

create or replace function public.qpc_mark_notification_read(p_notification_id uuid)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
begin
  update public.qpc_notifications
  set read_at=coalesce(read_at,now())
  where id=p_notification_id and recipient_id=auth.uid() and archived_at is null;
  return found;
end;
$$;
grant execute on function public.qpc_mark_notification_read(uuid) to authenticated;

create or replace function public.qpc_mark_all_notifications_read()
returns integer
language plpgsql
security definer
set search_path=public
as $$
declare v_count integer;
begin
  update public.qpc_notifications
  set read_at=now()
  where recipient_id=auth.uid() and read_at is null and archived_at is null;
  get diagnostics v_count=row_count;
  return v_count;
end;
$$;
grant execute on function public.qpc_mark_all_notifications_read() to authenticated;

create or replace function public.qpc_archive_notification(p_notification_id uuid)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
begin
  update public.qpc_notifications
  set archived_at=now(),read_at=coalesce(read_at,now())
  where id=p_notification_id and recipient_id=auth.uid() and archived_at is null;
  return found;
end;
$$;
grant execute on function public.qpc_archive_notification(uuid) to authenticated;

create or replace function public.qpc_inspection_status_label(p_status text)
returns text
language sql
immutable
as $$
  select case p_status
    when 'BORRADOR' then 'Borrador'
    when 'SOLICITADA_LIBERACION' then 'Solicitada para liberación'
    when 'TOMADA' then 'Tomada por Calidad'
    when 'VISITA_LIBERACION_EN_PROCESO' then 'Liberación en proceso'
    when 'LIBERADA' then 'Liberada'
    when 'CON_OBSERVACIONES' then 'Con observaciones'
    when 'NO_LIBERADA' then 'No liberada'
    when 'SEGUIMIENTO_EN_PROCESO' then 'Seguimiento en proceso'
    when 'PENDIENTE_DE_CIERRE' then 'Pendiente de cierre'
    when 'CIERRE_EN_PROCESO' then 'Cierre en proceso'
    when 'CERRADA' then 'Cerrada'
    when 'IMPROCEDENTE' then 'Improcedente'
    when 'ANULADA' then 'Anulada'
    else coalesce(p_status,'Actualizada')
  end;
$$;

create or replace function public.qpc_notify_inspection_changes()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  v_profile record;
  v_label text;
begin
  if tg_op='INSERT' then
    if new.status='SOLICITADA_LIBERACION' then
      for v_profile in
        select distinct p.id
        from public.profiles p
        join public.project_members pm on pm.user_id=p.id and pm.project_id=new.project_id and pm.is_active=true
        where p.is_active=true
          and p.role in ('CALIDAD','COORDINADOR_CALIDAD','IT')
          and p.id<>new.requested_by
      loop
        perform public.qpc_create_notification(
          v_profile.id,new.project_id,'INSPECTION','Nueva solicitud de liberación',
          concat(new.request_code,' · ',new.activity,' · ',new.location_text),
          'INSPECTION',new.id::text,'qualityQueue',
          concat('inspection:',new.id,':requested:',v_profile.id),
          jsonb_build_object('request_code',new.request_code,'status',new.status)
        );
      end loop;
    end if;
    return new;
  end if;

  if new.assigned_quality_id is distinct from old.assigned_quality_id and new.assigned_quality_id is not null then
    perform public.qpc_create_notification(
      new.assigned_quality_id,new.project_id,'INSPECTION','Inspección asignada',
      concat(new.request_code,' fue asignada a su usuario.'),
      'INSPECTION',new.id::text,'detail',
      concat('inspection:',new.id,':assigned:',new.assigned_quality_id),
      jsonb_build_object('request_code',new.request_code,'status',new.status)
    );
  end if;

  if new.status is distinct from old.status then
    v_label:=public.qpc_inspection_status_label(new.status);
    if new.requested_by is not null then
      perform public.qpc_create_notification(
        new.requested_by,new.project_id,'INSPECTION','Estado de inspección actualizado',
        concat(new.request_code,' · ',v_label),
        'INSPECTION',new.id::text,'detail',
        concat('inspection:',new.id,':status:',new.status,':requester'),
        jsonb_build_object('request_code',new.request_code,'status',new.status,'closure_code',new.closure_code)
      );
    end if;
    if new.assigned_quality_id is not null and new.assigned_quality_id<>new.requested_by then
      perform public.qpc_create_notification(
        new.assigned_quality_id,new.project_id,'INSPECTION','Inspección actualizada',
        concat(new.request_code,' · ',v_label),
        'INSPECTION',new.id::text,'detail',
        concat('inspection:',new.id,':status:',new.status,':quality:',new.assigned_quality_id),
        jsonb_build_object('request_code',new.request_code,'status',new.status,'closure_code',new.closure_code)
      );
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_qpc_notify_inspection_changes on public.qpc_inspections;
create trigger trg_qpc_notify_inspection_changes
after insert or update of status,assigned_quality_id on public.qpc_inspections
for each row execute function public.qpc_notify_inspection_changes();

create or replace function public.qpc_notify_report_cycle_changes()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare v_profile record; v_title text; v_body text;
begin
  if new.status is not distinct from old.status then return new; end if;
  v_title:=case new.status
    when 'READY_FOR_REVIEW' then 'Informe listo para revisión'
    when 'APPROVED' then 'Informe aprobado'
    when 'PUBLISHED' then 'Informe publicado'
    else 'Estado de informe actualizado'
  end;
  v_body:=concat(case new.period_mode when 'week' then 'Informe semanal ' else 'Informe mensual ' end,new.period_value,' · ',new.status);
  for v_profile in
    select distinct p.id
    from public.profiles p
    join public.project_members pm on pm.user_id=p.id and pm.project_id=new.project_id and pm.is_active=true
    where p.is_active=true
      and p.role in ('COORDINADOR_CALIDAD','GERENCIA','PRESIDENTE','IT')
      and p.id is distinct from new.updated_by
  loop
    perform public.qpc_create_notification(
      v_profile.id,new.project_id,'REPORT',v_title,v_body,
      'REPORT',new.id::text,'report-content',
      concat('report:',new.id,':status:',new.status,':',new.revision_number,':',v_profile.id),
      jsonb_build_object('period_mode',new.period_mode,'period_value',new.period_value,'status',new.status,'revision_number',new.revision_number)
    );
  end loop;
  return new;
end;
$$;

drop trigger if exists trg_qpc_notify_report_cycle_changes on public.qpc_report_cycles;
create trigger trg_qpc_notify_report_cycle_changes
after update of status on public.qpc_report_cycles
for each row execute function public.qpc_notify_report_cycle_changes();

create or replace function public.qpc_refresh_due_equipment_notifications()
returns integer
language plpgsql
security definer
set search_path=public
as $$
declare v_equipment record; v_profile record; v_due date; v_count integer:=0; v_result uuid;
begin
  if auth.uid() is null then raise exception 'Sesión requerida'; end if;
  for v_equipment in
    select e.*,
      least(
        case when e.calibration_required and e.last_calibration_date is not null then e.last_calibration_date+e.frequency_days end,
        case when e.verification_required and e.last_verification_date is not null then e.last_verification_date+e.frequency_days end
      ) as due_date
    from public.qpc_equipment e
    where e.is_active=true
  loop
    v_due:=v_equipment.due_date;
    if v_due is null or v_due>current_date+30 then continue; end if;
    for v_profile in
      select distinct p.id
      from public.profiles p
      join public.project_members pm on pm.user_id=p.id and pm.project_id=v_equipment.project_id and pm.is_active=true
      where p.is_active=true and p.role in ('CALIDAD','COORDINADOR_CALIDAD','IT')
    loop
      v_result:=public.qpc_create_notification(
        v_profile.id,v_equipment.project_id,'EQUIPMENT',
        case when v_due<current_date then 'Equipo vencido' else 'Equipo próximo a vencer' end,
        concat(v_equipment.equipment_code,' · ',v_equipment.equipment_type,' · fecha ',to_char(v_due,'DD/MM/YYYY')),
        'EQUIPMENT',v_equipment.id::text,'equipment',
        concat('equipment:',v_equipment.id,':due:',v_due,':',v_profile.id),
        jsonb_build_object('equipment_code',v_equipment.equipment_code,'due_date',v_due)
      );
      if v_result is not null then v_count:=v_count+1; end if;
    end loop;
  end loop;
  return v_count;
end;
$$;
grant execute on function public.qpc_refresh_due_equipment_notifications() to authenticated;

-- Habilita las inserciones en tiempo real sin fallar al repetir la migración.
do $$
begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime')
     and not exists(
       select 1 from pg_publication_tables
       where pubname='supabase_realtime' and schemaname='public' and tablename='qpc_notifications'
     ) then
    alter publication supabase_realtime add table public.qpc_notifications;
  end if;
end $$;

commit;
