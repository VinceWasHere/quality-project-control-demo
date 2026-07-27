# Despliegue MAIN V9.0.1 — Hotfix de arranque

## Problema corregido

El módulo Integridad de datos agregaba una entrada de navegación como objeto, pero el menú principal consume matrices con el formato:

```js
['integrity', '◫', 'Integridad de datos']
```

El formato incorrecto provocaba:

```text
object is not iterable (cannot read property Symbol(Symbol.iterator))
```

El error ocurría durante `render()` después de cargar la sesión, por lo que la pantalla lo mostraba erróneamente como un problema de conexión con Supabase.

## Publicación

1. Reemplazar los archivos del branch `main` por el contenido de esta carpeta.
2. Confirmar el commit en GitHub.
3. Esperar el despliegue automático de Vercel.
4. Cerrar la pestaña anterior y abrir nuevamente la aplicación, o efectuar una recarga sin caché.

## Supabase

- No ejecutar SQL adicional si `SUPABASE_V9_0_PHASE11_CORREGIDO.sql` ya finalizó correctamente.
- No modificar Edge Functions.

## Prueba

1. Abrir la aplicación sin una sesión guardada.
2. Confirmar que el login cargue sin alerta.
3. Iniciar sesión como IT.
4. Confirmar que aparece `Integridad de datos` en el menú.
5. Abrir la sección y verificar que la página no regrese al login.
