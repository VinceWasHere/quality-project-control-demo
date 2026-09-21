-- Quality Project Control MAIN V8.1 · Fase 2
-- Proyectos, bloques, niveles, áreas, membresías y acceso total de Tecnología (IT).
-- Idempotente. No elimina ni renombra tablas antiguas; usa tablas qpc_* para evitar
-- colisiones con esquemas previos creados durante las versiones iniciales.

begin;

-- 1) Garantizar que IT siempre tenga todos los permisos, incluso si se agregan permisos nuevos.
insert into public.role_permissions(role,permission_id,allowed)
select 'IT',p.id,true
from public.permissions p
on conflict (role,permission_id)
do update set allowed=true,updated_at=now();

create or replace function public.user_has_permission_for(
  p_user_id uuid,
  p_permission_code text
)
returns boolean
language plpgsql
stable
security definer
set search_path=public
as $$
declare
  v_role text;
  v_active boolean;
  v_override boolean;
  v_role_allowed boolean;
begin
  select role,is_active into v_role,v_active
  from public.profiles
  where id=p_user_id;

  if coalesce(v_active,false)=false then return false; end if;
  if v_role='IT' then return true; end if;

  select upo.allowed into v_override
  from public.user_permission_overrides upo
  join public.permissions p on p.id=upo.permission_id
  where upo.user_id=p_user_id and p.code=p_permission_code;

  if found then return v_override; end if;

  select rp.allowed into v_role_allowed
  from public.role_permissions rp
  join public.permissions p on p.id=rp.permission_id
  where rp.role=v_role and p.code=p_permission_code;

  return coalesce(v_role_allowed,false);
end;
$$;

create or replace function public.current_user_has_permission(p_permission_code text)
returns boolean
language sql
stable
security definer
set search_path=public
as $$
  select public.user_has_permission_for(auth.uid(),p_permission_code);
$$;

-- 2) Tablas relacionales de proyectos. Se usan claves text para conservar IDs existentes
-- como LCE y VC durante la transición sin romper app_state ni project_members.
create table if not exists public.qpc_projects (
  id text primary key,
  name text not null,
  short_code text not null unique,
  description text not null default '',
  timezone text not null default 'America/Santo_Domingo',
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint qpc_projects_id_format check (id ~ '^[A-Z0-9_-]{2,20}$'),
  constraint qpc_projects_short_code_format check (short_code ~ '^[A-Z0-9_-]{2,12}$')
);

create table if not exists public.qpc_project_blocks (
  id uuid primary key default gen_random_uuid(),
  project_id text not null references public.qpc_projects(id) on delete cascade,
  name text not null,
  code text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id,code)
);

create table if not exists public.qpc_project_levels (
  id uuid primary key default gen_random_uuid(),
  block_id uuid not null references public.qpc_project_blocks(id) on delete cascade,
  name text not null,
  code text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(block_id,code)
);

create table if not exists public.qpc_project_areas (
  id uuid primary key default gen_random_uuid(),
  level_id uuid not null references public.qpc_project_levels(id) on delete cascade,
  name text not null,
  code text not null,
  area_type text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(level_id,code)
);

create index if not exists qpc_project_blocks_project_idx on public.qpc_project_blocks(project_id,sort_order);
create index if not exists qpc_project_levels_block_idx on public.qpc_project_levels(block_id,sort_order);
create index if not exists qpc_project_areas_level_idx on public.qpc_project_areas(level_id,sort_order);
create index if not exists project_members_user_active_idx on public.project_members(user_id,is_active);
create index if not exists project_members_project_active_idx on public.project_members(project_id,is_active);
create index if not exists audit_logs_project_created_idx on public.audit_logs(project_id,created_at desc);
create index if not exists audit_logs_actor_created_idx on public.audit_logs(actor_id,created_at desc);

-- 3) Trigger de updated_at.
create or replace function public.qpc_touch_updated_at()
returns trigger
language plpgsql
set search_path=public
as $$
begin
  new.updated_at=now();
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['qpc_projects','qpc_project_blocks','qpc_project_levels','qpc_project_areas']
  loop
    execute format('drop trigger if exists %I on public.%I','trg_'||t||'_updated_at',t);
    execute format('create trigger %I before update on public.%I for each row execute function public.qpc_touch_updated_at()','trg_'||t||'_updated_at',t);
  end loop;
end $$;

-- 4) Acceso por proyecto. IT y view_all siempre acceden; los demás requieren membresía activa.
create or replace function public.qpc_user_can_access_project(p_user_id uuid,p_project_id text)
returns boolean
language plpgsql
stable
security definer
set search_path=public
as $$
declare v_role text; v_active boolean;
begin
  select role,is_active into v_role,v_active from public.profiles where id=p_user_id;
  if coalesce(v_active,false)=false then return false; end if;
  if v_role='IT' then return true; end if;
  if public.user_has_permission_for(p_user_id,'projects.view_all') then return true; end if;
  return exists(
    select 1 from public.project_members pm
    where pm.user_id=p_user_id and pm.project_id=p_project_id and pm.is_active=true
  );
end;
$$;

create or replace function public.qpc_current_user_can_access_project(p_project_id text)
returns boolean
language sql
stable
security definer
set search_path=public
as $$
  select public.qpc_user_can_access_project(auth.uid(),p_project_id);
$$;

-- 5) Semilla desde app_state, sin sobrescribir datos ya migrados.
do $$
declare
  v_payload jsonb;
  p jsonb;
  b jsonb;
  l jsonb;
  a jsonb;
  v_project_id text;
  v_block_id uuid;
  v_level_id uuid;
  v_area_name text;
  v_area_code text;
begin
  select payload into v_payload from public.app_state where id='main';
  if v_payload is not null then
    for p in select value from jsonb_array_elements(coalesce(v_payload->'projects','[]'::jsonb))
    loop
      v_project_id=upper(coalesce(nullif(p->>'id',''),nullif(p->>'shortCode',''),'PRJ'));
      insert into public.qpc_projects(id,name,short_code,description,timezone,is_active)
      values(
        v_project_id,
        coalesce(nullif(p->>'name',''),v_project_id),
        upper(coalesce(nullif(p->>'shortCode',''),v_project_id)),
        coalesce(p->>'description',''),
        coalesce(nullif(p->>'timezone',''),'America/Santo_Domingo'),
        coalesce((p->>'isActive')::boolean,true)
      )
      on conflict(id) do nothing;

      for b in select value from jsonb_array_elements(coalesce(p->'blocks','[]'::jsonb))
      loop
        insert into public.qpc_project_blocks(project_id,name,code,sort_order,is_active)
        values(
          v_project_id,
          coalesce(nullif(b->>'name',''),nullif(b->>'id',''),'Bloque'),
          upper(coalesce(nullif(b->>'code',''),nullif(b->>'id',''),'B')),
          coalesce((b->>'sortOrder')::integer,0),
          coalesce((b->>'isActive')::boolean,true)
        )
        on conflict(project_id,code) do update set name=excluded.name,is_active=excluded.is_active
        returning id into v_block_id;

        for l in select value from jsonb_array_elements(coalesce(b->'levels','[]'::jsonb))
        loop
          insert into public.qpc_project_levels(block_id,name,code,sort_order,is_active)
          values(
            v_block_id,
            coalesce(nullif(l->>'name',''),nullif(l->>'id',''),'Nivel'),
            upper(coalesce(nullif(l->>'code',''),nullif(l->>'id',''),'N'||lpad((coalesce((l->>'sortOrder')::integer,0)+1)::text,2,'0'))),
            coalesce((l->>'sortOrder')::integer,0),
            coalesce((l->>'isActive')::boolean,true)
          )
          on conflict(block_id,code) do update set name=excluded.name,is_active=excluded.is_active
          returning id into v_level_id;

          for a in select value from jsonb_array_elements(coalesce(l->'areas','[]'::jsonb))
          loop
            v_area_name=case when jsonb_typeof(a)='string' then trim(both '"' from a::text) else coalesce(nullif(a->>'name',''),nullif(a->>'id',''),'Área') end;
            v_area_code=upper(case when jsonb_typeof(a)='string' then regexp_replace(v_area_name,'[^A-Za-z0-9]+','_','g') else coalesce(nullif(a->>'code',''),nullif(a->>'id',''),regexp_replace(v_area_name,'[^A-Za-z0-9]+','_','g')) end);
            insert into public.qpc_project_areas(level_id,name,code,area_type,sort_order,is_active)
            values(v_level_id,v_area_name,v_area_code,null,0,true)
            on conflict(level_id,code) do update set name=excluded.name,is_active=true;
          end loop;
        end loop;
      end loop;
    end loop;
  end if;
end $$;

-- Si app_state no contenía proyectos, crear los dos proyectos conocidos.
insert into public.qpc_projects(id,name,short_code,description,is_active)
values
  ('LCE','Lopesan La Ceiba','LLC','Proyecto Lopesan La Ceiba',true),
  ('VC','Villa Corales','VC','Proyecto Villa Corales',true)
on conflict(id) do update set name=excluded.name,short_code=excluded.short_code;

-- Estructura inicial mínima de Lopesan. No altera estructuras ya existentes.
insert into public.qpc_project_blocks(project_id,name,code,sort_order)
select 'LCE','Bloque '||code,code,ord
from (values ('A',10),('B',20),('C',30),('D',40),('E',50),('F',60),('G',70),('H',80),('J',90)) s(code,ord)
on conflict(project_id,code) do nothing;

-- 6) Sincronizar miembros existentes desde profiles.project_ids y garantizar que IT vea todos.
insert into public.project_members(project_id,user_id,is_active,assigned_by,updated_at)
select q.id,p.id,true,null,now()
from public.profiles p
join lateral unnest(coalesce(p.project_ids,array[]::text[])) as pid(project_id) on true
join public.qpc_projects q on q.id=pid.project_id
on conflict(project_id,user_id) do update set is_active=true,updated_at=now();

insert into public.project_members(project_id,user_id,is_active,assigned_by,updated_at)
select q.id,p.id,true,null,now()
from public.profiles p
cross join public.qpc_projects q
where p.role='IT' and p.is_active=true
on conflict(project_id,user_id) do update set is_active=true,updated_at=now();

-- 7) Vista/RPC anidado para evitar múltiples viajes desde el frontend.
create or replace function public.qpc_projects_for_current_user()
returns jsonb
language sql
stable
security invoker
set search_path=public
as $$
  select coalesce(jsonb_agg(project_json order by project_json->>'name'),'[]'::jsonb)
  from (
    select jsonb_build_object(
      'id',p.id,
      'name',p.name,
      'shortCode',p.short_code,
      'description',p.description,
      'timezone',p.timezone,
      'isActive',p.is_active,
      'blocks',coalesce((
        select jsonb_agg(jsonb_build_object(
          'dbId',b.id,
          'id',b.code,
          'code',b.code,
          'name',b.name,
          'sortOrder',b.sort_order,
          'isActive',b.is_active,
          'levels',coalesce((
            select jsonb_agg(jsonb_build_object(
              'dbId',l.id,
              'id',l.code,
              'code',l.code,
              'name',l.name,
              'sortOrder',l.sort_order,
              'isActive',l.is_active,
              'areas',coalesce((
                select jsonb_agg(jsonb_build_object(
                  'dbId',a.id,
                  'id',a.code,
                  'code',a.code,
                  'name',a.name,
                  'areaType',a.area_type,
                  'sortOrder',a.sort_order,
                  'isActive',a.is_active
                ) order by a.sort_order,a.name)
                from public.qpc_project_areas a
                where a.level_id=l.id and a.is_active=true
              ),'[]'::jsonb)
            ) order by l.sort_order,l.name)
            from public.qpc_project_levels l
            where l.block_id=b.id and l.is_active=true
          ),'[]'::jsonb)
        ) order by b.sort_order,b.name)
        from public.qpc_project_blocks b
        where b.project_id=p.id and b.is_active=true
      ),'[]'::jsonb)
    ) as project_json
    from public.qpc_projects p
    where public.qpc_current_user_can_access_project(p.id)
  ) x;
$$;

grant execute on function public.qpc_projects_for_current_user() to authenticated;
grant execute on function public.qpc_current_user_can_access_project(text) to authenticated;
grant execute on function public.qpc_user_can_access_project(uuid,text) to authenticated;

-- 8) RLS. La Edge Function usa service_role; estas políticas protegen lecturas y
-- cualquier escritura directa accidental desde el navegador.
alter table public.qpc_projects enable row level security;
alter table public.qpc_project_blocks enable row level security;
alter table public.qpc_project_levels enable row level security;
alter table public.qpc_project_areas enable row level security;

-- Projects.
drop policy if exists qpc_projects_select on public.qpc_projects;
create policy qpc_projects_select on public.qpc_projects
for select to authenticated
using (public.qpc_current_user_can_access_project(id));

drop policy if exists qpc_projects_insert on public.qpc_projects;
create policy qpc_projects_insert on public.qpc_projects
for insert to authenticated
with check (public.current_user_has_permission('projects.create'));

drop policy if exists qpc_projects_update on public.qpc_projects;
create policy qpc_projects_update on public.qpc_projects
for update to authenticated
using (public.qpc_current_user_can_access_project(id) and public.current_user_has_permission('projects.edit'))
with check (public.current_user_has_permission('projects.edit'));

-- Blocks.
drop policy if exists qpc_blocks_select on public.qpc_project_blocks;
create policy qpc_blocks_select on public.qpc_project_blocks
for select to authenticated
using (public.qpc_current_user_can_access_project(project_id));

drop policy if exists qpc_blocks_write on public.qpc_project_blocks;
create policy qpc_blocks_write on public.qpc_project_blocks
for all to authenticated
using (public.qpc_current_user_can_access_project(project_id) and public.current_user_has_permission('projects.structure.manage'))
with check (public.qpc_current_user_can_access_project(project_id) and public.current_user_has_permission('projects.structure.manage'));

-- Levels.
drop policy if exists qpc_levels_select on public.qpc_project_levels;
create policy qpc_levels_select on public.qpc_project_levels
for select to authenticated
using (exists(select 1 from public.qpc_project_blocks b where b.id=block_id and public.qpc_current_user_can_access_project(b.project_id)));

drop policy if exists qpc_levels_write on public.qpc_project_levels;
create policy qpc_levels_write on public.qpc_project_levels
for all to authenticated
using (exists(select 1 from public.qpc_project_blocks b where b.id=block_id and public.qpc_current_user_can_access_project(b.project_id) and public.current_user_has_permission('projects.structure.manage')))
with check (exists(select 1 from public.qpc_project_blocks b where b.id=block_id and public.qpc_current_user_can_access_project(b.project_id) and public.current_user_has_permission('projects.structure.manage')));

-- Areas.
drop policy if exists qpc_areas_select on public.qpc_project_areas;
create policy qpc_areas_select on public.qpc_project_areas
for select to authenticated
using (exists(
  select 1 from public.qpc_project_levels l
  join public.qpc_project_blocks b on b.id=l.block_id
  where l.id=level_id and public.qpc_current_user_can_access_project(b.project_id)
));

drop policy if exists qpc_areas_write on public.qpc_project_areas;
create policy qpc_areas_write on public.qpc_project_areas
for all to authenticated
using (exists(
  select 1 from public.qpc_project_levels l
  join public.qpc_project_blocks b on b.id=l.block_id
  where l.id=level_id and public.qpc_current_user_can_access_project(b.project_id) and public.current_user_has_permission('projects.structure.manage')
))
with check (exists(
  select 1 from public.qpc_project_levels l
  join public.qpc_project_blocks b on b.id=l.block_id
  where l.id=level_id and public.qpc_current_user_can_access_project(b.project_id) and public.current_user_has_permission('projects.structure.manage')
));

grant select on public.qpc_projects,public.qpc_project_blocks,public.qpc_project_levels,public.qpc_project_areas to authenticated;
grant insert,update,delete on public.qpc_projects,public.qpc_project_blocks,public.qpc_project_levels,public.qpc_project_areas to authenticated;

-- 9) Auditoría: lectura por permiso, escritura administrativa mediante Edge Functions.
alter table public.audit_logs enable row level security;
drop policy if exists audit_logs_select_authorized on public.audit_logs;
create policy audit_logs_select_authorized on public.audit_logs
for select to authenticated
using (
  public.current_user_has_permission('audit.view')
  and (project_id is null or public.qpc_current_user_can_access_project(project_id))
);
grant select on public.audit_logs to authenticated;

commit;

-- Verificación rápida.
select role,count(*) filter(where allowed) as permisos_activos
from public.role_permissions rp
join public.permissions p on p.id=rp.permission_id
where role='IT'
group by role;

select id,name,short_code,is_active from public.qpc_projects order by name;
