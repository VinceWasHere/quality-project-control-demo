# Despliegue MAIN V8.2 · Fase 3

## 1. SQL

En Supabase, abra **SQL Editor → New query** y ejecute:

`SUPABASE_V8_2_PHASE3.sql`

La consulta final muestra los conteos migrados.

## 2. Edge Function

En Supabase, abra **Edge Functions → Deploy a new function → Via Editor**.

Nombre exacto:

`inspection-workflow`

Pegue el contenido de:

`supabase/functions/inspection-workflow/index.ts`

Configure **Verify JWT** como desactivado. La función valida el token internamente y nunca expone la `service_role` al navegador.

## 3. GitHub y Vercel

Reemplace el contenido del branch `main` con esta carpeta. Vercel desplegará automáticamente.

El `index.html` referencia `app.bundle.js?v=8.2.0` y `styles.css?v=8.2.0` para evitar caché de versiones anteriores.

## 4. Verificación SQL rápida

```sql
select count(*) from public.qpc_inspections;
select count(*) from public.qpc_inspection_visits;
select count(*) from public.qpc_visit_answers;
```

## 5. Flujo mínimo

- Ejecución crea solicitud.
- Calidad toma.
- Calidad finaliza liberación.
- Calidad inicia seguimiento.
- Calidad inicia cierre.
- El cierre genera código.
