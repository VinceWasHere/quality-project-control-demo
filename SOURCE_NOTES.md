# Notas de fuentes — Quality Project Control V5

Esta versión fue estructurada usando como referencias funcionales y visuales:

1. **RFP – Quality Project Control CODELPA**
   - roles, solicitudes, visitas, semáforo, trazabilidad, documentos, reportes y exportaciones.

2. **FO-CP-10 V07 — Informe Semanal de Calidad**
   - resumen semanal de planillas;
   - estructura de puntos débiles;
   - comparación entre puntaje alcanzado y objetivo;
   - periodo operativo de Calidad.

3. **FO-CP-11 V10 — Cierre Mensual de Calidad**
   - acumulados semanales y mensuales;
   - gráfico de puntaje obtenido contra objetivo por taller;
   - comparativos mensuales por ingeniero;
   - separación entre ingenieros de Terminación y Estructura;
   - seguimiento de equipos de inspección, medición y ensayo.

4. **Rev. Planillas SAP V01**
   - catálogo de talleres, etapas y criterios;
   - pesos y tipos de respuesta;
   - liberación, seguimiento y terminación;
   - lógica de criterios no aplicables.

5. **FO-GC-23 V05 — Lista de Equipos de Seguimiento y Medición**
   - campos del inventario de equipos;
   - fechas de calibración y verificación;
   - responsables, ubicaciones, frecuencias y observaciones;
   - matriz de frecuencia y parámetros.

6. **Sitio oficial de CODELPA**
   - logotipo utilizado en la interfaz;
   - colores de marca aplicados como referencia visual.

## Decisiones de cálculo implementadas en V5

- Cada visita conserva su puntuación individual.
- La calificación de la inspección es la media aritmética de las visitas finalizadas.
- `N/A` excluye un criterio únicamente del denominador de la visita donde se seleccionó.
- Los reportes por taller e ingeniero usan la calificación agregada de cada inspección para evitar contar una inspección como varias unidades solamente por tener más visitas.
- Los reportes detallados por visita mantienen todos los resultados individuales para auditoría.
- Las semanas se agrupan de jueves a miércoles, ambos días inclusive.
- La tabla de puntos débiles incluye todos los criterios evaluados; se marca en rojo cualquier promedio de inciso inferior al objetivo mensual del taller.

## Advertencia

Los datos incluidos son demostrativos y deben validarse antes de un uso corporativo. Las fórmulas, ponderaciones, objetivos y criterios finales deben administrarse con las versiones oficiales vigentes de CODELPA.

## V8.3 · Fase 4

- `SUPABASE_V8_3_PHASE4.sql`: tablas y migración de equipos, instructivos, mapeos y archivos.
- `asset-workflow_index.ts`: operaciones seguras de los módulos de activos.
- `assets/favicon-codelpa-c.svg`: favicon con una sola C.
- `README.md`: historial acumulativo reorganizado de más reciente a más antiguo.

## V8.9.0

- Se incorporó el módulo relacional de contenido corporativo de informes.
- Las secciones siguen la estructura semanal FO-CP-10 V07 y mensual FO-CP-11 V10 suministradas por el usuario.
- El motor de exportación existente se amplió para usar los registros del periodo en PDF y PPTX.

## V9.0 · Fase 11

La secuencia de secciones y las diapositivas divisoras del exportable corporativo se ajustaron tomando como referencia:

- `25-09-10 FO-CP-10 V07 INFORME SEMANAL DE CALIDAD DE PROYECTOS(2).pptx`.
- `25-09-04 FO-CP-11 V10 CIERRE MENSUAL DE CALIDAD DE PROYECTOS AGOSTO(2).pptx`.

Las plantillas originales no se incrustan en el frontend por su peso. El exportador reproduce su orden, código documental, identidad CODELPA y hojas editables mediante PptxGenJS.
