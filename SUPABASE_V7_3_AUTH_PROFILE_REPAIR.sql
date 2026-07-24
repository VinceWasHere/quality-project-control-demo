-- Quality Project Control V7.3
-- Corrige la creación incompleta de usuarios de Supabase Auth y habilita el rol IT.
-- Ejecutar una sola vez en Supabase SQL Editor.

-- 1) Asegurar columnas utilizadas por la aplicación.
alter table public.profiles add column if not exists avatar_data_url text;
alter table public.profiles add column if not exists updated_at timestamptz not null default now();

-- 2) Eliminar restricciones CHECK antiguas sobre el rol que no contemplen IT.
do $$
declare
  constraint_row record;
begin
  for constraint_row in
    select conname
    from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%role%'
  loop
    execute format('alter table public.profiles drop constraint %I', constraint_row.conname);
  end loop;
end $$;

alter table public.profiles
  add constraint profiles_role_check
  check (role in (
    'EJECUCION',
    'CALIDAD',
    'COORDINADOR_CALIDAD',
    'GERENCIA',
    'PRESIDENTE',
    'IT'
  ));

-- 3) Asegurar el directorio usado por el combobox del login.
create table if not exists public.login_directory (
  email text primary key,
  full_name text not null,
  role text not null,
  is_active boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.login_directory enable row level security;
drop policy if exists "anon_read_login_directory" on public.login_directory;
create policy "anon_read_login_directory"
on public.login_directory
for select
to anon, authenticated
using (is_active = true);

grant select on public.login_directory to anon, authenticated;

-- 4) Reparar el usuario IT ya creado en auth.users pero sin perfil.
--    Toma los proyectos del Presidente para conceder acceso inicial a todos
--    los proyectos actualmente registrados en perfiles.
insert into public.profiles (
  id,
  legacy_id,
  full_name,
  email,
  role,
  execution_area,
  project_ids,
  is_active,
  updated_at
)
select
  auth_user.id,
  'it-' || left(replace(auth_user.id::text, '-', ''), 12),
  coalesce(nullif(auth_user.raw_user_meta_data ->> 'full_name', ''), 'Tecnología CODELPA'),
  lower(auth_user.email),
  'IT',
  null,
  coalesce(
    (select project_ids from public.profiles where role = 'PRESIDENTE' and is_active = true limit 1),
    (select project_ids from public.profiles where is_active = true limit 1)
  ),
  true,
  now()
from auth.users auth_user
where lower(auth_user.email) = lower('tecnologia@codelpa.demo')
on conflict (id) do update set
  full_name = excluded.full_name,
  email = excluded.email,
  role = 'IT',
  execution_area = null,
  project_ids = coalesce(excluded.project_ids, public.profiles.project_ids),
  is_active = true,
  updated_at = now();

-- 5) Mantener el correo en el combobox del login.
insert into public.login_directory (
  email,
  full_name,
  role,
  is_active,
  updated_at
)
select
  lower(profile.email),
  profile.full_name,
  profile.role,
  profile.is_active,
  now()
from public.profiles profile
where lower(profile.email) = lower('tecnologia@codelpa.demo')
on conflict (email) do update set
  full_name = excluded.full_name,
  role = excluded.role,
  is_active = excluded.is_active,
  updated_at = now();

-- 6) Verificación final: debe devolver una fila con profile_id, role IT y activo true.
select
  auth_user.id as auth_id,
  auth_user.email,
  profile.id as profile_id,
  profile.full_name,
  profile.role,
  profile.is_active,
  profile.project_ids
from auth.users auth_user
left join public.profiles profile on profile.id = auth_user.id
where lower(auth_user.email) = lower('tecnologia@codelpa.demo');
