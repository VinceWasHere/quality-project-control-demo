# MAIN V9.4 — Fase 15

## 1. Migración SQL
Ejecute `SUPABASE_V9_4_PHASE15.sql` en Supabase SQL Editor.

La migración agrega:
- permiso para cambiar correos;
- permisos de copia y organización de informes;
- planificación de láminas;
- copia de contenido entre periodos;
- códigos y control de intentos para recuperación IT.

## 2. Edge Function
En Supabase → Edge Functions → `admin-user-management` → Edit code:

1. Sustituya todo por `supabase/functions/admin-user-management/index.ts`.
2. Mantenga **Verify JWT desactivado**. La función valida el JWT internamente para las acciones administrativas; la acción de recuperación valida un código de un solo uso.
3. Pulse Deploy.

## 3. GitHub y Vercel
Reemplace el contenido del branch `main` por este paquete. Vercel desplegará automáticamente.

## 4. Configuración crítica de IT
Después de publicar:
1. Inicie sesión como Tecnología (IT).
2. Abra **Mi perfil**.
3. Pulse **Generar kit de recuperación**.
4. Descargue el archivo y guárdelo fuera de la plataforma.

Generar un kit nuevo revoca los códigos anteriores no utilizados. Cada código funciona una sola vez.

## 5. Pruebas
- Elegir un correo del login no debe llenar la contraseña.
- Cambiar el correo de un usuario debe permitir entrar con el nuevo y retirar el anterior del listado.
- Un rol no IT no debe poder restaurar la contraseña de IT.
- Copiar contenido desde el periodo anterior no debe duplicarlo al repetir la operación.
- Organizar láminas debe afectar orden e inclusión en PDF/PPTX.
- La vista previa completa debe abrirse en el visor interno.
