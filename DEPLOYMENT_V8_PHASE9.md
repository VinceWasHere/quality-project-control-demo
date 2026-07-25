# Despliegue MAIN V8.8.0 · Fase 9

## Alcance

Esta fase corrige:

- escala de gráficos de 0 % a 100 %;
- líneas visibles de media y meta cuando existe una sola barra;
- chevrón integrado del combobox de login;
- filtro de Mis inspecciones para mostrar únicamente registros tomados/asignados al usuario.

## Supabase

No ejecutar SQL nuevo.

No crear ni actualizar Edge Functions.

Las tablas, funciones y políticas de la V8.7 permanecen vigentes.

## GitHub y Vercel

1. Descomprimir `Quality_Project_Control_MAIN_V8_8_PHASE9.zip`.
2. Copiar el contenido de `qpc_v880_phase9` al branch `main`.
3. Confirmar el commit.
4. Esperar el despliegue automático de Vercel.
5. Abrir la aplicación con recarga sin caché.

El `index.html` referencia:

```html
<link rel="stylesheet" href="styles.css?v=8.8.0">
<script src="app.bundle.js?v=8.8.0"></script>
```

## Pruebas recomendadas

### Calificaciones

1. Seleccionar un periodo que tenga un solo ingeniero o una sola área.
2. Confirmar que la escala termina en 100 %.
3. Confirmar que en Ingenieros aparecen la meta de 90 % y la media general.
4. Confirmar que en Áreas aparece la meta de 90 %.
5. Confirmar que Talleres muestra correctamente el objetivo asignado.

### Login

1. Cerrar sesión.
2. Abrir el combobox de correos.
3. Confirmar que el chevrón gira al abrirse.
4. Escribir parte de un correo y seleccionar una coincidencia.
5. Probar en escritorio y teléfono.

### Mis inspecciones

1. Entrar como Calidad o IT.
2. Dejar una solicitud sin tomar en Bandeja de Calidad.
3. Confirmar que no aparece en Mis inspecciones.
4. Tomar la solicitud.
5. Confirmar que entonces aparece en Mis inspecciones.
6. Archivar una inspección terminada y comprobar las pestañas Activas/Archivadas/Todas.
