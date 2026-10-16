-- Batch 42: cancellations and refunds. Decision record: docs/adr/ADR-003-partner-and-
-- operations-policies.md, section 1 and "Implementation batches", item 1.
--
-- Every function replaced here was fetched live with pg_get_functiondef before this
-- file was written (cancel_booking and create_booking: migration 41's bodies;
-- owner_set_booking_status: migration 40's body; propose_boat_changes: migration 40's
-- body; track_booking: migration 31's body; public_boats: the live view). Only the
-- parts named below change.
--
--  1. Types: cancellation_policy, cancelled_by_party, cancel_reason, refund_status.
--  2. boats.cancellation_policy (default moderate), editable through
--     propose_boat_changes and NOT review-sensitive (ADR: it only applies to new
--     bookings, so it never changes what an existing guest agreed to). public_boats
--     shows it.
--  3. The booking's cancellation and refund columns, deposit_paid_at, and a backfill.
--  4. guard_booking_cancellation_policy: the policy is copied from the boat when the
--     booking is created and can never be changed afterwards.
--  5. create_booking copies the boat's policy onto the booking.
--  6. owner_set_booking_status stamps deposit_paid_at, and no longer cancels: every
--     cancellation goes through cancel_booking, which records why and what is owed.
--  7. Internal helpers (no client execute): cancellation_party, cancellation_check,
--     cancellation_terms. One place for who may cancel, and one for the money.
--  8. cancellation_quote(booking, reason, compassionate): the read-only quote.
--  9. cancel_booking(booking, reason, note, compassionate) replaces cancel_booking(uuid),
--     which is dropped.
-- 10. operator_mark_refunded, report_refund_not_received, admin_resolve_refund.
-- 11. track_booking returns the policy, cancellation and refund fields.
--
-- Money never moves through the platform. The deposit is paid to the operator off
-- the platform, so a "refund due" here is a record of what the operator owes the
-- guest under the booking's policy, which the operator marks as paid. Nothing in this
-- file charges, pays or refunds anyone.
--
-- Security notes:
--  * bookings keeps no client INSERT, UPDATE or DELETE grant (migration 39). Every new
--    column is written only inside the SECURITY DEFINER RPCs below. authenticated
--    holds table-level SELECT, so the new columns are readable by exactly the parties
--    bookings_read_involved already shows the row to (guest, the boat's team, the
--    verified hotel or agency that booked, admins). No column grant is added.
--  * The caller's party (guest, partner, operator, admin) is always derived from
--    auth.uid(), never passed in. A caller with no auth.uid() is refused (migration 41
--    let an anonymous caller through the tourist test on a hotel booking, where
--    tourist_id is null; only the execute grant stopped it).
--  * The helpers are SECURITY INVOKER with execute revoked from every client role. They
--    run only inside the SECURITY DEFINER RPCs, as those functions' owner.
--  * New RPCs: SECURITY DEFINER, search_path pinned, revoked from public and anon,
--    granted to authenticated. track_booking keeps its anon grant (the public /track
--    page) and still returns no names, phones, notes or user ids: the party that
--    cancelled is returned as a word ("guest", "operator"), never as an id.
--  * The guard trigger exempts auth.uid() is null (service role, migrations).

-- 1. Types -----------------------------------------------------------------------------

create type public.cancellation_policy as enum ('flexible', 'moderate', 'strict');
create type public.cancelled_by_party as enum ('guest', 'partner', 'operator', 'admin', 'system');
create type public.cancel_reason as enum (
  'guest_request', 'guest_compassionate', 'partner_error', 'guest_no_show',
  'weather_safety', 'boat_breakdown', 'operator_unavailable', 'operator_breach', 'other'
);
create type public.refund_status as enum ('none', 'due', 'refunded', 'disputed', 'resolved');

comment on type public.cancellation_policy is
  'ADR-003 presets, as a share of the deposit (the only money the operator holds before the trip). Days are calendar days from today (Africa/Harare) to start_date. flexible: full refund 2+ days before, else the deposit is kept. moderate: full refund 14+ days before, 50% kept at 3 to 13 days, all kept under 3. strict: full refund 30+ days before, 50% kept at 8 to 29 days, all kept at 7 or less.';

-- 2. The boat's policy -----------------------------------------------------------------
-- Adding a column with a constant default rewrites no rows and fires no row trigger,
-- so every existing boat is moderate without an audit entry per boat. authenticated
-- holds table-level SELECT and INSERT on boats, so the column is readable and can be
-- chosen when a boat is registered. There is no client UPDATE on boats: after
-- registration it changes only through propose_boat_changes (edit_boats).

alter table public.boats
  add column cancellation_policy public.cancellation_policy not null default 'moderate';

comment on column public.boats.cancellation_policy is
  'The cancellation policy new bookings on this boat are made under (ADR-003). Copied onto each booking at creation; changing it never affects an existing booking, so it is outside listing review.';

-- public_boats: the live definition with cancellation_policy appended at the end
-- (CREATE OR REPLACE VIEW may only add columns at the end). Grants are kept.
create or replace view public.public_boats as
 SELECT b.id,
    b.owner_id,
    b.name,
    b.boat_type,
    b.capacity,
    b.description,
    b.location,
    b.price_per_hour,
    b.price_per_day,
    b.facilities,
    b.safety_equipment,
    b.crew_included,
    b.fuel_policy,
    b.registration_number,
    b.capacity AS max_guests,
    b.maintenance_status,
    b.created_at,
    p.business_name AS operator_name,
    p.phone AS operator_phone,
    COALESCE(c.verification_status = 'verified'::company_verification_status, p.verification_status = 'verified'::verification_status) AS operator_verified,
    p.trust_score AS operator_trust_score,
    b.deposit_percent,
    b.cancellation_policy
   FROM boats b
     JOIN profiles p ON p.id = b.owner_id
     LEFT JOIN companies c ON c.id = b.company_id
  WHERE b.status = 'approved'::boat_status AND b.is_active AND NOT b.is_deleted AND b.maintenance_status <> 'overdue'::text;

-- propose_boat_changes: live body (migration 40) plus one line in the UPDATE, so the
-- policy is saved like any other non-sensitive field. is_sensitive_change is
-- unchanged: cancellation_policy is not in its list, so on an approved boat it
-- applies at once instead of waiting in pending_changes.

create or replace function public.propose_boat_changes(p_boat_id uuid, p_changes jsonb)
 returns boats
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
  if not public.has_company_permission(v_boat.company_id, 'edit_boats') then
    if public.is_company_member(v_boat.company_id) then
      raise exception '%', public.team_role_denied('edit_boats', 'edit boats');
    end if;
    raise exception 'Not your boat';
  end if;

  if v_boat.status = 'approved' and p_changes is not null then
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
    cancellation_policy = coalesce((v_direct->>'cancellation_policy')::public.cancellation_policy, cancellation_policy),
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

-- 3. Booking columns --------------------------------------------------------------------

alter table public.bookings
  add column cancellation_policy public.cancellation_policy,
  add column cancelled_at timestamptz,
  add column cancelled_by uuid references public.profiles(id) on delete set null,
  add column cancelled_by_party public.cancelled_by_party,
  add column cancel_reason public.cancel_reason,
  add column cancel_note text,
  add column cancellation_rule text,
  add column cancellation_fee_amount numeric(10,2),
  add column refund_due_amount numeric(10,2),
  add column refund_due_by date,
  add column refund_status public.refund_status not null default 'none',
  add column refund_marked_at timestamptz,
  add column refund_marked_by uuid references public.profiles(id) on delete set null,
  add column refund_note text,
  add column refund_reported_at timestamptz,
  add column refund_reported_by uuid references public.profiles(id) on delete set null,
  add column refund_resolved_at timestamptz,
  add column refund_resolved_by uuid references public.profiles(id) on delete set null,
  add column refund_outcome text,
  add column refund_resolution_note text,
  add column deposit_paid_at timestamptz;

alter table public.bookings
  add constraint bookings_cancel_note_length check (cancel_note is null or char_length(cancel_note) <= 500),
  add constraint bookings_refund_note_length check (refund_note is null or char_length(refund_note) <= 500),
  add constraint bookings_refund_resolution_note_length
    check (refund_resolution_note is null or char_length(refund_resolution_note) <= 500),
  add constraint bookings_cancellation_amounts_nonnegative
    check (coalesce(cancellation_fee_amount, 0) >= 0 and coalesce(refund_due_amount, 0) >= 0),
  add constraint bookings_cancelled_at_only_when_cancelled
    check (cancelled_at is null or status = 'cancelled'),
  add constraint bookings_refund_status_needs_amount
    check (refund_status = 'none' or coalesce(refund_due_amount, 0) > 0),
  add constraint bookings_refund_outcome_values
    check (refund_outcome is null or refund_outcome in ('refund_confirmed', 'no_refund_owed', 'operator_did_not_pay')),
  add constraint bookings_cancellation_rule_values
    check (cancellation_rule is null or cancellation_rule in (
      'request_only', 'no_show', 'operator_cancelled', 'cooling_off', 'compassionate',
      'no_deposit_paid', 'policy_full_refund', 'policy_half_kept', 'policy_deposit_kept'));

-- The admin refunds queue reads open refunds by due date.
create index bookings_open_refunds_idx on public.bookings (refund_due_by)
  where refund_status in ('due', 'disputed');

comment on column public.bookings.cancellation_policy is
  'The boat''s policy when the booking was made, fixed for the life of the booking. Null only for bookings that were already closed (completed, declined, cancelled) before cancellation policies existed.';
comment on column public.bookings.cancelled_by_party is
  'Who cancelled: guest (the tourist account), partner (staff of the hotel or agency that booked), operator (the boat''s team), admin, or system.';
comment on column public.bookings.cancellation_rule is
  'Which rule set the fee (cancellation_terms): request_only, no_show, operator_cancelled, cooling_off, compassionate, no_deposit_paid, policy_full_refund, policy_half_kept, policy_deposit_kept.';
comment on column public.bookings.refund_due_amount is
  'What the operator owes the guest back from the deposit after this cancellation. A record only: the platform never holds or moves the money.';
comment on column public.bookings.refund_due_by is
  'Cancellation date (Africa/Harare) + 14 days, when a refund is due.';
comment on column public.bookings.refund_status is
  'none: nothing owed. due: the operator owes refund_due_amount. refunded: the operator marked it paid. disputed: the guest or partner reported it not received. resolved: an administrator closed it (refund_outcome, refund_resolution_note).';
comment on column public.bookings.deposit_paid_at is
  'When the operator marked the deposit paid (owner_set_booking_status). Null for older bookings with no record of it.';

-- Backfill. Past cancellations are left exactly as they are: no policy, no fee, no
-- refund, refund_status none, and no reconstructed cancelled_at. The UI words those as
-- "cancelled before cancellation records began".
--  * Open bookings (requested, confirmed, deposit_paid) take the boat's policy, which is
--    moderate for every boat (the column default above): moderate is the platform
--    default, and every guest keeps the 7-day cooling-off, compassionate and operator
--    cancellation overrides on top of it. Closed bookings keep null.
--  * deposit_paid_at, where the audit log recorded the change to deposit_paid.
-- auth.uid() is null here, so the guard trigger below would let these through anyway;
-- it is created afterwards regardless.

update public.bookings bk
   set cancellation_policy = bt.cancellation_policy
  from public.boats bt
 where bt.id = bk.boat_id
   and bk.status in ('requested', 'confirmed', 'deposit_paid')
   and bk.cancellation_policy is null;

update public.bookings bk
   set deposit_paid_at = a.at
  from (
    select al.entity_id, min(al.created_at) as at
      from public.audit_log al
     where al.entity_type = 'bookings'
       and al.changed -> 'status' ->> 'new' = 'deposit_paid'
     group by al.entity_id
  ) a
 where a.entity_id = bk.id
   and bk.deposit_paid_at is null;

-- 4. Guard: the policy is the boat's, copied once ----------------------------------------
-- A sibling of guard_booking_reference. On INSERT by a signed-in caller the policy is
-- set from the boat, whatever the insert carried. On UPDATE it may not change. The
-- service role and migrations (auth.uid() is null) are exempt.

create or replace function public.guard_booking_cancellation_policy()
 returns trigger
 language plpgsql
 security definer
 set search_path = public, pg_temp
as $function$
begin
  if auth.uid() is null then
    return new;
  end if;
  if tg_op = 'INSERT' then
    select bt.cancellation_policy into new.cancellation_policy
      from public.boats bt where bt.id = new.boat_id;
    return new;
  end if;
  if new.cancellation_policy is distinct from old.cancellation_policy then
    raise exception 'A booking keeps the cancellation policy it was made under.';
  end if;
  return new;
end; $function$;

revoke all on function public.guard_booking_cancellation_policy() from public, anon, authenticated;

create trigger bookings_guard_cancellation_policy
  before insert or update on public.bookings
  for each row execute function public.guard_booking_cancellation_policy();

-- 5. create_booking ---------------------------------------------------------------------
-- Live body (migration 41). One change: the boat's cancellation policy is read after
-- pricing (price_booking_request has already proved the boat exists and is listed)
-- and written in the INSERT. The guard trigger sets the same value; writing it here
-- keeps the snapshot visible where the booking is made.

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
  v_policy public.cancellation_policy;
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

  select p.role::text, p.agency_id, p.verification_status::text
    into v_role, v_caller_agency, v_verification
    from public.profiles p where p.id = auth.uid();

  if v_role = 'hotel' and p_hotel_id is null then
    raise exception 'Book for guests from the Hotel portal.';
  end if;
  if v_role = 'agency' then
    if p_hotel_id is not null then
      raise exception 'A travel agency books for its own clients, not for a hotel. Book from the Agency portal.';
    end if;
    if v_verification is distinct from 'verified' then
      raise exception 'Your agency account must be verified before you can book for clients.';
    end if;
    if v_caller_agency is null then
      raise exception 'Your agency account is verified but not linked to an agency yet. Contact us to link it.';
    end if;
  end if;

  select q.total, q.deposit into v_total, v_dep
    from public.price_booking_request(p_boat_id, p_guest_name, p_guest_phone, p_start_date,
                                      p_days, p_group_size, p_start_time, p_duration_hours) q;

  select bt.cancellation_policy into v_policy from public.boats bt where bt.id = p_boat_id;

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
       start_time, duration_hours, group_size, experience_type, price_total, deposit_amount, notes,
       cancellation_policy)
    values
      (p_boat_id, v_tourist, p_hotel_id, v_agency, p_guest_name, p_guest_phone, p_start_date, p_days,
       p_start_time, p_duration_hours, p_group_size, p_experience_type, v_total, v_dep, p_notes,
       v_policy)
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

-- 6. owner_set_booking_status -----------------------------------------------------------
-- Live body (migration 40). Changes:
--  * 'cancelled' is refused. It used to set the status with no reason, no fee and no
--    refund record, a way round every rule in cancel_booking. A request is declined
--    (ADR table: the operator "declines instead"); a confirmed booking is cancelled
--    with cancel_booking. The transition graph is otherwise unchanged.
--  * deposit_paid stamps deposit_paid_at.

create or replace function public.owner_set_booking_status(p_booking_id uuid, p_status booking_status, p_seen_guest_change timestamp with time zone default null::timestamp with time zone)
 returns bookings
 language plpgsql
 security definer
 set search_path = public, pg_temp
as $function$
declare v_booking public.bookings; v_ok boolean;
begin
  if public.has_outstanding_required_consent() then raise exception 'Consent required'; end if;
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found then raise exception 'Booking not found'; end if;
  if not public.has_boat_permission(v_booking.boat_id, 'manage_bookings') then
    if public.has_boat_permission(v_booking.boat_id, 'view') then
      raise exception '%', public.team_role_denied('manage_bookings', 'confirm, decline or update bookings');
    end if;
    raise exception 'Only the boat owner can change this booking';
  end if;
  if v_booking.status = 'requested'
     and v_booking.updated_by_guest_at is not null
     and v_booking.updated_by_guest_at is distinct from p_seen_guest_change then
    raise exception 'The guest changed this request after you opened it. Check the new details, then try again.';
  end if;
  if p_status = 'cancelled' then
    if v_booking.status = 'requested' then
      raise exception 'To turn down a request, decline it.';
    end if;
    raise exception 'Cancel this booking with Cancel booking, which records the reason and any refund owed.';
  end if;
  v_ok := case v_booking.status
    when 'requested' then p_status in ('confirmed','declined')
    when 'confirmed' then p_status in ('deposit_paid','completed')
    when 'deposit_paid' then p_status in ('completed')
    else false end;
  if not v_ok then raise exception 'Cannot change a % booking to %', v_booking.status, p_status; end if;
  update public.bookings
     set status = p_status,
         deposit_paid_at = case when p_status = 'deposit_paid' then now() else deposit_paid_at end
   where id = p_booking_id returning * into v_booking;
  return v_booking;
end; $function$;

revoke all on function public.owner_set_booking_status(uuid, booking_status, timestamp with time zone) from public, anon;
grant execute on function public.owner_set_booking_status(uuid, booking_status, timestamp with time zone) to authenticated;

-- 7. Internal helpers --------------------------------------------------------------------
-- SECURITY INVOKER and not executable by any client role, like price_booking_request
-- (migration 39). They run inside the SECURITY DEFINER functions below, as their owner.

-- 7a. cancellation_party: who the caller is to this booking, with migration 41's access
-- rules and messages. Order: the guest (tourist account), then verified staff of the
-- booking's own hotel or agency, then the boat's team with manage_bookings, then an
-- admin. A team member without manage_bookings is told which role can cancel.
create or replace function public.cancellation_party(p_booking public.bookings)
 returns public.cancelled_by_party
 language plpgsql
 stable
 set search_path = public, pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
  v_role text; v_hotel uuid; v_agency uuid; v_verification text;
  v_hotel_link boolean; v_agency_link boolean;
begin
  if v_uid is null then
    raise exception 'Sign in to cancel a booking.';
  end if;
  select p.role::text, p.hotel_id, p.agency_id, p.verification_status::text
    into v_role, v_hotel, v_agency, v_verification
    from public.profiles p where p.id = v_uid;

  -- Plain true/false: each link is checked non-null before it is compared.
  v_hotel_link := p_booking.hotel_id is not null and v_role is not distinct from 'hotel'
                  and p_booking.hotel_id is not distinct from v_hotel;
  v_agency_link := p_booking.agency_id is not null and v_role is not distinct from 'agency'
                   and p_booking.agency_id is not distinct from v_agency;

  if p_booking.tourist_id is not null and p_booking.tourist_id is not distinct from v_uid then
    return 'guest';
  end if;
  if (v_hotel_link or v_agency_link) and v_verification is not distinct from 'verified' then
    return 'partner';
  end if;
  if public.has_boat_permission(p_booking.boat_id, 'manage_bookings') then
    return 'operator';
  end if;
  if public.is_admin() then
    return 'admin';
  end if;

  if v_hotel_link then
    raise exception 'Your hotel account must be verified before you can cancel bookings for guests.';
  elsif v_agency_link then
    raise exception 'Your agency account must be verified before you can cancel bookings for clients.';
  elsif public.has_boat_permission(p_booking.boat_id, 'view') then
    raise exception '%', public.team_role_denied('manage_bookings', 'cancel bookings');
  end if;
  raise exception 'You can only cancel your own booking';
end; $function$;

comment on function public.cancellation_party(public.bookings) is
  'Internal. The caller''s party for a booking (guest, partner, operator, admin), or an exception with migration 41''s access messages. Not executable by clients.';
revoke all on function public.cancellation_party(public.bookings) from public, anon, authenticated;

-- 7b. cancellation_check: the ADR's who-can-cancel table and reason rules. Returns the
-- reason to record. p_for_quote relaxes only "reason required" and "note required",
-- so the quote can be shown before the canceller has chosen.
--
--   requested           guest, partner, admin, no fee (also after the start time:
--                       nothing was confirmed or paid); the operator declines instead
--   confirmed, deposit  guest and partner before the trip starts (policy fee);
--   paid                operator before the start (reason required, full refund) and
--                       after it only for guest_no_show, weather_safety or
--                       boat_breakdown; admin at any time (reason required)
--   completed, declined, cancelled: nobody (cancel_booking treats cancelled as a no-op)
--
-- Trip start: start_date + coalesce(start_time, 00:00) on the Kariba clock.
-- Reasons: guest -> guest_request or guest_compassionate; partner -> guest_request,
-- partner_error or guest_compassionate; operator -> weather_safety, boat_breakdown,
-- operator_unavailable, guest_request or other before the start; admin -> any.
-- p_compassionate (death or hospitalisation) turns guest_request into
-- guest_compassionate for the guest, a partner or an admin. It does not apply to an
-- operator cancellation, which refunds the deposit in full anyway.
create or replace function public.cancellation_check(
  p_booking public.bookings, p_party public.cancelled_by_party, p_reason public.cancel_reason,
  p_compassionate boolean, p_note text, p_for_quote boolean
)
 returns public.cancel_reason
 language plpgsql
 stable
 set search_path = public, pg_temp
as $function$
declare
  v_started boolean;
  v_reason public.cancel_reason := p_reason;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_compassionate boolean := coalesce(p_compassionate, false);
begin
  if p_booking.status = 'completed' then
    raise exception 'A completed trip cannot be cancelled';
  end if;
  if p_booking.status = 'cancelled' then
    raise exception 'This booking is already cancelled.';
  end if;
  if p_booking.status = 'declined' then
    raise exception 'The operator declined this request, so there is nothing to cancel.';
  end if;
  if p_booking.status not in ('requested', 'confirmed', 'deposit_paid') then
    raise exception 'This booking cannot be cancelled.';
  end if;

  if v_note is not null and char_length(v_note) > 500 then
    raise exception 'Keep the note to 500 characters or fewer.';
  end if;

  v_started := now() >= ((p_booking.start_date + coalesce(p_booking.start_time, time '00:00'))
                         at time zone 'Africa/Harare');

  if p_party = 'operator' and p_booking.status = 'requested' then
    raise exception 'To turn down a request, decline it.';
  end if;
  -- A request that was never confirmed holds no money and no slot worth keeping, so
  -- its guest or partner may still withdraw it after its start time.
  if p_party in ('guest', 'partner') and v_started and p_booking.status <> 'requested' then
    raise exception 'This trip has already started, so it can no longer be cancelled here. Contact the operator.';
  end if;

  if v_compassionate then
    if p_party = 'operator' then
      raise exception 'A compassionate cancellation is made by the guest, or for them by their hotel or agency.';
    end if;
    if v_reason is not null and v_reason not in ('guest_request', 'guest_compassionate') then
      raise exception 'A compassionate cancellation is the guest''s own reason. Choose that the guest asked to cancel.';
    end if;
    v_reason := 'guest_compassionate';
  end if;

  if p_party = 'guest' then
    v_reason := coalesce(v_reason, 'guest_request');
    if v_reason not in ('guest_request', 'guest_compassionate') then
      raise exception 'Choose why you are cancelling.';
    end if;
  elsif p_party = 'partner' then
    v_reason := coalesce(v_reason, 'guest_request');
    if v_reason not in ('guest_request', 'partner_error', 'guest_compassionate') then
      raise exception 'Choose whether the guest asked to cancel or the booking was made in error.';
    end if;
  elsif p_party = 'operator' then
    if v_reason is null then
      if not p_for_quote then
        raise exception 'Choose a reason for cancelling.';
      end if;
    elsif v_started then
      if v_reason not in ('guest_no_show', 'weather_safety', 'boat_breakdown') then
        raise exception 'Once the trip has started, it can only be cancelled as a no-show, for weather or safety, or for a breakdown.';
      end if;
    else
      if v_reason = 'guest_no_show' then
        raise exception 'A no-show can only be recorded once the trip''s start time has passed.';
      end if;
      if v_reason not in ('weather_safety', 'boat_breakdown', 'operator_unavailable', 'guest_request', 'other') then
        raise exception 'Choose one of the operator reasons for cancelling.';
      end if;
    end if;
  elsif p_party = 'admin' then
    if v_reason is null and not p_for_quote then
      raise exception 'Choose a reason for cancelling.';
    end if;
    if v_reason = 'guest_no_show' and not v_started then
      raise exception 'A no-show can only be recorded once the trip''s start time has passed.';
    end if;
  else
    raise exception 'This booking cannot be cancelled.';
  end if;

  if v_reason = 'other' and v_note is null and not p_for_quote then
    raise exception 'Add a short note saying why the booking is cancelled.';
  end if;

  return v_reason;
end; $function$;

comment on function public.cancellation_check(public.bookings, public.cancelled_by_party, public.cancel_reason, boolean, text, boolean) is
  'Internal. ADR-003 who-can-cancel and reason rules; returns the reason to record or raises. Not executable by clients.';
revoke all on function public.cancellation_check(public.bookings, public.cancelled_by_party, public.cancel_reason, boolean, text, boolean)
  from public, anon, authenticated;

-- 7c. cancellation_terms: the fee and refund, in one place for the quote and the
-- cancellation. Everything is a share of the deposit, the only money the operator
-- holds before the trip. Overrides, in the ADR's order, always to the guest's benefit:
--   1. the operator cancels, or an admin cancels for an operator-side reason
--      (weather_safety, boat_breakdown, operator_unavailable, operator_breach): full
--      refund;
--   2. the booking was made 7 days ago or less (Consumer Protection Act cooling-off):
--      no fee;
--   3. death or hospitalisation (guest_compassionate): no fee;
--   4. the deposit has not been paid (confirmed, not deposit_paid): no fee, and
--      nothing to refund.
-- Before them: a request (nothing confirmed, nothing paid) has no fee; a no-show
-- (operator or admin, after the start) keeps the whole deposit. The overrides do not
-- apply to a no-show, because the guest did not cancel.
-- Then the policy bands on calendar days from today (Africa/Harare) to start_date:
--   flexible  >= 2 full refund;                  under 2 the deposit is kept
--   moderate  >= 14 full refund; 3 to 13 50% kept; under 3 the deposit is kept
--   strict    >= 30 full refund; 8 to 29 50% kept; 7 or less the deposit is kept
-- A null policy (none left on open bookings after the backfill) is read as moderate.
-- refund_due_by: the cancellation date (Kariba) + 14 days, when a refund is due.
create or replace function public.cancellation_terms(
  p_booking public.bookings, p_party public.cancelled_by_party, p_reason public.cancel_reason,
  p_at timestamptz,
  out policy public.cancellation_policy, out days_before integer, out rule_applied text,
  out deposit_amount numeric, out deposit_paid boolean, out fee_amount numeric,
  out refund_amount numeric, out refund_due_by date
)
 language plpgsql
 stable
 set search_path = public, pg_temp
as $function$
declare
  v_today date := (p_at at time zone 'Africa/Harare')::date;
  v_keep numeric;
begin
  policy := coalesce(p_booking.cancellation_policy, 'moderate');
  days_before := p_booking.start_date - v_today;
  deposit_amount := round(coalesce(p_booking.deposit_amount, 0), 2);
  deposit_paid := p_booking.status = 'deposit_paid';

  if p_booking.status = 'requested' then
    rule_applied := 'request_only'; v_keep := 0;
  elsif p_reason is not distinct from 'guest_no_show' then
    rule_applied := 'no_show'; v_keep := 1;
  elsif p_party = 'operator'
        or (p_party = 'admin' and p_reason in ('weather_safety', 'boat_breakdown', 'operator_unavailable', 'operator_breach')) then
    rule_applied := 'operator_cancelled'; v_keep := 0;
  elsif p_at - p_booking.created_at <= interval '7 days' then
    rule_applied := 'cooling_off'; v_keep := 0;
  elsif p_reason is not distinct from 'guest_compassionate' then
    rule_applied := 'compassionate'; v_keep := 0;
  elsif not deposit_paid then
    rule_applied := 'no_deposit_paid'; v_keep := 0;
  else
    v_keep := case policy
      when 'flexible' then case when days_before >= 2 then 0 else 1 end
      when 'moderate' then case when days_before >= 14 then 0 when days_before >= 3 then 0.5 else 1 end
      when 'strict'   then case when days_before >= 30 then 0 when days_before >= 8 then 0.5 else 1 end
    end;
    rule_applied := case v_keep when 0 then 'policy_full_refund' when 1 then 'policy_deposit_kept' else 'policy_half_kept' end;
  end if;

  if deposit_paid then
    fee_amount := round(deposit_amount * v_keep, 2);
    refund_amount := deposit_amount - fee_amount;
  else
    fee_amount := 0;
    refund_amount := 0;
  end if;
  refund_due_by := case when refund_amount > 0 then v_today + 14 end;
end; $function$;

comment on function public.cancellation_terms(public.bookings, public.cancelled_by_party, public.cancel_reason, timestamptz) is
  'Internal. ADR-003 fee and refund for cancelling a booking at a moment: overrides, then the policy bands, as a share of the deposit. Not executable by clients.';
revoke all on function public.cancellation_terms(public.bookings, public.cancelled_by_party, public.cancel_reason, timestamptz)
  from public, anon, authenticated;

-- 8. cancellation_quote ------------------------------------------------------------------
-- Read-only (the Viator cancel-quote pattern): what cancelling now would cost, for the
-- confirm dialog. The same visibility and rules as cancel_booking (a caller who could
-- not cancel gets the same message), and the same money function. The reason and the
-- compassionate box change the answer, so the dialog passes them as they are chosen;
-- both are optional. Extra columns after the ADR's list: caller_party, so the dialog
-- offers the right reasons, and trip_started.

create or replace function public.cancellation_quote(
  p_booking_id uuid, p_reason public.cancel_reason default null, p_compassionate boolean default false
)
 returns table(
   policy public.cancellation_policy, days_before integer, rule_applied text,
   deposit_amount numeric, deposit_paid boolean, fee_amount numeric, refund_amount numeric,
   refund_due_by date, caller_party public.cancelled_by_party, trip_started boolean
 )
 language plpgsql
 stable
 security definer
 set search_path = public, pg_temp
as $function$
declare
  v_booking public.bookings;
  v_party public.cancelled_by_party;
  v_reason public.cancel_reason;
  t record;
begin
  select * into v_booking from public.bookings b where b.id = p_booking_id;
  if not found then raise exception 'Booking not found'; end if;
  v_party := public.cancellation_party(v_booking);
  v_reason := public.cancellation_check(v_booking, v_party, p_reason, p_compassionate, null, true);
  select * into t from public.cancellation_terms(v_booking, v_party, v_reason, now());

  policy := t.policy; days_before := t.days_before; rule_applied := t.rule_applied;
  deposit_amount := t.deposit_amount; deposit_paid := t.deposit_paid;
  fee_amount := t.fee_amount; refund_amount := t.refund_amount; refund_due_by := t.refund_due_by;
  caller_party := v_party;
  trip_started := now() >= ((v_booking.start_date + coalesce(v_booking.start_time, time '00:00'))
                            at time zone 'Africa/Harare');
  return next;
end; $function$;

comment on function public.cancellation_quote(uuid, public.cancel_reason, boolean) is
  'Read-only quote for cancelling a booking now: policy, days before, rule, deposit, fee kept and refund owed by the operator, refund due date, and the caller''s party. Same access rules as cancel_booking.';
revoke all on function public.cancellation_quote(uuid, public.cancel_reason, boolean) from public, anon;
grant execute on function public.cancellation_quote(uuid, public.cancel_reason, boolean) to authenticated;

-- 9. cancel_booking ----------------------------------------------------------------------
-- Replaces cancel_booking(uuid) (migration 41), which is dropped, as ADR-001 did for
-- owner_set_booking_status. Kept from 41: the row lock, every access rule and message
-- (now in cancellation_party), completed and declined refused, cancelled a no-op that
-- returns the booking unchanged, any other status refused, no consent gate (a guest
-- with outstanding consent can still cancel). New: the ADR table and reasons
-- (cancellation_check), the fee and refund (cancellation_terms, the quote's function),
-- and the record of who, when, why and what is owed. refund_status is 'due' when a
-- refund is owed, otherwise 'none'.

drop function if exists public.cancel_booking(uuid);

create or replace function public.cancel_booking(
  p_booking_id uuid, p_reason public.cancel_reason default null,
  p_note text default null, p_compassionate boolean default false
)
 returns bookings
 language plpgsql
 security definer
 set search_path = public, pg_temp
as $function$
declare
  v_booking public.bookings;
  v_party public.cancelled_by_party;
  v_reason public.cancel_reason;
  t record;
begin
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found then raise exception 'Booking not found'; end if;
  v_party := public.cancellation_party(v_booking);
  if v_booking.status = 'cancelled' then return v_booking; end if;

  v_reason := public.cancellation_check(v_booking, v_party, p_reason, p_compassionate, p_note, false);
  select * into t from public.cancellation_terms(v_booking, v_party, v_reason, now());

  update public.bookings set
    status = 'cancelled',
    cancelled_at = now(),
    cancelled_by = auth.uid(),
    cancelled_by_party = v_party,
    cancel_reason = v_reason,
    cancel_note = nullif(btrim(coalesce(p_note, '')), ''),
    cancellation_rule = t.rule_applied,
    cancellation_fee_amount = t.fee_amount,
    refund_due_amount = t.refund_amount,
    refund_due_by = t.refund_due_by,
    refund_status = case when t.refund_amount > 0 then 'due'::public.refund_status else 'none'::public.refund_status end
  where id = p_booking_id
  returning * into v_booking;
  return v_booking;
end; $function$;

comment on function public.cancel_booking(uuid, public.cancel_reason, text, boolean) is
  'Cancel a booking under ADR-003: the caller''s party is derived, the reason is checked against the who-can-cancel table, and the fee and refund owed by the operator are recorded (the platform moves no money).';
revoke all on function public.cancel_booking(uuid, public.cancel_reason, text, boolean) from public, anon;
grant execute on function public.cancel_booking(uuid, public.cancel_reason, text, boolean) to authenticated;

-- 10. Refund follow-up ---------------------------------------------------------------------

-- 10a. The operator marks the refund paid (manage_bookings), only while it is due.
create or replace function public.operator_mark_refunded(p_booking_id uuid, p_note text default null)
 returns bookings
 language plpgsql
 security definer
 set search_path = public, pg_temp
as $function$
declare
  v_booking public.bookings;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if public.has_outstanding_required_consent() then raise exception 'Consent required'; end if;
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found then raise exception 'Booking not found'; end if;
  if not public.has_boat_permission(v_booking.boat_id, 'manage_bookings') then
    if public.has_boat_permission(v_booking.boat_id, 'view') then
      raise exception '%', public.team_role_denied('manage_bookings', 'mark refunds as paid');
    end if;
    raise exception 'Only the boat''s operator can mark a refund as paid.';
  end if;
  if v_booking.refund_status is distinct from 'due' then
    if v_booking.refund_status = 'refunded' then
      raise exception 'This refund is already marked as paid.';
    elsif v_booking.refund_status = 'disputed' then
      raise exception 'The guest reported this refund as not received. An administrator is looking into it.';
    elsif v_booking.refund_status = 'resolved' then
      raise exception 'An administrator has already closed this refund.';
    end if;
    raise exception 'There is no refund due on this booking.';
  end if;
  if v_note is not null and char_length(v_note) > 500 then
    raise exception 'Keep the note to 500 characters or fewer.';
  end if;

  update public.bookings set
    refund_status = 'refunded',
    refund_marked_at = now(),
    refund_marked_by = auth.uid(),
    refund_note = v_note
  where id = p_booking_id
  returning * into v_booking;
  return v_booking;
end; $function$;

comment on function public.operator_mark_refunded(uuid, text) is
  'The boat''s team (manage_bookings) records that it has paid a due refund back to the guest, off the platform, with an optional note such as a payment reference.';
revoke all on function public.operator_mark_refunded(uuid, text) from public, anon;
grant execute on function public.operator_mark_refunded(uuid, text) to authenticated;

-- 10b. The guest, or verified staff of the hotel or agency that booked, reports a
-- refund not received: once it is marked paid, or once its due date has passed
-- without that. It goes to the admin refunds queue.
create or replace function public.report_refund_not_received(p_booking_id uuid)
 returns bookings
 language plpgsql
 security definer
 set search_path = public, pg_temp
as $function$
declare
  v_booking public.bookings;
  v_uid uuid := auth.uid();
  v_role text; v_hotel uuid; v_agency uuid; v_verification text;
  v_today date := (now() at time zone 'Africa/Harare')::date;
begin
  if v_uid is null then raise exception 'Sign in to report a refund.'; end if;
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found then raise exception 'Booking not found'; end if;
  select p.role::text, p.hotel_id, p.agency_id, p.verification_status::text
    into v_role, v_hotel, v_agency, v_verification
    from public.profiles p where p.id = v_uid;

  if not (
    (v_booking.tourist_id is not null and v_booking.tourist_id is not distinct from v_uid)
    or (v_booking.hotel_id is not null and v_role is not distinct from 'hotel'
        and v_booking.hotel_id is not distinct from v_hotel
        and v_verification is not distinct from 'verified')
    or (v_booking.agency_id is not null and v_role is not distinct from 'agency'
        and v_booking.agency_id is not distinct from v_agency
        and v_verification is not distinct from 'verified')
  ) then
    raise exception 'Only the guest, or the hotel or agency that made the booking, can report a refund.';
  end if;

  if v_booking.refund_status = 'disputed' then
    raise exception 'You have already reported this refund. An administrator is looking into it.';
  end if;
  if v_booking.refund_status = 'resolved' then
    raise exception 'An administrator has already closed this refund.';
  end if;
  if v_booking.refund_status = 'due' and v_booking.refund_due_by is not null
     and v_today <= v_booking.refund_due_by then
    raise exception 'The operator has until % to refund the deposit. If it has not arrived by then, report it here.',
      to_char(v_booking.refund_due_by, 'FMDD Mon YYYY');
  end if;
  if v_booking.refund_status not in ('due', 'refunded') then
    raise exception 'There is no refund to report on this booking.';
  end if;

  update public.bookings set
    refund_status = 'disputed',
    refund_reported_at = now(),
    refund_reported_by = v_uid
  where id = p_booking_id
  returning * into v_booking;
  return v_booking;
end; $function$;

comment on function public.report_refund_not_received(uuid) is
  'The guest, or verified staff of the booking''s hotel or agency, reports a refund as not received: after it is marked paid, or after refund_due_by. Sets refund_status to disputed for the admin queue.';
revoke all on function public.report_refund_not_received(uuid) from public, anon;
grant execute on function public.report_refund_not_received(uuid) to authenticated;

-- 10c. An administrator closes a due or disputed refund with an outcome and a note.
-- Outcomes: refund_confirmed (the guest has the money), no_refund_owed (after review
-- nothing more was owed), operator_did_not_pay (closed unpaid; enforcement, such as
-- suspending the operator's listings, is a separate admin action).
create or replace function public.admin_resolve_refund(p_booking_id uuid, p_outcome text, p_note text)
 returns bookings
 language plpgsql
 security definer
 set search_path = public, pg_temp
as $function$
declare
  v_booking public.bookings;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if not public.is_admin() then raise exception 'Administrator only'; end if;
  if p_outcome is null or p_outcome not in ('refund_confirmed', 'no_refund_owed', 'operator_did_not_pay') then
    raise exception 'Choose an outcome.';
  end if;
  if v_note is null or char_length(v_note) < 5 then
    raise exception 'Add a note of at least 5 characters saying how this was resolved.';
  end if;
  if char_length(v_note) > 500 then
    raise exception 'Keep the note to 500 characters or fewer.';
  end if;
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found then raise exception 'Booking not found'; end if;
  if v_booking.refund_status not in ('due', 'disputed') then
    raise exception 'Only a refund that is due or reported as not received can be resolved.';
  end if;

  update public.bookings set
    refund_status = 'resolved',
    refund_resolved_at = now(),
    refund_resolved_by = auth.uid(),
    refund_outcome = p_outcome,
    refund_resolution_note = v_note
  where id = p_booking_id
  returning * into v_booking;
  return v_booking;
end; $function$;

comment on function public.admin_resolve_refund(uuid, text, text) is
  'Administrator closes a due or disputed refund: outcome refund_confirmed, no_refund_owed or operator_did_not_pay, with a note (5 to 500 characters). The note is visible to everyone who can read the booking.';
revoke all on function public.admin_resolve_refund(uuid, text, text) from public, anon;
grant execute on function public.admin_resolve_refund(uuid, text, text) to authenticated;

-- 11. track_booking ------------------------------------------------------------------------
-- Live body (migration 31) with columns added at the end of the return table, so it
-- is dropped and recreated (a return type cannot change in place) and its grants
-- restated as in migration 31. Added: cancellation_policy, cancelled_at,
-- cancelled_by_party, cancellation_fee_amount, refund_due_amount, refund_due_by,
-- refund_status. Still never a name, phone, note, user, hotel or agency id: who
-- cancelled is the party word only, and the cancellation and refund notes are not
-- returned.

drop function if exists public.track_booking(text, text);

create function public.track_booking(p_reference text, p_phone text)
returns table (
  reference               text,
  status                  public.booking_status,
  boat_name               text,
  boat_location           text,
  start_date              date,
  start_time              time,
  days                    int,
  duration_hours          numeric,
  group_size              int,
  price_total             numeric,
  deposit_amount          numeric,
  created_at              timestamptz,
  cancellation_policy     public.cancellation_policy,
  cancelled_at            timestamptz,
  cancelled_by_party      public.cancelled_by_party,
  cancellation_fee_amount numeric,
  refund_due_amount       numeric,
  refund_due_by           date,
  refund_status           public.refund_status
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with input as (
    select upper(btrim(coalesce(p_reference, ''))) as ref,
           regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g') as phone
  )
  select b.reference, b.status, bt.name, bt.location,
         b.start_date, b.start_time, b.days, b.duration_hours, b.group_size,
         b.price_total, b.deposit_amount, b.created_at,
         b.cancellation_policy, b.cancelled_at, b.cancelled_by_party,
         b.cancellation_fee_amount, b.refund_due_amount, b.refund_due_by, b.refund_status
  from input i
  join public.bookings b on b.reference = i.ref
  join public.boats bt on bt.id = b.boat_id
  where length(i.phone) >= 9
    and right(regexp_replace(b.guest_phone, '[^0-9]', '', 'g'), 9) = right(i.phone, 9)
  limit 1;
$$;

comment on function public.track_booking(text, text) is
  'Public booking tracker: given a booking reference and the phone it was booked with (last 9 digits), returns status, trip logistics, the cancellation policy and the cancellation and refund state. No guest name, phone, notes or user ids. Returns nothing unless both match.';

revoke all on function public.track_booking(text, text) from public, anon, authenticated;
grant execute on function public.track_booking(text, text) to anon, authenticated;

notify pgrst, 'reload schema';
