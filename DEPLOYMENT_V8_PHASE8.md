# Despliegue MAIN V8.7 · Fase 8

## Objetivo

Agregar un archivo personal y no destructivo para que los integrantes de Calidad mantengan limpia la sección **Mis inspecciones**.

Archivar una inspección:

- No la elimina.
- No modifica su estado.
- No la excluye de calificaciones.
- No la excluye de reportes o exportaciones.
- No la oculta a otros usuarios.
- Solo la retira de la pestaña **Activas** del usuario que la archivó.

## 1. Ejecutar SQL

En Supabase:

1. Abrir **SQL Editor**.
2. Crear una consulta nueva.
3. Copiar el contenido de `SUPABASE_V8_7_PHASE8.sql`.
4. Ejecutar **Run**.

El script crea:

- Permiso `inspections.archive`.
- Tabla `qpc_inspection_user_archives`.
- Función `qpc_set_personal_inspection_archive()`.
- RLS para que cada usuario solo consulte su propio archivo.
- Auditoría de archivo y restauración.

No requiere Edge Function nueva.

## 2. Publicar en GitHub

Reemplazar el contenido del branch `main` por los archivos de esta carpeta. Vercel desplegará automáticamente.

## 3. Prueba

1. Iniciar sesión como Ingeniero de Calidad, Gerente de Calidad o IT.
2. Abrir **Mis inspecciones**.
3. Seleccionar una inspección terminada.
4. Pulsar **Archivar**.
5. Leer la advertencia y confirmar.
6. Verificar que desaparezca de **Activas**.
7. Abrir **Archivadas**.
8. Verificar que la inspección permanezca disponible y pueda restaurarse.
9. Confirmar que todavía aparece en Calificaciones y Exportaciones.

## Estados archivables

- LIBERADA.
- NO_LIBERADA.
- CERRADA.
- IMPROCEDENTE.
- ANULADA.

No se pueden archivar solicitudes o visitas activas.
