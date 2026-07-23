V6.7 MAIN · SUPABASE STORAGE

1. Ejecute SUPABASE_STORAGE_V67.sql en Supabase SQL Editor.
2. Reemplace los archivos del branch main por esta versión.
3. Los adjuntos nuevos se guardan en el bucket privado qpc-attachments.
4. app_state guarda únicamente metadatos y rutas; ya no guarda los archivos Base64.
5. Límite configurado: 50 MB por archivo.
6. Los adjuntos antiguos Base64 siguen abriendo para conservar compatibilidad.
