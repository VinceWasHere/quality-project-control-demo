-- Quality Project Control V7.2
-- Ejecutar una vez en Supabase SQL Editor para la rama MAIN.

-- Avatar ligero del perfil (idempotente si ya se ejecutó V7.0).
alter table public.profiles add column if not exists avatar_data_url text;
alter table public.profiles add column if not exists updated_at timestamptz not null default now();

-- Directorio público limitado a correos activos para el combobox del login.
create table if not exists public.login_directory (
  email text primary key,
  full_name text not null,
  role text not null,
  is_active boolean not null default true,
  updated_at timestamptz not null default now()
);

insert into public.login_directory(email, full_name, role, is_active)
select lower(email), full_name, role, is_active
from public.profiles
where email is not null
on conflict (email) do update set
  full_name=excluded.full_name,
  role=excluded.role,
  is_active=excluded.is_active,
  updated_at=now();

alter table public.login_directory enable row level security;
drop policy if exists "anon_read_login_directory" on public.login_directory;
create policy "anon_read_login_directory"
on public.login_directory
for select
to anon, authenticated
using (is_active = true);

grant select on public.login_directory to anon, authenticated;

-- Cada usuario puede editar únicamente su propio nombre/foto.
drop policy if exists "authenticated_update_own_profile" on public.profiles;
create policy "authenticated_update_own_profile"
on public.profiles
for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

grant select, update on public.profiles to authenticated;

-- Storage privado para adjuntos, instructivos y mapeos.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'qpc-attachments',
  'qpc-attachments',
  false,
  52428800,
  array[
    'image/jpeg','image/png','image/webp','image/gif','image/svg+xml',
    'application/pdf','text/plain','text/csv',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/octet-stream'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Todo usuario autenticado puede visualizar archivos mediante URL firmada.
drop policy if exists "qpc_authenticated_read_attachments" on storage.objects;
create policy "qpc_authenticated_read_attachments"
on storage.objects
for select
to authenticated
using (bucket_id = 'qpc-attachments');

drop policy if exists "qpc_users_upload_own_attachments" on storage.objects;
create policy "qpc_users_upload_own_attachments"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'qpc-attachments'
  and (storage.foldername(name))[2] = auth.uid()::text
);

-- Calidad e IT pueden borrar instructivos/mapeos alojados por otras cuentas.
drop policy if exists "qpc_quality_delete_documents" on storage.objects;
create policy "qpc_quality_delete_documents"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'qpc-attachments'
  and (
    (storage.foldername(name))[2] = auth.uid()::text
    or exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role in ('CALIDAD','COORDINADOR_CALIDAD','IT')
        and p.is_active = true
    )
  )
);

-- Nota: el usuario IT de MAIN debe crearse desde Usuarios y permisos usando
-- una cuenta Presidente, después de desplegar admin-create-user V7.2.
-- Sugerencia: tecnologia@codelpa.demo / contraseña demo 12345678.
