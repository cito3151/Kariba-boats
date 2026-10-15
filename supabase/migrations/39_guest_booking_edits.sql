-- Batch 4: guests edit their booking request. Decision record: docs/adr/ADR-001-guest-booking-edits.md
--
-- Every function replaced here was fetched live with pg_get_functiondef before this
-- file was written (create_booking: migration 36's body; owner_set_booking_status:
-- migration 36's body). Only the parts named below change.
--
--  1. bookings.updated_by_guest_at: when the guest (or the hotel or agency that booked)
--     last changed the request. Set only by update_booking_request.
--  2. price_booking_request(): the trip checks and server-side price, shared by
--     create_booking and update_booking_request so the two cannot drift. It adds the
--     checks create_booking lacked: group size within the boat's capacity, no start
--     date before today (Kariba time), a rate of 0 counts as no rate, and readable
--     messages for the name, phone, days and duration rules.
--  3. create_booking: same signature, grants and behaviour, except the trip checks and
--     pricing now come from price_booking_request (so it gains the checks in 2).
--  4. update_booking_request(): edit a booking while it is 'requested'.
--  5. owner_set_booking_status: optional p_seen_guest_change, so an operator cannot
--     confirm or decline a request the guest changed after the operator loaded it.
--  6. Hygiene: clients lose table-wide INSERT, DELETE and TRUNCATE on bookings (unused:
--     no policy allows them and no client code writes the table). UPDATE was already
--     absent; every write is a SECURITY DEFINER RPC.

-- 1. The column -----------------------------------------------------------------
-- authenticated holds SELECT on bookings at table level, so the column is readable by
-- everyone bookings_read_involved already shows the row to. Nobody holds UPDATE, so no
-- guard trigger is needed: only update_booking_request (definer) writes it.

alter table public.bookings add column if not exists updated_by_guest_at timestamptz;

comment on column public.bookings.updated_by_guest_at is
  'When the booking party (tourist, or the hotel or agency that booked) last changed this request through update_booking_request. Null if never changed. Shown to the operator as "Changed by guest".';

-- 2. Shared trip checks and price ---------------------------------------------------
-- SECURITY INVOKER, and no client role may execute it. It is only called inside the
-- two SECURITY DEFINER functions below, where it runs as their owner, so it reads
-- boats and public_boats in full. Returns the server's total and deposit; whatever a
-- client claims a booking costs is never an input.
--
-- What it checks, in order (the first four are create_booking's, unchanged in effect):
--   * the boat exists;
--   * public_boats lists it (approved, active, not deleted, maintenance not overdue);
--   * hourly when both start time and duration are given, daily otherwise, and the
--     boat has a rate for that basis. New: a rate of 0 is no rate, as the booking form
--     has always treated it (before, a 0 rate priced a trip at nothing);
--   * daily: at least 1 day. New: at most 30, the bookings_days_check bound, with a
--     readable message;
--   * hourly. New: duration above 0 and at most 12 hours (bookings_duration_hours_check);
--   * new: group size at least 1 and at most the boat's capacity;
--   * new: a start date, not before today on the Kariba calendar (Africa/Harare, the
--     zone boat_busy_periods uses);
--   * new: a guest name of at least 2 and a phone of at least 6 characters, the
--     bookings_guest_name_check / bookings_guest_phone_check rules, with a readable
--     message instead of a constraint name.
-- Deposit: round(total * coalesce(deposit_percent, 20) / 100), as before.

create or replace function public.price_booking_request(
  p_boat_id uuid, p_guest_name text, p_guest_phone text,
  p_start_date date, p_days integer, p_group_size integer,
  p_start_time time without time zone, p_duration_hours numeric
)
 returns table(total numeric, deposit numeric)
 language plpgsql
 stable
 set search_path = public, pg_temp
as $function$
declare
  v_boat public.boats; v_hourly boolean; v_total numeric;
begin
  select b.* into v_boat from public.boats b where b.id = p_boat_id;
  if not found then raise exception 'Boat not found'; end if;
  if not exists (select 1 from public.public_boats pb where pb.id = p_boat_id) then
    raise exception 'This boat is not available for booking.';
  end if;

  if length(btrim(coalesce(p_guest_name, ''))) < 2 then
    raise exception 'Enter the guest''s full name.';
  end if;
  if length(btrim(coalesce(p_guest_phone, ''))) < 6 then
    raise exception 'Enter a phone number we can reach the guest on.';
  end if;

  if p_group_size is null or p_group_size < 1 then
    raise exception 'The group needs at least 1 guest.';
  end if;
  if v_boat.capacity is not null and p_group_size > v_boat.capacity then
    raise exception 'This boat takes up to % guests.', v_boat.capacity;
  end if;

  if p_start_date is null then raise exception 'Choose a date.'; end if;
  if p_start_date < (now() at time zone 'Africa/Harare')::date then
    raise exception 'That date has already passed. Choose today or a later date.';
  end if;

  v_hourly := p_start_time is not null and p_duration_hours is not null;
  if v_hourly then
    if coalesce(v_boat.price_per_hour, 0) <= 0 then raise exception 'This boat has no hourly rate.'; end if;
    if p_duration_hours <= 0 or p_duration_hours > 12 then
      raise exception 'An hourly trip can last up to 12 hours.';
    end if;
    v_total := v_boat.price_per_hour * p_duration_hours;
  else
    if coalesce(v_boat.price_per_day, 0) <= 0 then raise exception 'This boat has no daily rate.'; end if;
    if p_days is null or p_days < 1 then raise exception 'Choose at least one day.'; end if;
    if p_days > 30 then raise exception 'A booking can cover up to 30 days.'; end if;
    v_total := v_boat.price_per_day * p_days;
  end if;

  total := v_total;
  deposit := round(v_total * coalesce(v_boat.deposit_percent, 20) / 100);
  return next;
end; $function$;

comment on function public.price_booking_request(uuid, text, text, date, integer, integer, time without time zone, numeric) is
  'Internal. The trip checks and server-side price shared by create_booking and update_booking_request. Not executable by clients.';

revoke all on function public.price_booking_request(uuid, text, text, date, integer, integer, time without time zone, numeric)
  from public, anon, authenticated;

-- 3. create_booking -------------------------------------------------------------------
-- Live body (migration 36) with the boat lookup, B3 check and pricing block replaced by
-- one call to price_booking_request, which performs the same checks in the same terms
-- plus the new ones above. Consent, waiver, the B4 agency check, the tourist / hotel /
-- agency assignment, the insert, the overlap message and the consent record are
-- unchanged. Same signature, so create or replace keeps the grants; they are restated
-- anyway, as in migration 36.

create or replace function public.create_booking(p_boat_id uuid, p_guest_name text, p_guest_phone text, p_start_date date, p_days integer, p_group_size integer, p_experience_type text, p_price_total numeric, p_deposit_amount numeric, p_waiver_version integer, p_waiver_accepted boolean, p_hotel_id uuid default null::uuid, p_start_time time without time zone default null::time without time zone, p_duration_hours numeric default null::numeric, p_notes text default null::text)
 returns table(id uuid, deposit_amount numeric, reference text)
 language plpgsql
 security definer
 set search_path = public, pg_temp
as $function$
declare
  v_id uuid; v_dep numeric; v_tourist uuid; v_agency uuid; v_doc public.legal_documents;
  v_total numeric; v_role text; v_caller_agency uuid;
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

  -- Boat exists, is listed (B3), the trip is valid, and its price. p_price_total and
  -- p_deposit_amount are still accepted for compatibility and still ignored.
  select q.total, q.deposit into v_total, v_dep
    from public.price_booking_request(p_boat_id, p_guest_name, p_guest_phone, p_start_date,
                                      p_days, p_group_size, p_start_time, p_duration_hours) q;

  select p.role::text, p.agency_id, p.verification_status::text
    into v_role, v_caller_agency, v_verification
    from public.profiles p where p.id = auth.uid();
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

-- 4. update_booking_request -------------------------------------------------------------
-- Who: a signed-in caller who is
--   * the booking's tourist, or
--   * linked to the hotel the booking was made for, while that account is a verified
--     hotel account and the hotel is active (what create_booking / guard_hotel_booking
--     require to book), or
--   * linked to the agency the booking was made by, while that account is a verified
--     agency account and the agency is active (create_booking B4, guard_hotel_booking).
-- The operator and administrators have no edit path (ADR: the request is the guest's
-- offer). A booking that is not the caller's reads as not found, so an id discloses
-- nothing. Each link test is `x is not null and x is not distinct from y` against a
-- caller id that has already been checked non-null, so nulls never match.
--
-- When: only while the booking is 'requested', judged after the row is locked FOR
-- UPDATE, the same lock owner_set_booking_status and cancel_booking take.
--
-- What changes: guest name and phone, start date, days, start time and duration (and
-- so daily or hourly), group size, experience and notes. Never the boat, status,
-- reference, tourist / hotel / agency link or captain.
--
-- Checks: consent and the waiver exactly as create_booking (the waiver is accepted
-- again on every edit and recorded against the booking), then price_booking_request on
-- the booking's boat, so bookability, capacity, dates, rates and contact details follow
-- the same rules as a new booking.
--
-- Price: when a pricing input changes (start date, days, start time, duration) the
-- booking is re-priced from the boat's current rates, exactly like create_booking. When
-- only contact details, notes, group size or experience change, the stored price and
-- deposit stand.
--
-- Overlap: the UPDATE is checked by bookings_no_overlap against every other blocking
-- booking. A clash rolls the whole call back, so the guest keeps their current slot.
--
-- No change: if every value is the same, nothing is written, no timestamp is set and no
-- consent row is added.
--
-- Audit: audit_bookings logs the caller, role and each changed column, old and new.
-- The reference is untouched (guard_booking_reference would refuse it anyway).

create or replace function public.update_booking_request(
  p_booking_id uuid, p_guest_name text, p_guest_phone text,
  p_start_date date, p_days integer, p_group_size integer, p_experience_type text,
  p_waiver_version integer, p_waiver_accepted boolean,
  p_start_time time without time zone default null::time without time zone,
  p_duration_hours numeric default null::numeric,
  p_notes text default null::text
)
 returns table(id uuid, reference text, price_total numeric, deposit_amount numeric, updated_by_guest_at timestamp with time zone)
 language plpgsql
 security definer
 set search_path = public, pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
  v_booking public.bookings;
  v_doc public.legal_documents;
  v_role text; v_hotel uuid; v_agency uuid; v_verification text;
  v_total numeric; v_dep numeric;
  v_repriced boolean;
begin
  if v_uid is null then raise exception 'Sign in to change this booking.'; end if;
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

  select * into v_booking from public.bookings b where b.id = p_booking_id for update;
  if not found then raise exception 'Booking not found'; end if;

  select p.role::text, p.hotel_id, p.agency_id, p.verification_status::text
    into v_role, v_hotel, v_agency, v_verification
    from public.profiles p where p.id = v_uid;

  if v_booking.tourist_id is not null and v_booking.tourist_id is not distinct from v_uid then
    null; -- the guest who made the request
  elsif v_booking.hotel_id is not null and v_booking.hotel_id is not distinct from v_hotel then
    if v_role is distinct from 'hotel' or v_verification is distinct from 'verified' then
      raise exception 'Your hotel account must be verified before you can change bookings for guests.';
    end if;
    if not exists (select 1 from public.hotels h where h.id = v_booking.hotel_id and h.is_verified) then
      raise exception 'This hotel is not active on Kariba Lake Connect. Contact us to reactivate it.';
    end if;
  elsif v_booking.agency_id is not null and v_booking.agency_id is not distinct from v_agency then
    if v_role is distinct from 'agency' or v_verification is distinct from 'verified' then
      raise exception 'Your agency account must be verified before you can change bookings for clients.';
    end if;
    if not exists (select 1 from public.agencies a where a.id = v_booking.agency_id and a.is_verified) then
      raise exception 'This travel agency is not active on Kariba Lake Connect. Contact us to reactivate it.';
    end if;
  else
    raise exception 'Booking not found';
  end if;

  if v_booking.status is distinct from 'requested' then
    raise exception 'Only a request still awaiting the operator can be changed. Contact the operator, or cancel and book again.';
  end if;

  -- The same trip checks and price as a new booking, on this booking's boat.
  select q.total, q.deposit into v_total, v_dep
    from public.price_booking_request(v_booking.boat_id, p_guest_name, p_guest_phone, p_start_date,
                                      p_days, p_group_size, p_start_time, p_duration_hours) q;

  v_repriced := p_start_date is distinct from v_booking.start_date
             or p_days is distinct from v_booking.days
             or p_start_time is distinct from v_booking.start_time
             or p_duration_hours is distinct from v_booking.duration_hours;
  if not v_repriced then
    v_total := v_booking.price_total;
    v_dep := v_booking.deposit_amount;
  end if;

  if not v_repriced
     and p_guest_name is not distinct from v_booking.guest_name
     and p_guest_phone is not distinct from v_booking.guest_phone
     and p_group_size is not distinct from v_booking.group_size
     and p_experience_type is not distinct from v_booking.experience_type
     and nullif(p_notes, '') is not distinct from nullif(v_booking.notes, '') then
    id := v_booking.id; reference := v_booking.reference;
    price_total := v_booking.price_total; deposit_amount := v_booking.deposit_amount;
    updated_by_guest_at := v_booking.updated_by_guest_at;
    return next;
    return;
  end if;

  begin
    update public.bookings b set
      guest_name = p_guest_name,
      guest_phone = p_guest_phone,
      start_date = p_start_date,
      days = p_days,
      start_time = p_start_time,
      duration_hours = p_duration_hours,
      group_size = p_group_size,
      experience_type = p_experience_type,
      notes = nullif(p_notes, ''),
      price_total = v_total,
      deposit_amount = v_dep,
      updated_by_guest_at = now()
    where b.id = v_booking.id
    returning * into v_booking;
  exception when exclusion_violation then
    raise exception 'Those dates or times are already booked. Pick another slot; your booking is unchanged.';
  end;

  insert into public.consent_records (user_id, document_id, doc_type, version, context, booking_id, accepted)
  values (v_uid, v_doc.id, 'booking_waiver', p_waiver_version, 'booking', v_booking.id, true);

  id := v_booking.id; reference := v_booking.reference;
  price_total := v_booking.price_total; deposit_amount := v_booking.deposit_amount;
  updated_by_guest_at := v_booking.updated_by_guest_at;
  return next;
end; $function$;

comment on function public.update_booking_request(uuid, text, text, date, integer, integer, text, integer, boolean, time without time zone, numeric, text) is
  'The booking party (tourist, or the hotel or agency that booked) changes a requested booking: dates or times, group, experience, notes, guest name and phone. Re-validated and re-priced on the server like create_booking; reference unchanged; stamps updated_by_guest_at.';

-- New function: PUBLIC (and, from this project's default privileges, anon) would get
-- EXECUTE, so revoke from both first, then grant to authenticated only.
revoke all on function public.update_booking_request(uuid, text, text, date, integer, integer, text, integer, boolean, time without time zone, numeric, text) from public, anon;
grant execute on function public.update_booking_request(uuid, text, text, date, integer, integer, text, integer, boolean, time without time zone, numeric, text) to authenticated;

-- 5. owner_set_booking_status ------------------------------------------------------------
-- Live body (migration 36) plus a stale-view guard. While the booking is 'requested'
-- and the guest has changed it, the caller must pass the updated_by_guest_at it showed
-- the operator; otherwise the operator could confirm (or decline) dates they have not
-- seen. A booking the guest never changed needs nothing, so an older client keeps
-- working for those. The old two-argument function is dropped first: beside a version
-- with a defaulted third argument, every two-argument call would be ambiguous.
--
-- Batch 5: the ownership line below is the one to swap for
--   if not public.is_boat_manager(v_booking.boat_id) then
-- (is_boat_manager already exists live). Nothing else here is owner-specific.

drop function if exists public.owner_set_booking_status(uuid, booking_status);

create or replace function public.owner_set_booking_status(p_booking_id uuid, p_status booking_status, p_seen_guest_change timestamp with time zone default null::timestamp with time zone)
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
  if v_owner is distinct from auth.uid() then -- batch 5: is_boat_manager(v_booking.boat_id)
    raise exception 'Only the boat owner can change this booking';
  end if;
  if v_booking.status = 'requested'
     and v_booking.updated_by_guest_at is not null
     and v_booking.updated_by_guest_at is distinct from p_seen_guest_change then
    raise exception 'The guest changed this request after you opened it. Check the new details, then try again.';
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

revoke all on function public.owner_set_booking_status(uuid, booking_status, timestamp with time zone) from public, anon;
grant execute on function public.owner_set_booking_status(uuid, booking_status, timestamp with time zone) to authenticated;

-- 6. Grant hygiene on bookings ----------------------------------------------------------
-- Checked live: authenticated held table-wide INSERT, DELETE and TRUNCATE on bookings,
-- and anon TRUNCATE. No policy allows INSERT or DELETE, no client code inserts or
-- deletes bookings (src/services/bookings.service.ts only selects and calls RPCs), and
-- TRUNCATE bypasses RLS entirely. create_booking, cancel_booking and
-- purge_deleted_accounts write as definer and are unaffected. SELECT is unchanged.
-- There are no column-level write grants on bookings to re-grant.

revoke insert, delete, truncate on public.bookings from authenticated;
revoke insert, update, delete, truncate on public.bookings from anon;

notify pgrst, 'reload schema';
