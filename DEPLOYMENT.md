# Quality Project Control MAIN V10.2 — Fase 23

## Objetivo
Permitir que cada usuario acepte notificaciones del dispositivo. Las alertas web se originan en la misma tabla `qpc_notifications` que alimenta la bandeja interna.

## 1. Ejecutar SQL
Ejecute en Supabase SQL Editor:

`supabase/migrations/20260727_022_device_web_notifications.sql`

## 2. Generar claves VAPID
Abra localmente:

`tools/vapid-key-generator.html`

Pulse **Generar claves** y copie ambos valores. El archivo no envía información a internet.

## 3. Configurar Secrets en Supabase
En **Edge Functions → Secrets**, agregue:

- `WEB_PUSH_VAPID_PUBLIC_KEY`: clave pública generada.
- `WEB_PUSH_VAPID_PRIVATE_KEY`: clave privada generada.
- `WEB_PUSH_VAPID_SUBJECT`: por ejemplo `mailto:calidad@codelpa.com`.
- `QPC_PUSH_WEBHOOK_SECRET`: una frase aleatoria larga, distinta de las contraseñas de usuario.

No suba la clave privada ni el secreto del webhook a GitHub o Vercel.

## 4. Desplegar Edge Function
Cree o despliegue desde el editor web de Supabase:

- Nombre: `web-push-dispatch`
- Código: `supabase/functions/web-push-dispatch/index.ts`
- Verify JWT: desactivado.

La función valida el webhook con `x-qpc-push-secret`. El endpoint público solo expone la clave VAPID pública.

## 5. Crear Database Webhook
En **Database → Webhooks**, cree:

- Nombre: `qpc-web-push-notifications`
- Tabla: `public.qpc_notifications`
- Eventos: `INSERT` y `UPDATE`
- Método: `POST`
- URL: `https://cwgpuaxjzpzlfusewtrx.supabase.co/functions/v1/web-push-dispatch`
- Header: `x-qpc-push-secret` con el mismo valor configurado en Secrets.
- Header: `Content-Type: application/json`

El evento UPDATE permite volver a enviar el resumen consolidado de equipos solamente cuando cambia su contenido.

## 6. Actualizar GitHub/Vercel
Sustituya el branch `main` por el contenido de esta carpeta y espere el despliegue de Vercel.

## 7. Activación del usuario
Cada usuario debe:

1. Iniciar sesión.
2. Abrir **Mi perfil**.
3. Pulsar **Activar notificaciones**.
4. Aceptar el permiso del navegador.
5. Elegir categorías y guardar.
6. Usar **Enviar prueba** para validar el dispositivo.

## iPhone/iPad
Safari permite Web Push para aplicaciones web añadidas a la pantalla de inicio. Abra la página en Safari, use **Compartir → Añadir a pantalla de inicio**, abra la aplicación instalada y active las notificaciones desde Mi perfil.

## Validación
- Crear una solicitud de inspección desde Ejecución.
- Confirmar que Calidad recibe una alerta en la bandeja y en el dispositivo.
- Cambiar el estado de una inspección y comprobar la alerta de Ejecución.
- Actualizar equipos y confirmar que se recibe una sola alerta consolidada.
- Pulsar la alerta del sistema y confirmar que abre el mismo registro de la bandeja.
