-- Quality Project Control MAIN V10.2 · Fase 23
-- Preferencias y suscripciones para notificaciones del dispositivo.

begin;

alter table public.permissions
  add column if not exists updated_at timestamptz not null default now();
alter table public.role_permissions
  add column if not exists updated_at timestamptz not null default now();

insert into public.permissions(code,name,description,category,sort_order,created_at,updated_at)
values
  ('notifications.device.manage','Configurar notificaciones del dispositivo','Permite activar, desactivar y configurar notificaciones del navegador para el usuario actual.','general',27,now(),now())
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
join public.permissions p on p.code='notifications.device.manage'
on conflict (role,permission_id) do update
set allowed=true,updated_at=now();

create table if not exists public.qpc_notification_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  enabled boolean not null default false,
  categories jsonb not null default jsonb_build_object(
    'INSPECTION',true,
    'REPORT',true,
    'EQUIPMENT',true,
    'USER',true,
    'GENERAL',true
  ),
  show_preview boolean not null default true,
  sound_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.qpc_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth_key text not null,
  device_label text,
  user_agent text,
  enabled boolean not null default true,
  failure_count integer not null default 0,
  last_success_at timestamptz,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists qpc_push_subscriptions_user_idx
  on public.qpc_push_subscriptions(user_id,enabled);

alter table public.qpc_notification_preferences enable row level security;
alter table public.qpc_push_subscriptions enable row level security;

drop policy if exists qpc_notification_preferences_select_own on public.qpc_notification_preferences;
create policy qpc_notification_preferences_select_own
on public.qpc_notification_preferences for select
to authenticated
using (user_id=auth.uid());

drop policy if exists qpc_notification_preferences_insert_own on public.qpc_notification_preferences;
create policy qpc_notification_preferences_insert_own
on public.qpc_notification_preferences for insert
to authenticated
with check (user_id=auth.uid());

drop policy if exists qpc_notification_preferences_update_own on public.qpc_notification_preferences;
create policy qpc_notification_preferences_update_own
on public.qpc_notification_preferences for update
to authenticated
using (user_id=auth.uid())
with check (user_id=auth.uid());

drop policy if exists qpc_push_subscriptions_select_own on public.qpc_push_subscriptions;
create policy qpc_push_subscriptions_select_own
on public.qpc_push_subscriptions for select
to authenticated
using (user_id=auth.uid());

drop policy if exists qpc_push_subscriptions_insert_own on public.qpc_push_subscriptions;
create policy qpc_push_subscriptions_insert_own
on public.qpc_push_subscriptions for insert
to authenticated
with check (user_id=auth.uid());

drop policy if exists qpc_push_subscriptions_update_own on public.qpc_push_subscriptions;
create policy qpc_push_subscriptions_update_own
on public.qpc_push_subscriptions for update
to authenticated
using (user_id=auth.uid())
with check (user_id=auth.uid());

drop policy if exists qpc_push_subscriptions_delete_own on public.qpc_push_subscriptions;
create policy qpc_push_subscriptions_delete_own
on public.qpc_push_subscriptions for delete
to authenticated
using (user_id=auth.uid());

grant select,insert,update on public.qpc_notification_preferences to authenticated;
grant select,insert,update,delete on public.qpc_push_subscriptions to authenticated;

create or replace function public.qpc_notification_for_current_user(p_notification_id uuid)
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
  where n.id=p_notification_id
    and n.recipient_id=auth.uid()
    and n.archived_at is null
  limit 1;
$$;

grant execute on function public.qpc_notification_for_current_user(uuid) to authenticated;

comment on table public.qpc_push_subscriptions is
  'Suscripciones Web Push por usuario y dispositivo. No contiene contraseñas ni secretos VAPID.';
comment on table public.qpc_notification_preferences is
  'Preferencias del usuario para replicar en el dispositivo las notificaciones de la bandeja interna.';

commit;
