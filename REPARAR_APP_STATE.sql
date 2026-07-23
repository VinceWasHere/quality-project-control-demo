-- Ejecutar una sola vez en Supabase SQL Editor.
-- Repara la fila inicial, permisos y políticas de app_state.

create table if not exists public.app_state (
  id text primary key,
  payload jsonb not null default '{"version":6,"users":[],"inspections":[],"customMappings":[],"customDocuments":[]}'::jsonb,
  updated_at timestamptz not null default now()
);

insert into public.app_state (id, payload)
values (
  'main',
  '{"version":6,"users":[],"inspections":[],"customMappings":[],"customDocuments":[]}'::jsonb
)
on conflict (id) do nothing;

grant usage on schema public to authenticated;
grant select, insert, update on table public.app_state to authenticated;
grant select on table public.profiles to authenticated;

alter table public.app_state enable row level security;

drop policy if exists "authenticated_read_app_state" on public.app_state;
drop policy if exists "authenticated_insert_app_state" on public.app_state;
drop policy if exists "authenticated_update_app_state" on public.app_state;
drop policy if exists "authenticated_delete_app_state" on public.app_state;

create policy "authenticated_read_app_state"
on public.app_state for select
to authenticated
using (auth.uid() is not null);

create policy "authenticated_insert_app_state"
on public.app_state for insert
to authenticated
with check (auth.uid() is not null);

create policy "authenticated_update_app_state"
on public.app_state for update
to authenticated
using (auth.uid() is not null)
with check (auth.uid() is not null);

-- Verificación: debe devolver una fila con id = main.
select id, updated_at, jsonb_array_length(payload->'inspections') as inspections
from public.app_state
where id = 'main';
