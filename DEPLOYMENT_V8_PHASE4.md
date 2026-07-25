# Despliegue MAIN V8.3 · Fase 4

Esta fase requiere una migración SQL, una Edge Function nueva y la publicación normal en GitHub/Vercel.

## 1. Ejecutar SQL

En Supabase:

1. Abrir **SQL Editor**.
2. Crear una consulta nueva.
3. Copiar el contenido de `SUPABASE_V8_3_PHASE4.sql`.
4. Ejecutar **Run**.
5. Confirmar que la consulta final muestre registros para equipos, instructivos, mapeos y archivos.

La migración es idempotente y conserva `app_state` como respaldo histórico.

## 2. Desplegar Edge Function

En **Supabase → Edge Functions → Deploy a new function → Via Editor**:

- Nombre exacto: `asset-workflow`
- Código: `supabase/functions/asset-workflow/index.ts`
- **Verify JWT:** desactivado.

La función no queda abierta: valida internamente el token de sesión, el perfil activo, el acceso al proyecto y cada permiso granular.

## 3. Publicar GitHub / Vercel

1. Reemplazar el contenido del branch `main` por esta carpeta.
2. Confirmar el commit en GitHub.
3. Esperar el despliegue automático de Vercel.
4. Abrir la aplicación y hacer una recarga sin caché.

## 4. Pruebas mínimas

### Equipos

1. Abrir **Verificación de equipos**.
2. Confirmar que aparecen los registros migrados.
3. Editar un equipo sin perder la posición vertical.
4. Pulsar **Verificar hoy** y confirmar que cambia la fecha y el semáforo.
5. Importar el FO-GC-23 y confirmar que un código existente se actualiza, no se duplica.

### Instructivos

1. Abrir **Instructivos**.
2. Cargar una versión nueva, por ejemplo `IT-CP-04 V09`.
3. Confirmar que V09 queda Vigente y V08 Obsoleto.
4. Visualizar el archivo dentro del visor.
5. Borrar una versión y confirmar que no reaparece al recargar.

### Mapeos

1. Abrir **Mapeos**.
2. Crear un mapeo seleccionando bloque, nivel y área.
3. Confirmar el código automático `MAP-<PROYECTO>-<BLOQUE>-<NIVEL> · Vxx`.
4. Modificar el mismo mapeo y confirmar que no se duplica.
5. Crear una versión superior y confirmar que la anterior queda Obsoleta.

### Favicon

- Confirmar que la pestaña del navegador muestra una **C** a la izquierda del título.
- Si aparece el icono anterior, recargar sin caché o cerrar y volver a abrir la pestaña.
