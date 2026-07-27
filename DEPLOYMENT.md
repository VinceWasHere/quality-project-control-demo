# Despliegue MAIN V10.1 — Fase 22

## 1. Supabase

Ejecute en **Supabase → SQL Editor → New query** el archivo completo:

`supabase/migrations/20260727_021_equipment_notification_digest.sql`

La migración:

- archiva las alertas individuales de equipos generadas por V10.0;
- reemplaza `qpc_refresh_due_equipment_notifications()`;
- crea una sola notificación consolidada por proyecto y destinatario;
- guarda dentro de `metadata.items` el listado de equipos, fecha exigible y estado;
- reactiva la notificación solo cuando aún existen alertas;
- vuelve a marcarla como no leída únicamente cuando cambia el contenido.

No requiere crear ni actualizar Edge Functions.

## 2. GitHub y Vercel

1. Elimine los archivos actuales del branch `main` o sustitúyalos por esta carpeta.
2. Confirme el commit.
3. Espere el despliegue automático de Vercel.
4. Cierre la pestaña anterior y realice una recarga sin caché.

## 3. Resultado esperado

1. Entre como Calidad, Gerente de Calidad o IT.
2. Abra la campana de notificaciones.
3. Debe aparecer una tarjeta **Alertas de equipos** por proyecto, no una tarjeta por cada equipo.
4. La tarjeta muestra:
   - cantidad de vencidos;
   - cantidad de próximos a vencer;
   - los conteos de vencidos y próximos;
   - botón **Ver los N equipos** y expansión del listado completo dentro de la misma tarjeta;
   - botón separado para abrir Verificación de equipos.
5. Al pulsar la tarjeta, se abre **Verificación de equipos**.
6. Los filtros superiores permiten mostrar Todas, Inspecciones, Informes o Equipos.

## 4. Verificación SQL opcional

```sql
select recipient_id, project_id, title, body,
       jsonb_array_length(metadata->'items') as equipos,
       read_at, archived_at
from public.qpc_notifications
where event_key like 'equipment-summary:%'
order by created_at desc;
```
