# Despliegue MAIN V10.4 — Fase 25

## Alcance
- Corrección definitiva del acceso móvil a Mi perfil.
- Restauración de Mi perfil para Tecnología (IT).
- Visor PDF multipágina con navegación, zoom, ajuste y giro.

## Pasos
1. Elimina los archivos actuales del branch `main`.
2. Sube todo el contenido de esta carpeta.
3. Espera el despliegue automático de Vercel.
4. Cierra por completo la pestaña anterior. En iPhone, cierra Safari o la PWA desde el selector de aplicaciones.
5. Abre nuevamente la plataforma y realiza una recarga sin caché cuando el navegador lo permita.

## No requiere
- SQL adicional.
- Nuevas Edge Functions.
- Cambios en Database Webhooks.

## Pruebas mínimas
### Mi perfil
1. Inicia sesión con Ejecución, Calidad e IT desde un teléfono.
2. Abre el menú lateral.
3. Pulsa Mi perfil.
4. Confirma que el drawer se cierra y aparece la vista.
5. Repite pulsando el avatar superior.

### PDF
1. Abre Instructivos.
2. Visualiza el PDF de Colocación de Pisos.
3. Usa `Siguiente`, `Anterior` y el campo Página.
4. Verifica todas las páginas sin descargar.
5. Prueba zoom, ajuste y giro.

## Dependencia web
El visor carga la versión fijada `pdf.js 3.11.174` desde cdnjs. Si el CDN no está disponible, la aplicación muestra la vista nativa y conserva el botón Descargar.
