# Notas de fuente

## V9.7 · Fase 18
- El reloj usa la zona horaria guardada en `qpc_projects.timezone`; por defecto, `America/Santo_Domingo`.
- La comparación trabaja sobre snapshots inmutables creados por la Fase 17.
- No modifica publicaciones ni el contenido actual del periodo.

## V9.8 · Fase 19
- `supabase/migrations/20260727_019_report_validation_gate.sql`: checklist, permisos, excepción y bloqueo de publicación.
- `app.bundle.js`: panel y modal de validación agregados al módulo Contenido de informes.
