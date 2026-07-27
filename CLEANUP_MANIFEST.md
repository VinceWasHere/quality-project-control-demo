# Manifiesto de consolidación V9.5

## Archivos necesarios en producción
- `index.html`
- `styles.css`
- `app.bundle.js`
- `supabase-config.js`
- `assets/`
- `data/catalogos.js`

## Archivos necesarios para mantenimiento
- `supabase/config.toml`
- `supabase/migrations/`
- `supabase/functions/`
- `tests/static-checks.mjs`
- `README.md`
- `DEPLOYMENT.md`

## Eliminados por duplicidad o desuso
Las copias de scripts SQL y Edge Functions que estaban en la raíz fueron eliminadas porque su versión canónica ya existe en `supabase/`.
Los JavaScript históricos de `archive/legacy-js` no eran cargados por `index.html`.
Los archivos `VERSION_*`, `README_FIX_*` y deployment anteriores fueron sustituidos por el changelog acumulativo del README y la guía vigente.
