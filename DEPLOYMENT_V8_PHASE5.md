# Despliegue MAIN V8.4 · Fase 5

## Alcance

Esta fase incorpora calificaciones relacionales, puntos débiles semanales/mensuales y exportaciones PDF/CSV con vista previa interna.

## 1. Ejecutar SQL

En Supabase:

1. Abra **SQL Editor**.
2. Cree una consulta nueva.
3. Copie el contenido de `SUPABASE_V8_4_PHASE5.sql`.
4. Ejecute **Run**.

El script crea:

- `qpc_reporting_inspections`.
- `qpc_reporting_visits`.
- `qpc_reporting_answers`.
- `qpc_export_runs`.
- `qpc_log_export()`.

Es idempotente y no elimina información existente.

## 2. GitHub y Vercel

1. Reemplace los archivos del branch `main` con el contenido de esta carpeta.
2. Confirme los cambios en GitHub.
3. Espere el despliegue automático de Vercel.
4. Abra la página y haga una recarga sin caché.

`index.html` utiliza `v=8.4.0` para CSS, JavaScript e iconos.

## 3. Edge Functions

No debe crear ni reemplazar una Edge Function para esta fase.

Se conservan las funciones anteriores:

- `admin-user-management`.
- `admin-project-management`.
- `inspection-workflow`.
- `asset-workflow`.

## 4. Prueba recomendada

1. Inicie sesión como Calidad, Gerente de Calidad, Gerencia, Presidencia o IT.
2. Abra **Calificaciones**.
3. Cambie entre mensual y semanal.
4. Filtre por ingeniero, área y taller.
5. Verifique que los puntos débiles cambien entre semanales y mensuales.
6. Abra **Exportaciones**.
7. Genere un CSV.
8. Genere un PDF y confirme que se abra en el visor interno antes de descargar.
9. Genere el reporte completo semanal y mensual.
10. Genere el PDF de equipos.

## 5. Verificación SQL

```sql
select count(*) from public.qpc_reporting_inspections;
select count(*) from public.qpc_reporting_visits;
select count(*) from public.qpc_reporting_answers;
select * from public.qpc_export_runs order by created_at desc limit 20;
```

## 6. Notas de cálculo

- Talleres, ingenieros y áreas usan un promedio por inspección, no por visita.
- Una inspección con tres visitas no pesa tres veces más que una inspección con una visita.
- Los puntos débiles sí analizan las respuestas de todas las visitas.
- N/A queda registrado y se excluye de puntuaciones y fallos.
- La semana de Calidad comprende de jueves a miércoles.
