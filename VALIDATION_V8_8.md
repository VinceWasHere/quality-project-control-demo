# Validación V8.8.0

Validaciones ejecutadas antes de empaquetar:

- Sintaxis de `app.bundle.js` mediante `node --check`.
- Escala de gráficos configurada en 0–100.
- Plugin de líneas de referencia presente.
- Filtro de asignación en Mis inspecciones presente.
- Chevrón SVG del combobox presente.
- Rotación visual del chevrón presente.
- Invalidación de caché a V8.8.0 en `index.html`.

La validación final de comportamiento debe realizarse en Vercel con la sesión y los datos reales de Supabase.
