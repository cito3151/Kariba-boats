-- Clean role separation: admin is oversight only (approve/reject/suspend, review
-- changes, verify users, cancel bookings). Boats are created, operated, and
-- deleted only by owner accounts. Reverses migration 13's admin insert allowance
-- and drops the "or admin" allowance from owner-operational RPCs. Admin oversight
-- RPCs (admin_review_boat, admin_review_changes, admin_set_verification,
-- cancel_booking) are unchanged and, being SECURITY DEFINER, bypass RLS.

drop policy if exists "boats_insert_own_or_admin" on public.boats;
drop policy if exists "boats_insert_own_as_owner" on public.boats;
create policy "boats_insert_own_as_owner" on public.boats
  for insert to authenticated
  with check (owner_id = auth.uid() and public.current_user_role() = 'owner');

drop policy if exists "boats_update_own_or_admin" on public.boats;
create policy "boats_update_own" on public.boats
  for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create or replace function public.log_operating_hours(
  p_boat_id uuid, p_hours numeric, p_note text default null, p_booking_id uuid default null
) returns public.boats
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_boat public.boats; v_status_before text; v_new_total numeric(10,1);
begin
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
end; $$;

create or replace function public.complete_maintenance(
  p_boat_id uuid, p_description text, p_performed_at date default current_date,
  p_cost numeric default null, p_service_provider text default null
) returns public.boats
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_boat public.boats;
begin
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
end; $$;

create or replace function public.soft_delete_boat(p_boat_id uuid)
returns public.boats language plpgsql security definer
set search_path = public, pg_temp as $$
declare v_boat public.boats; v_active int;
begin
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
end; $$;

create or replace function public.owner_set_booking_status(
  p_booking_id uuid, p_status booking_status
) returns public.bookings language plpgsql security definer
set search_path = public, pg_temp as $$
declare v_booking public.bookings; v_owner uuid; v_ok boolean;
begin
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found then raise exception 'Booking not found'; end if;
  select owner_id into v_owner from public.boats where id = v_booking.boat_id;
  if v_owner <> auth.uid() then
    raise exception 'Only the boat owner can change this booking';
  end if;
  v_ok := case v_booking.status
    when 'requested' then p_status in ('confirmed','declined','cancelled')
    when 'confirmed' then p_status in ('deposit_paid','completed','cancelled')
    when 'deposit_paid' then p_status in ('completed','cancelled')
    else false end;
  if not v_ok then raise exception 'Cannot change a % booking to %', v_booking.status, p_status; end if;
  update public.bookings set status = p_status where id = p_booking_id returning * into v_booking;
  return v_booking;
end; $$;
