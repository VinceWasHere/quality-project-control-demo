# Despliegue MAIN V8.0 · Fase 1

## 1. Base de datos

En Supabase → SQL Editor → New query, copia y ejecuta:

`supabase/migrations/20260724_001_permissions_and_memberships.sql`

La consulta final debe mostrar conteos de permisos por categoría y por rol.

## 2. Edge Function

En Supabase → Edge Functions:

1. Crea una función llamada exactamente `admin-user-management`.
2. Usa el editor web.
3. Sustituye el contenido por `supabase/functions/admin-user-management/index.ts`.
4. En la configuración de la función, desactiva **Verify JWT with legacy secret** / `verify_jwt`.
5. Despliega.

La función verifica el access token dentro de su propio código antes de ejecutar cualquier acción administrativa. La `service_role` permanece únicamente en Supabase.

## 3. GitHub y Vercel

Sube todos los archivos de esta carpeta al branch `main`. Vercel debe detectar el cambio y publicar automáticamente la versión estática.

## 4. Prueba mínima

1. Inicia sesión como IT o Presidencia.
2. Abre Usuarios y permisos.
3. Edita un usuario.
4. Marca o desmarca un permiso.
5. Guarda.
6. Cierra sesión e inicia con la cuenta modificada.
7. Verifica que el acceso coincida con el permiso efectivo.

## 5. Diagnóstico

Si la Edge Function falla, revisa:

Supabase → Edge Functions → admin-user-management → Logs

La respuesta incluye `stage`, por ejemplo: `actor-auth`, `authorization`, `profile-upsert`, `project-members` o `permission-overrides`.
