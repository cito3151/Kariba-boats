-- Partner access fixes: the hotel and agency portal QA pass.
--
-- Every function replaced here was fetched live with pg_get_functiondef, and the
-- policy was read from pg_policies, before this file was written (create_booking:
-- migration 39's body; cancel_booking: migration 40's body; admin_link_partner:
-- migration 37's body; bookings_read_involved: migration 40's USING). Only the parts
-- named below change; everything else in each body is the live definition.
--
--  1. create_booking: a hotel account must book through the Hotel portal (with its
--     hotel), so it can no longer book as a private individual. The agency gate gets
--     separate messages for "not verified" and "verified but not linked", and an
--     agency that passes a hotel gets its own message instead of the hotel one from
--     guard_hotel_booking. guard_hotel_booking is unchanged.
--  2. Pending, rejected or revoked partner staff lose access to their organisation's
--     bookings: the hotel and agency branches of bookings_read_involved and of
--     cancel_booking require a verified account of the matching role.
--     update_booking_request already does (checked live, no change).
--     admin_link_partner refuses to link an account that is not verified.
--     admin_review_account is unchanged; its comment records why a reject or revoke
--     keeps hotel_id / agency_id.
--  3. cancel_booking refuses a declined booking instead of rewriting it to cancelled.
--  4. booking_boat_names(): the boat's name for bookings the caller can already see,
--     so a booking on a boat that is no longer listed is not titled "Boat".
--
-- Security notes:
--  * The read policy keeps the performance pattern: each partner branch is an
--    uncorrelated scalar subselect on the caller's own profile row, with auth.uid()
--    wrapped in (select ...), so Postgres evaluates it once per statement as an
--    initPlan, not once per booking row. No function is called per row.
--  * booking_boat_names is SECURITY DEFINER (it must read boats that public_boats
--    and the boats policy no longer show) and re-applies bookings_read_involved's
--    test inside, so it never names a boat for a booking the caller cannot read. It
--    returns the name only, never guest details. Revoked from public and anon,
--    granted to authenticated.
--  * Replaced functions keep their signatures, so CREATE OR REPLACE keeps their
--    grants; they are restated anyway.

-- 1. create_booking ------------------------------------------------------------------
-- Live body (migration 39). Changes:
--  * The caller's role, links and verification are read before pricing (the same
--    query, moved up), so a hotel or agency caller is told what is wrong with the
--    account before any trip-detail message.
--  * Hotel caller with no p_hotel_id: refused. Before, it fell through to
--    v_tourist := auth.uid() and became a personal booking the hotel portal never
--    shows. A hotel caller with p_hotel_id is checked by guard_hotel_booking exactly
--    as before (verified, linked to that hotel, hotel active).
--  * Agency caller: p_hotel_id given -> its own message (before: guard_hotel_booking's
--    "Your hotel account is not verified yet..."); not verified -> the existing
--    message; verified but agency_id null -> a "not linked" message. The rule itself
--    (verified and linked) is unchanged.
-- Every other role (tourist, owner, admin) is unchanged: with p_hotel_id the guard
-- refuses as before, without it the booking is theirs.

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

  -- Boat exists, is listed (B3), the trip is valid, and its price. p_price_total and
  -- p_deposit_amount are still accepted for compatibility and still ignored.
  select q.total, q.deposit into v_total, v_dep
    from public.price_booking_request(p_boat_id, p_guest_name, p_guest_phone, p_start_date,
                                      p_days, p_group_size, p_start_time, p_duration_hours) q;

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

-- 2a. bookings_read_involved ---------------------------------------------------------
-- Live USING (migration 40) with the hotel and agency branches narrowed: the caller's
-- profile must be a verified account of that role. Pending, rejected and revoked
-- staff keep their hotel_id / agency_id (see 2d) but read nothing through it. The
-- role test matches update_booking_request, so a profile whose role was changed by a
-- super administrator does not keep reading through a stale link. Tourist, admin and
-- operator branches are unchanged. Each subselect is uncorrelated (initPlan, once
-- per statement); profiles_read_own_or_admin lets the caller read their own row.

alter policy "bookings_read_involved" on public.bookings
  using (
    (tourist_id = (select auth.uid()))
    or (select public.is_admin())
    or (boat_id in (select public.my_boat_ids()))
    or (hotel_id = (select p.hotel_id from public.profiles p
                     where p.id = (select auth.uid())
                       and p.role = 'hotel' and p.verification_status = 'verified'))
    or (agency_id = (select p.agency_id from public.profiles p
                      where p.id = (select auth.uid())
                        and p.role = 'agency' and p.verification_status = 'verified'))
  );

-- 2b + 3. cancel_booking ---------------------------------------------------------------
-- Live body (migration 40). Changes:
--  * Hotel / agency branch: the caller must also be a verified account of that role
--    (as update_booking_request requires). A linked but unverified caller is told so,
--    instead of the generic refusal. Tourist, operator (manage_bookings) and admin
--    branches are unchanged. Organisation active state is still not required to
--    cancel (unchanged).
--  * Status: only requested, confirmed and deposit_paid are cancelled. Completed is
--    refused as before; cancelled is still a no-op; declined is now refused (before,
--    it was rewritten to cancelled, erasing the operator's decision). Any other
--    status is refused too, so a future status is not cancellable by accident.
-- Partners may still cancel confirmed and deposit-paid bookings (product decision).

create or replace function public.cancel_booking(p_booking_id uuid)
 returns bookings
 language plpgsql
 security definer
 set search_path = public, pg_temp
as $function$
declare
  v_booking public.bookings; v_uid uuid := auth.uid();
  v_role text; v_hotel uuid; v_agency uuid; v_verification text;
  v_hotel_link boolean; v_agency_link boolean;
begin
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found then raise exception 'Booking not found'; end if;
  select p.role::text, p.hotel_id, p.agency_id, p.verification_status::text
    into v_role, v_hotel, v_agency, v_verification
    from public.profiles p where p.id = v_uid;

  -- Both are plain true/false: every test is null-safe, and each link is checked
  -- non-null before it is compared, so nulls never match.
  v_hotel_link := v_booking.hotel_id is not null and v_role is not distinct from 'hotel'
                  and v_booking.hotel_id is not distinct from v_hotel;
  v_agency_link := v_booking.agency_id is not null and v_role is not distinct from 'agency'
                   and v_booking.agency_id is not distinct from v_agency;

  if v_booking.tourist_id is distinct from v_uid
     and not public.has_boat_permission(v_booking.boat_id, 'manage_bookings')
     and not ((v_hotel_link or v_agency_link) and v_verification is not distinct from 'verified')
     and not public.is_admin() then
    if v_hotel_link then
      raise exception 'Your hotel account must be verified before you can cancel bookings for guests.';
    elsif v_agency_link then
      raise exception 'Your agency account must be verified before you can cancel bookings for clients.';
    end if;
    raise exception 'You can only cancel your own booking';
  end if;

  if v_booking.status = 'completed' then
    raise exception 'A completed trip cannot be cancelled';
  end if;
  if v_booking.status = 'cancelled' then return v_booking; end if;
  if v_booking.status = 'declined' then
    raise exception 'The operator declined this request, so there is nothing to cancel.';
  end if;
  if v_booking.status not in ('requested', 'confirmed', 'deposit_paid') then
    raise exception 'This booking cannot be cancelled.';
  end if;

  update public.bookings set status = 'cancelled' where id = p_booking_id returning * into v_booking;
  return v_booking;
end; $function$;

revoke all on function public.cancel_booking(uuid) from public, anon;
grant execute on function public.cancel_booking(uuid) to authenticated;

-- 2c. admin_link_partner -----------------------------------------------------------------
-- Live body (migration 37) plus one rule: linking (a non-null organisation) needs a
-- verified account. An unverified account is linked as part of verification, by
-- admin_verify_hotel / admin_verify_agency, which check the documents first.
-- Unlinking (p_org_id null) is allowed for any account, as before.

create or replace function public.admin_link_partner(p_user_id uuid, p_kind text, p_org_id uuid)
 returns public.profiles
 language plpgsql
 security definer
 set search_path = public, pg_temp
as $function$
declare v_profile public.profiles;
begin
  if not public.is_admin() then raise exception 'Administrator only'; end if;
  if p_kind is null or p_kind not in ('hotel','agency') then
    raise exception 'Choose hotel or agency.';
  end if;

  select * into v_profile from public.profiles where id = p_user_id for update;
  if not found then raise exception 'User not found'; end if;
  if v_profile.role::text is distinct from p_kind then
    if p_kind = 'hotel' then
      raise exception 'This is not a hotel account, so it cannot be linked to a hotel.';
    else
      raise exception 'This is not a travel agency account, so it cannot be linked to an agency.';
    end if;
  end if;

  if p_org_id is not null and v_profile.verification_status is distinct from 'verified' then
    if p_kind = 'hotel' then
      raise exception 'This hotel account is not verified, so it cannot be linked yet. Verify it under Unverified hotels, which links it to its hotel at the same time.';
    else
      raise exception 'This agency account is not verified, so it cannot be linked yet. Verify it under Unverified agencies, which links it to its agency at the same time.';
    end if;
  end if;

  if p_kind = 'hotel' then
    if p_org_id is not null and not exists (select 1 from public.hotels where id = p_org_id) then
      raise exception 'Hotel not found';
    end if;
    update public.profiles set hotel_id = p_org_id
    where id = p_user_id returning * into v_profile;
  else
    if p_org_id is not null and not exists (select 1 from public.agencies where id = p_org_id) then
      raise exception 'Agency not found';
    end if;
    update public.profiles set agency_id = p_org_id
    where id = p_user_id returning * into v_profile;
  end if;
  return v_profile;
end; $function$;

revoke all on function public.admin_link_partner(uuid, text, uuid) from public, anon;
grant execute on function public.admin_link_partner(uuid, text, uuid) to authenticated;

-- 2d. admin_review_account: no code change -------------------------------------------
-- Rejecting an account, or revoking it (setting it back to pending), leaves hotel_id /
-- agency_id as they are. That is deliberate:
--  * history: the bookings the account made stay attributed to its organisation;
--  * re-verification: admin_verify_hotel / admin_verify_agency reuse the linked
--    organisation (migration 37), so clearing the link would make re-verifying create
--    a duplicate hotel or agency.
-- Access does not depend on the link alone: bookings_read_involved, cancel_booking,
-- update_booking_request, create_booking (agency) and guard_hotel_booking (hotel) all
-- require verification_status = 'verified', so an unverified account reads, changes,
-- cancels and books nothing through a kept link.

comment on function public.admin_review_account(uuid, verification_status, integer, text) is
  'Administrator sets an account''s verification status, trust score and note. Rejecting or revoking (pending) deliberately keeps hotel_id / agency_id: history stays attributed and re-verification reuses the organisation. Partner access is gated on verification_status = ''verified'' everywhere (bookings_read_involved, cancel_booking, update_booking_request, create_booking, guard_hotel_booking), not on the link.';

-- 4. booking_boat_names -------------------------------------------------------------------
-- The hotel and agency dashboards titled each booking from public_boats (and the
-- bookings list's boats(name) embed is filtered by the boats read policy the same
-- way), so a booking on a boat that is suspended, deactivated, deleted or overdue
-- for maintenance read "Boat". Chosen over snapshotting the name on the booking: no
-- new column, no backfill, no change to create_booking's insert, and the existing
-- boats.name stays the one source of truth.
--
-- Visibility is re-checked inside, with the same branches as bookings_read_involved
-- (tourist, admin, the boat's team, a verified hotel or agency account of that
-- organisation); a booking id the caller cannot read returns no row. At most 500 ids
-- per call; the client asks only for the bookings whose boat it could not name.

create or replace function public.booking_boat_names(p_booking_ids uuid[])
 returns table(booking_id uuid, boat_name text)
 language plpgsql
 stable
 security definer
 set search_path = public, pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
  v_admin boolean;
  v_hotel uuid; v_agency uuid;
begin
  if v_uid is null or p_booking_ids is null or cardinality(p_booking_ids) = 0 then
    return;
  end if;
  if cardinality(p_booking_ids) > 500 then
    raise exception 'Ask for at most 500 bookings at a time.';
  end if;

  v_admin := coalesce(public.is_admin(), false);
  select case when p.role = 'hotel' and p.verification_status = 'verified' then p.hotel_id end,
         case when p.role = 'agency' and p.verification_status = 'verified' then p.agency_id end
    into v_hotel, v_agency
    from public.profiles p where p.id = v_uid;

  return query
    select bk.id, bt.name
      from public.bookings bk
      join public.boats bt on bt.id = bk.boat_id
     where bk.id = any(p_booking_ids)
       and (bk.tourist_id is not distinct from v_uid
            or v_admin
            or bk.boat_id in (select public.my_boat_ids())
            or (v_hotel is not null and bk.hotel_id is not distinct from v_hotel)
            or (v_agency is not null and bk.agency_id is not distinct from v_agency));
end; $function$;

comment on function public.booking_boat_names(uuid[]) is
  'The boat name for each of the given bookings that the caller can read (the bookings_read_involved branches, re-checked inside), including boats no longer listed. Name only; at most 500 ids.';

revoke all on function public.booking_boat_names(uuid[]) from public, anon;
grant execute on function public.booking_boat_names(uuid[]) to authenticated;

notify pgrst, 'reload schema';
