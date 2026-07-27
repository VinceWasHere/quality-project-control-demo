# Despliegue MAIN V9.8 — Fase 19

## Objetivo
Agregar un checklist inteligente de validación y un control obligatorio antes de publicar informes oficiales.

## 1. Supabase
Ejecutar en SQL Editor:

`supabase/migrations/20260727_019_report_validation_gate.sql`

No requiere Edge Function nueva.

## 2. GitHub y Vercel
1. Reemplazar el contenido del branch `main` por esta carpeta.
2. Confirmar el commit.
3. Esperar el despliegue automático de Vercel.
4. Hacer una recarga sin caché.

## 3. Pruebas
1. Abrir **Contenido de informes**.
2. Confirmar el panel **Validación previa a publicación**.
3. Abrir el checklist y revisar cada sección.
4. Marcar una sección con contenido como **Completa**.
5. Marcar una sección vacía como **No aplica**.
6. Intentar publicar con secciones pendientes: Supabase debe bloquearlo.
7. Con Gerente de Calidad, Presidencia o IT, registrar una excepción con justificación y publicar.
8. Modificar un registro del informe: la sección debe volver a **Pendiente** y la excepción debe revocarse.

## Permisos
- Calidad: ver y gestionar checklist.
- Gerente de Calidad: ver, gestionar y autorizar excepción.
- Gerencia: consultar.
- Presidencia: consultar y autorizar excepción.
- IT: acceso total.
