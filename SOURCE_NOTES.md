# SOURCE NOTES — V10.2

- Supabase continúa siendo la fuente única de las notificaciones internas (`qpc_notifications`).
- Las notificaciones del dispositivo no crean eventos paralelos: replican la misma fila mediante Web Push.
- El navegador exige consentimiento explícito del usuario.
- El Service Worker permite visualizar la alerta con la pestaña en segundo plano; el envío con la aplicación cerrada depende de la suscripción Web Push y del Database Webhook.


## V10.4 — Fase 25
- Se añade PDF.js 3.11.174 en `index.html` para renderización multipágina.
- Se agrega una capa final no destructiva para garantizar Mi perfil en todos los roles y dispositivos.
