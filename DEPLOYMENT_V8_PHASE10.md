# Despliegue MAIN V8.9.0 — Fase 10

## Objetivo

Incorporar a la base de datos y a los exportables el contenido corporativo que no puede calcularse únicamente desde las planillas: buenas prácticas, talleres a mejorar, NC, capacitaciones, actividades de atención especial, pruebas a materiales, lecciones aprendidas, conclusiones, recomendaciones y acción motivacional.

## 1. Ejecutar SQL

En Supabase:

1. Abrir **SQL Editor**.
2. Crear una consulta nueva.
3. Copiar todo el contenido de `SUPABASE_V8_9_PHASE10.sql`.
4. Pulsar **Run**.

El script es idempotente y crea:

- Permisos `reports.content.view` y `reports.content.manage`.
- Tabla `qpc_report_entries`.
- RPC de consulta por proyecto y periodo.
- RPC de creación/modificación.
- RPC de archivo no destructivo.
- RLS y auditoría.
- Permisos de Storage para las evidencias del informe.

No requiere Edge Function nueva.

## 2. Publicar GitHub/Vercel

1. Sustituir los archivos del branch `main` por el contenido de esta carpeta.
2. Confirmar el commit.
3. Esperar el despliegue automático de Vercel.
4. Realizar una recarga sin caché.

## 3. Prueba recomendada

1. Iniciar sesión como Calidad, Gerente de Calidad o IT.
2. Abrir **Contenido de informes**.
3. Seleccionar periodo semanal.
4. Crear una buena práctica con fotografía.
5. Crear un taller a mejorar con ubicación, responsable y plan de acción.
6. Crear una capacitación.
7. Abrir Exportaciones y generar el informe completo PDF.
8. Confirmar que las páginas creadas aparecen dentro del informe.
9. Generar el PPTX y confirmar que las láminas son editables.
10. Cambiar a periodo mensual y registrar pruebas a materiales, lecciones aprendidas y acción motivacional.

## Permisos predeterminados

- Calidad: consultar y gestionar.
- Gerente de Calidad: consultar y gestionar.
- Gerente de Proyecto: consultar.
- Presidencia: consultar.
- IT: acceso total.

Los permisos también pueden modificarse desde **Usuarios y permisos**.

## Consideraciones

- Los archivos se almacenan en el bucket privado `qpc-attachments`.
- La base guarda únicamente sus metadatos y ruta.
- Archivar un registro no elimina la auditoría.
- Al sustituir o archivar una evidencia, la aplicación intenta retirar el objeto anterior de Storage.
