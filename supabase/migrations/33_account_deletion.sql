-- Account deletion with a 30-day grace period.
--
-- "30 days retention after deletion of an account." A signed-in user asks for
-- their account to be deleted; for 30 days nothing is removed and they can change
-- their mind; then a daily job removes or anonymises their personal data and
-- closes the sign-in. Booking records that the law makes us keep (ZIMRA: books of
-- account for six years, Income Tax Act s.37B, VAT Act s.57) are kept, with the
-- guest's name, phone and notes taken out.
--
-- What this migration does, in order:
--  1. profiles gains deletion_requested_at, deletion_scheduled_for and purged_at.
--  2. Reads of profiles move from table-wide to column-level SELECT grants, so the
--     new columns are not readable through the API at all (owner profiles are
--     readable by every signed-in user under profiles_read_own_or_admin, and
--     "this operator is leaving" is nobody else's business). A user reads their
--     own deletion state through account_deletion_status().
--  3. guard_profile_deletion: the three columns change only inside the RPCs
--     below (a transaction-local context flag, the boat_hours_ctx pattern) or
--     with no end user in context (service role, cron, migrations).
--  4. guard_profile_privileges (migration 16, live definition) gains one early
--     exit for the purge's own context flag, so the purge can clear the admin's
--     verification note. Everything else in it is unchanged.
--  5. account_active_booking_count, account_deletion_status,
--     request_account_deletion, cancel_account_deletion.
--  6. account_purge_storage_queue: storage objects to remove through the Storage
--     API (see "Storage" below).
--  7. purge_deleted_accounts(): the purge itself, service role only.
--  8. A daily pg_cron schedule, when the extension can be enabled.
--
-- Auditing. The request and the cancellation are ordinary UPDATEs of profiles,
-- so the existing audit_profiles trigger (migration 17) records them, with the
-- actor, like every other profile change. No separate audit write is needed.
--
-- What the purge does for each account whose 30 days are up (purged_at null,
-- deletion_scheduled_for <= now()):
--   * Skips administrator accounts (request_account_deletion refuses them; this
--     covers a role changed to admin while a request was pending).
--   * Each account runs in its own subtransaction: a failure rolls back that
--     account only, is logged as a WARNING and returned as 'failed: ...'.
--   * Defers, and leaves the account as it is, while the user still has an active
--     upcoming booking, as the guest or on a boat they own (status requested,
--     confirmed or deposit_paid and start_date today or later). It is picked up
--     again on the next run once the trip is completed or cancelled.
--   * Bookings they made as a guest: guest_name -> 'Former guest', guest_phone ->
--     'removed' (the column is NOT NULL with a length >= 6 check; 'removed' has no
--     digits, so track_booking can never match it), notes -> null, tourist_id ->
--     null. Reference, boat, dates, status and amounts are kept: they are the
--     booking and payment record.
--   * Reviews they wrote: reviewer_name -> 'Former guest'. The rating and text
--     stay, as published content about the boat. tourist_id stays (NOT NULL).
--   * Captains they registered are deleted; captain name and phone are cleared
--     from finished bookings on their boats.
--   * Their boats pass to another 'owner' member of the same company if there is
--     one; otherwise they are taken off the public listing (is_active = false).
--     The rows stay: bookings reference them (ON DELETE RESTRICT).
--   * Their company memberships are removed. A company left with no members is
--     renamed 'Former operator' and loses its contact email and phone.
--   * Verification documents they uploaded are deleted (the rows) and their files
--     queued for removal from the registration-docs bucket.
--   * Their maintenance notifications are deleted.
--   * The profile becomes a tombstone: full_name 'Deleted account', phone,
--     business_name and verification_note cleared, purged_at set. The row has to
--     stay because NOT NULL foreign keys point at it (reviews.tourist_id,
--     companies.created_by, boat_images.uploaded_by, and others).
--   * The sign-in: the auth user is deleted outright when nothing references the
--     profile any more (the delete cascades to the profile). Otherwise the auth
--     user is scrubbed: e-mail replaced with <id>@deleted.invalid, phone, metadata
--     and password cleared, banned, marked deleted_at, and its identities,
--     sessions, refresh tokens, MFA factors and one-time tokens deleted.
--   * Finally the audit trail: for every row touched above, the personal fields
--     (names, phones, notes, file names and paths, contact details) are removed
--     from audit_log.changed and the label is cleared. This runs last because the
--     purge's own UPDATEs and DELETEs are themselves audited with the old values.
--   * consent_records are kept: they are the evidence of what was agreed, and
--     hold only the user id, document version and time.
--
-- Storage. Supabase blocks DELETE on storage.objects from SQL (storage.
-- protect_delete), and deleting the row would only orphan the file anyway. So the
-- purge records bucket and path in account_purge_storage_queue, and a service-role
-- worker (an Edge Function or a scheduled script) removes them with the Storage
-- API and stamps removed_at:
--     select id, bucket_id, object_name from public.account_purge_storage_queue
--      where removed_at is null order by queued_at limit 100;
--     -> supabase.storage.from(bucket_id).remove([object_name, ...])
--     -> update public.account_purge_storage_queue set removed_at = now() where id = any(...)
-- Boat photos (public boat-images bucket) are not queued: they show the vessel,
-- not the person, and stay attached to the boat record.
--
-- Security model. Every function is SECURITY DEFINER with search_path pinned.
-- The three user RPCs are revoked from PUBLIC and anon and granted to
-- authenticated; they act only on auth.uid(). The purge and the internal helper
-- are revoked from PUBLIC, anon and authenticated and granted to service_role
-- (pg_cron runs it as the owner). New functions get EXECUTE for PUBLIC and, through
-- this project's default privileges, anon; both are revoked explicitly.

-- 1. Columns ---------------------------------------------------------------------

alter table public.profiles
  add column if not exists deletion_requested_at timestamptz,
  add column if not exists deletion_scheduled_for timestamptz,
  add column if not exists purged_at timestamptz;

alter table public.profiles drop constraint if exists profiles_deletion_pair;
alter table public.profiles add constraint profiles_deletion_pair
  check ((deletion_requested_at is null) = (deletion_scheduled_for is null));

create index if not exists profiles_deletion_due_idx
  on public.profiles (deletion_scheduled_for)
  where deletion_scheduled_for is not null and purged_at is null;

comment on column public.profiles.deletion_requested_at is
  'When the user asked for their account to be deleted. Set only by request_account_deletion().';
comment on column public.profiles.deletion_scheduled_for is
  'When purge_deleted_accounts() may remove the account: 30 days after the request.';
comment on column public.profiles.purged_at is
  'When the purge anonymised this profile. A purged profile is a tombstone kept for foreign keys.';

-- 2. Reads move to column grants -------------------------------------------------
-- Table-wide first, then the columns (28c / 29, Cause A). The list is every column
-- that existed before this migration, so every existing read keeps working:
-- fetchProfile, the admin lists, ApprovalQueue, and bookings_read_involved's
-- subqueries on hotel_id and agency_id. anon gets nothing back: no policy on
-- profiles names anon, so it could never read a row anyway, and public_boats is
-- a definer view.

revoke select on public.profiles from anon, authenticated;
grant select (
  id, role, full_name, phone, business_name, trust_score, created_at, updated_at,
  hotel_id, verification_status, verification_note, reviewed_by, reviewed_at,
  is_super_admin, agency_id
) on public.profiles to authenticated;

-- UPDATE is already column-level for authenticated (migration 01). anon still held
-- the Supabase default table-wide write grants; RLS stops them, but take them away
-- so a later policy cannot quietly expose the new columns.
revoke insert, update, delete on public.profiles from anon;

-- 3. Guard the deletion columns --------------------------------------------------

create or replace function public.guard_profile_deletion()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  -- No end user: the service role, pg_cron or a migration.
  if auth.uid() is null then
    return new;
  end if;
  -- request_account_deletion / cancel_account_deletion set this for one statement.
  if coalesce(current_setting('app.account_deletion_ctx', true), '') = 'on' then
    return new;
  end if;
  if new.deletion_requested_at is distinct from old.deletion_requested_at
     or new.deletion_scheduled_for is distinct from old.deletion_scheduled_for
     or new.purged_at is distinct from old.purged_at then
    raise exception 'Use Delete my account in your account settings to request or cancel deletion.';
  end if;
  return new;
end; $$;

revoke all on function public.guard_profile_deletion() from public, anon, authenticated;

drop trigger if exists profiles_guard_deletion on public.profiles;
create trigger profiles_guard_deletion
before update on public.profiles
for each row execute function public.guard_profile_deletion();

-- 4. guard_profile_privileges: one early exit for the purge ----------------------
-- Live definition (pg_get_functiondef) plus the first IF. The purge runs with no
-- end user, so is_admin() and is_super_admin() are false there and clearing
-- verification_note would otherwise raise.

create or replace function public.guard_profile_privileges()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  -- Only the purge, which runs with no end user; a signed-in session never gets
  -- this exit even if the flag were somehow set.
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
      or new.hotel_id is distinct from old.hotel_id)
     and not public.is_admin() then
    raise exception 'Only an administrator can change verification or hotel link';
  end if;
  new.updated_at := now();
  return new;
end; $$;

-- 5. The user's RPCs -------------------------------------------------------------

-- Active, upcoming bookings the user is party to: as the guest, or on a boat they
-- own. A past-dated booking still marked requested or confirmed does not count,
-- so a stale request can never block deletion for ever.
create or replace function public.account_active_booking_count(p_user uuid)
returns integer language sql stable security definer set search_path = public, pg_temp as $$
  select count(*)::int
  from public.bookings b
  where b.status in ('requested', 'confirmed', 'deposit_paid')
    and b.start_date >= current_date
    and (b.tourist_id = p_user
         or exists (select 1 from public.boats bt where bt.id = b.boat_id and bt.owner_id = p_user));
$$;

revoke all on function public.account_active_booking_count(uuid) from public, anon, authenticated;
grant execute on function public.account_active_booking_count(uuid) to service_role;

create or replace function public.account_deletion_status()
returns table(requested_at timestamptz, scheduled_for timestamptz, active_bookings integer)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Sign in to see your account.';
  end if;
  return query
    select p.deletion_requested_at, p.deletion_scheduled_for,
           public.account_active_booking_count(v_uid)
    from public.profiles p
    where p.id = v_uid;
end; $$;

revoke all on function public.account_deletion_status() from public, anon;
grant execute on function public.account_deletion_status() to authenticated;

create or replace function public.request_account_deletion()
returns table(requested_at timestamptz, scheduled_for timestamptz)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_profile public.profiles;
  v_active int;
begin
  if v_uid is null then
    raise exception 'Sign in to delete your account.';
  end if;

  select * into v_profile from public.profiles p where p.id = v_uid for update;
  if not found then raise exception 'Account not found'; end if;
  if v_profile.purged_at is not null then
    raise exception 'This account has already been deleted.';
  end if;
  -- An administrator deleting themselves could leave the platform with nobody
  -- able to run it; another super administrator closes an admin account.
  if v_profile.role = 'admin' or v_profile.is_super_admin then
    raise exception 'Administrator accounts cannot be deleted from here. Ask another super administrator to close it.';
  end if;

  -- Asking twice is not an error and does not restart the 30 days.
  if v_profile.deletion_requested_at is not null then
    requested_at := v_profile.deletion_requested_at;
    scheduled_for := v_profile.deletion_scheduled_for;
    return next;
    return;
  end if;

  v_active := public.account_active_booking_count(v_uid);
  if v_active > 0 then
    raise exception 'You have % upcoming booking% still active. Cancel %, or wait until % completed, then try again.',
      v_active,
      case when v_active = 1 then '' else 's' end,
      case when v_active = 1 then 'it' else 'them' end,
      case when v_active = 1 then 'it is' else 'they are' end;
  end if;

  perform set_config('app.account_deletion_ctx', 'on', true);
  update public.profiles p
     set deletion_requested_at = now(),
         deletion_scheduled_for = now() + interval '30 days'
   where p.id = v_uid
  returning p.deletion_requested_at, p.deletion_scheduled_for
       into requested_at, scheduled_for;
  perform set_config('app.account_deletion_ctx', 'off', true);

  return next;
end; $$;

revoke all on function public.request_account_deletion() from public, anon;
grant execute on function public.request_account_deletion() to authenticated;

create or replace function public.cancel_account_deletion()
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid(); v_profile public.profiles;
begin
  if v_uid is null then
    raise exception 'Sign in to manage your account.';
  end if;
  select * into v_profile from public.profiles p where p.id = v_uid for update;
  if not found then raise exception 'Account not found'; end if;
  if v_profile.purged_at is not null then
    raise exception 'This account has already been deleted.';
  end if;
  if v_profile.deletion_requested_at is null then
    return;
  end if;

  perform set_config('app.account_deletion_ctx', 'on', true);
  update public.profiles p
     set deletion_requested_at = null,
         deletion_scheduled_for = null
   where p.id = v_uid;
  perform set_config('app.account_deletion_ctx', 'off', true);
end; $$;

revoke all on function public.cancel_account_deletion() from public, anon;
grant execute on function public.cancel_account_deletion() to authenticated;

-- 6. Storage removal queue -------------------------------------------------------

create table if not exists public.account_purge_storage_queue (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  bucket_id text not null,
  object_name text not null,
  queued_at timestamptz not null default now(),
  removed_at timestamptz
);

create index if not exists account_purge_storage_queue_pending_idx
  on public.account_purge_storage_queue (queued_at) where removed_at is null;

comment on table public.account_purge_storage_queue is
  'Files of purged accounts still to be removed through the Storage API by a service-role worker. SQL cannot delete storage objects.';

-- No policies: only the service role (which bypasses RLS) reads or writes it.
alter table public.account_purge_storage_queue enable row level security;
revoke all on public.account_purge_storage_queue from anon, authenticated;

-- 7. The purge -------------------------------------------------------------------
-- Each account is purged in its own subtransaction: if anything fails for one
-- account, its changes roll back, the failure is reported in the result and in
-- the database log, and the run carries on with the next account.

create or replace function public.purge_deleted_accounts(p_limit int default 50)
returns table(user_id uuid, outcome text)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  r record;
  v_uid uuid;
  v_booking_ids uuid[];
  v_operator_booking_ids uuid[];
  v_review_ids uuid[];
  v_captain_ids uuid[];
  v_doc_ids uuid[];
  v_company_ids uuid[];
  v_orphan_company_ids uuid[];
  v_boat_ids uuid[];
  v_entities uuid[];
  v_auth_deleted boolean;
  -- Personal fields as they appear in audit_log.changed for the tables touched.
  v_pii_keys constant text[] := array[
    'full_name', 'phone', 'business_name', 'verification_note',
    'guest_name', 'guest_phone', 'notes', 'captain_name', 'captain_phone',
    'reviewer_name', 'name', 'file_name', 'storage_path', 'label',
    'contact_email', 'contact_phone', 'email'];
begin
  -- Only a trusted server caller: the service role or pg_cron. EXECUTE is not
  -- granted to authenticated; this check stands behind that grant.
  if auth.uid() is not null then
    raise exception 'Not allowed';
  end if;

  for r in
    select p.id, p.role, p.is_super_admin
    from public.profiles p
    where p.deletion_scheduled_for is not null
      and p.deletion_scheduled_for <= now()
      and p.purged_at is null
    order by p.deletion_scheduled_for
    limit greatest(coalesce(p_limit, 50), 1)
    for update skip locked
  loop
    v_uid := r.id;
    user_id := v_uid;

    -- request_account_deletion refuses administrators; this covers a role that
    -- was changed to admin while the request was pending.
    if r.role = 'admin' or r.is_super_admin then
      outcome := 'skipped: administrator account'; return next;
      continue;
    end if;

    if public.account_active_booking_count(v_uid) > 0 then
      outcome := 'deferred: active upcoming bookings'; return next;
      continue;
    end if;

    begin
      perform set_config('app.account_purge_ctx', 'on', true);

      -- Bookings made as the guest: keep the record, drop the person.
      select coalesce(array_agg(b.id), '{}') into v_booking_ids
        from public.bookings b where b.tourist_id = v_uid;
      update public.bookings b
         set guest_name = 'Former guest', guest_phone = 'removed', notes = null, tourist_id = null
       where b.id = any(v_booking_ids);

      -- Reviews: the published text stays, the name goes.
      select coalesce(array_agg(rv.id), '{}') into v_review_ids
        from public.reviews rv where rv.tourist_id = v_uid;
      update public.reviews rv set reviewer_name = 'Former guest'
       where rv.id = any(v_review_ids);

      -- Boats they own: hand over to a co-owner, or take off the listing.
      select coalesce(array_agg(bt.id), '{}') into v_boat_ids
        from public.boats bt where bt.owner_id = v_uid;
      update public.boats bt
         set owner_id = co.profile_id
        from (
          select distinct on (cm.company_id) cm.company_id, cm.profile_id
          from public.company_members cm
          join public.profiles cp on cp.id = cm.profile_id
          where cm.member_role = 'owner' and cm.profile_id <> v_uid
            and cp.purged_at is null and cp.deletion_requested_at is null
          order by cm.company_id, cm.added_at
        ) co
       where bt.id = any(v_boat_ids) and bt.company_id = co.company_id;
      update public.boats bt set is_active = false
       where bt.id = any(v_boat_ids) and bt.owner_id = v_uid and bt.is_active;

      -- Captains: their staff list goes, and the copies on finished trips with it.
      -- Those bookings belong to other guests, so only the captain fields change.
      select coalesce(array_agg(c.id), '{}') into v_captain_ids
        from public.captains c where c.owner_id = v_uid;
      select coalesce(array_agg(b.id), '{}') into v_operator_booking_ids
        from public.bookings b
       where b.boat_id = any(v_boat_ids)
         and b.status in ('completed', 'cancelled', 'declined')
         and (b.captain_name is not null or b.captain_phone is not null);
      update public.bookings b
         set captain_name = null, captain_phone = null
       where b.id = any(v_operator_booking_ids);
      delete from public.captains c where c.id = any(v_captain_ids);

      -- Verification documents: queue the files, then drop the rows.
      select coalesce(array_agg(d.id), '{}') into v_doc_ids
        from public.verification_documents d where d.user_id = v_uid;
      insert into public.account_purge_storage_queue (user_id, bucket_id, object_name)
        select v_uid, 'registration-docs', d.storage_path
        from public.verification_documents d
        where d.id = any(v_doc_ids) and d.storage_path is not null;
      delete from public.verification_documents d where d.id = any(v_doc_ids);

      -- Company memberships; a company nobody is left in loses its contact details.
      select coalesce(array_agg(cm.company_id), '{}') into v_company_ids
        from public.company_members cm where cm.profile_id = v_uid;
      delete from public.company_members cm where cm.profile_id = v_uid;
      select coalesce(array_agg(co.id), '{}') into v_orphan_company_ids
        from public.companies co
       where co.id = any(v_company_ids)
         and not exists (select 1 from public.company_members cm where cm.company_id = co.id);
      update public.companies co
         set name = 'Former operator', contact_email = null, contact_phone = null
       where co.id = any(v_orphan_company_ids);

      delete from public.maintenance_notifications mn where mn.recipient_id = v_uid;

      -- The profile becomes a tombstone.
      update public.profiles p
         set full_name = 'Deleted account', phone = null, business_name = null,
             verification_note = null, purged_at = now()
       where p.id = v_uid;

      -- The sign-in. Deleting the auth user cascades to the profile, so it only
      -- succeeds when nothing else references the profile; otherwise scrub and ban.
      v_auth_deleted := false;
      begin
        delete from auth.users u where u.id = v_uid;
        v_auth_deleted := true;
      exception when foreign_key_violation or restrict_violation then
        v_auth_deleted := false;
      end;

      if not v_auth_deleted then
        update auth.users u
           set email = v_uid::text || '@deleted.invalid',
               phone = null,
               raw_user_meta_data = '{}'::jsonb,
               encrypted_password = '',
               email_change = '', phone_change = '',
               confirmation_token = '', recovery_token = '',
               email_change_token_new = '', email_change_token_current = '',
               phone_change_token = '', reauthentication_token = '',
               banned_until = '9999-12-31 00:00:00+00'::timestamptz,
               deleted_at = now()
         where u.id = v_uid;
        delete from auth.identities i where i.user_id = v_uid;
        delete from auth.sessions s where s.user_id = v_uid;
        delete from auth.refresh_tokens t where t.user_id = v_uid::text;
        delete from auth.mfa_factors f where f.user_id = v_uid;
        delete from auth.one_time_tokens o where o.user_id = v_uid;
      end if;

      -- Last: take the personal fields out of the audit trail for every row
      -- touched, including the audit rows the statements above have just written.
      v_entities := array[v_uid] || v_booking_ids || v_review_ids || v_captain_ids
                    || v_doc_ids || v_orphan_company_ids;
      update public.audit_log a
         set changed = case when a.changed is null then null else a.changed - v_pii_keys end,
             label = null
       where a.entity_id = any(v_entities);
      update public.audit_log a
         set changed = a.changed - array['captain_name', 'captain_phone']
       where a.entity_id = any(v_operator_booking_ids) and a.changed is not null;

      perform set_config('app.account_purge_ctx', 'off', true);

      outcome := case when v_auth_deleted then 'purged; auth user deleted'
                      else 'purged; auth user scrubbed and banned' end;
    exception when others then
      perform set_config('app.account_purge_ctx', 'off', true);
      raise warning 'purge_deleted_accounts: % failed: %', v_uid, sqlerrm;
      outcome := 'failed: ' || sqlerrm;
    end;
    return next;
  end loop;
end; $$;

revoke all on function public.purge_deleted_accounts(int) from public, anon, authenticated;
grant execute on function public.purge_deleted_accounts(int) to service_role;

comment on function public.purge_deleted_accounts(int) is
  'Removes or anonymises the personal data of accounts whose 30-day deletion window has passed. Service role / pg_cron only. Files are queued in account_purge_storage_queue for removal through the Storage API.';

-- 8. Daily schedule --------------------------------------------------------------
-- pg_cron is available on this project but was not installed when this was
-- written (pg_available_extensions: 1.6.4, installed_version null). Enable it and
-- schedule the purge for 02:17 UTC (04:17 in Harare) every day. If the extension
-- cannot be created here, the migration still succeeds and says so; then enable
-- pg_cron under Database -> Extensions and run the cron.schedule call by hand, or
-- call purge_deleted_accounts() daily from a service-role scheduled function.

do $$
begin
  begin
    create extension if not exists pg_cron with schema pg_catalog;
  exception when others then
    raise notice 'pg_cron could not be enabled (%). Schedule public.purge_deleted_accounts() manually.', sqlerrm;
    return;
  end;
  perform cron.schedule(
    'purge-deleted-accounts',
    '17 2 * * *',
    'select public.purge_deleted_accounts(200)'
  );
end $$;

notify pgrst, 'reload schema';
