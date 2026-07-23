V6.7 DEMO-GITHUB · ESTÁTICA

- No usa Supabase ni ningún backend.
- Conserva usuarios, inspecciones y datos de ejemplo.
- Los adjuntos se almacenan como Base64 en el navegador.
- Límite ampliado a 5 MB por archivo y 12 MB por solicitud.
- Este límite es necesario porque localStorage no es apropiado para archivos grandes.
