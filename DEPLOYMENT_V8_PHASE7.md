# Despliegue MAIN V8.6 · Fase 7

## Objetivo

Esta fase reconcilia la información histórica migrada desde `app_state`, restaura el taller real de cada inspección mediante su `template_id`, recupera respuestas por criterio y vuelve visibles en Calificaciones las inspecciones cerradas que ya tenían puntuación. También habilita el registro de exportaciones PPTX en la bitácora, que en V8.5 todavía solo aceptaba CSV/PDF.

## 1. Ejecutar SQL

1. Abrir Supabase.
2. Entrar a **SQL Editor**.
3. Crear una consulta nueva.
4. Copiar todo el contenido de `SUPABASE_V8_6_PHASE7.sql`.
5. Ejecutar **Run**.

El script es idempotente y no elimina `app_state` ni los registros históricos.

Al finalizar devuelve conteos para:

- talleres;
- planillas;
- criterios del catálogo;
- inspecciones calificables;
- visitas finalizadas;
- respuestas recuperadas;
- incidencias pendientes.

El valor esperado para **incidencias pendientes** es `0`. Un valor mayor no impide mostrar las inspecciones que ya tengan puntaje, pero indica que debe revisarse la vista `qpc_reporting_integrity`.

## 2. Publicar GitHub/Vercel

Reemplazar los archivos del branch `main` por el contenido de la carpeta `qpc_v860_phase7` y confirmar el commit. Vercel desplegará automáticamente.

La versión usa referencias de caché `8.6.0`. Después del despliegue, cerrar y volver a abrir la pestaña o realizar una recarga sin caché.

## 3. Pruebas de aceptación

1. Entrar con una cuenta de Calidad o IT.
2. Abrir **Calificaciones**.
3. Seleccionar el mes donde existen inspecciones históricas cerradas.
4. Confirmar que aparecen todas las inspecciones con puntuación.
5. Confirmar que los talleres muestran nombres reales, por ejemplo `Mampostería`, `Pañete` o `Colocación de Pisos`, y no `Migrado` ni `Sin taller asignado`.
6. Verificar que los puntos débiles recuperan criterios cuando el respaldo contenía `answers_snapshot`.
7. Revisar los exportables CSV/PDF/PPTX para comprobar que utilizan el taller recuperado.

## 4. Diagnóstico SQL opcional

```sql
select *
from public.qpc_reporting_integrity
order by project_id,request_code,issue_type;
```

Para comparar inspecciones cerradas con el reporte:

```sql
select
  i.request_code,
  i.status,
  i.template_id,
  i.activity,
  i.current_final_score,
  r.activity as actividad_reportada,
  r.final_score
from public.qpc_inspections i
left join public.qpc_reporting_inspections r
  on r.inspection_id=i.id
where i.status='CERRADA'
order by i.requested_date desc;
```

## Edge Functions

Esta fase no requiere una Edge Function nueva ni modificar las existentes.
