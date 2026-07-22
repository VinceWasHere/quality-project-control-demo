# Quality Project Control — CODELPA V4

Proyecto estático funcional preparado para publicarse en **GitHub Pages**.

## Mejoras de esta versión

- Dashboard individual del ingeniero de Ejecución.
- Historial completo de inspecciones y visitas.
- Desglose visible de cada criterio donde se descontaron puntos:
  - respuesta registrada;
  - peso;
  - puntos obtenidos;
  - puntos descontados;
  - observación de Calidad.
- Múltiples visitas dentro de una misma inspección.
- Cada visita conserva su propia planilla, etapa, criterios, inspector y calificación.
- Calidad puede registrar una segunda visita y aumentar o reducir la calificación sin borrar la visita anterior.
- Soporte para etapas del Excel:
  - Liberación;
  - Seguimiento;
  - Terminación / cierre.
- Periodos semanales de **jueves a miércoles, ambos inclusive**.
- Tablas mensuales de puntos débiles para talleres que no alcanzan su objetivo.
- Identificación de los criterios que más fallaron en el mes.
- Gráficos de barras comparativos de ingenieros de Ejecución:
  - separados entre Estructura y Terminación;
  - meta requerida de 95%;
  - media general del grupo.
- Mapeos seleccionados desde la biblioteca.
- Herramienta para colorear, rayar y marcar el alcance sobre el mapeo.
- El mapeo marcado queda asociado a la solicitud.
- El inspector de Calidad asignado puede abrir:
  - mapeo original;
  - mapeo marcado;
  - fotografías;
  - planos y otros archivos adjuntos;
  - instructivos vinculados, cuando el archivo esté cargado.
- Exportaciones CSV por visita, etapa, criterio y puntos descontados.

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

## Publicación en GitHub Pages

Sube el contenido de esta carpeta a la raíz del repositorio:

```text
index.html
styles.css
app.js
README.md
SOURCE_NOTES.md
data/
assets/
```

No necesitas subir un archivo `.nojekyll`.

Luego configura:

```text
Settings → Pages → Deploy from a branch → main → /(root)
```

## Limitaciones del demo estático

Este proyecto utiliza `localStorage`.

- Los datos no se comparten entre computadoras.
- La autenticación es demostrativa, no segura para producción.
- Los archivos se guardan localmente y tienen límites de tamaño.
- GitHub Pages no sustituye una base de datos ni almacenamiento corporativo.
- Los permisos deben migrarse a un backend antes de uso real.

La próxima etapa operativa requiere autenticación real, base de datos compartida y almacenamiento seguro de documentos.
