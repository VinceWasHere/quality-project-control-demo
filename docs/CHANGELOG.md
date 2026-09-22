# CHANGELOG — Quality Project Control

Formato: entradas por ronda de trabajo, lo más nuevo arriba. Fechas absolutas.
"Verificado" = comprobado en vivo (preview/BD), no supuesto por el código.

---

## 2026-09-22 (tarde-2) — Flujo de inspección E2E: bug de bandeja corregido + refinamientos

Rama: `fix/p0-seguridad-y-versionado`. SW `v10.8.1`. Verificado en vivo en
`localhost:8788` + Supabase real (sesión SSO real, `qa.calidad@codelpa.demo`, rol CALIDAD).

Foco: **completar y refinar el flujo funcional** (no seguridad/infra, diferido). Se
ejercitó el ciclo central de punta a punta y se corrigió lo que lo rompía.

### Corregido — la Bandeja de Calidad no mostraba inspecciones (severidad alta)

Síntoma: un usuario CALIDAD veía **0 inspecciones** en la bandeja pese a haber
solicitudes `SOLICITADA_LIBERACION`; el bucle central (solicitar → tomar → evaluar)
quedaba roto para Calidad.

Causa raíz: **deriva de datos de prueba**, no un bug del código en producción. RLS de
`qpc_inspections` pasa por `qpc_actor_can_view_inspection` → `qpc_user_can_access_project`,
que resuelve el acceso al proyecto contra la tabla **`project_members`** (no contra
`profiles.project_ids`). Las 5 cuentas QA tenían `project_ids` en su perfil pero **sin
filas en `project_members`** (el sembrado antiguo no las escribió). La ruta viva de
administración de usuarios (Edge Function `admin-user-management`) sí sincroniza
`project_members`, así que producción crea usuarios bien; el hueco era solo en los datos
semilla.

Arreglo: **backfill idempotente y auto-sanador** de `project_members` a partir de
`profiles.project_ids` (script Node con la `service_role` leída en runtime, nunca impresa;
15 filas insertadas vía PostgREST `on_conflict=project_id,user_id`). No se tocó el esquema.

Verificado: `qa.calidad` pasa a `canView=true`, ve 13 inspecciones, la bandeja se puebla
con las 5 `SOLICITADA_LIBERACION` y sus botones "Tomar".

> Nota de higiene: la Edge Function huérfana `admin-create-user` escribe `profiles.project_ids`
> pero **no** `project_members`; no es la ruta viva (lo es `admin-user-management`). Marcada
> para limpieza/confirmación de que es borrable.

### Verificado — ciclo de liberación E2E completo (relacional)

Solicitar → **Bandeja de Calidad** → **Tomar** (`workflow('take')`, estado `TOMADA`,
asignada al inspector) → **Planilla digital** (`openEvaluation` → `workflow('start_visit')`,
estado `EN_EVALUACION`) → 13 criterios respondidos → **"Guardar y liberar"**
(`finishEvaluation` → `workflow('finish_visit')`). Resultado: estado **`LIBERADA`**, visita
`FINALIZADA`, puntaje **100%**. Persistencia relacional confirmada tras **recarga completa**
desde el servidor (no solo caché local).

### Refinado — fecha propuesta por defecto ya no está caducada

`ui.requestDraft.date` estaba **fija en `2026-07-24`** (2 meses en el pasado). Como el
código de solicitud se genera server-side con `to_char(requested_date,'YYMMDD')`
(`qpc_next_request_code`), toda solicitud nueva nacía con un código y una fecha caducados
(p. ej. `I-LLC-260724-…`). Cambiado a `toISODate(new Date())` (fecha **local**, helper ya
existente). Verificado en vivo: el borrador arranca en `2026-09-22`.

> Se dejó **a propósito** el `'2026-07'` por defecto de los periodos de reporte/dashboard:
> ancla a la era de los datos semilla (julio 2026); ponerlo en el mes actual vaciaría los
> paneles del demo. Es decisión, no bug.

- Cache-busting a `10.8.1` (index.html, `QPC_VERSION` del SW, registro en runtime-loader).
- `node --check app.bundle.js` OK.

---

## 2026-09-22 (tarde) — Offline de datos: alcance mínimo, verificado en vivo

Rama: `fix/p0-seguridad-y-versionado`. SW `v10.8.0`. Verificado en vivo en
`localhost:8788` + Supabase real (sesión SSO real, cuenta `qa.ejecucion@codelpa.demo`).

Contexto: la corrección de la ronda anterior dejó claro que el offline de datos del
commit `69c1975` cayó sobre código **legacy** (muerto) y no tenía efecto en la app viva
(`MAIN_MODE` + "phase3", inspecciones relacionales vía Edge Function). Esta ronda porta
el fallback offline a las **funciones vivas**, con alcance acotado.

### Qué se implementó (todo en `app.bundle.js` salvo el bump de versión)

- **Arranque offline (lectura desde caché).** El wrapper **más externo** de
  `window.loadRemoteData` (~L6343 — el que llama `bootstrap`) captura cualquier error de
  red de toda la cadena e hidrata `data` desde `localStorage[qpc_supabase_v6_cache]` en
  lugar de mandar al login. `window.loadProfiles` (~L2086) conserva los usuarios cacheados
  si la recarga de perfiles falla sin red. El `saveData` vivo (phase3, ~L3084) cachea
  `data` (con `users` e `inspections` conocidas) para poder renderizar offline.
- **Sin cuelgue de 20 s al arrancar sin red.** El bootstrap vivo (~L1304) omite
  `refreshSession()` cuando `navigator.onLine===false` (supabase-js reintentaba el
  `refresh_token` hasta `AUTH_TIMEOUT_MS`); usa la sesión local directamente.
- **Escritura offline + reconexión.** El `saveData` vivo marca la bandera "pendiente de
  sincronizar" (persistida) cuando el `upsert` falla por red y muestra el banner; el
  listener `online` reenvía y limpia la bandera al subir bien. Reutiliza los helpers ya
  presentes (detección de red, banner, hook de reconexión).
- Cache-busting a `10.8.0` (index.html, `QPC_VERSION` del SW, registro en runtime-loader).

### Verificado en vivo (ciclo completo)

1. **Arranque sin red desde caché**: `setOffline(true)` + recarga → dashboard completo en
   ~3 s (`onLine=false`, login NO visible, banner "Sin conexión — trabajando offline…",
   navegación + 4 proyectos renderizados). No cae al login.
2. **Escritura offline**: mutación de prueba + `saveData()` → bandera `pendiente="true"`,
   banner mostrado, cambio persistido en la caché local.
3. **Reconexión**: `setOffline(false)` + evento `online` → bandera limpiada (`null`),
   banner retirado (el hook de reconexión hizo *flush*).
4. **Persistencia remota**: recarga online → el cambio de prueba estaba en
   `app_state.payload` de Supabase (confirmado leyendo la tabla). Prueba limpiada después
   de Supabase y de la caché local (`ABSENT`).

`node --check app.bundle.js` OK.

### Sigue pendiente (documentado, fuera de este alcance)

- **Registrar una inspección sin conexión.** Las inspecciones son relacionales y se crean
  vía Edge Function `inspection-workflow`; exigen un **outbox** que encole esas llamadas y
  las reenvíe al reconectar. No implementado. El offline actual cubre: arrancar y leer
  desde caché + resincronizar los módulos que aún viven en el blob (equipos, documentos,
  mapeos).

---

## 2026-09-22 — Ronda de endurecimiento P0/P1 + capa offline (app-shell)

Rama: `fix/p0-seguridad-y-versionado`. SW `v10.6.0`.

### Seguridad (todo verificado en vivo)

- **Escalada a IT cerrada.** `profiles.role` ya no es editable desde el cliente:
  `REVOKE` de escritura a `anon`/`authenticated` y `GRANT UPDATE (full_name,
  avatar_data_url, updated_at)` por columna. Un `PATCH` a `role` ahora es rechazado.
- **Cuentas semilla con contraseña publicada, cerrado.** Las 6 cuentas `.demo`
  (presidente/IT incluidos) usaban `12345678`, impreso en la pantalla de login.
  Contraseñas rotadas y el *hint* eliminado del bundle (2 ocurrencias). `12345678`
  ya no autentica.
- **Fuga por vista sin `security_invoker`, cerrado.** `qpc_report_content_status`
  filtraba `project_id`/período a anónimos. `security_invoker = on` aplicado a todas
  las vistas públicas; 0 filas a `anon` tras el cambio.
- **7 tablas demo abiertas a `anon`, cerrado.** Políticas `demo_*_all` eliminadas y
  `INSERT/UPDATE/DELETE` de `anon` revocados en todas las tablas/vistas.
- **Recuperación de cuenta arreglada (B-4).** `site_url` / `uri_allow_list` corregidos.
- **Registro abierto cerrado (B-5).** `disable_signup = true` y
  `password_min_length = 10`.
- **Cabeceras de seguridad desplegadas (B-10).** `vercel.json` con CSP, HSTS,
  X-Frame-Options DENY, COOP, Referrer-Policy, Permissions-Policy. **CSP verificada
  en preview** (no rompe scripts, estilos ni la conexión a Supabase).
- **Esquema versionado (B-2).** Baseline + delta de endurecimiento registrados como
  migraciones en `supabase_migrations.schema_migrations`
  (`20260921000000_endurecer_permisos.sql`).

### Contraseñas de desarrollo

- Las 12 cuentas `.demo` (6 semilla + 6 QA) unificadas a **una sola** contraseña
  fácil de teclear, para desarrollo. Aplicada y verificada login a login (12/12).
  No publicada en el login. Guardada en `~/.qpc-secrets` y entregada al usuario.

### Offline — app-shell (B-1, paso 1)

- **El service worker pasa de solo-push a offline.** `qpc-sw.js v10.6.0`:
  - `install`: precache del app-shell (index, manifest, iconos), tolerante a fallos.
  - `activate`: purga de caches `qpc-shell-*` antiguas + `clients.claim`.
  - `fetch`: navegaciones red-primero con *fallback* a `index.html` cacheado;
    estáticos same-origin cache-primero (respeta `?v=`) con runtime-cache;
    Supabase/CDNs siempre a red (nunca se cachea API en esta capa).
- **Registro incondicional** del SW en `runtime-loader.js`: ya no depende de que el
  navegador soporte Push/Notification. El flujo de push reutiliza el mismo registro.
- **Verificado en preview con la red cortada** (`navigator.onLine=false`): navegación
  `200`, login renderizado, 17 recursos del shell servidos desde caché.

### Offline — datos (B-1, pasos 2-3) · commit `69c1975`

Enfoque tras auditar la arquitectura: **la app es un único blob** (`app_state.payload`)
y `saveData()` ya persiste el estado completo en `localStorage` de forma síncrona en
cada cambio. Por eso NO hizo falta una cola por mutación ni tocar los 45 sitios de
lectura / 13 de escritura. Cambios (todos en `app.bundle.js` salvo el bump de versión):

- **Arranque offline.** `loadRemoteData`/`loadProfiles` y `qpcBootstrapV613`: sin red,
  arrancan desde el último estado guardado (incluye usuarios e inspecciones hechas
  offline aún sin sincronizar) en vez de mandar al login. La sesión local se conserva;
  ya no se hace `signOut` ante un error de red.
- **Escritura offline.** `saveData` marca una bandera "pendiente de sincronizar"
  (persistida) cuando el `upsert` falla; un listener `online` reenvía el blob completo
  al reconectar y limpia la bandera al subir bien.
- **Aviso visible.** Banner inferior "Sin conexión — trabajando offline…" / "Cambios
  pendientes de sincronizar…".
- Cache-busting a `10.7.0` (index.html, `QPC_VERSION` del SW, registros del SW).
- Verificado `node --check` en los 3 ficheros. **Verificación en vivo (red cortada +
  registrar inspección + reconexión) pendiente** tras el deploy del preview.

> **Corrección — verificación en vivo (2026-09-22, `localhost:8788` + Supabase real).**
> El offline de datos **no funciona en el código en vivo**. La app corre en `MAIN_MODE` +
> "phase3": las inspecciones se crean vía Edge Function `inspection-workflow` y se leen de
> un esquema **relacional** (`loadRelationalInspections`), no del blob `app_state.payload`.
> Registrar una inspección sin conexión exige un **outbox** de la Edge Function que aún no
> existe. Además, los edits del commit cayeron sobre copias **legacy** (código muerto) de
> `loadRemoteData`/`loadProfiles`/`saveData`; las funciones vivas (`window.loadRemoteData`
> ~L2091, `saveData` phase3 ~L3084) no llevan el fallback offline. El bloque de helpers
> (detección de red, banner, reconexión) sí quedó en ruta viva, pero nada lo invoca. El
> app-shell offline (SW 10.7.0) sí funciona. Alcance del offline de datos: pendiente de
> decidir (ver checklist §4).

### Pendiente tras esta ronda

- Verificar en vivo la capa de datos offline (registrar una inspección sin red y
  confirmar que se sincroniza al reconectar).
- Cerrar lectura anónima de `login_directory` (B-6).
- Rotar el secreto de push y moverlo a Vault (B-9).
- Ejercitar el ciclo de reportes completo (B-7); `qpc_quality_week()` en BD (B-8);
  vistas de ranking (B-11).
- Revocar 2 tokens de Vercel huérfanos.
- Decisión de despliegue a producción (`main`).
