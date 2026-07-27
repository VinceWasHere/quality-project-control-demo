# Validación V8.9.0

## Validaciones ejecutadas antes del empaquetado

- `node --check app.bundle.js`: aprobado.
- Referencias de caché de `index.html`: 8.9.0.
- SQL incluido en raíz y en `supabase/migrations/20260725_008_report_content.sql`.
- README acumulativo: versión más reciente primero.
- No se agregó ninguna Edge Function ni secreto.

## Validación requerida en el proyecto real

Después de ejecutar el SQL y publicar en Vercel:

1. Confirmar que aparece **Contenido de informes**.
2. Crear, editar, visualizar y archivar registros.
3. Probar carga de imagen y PDF.
4. Probar periodos semanal y mensual.
5. Generar PDF completo y PPTX editable.
6. Confirmar RLS con un usuario sin permiso de edición.
7. Confirmar que IT puede consultar y gestionar todo.
