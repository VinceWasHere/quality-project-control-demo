# Despliegue MAIN V9.5 — Fase 16

## 1. Supabase
Ejecute en SQL Editor:

`supabase/migrations/20260727_016_report_review_publication.sql`

No requiere una Edge Function nueva.

## 2. GitHub y Vercel
Suba **únicamente el contenido de esta carpeta limpia** al branch `main`.
Vercel desplegará automáticamente.

## 3. Validación
1. Inicie sesión como Calidad o IT.
2. Abra `Contenido de informes`.
3. Verifique el panel `Revisión y publicación`.
4. Guarde notas, marque listo, apruebe y publique con cuentas que tengan los permisos correspondientes.
5. Confirme que el número de versión publicada aumenta.

## Limpieza realizada
La carpeta anterior tenía alrededor de 76 elementos en la raíz. Esta entrega elimina de la raíz:
- copias duplicadas de SQL;
- `VERSION_*.txt`;
- `README_FIX_*.txt`;
- deployment históricos separados;
- archivos TypeScript duplicados fuera de `supabase/functions`;
- `archive/legacy-js`;
- validaciones antiguas;
- `data/planillas.json` no cargado;
- `data/equipment_seed.js` y su script en `index.html`.

El historial funcional permanece en `README.md`, y el historial técnico de base se conserva en `supabase/migrations`.
