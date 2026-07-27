# Despliegue MAIN V9.6 — Fase 17

## Objetivo
Agregar una biblioteca de informes publicados con snapshots inmutables, detección de cambios posteriores y reutilización controlada del contenido.

## 1. Supabase
Ejecutar en SQL Editor:

`supabase/migrations/20260727_017_report_publication_library.sql`

No requiere Edge Function nueva.

## 2. GitHub y Vercel
1. Sustituir el contenido del branch `main` por esta carpeta.
2. Confirmar el commit.
3. Esperar el despliegue de Vercel.
4. Hacer una recarga sin caché.

## 3. Prueba
1. Abrir **Contenido de informes**.
2. Aprobar y publicar un informe.
3. Abrir **Biblioteca de informes publicados**.
4. Confirmar que aparece la versión oficial.
5. Editar posteriormente un registro y pulsar **Actualizar**: debe indicar “Cambios posteriores”.
6. Usar una versión publicada como base de otro periodo y verificar que no modifica el snapshot original.

## Seguridad
- Las publicaciones son inmutables en base de datos.
- La lectura respeta proyecto y permiso `reports.library.view`.
- La reutilización exige `reports.library.restore`.
- IT conserva todos los permisos.
