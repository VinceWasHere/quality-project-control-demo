-- Quality Project Control V6.7
-- Bucket privado para fotografías y documentos adjuntos.
-- Ejecutar una sola vez en Supabase > SQL Editor.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'qpc-attachments',
  'qpc-attachments',
  false,
  52428800,
  array['image/jpeg','image/png','image/webp','image/gif','application/pdf']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- Todo usuario autenticado puede ver/descargar adjuntos. Esto permite que
-- Ejecución, Calidad, Coordinación, Gerencia y Presidencia consulten recursos.
drop policy if exists "qpc_authenticated_read_attachments" on storage.objects;
create policy "qpc_authenticated_read_attachments"
on storage.objects
for select
to authenticated
using (bucket_id = 'qpc-attachments');

-- Cada usuario solo puede subir dentro de su propia carpeta:
-- proyecto / auth.uid() / inspección / archivo
drop policy if exists "qpc_users_upload_own_attachments" on storage.objects;
create policy "qpc_users_upload_own_attachments"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'qpc-attachments'
  and (storage.foldername(name))[2] = auth.uid()::text
);

-- Permite reemplazar archivos propios si luego se agrega esa función.
drop policy if exists "qpc_users_update_own_attachments" on storage.objects;
create policy "qpc_users_update_own_attachments"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'qpc-attachments'
  and (storage.foldername(name))[2] = auth.uid()::text
)
with check (
  bucket_id = 'qpc-attachments'
  and (storage.foldername(name))[2] = auth.uid()::text
);

-- Permite eliminar únicamente los archivos propios.
drop policy if exists "qpc_users_delete_own_attachments" on storage.objects;
create policy "qpc_users_delete_own_attachments"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'qpc-attachments'
  and (storage.foldername(name))[2] = auth.uid()::text
);
