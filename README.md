# Quality Project Control — MAIN

## Versión 7.0

Rama principal conectada a Supabase. Esta versión parte de V6.14 y agrega un refactor incremental para administración real de usuarios, proyectos, documentos, equipos, mapeos, exportaciones y flujo de inspecciones.

### Cambios V7.0

- Login con campo buscable tipo dropdown usando los correos registrados.
- Se elimina el recuadro de usuarios demo; queda solo la nota: cuentas `.demo` usan contraseña `12345678`.
- Administración de usuarios con contraseña inicial o restablecimiento mediante Edge Function segura.
- Perfil personal editable: nombre visible e imagen de perfil ligera.
- Cambio/restauración de contraseña reservado a cuentas autorizadas del Departamento de Calidad.
- Ejecución solo solicita liberación; seguimiento y cierre son iniciados por Calidad.
- Exportaciones PDF ahora se abren primero en el visor integrado; el usuario descarga después de revisar.
- Exportables PDF con estructura visual corporativa: logo CODELPA, código FO, encabezados y tablas limpias inspiradas en FO-CP-10/FO-CP-11.
- Equipos, instructivos, mapeos y proyectos quedan dentro del estado compartido de Supabase (`app_state`) y sus archivos se mantienen en Storage/Base según flujo existente.
- Equipos se editan en la misma fila, sin saltar al inicio de la página.
- Estado de equipos se calcula con fecha de verificación/calibración + frecuencia.
- Instructivos calculan estado automáticamente: `Pendiente de cargar` si no hay archivo; `Disponible` si hay archivo.
- Actividad relacionada de instructivos ahora es dropdown de talleres disponibles.
- Resaltador de mapeos usa baja opacidad y composición que conserva legibilidad.
- Proyectos muestran nombre completo; códigos cortos quedan internos para codificación.
- Calidad y gerentes pueden crear proyectos.
- Código de inspección: `I-LLC-260724`.
- Código secuencial de cierre por proyecto e inspector: ejemplo `VP0001`.
- Limpieza de código mediante módulo V7 centralizado, normalización de estado y eliminación de nuevos `scrollTo` en editables.

### SQL requerido V7.0

Ejecutar `SUPABASE_V7_SETUP.sql` en Supabase SQL Editor.

### Edge Function requerida

Para crear usuarios con contraseña en MAIN, desplegar `supabase/functions/admin-create-user/index.ts` y configurar `SUPABASE_SERVICE_ROLE_KEY` como secreto de la función. Sin esta función, la UI muestra el formulario, pero Supabase no permitirá crear usuarios autenticables desde el navegador.

### Historial acumulado

Este README conserva el historial de la rama y debe continuar ampliándose en cada versión futura.

## Versiones previas

- V6.14: corrección definitiva de lectura segura de `decision` en login/dashboard.
- V6.13: estabilización del arranque de Supabase Auth.
- V6.12: permisos de menús, semáforo de equipos por fila y calificaciones robustas.
- V6.11: puntos débiles con objetivo asignado y login demo restaurado.
- V6.10: visor universal y puntos débiles semanales.
- V6.9: administración inicial, exportaciones agrupadas, equipos CRUD, instructivos y visor.
- V6.8: responsive móvil.
- V6.7: Supabase Storage para adjuntos.
- V6.6: adjuntos visibles para Calidad.
- V6.0–V6.5: conexión inicial a Supabase, autenticación y eliminación de ejemplos en MAIN.
