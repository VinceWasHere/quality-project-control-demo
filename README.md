# Quality Project Control

## Historial acumulativo

### V6.0–V6.5
- Migración inicial de la rama MAIN hacia Supabase Auth y sincronización remota.
- Conservación de una rama estática independiente para demostración.
- Correcciones progresivas de autenticación, sesión y compatibilidad con claves publicables.

### V6.6
- El personal de Calidad puede consultar fotografías y documentos adjuntos desde la bandeja y el detalle de inspección.

### V6.7
- Preparación de Supabase Storage para adjuntos en MAIN.
- DEMO-GITHUB conserva archivos en Base64 y almacenamiento local.

### V6.8
- Mejoras responsive para planillas, tarjetas, formularios, botones y navegación móvil.

### V6.9 — 23 de julio de 2026
- “Coordinador de Calidad” pasa a mostrarse como “Gerente de Calidad”.
- Gerencia y Presidencia obtienen acceso a Exportaciones.
- Administración de usuarios: Calidad, Gerencia y Presidencia pueden agregar ingenieros de Ejecución; el Gerente de Calidad puede editar Calidad y Ejecución, proyectos, estado y permisos.
- Los puntos débiles se exportan por periodo semanal o mensual.
- Verificación de equipos permite agregar, editar y eliminar registros directamente, además de importar y reemplazar.
- Calidad puede agregar, modificar, reemplazar y borrar instructivos.
- Exportaciones agrupadas por categoría, con opciones CSV y PDF en un único recuadro desplegable.
- Visor interno para imágenes, PDF, planos, adjuntos, mapeos e instructivos.
- MAIN elimina el botón “Restablecer demo”.
- Logos CODELPA restaurados en la interfaz principal.
- Selector de proyecto disponible en la barra lateral.
- Ajustes responsive adicionales para visor, exportaciones y administración.

## Rama
**MAIN — Supabase**

## Arquitectura de esta rama
- Supabase Auth, base de datos y Storage.
- No debe contener datos operativos de ejemplo ni botón para restablecer demo.
- La creación visual de usuarios guarda el perfil y sus permisos en el estado del sistema; la creación de credenciales de acceso en Supabase Auth requiere una operación administrativa segura.

## Despliegue
1. Sustituir los archivos del branch correspondiente.
2. Confirmar el commit y esperar el despliegue de Vercel/GitHub Pages.
3. Abrir en una ventana privada o recargar sin caché.

## Archivos principales modificados en V6.9
- `index.html`
- `styles.css`
- `v69.js`
- `README.md`

## Problemas conocidos
- Los formatos que el navegador no puede representar se ofrecen para descarga desde el visor.
- En MAIN, las credenciales de nuevos usuarios deben ser creadas mediante Supabase Auth/Admin; no se incluye una service role key en el navegador por seguridad.


---

# Versión 6.10 — 23 de julio de 2026

## Cambios comunes

- Los puntos débiles ahora se calculan y muestran tanto para periodos semanales como mensuales.
- El título cambia automáticamente entre **Puntos débiles semanales** y **Puntos débiles mensuales**.
- Se eliminó el mensaje que obligaba a seleccionar un mes para consultar los puntos débiles.
- Se amplió el visor interno para imágenes, PDF, video, audio, archivos de texto y cualquier otro tipo de documento.
- Los formatos que el navegador no puede representar de manera nativa permanecen dentro del modal y ofrecen descarga directa, sin enviar al usuario automáticamente a una pestaña nueva.
- Los enlaces antiguos configurados para abrir archivos en otra pestaña son interceptados y enviados al visor interno.

## Cambios exclusivos de MAIN

- Se agregó el logo blanco de CODELPA en el panel principal del login.
- Se agregó el logo rojo de CODELPA sobre el formulario de acceso.
- Se conserva Supabase Auth y la visualización de adjuntos privados mediante URLs firmadas.

---

# Versión 6.11 — MAIN (Supabase)

## Fecha
23 de julio de 2026.

## Correcciones y mejoras

- Se corrigió la terminología de los puntos débiles: la meta de cada taller se identifica como **objetivo asignado**, no como objetivo mensual.
- El mensaje de cumplimiento ahora se adapta al periodo seleccionado:
  - periodo semanal;
  - periodo mensual.
- La identificación de talleres bajo objetivo utiliza correctamente el periodo seleccionado.
- Las tablas muestran la columna **Objetivo asignado**.
- Se restauró en la pantalla de acceso de MAIN el recuadro con los usuarios de demostración.
- Se muestran los cinco correos demo y un botón **Usar** para completar automáticamente el correo.
- La contraseña visible para las cuentas demo de MAIN es `12345678`.
- Se mantienen los logos de CODELPA en la pantalla de acceso.

## Usuarios demo visibles en MAIN

- Ingeniero de Ejecución: `ejecucion1@codelpa.demo`
- Ingeniero de Calidad: `calidad1@codelpa.demo`
- Gerente de Calidad: `coordinador@codelpa.demo`
- Gerente de Proyecto: `gerencia@codelpa.demo`
- Presidente: `presidente@codelpa.demo`

Contraseña común: `12345678`.

## Archivos añadidos

- `v611.js`

## Archivos modificados

- `index.html`
- `README.md`


---

# Versión 6.12 — MAIN (Supabase)

Fecha: 23 de julio de 2026.

## Correcciones y cambios funcionales

- Se corrigió la apertura de la sección **Calificaciones** mediante una agrupación tolerante a inspecciones incompletas, borradores y visitas que todavía no poseen una decisión final.
- Se normalizan las colecciones y propiedades del estado antes de renderizar o guardar, evitando el error `Cannot read properties of undefined (reading 'decision')`.
- En **Verificación de equipos**, los registros vencidos muestran la fila completa en rojo, no solamente la insignia de estado. Los equipos próximos a vencer reciben una señal visual amarilla tenue.
- La sección **Usuarios y permisos** queda visible únicamente para:
  - Gerente de Calidad.
  - Gerente de Proyecto.
  - Presidencia.
- Los ingenieros de Calidad ya no ven la sección Usuarios y permisos.
- Gerencia de Proyecto y Presidencia pueden administrar ingenieros de Ejecución, pero no modificar usuarios de Calidad.
- El Gerente de Calidad conserva la administración de ingenieros de Calidad y de Ejecución.
- **Instructivos** y **Mapeos** se retiraron del menú de Gerencia de Proyecto y Presidencia.
- Se añadió una validación para impedir el acceso directo por URL o por una vista guardada a módulos que no correspondan al rol.
- Al iniciar sesión se corrigen automáticamente estructuras antiguas o incompletas almacenadas en la aplicación, facilitando el acceso de las cuentas demo, incluido el Ingeniero de Ejecución.

## Archivos agregados o modificados

- `v612.js`: correcciones funcionales, normalización y permisos por rol.
- `styles.css`: semáforo de fila completa en Verificación de equipos.
- `index.html`: carga de `v612.js`.
- `README.md`: historial acumulativo actualizado.

## Consideraciones de despliegue

- Reemplazar todos los archivos del branch correspondiente.
- Esperar a que Vercel termine el despliegue.
- Realizar una recarga sin caché o abrir una ventana privada.
- En MAIN no se requiere ejecutar un script SQL para estas correcciones.
