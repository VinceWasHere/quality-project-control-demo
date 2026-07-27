# MAIN V9.1 — Fase 12

## Incluye
- Corrección de layout en "Contenido de informes".
- Resolución/reintento de incidencias `LEGACY_BASE64_MAPPING_ANNOTATION`.
- Desglose visible de los puntos descontados por visita.

## Pasos
1. Ejecutar `SUPABASE_V9_1_PHASE12.sql (corregido V2)` en Supabase SQL Editor.
2. Sustituir el branch `main` por los archivos de `qpc_v910_phase12_app`.
3. Esperar despliegue de Vercel.
4. Hacer recarga sin caché.

## Validación rápida
- `Contenido de informes` debe mostrar los contadores en tarjetas/chips con separación correcta.
- `Integridad de datos` debe reducir o permitir resolver las incidencias legacy.
- En el detalle de una visita deben aparecer los criterios con descuento, puntos perdidos y observación.


## Nota
El archivo `SUPABASE_V9_1_PHASE12.sql` incluido ya corresponde a la versión corregida V2.
