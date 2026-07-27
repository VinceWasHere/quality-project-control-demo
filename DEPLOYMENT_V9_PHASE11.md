# Despliegue MAIN V9.0 — Fase 11

## 1. Respaldo recomendado

Antes de ejecutar la migración:

1. Exporte `public.app_state` desde Supabase.
2. Verifique que V8.9 está publicada y funcional.
3. No elimine archivos de Storage manualmente.

## 2. Ejecutar SQL

En Supabase:

1. Abra **SQL Editor**.
2. Cree una consulta nueva.
3. Pegue todo `SUPABASE_V9_0_PHASE11.sql`.
4. Pulse **Run**.

Al finalizar deben aparecer:

- el resumen `qpc_data_integrity_summary`;
- las incidencias agrupadas por código y estado.

Los registros Base64 históricos se conservan y se reportan como incidencias. El script no los elimina.

## 3. Publicar GitHub/Vercel

1. Copie el contenido de `qpc_v900_phase11` al branch `main`.
2. Confirme el commit.
3. Espere el despliegue automático de Vercel.
4. Realice una recarga sin caché.

No se crea ni actualiza ninguna Edge Function en esta fase.

## 4. Pruebas mínimas

### Recursos

1. Cree una solicitud con fotografía y PDF.
2. Entre como Calidad y abra la inspección.
3. Verifique que ambos archivos se visualicen dentro de la app.
4. Confirme que la descarga sea opcional.

### Mapeo marcado

1. Seleccione un mapeo de imagen.
2. Resalte varias veces la misma zona.
3. Confirme que el texto inferior siga legible.
4. Envíe la solicitud.
5. Abra el mapeo marcado desde el detalle.

### Integridad

1. Entre como IT.
2. Abra **Integridad de datos**.
3. Verifique los conteos.
4. Revise cualquier incidencia `LEGACY_BASE64_*`.

### Informes

1. Genere un PPTX semanal.
2. Confirme que no incluya comparativo mensual ni resumen de equipos.
3. Genere un PPTX mensual.
4. Confirme divisores de sección, comparativos y equipos.

## 5. Reversión

Si el frontend presenta un problema:

- revierta el commit en GitHub;
- no necesita revertir el SQL, porque las tablas y vistas son aditivas;
- V8.9 seguirá usando los campos JSON de compatibilidad.
