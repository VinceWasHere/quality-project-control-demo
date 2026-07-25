# Quality Project Control — MAIN

Rama principal conectada a Supabase, publicada desde GitHub en Vercel. Este README conserva el historial acumulativo completo y ordena las versiones desde la más reciente hasta la más antigua.

> **Orden del historial:** versión más reciente primero. No eliminar entradas anteriores al publicar una versión nueva.

---

## V8.6.0 · Fase 7 — Integridad de datos y recuperación de calificaciones históricas

Fecha: 25 de julio de 2026.

Esta fase corrige la migración histórica de inspecciones y visitas. La etiqueta `Migrado` no representaba un taller nuevo: aparecía porque la migración conservaba el `template_id`, pero no resolvía su actividad real. También existían inspecciones cerradas con puntuación que no entraban a Calificaciones cuando su visita histórica no había quedado marcada como `FINALIZADA`.

### Catálogo relacional

- Se crean `qpc_workshops`, `qpc_inspection_templates` y `qpc_template_criteria`.
- Se cargan las 22 actividades, las 40 planillas y sus criterios desde el catálogo vigente de la aplicación.
- Inspecciones y visitas reciben `workshop_id` y se relacionan con la planilla real.
- El taller se recupera mediante `template_id`; por ejemplo, `TPL-09` vuelve a mostrarse como `Mampostería`.
- Se revierte el reemplazo visual introducido en V8.5 que convertía `Migrado` en `Sin taller asignado`. La aplicación ahora intenta resolver el nombre verdadero y solo muestra una advertencia cuando el dato no puede reconstruirse.

### Recuperación de inspecciones cerradas

- Se reimportan de forma idempotente las visitas guardadas en `source_snapshot.visitEvaluations`.
- Una visita se reconoce como finalizada cuando tiene `finishedAt`, puntuación final o estado `FINALIZADA`.
- Las inspecciones con puntuación y sin visita finalizada reciben una visita histórica resumida para no desaparecer de Calificaciones.
- Las vistas de reporting incluyen toda inspección con una visita finalizada o con puntuación acumulada.
- Se recalculan los promedios acumulados de la inspección usando todas sus visitas finalizadas.

### Recuperación de criterios y puntos débiles

- Las respuestas guardadas en `answers_snapshot` se materializan en `qpc_visit_answers`.
- Se recuperan respuesta, factor, N/A, puntos obtenidos, puntos perdidos y observación.
- Los puntos débiles vuelven a disponer de detalle histórico cuando el respaldo original contenía respuestas.
- No se inventan criterios para una visita histórica resumida que no tenga respuestas en el respaldo.

### Diagnóstico

- Nueva vista `qpc_reporting_integrity`.
- IT y usuarios con acceso a auditoría reciben una advertencia cuando queden registros pendientes de reconciliar.
- Las inspecciones con puntuación permanecen visibles aun cuando falte detalle de criterios.

### Despliegue

- Ejecutar `SUPABASE_V8_6_PHASE7.sql`.
- No requiere Edge Function nueva.
- Publicar los archivos en `main` y esperar el despliegue automático de Vercel.

---

## V8.5.0 · Fase 6 — Reportes, exportables PPTX y correcciones de interfaz

Fecha: 25 de julio de 2026.

Esta fase corrige problemas visuales de las tablas y prepara la exportación editable de informes corporativos. Continúa usando las vistas relacionales de la Fase 5 y no requiere migración SQL adicional.

### Correcciones de interfaz

- Se elimina la doble barra horizontal que aparecía una encima de otra en Calificaciones.
- Las tablas anchas mantienen una sola barra horizontal superior sincronizada con la tabla.
- Se mejora el estilo de los campos de áreas dentro de la configuración de proyectos para que coincidan con el resto de la aplicación.
- Se evita mostrar el valor técnico `Migrado` como nombre de taller; cuando no exista taller asignado se muestra `Sin taller asignado`.

### Exportaciones

- Los PDF de talleres, ingenieros y puntos débiles agregan una página de gráfico antes de la tabla.
- El informe completo conserva vista previa PDF dentro del visor interno.
- Se agregan páginas preparadas para completar manualmente información que la plataforma no puede inferir por sí sola, como buenas prácticas, NC, capacitaciones y actividades de atención especial.
- Se agrega exportación **PPTX editable** para el informe completo.
- El PPTX genera una estructura semanal `FO-CP-10 V07` o mensual `FO-CP-11 V10`, con portada, agenda, resumen de planillas, gráficos, comparativo por ingenieros, puntos débiles y hojas pendientes para completar con evidencias.

### Dependencias

- Se agrega `pptxgenjs` por CDN para generar PowerPoint editable desde el navegador.

### Archivos de despliegue

- No requiere SQL nuevo.
- No requiere Edge Function nueva.
- Actualizar el branch `main` y esperar el despliegue de Vercel.

---

## V8.4.0 · Fase 5 — Calificaciones, puntos débiles y exportaciones corporativas

Fecha: 25 de julio de 2026.

Esta fase conecta los análisis de Calidad y los exportables con las tablas relacionales de inspecciones, visitas y respuestas. Las vistas de reportes respetan el acceso por proyecto y dejan de depender del JSON compartido para calcular calificaciones.

### Calificaciones

- Nuevas vistas relacionales de reporting para inspecciones, visitas y respuestas.
- Cada inspección pesa una sola vez en el promedio de talleres, ingenieros y áreas, aunque tenga varias visitas.
- Las visitas siguen mostrándose individualmente para trazabilidad.
- Filtros combinables por periodo, Ingeniero de Ejecución, área y taller.
- Periodo semanal de jueves a miércoles y periodo mensual calendario.
- Comparativos por taller, ingeniero y área.
- Línea de objetivo asignado, meta de ingenieros y media general.
- Las tablas anchas incluyen una barra horizontal superior sincronizada con la inferior.

### Puntos débiles

- Funcionan tanto semanal como mensualmente.
- El encabezado cambia automáticamente según el periodo.
- Solo se muestran talleres por debajo de su objetivo asignado.
- Los criterios se calculan con todas las visitas del periodo.
- N/A se registra, pero no suma, no descuenta y se excluye del denominador.
- Se muestran evaluaciones, N/A, fallos, frecuencia, promedio del inciso y puntos perdidos.
- Los incisos por debajo del objetivo se resaltan visualmente.

### Exportaciones

- Categorías unificadas con opciones CSV y vista previa PDF.
- Los PDF no se descargan automáticamente: primero se abren en el visor interno.
- Reporte semanal con código `FO-CP-10 V07`.
- Reporte mensual con código `FO-CP-11 V10`.
- Reporte de equipos con código `FO-GC-23 V05`.
- Portada CODELPA, encabezados, pies, número de página, tablas, semáforos y gráficos.
- Exportables de inspecciones, criterios, talleres, ingenieros, puntos débiles, informe completo y equipos.
- Nueva tabla `qpc_export_runs` y auditoría de cada exportación.

### Base de datos

- Vista `qpc_reporting_inspections`.
- Vista `qpc_reporting_visits`.
- Vista `qpc_reporting_answers`.
- Tabla `qpc_export_runs`.
- Función segura `qpc_log_export()`.
- Las vistas usan `security_invoker` y respetan el RLS de las tablas base.

### Archivos de despliegue

- `SUPABASE_V8_4_PHASE5.sql`.
- `DEPLOYMENT_V8_PHASE5.md`.
- No requiere una Edge Function nueva.

## V8.3.0 · Fase 4 — Equipos, instructivos, mapeos y archivos relacionales

Fecha: 25 de julio de 2026.

Esta fase retira de `app_state` los equipos, instructivos y mapeos operativos. El JSON histórico permanece como respaldo, pero las lecturas y modificaciones activas se realizan en tablas relacionales de Supabase.

### Equipos

- Nueva tabla `qpc_equipment` con código único por proyecto.
- Nueva tabla `qpc_equipment_events` para verificaciones, calibraciones, mantenimiento e importaciones.
- El estado se calcula automáticamente con la frecuencia y las fechas requeridas:
  - Vigente.
  - Próximo.
  - Vencido.
  - Sin información.
- Las observaciones dejan de controlar el semáforo.
- Editar conserva la posición del usuario y muestra el formulario bajo la fila.
- Importar Excel actualiza por código y evita duplicados.
- Paginación de 50, 100, 250, 500 o todos los registros.
- Verificar hoy crea un evento histórico y actualiza la última fecha de verificación.
- Archivar no elimina físicamente el historial del equipo.

### Instructivos

- Nuevas tablas `qpc_instructives` y `qpc_instructive_versions`.
- El archivo se registra en `qpc_files` y permanece privado en Supabase Storage.
- El estado de disponibilidad es calculado:
  - `DISPONIBLE` cuando existe archivo.
  - `PENDIENTE_DE_CARGAR` cuando no existe archivo.
- Al crear una versión nueva, la anterior pasa a Obsoleto sin borrarse.
- Modificar la misma versión sustituye el archivo y conserva la identidad del registro.
- Las tarjetas se ordenan por título y luego por versión descendente.
- La actividad relacionada utiliza las actividades reales de las planillas.
- La eliminación es lógica y queda registrada en auditoría.

### Mapeos

- Nuevas tablas `qpc_mappings`, `qpc_mapping_versions` y `qpc_mapping_annotations`.
- Los mapeos se relacionan con proyecto, bloque, nivel y área.
- El código se genera con la abreviatura real del proyecto, por ejemplo:
  - `MAP-LLC-D1-N02 · V03`.
- Modificar el mapeo seleccionado actualiza esa ubicación y evita duplicados.
- Cambiar el número de versión conserva el historial y vuelve obsoleta la versión anterior.
- Los archivos se almacenan en Storage y se visualizan con URL firmada.
- Las versiones base incluidas en el proyecto se migran como registros relacionales.
- La estructura queda preparada para guardar trazos vectoriales sin alterar el plano original.

### Archivos

- Nueva tabla universal `qpc_files` para metadatos de archivos.
- Los binarios permanecen en el bucket privado `qpc-attachments`.
- La base almacena ruta, nombre, tipo MIME, tamaño, proyecto y usuario que cargó el archivo.
- Los archivos locales incluidos con la aplicación se registran mediante `external_url`.
- Los archivos sustituidos o eliminados se marcan lógicamente antes de retirar el objeto de Storage.

### Interconexión

- `projectDocuments()`, `projectMappings()` y `mappingById()` utilizan los registros relacionales.
- Las inspecciones pueden seleccionar los mapeos vigentes cargados desde Supabase.
- Los recursos de una inspección muestran los instructivos vigentes relacionados con su actividad.
- Los exportables de equipos continúan consumiendo la colección activa, ahora cargada desde `qpc_equipment`.
- Al cambiar de proyecto se recargan equipos, instructivos, mapeos y archivos del proyecto seleccionado.

### Identidad del navegador

- Se añadió un favicon propio de CODELPA con una sola letra **C**.
- Se incluyen versiones SVG, PNG de 64 px y Apple Touch Icon de 180 px.
- El icono aparece a la izquierda del título de la pestaña en navegadores compatibles.

### README

- El historial completo se reorganizó desde la versión más reciente hasta la más antigua.
- Las próximas versiones deben insertarse encima de V8.3 sin borrar el contenido previo.

### Archivos de despliegue V8.3

1. `SUPABASE_V8_3_PHASE4.sql`.
2. `supabase/migrations/20260725_004_assets_equipment_documents_mappings.sql`.
3. `asset-workflow_index.ts`.
4. `supabase/functions/asset-workflow/index.ts`.
5. `DEPLOYMENT_V8_PHASE4.md`.

### Despliegue requerido

1. Ejecutar `SUPABASE_V8_3_PHASE4.sql` en Supabase SQL Editor.
2. Crear y desplegar la Edge Function `asset-workflow` con `Verify JWT` desactivado; la función valida internamente la sesión y los permisos.
3. Publicar esta carpeta en el branch `main` de GitHub.
4. Esperar el despliegue automático de Vercel.
5. Recargar sin caché para visualizar el nuevo favicon y los recursos V8.3.

### Alcance pendiente

- Fase 5: calificaciones, puntos débiles y exportaciones corporativas completamente relacionales.
- Fase 6: responsive final, pruebas automatizadas, eliminación definitiva de dependencias históricas y documentación de producción.

---

## V8.2.0 · Fase 3 — Inspecciones, visitas, puntuación y códigos transaccionales

Fecha: 24 de julio de 2026.

Esta fase migra el flujo principal de inspecciones fuera de `app_state`. Las solicitudes, visitas, respuestas, decisiones, estados y códigos pasan a tablas relacionales con RLS y operaciones atómicas mediante una Edge Function.

### Tablas agregadas

- `qpc_inspections`
- `qpc_inspection_visits`
- `qpc_visit_answers`
- `qpc_inspection_status_history`
- `qpc_inspection_request_sequences`
- `qpc_inspection_closure_sequences`

### Flujo operativo

- Ejecución solo crea solicitudes de **liberación**.
- Calidad toma la solicitud y realiza la visita inicial de liberación.
- Calidad puede iniciar un **seguimiento** sin que Ejecución genere una nueva solicitud.
- Calidad puede iniciar el **cierre** por su cuenta.
- Una visita de cierre finalizada cambia la inspección a `CERRADA` y genera el código de cierre.
- Las visitas anteriores no se sobrescriben.
- Cada visita conserva su puntaje, respuestas, observaciones, tipo e inspector.
- La inspección conserva como resultado actual el promedio de todas las visitas finalizadas.

### Puntuación y N/A

- Las respuestas N/A se excluyen del numerador y del denominador.
- N/A no suma, no descuenta y no se registra como punto débil.
- La puntuación técnica, preparación/visita y final se recalculan en PostgreSQL al finalizar.
- El navegador presenta el resultado, pero la base de datos vuelve a calcularlo para evitar alteraciones del cliente.

### Códigos automáticos

Solicitud:

- `I-LLC-260724`
- `I-LLC-260724-02`

La secuencia es independiente por proyecto y fecha.

Cierre:

- `VP0001`
- `VP0002`

La secuencia es independiente por proyecto e inspector de Calidad. Las iniciales se obtienen del primer nombre y el último componente del nombre visible del inspector.

### Seguridad

- Lectura protegida por RLS y acceso al proyecto.
- Ejecución ve sus solicitudes.
- Calidad y roles autorizados ven las inspecciones del proyecto según permisos.
- Las escrituras se realizan exclusivamente mediante la Edge Function `inspection-workflow`.
- La Edge Function valida el JWT, el perfil activo, acceso al proyecto y permisos efectivos.
- Los RPC sensibles solo pueden ejecutarse con `service_role`.

### Migración

La migración importa de forma no destructiva las inspecciones y visitas existentes desde `app_state`.

- `app_state` no se elimina.
- La copia anterior de inspecciones queda como respaldo.
- Después de esta fase, el frontend ya no vuelve a escribir inspecciones dentro del JSON compartido.
- Equipos, instructivos y mapeos continúan temporalmente en `app_state` hasta la Fase 4.

### Despliegue requerido

1. Ejecutar `SUPABASE_V8_2_PHASE3.sql` o `supabase/migrations/20260724_003_inspections_visits_workflow.sql` en Supabase SQL Editor.
2. Crear la Edge Function `inspection-workflow` con `supabase/functions/inspection-workflow/index.ts`.
3. Configurar la función con `verify_jwt = false`; el código valida explícitamente el token del usuario.
4. Subir el contenido de la carpeta al branch `main`.
5. Esperar el despliegue automático de Vercel y hacer una recarga sin caché.

### Pruebas recomendadas

1. Entrar como Ingeniero de Ejecución y crear una solicitud de liberación.
2. Entrar como Calidad y tomar la solicitud.
3. Completar la visita de liberación usando al menos un N/A.
4. Confirmar que el N/A no reduce el resultado.
5. Iniciar una visita de seguimiento desde el detalle.
6. Confirmar que ambas visitas conservan puntajes separados y que la inspección muestra el promedio.
7. Iniciar cierre, finalizarlo y verificar el código secuencial.
8. Crear dos solicitudes el mismo día y comprobar el sufijo `-02`.
9. Cambiar de proyecto y verificar que sus secuencias sean independientes.

### Alcance pendiente

- Migración relacional de equipos, eventos de calibración y verificación.
- Migración relacional de instructivos y versiones.
- Migración relacional de mapeos, archivos y anotaciones.
- Eliminación definitiva de `app_state` al finalizar las migraciones.
- Motor corporativo completo de reportes y exportaciones.
- Conversión final del bundle a módulos Vite/TypeScript.

---

## V8.1.0 · Fase 2 — Proyectos, ubicaciones, membresías y auditoría

Fecha: 24 de julio de 2026.

Esta fase migra la configuración de proyectos fuera del JSON compartido hacia tablas relacionales dedicadas. La información operativa restante continúa temporalmente en `app_state` hasta las fases posteriores.

### Corrección crítica de Tecnología (IT)

- Tecnología (IT) puede abrir **Usuarios y permisos** sin ser bloqueado por validaciones heredadas.
- El acceso de IT se resuelve antes de ejecutar las guardas antiguas de navegación.
- `user_has_permission_for()` devuelve siempre `true` para un perfil IT activo.
- Todos los permisos actuales y futuros se vuelven a asignar automáticamente al rol IT al ejecutar la migración.
- IT recibe membresía automática en todos los proyectos existentes y nuevos.

### Proyectos relacionales

Se agregan las tablas:

- `qpc_projects`
- `qpc_project_blocks`
- `qpc_project_levels`
- `qpc_project_areas`

Las tablas utilizan los identificadores existentes (`LCE`, `VC`, etc.) para no romper las referencias todavía almacenadas en `app_state`.

### Administración de proyectos

- Crear proyectos con nombre completo, ID interno y abreviatura.
- Modificar descripción y zona horaria.
- Archivar y restaurar sin borrar físicamente.
- Crear, modificar y retirar bloques.
- Crear, modificar y retirar niveles.
- Crear, modificar y retirar áreas.
- Edición contextual debajo de la fila seleccionada.
- Guardado atómico mediante la Edge Function `admin-project-management`.
- Auditoría de creación, modificación, archivo y restauración.

### Interconexión

- El selector general de proyecto usa los proyectos relacionales accesibles para el usuario.
- Las asignaciones se leen desde `project_members`.
- Los usuarios IT ven todos los proyectos.
- Los usuarios comunes solo ven proyectos asignados, salvo que tengan `projects.view_all`.
- La estructura queda disponible mediante `qpcGetProjectStructure()` y `qpcGetLocationPath()` para las próximas migraciones de inspecciones, equipos y mapeos.

### Auditoría

- Nueva vista **Auditoría** para usuarios con `audit.view`.
- Muestra las últimas 250 acciones visibles del proyecto seleccionado.
- Respeta RLS y acceso por proyecto.

### Migración desde app_state

La migración intenta importar automáticamente:

- proyectos;
- bloques;
- niveles;
- áreas.

No elimina ni modifica el JSON original. `app_state` se mantiene como respaldo durante la transición.

### Despliegue requerido

1. Ejecutar `supabase/migrations/20260724_002_projects_locations_and_it_access.sql` en Supabase SQL Editor.
2. Crear la Edge Function `admin-project-management` con `supabase/functions/admin-project-management/index.ts`.
3. Volver a desplegar `admin-user-management` con la versión incluida; ahora valida proyectos relacionales y asigna automáticamente todos los proyectos a IT.
4. Configurar ambas funciones con `verify_jwt = false`; el código valida explícitamente el token de sesión.
5. Subir esta carpeta al branch `main` y esperar el despliegue de Vercel.

### Alcance que continúa pendiente

- Las inspecciones, visitas y respuestas siguen en `app_state`.
- Equipos, instructivos y mapeos aún deben migrarse a tablas relacionales.
- Los dropdowns estructurados se conectarán a cada formulario operativo durante sus respectivas fases.
- El bundle continúa siendo único y determinista, pero la conversión final a Vite/TypeScript modular permanece pendiente.

---

---

## V8.0.0 · Fase 1 — Permisos y administración segura de usuarios

Fecha: 24 de julio de 2026.

Esta versión inicia la refactorización estructural sin eliminar todavía las pantallas operativas existentes. Los múltiples archivos JavaScript se empaquetan en un único `app.bundle.js` para asegurar un orden de ejecución determinista. La migración completa a módulos ES/Vite continuará por fases para evitar perder funcionalidades.

### Implementado

- Catálogo relacional de permisos.
- Permisos predeterminados por rol.
- Excepciones individuales por usuario.
- Interfaz con todos los permisos agrupados y marcables.
- Indicador de permiso heredado, concedido o denegado.
- Botón para restaurar permisos del rol.
- Tecnología (IT) recibe todos los permisos y no puede ser restringido.
- Protección para impedir desactivar al último usuario IT activo.
- Asignaciones relacionales de usuarios a proyectos mediante `project_members`.
- Auditoría de creación y modificación de usuarios.
- Edge Function `admin-user-management` con validación interna del JWT.
- Mensajes de error con etapa identificable.
- Rollback de cuentas Auth nuevas si falla el perfil.
- Sincronización de Auth, perfil, proyectos, permisos y directorio del login.
- Un solo bundle JavaScript cargado por `index.html`.

### Despliegue requerido

1. Ejecutar `supabase/migrations/20260724_001_permissions_and_memberships.sql` en Supabase SQL Editor.
2. Crear o reemplazar la Edge Function `admin-user-management` con `supabase/functions/admin-user-management/index.ts`.
3. Desactivar la verificación JWT heredada de la función (`verify_jwt = false`), porque la función valida explícitamente el token del usuario y la aplicación usa una Publishable Key.
4. Subir el contenido de esta carpeta al branch `main` y esperar el despliegue de Vercel.

### Alcance pendiente de las próximas fases

- Migración relacional de proyectos, bloques, niveles y áreas.
- Migración relacional de inspecciones, visitas y respuestas.
- Migración relacional de equipos, instructivos y mapeos.
- Sustitución total de `app_state`.
- Conversión completa a módulos ES/Vite/TypeScript.
- RLS granular en todos los módulos operativos.
- Motor corporativo de exportaciones PDF.

---

---

## Versión 7.3 — 24 de julio de 2026

### Rama MAIN — Supabase

### Reparación de creación de usuarios

- Se corrige el caso en que Supabase Auth creaba la cuenta, pero la inserción en `public.profiles` fallaba.
- Se incluye `SUPABASE_V7_3_AUTH_PROFILE_REPAIR.sql`, que habilita explícitamente el rol `IT` y repara el usuario `tecnologia@codelpa.demo` ya creado sin perfil.
- La Edge Function `admin-create-user` ahora detecta usuarios existentes en Auth y crea o repara su perfil en lugar de fallar por correo duplicado.
- Si una cuenta nueva no puede crear su perfil, la función elimina automáticamente el usuario Auth recién creado para evitar cuentas huérfanas.
- Los errores devueltos por la Edge Function incluyen la etapa exacta: autenticación, validación, creación Auth, actualización Auth, perfil o directorio del login.
- El frontend muestra el detalle real del error en lugar del mensaje genérico `Edge Function returned a non-2xx status code`.

### Tecnología (IT)

- `IT` está incluido en la restricción válida de roles de `profiles`.
- IT puede crear y administrar cualquier rol.
- IT puede consultar y administrar todos los proyectos.
- IT puede operar inspecciones, visitas, cierres, equipos, instructivos, mapeos, exportaciones, usuarios, permisos y proyectos.
- IT puede abrir recursos de cualquier inspección y restaurar contraseñas.
- En listados de inspecciones, IT puede consultar todas las inspecciones y evaluar las asignadas a otras cuentas cuando sea necesario.

### Despliegue V7.3

1. Ejecutar `SUPABASE_V7_3_AUTH_PROFILE_REPAIR.sql`.
2. Sustituir y desplegar la Edge Function `admin-create-user` con `admin-create-user_index.ts`.
3. Publicar esta versión en el branch `main`.
4. Iniciar sesión con `tecnologia@codelpa.demo` y la contraseña asignada previamente.

---

---

## Versión 7.2 — 24 de julio de 2026

### Rama MAIN — Supabase

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


---

---

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

### Versiones previas

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
