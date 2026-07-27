# Validación V9.0

Validaciones efectuadas antes del empaquetado:

- `node --check app.bundle.js` sin errores de sintaxis.
- Referencias de caché actualizadas a `9.0.0`.
- Presencia de normalización de archivos y anotaciones.
- Presencia del módulo Integridad de datos.
- Presencia de divisores corporativos en PPTX.
- ZIP probado mediante `unzip -t`.

La validación definitiva de SQL, RLS, Storage y datos reales debe realizarse en el proyecto Supabase del usuario.
