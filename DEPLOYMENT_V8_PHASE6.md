# Quality Project Control MAIN V8.5 · Fase 6

## Alcance

Esta fase corrige la visualización de tablas anchas y amplía exportaciones corporativas.

## Pasos de despliegue

1. Reemplazar el contenido del branch `main` con esta carpeta.
2. Confirmar que `index.html` carga:
   - `styles.css?v=8.5.0`
   - `app.bundle.js?v=8.5.0`
   - `pptxgenjs@3.12.0`
3. Esperar el despliegue automático de Vercel.
4. Hacer recarga sin caché en el navegador.

## Supabase

No requiere SQL nuevo.
No requiere Edge Function nueva.

## Validaciones recomendadas

- Abrir Calificaciones y confirmar que solo exista una barra horizontal superior por tabla.
- Confirmar que un taller sin nombre no aparezca como `Migrado`, sino como `Sin taller asignado`.
- Abrir Proyectos y revisar que los campos de Áreas mantengan el estilo visual de la app.
- Generar vista previa PDF de talleres, ingenieros y puntos débiles y confirmar que aparece una página de gráfico antes de la tabla.
- Generar informe completo en PDF y revisar las hojas pendientes para completar manualmente.
- Generar informe completo en PPTX y validar que se descargue como archivo editable.

## Nota sobre fidelidad visual

El exportable PPTX sigue la estructura FO-CP-10 V07 para informes semanales y FO-CP-11 V10 para cierres mensuales. Las páginas que requieren evidencias no automatizables se crean como plantillas listas para completar manualmente.
