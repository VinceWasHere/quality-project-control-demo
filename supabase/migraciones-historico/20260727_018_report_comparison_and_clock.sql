-- Quality Project Control MAIN V9.7 · Fase 18
-- Permisos y auditoría para comparación/exportación de snapshots oficiales.
-- El reloj vivo no requiere cambios en base de datos: usa la zona horaria del proyecto.

begin;

alter table public.permissions
  add column if not exists updated_at timestamptz not null default now();
alter table public.role_permissions
  add column if not exists updated_at timestamptz not null default now();

insert into public.permissions(code,name,description,category,sort_order,created_at,updated_at)
values
 ('reports.library.compare','Comparar versiones publicadas','Comparar contenido, evidencias y organización entre dos snapshots oficiales.','reports',970,now(),now()),
 ('reports.library.export_snapshot','Exportar snapshot oficial','Descargar el JSON inmutable de una publicación oficial.','reports',971,now(),now())
on conflict(code) do update set
  name=excluded.name,
  description=excluded.description,
  category=excluded.category,
  sort_order=excluded.sort_order,
  updated_at=now();

insert into public.role_permissions(role,permission_id,allowed,updated_at)
select r.role,p.id,true,now()
from (values
 ('CALIDAD','reports.library.compare'),
 ('CALIDAD','reports.library.export_snapshot'),
 ('COORDINADOR_CALIDAD','reports.library.compare'),
 ('COORDINADOR_CALIDAD','reports.library.export_snapshot'),
 ('GERENCIA','reports.library.compare'),
 ('GERENCIA','reports.library.export_snapshot'),
 ('PRESIDENTE','reports.library.compare'),
 ('PRESIDENTE','reports.library.export_snapshot'),
 ('IT','reports.library.compare'),
 ('IT','reports.library.export_snapshot')
) as r(role,code)
join public.permissions p on p.code=r.code
on conflict(role,permission_id) do update set allowed=true,updated_at=now();

-- IT conserva todos los permisos presentes y futuros.
insert into public.role_permissions(role,permission_id,allowed,updated_at)
select 'IT',id,true,now() from public.permissions
on conflict(role,permission_id) do update set allowed=true,updated_at=now();

create or replace function public.qpc_log_report_library_action(
  p_project_id text,
  p_action text,
  p_base_publication_id uuid,
  p_compare_publication_id uuid default null
)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
declare
  v_actor uuid:=auth.uid();
  v_permission text;
begin
  if v_actor is null then raise exception 'Sesión no válida.'; end if;
  if upper(p_action)='COMPARE' then v_permission:='reports.library.compare';
  elsif upper(p_action)='EXPORT_SNAPSHOT' then v_permission:='reports.library.export_snapshot';
  else raise exception 'Acción de biblioteca no válida.';
  end if;
  if not public.user_has_permission_for(v_actor,v_permission) then
    raise exception 'No tiene permiso para esta acción.';
  end if;
  if not public.qpc_user_can_access_project(v_actor,p_project_id) then
    raise exception 'No tiene acceso al proyecto.';
  end if;
  insert into public.audit_logs(project_id,actor_id,action,entity_type,entity_id,new_data,created_at)
  values(
    p_project_id,
    v_actor,
    'REPORT_LIBRARY_'||upper(p_action),
    'REPORT_PUBLICATION',
    coalesce(p_compare_publication_id,p_base_publication_id)::text,
    jsonb_build_object('base_publication_id',p_base_publication_id,'compare_publication_id',p_compare_publication_id),
    now()
  );
  return true;
end;
$$;

revoke all on function public.qpc_log_report_library_action(text,text,uuid,uuid) from public,anon;
grant execute on function public.qpc_log_report_library_action(text,text,uuid,uuid) to authenticated;

commit;
