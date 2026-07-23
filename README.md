# Quality Project Control
## MAIN BRANCH (SUPABASE)
Versión: 6.8
Estado: En desarrollo activo

---

# Descripción

Esta rama corresponde a la versión principal del sistema.

Su objetivo es convertirse en la versión de producción del sistema de control de calidad utilizado por CODELPA.

Toda la información se almacena en Supabase.

No contiene datos de ejemplo.

Está preparada para escalar a múltiples proyectos.

---

# Tecnologías

- HTML
- CSS
- JavaScript
- Supabase
- Supabase Auth
- Supabase Storage (en implementación)
- PostgreSQL

---

# Funcionalidades actuales

## Autenticación

- Login mediante Supabase Auth.
- Roles:
    - Ejecución
    - Calidad
    - Coordinador
    - Gerencia
    - Presidencia

---

## Inspecciones

- Solicitudes de inspección
- Varias visitas
- Historial
- Puntaje por visita
- Promedio general
- Estado
- Bandejas por rol

---

## Planillas

- Planillas digitales
- Puntaje automático
- N/A
- Criterios técnicos
- Observaciones
- Evidencias

---

## Documentación

- Adjuntar fotografías
- Adjuntar PDF
- Adjuntar documentos

El personal de Calidad puede visualizar los archivos antes de tomar la inspección.

---

## Mapeos

- Mapeos
- Resaltador
- Gestión documental

---

## Dashboard

- Estadísticas
- Indicadores
- Gráficos

---

## Responsive

Versión 6.8

Mejoras:

- adaptación móvil
- tarjetas
- botones
- formularios
- criterios
- planillas

Pendiente:

- optimización completa para teléfonos.

---

# Base de datos

Actualmente utiliza Supabase.

Tablas principales

- profiles
- projects
- workshops
- engineers
- inspections
- inspection_visits
- inspection_results
- criteria

---

# Storage

Migración iniciada hacia Supabase Storage.

Objetivo:

Eliminar completamente Base64.

Los archivos deberán almacenarse como objetos.

---

# Archivos

Actualmente soporta

- Fotografías
- PDF
- Documentos

---

# Seguridad

- Supabase Auth
- RLS
- Roles
- Policies

---

# Próximas versiones

## V7

- Storage completo
- Responsive definitivo
- Exportación PDF
- Dashboard avanzado
- KPIs reales
- Estadísticas
- Reportes

---

# Observaciones

Esta rama NO contiene ejemplos.

Está diseñada para trabajar únicamente con datos reales almacenados en Supabase.
