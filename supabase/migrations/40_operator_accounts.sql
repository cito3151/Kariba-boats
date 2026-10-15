-- Batch 5: individual operators and multi-user companies (ADR-002).
--
-- "Individuals and multi-user companies are both goals." One tenant model covers
-- both: every operator account works inside exactly one workspace (a row of
-- companies), which is either an 'individual' (a sole trader, always exactly one
-- member) or a 'company' (one or more members with the roles owner, manager and
-- staff). Access to boats and everything hanging off them now goes through
-- membership of the boat's company with a minimum role, instead of
-- boats.owner_id = auth.uid().
--
-- Every function replaced here was fetched live with pg_get_functiondef before this
-- file was written, and every policy was read from pg_policies. Unless a section
-- says otherwise, only the ownership test changes; the rest of each body is the
-- live definition.
--
--  1. Schema: operator_type on companies, boats.created_by, captains.company_id.
--  2. Backfill: the one live company stays 'company' (its proof set is unchanged),
--     boats.created_by := owner_id, captains get their owner's company, and
--     boats.company_id becomes NOT NULL. One workspace per profile (unique index).
--  3. Helpers: the permission matrix (company_permission_min_role), the access
--     tests (has_company_permission, has_boat_permission), the set-returning read
--     helpers for policies (my_company_ids, my_boat_ids), the proof set per type
--     (required_proof_kinds, company_missing_proofs), and the successor rule used
--     by leave, remove and the account purge.
--  4. company_members: client writes revoked (RPCs only), one-member rule for
--     individuals, audit trigger.
--  5. companies: operator_type is guarded like the verification columns; updates
--     need the edit_company permission (owners).
--  6. Read and write policies: boats, boat_images, bookings, maintenance records,
--     hours, notifications, approval logs, captains, reviews, verification
--     documents, and the two storage buckets.
--  7. Boat creation: new boats join the creator's company, record who created
--     them, and are held by the team's accountable owner.
--  8. Owner RPCs move to has_company_permission / has_boat_permission.
--  9. Membership RPCs: list, add by email, change role, remove, leave, and the
--     individual-to-company upgrade.
-- 10. Signup: handle_new_user reads operator_type from the signup metadata.
-- 11. Account deletion: account_active_booking_count and purge_deleted_accounts
--     hand a leaving member's boats and captains to the team.
--
-- Security notes:
--  * Every new function is SECURITY DEFINER with search_path pinned. Postgres gives
--    EXECUTE to PUBLIC by default and this project's default privileges add anon, so
--    each one is revoked from public and anon (and from authenticated when it is
--    internal) before anything is granted (the 28b lesson).
--  * my_company_ids / my_boat_ids are granted to anon as well: they appear in the
--    boats and boat_images read policies, which apply to anon, and Postgres checks
--    EXECUTE when the policy expression is initialised even if another OR branch is
--    already true. With no auth.uid() they return no rows.
--  * Table-wide grants are revoked before column grants are handed back (28c).
--  * Guard triggers exempt auth.uid() is null (service role, migrations, the purge)
--    and compare with IS DISTINCT FROM.

-- 1. Schema -------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
                 where n.nspname = 'public' and t.typname = 'operator_type') then
    create type public.operator_type as enum ('individual', 'company');
  end if;
end $$;

alter table public.companies
  add column if not exists operator_type public.operator_type not null default 'company';

comment on column public.companies.operator_type is
  'individual: a sole trader, always exactly one member, no company registration needed. company: a registered business, any number of members. Set at signup; an individual can upgrade with upgrade_to_company(). Not writable by the client.';

alter table public.boats
  add column if not exists created_by uuid;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'boats_created_by_fkey') then
    alter table public.boats
      add constraint boats_created_by_fkey foreign key (created_by)
      references public.profiles(id) on delete set null;
  end if;
end $$;

comment on column public.boats.created_by is
  'Who registered the boat (stamped by stamp_boat_company). Display only; it grants nothing. Set null when that account is finally deleted.';
comment on column public.boats.owner_id is
  'The accountable owner: a member of the boat''s company with the owner role. Access to the boat goes through company membership (has_boat_permission), not through this column.';

alter table public.captains
  add column if not exists company_id uuid references public.companies(id) on delete cascade;

comment on column public.captains.company_id is
  'The team whose roster this captain is on. captains.owner_id is who added them.';

create index if not exists captains_company_idx on public.captains (company_id);
-- my_boat_ids() reads every boat of a company, deleted ones included (a member still
-- sees the history of a deleted boat, as the owner did before), so the partial
-- boats_company_idx (where not is_deleted) cannot serve it.
create index if not exists boats_company_all_idx on public.boats (company_id);

-- 2. Backfill -----------------------------------------------------------------------
-- Live at the time of writing: 1 company, 1 member (owner), 3 boats all with a
-- company, 0 captains, 0 documents, 0 owner profiles without a company. Each step is
-- written for the general case anyway, and none of them changes that live row's
-- verification or what tourists see.

-- An operator account must have a workspace. handle_new_user has created one for
-- every owner signup since 28, so this finds nobody today; it is here so the NOT
-- NULL below cannot fail on an older seed.
do $$
declare r record; v_company_id uuid;
begin
  for r in
    select p.* from public.profiles p
    where p.role = 'owner' and p.purged_at is null
      and not exists (select 1 from public.company_members cm where cm.profile_id = p.id)
  loop
    insert into public.companies (name, created_by, operator_type)
    values (coalesce(nullif(btrim(r.business_name), ''), nullif(btrim(r.full_name), ''), 'Unnamed operator'),
            r.id, 'company')
    returning id into v_company_id;
    insert into public.company_members (company_id, profile_id, member_role)
    values (v_company_id, r.id, 'owner');
  end loop;
end $$;

-- guard_boat_privileges refuses a company_id change for anyone who is not an admin,
-- and a migration has no admin in context. Its own context flag (transaction local,
-- 28c) is the sanctioned way past it; it is switched off again straight after.
select set_config('app.boat_hours_ctx', 'on', true);

update public.boats b
   set company_id = (select cm.company_id from public.company_members cm
                      where cm.profile_id = b.owner_id order by cm.added_at limit 1)
 where b.company_id is null;

update public.boats set created_by = owner_id where created_by is null;

select set_config('app.boat_hours_ctx', 'off', true);

update public.captains c
   set company_id = (select cm.company_id from public.company_members cm
                      where cm.profile_id = c.owner_id order by cm.added_at limit 1)
 where c.company_id is null;

-- A boat or captain whose owner has no company at all would make these fail. That
-- is the right outcome: it is data the new access model cannot reach, and the
-- migration should stop and say so rather than leave it invisible.
alter table public.boats alter column company_id set not null;
alter table public.captains alter column company_id set not null;

-- One workspace per profile. 28c anticipated profiles in several companies, but
-- nothing in the product can put one there yet and the portal has no workspace
-- switcher; ADR-002 defers multi-workspace membership. The unique index makes
-- current_user_company() unambiguous and every "my company" read deterministic.
do $$
begin
  if exists (select 1 from public.company_members group by profile_id having count(*) > 1) then
    raise exception 'A profile belongs to more than one company. Resolve that by hand before applying migration 40.';
  end if;
end $$;

drop index if exists public.company_members_profile_idx;
create unique index if not exists company_members_one_company_per_profile
  on public.company_members (profile_id);

-- A boat's accountable owner must be an owner of its company. True for every live
-- boat; this repairs any older row by giving it to the company's longest-standing
-- owner, and leaves a boat alone if its company has no owner at all.
update public.boats b
   set owner_id = o.profile_id
  from (
    select distinct on (cm.company_id) cm.company_id, cm.profile_id
      from public.company_members cm
     where cm.member_role = 'owner'
     order by cm.company_id, cm.added_at, cm.profile_id
  ) o
 where o.company_id = b.company_id
   and not exists (select 1 from public.company_members cm
                    where cm.company_id = b.company_id and cm.profile_id = b.owner_id
                      and cm.member_role = 'owner');

-- 3. Helpers ------------------------------------------------------------------------

-- 3a. The permission matrix, stated once. An unknown permission returns null, which
-- every caller treats as "no": a typo fails closed.
create or replace function public.company_permission_min_role(p_permission text)
returns public.company_member_role
language sql immutable set search_path = public, pg_temp as $$
  select (case p_permission
    when 'view'                 then 'staff'
    when 'log_hours'            then 'staff'
    when 'assign_captains'      then 'staff'
    when 'edit_boats'           then 'manager'
    when 'manage_bookings'      then 'manager'
    when 'complete_maintenance' then 'manager'
    when 'manage_captains'      then 'manager'
    when 'reply_reviews'        then 'manager'
    when 'manage_documents'     then 'manager'
    when 'edit_company'         then 'owner'
    when 'manage_members'       then 'owner'
    when 'delete_boats'         then 'owner'
  end)::public.company_member_role;
$$;

create or replace function public.company_role_rank(p_role public.company_member_role)
returns integer
language sql immutable set search_path = public, pg_temp as $$
  select case p_role when 'owner' then 3 when 'manager' then 2 when 'staff' then 1 end;
$$;

-- The refusal an RPC gives a member whose role is too low, worded from the matrix.
create or replace function public.team_role_denied(p_permission text, p_action text)
returns text
language sql immutable set search_path = public, pg_temp as $$
  select case public.company_permission_min_role(p_permission)
    when 'owner'   then 'Only a team owner can ' || p_action || '.'
    when 'manager' then 'Only a team owner or manager can ' || p_action || '. Ask one of them to do it.'
    else 'You cannot ' || p_action || '.'
  end;
$$;

revoke all on function public.company_permission_min_role(text) from public, anon, authenticated;
revoke all on function public.company_role_rank(public.company_member_role) from public, anon, authenticated;
revoke all on function public.team_role_denied(text, text) from public, anon, authenticated;

-- 3b. The access tests. SECURITY DEFINER so that policies can consult
-- company_members without recursing through its own row level security.
create or replace function public.has_company_permission(p_company_id uuid, p_permission text)
returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((
    select public.company_role_rank(cm.member_role)
           >= public.company_role_rank(public.company_permission_min_role(p_permission))
      from public.company_members cm
     where cm.company_id = p_company_id
       and cm.profile_id = auth.uid()
  ), false);
$$;

create or replace function public.has_boat_permission(p_boat_id uuid, p_permission text)
returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((
    select public.has_company_permission(b.company_id, p_permission)
      from public.boats b where b.id = p_boat_id
  ), false);
$$;

-- For read policies: `col in (select public.my_company_ids())` is an uncorrelated
-- subquery, so Postgres runs it once per statement and hashes the result, instead
-- of calling a definer function once per row. That is the "(select auth.uid())"
-- performance rule applied to membership.
create or replace function public.my_company_ids()
returns setof uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select cm.company_id from public.company_members cm where cm.profile_id = auth.uid();
$$;

create or replace function public.my_boat_ids()
returns setof uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select b.id
    from public.boats b
    join public.company_members cm on cm.company_id = b.company_id
   where cm.profile_id = auth.uid();
$$;

revoke all on function public.has_company_permission(uuid, text) from public, anon;
revoke all on function public.has_boat_permission(uuid, text) from public, anon;
revoke all on function public.my_company_ids() from public, anon;
revoke all on function public.my_boat_ids() from public, anon;
grant execute on function public.has_company_permission(uuid, text) to authenticated;
grant execute on function public.has_boat_permission(uuid, text) to authenticated;
-- anon: see the security notes at the top. Both return nothing without a user.
grant execute on function public.my_company_ids() to anon, authenticated;
grant execute on function public.my_boat_ids() to anon, authenticated;

-- 3c. is_boat_manager (32) loses its owner_id branch: access is membership only, so
-- an accountable owner who leaves the team stops managing its boats. Nothing in this
-- migration calls it any more (reviews use my_boat_ids and has_boat_permission); it
-- stays, with its 32 grants, for anything outside the database that still does.
create or replace function public.is_boat_manager(p_boat_id uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select public.has_boat_permission(p_boat_id, 'view');
$$;

-- 3d. Proofs per operator type. The rule stays "every kind in the enum" for a
-- company, so 28d's property holds: adding a proof kind later tightens verification
-- automatically. An individual needs every kind except company_registration:
-- director_id is the individual's own national ID or passport (the interface labels
-- it so), plus proof of boat ownership and the operator licence, which a sole
-- trader carrying paying passengers needs as much as a company does.
create or replace function public.required_proof_kinds(p_type public.operator_type)
returns public.company_document_kind[]
language sql stable set search_path = public, pg_temp as $$
  select array(
    select k
      from unnest(enum_range(null::public.company_document_kind)) k
     where not (p_type = 'individual' and k = 'company_registration')
     order by k::text
  );
$$;

revoke all on function public.required_proof_kinds(public.operator_type) from public, anon, authenticated;

-- Live definition (28e) with the kinds now read from the company's type. An unknown
-- company id is treated as a company, so it is still missing everything.
create or replace function public.company_missing_proofs(p_company_id uuid)
returns text[]
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(array_agg(k::text order by k::text), array[]::text[])
  from unnest(public.required_proof_kinds(coalesce(
         (select c.operator_type from public.companies c where c.id = p_company_id),
         'company'::public.operator_type))) k
  where not exists (
    select 1 from public.verification_documents d
     where d.company_id = p_company_id
       and d.doc_kind = k
       and d.review_status = 'approved'
       and (d.expires_at is null or d.expires_at >= current_date)
  );
$$;

revoke all on function public.company_missing_proofs(uuid) from public, anon, authenticated;

-- 3e. Who takes over when a member goes. Owners first, then managers, then staff;
-- longest-serving first within a role. A member whose own deletion is pending or done
-- is never chosen. Used by the purge and by account_active_booking_count.
create or replace function public.company_successor(p_company_id uuid, p_leaving uuid)
returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select cm.profile_id
    from public.company_members cm
    join public.profiles p on p.id = cm.profile_id
   where cm.company_id = p_company_id
     and cm.profile_id is distinct from p_leaving
     and p.purged_at is null
     and p.deletion_requested_at is null
   order by public.company_role_rank(cm.member_role) desc, cm.added_at, cm.profile_id
   limit 1;
$$;

revoke all on function public.company_successor(uuid, uuid) from public, anon, authenticated;

-- The longest-standing owner other than p_except, or null. Boats are only ever held
-- by an owner, so this is who receives them on a demotion, removal or departure.
create or replace function public.company_first_owner(p_company_id uuid, p_except uuid default null)
returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select cm.profile_id
    from public.company_members cm
   where cm.company_id = p_company_id
     and cm.member_role = 'owner'
     and cm.profile_id is distinct from p_except
   order by cm.added_at, cm.profile_id
   limit 1;
$$;

revoke all on function public.company_first_owner(uuid, uuid) from public, anon, authenticated;

-- A fresh, empty individual workspace for an operator who has just left or been
-- removed from a team, so every operator account keeps exactly one workspace (the
-- signup invariant) and their portal is not left without a company. It is empty, so
-- another team can add them later without anything to dissolve.
create or replace function public.create_personal_workspace(p_profile_id uuid)
returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_profile public.profiles; v_company_id uuid;
begin
  select * into v_profile from public.profiles where id = p_profile_id;
  if not found or v_profile.purged_at is not null or v_profile.role <> 'owner' then
    return null;
  end if;
  if exists (select 1 from public.company_members where profile_id = p_profile_id) then
    return null;
  end if;
  insert into public.companies (name, created_by, operator_type)
  values (coalesce(nullif(btrim(v_profile.business_name), ''), nullif(btrim(v_profile.full_name), ''), 'Unnamed operator'),
          p_profile_id, 'individual')
  returning id into v_company_id;
  insert into public.company_members (company_id, profile_id, member_role)
  values (v_company_id, p_profile_id, 'owner');
  return v_company_id;
end; $$;

revoke all on function public.create_personal_workspace(uuid) from public, anon, authenticated;

-- 4. company_members ----------------------------------------------------------------

-- Only a SELECT policy has ever existed, so RLS already refused client writes, but
-- authenticated still held the Supabase default table-wide grants. Every write now
-- goes through the RPCs in section 9.
revoke all on public.company_members from anon, authenticated;
grant select on public.company_members to authenticated;

create or replace function public.guard_company_membership()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  -- Trusted server callers (service role, migrations, the purge) pass through.
  if auth.uid() is null then
    return new;
  end if;
  if (select c.operator_type from public.companies c where c.id = new.company_id) = 'individual'
     and exists (select 1 from public.company_members cm
                  where cm.company_id = new.company_id
                    and cm.profile_id is distinct from new.profile_id) then
    raise exception 'An individual operator works alone. Switch your account to a company to add team members.';
  end if;
  return new;
end; $$;

revoke all on function public.guard_company_membership() from public, anon, authenticated;

drop trigger if exists company_members_guard on public.company_members;
create trigger company_members_guard
before insert or update of company_id, profile_id on public.company_members
for each row execute function public.guard_company_membership();

-- Membership changes were never audited. record_audit keys on an `id` column, which
-- this table does not have, so entity_id is null and the company and profile ids are
-- in `changed`.
drop trigger if exists audit_company_members on public.company_members;
create trigger audit_company_members
after insert or update or delete on public.company_members
for each row execute function public.record_audit();

-- 5. companies ----------------------------------------------------------------------

-- Live definition (28e) plus one block: operator_type changes only inside
-- upgrade_to_company() (transaction-local context flag, the boat_hours_ctx pattern)
-- or by an administrator. There is no column grant for it either; this is belt and
-- braces against a future grant reopening it.
create or replace function public.guard_company_privileges()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if coalesce(current_setting('app.company_verification_ctx', true), '') = 'on' then
    new.updated_at := now();
    return new;
  end if;

  if auth.uid() is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if not public.is_admin() then
      new.verification_status := 'unverified';
      new.verification_note := null;
      new.verified_at := null;
      new.verified_by := null;
    end if;
    return new;
  end if;

  if not public.is_admin() then
    if new.verification_status is distinct from old.verification_status
       or new.verification_note is distinct from old.verification_note
       or new.verified_by is distinct from old.verified_by
       or new.verified_at is distinct from old.verified_at then
      raise exception 'Only an administrator can change company verification';
    end if;
    if new.created_by is distinct from old.created_by
       or new.created_at is distinct from old.created_at then
      raise exception 'Company provenance cannot be rewritten';
    end if;
    if new.verification_lapsed_at is distinct from old.verification_lapsed_at
       or new.verification_lapse_reason is distinct from old.verification_lapse_reason then
      raise exception 'Only an administrator can change company verification';
    end if;
    if new.operator_type is distinct from old.operator_type
       and coalesce(current_setting('app.operator_type_ctx', true), '') <> 'on' then
      raise exception 'Use Switch to a company account on your company page to change the operator type.';
    end if;
  end if;
  new.updated_at := now();
  return new;
end; $$;

-- Company details are the owner's: the name and registration number are what an
-- administrator verified, and changing them lapses verification (37).
alter policy "companies_update_own_or_admin" on public.companies
  using (public.has_company_permission(id, 'edit_company') or public.is_admin())
  with check (public.has_company_permission(id, 'edit_company') or public.is_admin());

-- 6. Policies -----------------------------------------------------------------------
-- ALTER POLICY keeps each policy's name, command and roles; only the expression
-- changes, and only the ownership branch of it.

-- boats
alter policy "boats_read_public_or_own_or_admin" on public.boats
  using (
    ((status = 'approved'::boat_status) and is_active and (not is_deleted) and (maintenance_status <> 'overdue'::text))
    or (company_id in (select public.my_company_ids()))
    or (select public.is_admin())
  );

-- Inert while authenticated holds no UPDATE on boats (closed in 29/36: every edit is
-- an RPC), but kept consistent so a future grant cannot reopen the owner_id path.
alter policy "boats_update_own" on public.boats
  using (public.has_company_permission(company_id, 'edit_boats') or public.is_admin())
  with check (public.has_company_permission(company_id, 'edit_boats') or public.is_admin());

-- WITH CHECK runs after the BEFORE INSERT triggers, so company_id here is the one
-- stamp_boat_company resolved. owner_id is no longer required to be the caller: it
-- is the team's accountable owner, which the trigger sets.
alter policy "boats_insert_own_as_owner" on public.boats
  with check (
    public.has_company_permission(company_id, 'edit_boats')
    and ((select public.current_user_role()) = 'owner'::user_role)
  );

-- boat_images
alter policy "boat_images_read_visible" on public.boat_images
  using (exists (
    select 1 from public.boats b
     where b.id = boat_images.boat_id
       and ((b.company_id in (select public.my_company_ids()))
            or (select public.is_admin())
            or ((b.status = 'approved'::boat_status) and b.is_active and (not b.is_deleted)))
  ));

-- The write policy was FOR ALL, so its USING was also evaluated on every SELECT of
-- boat_images by a signed-in user, tourists browsing included. Split by command so
-- reads only pay for boat_images_read_visible. Same rule: an editor of the boat's
-- company, or an admin.
drop policy if exists "boat_images_write_own" on public.boat_images;
create policy "boat_images_insert_editor" on public.boat_images
  for insert to authenticated
  with check (exists (select 1 from public.boats b where b.id = boat_images.boat_id
                      and (public.has_company_permission(b.company_id, 'edit_boats') or public.is_admin())));
create policy "boat_images_update_editor" on public.boat_images
  for update to authenticated
  using (exists (select 1 from public.boats b where b.id = boat_images.boat_id
                 and (public.has_company_permission(b.company_id, 'edit_boats') or public.is_admin())))
  with check (exists (select 1 from public.boats b where b.id = boat_images.boat_id
                      and (public.has_company_permission(b.company_id, 'edit_boats') or public.is_admin())));
create policy "boat_images_delete_editor" on public.boat_images
  for delete to authenticated
  using (exists (select 1 from public.boats b where b.id = boat_images.boat_id
                 and (public.has_company_permission(b.company_id, 'edit_boats') or public.is_admin())));

-- maintenance records and hours
alter policy "maint_read_own_or_admin" on public.boat_maintenance_records
  using ((boat_id in (select public.my_boat_ids())) or (select public.is_admin()));

alter policy "hours_read_own_or_admin" on public.boat_operating_hours
  using ((boat_id in (select public.my_boat_ids())) or (select public.is_admin()));

-- Maintenance notifications are about a boat, so the whole team sees them. They
-- were addressed to recipient_id (the accountable owner); reading by recipient
-- alone would let a member who has left keep reading alerts about the fleet.
-- Dismissing one hides it for the whole team, so it needs complete_maintenance
-- (manager or owner); staff see them but cannot clear them.
alter policy "notif_read_own" on public.maintenance_notifications
  using ((boat_id in (select public.my_boat_ids())) or (select public.is_admin()));

alter policy "notif_update_own" on public.maintenance_notifications
  using (public.has_boat_permission(boat_id, 'complete_maintenance'))
  with check (public.has_boat_permission(boat_id, 'complete_maintenance'));

-- approval logs
alter policy "approval_logs_read" on public.admin_approval_logs
  using ((select public.is_admin()) or (boat_id in (select public.my_boat_ids())));

-- bookings: only the owner branch of bookings_read_involved changes.
alter policy "bookings_read_involved" on public.bookings
  using (
    (tourist_id = (select auth.uid()))
    or (select public.is_admin())
    or (boat_id in (select public.my_boat_ids()))
    or (hotel_id = (select profiles.hotel_id from public.profiles where profiles.id = (select auth.uid())))
    or (agency_id = (select profiles.agency_id from public.profiles where profiles.id = (select auth.uid())))
  );

-- Inert (authenticated has no UPDATE on bookings; every change is an RPC). Kept
-- consistent for the same reason as boats_update_own.
alter policy "bookings_update_involved" on public.bookings
  using ((select public.is_admin())
         or public.has_boat_permission(boat_id, 'manage_bookings')
         or (tourist_id = (select auth.uid())))
  with check ((select public.is_admin())
              or public.has_boat_permission(boat_id, 'manage_bookings')
              or (tourist_id = (select auth.uid())));

-- reviews: a hidden review is visible to every member of the boat's team.
alter policy "reviews_read_visible_or_involved" on public.reviews
  using (
    (not hidden)
    or (tourist_id = (select auth.uid()))
    or (select public.is_admin())
    or (boat_id in (select public.my_boat_ids()))
  );

-- captains: the roster belongs to the team. Everyone on it can read it (staff assign
-- captains); owners and managers maintain it.
drop policy if exists "captains_owner_all" on public.captains;
create policy "captains_read_member" on public.captains
  for select to authenticated
  using (company_id in (select public.my_company_ids()));
create policy "captains_insert_manager" on public.captains
  for insert to authenticated
  with check (public.has_company_permission(company_id, 'manage_captains'));
create policy "captains_update_manager" on public.captains
  for update to authenticated
  using (public.has_company_permission(company_id, 'manage_captains'))
  with check (public.has_company_permission(company_id, 'manage_captains'));
create policy "captains_delete_manager" on public.captains
  for delete to authenticated
  using (public.has_company_permission(company_id, 'manage_captains'));

-- authenticated held arwd table-wide on captains (37 P2-b). Take the writes back and
-- hand back only what the client sends. owner_id and company_id are stamped by the
-- trigger below on insert and never change.
revoke insert, update on public.captains from authenticated;
revoke all on public.captains from anon;
grant insert (owner_id, company_id, name, phone) on public.captains to authenticated;
grant update (name, phone) on public.captains to authenticated;

create or replace function public.stamp_captain_company()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.owner_id := auth.uid();
    if new.company_id is null then
      new.company_id := public.current_user_company();
    end if;
    return new;
  end if;
  if new.company_id is distinct from old.company_id
     or new.owner_id is distinct from old.owner_id then
    raise exception 'A captain cannot be moved to another team.';
  end if;
  return new;
end; $$;

revoke all on function public.stamp_captain_company() from public, anon, authenticated;

drop trigger if exists captains_stamp_company on public.captains;
create trigger captains_stamp_company
before insert or update on public.captains
for each row execute function public.stamp_captain_company();

-- verification documents. Company proofs are the team's: members read them, owners
-- and managers file and tidy them. A user's own account-level documents (company_id
-- null, 23) keep their old rule. A member who leaves stops seeing the company's
-- documents, including the ones they uploaded.
alter policy "vdocs_select_own_or_admin" on public.verification_documents
  using (
    ((user_id = (select auth.uid())) and company_id is null)
    or ((company_id is not null) and public.is_company_member(company_id))
    or public.is_admin()
  );

alter policy "vdocs_insert_own" on public.verification_documents
  with check (
    (user_id = auth.uid())
    and ((company_id is null) or public.has_company_permission(company_id, 'manage_documents'))
  );

alter policy "vdocs_delete_own" on public.verification_documents
  using (
    ((user_id = auth.uid()) and (review_status <> 'approved'::text)
     and ((company_id is null) or public.has_company_permission(company_id, 'manage_documents')))
    or public.is_admin()
  );

alter policy "vdocs_update_admin_or_owner" on public.verification_documents
  using (
    ((user_id = auth.uid())
     and ((company_id is null) or public.has_company_permission(company_id, 'manage_documents')))
    or public.is_admin()
  )
  with check (
    ((user_id = auth.uid())
     and ((company_id is null) or public.has_company_permission(company_id, 'manage_documents')))
    or public.is_admin()
  );

-- registration-docs bucket: files stay under the uploader's own folder (regdocs_*_own,
-- unchanged), so a co-owner could not open a proof a manager uploaded. This lets any
-- member of the document's company read it, which is what the company page's View
-- button needs. Definer helper for the 28e reason: a subquery in a storage policy
-- runs under the caller's own row visibility.
create or replace function public.registration_object_company_visible(p_object_name text)
returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.verification_documents d
     where d.storage_path = p_object_name
       and d.company_id is not null
       and public.is_company_member(d.company_id)
  );
$$;

revoke all on function public.registration_object_company_visible(text) from public, anon;
grant execute on function public.registration_object_company_visible(text) to authenticated;

drop policy if exists "regdocs_select_company" on storage.objects;
create policy "regdocs_select_company" on storage.objects
  for select to authenticated
  using (bucket_id = 'registration-docs' and public.registration_object_company_visible(name));

-- boat-images bucket. Upload: still into the uploader's own folder, now for any boat
-- the uploader may edit. Delete: an editor of the boat in the path's second segment,
-- or an admin. The old "your own folder" branch is replaced rather than kept beside
-- it: it would let a member who has left delete photos still shown on a team boat.
-- Every object in this bucket is written as {uploader}/{boat_id}/{file}.
alter policy "storage_boat_images_insert_own" on storage.objects
  with check (
    (bucket_id = 'boat-images'::text)
    and ((storage.foldername(name))[1] = (auth.uid())::text)
    and (exists (select 1 from public.boats b
                  where (b.id)::text = (storage.foldername(objects.name))[2]
                    and public.has_company_permission(b.company_id, 'edit_boats')))
  );

alter policy "storage_boat_images_delete_own" on storage.objects
  using (
    (bucket_id = 'boat-images'::text)
    and (public.is_admin()
         or exists (select 1 from public.boats b
                     where (b.id)::text = (storage.foldername(objects.name))[2]
                       and public.has_company_permission(b.company_id, 'edit_boats')))
  );

-- 7. Boat creation ------------------------------------------------------------------
-- Live definition (28c) for company_id, plus: who created the boat, and who is
-- accountable for it. The accountable owner is the team's longest-standing owner,
-- whoever registers the boat: owner_id is what public_boats shows as the operator
-- (operator_name, operator_phone) and what the submit gate checks, so it must be an
-- owner, never a manager or staff member. For an individual or a one-owner team that
-- is the caller, exactly as before.
create or replace function public.stamp_boat_company()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_accountable uuid;
begin
  if new.company_id is null then
    new.company_id := (
      select company_id from public.company_members
      where profile_id = coalesce(new.owner_id, auth.uid())
      order by added_at
      limit 1
    );
  elsif not (public.is_company_member(new.company_id) or public.is_admin()) then
    raise exception 'You cannot create a boat for another company';
  end if;

  new.created_by := coalesce(auth.uid(), new.created_by, new.owner_id);

  if new.company_id is not null then
    v_accountable := public.company_first_owner(new.company_id);
    if v_accountable is not null then
      new.owner_id := v_accountable;
    end if;
  end if;
  return new;
end; $$;

-- 8. Owner RPCs ---------------------------------------------------------------------
-- Live definitions. In each, the `owner_id ... auth.uid()` test becomes a
-- permission test from the matrix; a member whose role is too low gets a message
-- that says so (team_role_denied), anyone else keeps the original message.

create or replace function public.propose_boat_changes(p_boat_id uuid, p_changes jsonb)
 returns boats
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
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

-- Besides the ownership test, the verification gate now reads the boat's
-- accountable owner instead of the caller (ADR-002, verification and trust): a
-- manager's own profile verification does not matter; the account that holds the
-- boat must be verified, as before. For an individual the two are the same person
-- and the message is unchanged.
create or replace function public.submit_boat_for_review(p_boat_id uuid)
 returns boats
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare v_boat public.boats;
begin
  if public.has_outstanding_required_consent() then raise exception 'Consent required'; end if;
  select * into v_boat from public.boats where id = p_boat_id;
  if not found then raise exception 'Boat not found'; end if;
  if not public.has_company_permission(v_boat.company_id, 'edit_boats') then
    if public.is_company_member(v_boat.company_id) then
      raise exception '%', public.team_role_denied('edit_boats', 'submit a boat for review');
    end if;
    raise exception 'Not your boat';
  end if;
  if (select verification_status from public.profiles where id = v_boat.owner_id) <> 'verified' then
    if v_boat.owner_id = auth.uid() then
      raise exception 'Your owner account is pending verification. An admin will review it before your boats can go live.';
    end if;
    raise exception 'The owner account that holds this boat is pending verification. An admin will review it before your boats can go live.';
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

create or replace function public.soft_delete_boat(p_boat_id uuid)
 returns boats
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare v_boat public.boats; v_active int;
begin
  if public.has_outstanding_required_consent() then raise exception 'Consent required'; end if;
  select * into v_boat from public.boats where id = p_boat_id;
  if not found then raise exception 'Boat not found'; end if;
  if not public.has_company_permission(v_boat.company_id, 'delete_boats') then
    if public.is_company_member(v_boat.company_id) then
      raise exception '%', public.team_role_denied('delete_boats', 'delete a boat');
    end if;
    raise exception 'Not your boat';
  end if;
  select count(*) into v_active from public.bookings
  where boat_id = p_boat_id and status in ('requested','confirmed','deposit_paid') and start_date >= current_date;
  if v_active > 0 then
    raise exception 'This boat has % upcoming booking(s). Cancel or complete them before deleting, or set the boat to unavailable instead.', v_active;
  end if;
  update public.boats set is_deleted = true, deleted_at = now(), is_active = false
  where id = p_boat_id returning * into v_boat;
  return v_boat;
end; $function$;

create or replace function public.log_operating_hours(p_boat_id uuid, p_hours numeric, p_note text default null::text, p_booking_id uuid default null::uuid)
 returns boats
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare v_boat public.boats; v_status_before text; v_new_total numeric(10,1);
begin
  if public.has_outstanding_required_consent() then raise exception 'Consent required'; end if;
  select * into v_boat from public.boats where id = p_boat_id for update;
  if not found then raise exception 'Boat not found'; end if;
  if not public.has_company_permission(v_boat.company_id, 'log_hours') then
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

-- Unchanged apart from the boat test: a member may still correct only an entry they
-- logged themselves, within 24 hours and before a service. An admin corrects any.
create or replace function public.void_operating_hours(p_entry_id uuid, p_reason text)
 returns boats
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
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
    if not public.has_company_permission(v_boat.company_id, 'log_hours') then
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

create or replace function public.complete_maintenance(p_boat_id uuid, p_description text, p_performed_at date default current_date, p_cost numeric default null::numeric, p_service_provider text default null::text)
 returns boats
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare v_boat public.boats;
begin
  if public.has_outstanding_required_consent() then raise exception 'Consent required'; end if;
  select * into v_boat from public.boats where id = p_boat_id for update;
  if not found then raise exception 'Boat not found'; end if;
  if not public.has_company_permission(v_boat.company_id, 'complete_maintenance') then
    if public.is_company_member(v_boat.company_id) then
      raise exception '%', public.team_role_denied('complete_maintenance', 'record a completed service');
    end if;
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

create or replace function public.owner_set_booking_status(p_booking_id uuid, p_status booking_status, p_seen_guest_change timestamp with time zone default null::timestamp with time zone)
 returns bookings
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
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
  v_ok := case v_booking.status
    when 'requested' then p_status in ('confirmed','declined','cancelled')
    when 'confirmed' then p_status in ('deposit_paid','completed','cancelled')
    when 'deposit_paid' then p_status in ('completed','cancelled')
    else false end;
  if not v_ok then raise exception 'Cannot change a % booking to %', v_booking.status, p_status; end if;
  update public.bookings set status = p_status where id = p_booking_id returning * into v_booking;
  return v_booking;
end; $function$;

-- The captain must be on the roster of the boat's own team (previously: added by the
-- caller). Staff may assign captains: dispatching the crew is day-to-day work.
create or replace function public.assign_captain(p_booking_id uuid, p_captain_id uuid)
 returns bookings
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare v_booking public.bookings; v_company uuid; v_captain public.captains;
begin
  if public.has_outstanding_required_consent() then raise exception 'Consent required'; end if;
  select * into v_booking from public.bookings where id = p_booking_id;
  if not found then raise exception 'Booking not found'; end if;
  select company_id into v_company from public.boats where id = v_booking.boat_id;
  if not public.has_company_permission(v_company, 'assign_captains') then
    raise exception 'Only the boat owner can assign a captain';
  end if;
  if v_booking.status not in ('confirmed','deposit_paid','completed') then
    raise exception 'Confirm the booking before assigning a captain';
  end if;
  select * into v_captain from public.captains where id = p_captain_id;
  if not found or v_captain.company_id is distinct from v_company then
    raise exception 'That captain is not on your roster';
  end if;
  update public.bookings set captain_name = v_captain.name, captain_phone = v_captain.phone
  where id = p_booking_id returning * into v_booking;
  return v_booking;
end; $function$;

-- Only the operator branch changes: an owner or manager of the boat's team.
create or replace function public.cancel_booking(p_booking_id uuid)
 returns bookings
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare v_booking public.bookings; v_hotel uuid; v_agency uuid;
begin
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found then raise exception 'Booking not found'; end if;
  select p.hotel_id, p.agency_id into v_hotel, v_agency from public.profiles p where p.id = auth.uid();
  if v_booking.tourist_id is distinct from auth.uid()
     and not public.has_boat_permission(v_booking.boat_id, 'manage_bookings')
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

create or replace function public.reply_to_review(p_review_id uuid, p_reply text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_review public.reviews;
  v_reply text := nullif(btrim(coalesce(p_reply, '')), '');
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if public.has_outstanding_required_consent() then raise exception 'Consent required'; end if;
  select * into v_review from public.reviews where id = p_review_id for update;
  if not found then raise exception 'Review not found'; end if;
  if not public.has_boat_permission(v_review.boat_id, 'reply_reviews') then
    if public.has_boat_permission(v_review.boat_id, 'view') then
      raise exception '%', public.team_role_denied('reply_reviews', 'reply to reviews');
    end if;
    raise exception 'Only the boat''s operator can reply to its reviews';
  end if;
  if v_reply is not null and length(v_reply) > 1000 then
    raise exception 'A reply can be at most 1000 characters';
  end if;
  update public.reviews set operator_response = v_reply where id = p_review_id;
end; $function$;

-- Live definition (32); only the reply test changes, to the same permission as
-- reply_to_review, so the trigger and the RPC can never disagree.
create or replace function public.guard_review_write()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
begin
  if auth.uid() is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.operator_response := null;
    new.operator_responded_at := null;
    new.hidden := false;
    new.hidden_reason := null;
    new.hidden_by := null;
    new.hidden_at := null;
    new.created_at := now();
    return new;
  end if;

  if new.id is distinct from old.id
     or new.rating is distinct from old.rating
     or new.comment is distinct from old.comment
     or new.rating_condition is distinct from old.rating_condition
     or new.rating_crew is distinct from old.rating_crew
     or new.rating_value is distinct from old.rating_value
     or new.rating_safety is distinct from old.rating_safety
     or new.tourist_id is distinct from old.tourist_id
     or new.booking_id is distinct from old.booking_id
     or new.boat_id is distinct from old.boat_id
     or new.created_at is distinct from old.created_at
     or new.reviewer_name is distinct from old.reviewer_name
     or new.trip_month is distinct from old.trip_month then
    raise exception 'A review''s rating and text belong to the guest who wrote it and cannot be changed.';
  end if;

  if new.operator_response is distinct from old.operator_response
     or new.operator_responded_at is distinct from old.operator_responded_at then
    if not public.has_boat_permission(old.boat_id, 'reply_reviews') then
      raise exception 'Only the boat''s operator can reply to its reviews';
    end if;
    new.operator_response := nullif(btrim(coalesce(new.operator_response, '')), '');
    if new.operator_response is distinct from old.operator_response then
      new.operator_responded_at := case when new.operator_response is null then null else now() end;
    else
      new.operator_responded_at := old.operator_responded_at;
    end if;
  end if;

  if new.hidden is distinct from old.hidden
     or new.hidden_reason is distinct from old.hidden_reason
     or new.hidden_by is distinct from old.hidden_by
     or new.hidden_at is distinct from old.hidden_at then
    if not public.is_admin() then
      raise exception 'Only an administrator can hide or restore a review';
    end if;
    if new.hidden then
      new.hidden_by := auth.uid();
      new.hidden_at := now();
    else
      new.hidden_reason := null;
      new.hidden_by := null;
      new.hidden_at := null;
    end if;
  end if;

  return new;
end; $function$;

-- 9. Membership RPCs ----------------------------------------------------------------
-- Every one locks the company row first (FOR UPDATE), so two owners demoting or
-- removing each other at the same moment are serialised and the last-owner guard
-- sees the other's committed change.

-- Raises unless at least one owner other than p_profile_id would remain.
create or replace function public.assert_not_last_owner(p_company_id uuid, p_profile_id uuid, p_message text)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if exists (select 1 from public.company_members
              where company_id = p_company_id and profile_id = p_profile_id and member_role = 'owner')
     and public.company_first_owner(p_company_id, p_profile_id) is null then
    raise exception '%', p_message;
  end if;
end; $$;

revoke all on function public.assert_not_last_owner(uuid, uuid, text) from public, anon, authenticated;

-- Boats are held by an owner. When p_from stops being an owner of the team (demoted,
-- removed, left), the boats they hold pass to the longest-standing other owner. The
-- last-owner guard runs first, so there always is one. Captains stay where they are:
-- captains.owner_id records who added them, and the roster belongs to the team.
create or replace function public.hand_over_boats(p_company_id uuid, p_from uuid)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_to uuid := public.company_first_owner(p_company_id, p_from);
begin
  if v_to is null then return; end if;
  update public.boats set owner_id = v_to
   where company_id = p_company_id and owner_id = p_from;
end; $$;

revoke all on function public.hand_over_boats(uuid, uuid) from public, anon, authenticated;

-- The team, for the company page. Every member sees names and roles; e-mail
-- addresses are shown to owners (who manage the team) and to each member for
-- themselves.
create or replace function public.list_company_members(p_company_id uuid)
returns table (
  profile_id uuid, full_name text, email text,
  member_role public.company_member_role, added_at timestamptz, is_self boolean
)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid(); v_can_manage boolean;
begin
  if v_uid is null then raise exception 'Sign in to see your team.'; end if;
  if not (public.is_company_member(p_company_id) or public.is_admin()) then
    raise exception 'You are not on this team.';
  end if;
  v_can_manage := public.has_company_permission(p_company_id, 'manage_members') or public.is_admin();
  return query
    select cm.profile_id,
           coalesce(nullif(btrim(p.full_name), ''), 'Unnamed member'),
           case when v_can_manage or cm.profile_id = v_uid then u.email::text end,
           cm.member_role, cm.added_at, cm.profile_id = v_uid
      from public.company_members cm
      join public.profiles p on p.id = cm.profile_id
      left join auth.users u on u.id = cm.profile_id
     where cm.company_id = p_company_id
     order by public.company_role_rank(cm.member_role) desc, cm.added_at, cm.profile_id;
end; $$;

revoke all on function public.list_company_members(uuid) from public, anon;
grant execute on function public.list_company_members(uuid) to authenticated;

-- Adds an existing operator account (profile role 'owner') by e-mail. Hotel,
-- agency, tourist and admin accounts cannot be added: roles change only through a
-- super administrator, and an operator account goes through operator signup and the
-- operator agreement. The person's own empty workspace (signup gives every operator
-- one) is dissolved; a workspace with boats, documents, captains or other members is
-- not, and the add is refused.
create or replace function public.add_company_member(
  p_company_id uuid, p_email text, p_role public.company_member_role default 'staff'
) returns public.company_members
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_company public.companies;
  v_target uuid;
  v_profile public.profiles;
  v_old_company uuid;
  v_member public.company_members;
  v_not_found constant text :=
    'We could not find a boat operator account with that email. Ask them to sign up as a boat operator with this address, then add them again.';
begin
  if v_uid is null then raise exception 'Sign in to manage your team.'; end if;
  if public.has_outstanding_required_consent() then raise exception 'Consent required'; end if;

  select * into v_company from public.companies where id = p_company_id for update;
  if not found then raise exception 'Company not found'; end if;
  if not public.has_company_permission(p_company_id, 'manage_members') then
    raise exception 'Only a team owner can add team members.';
  end if;
  if v_company.operator_type = 'individual' then
    raise exception 'An individual operator works alone. Switch your account to a company to add team members.';
  end if;
  if p_role is null then raise exception 'Choose a role for the new member.'; end if;
  if coalesce(btrim(p_email), '') = '' then raise exception 'Enter their email address.'; end if;

  select u.id into v_target from auth.users u where lower(u.email) = lower(btrim(p_email)) limit 1;
  if v_target is null then raise exception '%', v_not_found; end if;

  -- One message for "no account", "not an operator" and "closing their account", so
  -- this cannot be used to learn which e-mail addresses belong to tourists.
  select * into v_profile from public.profiles where id = v_target for update;
  if not found or v_profile.role <> 'owner' or v_profile.purged_at is not null
     or v_profile.deletion_requested_at is not null then
    raise exception '%', v_not_found;
  end if;

  if v_target = v_uid then raise exception 'You are already on this team.'; end if;

  select cm.company_id into v_old_company from public.company_members cm where cm.profile_id = v_target;
  if v_old_company = p_company_id then
    raise exception 'That person is already on your team.';
  end if;
  if v_old_company is not null then
    perform 1 from public.companies where id = v_old_company for update;
    if exists (select 1 from public.company_members where company_id = v_old_company and profile_id <> v_target)
       or exists (select 1 from public.boats where company_id = v_old_company)
       or exists (select 1 from public.verification_documents where company_id = v_old_company)
       or exists (select 1 from public.captains where company_id = v_old_company) then
      raise exception 'That person already runs their own operator workspace with boats, documents, captains or team members. They need to close it, or leave their team, before they can join yours.';
    end if;
    -- Empty: their signup workspace. Cascades to the membership row; audited.
    delete from public.companies where id = v_old_company;
  end if;

  insert into public.company_members (company_id, profile_id, member_role)
  values (p_company_id, v_target, p_role)
  returning * into v_member;
  return v_member;
end; $$;

revoke all on function public.add_company_member(uuid, text, public.company_member_role) from public, anon;
grant execute on function public.add_company_member(uuid, text, public.company_member_role) to authenticated;

create or replace function public.set_company_member_role(
  p_company_id uuid, p_profile_id uuid, p_role public.company_member_role
) returns public.company_members
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid(); v_member public.company_members;
begin
  if v_uid is null then raise exception 'Sign in to manage your team.'; end if;
  if public.has_outstanding_required_consent() then raise exception 'Consent required'; end if;
  perform 1 from public.companies where id = p_company_id for update;
  if not found then raise exception 'Company not found'; end if;
  if not public.has_company_permission(p_company_id, 'manage_members') then
    raise exception 'Only a team owner can change roles.';
  end if;
  if p_role is null then raise exception 'Choose a role.'; end if;

  select * into v_member from public.company_members
   where company_id = p_company_id and profile_id = p_profile_id for update;
  if not found then raise exception 'That person is not on this team.'; end if;
  if v_member.member_role = p_role then return v_member; end if;

  if v_member.member_role = 'owner' then
    perform public.assert_not_last_owner(p_company_id, p_profile_id,
      case when p_profile_id = v_uid
        then 'You are the only owner. Make another member an owner before you change your own role.'
        else 'This team must always have an owner. Make another member an owner first.' end);
    perform public.hand_over_boats(p_company_id, p_profile_id);
  end if;

  update public.company_members set member_role = p_role
   where company_id = p_company_id and profile_id = p_profile_id
  returning * into v_member;
  return v_member;
end; $$;

revoke all on function public.set_company_member_role(uuid, uuid, public.company_member_role) from public, anon;
grant execute on function public.set_company_member_role(uuid, uuid, public.company_member_role) to authenticated;

-- What happens to the person's work (ADR-002, membership flow): boats they held pass
-- to another owner; captains they added, hours they logged, services they recorded,
-- documents they filed and replies they wrote stay with the team, attributed to
-- them. They lose access at once and get a fresh, empty individual workspace.
create or replace function public.remove_company_member(p_company_id uuid, p_profile_id uuid)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Sign in to manage your team.'; end if;
  if public.has_outstanding_required_consent() then raise exception 'Consent required'; end if;
  perform 1 from public.companies where id = p_company_id for update;
  if not found then raise exception 'Company not found'; end if;
  if p_profile_id = v_uid then
    raise exception 'To remove yourself, use Leave team.';
  end if;
  if not public.has_company_permission(p_company_id, 'manage_members') then
    raise exception 'Only a team owner can remove team members.';
  end if;
  if not exists (select 1 from public.company_members
                  where company_id = p_company_id and profile_id = p_profile_id) then
    raise exception 'That person is not on this team.';
  end if;

  perform public.assert_not_last_owner(p_company_id, p_profile_id,
    'This team must always have an owner. Make another member an owner first.');
  perform public.hand_over_boats(p_company_id, p_profile_id);
  delete from public.company_members where company_id = p_company_id and profile_id = p_profile_id;
  perform public.create_personal_workspace(p_profile_id);
end; $$;

revoke all on function public.remove_company_member(uuid, uuid) from public, anon;
grant execute on function public.remove_company_member(uuid, uuid) to authenticated;

-- No consent check: leaving must always be possible.
create or replace function public.leave_company(p_company_id uuid)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Sign in to manage your team.'; end if;
  perform 1 from public.companies where id = p_company_id for update;
  if not found then raise exception 'Company not found'; end if;
  if not exists (select 1 from public.company_members where company_id = p_company_id and profile_id = v_uid) then
    raise exception 'You are not on this team.';
  end if;
  if not exists (select 1 from public.company_members where company_id = p_company_id and profile_id <> v_uid) then
    raise exception 'You are the only member of this workspace, so there is no team to leave. To stop operating, delete your boats or close your account.';
  end if;
  perform public.assert_not_last_owner(p_company_id, v_uid,
    'You are the only owner. Make another member an owner before you leave.');
  perform public.hand_over_boats(p_company_id, v_uid);
  delete from public.company_members where company_id = p_company_id and profile_id = v_uid;
  perform public.create_personal_workspace(v_uid);
end; $$;

revoke all on function public.leave_company(uuid) from public, anon;
grant execute on function public.leave_company(uuid) to authenticated;

-- Individual -> company. One way only: a company with one member that wants to be an
-- individual again asks an administrator (ADR-002). The registered name replaces the
-- workspace name. A verified individual goes back to review: a name change lapses it
-- through companies_lapse_on_identity_change (37), and in any case a company also
-- needs company_registration, which revalidate_company_verification (28e) checks.
create or replace function public.upgrade_to_company(
  p_company_id uuid, p_name text, p_registration_number text default null
) returns public.companies
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_company public.companies;
begin
  if auth.uid() is null then raise exception 'Sign in to manage your company.'; end if;
  if public.has_outstanding_required_consent() then raise exception 'Consent required'; end if;
  select * into v_company from public.companies where id = p_company_id for update;
  if not found then raise exception 'Company not found'; end if;
  if not public.has_company_permission(p_company_id, 'edit_company') then
    raise exception 'Only the account owner can change the operator type.';
  end if;
  if v_company.operator_type = 'company' then return v_company; end if;
  if coalesce(btrim(p_name), '') = '' then
    raise exception 'Enter the registered company name.';
  end if;

  perform set_config('app.operator_type_ctx', 'on', true);
  update public.companies set
    operator_type = 'company',
    name = btrim(p_name),
    registration_number = nullif(btrim(coalesce(p_registration_number, '')), '')
  where id = p_company_id;
  perform set_config('app.operator_type_ctx', 'off', true);

  perform public.revalidate_company_verification(p_company_id,
    'The operator changed from an individual to a company, so a company registration document is now required.');

  select * into v_company from public.companies where id = p_company_id;
  return v_company;
end; $$;

revoke all on function public.upgrade_to_company(uuid, text, text) from public, anon;
grant execute on function public.upgrade_to_company(uuid, text, text) to authenticated;

-- 10. Signup --------------------------------------------------------------------------
-- Live definition (28) plus operator_type from the signup metadata. Anything other
-- than 'individual' (including an older client that sends nothing) makes a company,
-- which is what every operator got before this migration.
create or replace function public.handle_new_user()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  requested text := coalesce(new.raw_user_meta_data->>'role', 'tourist');
  safe_role user_role;
  v_company_id uuid;
  v_type public.operator_type :=
    case new.raw_user_meta_data->>'operator_type'
      when 'individual' then 'individual'::public.operator_type
      else 'company'::public.operator_type
    end;
begin
  if requested in ('tourist','owner','hotel','agency') then safe_role := requested::user_role; else safe_role := 'tourist'; end if;

  insert into public.profiles (id, role, full_name, phone, business_name, verification_status)
  values (new.id, safe_role,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    new.raw_user_meta_data->>'phone',
    new.raw_user_meta_data->>'business_name',
    case when safe_role in ('owner','hotel','agency') then 'pending'::verification_status else 'verified'::verification_status end);

  if safe_role = 'owner' then
    insert into public.companies (name, created_by, operator_type)
    values (
      coalesce(
        nullif(btrim(new.raw_user_meta_data->>'business_name'), ''),
        nullif(btrim(new.raw_user_meta_data->>'full_name'), ''),
        'Unnamed operator'
      ),
      new.id,
      v_type
    )
    returning id into v_company_id;

    insert into public.company_members (company_id, profile_id, member_role)
    values (v_company_id, new.id, 'owner');
  end if;

  return new;
end; $function$;

-- 11. Account deletion ----------------------------------------------------------------

-- Live definition (33) with the operator branch narrowed: a booking on a boat the
-- user holds only blocks their deletion when nobody on the team can take the boat
-- over. For an individual nobody can, so nothing changes for them.
create or replace function public.account_active_booking_count(p_user uuid)
 returns integer
 language sql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
  select count(*)::int
  from public.bookings b
  where b.status in ('requested', 'confirmed', 'deposit_paid')
    and b.start_date >= current_date
    and (b.tourist_id = p_user
         or exists (select 1 from public.boats bt
                     where bt.id = b.boat_id and bt.owner_id = p_user
                       and public.company_successor(bt.company_id, p_user) is null));
$function$;

-- Live definition (33). Changed: the boats and captains block. The rest is as it was.
--  * Boats the user holds pass to company_successor(): another owner if there is one,
--    otherwise the longest-serving manager, then staff, who is made an owner so the
--    team keeps one (a team is never left ownerless by a purge, and a deletion is
--    never blocked forever by a team). Previously only an existing 'owner' member
--    could take over. With no successor the boats leave the listing, as before.
--  * Captains the user added stay on the team's roster, re-attributed to the
--    successor (captains.owner_id is a NOT NULL, ON DELETE CASCADE reference, so
--    leaving it would delete them with the auth user). With no successor they are
--    deleted and the captain copies on finished trips cleared, as before; that now
--    covers only boats that were not handed over.
create or replace function public.purge_deleted_accounts(p_limit integer default 50)
 returns table(user_id uuid, outcome text)
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  r record;
  m record;
  v_uid uuid;
  v_booking_ids uuid[];
  v_operator_booking_ids uuid[];
  v_review_ids uuid[];
  v_captain_ids uuid[];
  v_doc_ids uuid[];
  v_company_ids uuid[];
  v_orphan_company_ids uuid[];
  v_boat_ids uuid[];
  v_retired_boat_ids uuid[];
  v_successor uuid;
  v_entities uuid[];
  v_auth_deleted boolean;
  v_pii_keys constant text[] := array[
    'full_name', 'phone', 'business_name', 'verification_note',
    'guest_name', 'guest_phone', 'notes', 'captain_name', 'captain_phone',
    'reviewer_name', 'name', 'file_name', 'storage_path', 'label',
    'contact_email', 'contact_phone', 'email'];
begin
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

      select coalesce(array_agg(b.id), '{}') into v_booking_ids
        from public.bookings b where b.tourist_id = v_uid;
      update public.bookings b
         set guest_name = 'Former guest', guest_phone = 'removed', notes = null, tourist_id = null
       where b.id = any(v_booking_ids);

      select coalesce(array_agg(rv.id), '{}') into v_review_ids
        from public.reviews rv where rv.tourist_id = v_uid;
      update public.reviews rv set reviewer_name = 'Former guest'
       where rv.id = any(v_review_ids);

      -- Boats and captains: hand over to the team, or take off the listing.
      select coalesce(array_agg(bt.id), '{}') into v_boat_ids
        from public.boats bt where bt.owner_id = v_uid;
      for m in select cm.company_id from public.company_members cm where cm.profile_id = v_uid loop
        v_successor := public.company_successor(m.company_id, v_uid);
        if v_successor is not null then
          update public.company_members cm set member_role = 'owner'
           where cm.company_id = m.company_id and cm.profile_id = v_successor
             and cm.member_role <> 'owner';
          update public.boats bt set owner_id = v_successor
           where bt.company_id = m.company_id and bt.owner_id = v_uid;
          update public.captains c set owner_id = v_successor
           where c.company_id = m.company_id and c.owner_id = v_uid;
        end if;
      end loop;
      update public.boats bt set is_active = false
       where bt.id = any(v_boat_ids) and bt.owner_id = v_uid and bt.is_active;
      select coalesce(array_agg(bt.id), '{}') into v_retired_boat_ids
        from public.boats bt where bt.id = any(v_boat_ids) and bt.owner_id = v_uid;

      select coalesce(array_agg(c.id), '{}') into v_captain_ids
        from public.captains c where c.owner_id = v_uid;
      select coalesce(array_agg(b.id), '{}') into v_operator_booking_ids
        from public.bookings b
       where b.boat_id = any(v_retired_boat_ids)
         and b.status in ('completed', 'cancelled', 'declined')
         and (b.captain_name is not null or b.captain_phone is not null);
      update public.bookings b
         set captain_name = null, captain_phone = null
       where b.id = any(v_operator_booking_ids);
      delete from public.captains c where c.id = any(v_captain_ids);

      select coalesce(array_agg(d.id), '{}') into v_doc_ids
        from public.verification_documents d where d.user_id = v_uid;
      insert into public.account_purge_storage_queue (user_id, bucket_id, object_name)
        select v_uid, 'registration-docs', d.storage_path
        from public.verification_documents d
        where d.id = any(v_doc_ids) and d.storage_path is not null;
      delete from public.verification_documents d where d.id = any(v_doc_ids);

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

      update public.profiles p
         set full_name = 'Deleted account', phone = null, business_name = null,
             verification_note = null, purged_at = now()
       where p.id = v_uid;

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
end; $function$;

-- Grants on the replaced functions are kept by CREATE OR REPLACE; restated for the
-- two that must never be callable by a client.
revoke all on function public.account_active_booking_count(uuid) from public, anon, authenticated;
grant execute on function public.account_active_booking_count(uuid) to service_role;
revoke all on function public.purge_deleted_accounts(integer) from public, anon, authenticated;
grant execute on function public.purge_deleted_accounts(integer) to service_role;

-- Trigger functions carry the default PUBLIC execute; nothing should hold it (the
-- trigger machinery needs no grant, 28e). handle_new_user is left as it is: it runs
-- on every signup through the auth service and is not worth any risk here.
revoke all on function public.stamp_boat_company() from public, anon, authenticated;
revoke all on function public.guard_company_privileges() from public, anon, authenticated;
revoke all on function public.guard_review_write() from public, anon, authenticated;

notify pgrst, 'reload schema';
