-- Ejecutar una sola vez en Supabase SQL Editor
create table if not exists public.app_state (
  id text primary key,
  payload jsonb not null default '{"version":6,"users":[],"inspections":[],"customMappings":[],"customDocuments":[]}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.app_state enable row level security;

drop policy if exists "authenticated_read_app_state" on public.app_state;
create policy "authenticated_read_app_state"
on public.app_state for select
to authenticated
using (true);

drop policy if exists "authenticated_insert_app_state" on public.app_state;
create policy "authenticated_insert_app_state"
on public.app_state for insert
to authenticated
with check (true);

drop policy if exists "authenticated_update_app_state" on public.app_state;
create policy "authenticated_update_app_state"
on public.app_state for update
to authenticated
using (true)
with check (true);

insert into public.app_state (id, payload)
values ('main', '{"version":6,"users":[],"inspections":[],"customMappings":[],"customDocuments":[]}'::jsonb)
on conflict (id) do update set payload = excluded.payload, updated_at = now();
