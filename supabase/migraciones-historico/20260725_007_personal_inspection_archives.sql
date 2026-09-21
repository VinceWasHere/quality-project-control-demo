-- Quality Project Control MAIN V8.7 · Fase 8
-- Archivo personal de inspecciones para integrantes de Calidad.
-- Una inspección archivada deja de aparecer en la lista activa del usuario que
-- la archivó, pero no se elimina, no se oculta a otros usuarios y continúa
-- participando en calificaciones, reportes, auditoría y exportaciones.
-- Script idempotente.

begin;

-- 1) Permiso granular.
insert into public.permissions(code,name,description,category,sort_order)
values (
  'inspections.archive',
  'Archivar inspecciones propias',
  'Retirar inspecciones terminadas de la lista activa personal sin eliminar su información.',
  'INSPECCIONES',
  160
)
on conflict (code) do update
set name=excluded.name,
    description=excluded.description,
    category=excluded.category,
    sort_order=excluded.sort_order,
    updated_at=now();

-- Calidad y Gerencia de Calidad reciben el permiso por rol. IT siempre obtiene
-- todos los permisos mediante user_has_permission_for().
insert into public.role_permissions(role,permission_id,allowed)
select role_name,p.id,true
from public.permissions p
cross join (values ('CALIDAD'),('COORDINADOR_CALIDAD')) roles(role_name)
where p.code='inspections.archive'
on conflict (role,permission_id)
do update set allowed=true,updated_at=now();

-- Mantener explícitamente la matriz IT completa para interfaces que leen la tabla.
insert into public.role_permissions(role,permission_id,allowed)
select 'IT',p.id,true
from public.permissions p
on conflict (role,permission_id)
do update set allowed=true,updated_at=now();

-- 2) Archivo personal: no modifica el estado operativo de la inspección.
create table if not exists public.qpc_inspection_user_archives (
  inspection_id uuid not null references public.qpc_inspections(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  archived_at timestamptz not null default now(),
  archive_reason text not null default '',
  primary key (inspection_id,user_id)
);

create index if not exists qpc_inspection_user_archives_user_date_idx
  on public.qpc_inspection_user_archives(user_id,archived_at desc);
create index if not exists qpc_inspection_user_archives_inspection_idx
  on public.qpc_inspection_user_archives(inspection_id);

alter table public.qpc_inspection_user_archives enable row level security;

drop policy if exists qpc_inspection_archives_select_own on public.qpc_inspection_user_archives;
create policy qpc_inspection_archives_select_own
on public.qpc_inspection_user_archives
for select
to authenticated
using (user_id=auth.uid());

-- Las escrituras se realizan mediante la función segura de abajo. No se crean
-- políticas INSERT/UPDATE/DELETE directas para evitar alterar archivos ajenos.
grant select on public.qpc_inspection_user_archives to authenticated;
revoke insert,update,delete on public.qpc_inspection_user_archives from authenticated;

-- 3) Función segura para archivar/restaurar.
create or replace function public.qpc_set_personal_inspection_archive(
  p_inspection_id uuid,
  p_archived boolean,
  p_reason text default ''
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_actor uuid:=auth.uid();
  v_role text;
  v_active boolean;
  v_project_id text;
  v_status text;
  v_code text;
  v_assigned_quality uuid;
  v_now timestamptz:=now();
begin
  if v_actor is null then
    raise exception 'Sesión no válida.' using errcode='42501';
  end if;

  select role,is_active
    into v_role,v_active
  from public.profiles
  where id=v_actor;

  if coalesce(v_active,false)=false then
    raise exception 'El perfil no está activo.' using errcode='42501';
  end if;

  if v_role<>'IT' and not public.user_has_permission_for(v_actor,'inspections.archive') then
    raise exception 'No tiene permiso para archivar inspecciones.' using errcode='42501';
  end if;

  select project_id,status,request_code,assigned_quality_id
    into v_project_id,v_status,v_code,v_assigned_quality
  from public.qpc_inspections
  where id=p_inspection_id;

  if not found then
    raise exception 'La inspección no existe.' using errcode='P0002';
  end if;

  if not public.qpc_user_can_access_project(v_actor,v_project_id) then
    raise exception 'No tiene acceso al proyecto de esta inspección.' using errcode='42501';
  end if;

  -- El archivo personal de Calidad solo opera sobre su propia bandeja. IT puede
  -- organizar personalmente cualquier inspección a la que tenga acceso.
  if v_role<>'IT' and v_assigned_quality is distinct from v_actor then
    raise exception 'Solo puede archivar inspecciones asignadas a su usuario.' using errcode='42501';
  end if;

  if p_archived then
    if v_status not in ('LIBERADA','NO_LIBERADA','CERRADA','IMPROCEDENTE','ANULADA') then
      raise exception 'Solo se pueden archivar inspecciones terminadas o anuladas. Estado actual: %.',v_status using errcode='22023';
    end if;

    insert into public.qpc_inspection_user_archives(
      inspection_id,user_id,archived_at,archive_reason
    ) values (
      p_inspection_id,v_actor,v_now,left(coalesce(p_reason,''),500)
    )
    on conflict (inspection_id,user_id)
    do update set archived_at=excluded.archived_at,
                  archive_reason=excluded.archive_reason;
  else
    delete from public.qpc_inspection_user_archives
    where inspection_id=p_inspection_id and user_id=v_actor;
  end if;

  if to_regclass('public.audit_logs') is not null then
    insert into public.audit_logs(
      project_id,actor_id,action,entity_type,entity_id,previous_data,new_data,created_at
    ) values (
      v_project_id,
      v_actor,
      case when p_archived then 'inspection.personal_archive' else 'inspection.personal_restore' end,
      'inspection',
      p_inspection_id::text,
      jsonb_build_object('archived',not p_archived,'request_code',v_code),
      jsonb_build_object('archived',p_archived,'request_code',v_code,'reason',left(coalesce(p_reason,''),500)),
      v_now
    );
  end if;

  return jsonb_build_object(
    'ok',true,
    'inspection_id',p_inspection_id,
    'request_code',v_code,
    'archived',p_archived,
    'archived_at',case when p_archived then v_now else null end
  );
end;
$$;

revoke all on function public.qpc_set_personal_inspection_archive(uuid,boolean,text) from public;
grant execute on function public.qpc_set_personal_inspection_archive(uuid,boolean,text) to authenticated;

commit;

-- Verificación final.
select
  p.code,
  rp.role,
  rp.allowed
from public.permissions p
left join public.role_permissions rp on rp.permission_id=p.id
where p.code='inspections.archive'
order by rp.role;
