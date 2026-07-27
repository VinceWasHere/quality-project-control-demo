# Despliegue MAIN V9.7 — Fase 18

## Objetivo
Agregar comparación de versiones oficiales publicadas y un reloj vivo, visible para todos los usuarios.

## 1. Supabase
Ejecutar en SQL Editor:

`supabase/migrations/20260727_018_report_comparison_and_clock.sql`

No requiere Edge Function nueva.

## 2. GitHub y Vercel
1. Eliminar/reemplazar el contenido actual del branch `main` con esta carpeta.
2. Confirmar el commit.
3. Esperar el despliegue automático de Vercel.
4. Hacer una recarga sin caché.

## 3. Pruebas
### Reloj
1. Abrir el login y confirmar que aparecen día, fecha y hora.
2. Iniciar sesión y confirmar que el reloj aparece en la cabecera.
3. Cambiar de proyecto y confirmar que usa la zona horaria configurada.
4. Revisar PC y teléfono.

### Comparación
1. Abrir **Contenido de informes**.
2. Confirmar el panel **Comparar versiones publicadas**.
3. Seleccionar dos versiones diferentes.
4. Revisar agregados, eliminados, modificados, evidencias y láminas.
5. Descargar el CSV de comparación.
6. Descargar un snapshot JSON.
7. Revisar la acción en Auditoría.

## Seguridad
- La lectura sigue las políticas de la biblioteca de publicaciones.
- La comparación requiere `reports.library.compare`.
- La exportación JSON requiere `reports.library.export_snapshot`.
- IT conserva todos los permisos.
