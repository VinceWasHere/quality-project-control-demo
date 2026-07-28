# Despliegue MAIN V10.5 — Fase 26

## Alcance
- Corrección de **Mi perfil** en teléfonos donde la API `Notification` no existe o no está disponible en el modo actual del navegador.
- Modo compatible de perfil para evitar que una función opcional bloquee toda la vista.
- Navegación móvil escalonada: primero cierra el menú y entrega un frame al navegador, luego renderiza la sección.
- Cierre de sesión inmediato en la interfaz, sin esperar visualmente la respuesta de red de Supabase.
- Carga diferida de Chart.js, XLSX, jsPDF, AutoTable, PptxGenJS y PDF.js.
- Registro del Service Worker y carga de preferencias de notificación fuera de la ruta crítica.
- Pausa del reloj cuando la pestaña está oculta.
- Drawer móvil acelerado mediante transformaciones en lugar de cambios de posición.

## Pasos
1. Elimina los archivos actuales del branch `main`.
2. Sube todo el contenido de esta carpeta.
3. Espera el despliegue automático de Vercel.
4. En el teléfono, cierra completamente Safari/Chrome o la PWA.
5. Abre nuevamente la plataforma y realiza una recarga sin caché.

## No requiere
- SQL adicional.
- Cambios en Edge Functions.
- Cambios en Database Webhooks.

## Pruebas mínimas
### Perfil móvil
1. Inicia sesión desde el teléfono.
2. Abre el menú y pulsa **Mi perfil**.
3. Repite pulsando el avatar.
4. Confirma que puede modificar nombre e imagen.
5. Prueba también en Safari normal y, si aplica, en la PWA instalada.

### Rendimiento
1. Cambia entre Inicio, Inspecciones, Calificaciones e Instructivos.
2. Confirma que el drawer se cierra antes de cargar la vista.
3. Cierra sesión y verifica que el login aparezca inmediatamente.
4. Abre Calificaciones: Chart.js debe descargarse solo en esa sección.
5. Abre un PDF: PDF.js debe descargarse solo al usar el visor.

## Nota de caché
El Service Worker se actualizó a `10.5.0`. En iPhone puede ser necesario cerrar la PWA desde el selector de aplicaciones y abrirla otra vez para retirar la versión anterior.
