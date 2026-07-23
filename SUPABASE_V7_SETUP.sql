
-- Quality Project Control V7.0 soporte Supabase
-- Ejecutar en SQL Editor del proyecto MAIN.

alter table public.profiles add column if not exists avatar_data_url text;
alter table public.profiles add column if not exists updated_at timestamptz not null default now();

create table if not exists public.login_directory (
  email text primary key,
  full_name text not null,
  role text not null,
  is_active boolean not null default true,
  updated_at timestamptz not null default now()
);

insert into public.login_directory(email, full_name, role, is_active)
select email, full_name, role, is_active from public.profiles
on conflict (email) do update set
  full_name=excluded.full_name,
  role=excluded.role,
  is_active=excluded.is_active,
  updated_at=now();

alter table public.login_directory enable row level security;
drop policy if exists "anon_read_login_directory" on public.login_directory;
create policy "anon_read_login_directory" on public.login_directory
for select to anon, authenticated using (is_active = true);

-- Permitir que cada usuario actualice su nombre/foto; Calidad con Edge Function administra otros perfiles.
drop policy if exists "authenticated_update_own_profile" on public.profiles;
create policy "authenticated_update_own_profile" on public.profiles
for update to authenticated
using (id = auth.uid())
with check (id = auth.uid());

grant select on public.login_directory to anon, authenticated;
grant select, update on public.profiles to authenticated;
