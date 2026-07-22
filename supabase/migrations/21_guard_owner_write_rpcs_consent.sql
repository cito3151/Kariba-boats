-- Defense-in-depth: extend the consent guard to the remaining owner-write RPCs.
-- log_operating_hours, complete_maintenance, and soft_delete_boat now refuse to
-- run while the caller is behind on a required consent, matching submit_boat_for_review,
-- propose_boat_changes, owner_set_booking_status, and create_booking. The ConsentGate
-- already blocks these in the UI; this closes the direct-API path. Bodies are otherwise
-- unchanged from their current definitions.

create or replace function public.log_operating_hours(p_boat_id uuid, p_hours numeric, p_note text default null, p_booking_id uuid default null)
 returns boats language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare v_boat public.boats; v_status_before text; v_new_total numeric(10,1);
begin
  if public.has_outstanding_required_consent() then raise exception 'Consent required'; end if;
  select * into v_boat from public.boats where id = p_boat_id for update;
  if not found then raise exception 'Boat not found'; end if;
  if v_boat.owner_id <> auth.uid() then
    raise exception 'You can only log hours for your own boats';
  end if;
  if p_hours is null or p_hours <= 0 or p_hours > 24 then
    raise exception 'Hours must be greater than 0 and at most 24 per entry';
  end if;
  v_status_before := v_boat.maintenance_status;
  v_new_total := v_boat.accumulated_hours + p_hours;
  insert into public.boat_operating_hours (boat_id, booking_id, hours, reading_after, note, logged_by)
  values (p_boat_id, p_booking_id, p_hours, v_new_total, p_note, auth.uid());
  perform set_config('app.boat_hours_ctx', 'on', true);
  update public.boats set accumulated_hours = v_new_total where id = p_boat_id returning * into v_boat;
  perform set_config('app.boat_hours_ctx', 'off', true);
  if v_boat.maintenance_status <> v_status_before
     and v_boat.maintenance_status in ('approaching','due','overdue') then
    insert into public.maintenance_notifications (boat_id, recipient_id, level, message, hours_at_trigger)
    values (p_boat_id, v_boat.owner_id, v_boat.maintenance_status,
      case v_boat.maintenance_status
        when 'approaching' then v_boat.name || ' is approaching maintenance, ' || v_boat.hours_remaining || ' hours remaining.'
        when 'due' then v_boat.name || ' has reached its maintenance interval at ' || v_boat.accumulated_hours || ' hours.'
        else v_boat.name || ' is overdue for maintenance and has been hidden from tourist search.'
      end, v_boat.accumulated_hours)
    on conflict (boat_id, level, hours_at_trigger) do nothing;
  end if;
  return v_boat;
end; $function$;

create or replace function public.complete_maintenance(p_boat_id uuid, p_description text, p_performed_at date default current_date, p_cost numeric default null, p_service_provider text default null)
 returns boats language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare v_boat public.boats;
begin
  if public.has_outstanding_required_consent() then raise exception 'Consent required'; end if;
  select * into v_boat from public.boats where id = p_boat_id for update;
  if not found then raise exception 'Boat not found'; end if;
  if v_boat.owner_id <> auth.uid() then
    raise exception 'You can only complete maintenance for your own boats';
  end if;
  insert into public.boat_maintenance_records
    (boat_id, performed_at, hours_at_service, interval_at_service, description, cost, service_provider, performed_by)
  values (p_boat_id, p_performed_at, v_boat.accumulated_hours, v_boat.maintenance_interval_hours,
          p_description, p_cost, p_service_provider, auth.uid());
  perform set_config('app.boat_hours_ctx', 'on', true);
  update public.boats set last_maintenance_hours = v_boat.accumulated_hours where id = p_boat_id returning * into v_boat;
  perform set_config('app.boat_hours_ctx', 'off', true);
  update public.maintenance_notifications set is_read = true where boat_id = p_boat_id and not is_read;
  return v_boat;
end; $function$;

create or replace function public.soft_delete_boat(p_boat_id uuid)
 returns boats language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare v_boat public.boats; v_active int;
begin
  if public.has_outstanding_required_consent() then raise exception 'Consent required'; end if;
  select * into v_boat from public.boats where id = p_boat_id;
  if not found then raise exception 'Boat not found'; end if;
  if v_boat.owner_id <> auth.uid() then raise exception 'Not your boat'; end if;
  select count(*) into v_active from public.bookings
  where boat_id = p_boat_id and status in ('requested','confirmed','deposit_paid') and start_date >= current_date;
  if v_active > 0 then
    raise exception 'This boat has % upcoming booking(s). Cancel or complete them before deleting, or set the boat to unavailable instead.', v_active;
  end if;
  update public.boats set is_deleted = true, deleted_at = now(), is_active = false
  where id = p_boat_id returning * into v_boat;
  return v_boat;
end; $function$;
