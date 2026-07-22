# Notas sobre la importación de planillas

- Se importaron 40 hojas.
- Se identificaron 414 criterios calificables.
- Los tipos de respuesta compatibles son:
  - Sí / No / N/A.
  - Escala de 1 a 5.
  - Escala de 1 a 3.
  - Escala de 1 a 2.
- `N/A` se excluye del denominador.
- Los criterios denominados `Listo para inspección` se clasifican como criterios de visita/preparación.
- El resultado de la planilla se calcula como:

```text
Puntos obtenidos / puntos aplicables × 100
```

- La aplicación conserva por separado:
  - Resultado técnico.
  - Resultado de visita/preparación.
  - Resultado final de la planilla.
- El semáforo utiliza el objetivo configurado por actividad.
