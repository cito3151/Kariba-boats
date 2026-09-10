-- Four confirmed critical write holes, each reproduced against the live database
-- before this migration was written. Three share one root cause with the bugs 28c
-- fixed: a guard trigger on UPDATE only, or a column grant issued without first
-- revoking the table-wide grant Supabase hands `authenticated` by default.

-- 1. `agencies` has no row level security at all ---------------------------------
-- 27_agencies.sql created the table and never enabled RLS, unlike every sibling.
-- Verified live: relrowsecurity = false, zero policies, and anon holds INSERT,
-- UPDATE and DELETE. Anyone with the public anon key could self-insert a verified
-- agency, rewrite every commission_rate, or empty the table. It reads as harmless
-- today only because no agency row exists yet.

alter table public.agencies enable row level security;

revoke all on public.agencies from anon, authenticated;
grant select on public.agencies to anon, authenticated;

-- Agencies are created and verified exclusively by admin_verify_agency, which is
-- security definer, so no client-side write policy is needed.
create policy "agencies_read_all" on public.agencies
  for select to anon, authenticated using (true);

create policy "agencies_write_admin" on public.agencies
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- 2. A boat could be INSERTed already approved -----------------------------------
-- guard_boat_privileges was BEFORE UPDATE only, so the whole approval workflow was
-- skippable with a single POST: an owner could insert status='approved',
-- is_active=true and approved_by pointing at a real admin, and the row went live to
-- tourists wearing the company's verified badge without ever entering the queue.
-- Reproduced live. This is exactly Cause B from 28c, which was fixed for companies
-- and verification_documents but not for boats.
--
-- The insert branch pins only the approval columns. An initial hours reading stays
-- writable on create, because recording an existing vessel's hours when first
-- listing it is legitimate and there is no history to protect yet.

create or replace function public.guard_boat_insert()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  -- Trusted server callers (service role, migrations, security definer RPCs that
  -- run with no end user) pass through, matching the 28c guards.
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;

  -- A new listing always starts as a draft awaiting the owner's own submission.
  new.status := 'draft';
  new.approved_at := null;
  new.approved_by := null;
  new.pending_changes := null;
  return new;
end; $$;

drop trigger if exists boats_guard_insert on public.boats;
create trigger boats_guard_insert
before insert on public.boats
for each row execute function public.guard_boat_insert();

-- 3. Any review on your own boat was rewritable ----------------------------------
-- `reviews_update_owner_response` exists so an operator can post a public reply.
-- But it had no WITH CHECK, and `authenticated` held UPDATE on every column, so the
-- USING clause ("I own this boat") authorised rewriting the tourist's own rating and
-- comment. Reproduced live: a 1-star "Engine failed mid-lake. Unsafe." became a
-- 5-star "Fantastic trip, highly recommend!". Every trust signal on the tourist side
-- was operator-writable, and BoatDetail recomputes the average from these rows.

revoke update on public.reviews from authenticated;
grant update (operator_response) on public.reviews to authenticated;

drop policy if exists "reviews_update_owner_response" on public.reviews;
create policy "reviews_update_owner_response" on public.reviews
  for update to authenticated
  using (
    public.is_admin()
    or exists (select 1 from public.boats b where b.id = boat_id and b.owner_id = auth.uid())
  )
  with check (
    public.is_admin()
    or exists (select 1 from public.boats b where b.id = boat_id and b.owner_id = auth.uid())
  );

-- Belt and braces, in the shape 28c established: the column grant is the first
-- line of defence, this is the second. guard_review_authenticity covers INSERT
-- only, so the UPDATE path needs its own guard.
create or replace function public.guard_review_immutability()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;
  if new.rating is distinct from old.rating
     or new.comment is distinct from old.comment
     or new.tourist_id is distinct from old.tourist_id
     or new.booking_id is distinct from old.booking_id
     or new.boat_id is distinct from old.boat_id
     or new.created_at is distinct from old.created_at then
    raise exception 'A review''s rating and text belong to the guest who wrote it. An operator may only add a response.';
  end if;
  return new;
end; $$;

drop trigger if exists reviews_guard_immutability on public.reviews;
create trigger reviews_guard_immutability
before update on public.reviews
for each row execute function public.guard_review_immutability();

-- 4. Owner-only RPCs were callable by anon, and their guard was NULL-blind --------
-- soft_delete_boat, submit_boat_for_review and propose_boat_changes each carry
-- PUBLIC EXECUTE (28b revoked it for the company functions only), and each guards
-- with `if v_boat.owner_id <> auth.uid() then raise`. For anon, auth.uid() is NULL,
-- so the comparison is NULL, the branch does not fire, and execution continues.
-- The only thing stopping an anonymous caller from soft-deleting any boat today is
-- an unrelated consent check that happens to reject NULL users. That is accidental
-- defence, not a control.

revoke all on function public.soft_delete_boat(uuid) from public, anon;
revoke all on function public.submit_boat_for_review(uuid) from public, anon;
revoke all on function public.propose_boat_changes(uuid, jsonb) from public, anon;

grant execute on function public.soft_delete_boat(uuid) to authenticated;
grant execute on function public.submit_boat_for_review(uuid) to authenticated;
grant execute on function public.propose_boat_changes(uuid, jsonb) to authenticated;

-- Make the ownership test NULL-safe as well, so the functions defend themselves
-- rather than relying on the grant alone.
create or replace function public.soft_delete_boat(p_boat_id uuid)
returns public.boats language plpgsql security definer set search_path = public, pg_temp as $$
declare v_boat public.boats; v_active int;
begin
  if public.has_outstanding_required_consent() then raise exception 'Consent required'; end if;
  select * into v_boat from public.boats where id = p_boat_id;
  if not found then raise exception 'Boat not found'; end if;
  -- `is distinct from` rather than `<>`: a NULL auth.uid() must fail this test, not
  -- skip it.
  if v_boat.owner_id is distinct from auth.uid() then raise exception 'Not your boat'; end if;
  select count(*) into v_active from public.bookings
  where boat_id = p_boat_id and status in ('requested','confirmed','deposit_paid') and start_date >= current_date;
  if v_active > 0 then
    raise exception 'This boat has % upcoming booking(s). Cancel or complete them before deleting, or set the boat to unavailable instead.', v_active;
  end if;
  update public.boats set is_deleted = true, deleted_at = now(), is_active = false
  where id = p_boat_id returning * into v_boat;
  return v_boat;
end; $$;
