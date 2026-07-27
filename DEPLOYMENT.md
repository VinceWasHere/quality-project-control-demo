# Despliegue MAIN V9.9 — Fase 20

## Alcance
Esta fase habilita la visualización de instructivos relacionados y del mapeo original desde el formulario **Solicitar inspección**.

## Pasos
1. Sustituya el contenido del branch `main` por los archivos de esta carpeta.
2. Confirme el commit en GitHub.
3. Espere el despliegue automático de Vercel.
4. Realice una recarga sin caché.

## No requiere
- SQL nuevo.
- Edge Function nueva.
- Cambios manuales en Supabase.

## Prueba recomendada
1. Inicie sesión como Ingeniero de Ejecución.
2. Entre a **Solicitar inspección**.
3. Seleccione una planilla que tenga instructivos relacionados.
4. Pulse **Visualizar** en un instructivo disponible.
5. Confirme que el documento se abre en el visor interno.
6. Cambie de planilla y verifique que la lista se actualiza.
7. Pulse **Visualizar mapeo** y confirme que no se abre una pestaña nueva.
