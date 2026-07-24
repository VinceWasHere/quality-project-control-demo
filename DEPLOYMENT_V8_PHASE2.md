# Despliegue MAIN V8.1 · Fase 2

## Orden obligatorio

### 1. Base de datos

En Supabase → SQL Editor, ejecutar completo:

`supabase/migrations/20260724_002_projects_locations_and_it_access.sql`

La consulta final debe mostrar:

- un registro del rol `IT` con permisos activos;
- los proyectos migrados o sembrados.

### 2. Edge Function de proyectos

En Supabase → Edge Functions:

1. Crear una función llamada exactamente `admin-project-management`.
2. Elegir **Via Editor**.
3. Reemplazar el código con `supabase/functions/admin-project-management/index.ts`.
4. Desactivar la verificación JWT heredada (`verify_jwt = false`).
5. Desplegar.

La función valida internamente el token enviado por la aplicación, el perfil activo y los permisos efectivos.

### 3. Edge Function de usuarios

Debe permanecer desplegada la función de V8.0:

`admin-user-management`

### 4. GitHub y Vercel

1. Reemplazar el contenido del branch `main` por esta carpeta.
2. Confirmar el commit.
3. Esperar el despliegue automático de Vercel.
4. Abrir la aplicación en ventana privada o recargar sin caché.

## Pruebas mínimas

1. Iniciar sesión como Tecnología (IT).
2. Confirmar que aparece y abre **Usuarios y permisos**.
3. Abrir **Proyectos**.
4. Crear un proyecto de prueba con un bloque, un nivel y un área.
5. Editar el proyecto y agregar otra área.
6. Archivar y restaurar el proyecto.
7. Abrir **Auditoría** y confirmar que aparecen las acciones.
8. Editar un usuario y asignarle el proyecto nuevo.
9. Cerrar sesión e iniciar con ese usuario para confirmar que el selector muestra el proyecto asignado.

## Si IT todavía aparece bloqueado

Ejecutar:

```sql
select p.email,p.role,p.is_active,
       public.user_has_permission_for(p.id,'users.view') as puede_ver_usuarios
from public.profiles p
where lower(p.email)=lower('tecnologia@codelpa.demo');
```

El resultado esperado es:

- `role = IT`
- `is_active = true`
- `puede_ver_usuarios = true`
