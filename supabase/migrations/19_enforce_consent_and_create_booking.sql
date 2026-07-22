-- Subsystem 4 enforcement. Gated write RPCs now refuse to run while the caller is
-- behind on a required consent. Booking creation moves from a direct client INSERT
-- (permissive WITH CHECK (true) policy) to a create_booking RPC that checks consent
-- and records the booking waiver in the same transaction, so no booking exists
-- without its waiver. The old insert policy is dropped.

drop policy if exists "bookings_insert_authenticated" on public.bookings;

create or replace function public.create_booking(
  p_boat_id uuid, p_guest_name text, p_guest_phone text, p_hotel_id uuid,
  p_start_date date, p_days int, p_start_time time, p_duration_hours numeric,
  p_group_size int, p_experience_type text, p_price_total numeric, p_deposit_amount numeric,
  p_notes text, p_waiver_version int, p_waiver_accepted boolean
) returns table(id uuid, deposit_amount numeric)
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id uuid; v_dep numeric; v_tourist uuid; v_doc public.legal_documents;
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

  v_tourist := case when p_hotel_id is null then auth.uid() else null end;

  begin
    insert into public.bookings
      (boat_id, tourist_id, hotel_id, guest_name, guest_phone, start_date, days,
       start_time, duration_hours, group_size, experience_type, price_total, deposit_amount, notes)
    values
      (p_boat_id, v_tourist, p_hotel_id, p_guest_name, p_guest_phone, p_start_date, p_days,
       p_start_time, p_duration_hours, p_group_size, p_experience_type, p_price_total, p_deposit_amount, p_notes)
    returning bookings.id, bookings.deposit_amount into v_id, v_dep;
  exception when exclusion_violation then
    raise exception 'That slot was just booked by someone else. Pick another time.';
  end;

  insert into public.consent_records (user_id, document_id, doc_type, version, context, booking_id, accepted)
  values (auth.uid(), v_doc.id, 'booking_waiver', p_waiver_version, 'booking', v_id, true);

  id := v_id; deposit_amount := v_dep; return next;
end; $$;
revoke all on function public.create_booking(uuid, text, text, uuid, date, int, time, numeric, int, text, numeric, numeric, text, int, boolean) from public, anon;
grant execute on function public.create_booking(uuid, text, text, uuid, date, int, time, numeric, int, text, numeric, numeric, text, int, boolean) to authenticated;

-- Add the consent guard to the existing gated RPCs (full bodies preserved).
create or replace function public.submit_boat_for_review(p_boat_id uuid)
 returns boats language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare v_boat public.boats;
begin
  if public.has_outstanding_required_consent() then raise exception 'Consent required'; end if;
  select * into v_boat from public.boats where id = p_boat_id;
  if not found then raise exception 'Boat not found'; end if;
  if v_boat.owner_id <> auth.uid() then raise exception 'Not your boat'; end if;
  if (select verification_status from public.profiles where id = auth.uid()) <> 'verified' then
    raise exception 'Your owner account is pending verification. An admin will review it before your boats can go live.';
  end if;
  if v_boat.status not in ('draft','rejected') then
    raise exception 'Only a draft or rejected boat can be submitted for review';
  end if;
  if not exists (select 1 from public.boat_images where boat_id = p_boat_id) then
    raise exception 'Add at least one photo before submitting for review';
  end if;
  update public.boats set status = 'pending', rejection_reason = null
  where id = p_boat_id returning * into v_boat;
  return v_boat;
end; $function$;

create or replace function public.owner_set_booking_status(p_booking_id uuid, p_status booking_status)
 returns bookings language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare v_booking public.bookings; v_owner uuid; v_ok boolean;
begin
  if public.has_outstanding_required_consent() then raise exception 'Consent required'; end if;
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
end; $function$;

create or replace function public.propose_boat_changes(p_boat_id uuid, p_changes jsonb)
 returns boats language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare v_boat public.boats;
begin
  if public.has_outstanding_required_consent() then raise exception 'Consent required'; end if;
  select * into v_boat from public.boats where id = p_boat_id;
  if not found then raise exception 'Boat not found'; end if;
  if v_boat.owner_id <> auth.uid() then raise exception 'Not your boat'; end if;

  perform set_config('app.boat_hours_ctx', 'on', true);
  if v_boat.status = 'approved' and public.is_sensitive_change(p_changes) then
    update public.boats
    set pending_changes = coalesce(pending_changes, '{}'::jsonb) || p_changes
    where id = p_boat_id returning * into v_boat;
  else
    update public.boats set
      name = coalesce(p_changes->>'name', name),
      description = coalesce(p_changes->>'description', description),
      location = coalesce(p_changes->>'location', location),
      capacity = coalesce((p_changes->>'capacity')::int, capacity),
      price_per_hour = coalesce((p_changes->>'price_per_hour')::numeric, price_per_hour),
      price_per_day = coalesce((p_changes->>'price_per_day')::numeric, price_per_day),
      facilities = coalesce(
        (select array_agg(value::text) from jsonb_array_elements_text(p_changes->'facilities')),
        facilities),
      safety_equipment = coalesce(
        (select array_agg(value::text) from jsonb_array_elements_text(p_changes->'safety_equipment')),
        safety_equipment),
      crew_included = coalesce((p_changes->>'crew_included')::boolean, crew_included),
      fuel_policy = coalesce((p_changes->>'fuel_policy')::fuel_policy_kind, fuel_policy),
      registration_number = coalesce(p_changes->>'registration_number', registration_number),
      boat_type = coalesce((p_changes->>'boat_type')::boat_kind, boat_type),
      maintenance_interval_hours = coalesce(
        (p_changes->>'maintenance_interval_hours')::numeric, maintenance_interval_hours),
      is_active = coalesce((p_changes->>'is_active')::boolean, is_active)
    where id = p_boat_id returning * into v_boat;
  end if;
  perform set_config('app.boat_hours_ctx', 'off', true);
  return v_boat;
end; $function$;
