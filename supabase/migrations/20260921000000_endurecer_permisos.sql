-- Migración: endurecimiento de permisos y cierre de fugas de seguridad.
-- Aplicada en producción el 2026-09-21. Delta sobre 00000000000000_baseline_produccion.sql.
--
-- Cierra, en orden de gravedad:
--   1. Escalada de privilegios: cualquier usuario autenticado podía convertirse
--      en IT con un PATCH a profiles.role (los 6 roles lo lograron en la prueba).
--   2. Lectura/escritura anónima sobre 7 tablas demo heredadas.
--   3. Escritura anónima concedida de forma amplia en tablas y vistas.
--   4. Vistas sin security_invoker que ignoraban el RLS de las tablas base
--      (qpc_report_content_status filtraba project_id/period a anónimos).
--
-- NOTA: la rotación de contraseñas de las 6 cuentas semilla (@codelpa.demo, antes
-- 12345678, publicada en el login) es un cambio de Auth, no de esquema: no va aquí.
-- Ver docs/QPC_CURRENT_STATE.md §8 y §6.

begin;

-- 1) profiles: el rol nunca debe ser escribible desde el cliente.
--    RLS no restringe columnas; el control es por GRANT de columna.
revoke all on public.profiles from anon;
revoke insert, update, delete, truncate on public.profiles from authenticated;
grant update (full_name, avatar_data_url, updated_at) on public.profiles to authenticated;

-- 2) Tablas demo heredadas: quitar las políticas permisivas para anon/authenticated.
drop policy if exists "demo_criteria_all"    on public.criteria;
drop policy if exists "demo_engineers_all"   on public.engineers;
drop policy if exists "demo_results_all"     on public.inspection_results;
drop policy if exists "demo_visits_all"      on public.inspection_visits;
drop policy if exists "demo_inspections_all" on public.inspections;
drop policy if exists "demo_projects_all"    on public.projects;
drop policy if exists "demo_workshops_all"   on public.workshops;

-- 3) anon nunca debe escribir en nada de public (tablas y vistas).
do $$ declare t record; begin
  for t in select tablename from pg_tables where schemaname='public' loop
    execute format('revoke insert, update, delete, truncate on public.%I from anon', t.tablename);
  end loop;
  for t in select table_name from information_schema.views where table_schema='public' loop
    execute format('revoke insert, update, delete, truncate on public.%I from anon', t.table_name);
  end loop;
end $$;

-- 4) Toda vista de public debe respetar el RLS del rol que consulta.
do $$ declare v record; begin
  for v in select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
           where n.nspname='public' and c.relkind='v' loop
    execute format('alter view public.%I set (security_invoker = on)', v.relname);
  end loop;
end $$;

commit;
