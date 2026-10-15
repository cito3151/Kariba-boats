-- CRUD features, batch 3: small management paths from the CRUD audit.
--
-- Every function replaced here was fetched live with pg_get_functiondef before this
-- file was written. Only the parts named below change; everything else in each
-- body is the live definition, unchanged.
--
--  P3-a Correct a mistaken operating-hours entry. boat_operating_hours gains
--       voided_at, voided_by and void_reason. void_operating_hours() marks an entry
--       void and takes its hours back off the boat. The boat's owner can void an
--       entry they logged in the last 24 hours when no service has been recorded
--       since; an administrator can void any entry. Service records stay
--       append-only: no edit or delete path is added for them.
--       Search: public_boats lists a boat only while maintenance_status <>
--       'overdue', and maintenance_status is a generated column of boats
--       (accumulated_hours, last_maintenance_hours, maintenance_interval_hours,
--       maintenance_warn_hours). Checked live. So once the total drops back below
--       the overdue line the boat is listed again, and bookable, because
--       create_booking reads public_boats, with nothing else to do. That holds
--       only for a boat that is otherwise listed (approved, active, not deleted).
--  P4   Boat photos: owners may update only is_primary and sort_order. Before,
--       authenticated (and anon) held UPDATE on every column, so an owner could
--       set moderation_status, rewrite storage_path or move a photo to another
--       boat_id. INSERT is narrowed the same way, to the five columns the uploader
--       writes, so a new photo always starts as moderation_status 'pending'.
--  P4   publish_legal_document already takes p_is_required and p_applies_to_roles
--       (live signature: doc_type, title, body, is_required, applies_to_roles
--       default null), so it is not extended and not re-signed. It gains input
--       checks only: a title and text, a known role list that is not empty, and
--       no "required" marketing or booking-waiver document (see below).
--       Published versions stay immutable: authenticated has SELECT only on
--       legal_documents and no policy allows UPDATE or DELETE (checked live).
--  M1   admin_schedule_account_deletion() lets a super administrator start the
--       same 30-day deletion for another account that request_account_deletion()
--       starts for one's own; admin_cancel_account_deletion() undoes it.
--       admin_list_users() also returns the deletion date so the Roles view can
--       show it.

-- P3-a: columns ------------------------------------------------------------------

alter table public.boat_operating_hours
  add column if not exists voided_at timestamptz,
  add column if not exists voided_by uuid references public.profiles(id),
  add column if not exists void_reason text;

-- All three together or none: a void always has a time, an author and a reason.
alter table public.boat_operating_hours drop constraint if exists boat_operating_hours_void_complete;
alter table public.boat_operating_hours add constraint boat_operating_hours_void_complete
  check ((voided_at is null and voided_by is null and void_reason is null)
      or (voided_at is not null and voided_by is not null and void_reason is not null));

comment on column public.boat_operating_hours.voided_at is
  'When this entry was corrected (voided) by void_operating_hours(). Its hours no longer count towards boats.accumulated_hours.';
comment on column public.boat_operating_hours.void_reason is
  'Why the entry was voided, as written by the owner or administrator who voided it.';

-- P3-a: grants -------------------------------------------------------------------
-- Every write to these two tables runs inside a SECURITY DEFINER function
-- (log_operating_hours, void_operating_hours, complete_maintenance); no client
-- code inserts, updates or deletes either table (src/services/maintenance.service.ts
-- only selects). The only policies are SELECT policies, so RLS already refused
-- client writes; this removes the grants as well, so a later policy cannot open
-- the void columns or the service records. SELECT is unchanged. Cascades from a
-- boat delete run as the table owner, so they are unaffected.

revoke insert, update, delete, truncate on public.boat_operating_hours from anon, authenticated;
revoke insert, update, delete, truncate on public.boat_maintenance_records from anon, authenticated;

-- P3-a: void_operating_hours -----------------------------------------------------
-- Who:
--   * an administrator: any entry that is not already void;
--   * the boat's owner: an entry they logged themselves, less than 24 hours ago,
--     with no service record created after it. Once a service has been recorded
--     the entry is part of a closed cycle (complete_maintenance copied the total,
--     wrong hours included, into last_maintenance_hours and the service record),
--     so only an administrator can unwind it.
-- What:
--   * stamps voided_at, voided_by and void_reason; the row stays in the log;
--   * subtracts the hours from boats.accumulated_hours, under app.boat_hours_ctx
--     like log_operating_hours and complete_maintenance;
--   * when a service was recorded after the entry (administrators only), also
--     subtracts them from last_maintenance_hours: the latest service reset
--     last_maintenance_hours to a total that included the wrong hours, so both
--     readings drop together and the hours since that service are unchanged, which
--     is right because the mistake happened before the service. The service
--     record's hours_at_service is left as it was written (append-only).
--     boats_last_maint_lte_accum (last_maintenance_hours <= accumulated_hours)
--     keeps holding: an entry logged after the latest service is still inside
--     accumulated_hours - last_maintenance_hours, and an entry before it moves
--     both readings by the same amount;
--   * reading_after: every later entry that is not void had the wrong hours in
--     its running total, so each drops by the same amount and the log's totals
--     match the boat again. The voided row keeps the reading it was logged with;
--   * maintenance notifications triggered at a total the boat no longer reaches
--     are marked read, so an owner is not left with a stale "overdue" alert.
-- Lock order is the boat, then the entry, the same as log_operating_hours.
-- Ownership tests use `is distinct from`, so a null owner or logger never passes.

create or replace function public.void_operating_hours(p_entry_id uuid, p_reason text)
 returns public.boats
 language plpgsql
 security definer
 set search_path = public, pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
  v_is_admin boolean := public.is_admin();
  v_reason text := nullif(btrim(p_reason), '');
  v_boat_id uuid;
  v_boat public.boats;
  v_entry public.boat_operating_hours;
  v_serviced_after boolean;
begin
  if v_uid is null then raise exception 'Sign in to correct operating hours.'; end if;
  if not v_is_admin and public.has_outstanding_required_consent() then
    raise exception 'Consent required';
  end if;
  if v_reason is null or char_length(v_reason) < 5 then
    raise exception 'Say what was wrong with this entry (at least 5 characters).';
  end if;
  if char_length(v_reason) > 500 then
    raise exception 'Keep the reason to 500 characters or fewer.';
  end if;

  select h.boat_id into v_boat_id from public.boat_operating_hours h where h.id = p_entry_id;
  if not found then raise exception 'Hours entry not found'; end if;

  select * into v_boat from public.boats where id = v_boat_id for update;
  if not found then raise exception 'Boat not found'; end if;
  select * into v_entry from public.boat_operating_hours where id = p_entry_id for update;

  if v_entry.voided_at is not null then
    raise exception 'This entry has already been corrected.';
  end if;

  v_serviced_after := exists (
    select 1 from public.boat_maintenance_records r
    where r.boat_id = v_boat.id and r.created_at > v_entry.logged_at);

  if not v_is_admin then
    if v_boat.owner_id is distinct from v_uid then
      raise exception 'You can only correct hours for your own boats';
    end if;
    if v_entry.logged_by is distinct from v_uid then
      raise exception 'You can only correct an entry you logged yourself.';
    end if;
    if v_entry.logged_at < now() - interval '24 hours' then
      raise exception 'An entry can be corrected for 24 hours after it is logged. To correct an older one, contact us.';
    end if;
    if v_serviced_after then
      raise exception 'A service has been recorded since this entry, so it can no longer be corrected here. Contact us to correct it.';
    end if;
  end if;

  update public.boat_operating_hours
     set voided_at = now(), voided_by = v_uid, void_reason = v_reason
   where id = p_entry_id;

  update public.boat_operating_hours h
     set reading_after = greatest(h.reading_after - v_entry.hours, 0)
   where h.boat_id = v_boat.id
     and h.voided_at is null
     and h.logged_at > v_entry.logged_at;

  perform set_config('app.boat_hours_ctx', 'on', true);
  update public.boats set
    accumulated_hours = greatest(accumulated_hours - v_entry.hours, 0),
    last_maintenance_hours = case
      when v_serviced_after then greatest(last_maintenance_hours - v_entry.hours, 0)
      else last_maintenance_hours
    end
  where id = v_boat.id returning * into v_boat;
  perform set_config('app.boat_hours_ctx', 'off', true);

  update public.maintenance_notifications n
     set is_read = true
   where n.boat_id = v_boat.id
     and not n.is_read
     and n.hours_at_trigger > v_boat.accumulated_hours;

  return v_boat;
end; $function$;

revoke all on function public.void_operating_hours(uuid, text) from public, anon;
grant execute on function public.void_operating_hours(uuid, text) to authenticated;

-- P4: boat photos ----------------------------------------------------------------
-- Client writes to boat_images, checked in src/services/images.service.ts:
--   uploadBoatImages  INSERT boat_id, storage_path, sort_order, is_primary, uploaded_by
--   setPrimaryImage   UPDATE is_primary
--   reorderImages     UPDATE sort_order (new in this batch)
--   deleteBoatImage   DELETE
-- Table-wide first, then the columns (REVOKE on the table also removes the column
-- grants). boat_images_write_own still decides whose rows: the boat's owner, a
-- member of its company, or an administrator. admin_review_boat sets
-- moderation_status as definer, so approval is unaffected. anon has no policy
-- that lets it write, so it loses the write grants outright.

revoke update on public.boat_images from anon, authenticated;
grant update (is_primary, sort_order) on public.boat_images to authenticated;

revoke insert on public.boat_images from anon, authenticated;
grant insert (boat_id, storage_path, sort_order, is_primary, uploaded_by) on public.boat_images to authenticated;

revoke delete, truncate on public.boat_images from anon;
revoke truncate on public.boat_images from authenticated;

-- P4: publish_legal_document -----------------------------------------------------
-- Live definition plus input checks before the version is written. Same
-- signature, so no drop. What it refuses that it used to accept:
--   * an empty title or text;
--   * a null p_is_required (the column is NOT NULL; this gives a clear message);
--   * an empty role list: '{}' would make a required document apply to nobody,
--     where null means everyone;
--   * a role that is not a user_role;
--   * a required marketing document: consent to marketing has to be optional;
--   * a required booking waiver: the waiver is accepted per booking inside
--     create_booking, and a required one would also block every user's next visit
--     until they accepted a waiver for no booking.
-- The role list is stored de-duplicated and sorted.

create or replace function public.publish_legal_document(p_doc_type legal_doc_type, p_title text, p_body text, p_is_required boolean, p_applies_to_roles text[] default null::text[])
 returns legal_documents
 language plpgsql
 security definer
 set search_path = public, pg_temp
as $function$
declare v_next int; v_row public.legal_documents; v_roles text[]; v_bad text;
begin
  if not public.is_super_admin() then raise exception 'Super administrator only'; end if;
  if coalesce(btrim(p_title), '') = '' or coalesce(btrim(p_body), '') = '' then
    raise exception 'A document needs a title and text.';
  end if;
  if p_is_required is null then
    raise exception 'Say whether users must accept this document.';
  end if;
  if p_is_required and p_doc_type in ('marketing', 'booking_waiver') then
    raise exception 'The % cannot be required: it is accepted %.',
      case p_doc_type when 'marketing' then 'marketing consent' else 'booking waiver' end,
      case p_doc_type when 'marketing' then 'by choice' else 'with each booking' end;
  end if;
  if p_applies_to_roles is not null then
    select array_agg(distinct r order by r) into v_roles
      from unnest(p_applies_to_roles) r where r is not null;
    if v_roles is null then
      raise exception 'Choose at least one role, or apply the document to everyone.';
    end if;
    select r into v_bad from unnest(v_roles) r
     where not (r = any (enum_range(null::public.user_role)::text[])) limit 1;
    if v_bad is not null then raise exception 'Unknown role: %', v_bad; end if;
  end if;

  select coalesce(max(version), 0) + 1 into v_next
    from public.legal_documents where doc_type = p_doc_type;
  update public.legal_documents set is_current = false
    where doc_type = p_doc_type and is_current;
  insert into public.legal_documents
    (doc_type, version, title, body, is_required, applies_to_roles, is_current, published_by)
  values (p_doc_type, v_next, btrim(p_title), p_body, p_is_required, v_roles, true, auth.uid())
  returning * into v_row;
  return v_row;
end; $function$;

revoke all on function public.publish_legal_document(legal_doc_type, text, text, boolean, text[]) from public, anon;
grant execute on function public.publish_legal_document(legal_doc_type, text, text, boolean, text[]) to authenticated;

-- M1: admin_list_users -----------------------------------------------------------
-- Live definition plus two columns, deletion_scheduled_for and purged_at, so the
-- Roles view can show a pending deletion. These columns are not readable through
-- the API (migration 33 moved profiles to column grants without them); this
-- function is super-admin only and definer, as before. The return type changes,
-- so the function is dropped and recreated. auth leaves the search_path: the one
-- reference is already schema-qualified.

drop function if exists public.admin_list_users();

create or replace function public.admin_list_users()
 returns table(id uuid, email text, full_name text, role user_role, is_super_admin boolean, verification_status verification_status, created_at timestamp with time zone, deletion_scheduled_for timestamp with time zone, purged_at timestamp with time zone)
 language plpgsql
 security definer
 set search_path = public, pg_temp
as $function$
begin
  if not public.is_super_admin() then raise exception 'Super administrator only'; end if;
  return query
    select p.id, u.email::text, p.full_name, p.role, p.is_super_admin, p.verification_status, p.created_at,
           p.deletion_scheduled_for, p.purged_at
    from public.profiles p join auth.users u on u.id = p.id
    order by p.created_at desc;
end; $function$;

revoke all on function public.admin_list_users() from public, anon;
grant execute on function public.admin_list_users() to authenticated;

-- M1: admin_schedule_account_deletion --------------------------------------------
-- The same 30-day window as request_account_deletion (migration 33): the same two
-- columns, set under the same app.account_deletion_ctx flag that
-- guard_profile_deletion lets through, and the same refusals (already purged,
-- active upcoming bookings). Asking twice returns the existing dates.
--
-- An administrator target is refused, not demoted here. A super administrator
-- first changes the account's role in this same view (admin_set_role, which
-- already refuses to remove the last super administrator), then schedules the
-- deletion. Two separate steps because:
--   * demotion is the urgent part and takes effect at once, while deletion waits
--     30 days; folding it in would hide an immediate loss of access inside what
--     reads as a slow, reversible action;
--   * each step is its own audited profile change with its own confirmation, so
--     a slip on one button cannot both strip an administrator and queue their
--     account;
--   * the purge skips administrator accounts anyway, so a scheduled-but-still-
--     admin account would sit in the queue for ever.
-- The self and last-super-administrator checks stand in front of that rule so the
-- refusal names the real reason; with the admin refusal behind them neither can
-- in practice be reached through another path.
-- The target can still cancel the deletion from their own Account page during
-- the 30 days, exactly as with a deletion they asked for.

create or replace function public.admin_schedule_account_deletion(p_user_id uuid)
 returns table(requested_at timestamp with time zone, scheduled_for timestamp with time zone)
 language plpgsql
 security definer
 set search_path = public, pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
  v_target public.profiles;
  v_super_count int;
  v_active int;
begin
  if not public.is_super_admin() then raise exception 'Super administrator only'; end if;
  if p_user_id is null then raise exception 'User not found'; end if;
  if p_user_id is not distinct from v_uid then
    raise exception 'You cannot schedule your own account for deletion. Ask another super administrator.';
  end if;

  select * into v_target from public.profiles p where p.id = p_user_id for update;
  if not found then raise exception 'User not found'; end if;
  if v_target.purged_at is not null then
    raise exception 'This account has already been deleted.';
  end if;

  if v_target.is_super_admin then
    select count(*) into v_super_count from public.profiles p where p.is_super_admin;
    if v_super_count <= 1 then
      raise exception 'You cannot close the last super administrator.';
    end if;
  end if;
  if v_target.role = 'admin' or v_target.is_super_admin then
    raise exception 'This is an administrator account. Change its role to a non-administrator role first, then schedule the deletion.';
  end if;

  if v_target.deletion_requested_at is not null then
    requested_at := v_target.deletion_requested_at;
    scheduled_for := v_target.deletion_scheduled_for;
    return next;
    return;
  end if;

  v_active := public.account_active_booking_count(p_user_id);
  if v_active > 0 then
    raise exception 'This account has % upcoming booking% still active. Cancel %, or wait until % completed, then try again.',
      v_active,
      case when v_active = 1 then '' else 's' end,
      case when v_active = 1 then 'it' else 'them' end,
      case when v_active = 1 then 'it is' else 'they are' end;
  end if;

  perform set_config('app.account_deletion_ctx', 'on', true);
  update public.profiles p
     set deletion_requested_at = now(),
         deletion_scheduled_for = now() + interval '30 days'
   where p.id = p_user_id
  returning p.deletion_requested_at, p.deletion_scheduled_for
       into requested_at, scheduled_for;
  perform set_config('app.account_deletion_ctx', 'off', true);

  return next;
end; $function$;

revoke all on function public.admin_schedule_account_deletion(uuid) from public, anon;
grant execute on function public.admin_schedule_account_deletion(uuid) to authenticated;

-- The undo for a deletion scheduled by mistake (or one the user asked for and
-- then asked an administrator to stop). Same flag, same columns as
-- cancel_account_deletion. A purged account cannot be brought back.

create or replace function public.admin_cancel_account_deletion(p_user_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path = public, pg_temp
as $function$
declare v_target public.profiles;
begin
  if not public.is_super_admin() then raise exception 'Super administrator only'; end if;
  select * into v_target from public.profiles p where p.id = p_user_id for update;
  if not found then raise exception 'User not found'; end if;
  if v_target.purged_at is not null then
    raise exception 'This account has already been deleted.';
  end if;
  if v_target.deletion_requested_at is null then
    return;
  end if;

  perform set_config('app.account_deletion_ctx', 'on', true);
  update public.profiles p
     set deletion_requested_at = null,
         deletion_scheduled_for = null
   where p.id = p_user_id;
  perform set_config('app.account_deletion_ctx', 'off', true);
end; $function$;

revoke all on function public.admin_cancel_account_deletion(uuid) from public, anon;
grant execute on function public.admin_cancel_account_deletion(uuid) to authenticated;

notify pgrst, 'reload schema';
