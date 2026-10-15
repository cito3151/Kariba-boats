-- CRUD features, batch 2: the missing edit and management paths from the CRUD audit.
--
-- Every function replaced here was fetched live with pg_get_functiondef before this
-- file was written. Only the parts named below change; everything else in each
-- body is the live definition, unchanged.
--
--  P2-a guard_profile_privileges: a verified owner, hotel or agency can no longer
--       change business_name on its own (it is public as operator_name in
--       public_boats, and it is the name the admin verified). agency_id joins
--       hotel_id on the admin-only list. The purge early exit from migration 33 is
--       kept exactly. Users already have UPDATE (full_name, phone, business_name)
--       and profiles_update_own_or_admin, so the edit form needs nothing else.
--  P2-b Captains: no change. Checked live: authenticated has UPDATE on captains and
--       captains_owner_all (ALL, USING and WITH CHECK owner_id = auth.uid()) limits
--       it to the owner's own rows.
--  P2-c Hotels and agencies become admin-manageable:
--       - grants narrowed to SELECT plus INSERT/UPDATE on the four editable
--         columns (no DELETE: bookings and profiles reference these rows, so an
--         organisation is deactivated with is_verified = false instead);
--       - agencies gets the commission check and audit trigger hotels already has;
--       - guard_hotel_booking refuses a booking for a deactivated hotel or agency,
--         so deactivating actually stops new bookings;
--       - admin_link_partner links or unlinks a hotel or agency user;
--       - admin_verify_hotel / admin_verify_agency reuse an existing organisation
--         (the one passed in, or the one the user is already linked to) instead of
--         inserting a duplicate on every verification.
--  P2-d A verified company that changes its name or registration number goes back
--       to pending until an administrator re-checks it.

-- P2-a ---------------------------------------------------------------------------

create or replace function public.guard_profile_privileges()
 returns trigger
 language plpgsql
 security definer
 set search_path = public, pg_temp
as $function$
begin
  if auth.uid() is null and coalesce(current_setting('app.account_purge_ctx', true), '') = 'on' then
    new.updated_at := now();
    return new;
  end if;
  if (new.role is distinct from old.role or new.is_super_admin is distinct from old.is_super_admin)
     and not public.is_super_admin() then
    raise exception 'Only a super administrator can change roles';
  end if;
  if (new.verification_status is distinct from old.verification_status
      or new.trust_score is distinct from old.trust_score
      or new.verification_note is distinct from old.verification_note
      or new.reviewed_by is distinct from old.reviewed_by
      or new.reviewed_at is distinct from old.reviewed_at
      or new.hotel_id is distinct from old.hotel_id
      or new.agency_id is distinct from old.agency_id)
     and not public.is_admin() then
    raise exception 'Only an administrator can change verification or the hotel or agency link';
  end if;
  -- The business name of a verified operator, hotel or agency is the name an
  -- administrator checked against its documents, and an owner's is shown to
  -- guests as operator_name. Changing it goes through an administrator.
  if auth.uid() is not null
     and not public.is_admin()
     and old.role in ('owner','hotel','agency')
     and old.verification_status = 'verified'
     and new.business_name is distinct from old.business_name then
    raise exception 'Your business is verified under this name. To change it, contact us and an administrator will update it after checking your documents.';
  end if;
  new.updated_at := now();
  return new;
end; $function$;

-- Trigger functions are never called directly; the trigger runs them as definer.
revoke all on function public.guard_profile_privileges() from public, anon, authenticated;

-- P2-c: grants -------------------------------------------------------------------
-- Before: authenticated had every table privilege on hotels (DELETE and TRUNCATE
-- included) plus INSERT/UPDATE on every column, id and created_at included; on
-- agencies it had SELECT only, so an admin could not edit an agency at all.
-- REVOKE ALL on the table also removes the column grants. SELECT stays table-wide
-- (unchanged; hotels_read_all / agencies_read_all are `true`). Writes still need
-- hotels_write_admin / agencies_write_admin (ALL, is_admin() both ways), checked
-- live; anon has had no access since migration 36.

revoke all on public.hotels from authenticated;
grant select on public.hotels to authenticated;
grant insert (name, location, commission_rate, is_verified),
      update (name, location, commission_rate, is_verified)
  on public.hotels to authenticated;

revoke all on public.agencies from authenticated;
grant select on public.agencies to authenticated;
grant insert (name, location, commission_rate, is_verified),
      update (name, location, commission_rate, is_verified)
  on public.agencies to authenticated;

-- Parity with hotels: the same commission bounds (the admin form allows 0 to 30)
-- and the same audit trail. agencies is empty on the live project, so the check
-- validates at once.
alter table public.agencies
  add constraint agencies_commission_rate_check
  check (commission_rate >= 0 and commission_rate <= 30);

drop trigger if exists audit_agencies on public.agencies;
create trigger audit_agencies
  after insert or delete or update on public.agencies
  for each row execute function public.record_audit();

-- P2-c: deactivation stops new bookings ---------------------------------------------
-- Live definition plus two checks. A hotel booking also needs its hotel active; an
-- agency booking needs its agency active. create_booking already requires an
-- agency caller to be verified and linked (migration 36), so the agency check only
-- adds "and the agency is not deactivated". Existing bookings are untouched.

create or replace function public.guard_hotel_booking()
 returns trigger
 language plpgsql
 security definer
 set search_path = public, pg_temp
as $function$
begin
  if new.hotel_id is not null then
    if not exists (select 1 from public.profiles where id = auth.uid()
                   and role = 'hotel' and verification_status = 'verified' and hotel_id = new.hotel_id) then
      raise exception 'Your hotel account is not verified yet, or is not linked to this hotel.';
    end if;
    if not exists (select 1 from public.hotels h where h.id = new.hotel_id and h.is_verified) then
      raise exception 'This hotel is not active on Kariba Lake Connect. Contact us to reactivate it.';
    end if;
  end if;
  if auth.uid() is not null
     and new.agency_id is not null
     and not exists (select 1 from public.agencies a where a.id = new.agency_id and a.is_verified) then
    raise exception 'This travel agency is not active on Kariba Lake Connect. Contact us to reactivate it.';
  end if;
  return new;
end; $function$;

revoke all on function public.guard_hotel_booking() from public, anon, authenticated;

-- P2-c: admin_link_partner ---------------------------------------------------------
-- Links a hotel user to a hotel or an agency user to an agency; a null org unlinks.
-- The profile update runs as definer, but guard_profile_privileges reads
-- auth.uid() (the calling admin), so its is_admin() test passes for an admin and
-- the hotel_id / agency_id change is allowed. Verification status is left alone:
-- an unlinked hotel or agency cannot book (guard_hotel_booking, create_booking)
-- until it is linked again.

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

-- P2-c: admin_verify_hotel / admin_verify_agency -------------------------------------
-- New optional last argument, the organisation to link. Which organisation:
--   1. p_hotel_id / p_agency_id when given;
--   2. otherwise the one the user is already linked to (re-verifying after a
--      revoke or rejection no longer creates a second copy);
--   3. otherwise a new one from the name, location and commission, as before.
-- In cases 1 and 2 the organisation is reused as it is: name, location and
-- commission are edited under Hotels and agencies, not here. A deactivated
-- organisation is refused rather than silently reactivated. The user's role must
-- match (before, any account could be "verified as a hotel").
-- The old five-argument functions are dropped: with a defaulted sixth argument
-- beside them, every existing five-argument call would be ambiguous.

drop function if exists public.admin_verify_hotel(uuid, text, text, numeric, integer);

create or replace function public.admin_verify_hotel(p_user_id uuid, p_hotel_name text default null::text, p_location text default null::text, p_commission numeric default 8, p_trust_score integer default 90, p_hotel_id uuid default null::uuid)
 returns public.profiles
 language plpgsql
 security definer
 set search_path = public, pg_temp
as $function$
declare v_profile public.profiles; v_hotel_id uuid; v_active boolean;
begin
  if not public.is_admin() then raise exception 'Administrator only'; end if;
  if p_trust_score < 0 or p_trust_score > 100 then raise exception 'Trust score must be between 0 and 100'; end if;
  if not exists (select 1 from public.verification_documents where user_id = p_user_id) then
    raise exception 'This account has not uploaded any registration documents yet.';
  end if;

  select * into v_profile from public.profiles where id = p_user_id for update;
  if not found then raise exception 'User not found'; end if;
  if v_profile.role is distinct from 'hotel' then
    raise exception 'This is not a hotel account.';
  end if;

  v_hotel_id := coalesce(p_hotel_id, v_profile.hotel_id);
  if v_hotel_id is not null then
    select is_verified into v_active from public.hotels where id = v_hotel_id;
    if not found then raise exception 'Hotel not found'; end if;
    if not v_active then
      raise exception 'That hotel is deactivated. Reactivate it under Hotels and agencies first.';
    end if;
  else
    if coalesce(btrim(p_hotel_name), '') = '' or coalesce(btrim(p_location), '') = '' then
      raise exception 'Enter a hotel name and location.';
    end if;
    insert into public.hotels (name, location, commission_rate, is_verified)
    values (btrim(p_hotel_name), btrim(p_location), coalesce(p_commission, 8), true) returning id into v_hotel_id;
  end if;

  update public.profiles set
    hotel_id = v_hotel_id, verification_status = 'verified',
    trust_score = p_trust_score, verification_note = null,
    reviewed_by = auth.uid(), reviewed_at = now()
  where id = p_user_id returning * into v_profile;
  return v_profile;
end; $function$;

revoke all on function public.admin_verify_hotel(uuid, text, text, numeric, integer, uuid) from public, anon;
grant execute on function public.admin_verify_hotel(uuid, text, text, numeric, integer, uuid) to authenticated;

drop function if exists public.admin_verify_agency(uuid, text, text, numeric, integer);

create or replace function public.admin_verify_agency(p_user_id uuid, p_agency_name text default null::text, p_location text default null::text, p_commission numeric default 8, p_trust_score integer default 90, p_agency_id uuid default null::uuid)
 returns public.profiles
 language plpgsql
 security definer
 set search_path = public, pg_temp
as $function$
declare v_profile public.profiles; v_agency_id uuid; v_active boolean;
begin
  if not public.is_admin() then raise exception 'Administrator only'; end if;
  if p_trust_score < 0 or p_trust_score > 100 then raise exception 'Trust score must be between 0 and 100'; end if;
  if not exists (select 1 from public.verification_documents where user_id = p_user_id) then
    raise exception 'This account has not uploaded any registration documents yet.';
  end if;

  select * into v_profile from public.profiles where id = p_user_id for update;
  if not found then raise exception 'User not found'; end if;
  if v_profile.role is distinct from 'agency' then
    raise exception 'This is not a travel agency account.';
  end if;

  v_agency_id := coalesce(p_agency_id, v_profile.agency_id);
  if v_agency_id is not null then
    select is_verified into v_active from public.agencies where id = v_agency_id;
    if not found then raise exception 'Agency not found'; end if;
    if not v_active then
      raise exception 'That agency is deactivated. Reactivate it under Hotels and agencies first.';
    end if;
  else
    if coalesce(btrim(p_agency_name), '') = '' or coalesce(btrim(p_location), '') = '' then
      raise exception 'Enter an agency name and location.';
    end if;
    insert into public.agencies (name, location, commission_rate, is_verified)
    values (btrim(p_agency_name), btrim(p_location), coalesce(p_commission, 8), true) returning id into v_agency_id;
  end if;

  update public.profiles set
    agency_id = v_agency_id, verification_status = 'verified',
    trust_score = p_trust_score, verification_note = null,
    reviewed_by = auth.uid(), reviewed_at = now()
  where id = p_user_id returning * into v_profile;
  return v_profile;
end; $function$;

revoke all on function public.admin_verify_agency(uuid, text, text, numeric, integer, uuid) from public, anon;
grant execute on function public.admin_verify_agency(uuid, text, text, numeric, integer, uuid) to authenticated;

-- P2-d ---------------------------------------------------------------------------
-- revalidate_company_verification(p_company_id uuid, p_reason text) returns
-- boolean (live signature) and lapses a verified company only when
-- company_missing_proofs is non-empty. After a rename every proof is usually
-- still approved, so calling it here would almost always do nothing: the proofs
-- were checked against the old name and number, and that is exactly what has to
-- be re-checked. So this trigger lapses the company itself, the same way
-- revalidate_company_verification does (same columns, same context flag past
-- guard_company_privileges), and lists any missing proofs in the reason the same
-- way. The documents keep their review status: an administrator re-checks them
-- against the new details and re-verifies with admin_review_company.
--
-- AFTER UPDATE, so it sees the change that was actually written. The nested
-- update fires this trigger again, but the WHEN clause is false then (OLD is
-- already 'verified' with the new name, NEW is 'pending'), so it does not recurse.
-- An administrator's own edit, and any write with no auth.uid() (migrations,
-- the service role), keep the verification. Membership is not consulted, so the
-- multi-user company model planned for batch 5 needs no change here.

create or replace function public.lapse_company_on_identity_change()
 returns trigger
 language plpgsql
 security definer
 set search_path = public, pg_temp
as $function$
declare v_missing text[];
begin
  if auth.uid() is null or public.is_admin() then return null; end if;
  if old.verification_status is distinct from 'verified' then return null; end if;
  if new.name is not distinct from old.name
     and new.registration_number is not distinct from old.registration_number then
    return null;
  end if;

  v_missing := public.company_missing_proofs(new.id);

  perform set_config('app.company_verification_ctx', 'on', true);
  update public.companies set
    verification_status = 'pending',
    verified_at = null,
    verified_by = null,
    verification_lapsed_at = now(),
    verification_lapse_reason =
      'Company details changed: the company name or registration number was edited, so the documents need checking again.'
      || case when cardinality(v_missing) > 0
              then ' Outstanding proofs: ' || array_to_string(v_missing, ', ') || '.'
              else '' end
  where id = new.id;
  perform set_config('app.company_verification_ctx', 'off', true);

  return null;
end; $function$;

revoke all on function public.lapse_company_on_identity_change() from public, anon, authenticated;

drop trigger if exists companies_lapse_on_identity_change on public.companies;
create trigger companies_lapse_on_identity_change
  after update of name, registration_number on public.companies
  for each row
  when (old.verification_status = 'verified'
        and (new.name is distinct from old.name
             or new.registration_number is distinct from old.registration_number))
  execute function public.lapse_company_on_identity_change();

notify pgrst, 'reload schema';
