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
**DEMO-GITHUB — Estática**

## Arquitectura de esta rama
- Aplicación completamente estática y desconectada de Supabase.
- Conserva usuarios, inspecciones y recursos de ejemplo.
- Los cambios se guardan en el navegador.

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

## Cambios exclusivos de DEMO-GITHUB

- Se conserva el login local, los usuarios demo y la información de ejemplo.
- El visor trabaja con los archivos estáticos y los datos almacenados localmente.

---

# Versión 6.11 — DEMO-GITHUB (estática)

## Fecha
23 de julio de 2026.

## Correcciones y mejoras

- Se corrigió la terminología de los puntos débiles: la meta de cada taller se identifica como **objetivo asignado**, no como objetivo mensual.
- El mensaje de cumplimiento ahora se adapta al periodo semanal o mensual seleccionado.
- La identificación de talleres bajo objetivo utiliza correctamente el periodo seleccionado.
- Las tablas muestran la columna **Objetivo asignado**.
- Se conserva el acceso local, los usuarios demo y la contraseña `1234`.
- La rama continúa completamente desconectada de Supabase.

## Archivos añadidos

- `v611.js`

## Archivos modificados

- `index.html`
- `README.md`
