-- Quality Project Control V7.1
-- Amplía el bucket privado para instructivos y permite que Calidad gestione archivos.

update storage.buckets
set file_size_limit = 52428800,
    allowed_mime_types = array[
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
where id = 'qpc-attachments';

-- Mantiene la subida dentro de la carpeta del usuario autenticado.
drop policy if exists "qpc_users_upload_own_attachments" on storage.objects;
create policy "qpc_users_upload_own_attachments"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'qpc-attachments'
  and (storage.foldername(name))[2] = auth.uid()::text
);

-- Calidad y Gerencia de Calidad pueden retirar instructivos aunque los haya subido otra cuenta.
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
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('CALIDAD','COORDINADOR_CALIDAD')
        and p.is_active = true
    )
  )
);
