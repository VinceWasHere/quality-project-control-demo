# RETOMAR QPC — punto de pausa

**Fecha de pausa:** 2026-09-23. Vincent pasa a otro proyecto. Este documento es el
único punto de entrada para retomar: dice dónde quedó todo, qué está hecho y qué falta,
en orden de prioridad. Detalle fino en `CHANGELOG.md` y `QPC_PRODUCTION_CHECKLIST.md`.

---

## Estado en una frase

El **bucle funcional central de la plataforma está completo, verificado en vivo y
desplegado**. Lo que queda para producción real son bloqueantes de **seguridad/infra**
(no de funcionalidad) más algunas mejoras funcionales acotadas.

## Coordenadas del proyecto

- **Código:** `C:\Users\antho\Documents\QPC` (sitio estático, sin build).
  Ficheros clave: `app.bundle.js` (código vivo en el IIFE phase3 ~L3052-3300; el resto es
  legacy acumulado — buscar siempre el ÚLTIMO override de una función), `index.html`,
  `qpc-sw.js` (service worker), `runtime-loader.js`, `styles.css`.
- **Versión desplegada:** bundle/SW `v10.8.2`. Al tocar estáticos hay que subir `?v=` en
  `index.html` (6 sitios) y `QPC_VERSION` en `qpc-sw.js` y la URL de registro en
  `runtime-loader.js:56`, o el SW sirve caché rancia.
- **Deploy:** Vercel por integración Git. Repo `VinceWasHere/quality-project-control-demo`,
  rama **`fix/p0-seguridad-y-versionado`** (preview). NO se ha mergeado a `main`.
- **Backend:** Supabase, ref `cwgpuaxjzpzlfusewtrx` → `https://cwgpuaxjzpzlfusewtrx.supabase.co`.
  Inspecciones **relacionales** vía Edge Function `inspection-workflow`. Secretos en
  `~/.qpc-secrets` (nunca en repo/docs/bundle).
- **Servidor local de pruebas:** `127.0.0.1:8788` (pythonw). Se cierra al pausar.
- **Cuentas dev:** 12 cuentas `.demo`, contraseña única `QpcDev-2026` (solo desarrollo).

## Hecho y verificado en vivo (no tocar salvo regresión)

- **Máquina de estados de inspección E2E**, persistida tras recarga desde servidor:
  LIBERADA (100%), CON_OBSERVACIONES (89,4%), CON_OBSERVACIONES→SEGUIMIENTO→LIBERADA,
  CON_OBSERVACIONES→CIERRE→CERRADA (`closure_code=QQ0001`), NO_LIBERADA (0%).
- **Bug crítico de la Bandeja de Calidad** corregido: CALIDAD veía 0 inspecciones por falta
  de filas en `project_members` (RLS resuelve acceso por esa tabla, NO por
  `profiles.project_ids`). Backfill idempotente aplicado; la ruta viva ya lo sincroniza.
- **Fecha propuesta caducada** corregida (envenenaba los códigos de inspección).
- **Toast falso "Borrador pendiente"** al finalizar visita corregido.
- **Matriz de roles**: verificados en vivo los 3 extremos (EJECUCION aislado, CALIDAD
  completo, PRESIDENTE lectura total sin evaluar).
- Seguridad P0, cabeceras/CSP, y app-shell offline (lectura/escritura del blob) cerrados.

## Pendiente — punto de retoma sugerido primero

### Funcional (mejoras acotadas)
1. **Ciclo de reportes (B-7)** — *sugerido para empezar*. `qpc_report_cycles` tiene 0 filas;
   la semana de calidad jueves→miércoles nunca se probó con datos.
2. **Matriz de roles** — faltan en vivo: COORDINADOR_CALIDAD, GERENCIA, IT (mismo modelo
   `role_permissions`, bajo riesgo).
3. **Outbox offline de inspecciones** — registrar una inspección sin conexión (relacional,
   exige encolar llamadas a la Edge Function). Es BLOQUEANTE del objetivo "usable en obra".
4. `qpc_quality_week()` (B-8) y vistas de ranking (B-11): hoy solo en frontend.
5. Limpiar Edge Function huérfana `admin-create-user` (escribe `project_ids` pero no
   `project_members`) — confirmar borrable.

### Seguridad / infra — BLOQUEANTES antes de usuarios reales (Vincent los aplazó a "el final")
- Rotar el secreto del webhook de push a Supabase Vault (B-9, hoy en texto plano).
- Cerrar lectura anónima de `login_directory` (B-6): mover tras Edge Function que no exponga
  la nómina completa a `anon`. Relacionado: como EJECUCION, `data.users` trae los 13 perfiles.
- Sustituir la contraseña única `QpcDev-2026` por cuentas/contraseñas reales.
- Revocar 2 tokens de Vercel huérfanos.
- Merge `fix/p0-seguridad-y-versionado` → `main` solo cuando cierren los bloqueantes.

## Trampas conocidas (para no tropezar al retomar)

- **Código vivo vs legacy:** en `app.bundle.js` conviven copias muertas y overrides vivos.
  Grep del último override. `phase3`, `supabaseClient`, `loadRelationalInspections`,
  `startVisit` son closure-scoped (no en window); `openEvaluation`, `startNewVisit`,
  `createInspection`, `finishEvaluation`, `takeInspection` sí están en window.
- **Opciones de plantilla** son objetos `{label, factor}`, no strings.
- **Service worker cache-first:** para ver ediciones hay que subir `?v=` o desregistrar SW +
  limpiar cachés.
- **AI Bridge:** comandos compuestos (`;`) y `-m` multilínea rompen el clasificador; usar
  comandos limpios y `commit -F <fichero>`. La generación avanza con cada Edit/Write.
