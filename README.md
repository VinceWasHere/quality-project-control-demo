# V10.5 — Fase 26 · Estabilidad de perfil y rendimiento móvil

- Se corrigió el error de **Mi perfil** en teléfonos donde `Notification` no está disponible; las funciones de notificación ya no pueden impedir que el perfil se renderice.
- Se agregó un modo compatible de perfil como respaldo, manteniendo edición de nombre e imagen.
- La navegación móvil cierra primero el drawer y entrega un frame al navegador antes de renderizar la nueva sección.
- El cierre de sesión actualiza la interfaz inmediatamente y completa la salida de Supabase en segundo plano.
- Chart.js, XLSX, jsPDF, AutoTable, PptxGenJS y PDF.js se cargan únicamente cuando una función los necesita.
- Las preferencias de notificación y el Service Worker dejan de bloquear el arranque.
- El reloj se pausa cuando la pestaña está oculta.
- El menú móvil usa transformaciones aceleradas para reducir tirones.
- No requiere SQL ni cambios en Edge Functions.

---

# V10.4 — Fase 25 · Perfil móvil y visor PDF multipágina

- Se refuerza el acceso a **Mi perfil** en teléfonos mediante navegación directa por `pointerup`, clic, avatar y reinserción automática de la opción cuando una composición de roles la omite.
- **Mi perfil** vuelve a aparecer para Tecnología (IT) y para todos los demás roles.
- El menú móvil se cierra antes de cambiar de vista, evitando que el drawer o el overlay bloqueen la pantalla de perfil.
- El visor universal incorpora un motor PDF multipágina basado en PDF.js.
- Los PDF permiten avanzar y retroceder páginas, escribir el número de página, ajustar al ancho, ampliar, reducir y girar.
- En teléfonos se puede cambiar de página con los controles o deslizando horizontalmente sobre el documento.
- Se mantiene la descarga como alternativa, pero ya no es necesaria para consultar páginas posteriores.
- No requiere SQL ni cambios en Edge Functions.

---

# V10.3 — Fase 24 · Experiencia móvil y navegación accesible

- Se normaliza el diseño de todas las vistas en teléfonos: formularios, tarjetas, paneles laterales, instructivos relacionados, mapeos, perfil y tablas.
- Los grids con columnas definidas en línea se convierten correctamente a una sola columna en móvil.
- El menú lateral utiliza ancho adaptable, safe areas de iPhone, desplazamiento vertical y botón de cierre visible.
- Todas las opciones del menú funcionan mediante navegación delegada y el drawer se cierra de forma segura después de seleccionar una vista.
- **Mi perfil** queda disponible para todos los roles, incluyendo Tecnología (IT).
- El avatar superior funciona como acceso directo a **Mi perfil**.
- Se evita el scroll horizontal de la página completa; las tablas anchas conservan su propio desplazamiento controlado.
- No requiere SQL ni cambios en Edge Functions.

---

# V10.2 — Fase 23 · Notificaciones del dispositivo

- El usuario puede aceptar o rechazar notificaciones del navegador desde Mi perfil.
- Las alertas del dispositivo provienen exactamente de `qpc_notifications`, la misma fuente de la bandeja interna.
- Preferencias por categoría: inspecciones, informes, equipos, usuarios y generales.
- Web Push con Service Worker para recibir alertas aun cuando la pestaña no está activa.
- Al pulsar una alerta, la aplicación abre el mismo registro relacionado.
- La alerta consolidada de equipos permanece como una sola notificación.
- Soporte PWA y guía específica para iPhone/iPad.

---

# Quality Project Control MAIN

## V10.1 — Fase 22 · Notificaciones compactas y resumen de equipos

- Las alertas de equipos vencidos o próximos a vencer se consolidan en una sola tarjeta por proyecto y destinatario.
- La tarjeta muestra conteos separados de vencidos y próximos; al pulsarla se despliega dentro de la misma tarjeta el listado completo de equipos, sin llenar la bandeja con alertas individuales.
- Las notificaciones individuales creadas por V10.0 se archivan automáticamente sin eliminar su historial.
- El resumen se actualiza mediante UPSERT: si cambia el conjunto de equipos, vuelve a quedar sin leer; si no cambia, conserva su estado de lectura.
- Se agregan filtros rápidos para Todas, Inspecciones, Informes y Equipos.
- Supabase Realtime ahora procesa inserciones y actualizaciones de notificaciones, no solo inserciones.
- El README conserva el historial acumulativo desde la versión más reciente hasta la más antigua.

---

# Quality Project Control MAIN

## V10.0 — Fase 21 · Centro de notificaciones y actividad

- Se incorpora una campana de notificaciones en la cabecera para todos los usuarios autenticados.
- Las nuevas solicitudes de liberación notifican a Calidad, Gerente de Calidad e IT asignados al proyecto.
- Los cambios de estado de una inspección notifican al Ingeniero de Ejecución solicitante y al responsable de Calidad.
- La asignación de una inspección notifica al inspector correspondiente.
- Los cambios de revisión, aprobación y publicación de informes notifican a los roles gerenciales autorizados.
- Los equipos vencidos o próximos a vencer generan alertas para Calidad e IT sin duplicar mensajes.
- El panel permite abrir el registro relacionado, marcar como leído, marcar todo como leído y archivar notificaciones.
- Se añade actualización en tiempo real mediante Supabase Realtime y refresco de respaldo cada 60 segundos.
- Las notificaciones son personales y están protegidas mediante RLS.
- El README mantiene el historial desde la versión más reciente hasta la más antigua.

---

# Quality Project Control — MAIN

## V9.9 · Fase 20 — Consulta documental antes de solicitar inspecciones

- Los ingenieros de Ejecución pueden visualizar los instructivos relacionados directamente desde **Solicitar inspección**.
- Cada instructivo muestra código, versión, estado de disponibilidad y un botón **Visualizar** dentro del visor universal.
- Los archivos pendientes se identifican sin ofrecer acciones que fallen.
- El listado se actualiza automáticamente al cambiar la planilla/taller.
- El mapeo original también se abre en el visor interno, sin salir de la aplicación.
- La tarjeta informa cuántos instructivos relacionados están disponibles.
- Se añadieron ajustes responsive para que los controles funcionen en PC y móvil.
- No se requieren cambios SQL ni Edge Functions.

---

# Quality Project Control — MAIN

## V9.8 · Fase 19 — Validación inteligente y control de publicación

- Se agregó un checklist obligatorio por sección para informes semanales y mensuales.
- Cada sección puede marcarse como Pendiente, Completa o No aplica, con notas y trazabilidad del revisor.
- El panel muestra porcentaje de preparación, secciones pendientes, registros y evidencias.
- La publicación queda bloqueada en Supabase mientras existan secciones pendientes.
- Gerente de Calidad, Presidencia e IT pueden autorizar una excepción justificada y auditada.
- Cualquier cambio posterior en contenido o evidencias devuelve la sección a Pendiente y revoca la excepción.
- El README acumulativo conserva la versión más reciente primero.

---

# Quality Project Control — MAIN

## V9.7 · Fase 18 — Comparación de versiones y reloj vivo

- Se agregó un reloj en vivo con día, fecha y hora para todos los usuarios, visible tanto en el login como en la cabecera de la aplicación.
- El reloj usa la zona horaria configurada en el proyecto y se actualiza cada segundo sin volver a renderizar la página.
- La biblioteca de informes incorpora comparación entre dos versiones oficiales publicadas.
- La comparación identifica registros agregados, eliminados y modificados, además de cambios en evidencias y organización de láminas.
- El resultado puede descargarse como CSV y cada snapshot oficial puede descargarse como JSON.
- Las acciones de comparación y exportación quedan registradas en Auditoría.
- Se mantiene la estructura limpia del repositorio y el historial del README más reciente primero.

---

# Quality Project Control — MAIN

## V9.6 · Fase 17 — Biblioteca de informes publicados

- Cada publicación crea un snapshot inmutable del contenido, evidencias y organización de láminas.
- Se agregó una biblioteca por proyecto con versiones oficiales, autor, fecha y conteos.
- La plataforma indica si el contenido actual cambió después de la última publicación.
- Una versión publicada puede reutilizarse como base de un nuevo periodo sin modificar el histórico.
- Se conservan vínculos de evidencias sin duplicar archivos físicos.
- El repositorio mantiene la estructura limpia de V9.5 y solo suma una migración versionada.

---

# Quality Project Control — MAIN

## V9.5 · Fase 16 — Revisión/publicación y limpieza del repositorio

- Se agregó un flujo formal para los informes: Borrador → Listo para revisión → Aprobado → Publicado.
- Cada periodo mantiene notas, historial y número de versión publicada.
- Se consolidó el repositorio: se eliminaron copias duplicadas de SQL, archivos VERSION, README_FIX, deployment históricos sueltos y JavaScript legado no cargado.
- El branch limpio conserva solo los archivos de ejecución, migraciones versionadas, Edge Functions, activos, catálogo, pruebas y documentación vigente.
- Se retiró `equipment_seed.js` del arranque de MAIN para evitar datos de ejemplo y reducir peso.

---

# Quality Project Control MAIN V9.3 — Fase 14

## Enfoque
Evidencias múltiples reales para el contenido corporativo y exportables.

## Cambios
- Carga de hasta 12 evidencias activas por registro.
- Galería integrada con miniaturas, visor y descarga.
- Leyendas editables y orden configurable.
- Selección de evidencia principal.
- Retiro individual con confirmación y auditoría.
- PDF y PPTX incorporan varias fotografías por registro.
- Migración automática de la evidencia principal histórica a la galería.
- README acumulativo con la versión más reciente primero.

---

# Quality Project Control MAIN V9.2 — Fase 13

## Enfoque
Mejora avanzada de reportes y contenido corporativo.

## Cambios
- El módulo **Contenido de informes** ahora muestra estado de preparación por sección.
- Las métricas superiores se separan correctamente y ya no se pegan los números con el texto.
- Se agrega una matriz de secciones requeridas y opcionales para semanal y mensual.
- El editor de registros incluye guía contextual según la sección.
- Se agrega catálogo relacional de requisitos de informe.
- Se prepara soporte para evidencias múltiples mediante `qpc_report_entry_files`.

---

# Quality Project Control — MAIN

Rama principal conectada a Supabase, publicada desde GitHub en Vercel. Este README conserva el historial acumulativo completo y ordena las versiones desde la más reciente hasta la más antigua.

> **Orden del historial:** versión más reciente primero. No eliminar entradas anteriores al publicar una versión nueva.

---

## V9.1.0 · Fase 12 — Contenido de informes, integridad de datos y descuentos por punto evaluado

Fecha: 27 de julio de 2026.

### Cambios principales

- Se corrigió la presentación de métricas en **Contenido de informes** para que los bloques “Registros del periodo”, “Sección seleccionada” y “Con evidencia” se vean como tarjetas reales, sin el texto corrido que aparecía en una sola línea.
- Se mejoró la vista de **Integridad de datos** con acciones más útiles sobre cada incidencia: ahora se puede abrir directamente la inspección relacionada, resolver, ignorar o reabrir con confirmación previa.
- Se agregó una nota contextual para las incidencias `LEGACY_BASE64_MAPPING_ANNOTATION`, explicando que provienen de mapeos históricos guardados en Base64.
- En el detalle de cada visita, la tabla de descuentos ahora muestra claramente **en qué punto de evaluación** se restaron puntos, incluyendo código del punto, nombre del criterio, tipo (técnico o visita/preparación), etapa, respuesta, valor obtenido, descuento y observación.
- Se añadieron chips resumen encima de la tabla de descuentos para identificar rápidamente los criterios afectados.
- Se actualizaron referencias de caché a `9.1.0`.

### Despliegue

- No requiere SQL nuevo para esta fase.
- Reemplazar los archivos del branch `main` por esta versión y permitir que Vercel publique de nuevo.
- Después del despliegue, hacer una recarga sin caché.

---

## V9.0.1 · Hotfix — Arranque y navegación de Integridad de datos

Fecha: 27 de julio de 2026.

### Corrección crítica

- Se corrigió el error `object is not iterable (cannot read property Symbol(Symbol.iterator))` que podía aparecer durante el arranque.
- La causa era que el módulo **Integridad de datos** agregaba su opción de navegación como un objeto, mientras que el resto de la aplicación utiliza tuplas con el formato `[vista, icono, etiqueta]`.
- Al renderizar el menú, el objeto se intentaba desestructurar como una matriz y el arranque regresaba al login mostrando un mensaje incorrecto de conexión con Supabase.
- La opción ahora se agrega como `['integrity', '◫', 'Integridad de datos']`.
- También se filtran defensivamente entradas de navegación con un formato inválido para evitar que una extensión futura vuelva a bloquear el inicio de sesión.
- Se actualizó el control de caché de `app.bundle.js`, CSS e iconos a `9.0.1`.
- El paquete conserva la migración V9.0 corregida con `extensions.digest(...)`.

### Despliegue

- No requiere SQL adicional si la migración V9.0 corregida ya fue ejecutada.
- No requiere cambios en Edge Functions.
- Reemplazar los archivos del branch `main` y realizar una recarga sin caché.

---

## V9.0.0 · Fase 11 — Recursos relacionales, integridad y fidelidad corporativa

Fecha: 27 de julio de 2026.

Esta fase completa la normalización de recursos asociados a inspecciones y mejora la estructura de los informes corporativos.

### Recursos de inspecciones

- Nueva tabla `qpc_file_links` para relacionar archivos con inspecciones y otras entidades.
- Los adjuntos existentes en `qpc_inspections.attachments` se migran de forma idempotente a `qpc_files` y `qpc_file_links`.
- Las nuevas solicitudes continúan enviando metadatos compatibles, pero un trigger los normaliza automáticamente.
- El detalle de la inspección carga archivos bajo demanda, evitando firmar y descargar recursos al iniciar la aplicación.
- Fotografías, documentos y planos usan el visor universal y conservan descarga opcional.

### Mapeos marcados

- El resaltador conserva trazos vectoriales además de la vista previa PNG.
- La vista previa se sube a Supabase Storage.
- Los trazos se guardan en `qpc_mapping_annotations`.
- La opacidad se aplica una sola vez a la capa completa para evitar que varias pasadas oculten el contenido inferior.
- Las anotaciones históricas Base64 que no pueden migrarse automáticamente se registran como incidencias, sin eliminarse silenciosamente.

### Integridad de datos

- Nuevo módulo **Integridad de datos** para usuarios autorizados.
- Muestra inspecciones, archivos normalizados, anotaciones y problemas abiertos.
- Las incidencias pueden resolverse, ignorarse o reabrirse.
- Nueva tabla `qpc_migration_issues` con trazabilidad.
- `app_state` queda documentado como respaldo histórico y no debe recibir nuevos módulos operativos.

### Informes corporativos

- El PPTX semanal respeta el orden del FO-CP-10 V07: agenda, divisores de sección, buenas prácticas, resumen de planillas, puntos débiles, talleres a mejorar, NC, capacitaciones, atención especial y conclusiones/recomendaciones.
- El PPTX mensual respeta el orden del FO-CP-11 V10 e incorpora comparativos, equipos, pruebas a materiales, lecciones aprendidas y acción motivacional.
- Se agregan diapositivas divisoras con código de formulario, como en las presentaciones corporativas de referencia.
- Las secciones no aplicables al periodo semanal dejan de insertarse automáticamente.
- El PPTX continúa siendo editable y conserva láminas preparadas cuando falta información manual.

### Despliegue

- Ejecutar `SUPABASE_V9_0_PHASE11.sql`.
- No requiere Edge Function nueva.
- Publicar los archivos del paquete en el branch `main`.

### Pendiente para cierre

1. Pruebas end-to-end por rol y concurrencia.
2. Revisión final de RLS y políticas de Storage.
3. Paginación server-side y optimización de consultas de gran volumen.
4. Retiro físico del código legado y preparación de una versión candidata a producción.

---

## V8.9.0 · Fase 10 — Contenido corporativo de informes

Fecha: 25 de julio de 2026.

Esta fase incorpora a Supabase la información que completa los informes corporativos y que no puede deducirse únicamente de las planillas de inspección.

### Nuevo módulo: Contenido de informes

- Nueva sección disponible para usuarios autorizados.
- Periodos semanales de jueves a miércoles y periodos mensuales.
- Registros para:
  - Buenas prácticas.
  - Talleres a mejorar por meta incumplida.
  - NC del proyecto.
  - Capacitaciones realizadas.
  - Actividades de atención especial.
  - Pruebas a materiales.
  - Lecciones aprendidas.
  - Conclusiones.
  - Recomendaciones y observaciones.
  - Acción motivacional.
- Cada registro puede incluir título, descripción, ubicación, responsable, plan de acción, referencia, cantidad, resultado, notas y evidencia.
- Las evidencias se almacenan en Supabase Storage y se visualizan desde el visor interno.
- Edición contextual sin enviar al usuario al inicio de la página.
- Archivo no destructivo con confirmación y auditoría.

### Integración con exportables

- El informe completo PDF usa los registros del periodo en lugar de mostrar únicamente hojas vacías.
- Buenas prácticas y talleres a mejorar generan páginas con espacio fotográfico y datos.
- NC, capacitaciones y pruebas a materiales generan tablas corporativas.
- Actividades de atención especial, lecciones, conclusiones y recomendaciones generan páginas de texto.
- El PPTX editable incorpora los mismos registros y conserva láminas preparadas cuando una sección no tiene datos.
- Las secciones semanales y mensuales se adaptan al FO-CP-10 V07 y FO-CP-11 V10.

### Base de datos y seguridad

- Nueva tabla `qpc_report_entries`.
- Nuevos permisos `reports.content.view` y `reports.content.manage`.
- RLS por proyecto.
- Escrituras mediante RPC seguras.
- Auditoría de creación, modificación y archivo.
- IT mantiene acceso total.

### Despliegue

- Ejecutar `SUPABASE_V8_9_PHASE10.sql`.
- No requiere Edge Function nueva.
- Publicar los archivos del paquete en el branch `main`.

### Pendiente para cierre

1. Fidelidad visual final de los PPTX/PDF utilizando los masters corporativos exactos.
2. Retirar la dependencia operativa restante de `app_state` y normalizar adjuntos/anotaciones pendientes.
3. Pruebas automatizadas, revisión de RLS, concurrencia, rendimiento y limpieza definitiva de código legado.

## V8.8.1 · Hotfix — Combobox de login sin congelamiento

Fecha: 25 de julio de 2026.

Esta revisión corrige un bloqueo crítico introducido en V8.8.0 al abrir el listado de correos del login.

### Causa corregida

- El chevrón del combobox se sincronizaba mediante un `MutationObserver` que observaba cambios en `aria-expanded`.
- El propio observador volvía a escribir `aria-expanded` sobre el botón observado, generando una cadena recursiva de mutaciones y saturando el hilo principal del navegador.
- El resultado era la alerta **Page Unresponsive** al pulsar la flecha.

### Solución

- Se elimina completamente el `MutationObserver` del login.
- El estado abierto/cerrado se actualiza de forma directa y controlada desde `initLoginCombobox()`.
- Input, botón y menú reciben el mismo estado solo cuando el valor realmente cambia.
- Se conserva el chevrón SVG, su rotación, la búsqueda, el teclado, Escape y la selección de cuentas `.demo`.
- Se añade `preventScroll` a los cambios de foco para evitar movimientos inesperados de la pantalla.

### Despliegue

- No requiere SQL.
- No requiere Edge Function.
- Publicar los archivos en `main` y hacer una recarga sin caché.

---

## V8.8.0 · Fase 9 — Estabilización de calificaciones, login e inspecciones personales

Fecha: 25 de julio de 2026.

Esta fase corrige tres inconsistencias visibles detectadas después de la implementación del archivo personal de inspecciones. No requiere una migración SQL ni una Edge Function nueva.

### Calificaciones y gráficos

- Los gráficos porcentuales de talleres, ingenieros y áreas utilizan una escala estricta de **0 % a 100 %**; se elimina el límite visual de 105 %.
- En **Comparativo por ingenieros**, la línea de meta y la línea de media general permanecen visibles incluso cuando el filtro devuelve un solo ingeniero.
- En **Comparativo por áreas**, la línea de meta permanece visible aunque solo exista un área evaluada.
- Las líneas de referencia se dibujan sobre todo el ancho del área del gráfico y no dependen de que existan dos o más barras.
- Las etiquetas del eje vertical se muestran como porcentajes.

### Login

- La palomita tipográfica del combobox de correos se sustituye por un chevrón SVG integrado al diseño.
- El chevrón gira cuando se abre el listado y conserva la misma apariencia en PC, iPhone y Android.
- Se mantienen la búsqueda, filtrado, navegación con teclado y selección de correos registrados.

### Mis inspecciones

- Para Ingeniería de Calidad, Gerencia de Calidad e IT, **Mis inspecciones** muestra únicamente las inspecciones que el usuario tomó o que fueron asignadas a su perfil.
- Las solicitudes sin tomar permanecen exclusivamente en **Bandeja de Calidad**.
- IT conserva acceso global desde las vistas administrativas, reportes y auditoría, pero su bandeja personal deja de mezclarse con solicitudes no asignadas.
- Las pestañas Activas, Archivadas y Todas se calculan sobre las inspecciones realmente asignadas al usuario.

### Despliegue

- No requiere SQL nuevo.
- No requiere Edge Function nueva.
- Publicar los archivos del paquete en el branch `main` y esperar el despliegue de Vercel.
- Hacer una recarga sin caché para cargar `app.bundle.js?v=8.8.0` y `styles.css?v=8.8.0`.

### Camino pendiente para cierre de producción

Después de esta fase quedan tres frentes principales:

1. **Interconexión relacional final:** retirar la dependencia operativa restante de `app_state`, normalizar completamente adjuntos de inspecciones y persistir las anotaciones vectoriales de mapeos.
2. **Módulos de información corporativa y fidelidad de reportes:** buenas prácticas, talleres a mejorar, NC, capacitaciones, pruebas a materiales, recomendaciones y reproducción final de los formatos FO-CP-10 V07, FO-CP-11 V10 y FO-GC-23 V05.
3. **Cierre de producción:** pruebas automatizadas, revisión completa de RLS, concurrencia, rendimiento, paginación del servidor, responsive final y eliminación del código legado archivado.

---

## V8.7.0 · Fase 8 — Archivo personal de inspecciones y organización operativa

Fecha: 25 de julio de 2026.

Esta fase agrega un archivo personal y no destructivo para evitar que la sección **Mis inspecciones** de Calidad se llene con registros ya terminados.

### Archivo personal

- Calidad, Gerencia de Calidad e IT pueden archivar inspecciones terminadas cuando tienen el permiso `inspections.archive`.
- El archivo es individual: archivar una inspección no la oculta a otros usuarios.
- La inspección no se elimina ni cambia de estado.
- Las visitas, respuestas, adjuntos, calificaciones, puntos débiles, reportes y exportaciones permanecen intactos.
- Solo pueden archivarse registros terminados o anulados.
- Las inspecciones activas no pueden archivarse accidentalmente.

### Interfaz

- Nuevas pestañas **Activas**, **Archivadas** y **Todas** dentro de Mis inspecciones.
- Cada pestaña muestra su cantidad de registros.
- El botón Archivar solo aparece en registros permitidos.
- Antes de archivar se muestra una advertencia interna que explica que la acción no elimina información.
- Los registros archivados pueden restaurarse desde la misma sección.

### Seguridad y auditoría

- Nueva tabla `qpc_inspection_user_archives` protegida por RLS.
- Cada usuario solo puede consultar su archivo personal.
- Las escrituras se realizan mediante `qpc_set_personal_inspection_archive()`.
- Se valida perfil activo, permiso, acceso al proyecto, asignación y estado de la inspección.
- Archivo y restauración quedan registrados en `audit_logs`.
- IT mantiene acceso total a la función y a todos los proyectos.

### Despliegue

- Ejecutar `SUPABASE_V8_7_PHASE8.sql`.
- No requiere Edge Function nueva.
- Publicar los archivos en `main` y esperar el despliegue automático de Vercel.

### Camino pendiente para cierre de producción

Después de esta fase permanecen cuatro frentes principales:

1. **Eliminar la dependencia operativa restante de `app_state` y localStorage**, conservándolos únicamente como respaldo de migración.
2. **Completar interconexiones relacionales**, especialmente ubicación estructurada en solicitudes, adjuntos de inspecciones mediante `qpc_files/file_links` y anotaciones vectoriales persistentes de mapeos.
3. **Fidelidad final de reportes corporativos**, clonando con mayor exactitud los masters del FO-CP-10 V07, FO-CP-11 V10 y FO-GC-23 V05, y creando módulos para información manual como buenas prácticas, NC, capacitaciones y recomendaciones.
4. **Cierre técnico de producción**, con pruebas automatizadas, revisión RLS, concurrencia, rendimiento, paginación desde servidor, responsive completo y eliminación definitiva de código legado.

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
