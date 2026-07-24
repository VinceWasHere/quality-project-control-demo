# Quality Project Control — DEMO-GITHUB

## Versión 7.1

Rama estática sin Supabase. V7.1 incorpora la misma biblioteca inteligente de instructivos y conserva todos los datos de demostración.

### Cambios V7.1

- Orden alfabético automático de instructivos.
- Versionado inteligente: la versión más alta queda **Vigente** y las anteriores pasan a **Obsoleto**.
- Estados separados de vigencia y disponibilidad de archivo.
- Las versiones nuevas no sobrescriben las anteriores.
- Eliminación real de instructivos personalizados y ocultación persistente de referencias base.
- Visor por referencia interna, evitando incrustar archivos Base64 completos en el HTML.
- Confirmación interna no bloqueante para eliminar.
- Persistencia diferida para mejorar la respuesta de la interfaz.
- Mantiene contraseña demo `1234`, datos de ejemplo y almacenamiento local.

---

## Versión 7.0

Rama estática desconectada de Supabase. Conserva datos y usuarios de ejemplo, pero recibe las mismas mejoras funcionales compatibles con almacenamiento local.

### Cambios V7.0

- Login con campo buscable tipo dropdown usando usuarios locales registrados.
- Se elimina el recuadro de usuarios demo; queda solo la nota: cuentas `.demo` usan contraseña `1234`.
- Administración local de usuarios con contraseña inicial/restauración local.
- Perfil personal editable: nombre visible e imagen ligera.
- Ejecución solo solicita liberación; Calidad inicia seguimiento y cierre.
- Exportaciones PDF se previsualizan en el visor interno antes de descargar.
- PDF con formato visual corporativo simplificado.
- Equipos se editan en la misma fila.
- Estado de equipos calculado por frecuencia y fechas.
- Instructivos con actividad relacionada como dropdown y estado automático.
- Resaltador de mapeos translúcido y legible.
- Proyectos con nombre completo y creación local.
- Código de inspección `I-LLC-260724` y código de cierre por proyecto/inspector `VP0001`.
- Código optimizado mediante módulo V7 sin dependencia de Supabase.

### Historial acumulado

Este README conserva el historial de la rama y debe continuar ampliándose en cada versión futura.

## Versiones previas

- V6.14: protección de lectura `decision`.
- V6.13: versión sincronizada con MAIN.
- V6.12: permisos, calificaciones robustas y equipos por fila.
- V6.11: puntos débiles con objetivo asignado.
- V6.10: visor universal y puntos débiles semanales.
- V6.9: administración, exportaciones agrupadas, equipos CRUD, instructivos y visor.
- V6.8: responsive móvil.
- V6.7: demo estática con adjuntos locales.
- V6.6: adjuntos visibles para Calidad.
