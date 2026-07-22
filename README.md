# Quality Project Control — CODELPA

Demo funcional estático preparado para publicarse en **GitHub Pages**.

## Funciones incluidas

- Inicio de sesión y vistas diferenciadas por rol.
- Dashboard personal para ingenieros de Ejecución.
- Calificación mensual, promedio técnico y preparación/visitas.
- Historial de todas las inspecciones colocadas por cada ingeniero.
- Solicitud de inspección seleccionando una planilla y un mapeo existente.
- Biblioteca de instructivos por código, versión y actividad.
- Biblioteca de mapeos versionados con archivos SVG de demostración.
- Bandeja operativa para Calidad.
- Asignación de inspecciones a un ingeniero de Calidad.
- Evaluación dinámica usando las **40 planillas y 414 criterios** extraídos de `Rev. Planillas SAP V01 (1).xlsx`.
- Cálculo separado de criterios técnicos y criterios de visita/preparación.
- Resultado final según puntos obtenidos entre puntos aplicables.
- Semáforo contra el objetivo de cada actividad.
- Decisión manual de liberar, dejar con observaciones o no liberar.
- Calificaciones semanales y mensuales por taller y por ingeniero de Ejecución.
- Identificación de puntos débiles recurrentes.
- Exportaciones CSV compatibles con Excel:
  - Inspecciones realizadas.
  - Detalle de criterios.
  - Calificaciones por taller.
  - Calificaciones por ingeniero.
- Respaldo completo en JSON.

## Usuarios de demostración

La contraseña de todos es `1234`.

| Rol | Correo |
|---|---|
| Ejecución A | `ejecucion1@codelpa.demo` |
| Ejecución B | `ejecucion2@codelpa.demo` |
| Ejecución C | `ejecucion3@codelpa.demo` |
| Calidad 1 | `calidad1@codelpa.demo` |
| Calidad 2 | `calidad2@codelpa.demo` |
| Coordinación de Calidad | `coordinador@codelpa.demo` |
| Gerencia | `gerencia@codelpa.demo` |
| Presidencia | `presidente@codelpa.demo` |

## Publicar en GitHub Pages

1. Crea un repositorio público.
2. Sube **todo el contenido de esta carpeta** a la raíz del repositorio.
3. Ve a `Settings → Pages`.
4. Selecciona `Deploy from a branch`.
5. Selecciona `main` y `/(root)`.
6. Guarda y espera a que GitHub publique el sitio.

La estructura debe conservarse así:

```text
index.html
styles.css
app.js
data/catalogos.js
assets/mapeos/*.svg
.nojekyll
```

## Limitaciones del demo

Este proyecto funciona completamente en el navegador mediante `localStorage`.

Por tanto:

- No es una autenticación segura de producción.
- Dos equipos diferentes no comparten datos.
- Los archivos fotográficos no se almacenan en un servidor.
- Los permisos están aplicados en la interfaz, no en un backend seguro.
- Los instructivos PDF todavía deben cargarse al repositorio o a un almacenamiento corporativo.
- Los mapeos incluidos son archivos demostrativos.

Para convertirlo en una aplicación operativa multiusuario será necesario conectar un backend, autenticación segura, base de datos y almacenamiento de evidencias.

## Fuente de las planillas

El catálogo de planillas fue extraído del archivo:

`Rev. Planillas SAP V01 (1).xlsx`

Las 40 hojas y sus criterios quedaron incorporadas en `data/catalogos.js`. Antes de uso corporativo se recomienda validar títulos, descripciones, ponderaciones y referencias documentales con Coordinación de Calidad.
