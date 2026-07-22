# Notas de fuente y reglas funcionales

## Planillas

El catálogo de 40 planillas y sus criterios proviene de:

`Rev. Planillas SAP V01 (1).xlsx`

Las etapas preservadas son:

- General;
- Liberación;
- Seguimiento;
- Terminación.

En la interfaz, Terminación se presenta también como **Terminación / cierre** para hacer explícita su función operativa.

## Visitas

Cada visita conserva un registro independiente con:

- número de visita;
- etapa y versión de planilla;
- respuestas;
- observaciones;
- resultado técnico;
- resultado de preparación / visitas;
- resultado final;
- inspector;
- fecha;
- decisión.

La calificación vigente de la inspección es la de la visita más reciente, pero las visitas anteriores no se eliminan.

## Periodo semanal

La semana de Calidad se calcula desde el jueves hasta el miércoles siguiente, ambos inclusive.

## Puntos débiles

Para el periodo mensual, los talleres cuyo promedio esté por debajo de su objetivo generan una tabla con:

- criterio fallado;
- etapa;
- cantidad de fallos;
- cantidad de evaluaciones;
- frecuencia de incumplimiento;
- puntos perdidos acumulados.

## Ingenieros de Ejecución

La comparación se divide entre:

- Estructura;
- Terminación.

La meta comparativa inicial es 95%, configurable en el código mediante `ENGINEER_TARGET`.
