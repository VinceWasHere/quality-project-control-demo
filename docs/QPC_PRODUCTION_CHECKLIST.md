# QPC — Checklist de producción

Qué falta para pasar de la rama de preview a producción (`main`) con seguridad.
Marcar `[x]` al cerrar. Estado a 2026-09-22.

Leyenda: **[BLOQUEANTE]** impide ir a producción · **[RECOMENDADO]** hacer antes de
usuarios reales · **[SEGUIMIENTO]** puede ir después con riesgo acotado.

---

## 1. Secretos y credenciales

- [ ] **[BLOQUEANTE]** Rotar el secreto del webhook de push: hoy sigue en texto plano
      en el trigger en vivo (B-9). Moverlo a Supabase Vault y leerlo desde ahí.
- [ ] **[BLOQUEANTE]** Cambiar la contraseña única de desarrollo (`QpcDev-2026`) por
      cuentas y contraseñas fuertes reales antes de exponer a usuarios de CODELPA.
      Las `.demo` son de desarrollo, no de producción.
- [ ] **[RECOMENDADO]** Revocar los 2 tokens de Vercel huérfanos.
- [ ] **[RECOMENDADO]** Confirmar que `service_role` no aparece en ningún bundle ni
      documento; solo `sb_publishable_…` va al navegador (verificado en esta ronda).
- [ ] **[SEGUIMIENTO]** Inventario de credenciales al día en `~/.qpc-secrets`
      (sin valores en repos ni docs).

## 2. Base de datos y RLS

- [x] Escalada de privilegios por columna cerrada (grants por columna en `profiles`).
- [x] Vistas con `security_invoker = on` (no bypass de RLS).
- [x] 7 tablas demo cerradas a `anon`.
- [x] Esquema versionado como migraciones registradas.
- [ ] **[BLOQUEANTE]** Cerrar lectura anónima de `login_directory` (B-6): moverlo tras
      una Edge Function que no exponga la nómina completa a `anon`.
- [ ] **[RECOMENDADO]** Replay-test de la baseline en un proyecto Supabase limpio,
      para probar que las migraciones reconstruyen el esquema de cero.
- [ ] **[RECOMENDADO]** Revisar que RLS está activo en TODA tabla con datos de negocio
      (no solo las demo).

## 3. Frontend y cabeceras

- [x] `vercel.json` desplegado con CSP, HSTS, X-Frame-Options, COOP, etc.
- [x] CSP verificada en preview (no rompe scripts/estilos/Supabase).
- [x] La pantalla de login no muestra ninguna contraseña.
- [ ] **[RECOMENDADO]** Verificar `img-src`/`worker-src` con un flujo logueado real
      (subida de fotos de inspección, generación de PDF/XLSX).

## 4. Offline (requisito del prompt maestro)

- [x] App-shell offline (SW v10.8.0), verificado con red cortada.
- [x] **Datos offline — alcance mínimo, VERIFICADO en vivo** (2026-09-22, `localhost:8788`
      + Supabase real, cuenta `qa.ejecucion@codelpa.demo`, SW v10.8.0). Se decidió (b)
      **alcance mínimo** y se portó a las funciones **vivas** (no a las legacy):
      - **Arranque + lectura offline desde caché**: el wrapper más externo de
        `window.loadRemoteData` (~L6343) hidrata `data` desde `localStorage
        [qpc_supabase_v6_cache]` ante error de red; `loadProfiles` conserva usuarios
        cacheados; bootstrap omite `refreshSession()` si `navigator.onLine===false` (evita el
        cuelgue de ~20 s). Verificado: dashboard completo en ~3 s sin red, sin caer al login.
      - **Escritura offline + reconexión**: `saveData` marca bandera "pendiente" y muestra
        banner cuando el `upsert` falla; el listener `online` reenvía y limpia la bandera.
        Verificado ciclo completo, incluida la **persistencia remota** en `app_state.payload`
        de Supabase tras reconectar (prueba limpiada después).
- [ ] **[BLOQUEANTE para el objetivo — pendiente]** Registrar una **inspección** sin
      conexión. Las inspecciones son relacionales (Edge Function `inspection-workflow`), no
      viven en el blob; exige un **outbox** que encole esas llamadas y las reenvíe al
      reconectar (no existe). El alcance mínimo cubre arrancar/leer desde caché + resync de
      los módulos que aún usan el blob (equipos/documentos/mapeos), no crear inspección offline.

## 5. Funcional

- [x] **Máquina de estados de inspección verificada E2E** (2026-09-22, `localhost:8788` +
      Supabase real, persistido tras recarga desde el servidor). Ramas comprobadas:
      LIBERADA (100%), CON_OBSERVACIONES (89,4%), CON_OBSERVACIONES→SEGUIMIENTO→LIBERADA,
      CON_OBSERVACIONES→CIERRE→CERRADA (`closure_code=QQ0001`), y NO_LIBERADA (0%). Flujo:
      Solicitar → Bandeja → Tomar → Planilla → decisión, todo relacional vía Edge Function.
- [x] **Corregido** el toast falso "Borrador pendiente" tras finalizar una visita
      (`finishEvaluation` cancela el timer de autoguardado de borrador antes de cerrar).
- [x] **Bug de la Bandeja de Calidad corregido** (severidad alta): CALIDAD veía 0
      inspecciones porque las cuentas QA semilla no tenían filas en `project_members`
      (RLS resuelve el acceso al proyecto por esa tabla, no por `profiles.project_ids`).
      Backfill idempotente aplicado; la ruta viva (`admin-user-management`) ya lo sincroniza.
- [ ] **[SEGUIMIENTO]** Confirmar que la Edge Function huérfana `admin-create-user`
      (escribe `profiles.project_ids` pero no `project_members`) es borrable / no se usa.
- [ ] **[RECOMENDADO]** Ejercitar el ciclo de reportes completo (B-7):
      `qpc_report_cycles` tiene 0 filas; la semana de calidad jueves→miércoles nunca
      se ha probado con datos.
- [ ] **[RECOMENDADO]** Matriz de roles probada con las 6 cuentas QA: confirmar que
      cada rol ve y hace solo lo suyo (ver `QPC_ROLE_TEST_MATRIX.md` cuando exista).
- [ ] **[SEGUIMIENTO]** `qpc_quality_week()` en la BD (B-8) y vistas de ranking (B-11),
      hoy solo en el frontend.

## 6. Despliegue

- [ ] **[BLOQUEANTE]** Merge de `fix/p0-seguridad-y-versionado` → `main` solo cuando
      los BLOQUEANTES de arriba estén cerrados.
- [ ] Tras el merge, verificar en producción (`main`) lo mismo que se verificó en
      preview: SW 10.6.0 activo, CSP presente, `12345678` rechazado, offline OK.
- [ ] Bump de `?v=` en `index.html` y de `QPC_VERSION` en `qpc-sw.js` en cada deploy
      que cambie estáticos (así el cache-busting y la purga de caché funcionan).

---

### Resumen del estado

Cerrado y verificado: todo el P0 de seguridad, cabeceras/CSP, y el app-shell offline.
Antes de producción real quedan como bloqueantes: secreto de push en Vault, cerrar
`login_directory`, credenciales reales, y —para cumplir el objetivo de uso en obra—
la capa de datos offline.
