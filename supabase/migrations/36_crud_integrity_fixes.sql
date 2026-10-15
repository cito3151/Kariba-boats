-- CRUD integrity fixes, batch 1: bug fixes and security fixes from the CRUD audit.
--
-- Every function replaced here was fetched live with pg_get_functiondef before this
-- file was written. Only the parts named below change; everything else in each
-- body is the live definition, unchanged.
--
--  B1  propose_boat_changes: on an approved boat, non-sensitive keys apply at once
--      and only sensitive keys whose value actually differs go to pending_changes.
--      Before, any sensitive key name in the payload (the form sends all of them)
--      routed the whole payload to pending_changes, and admin_review_changes then
--      applied only the sensitive columns, so description, location, facilities,
--      fuel_policy and maintenance_interval_hours edits were silently lost.
--      deposit_percent becomes editable: sensitive on an approved boat (it changes
--      what guests pay), applied directly on a draft, pending, rejected or
--      suspended boat. Ownership check is null-safe.
--  B2  Revoke table-wide UPDATE on boats from anon and authenticated. Every boat
--      write goes through a SECURITY DEFINER RPC; no client code updates boats.
--  B3  create_booking refuses a boat that public_boats does not list. The check
--      reads public_boats itself, so the two rules cannot drift.
--  B4  create_booking refuses an agency caller unless verified and linked to an
--      agency. B5 follows: admin_review_account setting an agency to rejected
--      (or back to pending) removes 'verified', so it can no longer book. Hotels
--      were already covered by guard_hotel_booking. No data is unlinked.
--  P1-c cancel_booking also allows the hotel or agency the booking was made by.
--  M4  Ownership checks use `is distinct from auth.uid()` in the functions above
--      and in complete_maintenance, log_operating_hours, owner_set_booking_status
--      and assign_captain. With `<>`, a null owner made the test null, and in
--      cancel_booking a null inside the AND chain skipped the raise.
--  Hygiene grants: maintenance_notifications UPDATE narrowed to is_read; anon
--  loses INSERT/UPDATE/DELETE on bookings, hotels, agencies, the maintenance
--  tables and admin_approval_logs; anon loses SELECT on hotels and agencies.

-- B1 ---------------------------------------------------------------------------

create or replace function public.is_sensitive_change(p_changes jsonb)
 returns boolean
 language sql
 immutable
as $function$
  select exists (
    select 1 from jsonb_object_keys(p_changes) k
    where k in ('name','boat_type','capacity','price_per_hour','price_per_day',
                'safety_equipment','crew_included','registration_number',
                'deposit_percent')
  );
$function$;

create or replace function public.propose_boat_changes(p_boat_id uuid, p_changes jsonb)
 returns public.boats
 language plpgsql
 security definer
 set search_path = public, pg_temp
as $function$
declare
  v_boat public.boats;
  v_current jsonb;
  v_direct jsonb := p_changes;
  v_pending jsonb := '{}'::jsonb;
begin
  if public.has_outstanding_required_consent() then raise exception 'Consent required'; end if;
  select * into v_boat from public.boats where id = p_boat_id for update;
  if not found then raise exception 'Boat not found'; end if;
  if v_boat.owner_id is distinct from auth.uid() then raise exception 'Not your boat'; end if;

  if v_boat.status = 'approved' and p_changes is not null then
    -- Sensitive keys never apply directly to a live listing. Of those, only the
    -- ones whose value differs from the live value wait for review; an unchanged
    -- value is dropped. A JSON null means "keep" everywhere below (coalesce), so
    -- it is never a change. Numbers compare numerically (150 = 150.00 in jsonb).
    v_current := to_jsonb(v_boat);
    select coalesce(jsonb_object_agg(c.key, c.value), '{}'::jsonb) into v_pending
    from jsonb_each(p_changes) c
    where public.is_sensitive_change(jsonb_build_object(c.key, c.value))
      and jsonb_typeof(c.value) <> 'null'
      and (v_current -> c.key) is distinct from c.value;

    select coalesce(jsonb_object_agg(c.key, c.value), '{}'::jsonb) into v_direct
    from jsonb_each(p_changes) c
    where not public.is_sensitive_change(jsonb_build_object(c.key, c.value));
  end if;

  perform set_config('app.boat_hours_ctx', 'on', true);
  update public.boats set
    name = coalesce(v_direct->>'name', name),
    description = coalesce(v_direct->>'description', description),
    location = coalesce(v_direct->>'location', location),
    capacity = coalesce((v_direct->>'capacity')::int, capacity),
    price_per_hour = coalesce((v_direct->>'price_per_hour')::numeric, price_per_hour),
    price_per_day = coalesce((v_direct->>'price_per_day')::numeric, price_per_day),
    deposit_percent = coalesce((v_direct->>'deposit_percent')::numeric, deposit_percent),
    facilities = coalesce(
      (select array_agg(value::text) from jsonb_array_elements_text(v_direct->'facilities')),
      facilities),
    safety_equipment = coalesce(
      (select array_agg(value::text) from jsonb_array_elements_text(v_direct->'safety_equipment')),
      safety_equipment),
    crew_included = coalesce((v_direct->>'crew_included')::boolean, crew_included),
    fuel_policy = coalesce((v_direct->>'fuel_policy')::fuel_policy_kind, fuel_policy),
    registration_number = coalesce(v_direct->>'registration_number', registration_number),
    boat_type = coalesce((v_direct->>'boat_type')::boat_kind, boat_type),
    maintenance_interval_hours = coalesce(
      (v_direct->>'maintenance_interval_hours')::numeric, maintenance_interval_hours),
    is_active = coalesce((v_direct->>'is_active')::boolean, is_active),
    pending_changes = case
      when v_pending = '{}'::jsonb then pending_changes
      else coalesce(pending_changes, '{}'::jsonb) || v_pending
    end
  where id = p_boat_id returning * into v_boat;
  perform set_config('app.boat_hours_ctx', 'off', true);
  return v_boat;
end; $function$;

revoke all on function public.propose_boat_changes(uuid, jsonb) from public, anon;
grant execute on function public.propose_boat_changes(uuid, jsonb) to authenticated;

create or replace function public.admin_review_changes(p_boat_id uuid, p_approve boolean, p_reason text default null::text)
 returns public.boats
 language plpgsql
 security definer
 set search_path = public, pg_temp
as $function$
declare v_boat public.boats; v_changes jsonb;
begin
  if not public.is_admin() then raise exception 'Administrator only'; end if;
  select * into v_boat from public.boats where id = p_boat_id;
  if not found then raise exception 'Boat not found'; end if;
  v_changes := v_boat.pending_changes;
  if v_changes is null then raise exception 'This boat has no pending changes'; end if;

  if p_approve then
    update public.boats set
      name = coalesce(v_changes->>'name', name),
      boat_type = coalesce((v_changes->>'boat_type')::boat_kind, boat_type),
      capacity = coalesce((v_changes->>'capacity')::int, capacity),
      price_per_hour = coalesce((v_changes->>'price_per_hour')::numeric, price_per_hour),
      price_per_day = coalesce((v_changes->>'price_per_day')::numeric, price_per_day),
      deposit_percent = coalesce((v_changes->>'deposit_percent')::numeric, deposit_percent),
      safety_equipment = coalesce(
        (select array_agg(value::text) from jsonb_array_elements_text(v_changes->'safety_equipment')),
        safety_equipment),
      crew_included = coalesce((v_changes->>'crew_included')::boolean, crew_included),
      registration_number = coalesce(v_changes->>'registration_number', registration_number),
      pending_changes = null
    where id = p_boat_id returning * into v_boat;
  else
    update public.boats set pending_changes = null, rejection_reason = p_reason
    where id = p_boat_id returning * into v_boat;
  end if;

  insert into public.admin_approval_logs (boat_id, admin_id, action, reason, snapshot)
  values (p_boat_id, auth.uid(),
          case when p_approve then 'approve_changes' else 'reject_changes' end,
          p_reason, v_changes);
  return v_boat;
end; $function$;

revoke all on function public.admin_review_changes(uuid, boolean, text) from public, anon;
grant execute on function public.admin_review_changes(uuid, boolean, text) to authenticated;

-- B2 ---------------------------------------------------------------------------
-- No client code calls .update() on boats (src/services/boats.service.ts only
-- selects and inserts). Every write runs inside a SECURITY DEFINER function owned
-- by postgres, so it keeps working: propose_boat_changes (edits and is_active),
-- submit_boat_for_review, soft_delete_boat, admin_review_boat,
-- admin_review_changes, log_operating_hours, complete_maintenance and
-- purge_deleted_accounts. Create stays a direct INSERT (grant unchanged), guarded
-- by boats_insert_own_as_owner and guard_boat_insert. There are no column-level
-- UPDATE grants on boats, so this closes the direct PATCH path entirely, along
-- with the review bypass and the soft_delete_boat upcoming-bookings check.

revoke update on public.boats from anon, authenticated;

-- B3, B4 -------------------------------------------------------------------------

create or replace function public.create_booking(p_boat_id uuid, p_guest_name text, p_guest_phone text, p_start_date date, p_days integer, p_group_size integer, p_experience_type text, p_price_total numeric, p_deposit_amount numeric, p_waiver_version integer, p_waiver_accepted boolean, p_hotel_id uuid default null::uuid, p_start_time time without time zone default null::time without time zone, p_duration_hours numeric default null::numeric, p_notes text default null::text)
 returns table(id uuid, deposit_amount numeric, reference text)
 language plpgsql
 security definer
 set search_path = public, pg_temp
as $function$
declare
  v_id uuid; v_dep numeric; v_tourist uuid; v_agency uuid; v_doc public.legal_documents;
  v_boat public.boats; v_total numeric; v_hourly boolean; v_role text; v_caller_agency uuid;
  v_ref text; v_verification text;
begin
  if public.has_outstanding_required_consent() then
    raise exception 'Consent required';
  end if;
  if not coalesce(p_waiver_accepted, false) then
    raise exception 'You must accept the booking waiver to continue.';
  end if;
  select * into v_doc from public.legal_documents
    where doc_type = 'booking_waiver' and version = p_waiver_version and is_current;
  if not found then
    raise exception 'The booking waiver was updated. Please refresh and try again.';
  end if;

  select b.* into v_boat from public.boats b where b.id = p_boat_id;
  if not found then raise exception 'Boat not found'; end if;
  -- B3: bookable means listed. public_boats is the one definition of "listed"
  -- (approved, active, not deleted, not hidden for overdue maintenance), so this
  -- reads it rather than restating its WHERE clause.
  if not exists (select 1 from public.public_boats pb where pb.id = p_boat_id) then
    raise exception 'This boat is not available for booking.';
  end if;

  v_hourly := p_start_time is not null and p_duration_hours is not null;
  if v_hourly then
    if v_boat.price_per_hour is null then raise exception 'This boat has no hourly rate.'; end if;
    v_total := v_boat.price_per_hour * p_duration_hours;
  else
    if v_boat.price_per_day is null then raise exception 'This boat has no daily rate.'; end if;
    if p_days is null or p_days < 1 then raise exception 'Choose at least one day.'; end if;
    v_total := v_boat.price_per_day * p_days;
  end if;
  v_dep := round(v_total * coalesce(v_boat.deposit_percent, 20) / 100);

  select p.role::text, p.agency_id, p.verification_status::text
    into v_role, v_caller_agency, v_verification
    from public.profiles p where p.id = auth.uid();
  -- B4/B5: an agency books only while verified and linked to an agency. A
  -- rejected or revoked agency keeps its agency_id (history stays linked) but
  -- loses 'verified', so it stops here.
  if v_role = 'agency'
     and (v_verification is distinct from 'verified' or v_caller_agency is null) then
    raise exception 'Your agency account must be verified before you can book for clients.';
  end if;
  if p_hotel_id is not null then
    v_tourist := null; v_agency := null;
  elsif v_role = 'agency' then
    v_tourist := null; v_agency := v_caller_agency;
  else
    v_tourist := auth.uid(); v_agency := null;
  end if;

  begin
    insert into public.bookings
      (boat_id, tourist_id, hotel_id, agency_id, guest_name, guest_phone, start_date, days,
       start_time, duration_hours, group_size, experience_type, price_total, deposit_amount, notes)
    values
      (p_boat_id, v_tourist, p_hotel_id, v_agency, p_guest_name, p_guest_phone, p_start_date, p_days,
       p_start_time, p_duration_hours, p_group_size, p_experience_type, v_total, v_dep, p_notes)
    returning bookings.id, bookings.deposit_amount, bookings.reference into v_id, v_dep, v_ref;
  exception when exclusion_violation then
    raise exception 'That slot was just booked by someone else. Pick another time.';
  end;

  insert into public.consent_records (user_id, document_id, doc_type, version, context, booking_id, accepted)
  values (auth.uid(), v_doc.id, 'booking_waiver', p_waiver_version, 'booking', v_id, true);

  id := v_id; deposit_amount := v_dep; reference := v_ref; return next;
end; $function$;

revoke all on function public.create_booking(uuid, text, text, date, integer, integer, text, numeric, numeric, integer, boolean, uuid, time without time zone, numeric, text) from public, anon;
grant execute on function public.create_booking(uuid, text, text, date, integer, integer, text, numeric, numeric, integer, boolean, uuid, time without time zone, numeric, text) to authenticated;

-- P1-c ---------------------------------------------------------------------------
-- Same statuses as before: completed refuses, cancelled is a no-op, every other
-- status cancels. Same tourist, owner and admin paths. New: the hotel or agency
-- the booking was made for. Each partner test is false, never null, when either
-- side is null, so a caller with no hotel or agency never matches a booking with
-- none.

create or replace function public.cancel_booking(p_booking_id uuid)
 returns public.bookings
 language plpgsql
 security definer
 set search_path = public, pg_temp
as $function$
declare v_booking public.bookings; v_owner uuid; v_hotel uuid; v_agency uuid;
begin
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found then raise exception 'Booking not found'; end if;
  select owner_id into v_owner from public.boats where id = v_booking.boat_id;
  select p.hotel_id, p.agency_id into v_hotel, v_agency from public.profiles p where p.id = auth.uid();
  if v_booking.tourist_id is distinct from auth.uid()
     and v_owner is distinct from auth.uid()
     and not coalesce(v_booking.hotel_id is not null and v_booking.hotel_id = v_hotel, false)
     and not coalesce(v_booking.agency_id is not null and v_booking.agency_id = v_agency, false)
     and not public.is_admin() then
    raise exception 'You can only cancel your own booking';
  end if;
  if v_booking.status = 'completed' then
    raise exception 'A completed trip cannot be cancelled';
  end if;
  if v_booking.status = 'cancelled' then return v_booking; end if;
  update public.bookings set status = 'cancelled' where id = p_booking_id returning * into v_booking;
  return v_booking;
end; $function$;

revoke all on function public.cancel_booking(uuid) from public, anon;
grant execute on function public.cancel_booking(uuid) to authenticated;

-- M4 -----------------------------------------------------------------------------
-- Live definitions; the only change in each is `<> auth.uid()` on an ownership
-- test becoming `is distinct from auth.uid()`.

create or replace function public.complete_maintenance(p_boat_id uuid, p_description text, p_performed_at date default current_date, p_cost numeric default null::numeric, p_service_provider text default null::text)
 returns public.boats
 language plpgsql
 security definer
 set search_path = public, pg_temp
as $function$
declare v_boat public.boats;
begin
  if public.has_outstanding_required_consent() then raise exception 'Consent required'; end if;
  select * into v_boat from public.boats where id = p_boat_id for update;
  if not found then raise exception 'Boat not found'; end if;
  if v_boat.owner_id is distinct from auth.uid() then
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

revoke all on function public.complete_maintenance(uuid, text, date, numeric, text) from public, anon;
grant execute on function public.complete_maintenance(uuid, text, date, numeric, text) to authenticated;

create or replace function public.log_operating_hours(p_boat_id uuid, p_hours numeric, p_note text default null::text, p_booking_id uuid default null::uuid)
 returns public.boats
 language plpgsql
 security definer
 set search_path = public, pg_temp
as $function$
declare v_boat public.boats; v_status_before text; v_new_total numeric(10,1);
begin
  if public.has_outstanding_required_consent() then raise exception 'Consent required'; end if;
  select * into v_boat from public.boats where id = p_boat_id for update;
  if not found then raise exception 'Boat not found'; end if;
  if v_boat.owner_id is distinct from auth.uid() then
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

revoke all on function public.log_operating_hours(uuid, numeric, text, uuid) from public, anon;
grant execute on function public.log_operating_hours(uuid, numeric, text, uuid) to authenticated;

create or replace function public.owner_set_booking_status(p_booking_id uuid, p_status booking_status)
 returns public.bookings
 language plpgsql
 security definer
 set search_path = public, pg_temp
as $function$
declare v_booking public.bookings; v_owner uuid; v_ok boolean;
begin
  if public.has_outstanding_required_consent() then raise exception 'Consent required'; end if;
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found then raise exception 'Booking not found'; end if;
  select owner_id into v_owner from public.boats where id = v_booking.boat_id;
  if v_owner is distinct from auth.uid() then
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
end; $function$;

revoke all on function public.owner_set_booking_status(uuid, booking_status) from public, anon;
grant execute on function public.owner_set_booking_status(uuid, booking_status) to authenticated;

create or replace function public.assign_captain(p_booking_id uuid, p_captain_id uuid)
 returns public.bookings
 language plpgsql
 security definer
 set search_path = public, pg_temp
as $function$
declare v_booking public.bookings; v_owner uuid; v_captain public.captains;
begin
  if public.has_outstanding_required_consent() then raise exception 'Consent required'; end if;
  select * into v_booking from public.bookings where id = p_booking_id;
  if not found then raise exception 'Booking not found'; end if;
  select owner_id into v_owner from public.boats where id = v_booking.boat_id;
  if v_owner is distinct from auth.uid() then raise exception 'Only the boat owner can assign a captain'; end if;
  if v_booking.status not in ('confirmed','deposit_paid','completed') then
    raise exception 'Confirm the booking before assigning a captain';
  end if;
  select * into v_captain from public.captains where id = p_captain_id;
  if not found or v_captain.owner_id is distinct from auth.uid() then
    raise exception 'That captain is not on your roster';
  end if;
  update public.bookings set captain_name = v_captain.name, captain_phone = v_captain.phone
  where id = p_booking_id returning * into v_booking;
  return v_booking;
end; $function$;

revoke all on function public.assign_captain(uuid, uuid) from public, anon;
grant execute on function public.assign_captain(uuid, uuid) to authenticated;

-- Hygiene grants -------------------------------------------------------------------

-- The only client write to maintenance_notifications is markNotificationRead
-- (is_read = true). complete_maintenance and log_operating_hours write as definer.
revoke update on public.maintenance_notifications from authenticated;
grant update (is_read) on public.maintenance_notifications to authenticated;

-- anon never writes these: booking requires sign-in (create_booking is granted to
-- authenticated only), and every other write is an authenticated RPC or an
-- admin-only policy. RLS already blocked these writes; this removes the grants.
revoke insert, update, delete on
  public.bookings, public.hotels, public.agencies,
  public.maintenance_notifications, public.boat_maintenance_records,
  public.boat_operating_hours, public.admin_approval_logs
from anon;

-- Nothing anon-facing reads hotels or agencies: the front end never selects
-- either table, public_boats does not join them, no policy or view references
-- them, and the only functions that do (admin_verify_hotel, admin_verify_agency)
-- are security definer. So anon loses SELECT outright, which also hides
-- commission_rate from it. authenticated is unchanged.
revoke select on public.hotels, public.agencies from anon;

notify pgrst, 'reload schema';
