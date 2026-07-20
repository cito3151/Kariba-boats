-- Bug in migrations 02/04: guard_boat_privileges blocks changes to
-- accumulated_hours and last_maintenance_hours unless is_admin(). But those
-- columns are meant to be moved by the SECURITY DEFINER RPCs log_operating_hours
-- / complete_maintenance, which run with auth.uid() still set to the (non-admin)
-- owner, so the trigger rejected the RPC's own update, making the hours ledger
-- unusable. Fix: the RPCs set a transaction-local flag that the trigger honors,
-- so legitimate RPC writes pass while direct client writes to those columns stay
-- blocked (clients cannot set the flag through the REST API).

create or replace function public.guard_boat_privileges()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $$
begin
  -- Set only inside log_operating_hours() / complete_maintenance(). Direct client
  -- updates never set it, so protected columns stay locked for them.
  if coalesce(current_setting('app.boat_hours_ctx', true), '') = 'on' then
    new.updated_at := now();
    return new;
  end if;

  if not public.is_admin() then
    if new.status is distinct from old.status
       and not (old.status in ('draft','rejected') and new.status = 'pending') then
      raise exception 'Owners may only submit a boat for review. Approval is an administrator action.';
    end if;
    if new.accumulated_hours is distinct from old.accumulated_hours then
      raise exception 'Operating hours must be logged through log_operating_hours()';
    end if;
    if new.last_maintenance_hours is distinct from old.last_maintenance_hours then
      raise exception 'Maintenance resets must go through complete_maintenance()';
    end if;
    if new.approved_at is distinct from old.approved_at
       or new.approved_by is distinct from old.approved_by
       or new.pending_changes is distinct from old.pending_changes then
      raise exception 'Approval metadata is administrator-only';
    end if;
  end if;
  new.updated_at := now();
  return new;
end; $$;

create or replace function public.log_operating_hours(
  p_boat_id uuid, p_hours numeric, p_note text default null, p_booking_id uuid default null
) returns public.boats
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_boat public.boats;
  v_status_before text;
  v_new_total numeric(10,1);
begin
  select * into v_boat from public.boats where id = p_boat_id for update;
  if not found then raise exception 'Boat not found'; end if;
  if v_boat.owner_id <> auth.uid() and not public.is_admin() then
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
  update public.boats set accumulated_hours = v_new_total
  where id = p_boat_id returning * into v_boat;
  perform set_config('app.boat_hours_ctx', 'off', true);

  -- Notify only when the status actually changed, and dedup on the reading.
  if v_boat.maintenance_status <> v_status_before
     and v_boat.maintenance_status in ('approaching','due','overdue') then
    insert into public.maintenance_notifications
      (boat_id, recipient_id, level, message, hours_at_trigger)
    values (
      p_boat_id, v_boat.owner_id, v_boat.maintenance_status,
      case v_boat.maintenance_status
        when 'approaching' then v_boat.name || ' is approaching maintenance, ' ||
             v_boat.hours_remaining || ' hours remaining.'
        when 'due' then v_boat.name || ' has reached its maintenance interval at ' ||
             v_boat.accumulated_hours || ' hours.'
        else v_boat.name || ' is overdue for maintenance and has been hidden from tourist search.'
      end,
      v_boat.accumulated_hours
    )
    on conflict (boat_id, level, hours_at_trigger) do nothing;
  end if;

  return v_boat;
end; $$;

create or replace function public.complete_maintenance(
  p_boat_id uuid, p_description text, p_performed_at date default current_date,
  p_cost numeric default null, p_service_provider text default null
) returns public.boats
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_boat public.boats;
begin
  select * into v_boat from public.boats where id = p_boat_id for update;
  if not found then raise exception 'Boat not found'; end if;
  if v_boat.owner_id <> auth.uid() and not public.is_admin() then
    raise exception 'You can only complete maintenance for your own boats';
  end if;

  insert into public.boat_maintenance_records
    (boat_id, performed_at, hours_at_service, interval_at_service,
     description, cost, service_provider, performed_by)
  values (p_boat_id, p_performed_at, v_boat.accumulated_hours,
          v_boat.maintenance_interval_hours, p_description, p_cost,
          p_service_provider, auth.uid());

  -- Reset the cycle: next due becomes accumulated + interval.
  perform set_config('app.boat_hours_ctx', 'on', true);
  update public.boats set last_maintenance_hours = v_boat.accumulated_hours
  where id = p_boat_id returning * into v_boat;
  perform set_config('app.boat_hours_ctx', 'off', true);

  update public.maintenance_notifications
  set is_read = true where boat_id = p_boat_id and not is_read;

  return v_boat;
end; $$;
