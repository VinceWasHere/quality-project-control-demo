# Despliegue MAIN V10.0 — Fase 21

## 1. Supabase
Ejecute en SQL Editor, completo y una sola vez:

`supabase/migrations/20260727_020_notifications_activity_center.sql`

La migración es idempotente y crea:

- `qpc_notifications`
- funciones para consultar, leer y archivar notificaciones;
- triggers de inspecciones e informes;
- generación diaria de alertas por equipos vencidos o próximos a vencer;
- permisos y políticas RLS.

## 2. GitHub y Vercel
1. Sustituya el contenido del branch `main` por esta carpeta.
2. Confirme el commit.
3. Espere el despliegue automático de Vercel.
4. Realice una recarga sin caché.

No se requiere crear ni actualizar Edge Functions.

## 3. Prueba rápida
1. Entre como Ingeniero de Ejecución y envíe una solicitud de liberación.
2. Entre como Calidad: la campana debe mostrar la nueva solicitud.
3. Tome la inspección y cambie su estado.
4. Vuelva a entrar como Ejecución: debe recibir la actualización.
5. Abra una notificación; la plataforma debe llevarlo al registro relacionado.
6. Use “Marcar todas como leídas” y archive una notificación.
