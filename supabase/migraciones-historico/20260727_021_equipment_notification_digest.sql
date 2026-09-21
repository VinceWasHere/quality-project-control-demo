-- Quality Project Control MAIN V10.1 · Fase 22
-- Agrupa las alertas de equipos en una sola tarjeta por proyecto y destinatario.

begin;

-- Las alertas individuales de V10.0 se conservan para auditoría, pero se archivan
-- para que no sigan llenando la bandeja personal.
update public.qpc_notifications
set archived_at = coalesce(archived_at, now()),
    read_at = coalesce(read_at, now())
where category = 'EQUIPMENT'
  and archived_at is null
  and event_key like 'equipment:%:due:%';

create or replace function public.qpc_refresh_due_equipment_notifications()
returns integer
language plpgsql
security definer
set search_path=public
as $$
declare
  v_project record;
  v_profile record;
  v_items jsonb;
  v_expired integer;
  v_upcoming integer;
  v_body text;
  v_fingerprint text;
  v_event_key text;
  v_result uuid;
  v_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Sesión requerida';
  end if;

  -- Retira cualquier alerta individual que todavía haya quedado activa.
  update public.qpc_notifications
  set archived_at = coalesce(archived_at, now()),
      read_at = coalesce(read_at, now())
  where category = 'EQUIPMENT'
    and archived_at is null
    and event_key like 'equipment:%:due:%';

  -- Se archivan temporalmente los resúmenes anteriores. Los proyectos que aún
  -- tienen equipos vencidos o próximos se reactivan mediante el UPSERT inferior.
  update public.qpc_notifications
  set archived_at = coalesce(archived_at, now())
  where category = 'EQUIPMENT'
    and event_key like 'equipment-summary:%';

  for v_project in
    select p.id, p.name
    from public.qpc_projects p
    where p.is_active = true
    order by p.name
  loop
    select
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', due.id,
            'code', due.equipment_code,
            'type', due.equipment_type,
            'brand_model', due.brand_model,
            'location', due.location_text,
            'responsible', due.responsible,
            'due_date', due.due_date,
            'status', due.status
          )
          order by due.due_date, due.equipment_code
        ),
        '[]'::jsonb
      ),
      (count(*) filter (where due.status = 'VENCIDO'))::integer,
      (count(*) filter (where due.status = 'PRÓXIMO'))::integer
    into v_items, v_expired, v_upcoming
    from (
      select
        e.id,
        e.equipment_code,
        e.equipment_type,
        e.brand_model,
        e.location_text,
        e.responsible,
        least(
          case
            when e.calibration_required and e.last_calibration_date is not null
              then e.last_calibration_date + e.frequency_days
          end,
          case
            when e.verification_required and e.last_verification_date is not null
              then e.last_verification_date + e.frequency_days
          end
        ) as due_date,
        case
          when least(
            case
              when e.calibration_required and e.last_calibration_date is not null
                then e.last_calibration_date + e.frequency_days
            end,
            case
              when e.verification_required and e.last_verification_date is not null
                then e.last_verification_date + e.frequency_days
            end
          ) < current_date then 'VENCIDO'
          else 'PRÓXIMO'
        end as status
      from public.qpc_equipment e
      where e.project_id = v_project.id
        and e.is_active = true
    ) due
    where due.due_date is not null
      and due.due_date <= current_date + 30;

    if jsonb_array_length(v_items) = 0 then
      continue;
    end if;

    v_body := concat_ws(
      ' · ',
      case when v_expired > 0 then v_expired || case when v_expired = 1 then ' vencido' else ' vencidos' end end,
      case when v_upcoming > 0 then v_upcoming || case when v_upcoming = 1 then ' próximo a vencer' else ' próximos a vencer' end end
    );
    v_fingerprint := md5(v_items::text);

    for v_profile in
      select distinct p.id
      from public.profiles p
      join public.project_members pm
        on pm.user_id = p.id
       and pm.project_id = v_project.id
       and pm.is_active = true
      where p.is_active = true
        and p.role in ('CALIDAD','COORDINADOR_CALIDAD','IT')
    loop
      v_event_key := concat('equipment-summary:', v_project.id, ':', v_profile.id);

      insert into public.qpc_notifications(
        recipient_id,
        project_id,
        category,
        title,
        body,
        entity_type,
        entity_id,
        action_view,
        event_key,
        metadata,
        created_at,
        archived_at
      ) values (
        v_profile.id,
        v_project.id,
        'EQUIPMENT',
        'Alertas de equipos',
        v_body,
        'EQUIPMENT_SUMMARY',
        v_project.id,
        'equipment',
        v_event_key,
        jsonb_build_object(
          'project_name', v_project.name,
          'expired_count', v_expired,
          'upcoming_count', v_upcoming,
          'total_count', v_expired + v_upcoming,
          'fingerprint', v_fingerprint,
          'items', v_items
        ),
        now(),
        null
      )
      on conflict (event_key) do update
      set title = excluded.title,
          body = excluded.body,
          metadata = excluded.metadata,
          entity_type = excluded.entity_type,
          entity_id = excluded.entity_id,
          action_view = excluded.action_view,
          archived_at = null,
          created_at = case
            when public.qpc_notifications.metadata->>'fingerprint'
                 is distinct from excluded.metadata->>'fingerprint'
              then now()
            else public.qpc_notifications.created_at
          end,
          read_at = case
            when public.qpc_notifications.metadata->>'fingerprint'
                 is distinct from excluded.metadata->>'fingerprint'
              then null
            else public.qpc_notifications.read_at
          end
      returning id into v_result;

      if v_result is not null then
        v_count := v_count + 1;
      end if;
    end loop;
  end loop;

  return v_count;
end;
$$;

grant execute on function public.qpc_refresh_due_equipment_notifications() to authenticated;

comment on function public.qpc_refresh_due_equipment_notifications() is
  'Genera una sola notificación consolidada de equipos por proyecto y destinatario.';

commit;
