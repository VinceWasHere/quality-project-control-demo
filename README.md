# Quality Project Control — MAIN

## Versión 7.1

Rama principal conectada a Supabase. V7.1 corrige y optimiza la biblioteca de instructivos sin eliminar el historial anterior.

### Cambios V7.1

- Las tarjetas de instructivos se ordenan siempre alfabéticamente por nombre; dentro del mismo nombre/código se muestra primero la versión más alta.
- Versionado inteligente: al registrar `IT-CP-04 V09`, la `V09` queda como **Vigente** y la `V08` pasa automáticamente a **Obsoleto**.
- El archivo y la vigencia se muestran como estados separados: **Disponible / Pendiente de cargar** y **Vigente / Obsoleto**.
- La creación de una versión nueva ya no sobrescribe la versión anterior.
- Se corrige la eliminación: los registros cargados se borran realmente; las referencias iniciales pueden ocultarse sin reaparecer después de sincronizar.
- Se elimina el uso de archivos Base64 completos dentro de atributos HTML, reduciendo drásticamente el tiempo de los clics en **Visualizar** y **Borrar**.
- Los instructivos nuevos se almacenan en Supabase Storage; los Base64 heredados se migran en segundo plano cuando sea posible.
- Se reemplaza el `confirm()` bloqueante por una confirmación interna no bloqueante.
- La persistencia se difiere hasta después del repintado para evitar alertas de interacción lenta de Chrome.
- La edición utiliza controles propios de V7.1 y no activa los manejadores antiguos que enviaban la página al inicio.
- Se incluye `SUPABASE_V7_1_DOCUMENT_STORAGE.sql` para ampliar formatos admitidos y permitir a Calidad retirar archivos de Storage.

### SQL requerido V7.1

Ejecutar `SUPABASE_V7_1_DOCUMENT_STORAGE.sql` en Supabase SQL Editor antes de cargar Word, Excel o PowerPoint. Para PDF e imágenes, el bucket existente continúa funcionando.

---

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

---

# Versión 7.2 — 24 de julio de 2026

## Rama MAIN — Supabase

### Correcciones de experiencia de usuario

- La edición de equipos permanece junto a la fila seleccionada y conserva la posición vertical de la página.
- El mismo patrón contextual se aplica a usuarios, proyectos, instructivos y mapeos.
- Se añadió una barra horizontal superior y fija dentro del área de cada tabla ancha. Esta barra se sincroniza con la tabla y evita tener que bajar hasta el final para desplazarse lateralmente.
- La cantidad de equipos visibles puede configurarse en 50, 100, 250, 500 o todos los registros filtrados.

### Perfil de usuario

- La imagen de perfil se comprime a un tamaño ligero antes de guardarse.
- La imagen se muestra en Mi perfil, en la cabecera superior y en el panel lateral.
- El nombre visible y la imagen se guardan en `profiles` y permanecen después de recargar o cambiar de sección.
- Restaurar imagen elimina el avatar personalizado tanto de la interfaz como de Supabase.

### Login

- El selector nativo/datalist fue sustituido por un combobox propio de la aplicación.
- El usuario puede escribir para filtrar los correos registrados.
- El listado se ordena alfabéticamente y muestra correo y rol.
- Los usuarios creados desde Usuarios y permisos aparecen en el listado de login.
- Se mantiene la nota: las cuentas `.demo` usan la contraseña `12345678`.

### Roles y permisos

Se añadió el rol `IT` — Tecnología, con acceso total a todas las secciones y operaciones.

Matriz de administración de usuarios:

- Ingeniero de Calidad: crea y administra Ingenieros de Ejecución.
- Gerente de Calidad: crea y administra Ingenieros de Calidad e Ingenieros de Ejecución.
- Gerente de Proyecto: crea y administra Gerentes de Proyecto, Gerentes de Calidad, Ingenieros de Calidad e Ingenieros de Ejecución.
- Presidente: crea y administra cualquier rol, incluyendo Presidente e IT.
- IT: crea y administra cualquier rol.

Las contraseñas iniciales pueden asignarse al crear cuentas. El cambio o restablecimiento de contraseñas existentes queda limitado a Calidad, Gerencia de Calidad e IT.

### Proyectos

- CRUD completo de proyectos desde Usuarios y permisos → Gestionar proyectos.
- Creación, edición, activación y eliminación de proyectos.
- Configuración jerárquica de bloques, niveles y áreas.
- Se incorporó una estructura inicial editable para Lopesan La Ceiba:
  - Bloque A: sótano y niveles 01–04.
  - Bloque B: sótano y niveles 01–05.
  - Bloque C: nivel 01 de doble altura y niveles 03–06.
  - Bloque D: sótano y niveles 01–05.
  - Bloques E, F, G, H y J creados para completar manualmente.
- Los proyectos nuevos pueden configurarse totalmente desde cero.

### Mapeos

- Crear, modificar, visualizar y borrar mapeos.
- La edición permanece debajo de la tarjeta seleccionada.
- Los mapeos personalizados sustituyen la ubicación equivalente y evitan duplicados visuales.
- Código automático con el formato `MAP-<SIGLAS PROYECTO>-<BLOQUE>-<NIVEL>`; ejemplo: `MAP-LLC-D1-N02`.
- Versión separada con formato `V01`, `V02`, `V03`, etc.
- Bloque, nivel y área se seleccionan desde la estructura configurada del proyecto.
- En MAIN, el archivo completo se aloja en Supabase Storage; se conserva una miniatura ligera para las tarjetas y el resaltador.
- Los archivos privados se abren con URL firmada dentro del visor interno.

### Equipos

- Edición contextual sin salto al inicio de la página.
- Un ID ya existente se actualiza en lugar de generar un registro duplicado.
- Selector para mostrar más de 250 registros o todos los resultados.
- Semáforo calculado según frecuencia y fechas; las observaciones no controlan el estado.

### Instructivos

- El editor aparece junto a la tarjeta seleccionada.
- Se conserva el sistema de versiones Vigente/Obsoleto de V7.1.
- Los archivos continúan alojados en Supabase Storage.

### Archivos incluidos para Supabase

- `SUPABASE_V7_2_SETUP.sql`
- `supabase/functions/admin-create-user/index.ts`
- `admin-create-user_index.ts`

### Despliegue requerido

1. Ejecutar `SUPABASE_V7_2_SETUP.sql` en Supabase SQL Editor.
2. Reemplazar el contenido de la Edge Function `admin-create-user` con la versión V7.2 y desplegarla.
3. Publicar los archivos de esta carpeta en el branch `main`.
4. Crear el usuario IT desde una cuenta Presidente. Correo sugerido: `tecnologia@codelpa.demo`; contraseña demo: `12345678`.

### Optimización y estabilidad

- Nuevas funciones agrupadas en `v72.js`, cargadas después de las capas anteriores.
- Intercepción en fase de captura para neutralizar manejadores antiguos que desplazaban la página al inicio.
- Renderizado contextual con restauración de posición.
- Deduplicación de mapeos por proyecto, bloque, nivel y área.
- Tablas mejoradas mediante una única rutina reutilizable.
- Avatares comprimidos antes de persistirlos.

