# SOURCE NOTES — V10.2

- Supabase continúa siendo la fuente única de las notificaciones internas (`qpc_notifications`).
- Las notificaciones del dispositivo no crean eventos paralelos: replican la misma fila mediante Web Push.
- El navegador exige consentimiento explícito del usuario.
- El Service Worker permite visualizar la alerta con la pestaña en segundo plano; el envío con la aplicación cerrada depende de la suscripción Web Push y del Database Webhook.
