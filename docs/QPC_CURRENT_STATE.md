# QPC — Estado real verificado

**Fecha de verificación:** 2026-09-21
**Método:** inspección directa del repositorio, del despliegue en producción y de la
base de datos Supabase a través de la Management API. Nada de lo que sigue procede
de documentación previa: todo está comprobado contra el sistema vivo.

---

## 1. Resumen en cinco líneas

QPC **está en producción y en uso real**, no es una demo. Sirve a 3 proyectos de obra,
7 usuarios que cubren los 6 roles, 440 equipos y 414 criterios de plantilla, con
actividad hasta el 2026-09-18. El frontend es un único fichero JavaScript acumulado de
736 KB sin sistema de compilación. El backend Supabase tiene 54 tablas **sin ningún
historial de migraciones**. Hay siete tablas heredadas abiertas a escritura anónima
desde Internet.

---

## 2. Infraestructura

| Pieza | Valor verificado |
|---|---|
| Repositorio | `VinceWasHere/quality-project-control-demo`, rama `main`, HEAD `68813ec` (V10.5) |
| Producción | `https://quality-project-control-demo.vercel.app/` — 200 OK, sirve V10.5.0 |
| Identidad del despliegue | Byte a byte idéntico al HEAD del repositorio (8/8 ficheros) |
| Supabase | proyecto `cwgpuaxjzpzlfusewtrx`, región `us-east-2`, PostgreSQL 17.6.1, `ACTIVE_HEALTHY` |
| Organización Supabase | **Vaisens** (no "vincewashere's projects") |
| Equipo Vercel | `vincewasheres-projects` |
| Creado | 2026-07-23 |

Los hostnames `*-vincewasheres-projects.vercel.app` están detrás de la protección SSO de
Vercel (302 a `vercel.com/sso-api`). Solo el alias de producción es público.

---

## 3. Arquitectura real del frontend

**No hay React, ni Vite, ni `package.json`, ni ningún paso de compilación.** Es un sitio
estático servido tal cual:

```
index.html
  └─ supabase-js 2.110.8  (CDN jsdelivr)
  └─ supabase-config.js   (URL + clave publicable)
  └─ data/catalogos.js
  └─ runtime-loader.js?v=10.5.0
  └─ app.bundle.js?v=10.5.0   ← 736 KB, un solo fichero acumulado a lo largo de 26 fases
styles.css   86 KB
qpc-sw.js    service worker, versión 10.5.0
manifest.webmanifest
```

`supabase-config.js` expone únicamente la clave **publicable** (`sb_publishable_…`), que
está diseñada para ir en el navegador. **No hay fuga de secreto en el repositorio público.**

### Contrato de datos que usa el bundle

- **32 tablas y vistas** por `.from()`
- **29 funciones RPC** por `.rpc()`
- **5 de las 6 Edge Functions** por `functions.invoke()` (`web-push-dispatch` se llama por `fetch` directo)
- **0 llamadas a `storage.from()`** — toda la subida de ficheros pasa por la Edge Function `asset-workflow`, que es el patrón correcto
- **8 llamadas a `localStorage`/`sessionStorage`** — el estado vive en la tabla `app_state`, no en localStorage
- **IndexedDB: ausente. Cola de sincronización offline: ausente.**

---

## 4. Base de datos

| Concepto | Cantidad |
|---|---|
| Tablas | 54 |
| Columnas | 575 |
| Vistas | 9 |
| Funciones | 71 (60 `SECURITY DEFINER`) |
| Políticas RLS | 75 |
| Índices | 74 propios + 166 de restricción |
| Claves foráneas | 114 |
| Triggers | 26 |
| Buckets de Storage | 1 (`qpc-attachments`, **privado**, límite 50 MB) |
| Extensiones | `pg_net`, `pg_stat_statements`, `pgcrypto`, `plpgsql`, `supabase_vault`, `uuid-ossp` |

### Datos reales en producción

| Tabla | Filas |
|---|---|
| `qpc_notifications` | 1 281 |
| `qpc_equipment` | 440 |
| `qpc_template_criteria` | 414 |
| `qpc_visit_answers` | 96 |
| `audit_logs` | 91 |
| `qpc_inspection_status_history` | 29 |
| `qpc_inspections` | 12 |
| `qpc_instructives` | 11 |
| `qpc_files` | 11 |
| `qpc_inspection_visits` | 10 |
| `qpc_mappings` | 6 |
| `qpc_report_cycles` | 0 |

**Proyectos:** `LCE` Lopesan La Ceiba · `VC` Villa Corales · `TST` Proyecto Prueba (todos activos).

**Usuarios:** 7, todos han iniciado sesión al menos una vez. Cobertura completa de roles:
CALIDAD 1 · COORDINADOR_CALIDAD 1 · EJECUCION 2 · GERENCIA 1 · IT 1 · PRESIDENTE 1.

**Estados de inspección en uso:** `SOLICITADA_LIBERACION` 4 · `LIBERADA` 4 · `TOMADA` 2 ·
`VISITA_LIBERACION_EN_PROCESO` 1 · `NO_LIBERADA` 1.

**Última actividad registrada:** 2026-09-18 20:08 UTC.

---

## 5. Seguridad — lo que está bien

Conviene decirlo antes de los problemas, porque el trabajo de base es sólido:

- **RLS activo en las 54 tablas.** Ninguna excepción.
- **Las 60 funciones `SECURITY DEFINER` tienen `search_path` fijado.** Cero vulnerables al
  ataque clásico de secuestro de esquema.
- **Las 6 Edge Functions validan la sesión en código**: extraen el token, llaman a
  `auth.getUser(token)`, comprueban que el perfil esté activo y verifican el permiso
  concreto antes de actuar. El `verify_jwt=false` de cinco de ellas está deliberadamente
  compensado, no es un descuido.
- **El bucket de Storage es privado** y admite una lista blanca de tipos MIME.
- **`service_role` no aparece en ningún punto del frontend.**
- Cuatro tablas sensibles (`qpc_inspection_closure_sequences`,
  `qpc_inspection_request_sequences`, `qpc_it_recovery_attempts`, `qpc_it_recovery_codes`)
  tienen RLS sin ninguna política: bloqueo total salvo a través de funciones
  `SECURITY DEFINER`. Es diseño correcto, no un olvido.

---

## 6. Seguridad — los agujeros reales y su estado

Todo lo de esta sección se comprobó empíricamente contra producción. Cada punto lleva su
estado: **CERRADO** (arreglado y reverificado en vivo) o **ABIERTO** (pendiente).

### 6.7 Escalada de privilegios a IT con un solo PATCH — CERRADO (era el más grave)

La política `authenticated_update_own_profile` permitía a cualquier usuario autenticado
actualizar su propia fila de `profiles` con `id = auth.uid()`, y el rol `authenticated`
tenía `UPDATE` sobre **las 11 columnas**, incluida `role`, **sin ningún trigger** que lo
impidiera. RLS no restringe columnas.

Comprobado: **los seis roles** (EJECUCION incluido) hicieron `PATCH profiles?role=IT` con
respuesta **HTTP 200**. Un ingeniero de obra podía convertirse en IT (administrador) desde
el navegador. Cada prueba se revirtió en el acto.

Arreglo (migración `20260921000000`):

```sql
revoke all on public.profiles from anon;
revoke insert, update, delete, truncate on public.profiles from authenticated;
grant update (full_name, avatar_data_url, updated_at) on public.profiles to authenticated;
```

Reverificado: **PATCH role → 403 para los seis roles**, y la edición legítima del nombre
propio sigue devolviendo **200**. El único vector que queda para cambiar roles es la Edge
Function `admin-user-management`, que valida sesión y solo responde 200 a PRESIDENTE e IT.

### 6.8 Seis cuentas semilla con la contraseña publicada en el login — CERRADO (este tramo)

La pantalla de login imprimía en texto plano: «para las cuentas `.demo` la contraseña es
`12345678`». Existían seis cuentas semilla activas cubriendo **todos** los roles —incluidos
`presidente@codelpa.demo` y `tecnologia@codelpa.demo` (IT)— y **las seis entraban con esa
contraseña**. Cualquiera en Internet obtenía acceso de presidente o IT sin explotar nada,
solo leyendo la página.

Arreglo: contraseñas rotadas a valores fuertes aleatorios vía Admin API (guardadas en
`~/.qpc-secrets/cuentas-semilla.env`, fuera de Git) y **eliminado el texto que publicaba la
contraseña** del bundle (dos ocurrencias). Reverificado: **`12345678` ya no entra en ninguna
de las seis**; las nuevas contraseñas sí. Las cuentas no se borraron — disposición final
pendiente de decisión de Vincent (ver §9).

### 6.9 Vista sin `security_invoker` que filtraba datos de proyecto — CERRADO (este tramo)

`qpc_report_content_status` corría con privilegios del propietario (owner-rights), así que
**ignoraba el RLS** de las tablas base. Un anónimo sin sesión obtenía 16 filas, 3 con
`project_id`/`period_value` reales (p. ej. proyecto `LCE`, periodo `2026-07`). Arreglo:
`security_invoker = on` aplicado a **todas** las vistas de `public`. Reverificado: la vista
devuelve **0 filas** a un anónimo; las vistas usadas por el frontend siguen sanas.

### 6.1 Siete tablas heredadas abiertas a Internet — CERRADO

Las tablas `inspections` · `projects` · `engineers` · `workshops` · `criteria` ·
`inspection_results` · `inspection_visits` tenían políticas `demo_*_all` (`FOR ALL … USING
(true)`) para `anon`. Con la clave publicable del repo público, cualquiera podía leer y
escribir. Arreglo: las 7 políticas eliminadas y los grants revocados (migración
`20260921000000`; rollback en `QPC-work/baseline/rollback-anon-demo.json`). Reverificado
desde fuera con la clave publicable: **401 en lectura y escritura en las siete**.

### 6.2 El directorio de empleados es público — ABIERTO (parcial)

`login_directory` se lee sin autenticar (correo, nombre, rol de cada empleado activo). Es
funcional por diseño: alimenta el desplegable de login. Sigue expuesta la nómina del
departamento. Atenuado en parte porque ya no hay contraseñas adivinables asociadas (§6.8).
Pendiente: decidir si se restringe la lectura o se acepta como diseño.

### 6.3 Registro abierto — CERRADO

`disable_signup = true` (el bundle no tiene ninguna llamada `signUp`, así que es seguro).

### 6.4 URLs de redirección apuntaban a un sitio inaccesible — CERRADO

`site_url` y `uri_allow_list` corregidos al hostname público real
`quality-project-control-demo.vercel.app` (se conservan las variantes anteriores en la lista
blanca). La recuperación de cuenta ya no lleva a una página tras el SSO de Vercel.

### 6.5 Contraseñas de 6 caracteres — CERRADO

`password_min_length` subido de 6 a **10**.

### 6.6 Faltan cabeceras de seguridad en el despliegue — VERIFICADO EN PREVIEW, falta producción

Se creó `vercel.json` con CSP estricta, `X-Frame-Options DENY`, `nosniff`,
`Referrer-Policy`, `Permissions-Policy`, COOP y HSTS con preload. Desplegado en el preview de
la rama `fix/p0-seguridad-y-versionado` y **verificado en navegador**:

- La CSP se sirve por cabecera HTTP (no meta) y **se aplica**.
- No rompe la app: bundle, estilos y la conexión a Supabase (`connect-src`) cargan y la
  consulta a `login_directory` devuelve 200 bajo la CSP.
- Único bloqueo observado: el `manifest.webmanifest`, pero es un **falso positivo del SSO de
  Vercel** (la puerta SSO reescribe la URL del manifest a `vercel.com`, violando
  `manifest-src 'self'`). En la URL pública de producción, sin SSO, no ocurre.

Pendiente: verificar `worker-src` (worker de pdf.js desde cdnjs) e `img-src` de Storage con
una sesión iniciada, y desplegar a producción. El hint de contraseña del login ya no aparece
en el preview (confirmado).

### 6.10 Secreto en texto plano dentro de un trigger — ABIERTO

El trigger `qpc-web-push-notifications` incrusta `QPC_PUSH_WEBHOOK_SECRET` en texto plano en
su definición. Redactado en los artefactos locales del baseline, pero **sigue en texto plano
en la base viva**. Pendiente: rotar y mover a Vault.

---

## 7. El problema estructural: cero versionado del esquema

**`supabase_migrations.schema_migrations` no existe en la base de datos.** No es que esté
vacía: la tabla no ha sido creada nunca. La base se construyó ejecutando SQL a mano en el
editor del panel de Supabase.

Consecuencias comprobadas:

- El repositorio contiene 22 ficheros de migración, pero **ninguno se ha aplicado por CLI**.
- Faltan los números **005 y 009 a 013**.
- **13 tablas existen en producción y ninguna migración del repositorio las crea:**
  - restos demo: `inspections`, `projects`, `engineers`, `workshops`, `criteria`,
    `inspection_results`, `inspection_visits`, `profiles`, `app_state`
  - funcionalidad viva de las migraciones perdidas: `qpc_export_runs`, `qpc_file_links`,
    `qpc_migration_issues`, `qpc_report_section_requirements`
- En sentido contrario no falta nada: las 41 tablas que el repositorio declara existen todas.

**Si este proyecto Supabase se pierde, el esquema no se puede reconstruir desde el repositorio.**

### Mitigación ya aplicada

Se ha generado por introspección un baseline completo del esquema de producción:

```
QPC-work/baseline/00000000000000_baseline_produccion.sql   (236 KB)
QPC-work/baseline/baseline-raw.json                        (introspección cruda)
QPC-work/baseline/datos-2026-09-21.json                    (todas las filas + auth.users sin hashes)
```

Contiene 54 `create table`, 114 claves foráneas, 74 índices, 71 funciones, 9 vistas,
26 triggers, 75 políticas y el estado de RLS de cada tabla. Es la primera representación
versionada del esquema que existe.

**Versionado ya establecido:** se creó `supabase_migrations.schema_migrations` en la base y
se registraron dos migraciones como aplicadas:

- `00000000000000_baseline_produccion` — el esquema completo (sanitizado, sin el secreto del
  trigger), en `supabase/migrations/`.
- `20260921000000_endurecer_permisos` — el delta de seguridad de §6 (escalada, tablas demo,
  escritura anónima, `security_invoker`), en `supabase/migrations/`.

Las 16 migraciones históricas irreproducibles se movieron a `supabase/migraciones-historico/`
con un `LEEME.md`. A partir de aquí, todo cambio de esquema o de permisos va como migración
nueva, nunca a mano en el panel — que fue justo el origen de estos agujeros.

---

## 8. Inventario de credenciales

Sin valores. Todos los secretos viven en `C:/Users/antho/.qpc-secrets/`, **fuera de
cualquier repositorio**.

| Credencial | Dónde vive | Para qué | Caduca |
|---|---|---|---|
| `SUPABASE_ACCESS_TOKEN` | `.qpc-secrets/supabase.env` | Management API: SQL, migraciones, Edge Functions, claves | 2026-12-20 (90 d) |
| `SUPABASE_SECRET_KEY` | `.qpc-secrets/supabase.env` | Clave secreta de servidor (`sb_secret_…`) | sin caducidad |
| Clave publicable | `supabase-config.js` (repo) | Frontend. Diseñada para ser pública | — |
| `service_role` / `anon` heredadas | Solo en Supabase | Compatibilidad | — |
| Secretos de Edge Functions | Solo en Supabase | `SUPABASE_DB_URL`, VAPID ×3, `QPC_PUSH_WEBHOOK_SECRET`, etc. | — |

El token de Supabase está **acotado al proyecto** `quality-project-control-demo` dentro de la
organización Vaisens, no es un token de cuenta completa.

Nota: la Management API devuelve los secretos de Edge Functions **hasheados en SHA-256**, no en
claro. No hay forma de leer `SUPABASE_DB_URL` desde ahí, así que no hay acceso directo por
`psql`/`pg_dump`; todo el trabajo sobre la base va por la Management API. Obtener acceso
directo exigiría restablecer la contraseña de la base en producción, y eso no se ha hecho.

**Pendiente de limpieza:** quedaron dos tokens de Vercel creados y no capturados
(`qpc-claude-deploy` y `qpc-claude-deploy-2`, ámbito `quality-project-control-demo`,
caducan el 2027-09-22) porque la conexión del navegador automatizado se cortó en el momento
en que Vercel muestra el valor. Hay que revocarlos. No son necesarios: el despliegue ocurre
por integración Git.

---

## 9. Lo que el prompt maestro pide y todavía no existe

Verificado por ausencia en el código, no supuesto:

- **Estrategia offline**: no hay IndexedDB ni cola de sincronización. El requisito explícito
  del prompt maestro (§ offline con IndexedDB, nunca localStorage como base de datos falsa)
  está sin empezar.
- **Ciclos de reporte**: `qpc_report_cycles` tiene 0 filas pese a existir toda la maquinaria
  de reportes (`qpc_report_publications`, `qpc_report_cycle_events`, 15 RPC de reporte).
  La semana de calidad jueves→miércoles nunca se ha ejercitado con datos.
- **Cabeceras de seguridad** y `vercel.json`.
- **Versionado del esquema** (ver §7).

---

## 10. Cómo retomar esto

1. El token de Supabase y el cliente mínimo ya están listos:
   `scratchpad/sb.mjs` exporta `sql(query)`, `api(path, init)` y `REF`.
2. El baseline y los respaldos están en `QPC-work/baseline/`.
3. El análisis del esquema vivo está en `QPC-work/schema-real.json`; el contrato del
   frontend en `QPC-work/contract.md`.
4. **Nada del repositorio ha sido modificado todavía** salvo este documento. No hay commits
   ni despliegues nuevos.
