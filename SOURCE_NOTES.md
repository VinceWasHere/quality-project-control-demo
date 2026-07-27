
## V9.6 · Fase 17
La biblioteca de publicaciones usa snapshots JSON inmutables. Los archivos físicos no se duplican; el snapshot conserva sus referencias de Storage y la restauración reutiliza los `file_id` activos.
