# QPC — Análisis de brechas

**Fecha:** 2026-09-21
**Contraste:** requisitos del prompt maestro frente al sistema vivo.
**Regla aplicada:** cada línea de esta tabla está respaldada por una comprobación concreta
sobre el código, la base de datos o el despliegue. Donde no pude comprobar algo, lo digo.

Documento hermano: [QPC_CURRENT_STATE.md](QPC_CURRENT_STATE.md).

---

## Cuadro de mando

| # | Requisito | Estado | Dónde vive |
|---|---|---|---|
| 1 | Roles y permisos (6 roles) | **Completo** | BD + Edge Functions |
| 2 | Puntuación con N/A fuera del denominador | **Completo y correcto** | BD |
| 3 | Una inspección pesa una vez pese a varias visitas | **Completo** | BD |
| 4 | Escala 0–100 % | **Completo** | BD |
| 5 | Flujo de inspección con visitas múltiples | **Completo** | BD + frontend |
| 6 | Semana de calidad jueves→miércoles | **Completo, pero solo en el frontend** | Frontend |
| 7 | Formatos FO-CP-10 V07 / FO-CP-11 V10 / FO-GC-23 V05 | **Completo** | Frontend |
| 8 | Exportación XLSX / CSV / PDF / PPTX | **Completo** | Frontend |
| 9 | Plantillas versionadas | **Completo** | BD |
| 10 | Biblioteca de instructivos y mapeos con anotaciones | **Completo, estructurado** | BD |
| 11 | Verificación de equipos con semáforo | **Completo** | BD |
| 12 | Multiproyecto sin tocar código | **Completo** | BD |
| 13 | Registros de auditoría | **Completo** | BD |
| 14 | Notificaciones y push | **Completo** | BD + SW + Edge Function |
| 15 | Ciclo de reportes con aprobación | **Construido, nunca ejercitado** | BD |
| 16 | Comparación de desempeño entre ingenieros | **Parcial** | Frontend |
| 17 | **Capacidad offline (IndexedDB + cola de sync)** | **Ausente por completo** | — |
| 18 | **Versionado del esquema** | **Ausente por completo** | — |
| 19 | **Cabeceras de seguridad** | **Ausente** | — |
| 20 | Herramientas de integridad de datos | **Completo** | BD |

---

## Lo que ya está bien y no hay que tocar

Es importante dejarlo por escrito, porque el instinto ante un sistema sin migraciones es
reescribirlo, y sería un error caro.

### Puntuación (requisito núcleo del prompt maestro)

La regla de N/A está implementada **en el servidor**, dentro de
`qpc_finish_inspection_visit`, exactamente como la pide el prompt maestro:

```sql
if not v_is_na then
  v_all_num = v_all_num + v_earned;
  v_all_den = v_all_den + v_weight;
  ...
end if;
```

- Un N/A **se registra** (fila en `qpc_visit_answers` con `is_na = true`).
- **No suma**: `points_earned` queda `NULL`.
- **No resta**: `points_lost` queda `NULL`.
- **Sale del denominador**: su `weight` nunca entra en `v_all_den`.

Confirmado en datos reales: la única respuesta N/A existente tiene `factor`,
`points_earned` y `points_lost` todos nulos.

La escala es `num / den * 100` con factores en {0, 0,25, 0,5, 0,75, 1}, así que **no puede
superar el 100 %**. Y `current_final_score` de la inspección es el promedio de sus visitas
finalizadas, de modo que **cada inspección pesa una sola vez** en los agregados, con
independencia de cuántas visitas tenga. Las vistas de reporte
(`qpc_reporting_inspections`) emiten una fila por inspección, no por visita.

Además separa tres puntuaciones: `technical_score`, `preparation_score` (criterios de
visita) y `final_score`. Esto va más allá de lo pedido y está bien hecho.

### Autorización

`permissions`, `role_permissions`, `user_permission_overrides`, `project_members` y las
funciones `current_user_has_permission`, `qpc_current_user_can_access_project`,
`qpc_user_has_project_access` forman un modelo de permisos completo, comprobado tanto por
RLS como por las Edge Functions. Los seis roles del prompt maestro ya tienen usuario real.

### Bibliotecas de contenido

`qpc_instructives` + `qpc_instructive_versions`, `qpc_mappings` + `qpc_mapping_versions` +
`qpc_mapping_annotations`. Las anotaciones de mapeo se guardan **estructuralmente**, en su
propia tabla con versión, no como capturas en Base64. Esto era un requisito explícito y
está cumplido.

### Equipos

`qpc_equipment` (440 filas) con `frequency_days`, `last_calibration_date`,
`last_verification_date`, y las funciones `qpc_equipment_due_date` y `qpc_equipment_status`
que producen el semáforo en el servidor, más
`qpc_refresh_due_equipment_notifications` para el aviso automático.

---

## Las brechas reales

### B-1 · No hay capacidad offline. Ninguna. (bloqueante para el uso en obra)

El prompt maestro pide IndexedDB con cola de sincronización. La realidad es peor que
"falta IndexedDB":

- `indexedDB` aparece **0 veces** en `app.bundle.js` y **0 veces** en `qpc-sw.js`.
- El service worker tiene 44 líneas y **solo escucha `push` y `notificationclick`**.
  **No tiene un handler `fetch`, ni una sola llamada a `caches`.**
- Por tanto no hay app shell cacheado: sin red, la aplicación **no arranca siquiera**.
- Hay `manifest.webmanifest`, así que se instala como PWA, pero una PWA instalada que no
  abre sin cobertura es peor que un navegador, porque promete lo contrario.

Un ingeniero en un sótano de obra, que es el caso de uso central de QPC, hoy no puede
trabajar. Esta es la brecha funcional más grande del sistema.

**Qué hace falta**, en este orden:
1. Handler `fetch` en el SW con app shell precacheado (cache-first para los estáticos
   versionados, network-first para la API). Coste bajo, beneficio inmediato: la app abre.
2. IndexedDB con los catálogos de solo lectura (proyectos, plantillas, criterios, equipos,
   bloques/niveles/áreas). Permite *empezar* una inspección sin red.
3. Cola de sincronización para los borradores de visita. `qpc_save_visit_draft` ya existe y
   es idempotente por `visit_id`, lo que facilita mucho el reenvío.

### B-2 · El esquema no está versionado (riesgo existencial)

Detallado en [QPC_CURRENT_STATE.md §7](QPC_CURRENT_STATE.md). Resumen: la tabla
`supabase_migrations.schema_migrations` **no existe**; 13 tablas vivas no las crea ninguna
migración del repositorio; faltan los ficheros 005 y 009–013.

Mitigado parcialmente con el baseline de 236 KB ya generado, pero el baseline **todavía no
está instalado como migración** ni probado contra una base limpia.

### B-3 · Siete tablas heredadas abiertas a escritura anónima

Detallado en [QPC_CURRENT_STATE.md §6.1](QPC_CURRENT_STATE.md). El bundle no las usa y
están vacías, así que la corrección es limpia: respaldo (hecho) y eliminación.

### B-4 · La recuperación de cuenta está rota

`site_url` y `uri_allow_list` apuntan al hostname protegido por SSO. Cualquier usuario que
olvide su contraseña recibe un enlace a una página que no puede abrir. No es solo un
problema de seguridad: es una avería funcional que hoy afecta a los 7 usuarios.

### B-5 · Registro abierto en herramienta corporativa

`disable_signup = false`.

### B-6 · El directorio de empleados se lee sin autenticar

`login_directory` con política para `anon`. Hay que decidir entre conveniencia de UX y
exposición de la nómina; lo razonable es moverlo detrás de una Edge Function que devuelva
solo lo necesario, o exigir que el usuario escriba su correo en vez de elegirlo de una lista.

### B-7 · El ciclo de reportes nunca se ha ejercitado

`qpc_report_cycles` tiene **0 filas**, pese a existir 8 tablas, 15 RPC, 3 triggers y una
puerta de validación (`qpc_enforce_report_validation_before_publish`) dedicados a ello.
Es la mayor superficie de código **no probada** del sistema. Antes de declarar QPC listo
para producción hay que recorrer el ciclo completo DRAFT → READY_FOR_REVIEW → APPROVED →
PUBLISHED al menos una vez con datos reales.

### B-8 · La semana jueves→miércoles vive solo en el frontend

La BD guarda `period_mode` ∈ {week, month} y un `period_value` de texto, sin ninguna lógica
de frontera de semana: no hay rastro de `dow`, `isodow` ni `date_trunc('week')` en las 71
funciones. El cálculo está en el bundle. Funciona, pero significa que cualquier consulta,
exportación o informe hecho fuera del frontend puede calcular la semana de otra forma y
nadie se enteraría. Conviene una función `qpc_quality_week(date)` en la BD como única
fuente de verdad.

### B-9 · Un secreto vivía en texto plano dentro de un trigger

El trigger `qpc-web-push-notifications` incrusta el valor de `QPC_PUSH_WEBHOOK_SECRET` en
claro en su definición, que es exactamente lo que `pg_get_triggerdef` devuelve y lo que
acaba en cualquier volcado de esquema.

Ya corregido en los artefactos locales: el valor fue sustituido por el marcador
`__QPC_PUSH_WEBHOOK_SECRET__` en el baseline y verificado que no queda rastro en disco.
Pero sigue en claro en la base de datos. La corrección de fondo es leer el secreto desde
Vault (`supabase_vault` ya está instalada) en lugar de incrustarlo, y rotar el valor.

### B-10 · Faltan cabeceras de seguridad

No existe `vercel.json`. Sin CSP, sin `X-Frame-Options`, sin `X-Content-Type-Options`.
Es la corrección más barata de toda la lista: un fichero de veinte líneas.

### B-11 · La comparación entre ingenieros es parcial

El prompt maestro pide competencia sana y comparación de desempeño. Existe la materia
prima (`execution_name`, `execution_area` en `qpc_reporting_answers`, puntuaciones por
inspección) y el frontend muestra comparativos, pero no hay ninguna función ni vista de
ranking en la BD: `select proname ... ilike '%rank%' or '%score%'` devuelve **0 funciones**.
Toda la agregación comparativa se recalcula en el navegador a partir de filas crudas.
Funciona con 12 inspecciones; no escalará a 1 200.

---

## Orden de ataque propuesto

Criterio: primero lo que es a la vez barato y grave, y todo lo destructivo solo con red de
seguridad ya puesta (que lo está).

| Prioridad | Acción | Coste | Riesgo de no hacerlo |
|---|---|---|---|
| **P0** | Instalar el baseline como migración inicial (B-2) | Medio | Pérdida irrecuperable del esquema |
| **P0** | Eliminar las 7 tablas demo abiertas a `anon` (B-3) | Bajo | Escritura anónima desde Internet |
| **P0** | Corregir `site_url` / `uri_allow_list` (B-4) | Muy bajo | Nadie puede recuperar su contraseña |
| **P1** | `disable_signup = true` (B-5) | Muy bajo | Altas no autorizadas |
| **P1** | `vercel.json` con cabeceras (B-10) | Muy bajo | Clickjacking, XSS |
| **P1** | Elevar longitud mínima de contraseña (B-5) | Muy bajo | Cuentas débiles |
| **P2** | Service worker con app shell (B-1, paso 1) | Bajo | La app no abre sin red |
| **P2** | Cerrar `login_directory` a `anon` (B-6) | Bajo | Fuga de la nómina |
| **P2** | Rotar el secreto de push y moverlo a Vault (B-9) | Medio | Secreto en claro en la BD |
| **P3** | IndexedDB de catálogos + cola de sync (B-1, pasos 2-3) | Alto | Inutilizable en obra |
| **P3** | Ejercitar el ciclo de reportes completo (B-7) | Medio | Código sin probar en producción |
| **P4** | `qpc_quality_week()` en la BD (B-8) | Bajo | Divergencia de periodos |
| **P4** | Vistas de ranking en la BD (B-11) | Medio | No escala |

Nada de esto exige gasto: todo cabe en el plan gratuito de Supabase y Vercel.
