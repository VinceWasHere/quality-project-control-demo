-- Quality Project Control MAIN V9.6 · Fase 17
-- Biblioteca de informes publicados, snapshots inmutables y reutilización controlada.
-- Idempotente y no destructivo.

begin;

alter table public.permissions
  add column if not exists updated_at timestamptz not null default now();
alter table public.role_permissions
  add column if not exists updated_at timestamptz not null default now();

insert into public.permissions(code,name,description,category,sort_order,created_at,updated_at)
values
 ('reports.library.view','Ver biblioteca de informes','Consultar versiones publicadas y sus snapshots inmutables.','reports',960,now(),now()),
 ('reports.library.restore','Reutilizar una versión publicada','Copiar contenido de una versión publicada hacia un nuevo borrador.','reports',961,now(),now())
on conflict(code) do update set
  name=excluded.name,
  description=excluded.description,
  category=excluded.category,
  sort_order=excluded.sort_order,
  updated_at=now();

insert into public.role_permissions(role,permission_id,allowed,updated_at)
select r.role,p.id,true,now()
from (values
 ('CALIDAD','reports.library.view'),
 ('CALIDAD','reports.library.restore'),
 ('COORDINADOR_CALIDAD','reports.library.view'),
 ('COORDINADOR_CALIDAD','reports.library.restore'),
 ('GERENCIA','reports.library.view'),
 ('PRESIDENTE','reports.library.view'),
 ('PRESIDENTE','reports.library.restore'),
 ('IT','reports.library.view'),
 ('IT','reports.library.restore')
) as r(role,code)
join public.permissions p on p.code=r.code
on conflict(role,permission_id) do update set allowed=true,updated_at=now();

-- IT conserva todos los permisos presentes y futuros.
insert into public.role_permissions(role,permission_id,allowed,updated_at)
select 'IT',id,true,now() from public.permissions
on conflict(role,permission_id) do update set allowed=true,updated_at=now();

-- Compatibilidad defensiva: la tabla existe desde las fases de evidencias múltiples.
create table if not exists public.qpc_report_entry_files(
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.qpc_report_entries(id) on delete cascade,
  file_id uuid not null references public.qpc_files(id) on delete restrict,
  caption text not null default '',
  sort_order integer not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique(entry_id,file_id)
);

create table if not exists public.qpc_report_publications(
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references public.qpc_report_cycles(id) on delete restrict,
  project_id text not null references public.qpc_projects(id) on delete restrict,
  period_mode text not null check(period_mode in ('week','month')),
  period_value text not null,
  revision_number integer not null check(revision_number>0),
  published_by uuid references public.profiles(id) on delete set null,
  published_at timestamptz not null default now(),
  review_notes text not null default '',
  content_hash text not null,
  snapshot jsonb not null,
  created_at timestamptz not null default now(),
  unique(cycle_id,revision_number)
);

create index if not exists qpc_report_publications_project_idx
  on public.qpc_report_publications(project_id,published_at desc);
create index if not exists qpc_report_publications_period_idx
  on public.qpc_report_publications(project_id,period_mode,period_value,revision_number desc);

alter table public.qpc_report_publications enable row level security;
drop policy if exists qpc_report_publications_read on public.qpc_report_publications;
create policy qpc_report_publications_read on public.qpc_report_publications
for select to authenticated
using(
  public.user_has_permission_for(auth.uid(),'reports.library.view')
  and public.qpc_user_can_access_project(auth.uid(),project_id)
);

create or replace function public.qpc_build_report_snapshot(
  p_project_id text,
  p_period_mode text,
  p_period_value text
)
returns jsonb
language sql
stable
security definer
set search_path=public
as $$
  select jsonb_build_object(
    'project_id',p_project_id,
    'period_mode',p_period_mode,
    'period_value',p_period_value,
    'generated_at',now(),
    'entries',coalesce((
      select jsonb_agg(to_jsonb(e) order by e.section_code,e.sort_order,e.created_at,e.id)
      from public.qpc_report_entries e
      where e.project_id=p_project_id
        and e.period_mode=p_period_mode
        and e.period_value=p_period_value
        and e.is_active=true
        and e.archived_at is null
    ),'[]'::jsonb),
    'evidence',coalesce((
      select jsonb_agg(jsonb_build_object(
        'entry_id',l.entry_id,
        'file_id',l.file_id,
        'caption',l.caption,
        'sort_order',l.sort_order,
        'bucket',f.bucket,
        'storage_path',f.storage_path,
        'original_name',f.original_name,
        'mime_type',f.mime_type,
        'size_bytes',f.size_bytes
      ) order by l.entry_id,l.sort_order,l.created_at,l.id)
      from public.qpc_report_entry_files l
      join public.qpc_report_entries e on e.id=l.entry_id
      join public.qpc_files f on f.id=l.file_id and f.deleted_at is null
      where e.project_id=p_project_id
        and e.period_mode=p_period_mode
        and e.period_value=p_period_value
        and e.is_active=true
        and e.archived_at is null
        and l.archived_at is null
    ),'[]'::jsonb),
    'slide_plan',coalesce((
      select jsonb_agg(to_jsonb(s) order by s.sort_order,s.created_at,s.id)
      from public.qpc_report_slide_plan s
      where s.project_id=p_project_id
        and s.period_mode=p_period_mode
        and s.period_value=p_period_value
    ),'[]'::jsonb)
  );
$$;

revoke all on function public.qpc_build_report_snapshot(text,text,text) from public,anon;
grant execute on function public.qpc_build_report_snapshot(text,text,text) to authenticated;

create or replace function public.qpc_capture_report_publication()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  v_snapshot jsonb;
begin
  if new.status='PUBLISHED'
     and new.revision_number>0
     and (old.status is distinct from new.status or old.revision_number is distinct from new.revision_number) then
    v_snapshot:=public.qpc_build_report_snapshot(new.project_id,new.period_mode,new.period_value);
    insert into public.qpc_report_publications(
      cycle_id,project_id,period_mode,period_value,revision_number,
      published_by,published_at,review_notes,content_hash,snapshot
    ) values(
      new.id,new.project_id,new.period_mode,new.period_value,new.revision_number,
      new.published_by,coalesce(new.published_at,now()),new.review_notes,
      md5(v_snapshot::text),v_snapshot
    ) on conflict(cycle_id,revision_number) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_qpc_capture_report_publication on public.qpc_report_cycles;
create trigger trg_qpc_capture_report_publication
after update on public.qpc_report_cycles
for each row execute function public.qpc_capture_report_publication();

-- Evita modificaciones accidentales de una versión ya publicada.
create or replace function public.qpc_block_report_publication_changes()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Las versiones publicadas son inmutables.';
end;
$$;

drop trigger if exists trg_qpc_report_publications_immutable on public.qpc_report_publications;
create trigger trg_qpc_report_publications_immutable
before update or delete on public.qpc_report_publications
for each row execute function public.qpc_block_report_publication_changes();

-- Captura publicaciones existentes que fueron creadas antes de esta fase.
insert into public.qpc_report_publications(
  cycle_id,project_id,period_mode,period_value,revision_number,
  published_by,published_at,review_notes,content_hash,snapshot
)
select
  c.id,c.project_id,c.period_mode,c.period_value,c.revision_number,
  c.published_by,coalesce(c.published_at,c.updated_at),c.review_notes,
  md5(s.snapshot::text),s.snapshot
from public.qpc_report_cycles c
cross join lateral (
  select public.qpc_build_report_snapshot(c.project_id,c.period_mode,c.period_value) snapshot
) s
where c.status='PUBLISHED' and c.revision_number>0
on conflict(cycle_id,revision_number) do nothing;

create or replace function public.qpc_report_publications_for_project(p_project_id text)
returns table(
  id uuid,
  cycle_id uuid,
  project_id text,
  period_mode text,
  period_value text,
  revision_number integer,
  published_at timestamptz,
  published_by uuid,
  published_by_name text,
  review_notes text,
  entries_count integer,
  sections_count integer,
  evidence_count integer,
  has_later_changes boolean
)
language plpgsql
stable
security definer
set search_path=public
as $$
begin
  if auth.uid() is null then raise exception 'Sesión no válida.'; end if;
  if not public.user_has_permission_for(auth.uid(),'reports.library.view') then
    raise exception 'No tiene permiso para consultar la biblioteca de informes.';
  end if;
  if not public.qpc_user_can_access_project(auth.uid(),p_project_id) then
    raise exception 'No tiene acceso al proyecto.';
  end if;

  return query
  select
    p.id,p.cycle_id,p.project_id,p.period_mode,p.period_value,p.revision_number,
    p.published_at,p.published_by,coalesce(pr.full_name,pr.email,'Usuario'),p.review_notes,
    jsonb_array_length(coalesce(p.snapshot->'entries','[]'::jsonb)),
    (select count(distinct x->>'section_code')::integer from jsonb_array_elements(coalesce(p.snapshot->'entries','[]'::jsonb)) x),
    jsonb_array_length(coalesce(p.snapshot->'evidence','[]'::jsonb)),
    p.content_hash<>md5(public.qpc_build_report_snapshot(p.project_id,p.period_mode,p.period_value)::text)
  from public.qpc_report_publications p
  left join public.profiles pr on pr.id=p.published_by
  where p.project_id=p_project_id
  order by p.published_at desc,p.revision_number desc;
end;
$$;

create or replace function public.qpc_restore_report_publication_to_period(
  p_publication_id uuid,
  p_target_period text,
  p_include_evidence boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_actor uuid:=auth.uid();
  v_pub public.qpc_report_publications%rowtype;
  v_entry jsonb;
  v_file jsonb;
  v_new_id uuid;
  v_cloned integer:=0;
  v_skipped integer:=0;
  v_evidence integer:=0;
begin
  if v_actor is null then raise exception 'Sesión no válida.'; end if;
  if not public.user_has_permission_for(v_actor,'reports.library.restore') then
    raise exception 'No tiene permiso para reutilizar versiones publicadas.';
  end if;
  select * into v_pub from public.qpc_report_publications where id=p_publication_id;
  if not found then raise exception 'Versión publicada no encontrada.'; end if;
  if not public.qpc_user_can_access_project(v_actor,v_pub.project_id) then raise exception 'No tiene acceso al proyecto.'; end if;
  if coalesce(trim(p_target_period),'')='' then raise exception 'Periodo de destino requerido.'; end if;
  if p_target_period=v_pub.period_value then raise exception 'Seleccione un periodo diferente al publicado.'; end if;

  for v_entry in select value from jsonb_array_elements(coalesce(v_pub.snapshot->'entries','[]'::jsonb)) loop
    if exists(
      select 1 from public.qpc_report_entries e
      where e.project_id=v_pub.project_id
        and e.period_mode=v_pub.period_mode
        and e.period_value=p_target_period
        and e.is_active=true and e.archived_at is null
        and e.metadata->>'cloned_from_publication_id'=v_pub.id::text
        and e.metadata->>'cloned_from_entry_id'=v_entry->>'id'
    ) then
      v_skipped:=v_skipped+1;
      continue;
    end if;

    insert into public.qpc_report_entries(
      project_id,period_mode,period_value,section_code,title,description,location_text,responsible,
      action_plan,reference_code,quantity,result_status,notes,sort_order,is_active,metadata,created_by,updated_by
    ) values(
      v_pub.project_id,v_pub.period_mode,p_target_period,v_entry->>'section_code',
      coalesce(v_entry->>'title',''),coalesce(v_entry->>'description',''),coalesce(v_entry->>'location_text',''),
      coalesce(v_entry->>'responsible',''),coalesce(v_entry->>'action_plan',''),coalesce(v_entry->>'reference_code',''),
      nullif(v_entry->>'quantity','')::integer,coalesce(v_entry->>'result_status',''),coalesce(v_entry->>'notes',''),
      coalesce(nullif(v_entry->>'sort_order','')::integer,0),true,
      coalesce(v_entry->'metadata','{}'::jsonb)||jsonb_build_object(
        'cloned_from_publication_id',v_pub.id::text,
        'cloned_from_entry_id',v_entry->>'id',
        'cloned_from_period',v_pub.period_value,
        'cloned_at',now()
      ),v_actor,v_actor
    ) returning id into v_new_id;
    v_cloned:=v_cloned+1;

    if p_include_evidence then
      for v_file in
        select value from jsonb_array_elements(coalesce(v_pub.snapshot->'evidence','[]'::jsonb))
        where value->>'entry_id'=v_entry->>'id'
      loop
        if exists(select 1 from public.qpc_files f where f.id=(v_file->>'file_id')::uuid and f.deleted_at is null) then
          insert into public.qpc_report_entry_files(entry_id,file_id,caption,sort_order,created_by,created_at,updated_at)
          values(v_new_id,(v_file->>'file_id')::uuid,coalesce(v_file->>'caption',''),coalesce(nullif(v_file->>'sort_order','')::integer,0),v_actor,now(),now())
          on conflict(entry_id,file_id) do nothing;
          v_evidence:=v_evidence+1;
        end if;
      end loop;
    end if;
  end loop;

  insert into public.audit_logs(project_id,actor_id,action,entity_type,entity_id,new_data,created_at)
  values(v_pub.project_id,v_actor,'REPORT_PUBLICATION_RESTORED','REPORT_PUBLICATION',v_pub.id::text,
    jsonb_build_object('target_period',p_target_period,'cloned_entries',v_cloned,'skipped_entries',v_skipped,'linked_evidence',v_evidence),now());

  return jsonb_build_object('cloned_entries',v_cloned,'skipped_entries',v_skipped,'linked_evidence',v_evidence);
end;
$$;

revoke all on function public.qpc_report_publications_for_project(text) from public,anon;
revoke all on function public.qpc_restore_report_publication_to_period(uuid,text,boolean) from public,anon;
grant execute on function public.qpc_report_publications_for_project(text) to authenticated;
grant execute on function public.qpc_restore_report_publication_to_period(uuid,text,boolean) to authenticated;
grant select on public.qpc_report_publications to authenticated;

commit;
