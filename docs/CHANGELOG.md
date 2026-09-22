# CHANGELOG — Quality Project Control

Formato: entradas por ronda de trabajo, lo más nuevo arriba. Fechas absolutas.
"Verificado" = comprobado en vivo (preview/BD), no supuesto por el código.

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

### Pendiente tras esta ronda

- Offline **de datos**: IndexedDB de catálogos + cola de sincronización (B-1, pasos 2-3).
- Cerrar lectura anónima de `login_directory` (B-6).
- Rotar el secreto de push y moverlo a Vault (B-9).
- Ejercitar el ciclo de reportes completo (B-7); `qpc_quality_week()` en BD (B-8);
  vistas de ranking (B-11).
- Revocar 2 tokens de Vercel huérfanos.
- Decisión de despliegue a producción (`main`).
