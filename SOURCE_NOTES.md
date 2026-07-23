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
