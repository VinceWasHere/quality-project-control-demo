# Quality Project Control — CODELPA V5

Proyecto estático funcional preparado para publicarse en **GitHub Pages**.

## Funciones principales

### Acceso y proyectos

- Inicio de sesión por rol.
- Selector de proyecto en el login:
  - Lopesan La Ceiba (`HLLC`).
  - Villa Corales (`HVC`).
- La navegación, las inspecciones, los mapeos, los instructivos, los equipos y los reportes se filtran por el proyecto activo.

### Identificación de inspecciones

Formato corto:

```text
I-[HOTEL]-[AA]-[MM]-[DD]
```

Ejemplos:

```text
I-HLLC-26-06-13
I-HVC-26-07-15
```

Cuando existe más de una inspección el mismo día se agrega un consecutivo:

```text
I-HLLC-26-06-13-02
```

### Ejecución

- Dashboard individual mensual.
- Historial de inspecciones creadas por el usuario.
- Desglose por visita y criterio.
- Visualización de puntos obtenidos, puntos descontados y observaciones de Calidad.
- Consulta de instructivos vigentes.
- Selección de mapeos desde la biblioteca del proyecto.
- Resaltado semitransparente sobre el mapeo para marcar el alcance solicitado.

### Calidad

- Bandeja operativa.
- Toma y evaluación de inspecciones.
- Varias visitas dentro de una misma inspección.
- Cada visita conserva:
  - fecha;
  - inspector;
  - etapa o planilla;
  - respuestas;
  - criterios en `N/A`;
  - calificación técnica;
  - calificación de preparación / visitas;
  - calificación final;
  - decisión.
- El puntaje vigente de la inspección es la **media aritmética de todas las visitas finalizadas**.

Ejemplo:

```text
Visita 1: 100 %
Visita 2: 90 %
Promedio de la inspección: 95 %
```

`N/A` excluye el criterio del denominador de esa visita. El mismo criterio puede evaluarse normalmente en una visita posterior.

### Mapeos e instructivos

Los integrantes autorizados de Calidad pueden:

- cargar documentos y mapeos;
- asignar código y versión;
- modificar su información;
- actualizar la versión vigente;
- consultar versiones del proyecto.

En este demo estático los archivos cargados se guardan como datos locales del navegador y están sujetos al límite de `localStorage`.

### Calificaciones y gráficos

- Resumen semanal y mensual por taller.
- Semanas de Calidad de **jueves a miércoles**, ambos días inclusive.
- Gráfico de talleres con:
  - barras de puntaje obtenido;
  - línea de objetivo.
- Comparativos de ingenieros separados en:
  - Estructura;
  - Terminación.
- Barras por mes.
- Línea de objetivo.
- Línea de media general.
- Tablas de puntos débiles para talleres por debajo de la meta.
- Todos los puntos evaluados aparecen en la tabla.
- Los incisos cuyo promedio queda por debajo del objetivo del taller se resaltan en rojo.

### Exportaciones

- CSV de inspecciones y visitas.
- CSV de criterios y descuentos.
- CSV de calificaciones por taller.
- CSV de calificaciones por ingeniero.
- CSV de puntos débiles.
- PDF mensual con tablas y gráficos.
- PDF de inspecciones.
- PDF de gráficos comparativos.
- PDF y CSV de equipos de seguimiento y medición.

### Equipos de seguimiento y medición

- Módulo para importar un Excel compatible con el formulario FO-GC-23.
- Carga inicial basada en el Excel suministrado para Lopesan La Ceiba.
- Búsqueda y filtros.
- Edición de registros.
- Registro de verificación.
- Exportación a PDF y CSV.

## Usuarios de demostración

La contraseña de todos es `1234`.

| Rol / área | Correo |
|---|---|
| Ejecución · Terminación | `ejecucion1@codelpa.demo` |
| Ejecución · Estructura | `ejecucion2@codelpa.demo` |
| Ejecución · Terminación | `ejecucion3@codelpa.demo` |
| Ejecución · Estructura | `ejecucion4@codelpa.demo` |
| Calidad 1 | `calidad1@codelpa.demo` |
| Calidad 2 | `calidad2@codelpa.demo` |
| Coordinación de Calidad | `coordinador@codelpa.demo` |
| Gerencia | `gerencia@codelpa.demo` |
| Presidencia | `presidente@codelpa.demo` |

## Archivos del proyecto

```text
index.html
styles.css
app.js
v5.js
README.md
SOURCE_NOTES.md

data/
├── catalogos.js
├── equipment_seed.js
└── planillas.json

assets/
├── codelpa_logo_red.png
├── codelpa_logo_white.png
└── mapeos/
```

## Publicación en GitHub Pages

Suba **el contenido de esta carpeta** a la raíz del repositorio y configure:

```text
Settings → Pages → Deploy from a branch → main → /(root)
```

No necesita subir un archivo `.nojekyll`.

## Dependencias cargadas por CDN

Para gráficos, importación de Excel y generación de PDF se utilizan:

- Chart.js.
- SheetJS.
- jsPDF.
- jsPDF-AutoTable.

Estas funciones requieren conexión a internet cuando la página se abre.

## Diseño responsive

La interfaz incluye puntos de quiebre para escritorio, tableta y móvil. En pantallas pequeñas:

- el menú se convierte en panel desplegable;
- las tarjetas se apilan;
- las tablas y gráficos extensos usan desplazamiento horizontal local;
- los formularios cambian a una sola columna.

## Limitaciones del demo estático

Este proyecto todavía usa `localStorage`:

- los datos no se comparten entre computadoras o celulares;
- la autenticación es demostrativa;
- los permisos se aplican en el navegador, no en un servidor;
- los archivos grandes no deben guardarse de esta forma;
- GitHub Pages no sustituye una base de datos ni un repositorio documental.

Para uso operativo real se requiere backend, autenticación segura, base de datos compartida y almacenamiento de archivos.
