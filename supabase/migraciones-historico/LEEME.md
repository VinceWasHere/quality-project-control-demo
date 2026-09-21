# Migraciones anteriores al baseline

Estos 16 ficheros son el historial de como se construyo QPC entre el
2026-07-24 y el 2026-07-27. **No se pueden reproducir** y no deben ejecutarse:

- Nunca se aplicaron con el CLI de Supabase. El esquema se construyo a mano en el editor
  SQL del panel, y estos ficheros son el registro de lo que se pego alli.
- Faltan los numeros 005 y 009 a 013. Esos cambios existen en la base de datos pero su
  SQL se perdio.
- El formato del nombre (`20260724_001_...`) no es el que exige el CLI
  (`AAAAMMDDHHMMSS_nombre.sql`), asi que `supabase db push` nunca los habria aplicado.

Se conservan por valor documental: explican **por que** el esquema es como es.

La verdad sobre el esquema es ahora
`supabase/migrations/00000000000000_baseline_produccion.sql`, generado por introspeccion
del estado real de produccion el 2026-09-21 y registrado como ya aplicado en
`supabase_migrations.schema_migrations`.

A partir de aqui, todo cambio de esquema se hace con una migracion nueva con marca de
tiempo, nunca en el editor SQL del panel.
