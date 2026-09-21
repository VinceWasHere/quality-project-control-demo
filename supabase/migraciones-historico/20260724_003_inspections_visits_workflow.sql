-- Quality Project Control MAIN V8.2 · Fase 3
-- Inspecciones, visitas, respuestas, estados y códigos transaccionales.
-- Ejecutar después de las migraciones V8.0 y V8.1.
-- Idempotente: no elimina app_state; lo conserva como respaldo de solo lectura.

begin;

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- 1. Tablas relacionales del flujo de inspecciones
-- -----------------------------------------------------------------------------
create table if not exists public.qpc_inspections (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,
  request_code text not null unique,
  closure_code text unique,
  project_id text not null references public.qpc_projects(id) on delete restrict,
  template_id text not null,
  activity text not null,
  stage text not null default 'General',
  mapping_id text,
  block_id uuid references public.qpc_project_blocks(id) on delete set null,
  level_id uuid references public.qpc_project_levels(id) on delete set null,
  area_id uuid references public.qpc_project_areas(id) on delete set null,
  location_text text not null default '',
  package_code text,
  contractor text not null default '',
  scope text not null default '',
  requested_by uuid not null references public.profiles(id) on delete restrict,
  assigned_quality_id uuid references public.profiles(id) on delete set null,
  requested_date date not null,
  requested_time time,
  ready boolean not null default true,
  status text not null default 'BORRADOR',
  current_technical_score numeric(7,3),
  current_preparation_score numeric(7,3),
  current_final_score numeric(7,3),
  objective numeric(7,3) not null default 0,
  latest_decision text,
  attachments jsonb not null default '[]'::jsonb,
  mapping_annotation jsonb,
  source_snapshot jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz,
  closed_by uuid references public.profiles(id) on delete set null,
  constraint qpc_inspections_status_check check (status in (
    'BORRADOR','SOLICITADA_LIBERACION','TOMADA',
    'VISITA_LIBERACION_EN_PROCESO','LIBERADA','CON_OBSERVACIONES','NO_LIBERADA',
    'SEGUIMIENTO_EN_PROCESO','PENDIENTE_DE_CIERRE','CIERRE_EN_PROCESO',
    'CERRADA','IMPROCEDENTE','ANULADA'
  ))
);

create table if not exists public.qpc_inspection_visits (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,
  inspection_id uuid not null references public.qpc_inspections(id) on delete cascade,
  visit_number integer not null,
  visit_type text not null,
  template_id text not null,
  activity text not null,
  stage text not null,
  template_snapshot jsonb,
  answers_snapshot jsonb not null default '{}'::jsonb,
  notes_snapshot jsonb not null default '{}'::jsonb,
  started_by uuid not null references public.profiles(id) on delete restrict,
  finished_by uuid references public.profiles(id) on delete set null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'EN_PROCESO',
  technical_score numeric(7,3),
  preparation_score numeric(7,3),
  final_score numeric(7,3),
  objective numeric(7,3) not null default 0,
  decision text,
  general_observation text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint qpc_visit_type_check check (visit_type in ('LIBERACION','SEGUIMIENTO','CIERRE')),
  constraint qpc_visit_status_check check (status in ('EN_PROCESO','FINALIZADA','ANULADA')),
  unique(inspection_id,visit_number)
);

create table if not exists public.qpc_visit_answers (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid not null references public.qpc_inspection_visits(id) on delete cascade,
  criterion_id text not null,
  criterion_name text not null,
  criterion_stage text not null default 'General',
  weight numeric(10,3) not null default 0,
  is_visit_criterion boolean not null default false,
  selected_label text,
  factor numeric(7,4),
  observation text not null default '',
  points_earned numeric(10,3),
  points_lost numeric(10,3),
  is_na boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(visit_id,criterion_id)
);

create table if not exists public.qpc_inspection_status_history (
  id bigint generated always as identity primary key,
  inspection_id uuid not null references public.qpc_inspections(id) on delete cascade,
  previous_status text,
  new_status text not null,
  changed_by uuid references public.profiles(id) on delete set null,
  comment text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.qpc_inspection_request_sequences (
  project_id text not null references public.qpc_projects(id) on delete cascade,
  request_date date not null,
  last_value integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key(project_id,request_date)
);

create table if not exists public.qpc_inspection_closure_sequences (
  project_id text not null references public.qpc_projects(id) on delete cascade,
  inspector_id uuid not null references public.profiles(id) on delete cascade,
  initials text not null,
  last_value integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key(project_id,inspector_id)
);

create index if not exists qpc_inspections_project_date_idx on public.qpc_inspections(project_id,requested_date desc);
create index if not exists qpc_inspections_requested_by_idx on public.qpc_inspections(requested_by,created_at desc);
create index if not exists qpc_inspections_assigned_idx on public.qpc_inspections(assigned_quality_id,status);
create index if not exists qpc_inspections_status_idx on public.qpc_inspections(project_id,status,created_at desc);
create index if not exists qpc_visits_inspection_idx on public.qpc_inspection_visits(inspection_id,visit_number);
create index if not exists qpc_visits_finished_idx on public.qpc_inspection_visits(finished_at desc) where status='FINALIZADA';
create index if not exists qpc_answers_visit_idx on public.qpc_visit_answers(visit_id,sort_order);
create index if not exists qpc_status_history_inspection_idx on public.qpc_inspection_status_history(inspection_id,created_at);

-- updated_at
create or replace function public.qpc_touch_updated_at()
returns trigger language plpgsql set search_path=public as $$
begin new.updated_at=now(); return new; end; $$;

do $$
declare t text;
begin
  foreach t in array array['qpc_inspections','qpc_inspection_visits','qpc_visit_answers'] loop
    execute format('drop trigger if exists %I on public.%I','trg_'||t||'_updated_at',t);
    execute format('create trigger %I before update on public.%I for each row execute function public.qpc_touch_updated_at()','trg_'||t||'_updated_at',t);
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- 2. Funciones auxiliares y códigos transaccionales
-- -----------------------------------------------------------------------------
create or replace function public.qpc_profile_initials(p_user_id uuid)
returns text
language plpgsql stable security definer set search_path=public as $$
declare v_name text; v_parts text[]; v_first text; v_last text;
begin
  select trim(full_name) into v_name from public.profiles where id=p_user_id;
  if coalesce(v_name,'')='' then return 'XX'; end if;
  v_parts=regexp_split_to_array(v_name,'\s+');
  v_first=v_parts[1];
  v_last=v_parts[array_length(v_parts,1)];
  return upper(left(regexp_replace(v_first,'[^[:alpha:]]','','g'),1)||left(regexp_replace(v_last,'[^[:alpha:]]','','g'),1));
end; $$;

create or replace function public.qpc_next_request_code(p_project_id text,p_request_date date)
returns text
language plpgsql security definer set search_path=public as $$
declare v_short text; v_value integer; v_base text;
begin
  select short_code into v_short from public.qpc_projects where id=p_project_id and is_active=true;
  if v_short is null then raise exception 'Proyecto no disponible'; end if;
  insert into public.qpc_inspection_request_sequences(project_id,request_date,last_value)
  values(p_project_id,p_request_date,1)
  on conflict(project_id,request_date)
  do update set last_value=public.qpc_inspection_request_sequences.last_value+1,updated_at=now()
  returning last_value into v_value;
  v_base='I-'||upper(v_short)||'-'||to_char(p_request_date,'YYMMDD');
  return case when v_value=1 then v_base else v_base||'-'||lpad(v_value::text,2,'0') end;
end; $$;

create or replace function public.qpc_next_closure_code(p_project_id text,p_inspector_id uuid)
returns text
language plpgsql security definer set search_path=public as $$
declare v_initials text; v_value integer;
begin
  v_initials=public.qpc_profile_initials(p_inspector_id);
  insert into public.qpc_inspection_closure_sequences(project_id,inspector_id,initials,last_value)
  values(p_project_id,p_inspector_id,v_initials,1)
  on conflict(project_id,inspector_id)
  do update set last_value=public.qpc_inspection_closure_sequences.last_value+1,initials=excluded.initials,updated_at=now()
  returning last_value into v_value;
  return v_initials||lpad(v_value::text,4,'0');
end; $$;

create or replace function public.qpc_record_status(
  p_inspection_id uuid,p_previous text,p_new text,p_actor uuid,p_comment text default ''
) returns void
language plpgsql security definer set search_path=public as $$
begin
  insert into public.qpc_inspection_status_history(inspection_id,previous_status,new_status,changed_by,comment)
  values(p_inspection_id,p_previous,p_new,p_actor,coalesce(p_comment,''));
end; $$;

create or replace function public.qpc_actor_can_view_inspection(p_actor uuid,p_inspection_id uuid)
returns boolean
language plpgsql stable security definer set search_path=public as $$
declare v_project text; v_requested uuid; v_assigned uuid;
begin
  select project_id,requested_by,assigned_quality_id into v_project,v_requested,v_assigned
  from public.qpc_inspections where id=p_inspection_id;
  if v_project is null then return false; end if;
  if not public.qpc_user_can_access_project(p_actor,v_project) then return false; end if;
  if public.user_has_permission_for(p_actor,'inspections.view_all') or public.user_has_permission_for(p_actor,'inspections.view_project') then return true; end if;
  return p_actor=v_requested or p_actor=v_assigned;
end; $$;

-- -----------------------------------------------------------------------------
-- 3. Operaciones atómicas utilizadas por la Edge Function
-- -----------------------------------------------------------------------------
create or replace function public.qpc_create_inspection_request(p_actor uuid,p_payload jsonb)
returns public.qpc_inspections
language plpgsql security definer set search_path=public as $$
declare
  v_project text=upper(p_payload->>'project_id');
  v_date date=coalesce((p_payload->>'requested_date')::date,current_date);
  v_submit boolean=coalesce((p_payload->>'submit')::boolean,true);
  v_code text; v_status text; v_row public.qpc_inspections;
begin
  if not public.user_has_permission_for(p_actor,'inspections.request_release') then raise exception 'No tiene permiso para solicitar liberaciones'; end if;
  if not public.qpc_user_can_access_project(p_actor,v_project) then raise exception 'No tiene acceso al proyecto'; end if;
  if coalesce(p_payload->>'template_id','')='' then raise exception 'La planilla es obligatoria'; end if;
  v_code=public.qpc_next_request_code(v_project,v_date);
  v_status=case when v_submit then 'SOLICITADA_LIBERACION' else 'BORRADOR' end;
  insert into public.qpc_inspections(
    request_code,project_id,template_id,activity,stage,mapping_id,block_id,level_id,area_id,
    location_text,package_code,contractor,scope,requested_by,requested_date,requested_time,
    ready,status,objective,attachments,mapping_annotation,source_snapshot
  ) values(
    v_code,v_project,p_payload->>'template_id',coalesce(p_payload->>'activity',''),coalesce(p_payload->>'stage','General'),
    nullif(p_payload->>'mapping_id',''),nullif(p_payload->>'block_id','')::uuid,nullif(p_payload->>'level_id','')::uuid,
    nullif(p_payload->>'area_id','')::uuid,coalesce(p_payload->>'location_text',''),nullif(p_payload->>'package_code',''),
    coalesce(p_payload->>'contractor',''),coalesce(p_payload->>'scope',''),p_actor,v_date,
    nullif(p_payload->>'requested_time','')::time,coalesce((p_payload->>'ready')::boolean,true),v_status,
    coalesce((p_payload->>'objective')::numeric,0),coalesce(p_payload->'attachments','[]'::jsonb),p_payload->'mapping_annotation',p_payload
  ) returning * into v_row;
  perform public.qpc_record_status(v_row.id,null,v_status,p_actor,case when v_submit then 'Solicitud de liberación enviada por Ejecución' else 'Borrador creado' end);
  insert into public.audit_logs(project_id,actor_id,action,entity_type,entity_id,new_data)
  values(v_project,p_actor,case when v_submit then 'inspection.requested' else 'inspection.draft_created' end,'inspection',v_row.id::text,to_jsonb(v_row));
  return v_row;
end; $$;

create or replace function public.qpc_take_inspection(p_actor uuid,p_inspection_id uuid)
returns public.qpc_inspections
language plpgsql security definer set search_path=public as $$
declare v_row public.qpc_inspections; v_old text;
begin
  if not public.user_has_permission_for(p_actor,'inspections.take') then raise exception 'No tiene permiso para tomar inspecciones'; end if;
  select * into v_row from public.qpc_inspections where id=p_inspection_id for update;
  if v_row.id is null then raise exception 'Inspección no encontrada'; end if;
  if not public.qpc_user_can_access_project(p_actor,v_row.project_id) then raise exception 'No tiene acceso al proyecto'; end if;
  if v_row.status<>'SOLICITADA_LIBERACION' then raise exception 'La inspección ya no está disponible para tomar'; end if;
  v_old=v_row.status;
  update public.qpc_inspections set assigned_quality_id=p_actor,status='TOMADA' where id=p_inspection_id returning * into v_row;
  perform public.qpc_record_status(v_row.id,v_old,'TOMADA',p_actor,'Inspección tomada por Calidad');
  insert into public.audit_logs(project_id,actor_id,action,entity_type,entity_id,new_data)
  values(v_row.project_id,p_actor,'inspection.taken','inspection',v_row.id::text,jsonb_build_object('assigned_quality_id',p_actor));
  return v_row;
end; $$;

create or replace function public.qpc_start_inspection_visit(p_actor uuid,p_inspection_id uuid,p_payload jsonb)
returns public.qpc_inspection_visits
language plpgsql security definer set search_path=public as $$
declare
  v_ins public.qpc_inspections; v_visit public.qpc_inspection_visits; v_type text=upper(coalesce(p_payload->>'visit_type','LIBERACION'));
  v_number integer; v_new_status text; v_old text; v_previous public.qpc_inspection_visits;
begin
  select * into v_ins from public.qpc_inspections where id=p_inspection_id for update;
  if v_ins.id is null then raise exception 'Inspección no encontrada'; end if;
  if not public.qpc_user_can_access_project(p_actor,v_ins.project_id) then raise exception 'No tiene acceso al proyecto'; end if;
  if v_type='LIBERACION' and not public.user_has_permission_for(p_actor,'inspections.evaluate') then raise exception 'No puede evaluar liberaciones'; end if;
  if v_type='SEGUIMIENTO' and not public.user_has_permission_for(p_actor,'inspections.start_follow_up') then raise exception 'No puede iniciar seguimientos'; end if;
  if v_type='CIERRE' and not public.user_has_permission_for(p_actor,'inspections.start_closure') then raise exception 'No puede iniciar cierres'; end if;
  if exists(select 1 from public.qpc_inspection_visits where inspection_id=p_inspection_id and status='EN_PROCESO') then raise exception 'Ya existe una visita en proceso'; end if;
  if v_ins.assigned_quality_id is null then update public.qpc_inspections set assigned_quality_id=p_actor where id=p_inspection_id; v_ins.assigned_quality_id=p_actor; end if;
  if v_ins.assigned_quality_id<>p_actor and not public.user_has_permission_for(p_actor,'inspections.edit_closed_visit') then raise exception 'La inspección está asignada a otro inspector'; end if;
  if v_type='LIBERACION' and exists(select 1 from public.qpc_inspection_visits where inspection_id=p_inspection_id and status='FINALIZADA') then raise exception 'La liberación inicial ya fue evaluada'; end if;
  if v_type in ('SEGUIMIENTO','CIERRE') and not exists(select 1 from public.qpc_inspection_visits where inspection_id=p_inspection_id and status='FINALIZADA') then raise exception 'Primero debe completarse la visita de liberación'; end if;
  select coalesce(max(visit_number),0)+1 into v_number from public.qpc_inspection_visits where inspection_id=p_inspection_id;
  select * into v_previous from public.qpc_inspection_visits where inspection_id=p_inspection_id and status='FINALIZADA' order by visit_number desc limit 1;
  v_new_status=case v_type when 'LIBERACION' then 'VISITA_LIBERACION_EN_PROCESO' when 'SEGUIMIENTO' then 'SEGUIMIENTO_EN_PROCESO' else 'CIERRE_EN_PROCESO' end;
  insert into public.qpc_inspection_visits(
    inspection_id,visit_number,visit_type,template_id,activity,stage,template_snapshot,answers_snapshot,notes_snapshot,
    started_by,status,objective
  ) values(
    p_inspection_id,v_number,v_type,p_payload->>'template_id',coalesce(p_payload->>'activity',v_ins.activity),
    coalesce(p_payload->>'stage',v_ins.stage),p_payload->'template_snapshot',
    case when coalesce((p_payload->>'copy_previous')::boolean,false) then coalesce(v_previous.answers_snapshot,'{}'::jsonb) else '{}'::jsonb end,
    case when coalesce((p_payload->>'copy_previous')::boolean,false) then coalesce(v_previous.notes_snapshot,'{}'::jsonb) else '{}'::jsonb end,
    p_actor,'EN_PROCESO',coalesce((p_payload->>'objective')::numeric,v_ins.objective)
  ) returning * into v_visit;
  v_old=v_ins.status;
  update public.qpc_inspections set status=v_new_status,template_id=v_visit.template_id,activity=v_visit.activity,stage=v_visit.stage where id=p_inspection_id;
  perform public.qpc_record_status(p_inspection_id,v_old,v_new_status,p_actor,'Visita '||v_number||' iniciada · '||v_type);
  insert into public.audit_logs(project_id,actor_id,action,entity_type,entity_id,new_data)
  values(v_ins.project_id,p_actor,'inspection.visit_started','inspection_visit',v_visit.id::text,to_jsonb(v_visit));
  return v_visit;
end; $$;

create or replace function public.qpc_save_visit_draft(p_actor uuid,p_visit_id uuid,p_payload jsonb)
returns public.qpc_inspection_visits
language plpgsql security definer set search_path=public as $$
declare v_visit public.qpc_inspection_visits; v_ins public.qpc_inspections;
begin
  select * into v_visit from public.qpc_inspection_visits where id=p_visit_id for update;
  if v_visit.id is null then raise exception 'Visita no encontrada'; end if;
  select * into v_ins from public.qpc_inspections where id=v_visit.inspection_id;
  if v_visit.status<>'EN_PROCESO' then raise exception 'La visita ya fue finalizada'; end if;
  if v_visit.started_by<>p_actor and not public.user_has_permission_for(p_actor,'inspections.edit_open_visit') then raise exception 'No puede editar esta visita'; end if;
  update public.qpc_inspection_visits set
    answers_snapshot=coalesce(p_payload->'answers',answers_snapshot),
    notes_snapshot=coalesce(p_payload->'notes',notes_snapshot),
    general_observation=coalesce(p_payload->>'general_observation',general_observation)
  where id=p_visit_id returning * into v_visit;
  return v_visit;
end; $$;

create or replace function public.qpc_finish_inspection_visit(p_actor uuid,p_visit_id uuid,p_payload jsonb)
returns jsonb
language plpgsql security definer set search_path=public as $$
declare
  v_visit public.qpc_inspection_visits; v_ins public.qpc_inspections; v_answer jsonb;
  v_tech_num numeric=0; v_tech_den numeric=0; v_prep_num numeric=0; v_prep_den numeric=0; v_all_num numeric=0; v_all_den numeric=0;
  v_factor numeric; v_weight numeric; v_is_visit boolean; v_is_na boolean; v_earned numeric; v_lost numeric;
  v_technical numeric; v_preparation numeric; v_final numeric; v_decision text; v_new_status text; v_old text;
  v_avg_technical numeric; v_avg_preparation numeric; v_avg_final numeric; v_count integer; v_closure text;
begin
  select * into v_visit from public.qpc_inspection_visits where id=p_visit_id for update;
  if v_visit.id is null then raise exception 'Visita no encontrada'; end if;
  select * into v_ins from public.qpc_inspections where id=v_visit.inspection_id for update;
  if v_visit.status<>'EN_PROCESO' then raise exception 'La visita ya fue finalizada'; end if;
  if v_visit.started_by<>p_actor and not public.user_has_permission_for(p_actor,'inspections.edit_open_visit') then raise exception 'No puede finalizar esta visita'; end if;
  if not public.user_has_permission_for(p_actor,'inspections.evaluate') then raise exception 'No tiene permiso para evaluar'; end if;
  if jsonb_array_length(coalesce(p_payload->'answers','[]'::jsonb))=0 then raise exception 'No se recibieron respuestas'; end if;

  delete from public.qpc_visit_answers where visit_id=p_visit_id;
  for v_answer in select value from jsonb_array_elements(p_payload->'answers') loop
    v_weight=coalesce((v_answer->>'weight')::numeric,0);
    v_is_visit=coalesce((v_answer->>'is_visit_criterion')::boolean,false);
    v_is_na=coalesce((v_answer->>'is_na')::boolean,false);
    v_factor=case when v_is_na then null else nullif(v_answer->>'factor','')::numeric end;
    if not v_is_na and v_factor is null then raise exception 'La respuesta del criterio % no tiene factor',v_answer->>'criterion_id'; end if;
    v_earned=case when v_is_na then null else round(v_weight*v_factor,3) end;
    v_lost=case when v_is_na then null else round(v_weight-v_earned,3) end;
    insert into public.qpc_visit_answers(
      visit_id,criterion_id,criterion_name,criterion_stage,weight,is_visit_criterion,selected_label,factor,
      observation,points_earned,points_lost,is_na,sort_order
    ) values(
      p_visit_id,v_answer->>'criterion_id',coalesce(v_answer->>'criterion_name',v_answer->>'criterion_id'),
      coalesce(v_answer->>'criterion_stage',v_visit.stage),v_weight,v_is_visit,v_answer->>'selected_label',v_factor,
      coalesce(v_answer->>'observation',''),v_earned,v_lost,v_is_na,coalesce((v_answer->>'sort_order')::integer,0)
    );
    if not v_is_na then
      v_all_num=v_all_num+v_earned; v_all_den=v_all_den+v_weight;
      if v_is_visit then v_prep_num=v_prep_num+v_earned; v_prep_den=v_prep_den+v_weight;
      else v_tech_num=v_tech_num+v_earned; v_tech_den=v_tech_den+v_weight; end if;
    end if;
  end loop;

  v_technical=case when v_tech_den>0 then round(v_tech_num/v_tech_den*100,3) else 0 end;
  v_preparation=case when v_prep_den>0 then round(v_prep_num/v_prep_den*100,3) else 100 end;
  v_final=case when v_all_den>0 then round(v_all_num/v_all_den*100,3) else 0 end;
  v_decision=coalesce(nullif(p_payload->>'decision',''),'No liberada');

  update public.qpc_inspection_visits set
    answers_snapshot=coalesce(p_payload->'answers_by_id','{}'::jsonb),
    notes_snapshot=coalesce(p_payload->'notes_by_id','{}'::jsonb),
    general_observation=coalesce(p_payload->>'general_observation',''),
    technical_score=v_technical,preparation_score=v_preparation,final_score=v_final,
    decision=v_decision,status='FINALIZADA',finished_by=p_actor,finished_at=now()
  where id=p_visit_id returning * into v_visit;

  select round(avg(technical_score),3),round(avg(preparation_score),3),round(avg(final_score),3),count(*)
  into v_avg_technical,v_avg_preparation,v_avg_final,v_count
  from public.qpc_inspection_visits where inspection_id=v_ins.id and status='FINALIZADA';

  if v_visit.visit_type='CIERRE' then
    v_new_status='CERRADA';
    if v_ins.closure_code is null then v_closure=public.qpc_next_closure_code(v_ins.project_id,p_actor); else v_closure=v_ins.closure_code; end if;
  else
    v_new_status=case v_decision when 'Liberada' then 'LIBERADA' when 'Con observaciones' then 'CON_OBSERVACIONES' else 'NO_LIBERADA' end;
    v_closure=v_ins.closure_code;
  end if;
  v_old=v_ins.status;
  update public.qpc_inspections set
    status=v_new_status,current_technical_score=v_avg_technical,current_preparation_score=v_avg_preparation,
    current_final_score=v_avg_final,latest_decision=v_decision,closure_code=v_closure,
    closed_at=case when v_new_status='CERRADA' then now() else closed_at end,
    closed_by=case when v_new_status='CERRADA' then p_actor else closed_by end
  where id=v_ins.id returning * into v_ins;
  perform public.qpc_record_status(v_ins.id,v_old,v_new_status,p_actor,'Visita '||v_visit.visit_number||' finalizada · '||v_visit.visit_type||' · '||v_decision);
  insert into public.audit_logs(project_id,actor_id,action,entity_type,entity_id,new_data)
  values(v_ins.project_id,p_actor,'inspection.visit_finished','inspection_visit',v_visit.id::text,jsonb_build_object('visit',to_jsonb(v_visit),'inspection',to_jsonb(v_ins)));
  return jsonb_build_object('inspection',to_jsonb(v_ins),'visit',to_jsonb(v_visit),'closure_code',v_closure,'visit_count',v_count);
end; $$;

create or replace function public.qpc_mark_inspection_improper(p_actor uuid,p_inspection_id uuid,p_comment text default '')
returns public.qpc_inspections
language plpgsql security definer set search_path=public as $$
declare v_ins public.qpc_inspections; v_old text;
begin
  if not public.user_has_permission_for(p_actor,'inspections.mark_improper') then raise exception 'No tiene permiso para marcar improcedente'; end if;
  select * into v_ins from public.qpc_inspections where id=p_inspection_id for update;
  if v_ins.id is null then raise exception 'Inspección no encontrada'; end if;
  if not public.qpc_user_can_access_project(p_actor,v_ins.project_id) then raise exception 'No tiene acceso al proyecto'; end if;
  v_old=v_ins.status;
  update public.qpc_inspections set status='IMPROCEDENTE',latest_decision='Improcedente',closed_at=now(),closed_by=p_actor where id=p_inspection_id returning * into v_ins;
  perform public.qpc_record_status(v_ins.id,v_old,'IMPROCEDENTE',p_actor,coalesce(p_comment,'Inspección improcedente'));
  insert into public.audit_logs(project_id,actor_id,action,entity_type,entity_id,new_data)
  values(v_ins.project_id,p_actor,'inspection.marked_improper','inspection',v_ins.id::text,to_jsonb(v_ins));
  return v_ins;
end; $$;

-- -----------------------------------------------------------------------------
-- 4. Migración no destructiva desde app_state
-- -----------------------------------------------------------------------------
create or replace function public.qpc_profile_id_from_legacy(p_legacy text)
returns uuid language sql stable security definer set search_path=public as $$
  select id from public.profiles where legacy_id=p_legacy or id::text=p_legacy limit 1;
$$;

do $$
declare
  v_payload jsonb; i jsonb; v jsonb; v_ins_id uuid; v_visit_id uuid;
  v_requested uuid; v_quality uuid; v_project text; v_code text; v_status text; v_number integer;
begin
  select payload into v_payload from public.app_state where id='main';
  if v_payload is null then return; end if;
  for i in select value from jsonb_array_elements(coalesce(v_payload->'inspections','[]'::jsonb)) loop
    v_requested=public.qpc_profile_id_from_legacy(i->>'createdBy');
    v_quality=public.qpc_profile_id_from_legacy(i->>'assignedQualityId');
    if v_requested is null then continue; end if;
    v_project=upper(coalesce(nullif(i->>'projectId',''),'LCE'));
    if not exists(select 1 from public.qpc_projects where id=v_project) then v_project='LCE'; end if;
    v_code=coalesce(nullif(i->>'code',''),'MIG-'||substr(md5(i::text),1,12));
    v_status=case coalesce(i->>'status','BORRADOR')
      when 'SOLICITADA' then 'SOLICITADA_LIBERACION'
      when 'EN_EVALUACION' then 'VISITA_LIBERACION_EN_PROCESO'
      when 'EN_REINSPECCION' then 'SEGUIMIENTO_EN_PROCESO'
      else coalesce(i->>'status','BORRADOR') end;
    if v_status not in ('BORRADOR','SOLICITADA_LIBERACION','TOMADA','VISITA_LIBERACION_EN_PROCESO','LIBERADA','CON_OBSERVACIONES','NO_LIBERADA','SEGUIMIENTO_EN_PROCESO','PENDIENTE_DE_CIERRE','CIERRE_EN_PROCESO','CERRADA','IMPROCEDENTE','ANULADA') then v_status='BORRADOR'; end if;
    insert into public.qpc_inspections(
      legacy_id,request_code,closure_code,project_id,template_id,activity,stage,mapping_id,location_text,package_code,
      contractor,scope,requested_by,assigned_quality_id,requested_date,requested_time,ready,status,
      current_technical_score,current_preparation_score,current_final_score,objective,latest_decision,attachments,mapping_annotation,
      created_at,closed_at,closed_by,source_snapshot
    ) values(
      i->>'id',v_code,nullif(i->>'closureCode',''),v_project,coalesce(nullif(i->>'templateId',''),'UNKNOWN'),
      coalesce(i->>'activity','Migrado'),coalesce(i->>'stage','General'),nullif(i->>'mappingId',''),coalesce(i->>'location',''),
      nullif(i->>'packageCode',''),coalesce(i->>'contractor',''),coalesce(i->>'scope',''),v_requested,v_quality,
      coalesce((i->>'requestedDate')::date,current_date),nullif(i->>'requestedTime','')::time,coalesce((i->>'ready')::boolean,true),v_status,
      nullif(i->>'technicalScore','')::numeric,nullif(i->>'visitScore','')::numeric,nullif(i->>'finalScore','')::numeric,
      coalesce(nullif(i->>'objective','')::numeric,0),nullif(i->>'decision',''),coalesce(i->'attachments','[]'::jsonb),i->'mappingAnnotation',
      coalesce(nullif(i->>'createdAt','')::timestamptz,now()),nullif(i->>'completedAt','')::timestamptz,public.qpc_profile_id_from_legacy(i->>'closedBy'),i
    ) on conflict(legacy_id) do update set source_snapshot=excluded.source_snapshot
    returning id into v_ins_id;

    for v in select value from jsonb_array_elements(coalesce(i->'visitEvaluations','[]'::jsonb)) loop
      v_number=coalesce((v->>'number')::integer,1);
      insert into public.qpc_inspection_visits(
        legacy_id,inspection_id,visit_number,visit_type,template_id,activity,stage,template_snapshot,answers_snapshot,notes_snapshot,
        started_by,finished_by,started_at,finished_at,status,technical_score,preparation_score,final_score,objective,decision,general_observation
      ) values(
        v->>'id',v_ins_id,v_number,
        case when lower(coalesce(v->>'stage','')) like '%cierre%' or lower(coalesce(v->>'stage','')) like '%termin%' then 'CIERRE'
             when v_number=1 then 'LIBERACION' else 'SEGUIMIENTO' end,
        coalesce(nullif(v->>'templateId',''),coalesce(nullif(i->>'templateId',''),'UNKNOWN')),
        coalesce(v->>'activity',i->>'activity','Migrado'),coalesce(v->>'stage',i->>'stage','General'),null,
        coalesce(v->'answers','{}'::jsonb),coalesce(v->'notes','{}'::jsonb),
        coalesce(public.qpc_profile_id_from_legacy(v->>'startedBy'),v_quality,v_requested),public.qpc_profile_id_from_legacy(v->>'finishedBy'),
        coalesce(nullif(v->>'startedAt','')::timestamptz,now()),nullif(v->>'finishedAt','')::timestamptz,
        case when coalesce(v->>'status','')='FINALIZADA' then 'FINALIZADA' else 'EN_PROCESO' end,
        nullif(v->>'technicalScore','')::numeric,nullif(v->>'visitScore','')::numeric,nullif(v->>'finalScore','')::numeric,
        coalesce(nullif(v->>'objective','')::numeric,coalesce(nullif(i->>'objective','')::numeric,0)),nullif(v->>'decision',''),coalesce(v->>'generalObservation','')
      ) on conflict(legacy_id) do nothing returning id into v_visit_id;
    end loop;
  end loop;
end $$;


-- Inicializar secuencias con los códigos ya migrados para impedir colisiones.
insert into public.qpc_inspection_request_sequences(project_id,request_date,last_value)
select project_id,requested_date,
       max(case when request_code ~ '-[0-9]{2}$' then right(request_code,2)::integer else 1 end)
from public.qpc_inspections
group by project_id,requested_date
on conflict(project_id,request_date)
do update set last_value=greatest(public.qpc_inspection_request_sequences.last_value,excluded.last_value),updated_at=now();

insert into public.qpc_inspection_closure_sequences(project_id,inspector_id,initials,last_value)
select project_id,closed_by,
       regexp_replace(closure_code,'[0-9]+$','','g'),
       max(coalesce(nullif(regexp_replace(closure_code,'^[^0-9]+','','g'),''),'0')::integer)
from public.qpc_inspections
where closure_code is not null and closed_by is not null
group by project_id,closed_by,regexp_replace(closure_code,'[0-9]+$','','g')
on conflict(project_id,inspector_id)
do update set last_value=greatest(public.qpc_inspection_closure_sequences.last_value,excluded.last_value),initials=excluded.initials,updated_at=now();

insert into public.qpc_inspection_status_history(inspection_id,previous_status,new_status,changed_by,comment,created_at)
select i.id,null,i.status,coalesce(i.closed_by,i.assigned_quality_id,i.requested_by),'Estado inicial migrado desde app_state',i.created_at
from public.qpc_inspections i
where not exists(select 1 from public.qpc_inspection_status_history h where h.inspection_id=i.id);

-- -----------------------------------------------------------------------------
-- 5. RLS: lectura por proyecto/propietario; escrituras únicamente por funciones seguras
-- -----------------------------------------------------------------------------
alter table public.qpc_inspections enable row level security;
alter table public.qpc_inspection_visits enable row level security;
alter table public.qpc_visit_answers enable row level security;
alter table public.qpc_inspection_status_history enable row level security;

drop policy if exists qpc_inspections_select on public.qpc_inspections;
create policy qpc_inspections_select on public.qpc_inspections for select to authenticated using (
  public.qpc_actor_can_view_inspection(auth.uid(),id)
);

drop policy if exists qpc_visits_select on public.qpc_inspection_visits;
create policy qpc_visits_select on public.qpc_inspection_visits for select to authenticated using (
  public.qpc_actor_can_view_inspection(auth.uid(),inspection_id)
);

drop policy if exists qpc_answers_select on public.qpc_visit_answers;
create policy qpc_answers_select on public.qpc_visit_answers for select to authenticated using (
  exists(select 1 from public.qpc_inspection_visits v where v.id=visit_id and public.qpc_actor_can_view_inspection(auth.uid(),v.inspection_id))
);

drop policy if exists qpc_history_select on public.qpc_inspection_status_history;
create policy qpc_history_select on public.qpc_inspection_status_history for select to authenticated using (
  public.qpc_actor_can_view_inspection(auth.uid(),inspection_id)
);

grant select on public.qpc_inspections,public.qpc_inspection_visits,public.qpc_visit_answers,public.qpc_inspection_status_history to authenticated;
grant execute on function public.qpc_actor_can_view_inspection(uuid,uuid) to authenticated;

-- La Edge Function usa service_role y llama estas RPC con actor explícito.
revoke all on function public.qpc_create_inspection_request(uuid,jsonb) from public,anon,authenticated;
revoke all on function public.qpc_take_inspection(uuid,uuid) from public,anon,authenticated;
revoke all on function public.qpc_start_inspection_visit(uuid,uuid,jsonb) from public,anon,authenticated;
revoke all on function public.qpc_save_visit_draft(uuid,uuid,jsonb) from public,anon,authenticated;
revoke all on function public.qpc_finish_inspection_visit(uuid,uuid,jsonb) from public,anon,authenticated;
revoke all on function public.qpc_mark_inspection_improper(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.qpc_create_inspection_request(uuid,jsonb) to service_role;
grant execute on function public.qpc_take_inspection(uuid,uuid) to service_role;
grant execute on function public.qpc_start_inspection_visit(uuid,uuid,jsonb) to service_role;
grant execute on function public.qpc_save_visit_draft(uuid,uuid,jsonb) to service_role;
grant execute on function public.qpc_finish_inspection_visit(uuid,uuid,jsonb) to service_role;
grant execute on function public.qpc_mark_inspection_improper(uuid,uuid,text) to service_role;

commit;

-- Verificación final
select 'qpc_inspections' as tabla,count(*) as registros from public.qpc_inspections
union all select 'qpc_inspection_visits',count(*) from public.qpc_inspection_visits
union all select 'qpc_visit_answers',count(*) from public.qpc_visit_answers
union all select 'qpc_inspection_status_history',count(*) from public.qpc_inspection_status_history;
