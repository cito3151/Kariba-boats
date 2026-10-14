-- Ratings and reviews: a public rating summary, per-category scores, one public
-- operator reply per review, and admin moderation (hide with a reason, unhide).
--
-- What this migration does, in order:
--  1. New columns on reviews: who wrote it and when they sailed (set by the
--     server, never by the client), four optional category scores, when the
--     operator replied, and the moderation fields.
--  2. is_boat_manager(boat): the boat's owner, or a member of the boat's company
--     (migration 28). The one test for "may reply to this boat's reviews".
--  3. guard_review_authenticity (INSERT) now also stamps reviewer_name and
--     trip_month from the booking and the guest's profile.
--  4. guard_review_write replaces 29's guard_review_immutability, on INSERT and
--     UPDATE: a new review always starts unreplied and visible; afterwards the
--     guest's rating, scores and text are frozen for everyone, only a boat
--     manager may change the reply, and only an admin may change the hidden fields.
--  5. Grants: every client write goes through the two RPCs in 7. The table-wide
--     grants are revoked first (28c / 29's Cause A), then INSERT is handed back on
--     the columns a guest writes, and UPDATE is not handed back at all.
--  6. Reads: anon sees visible reviews only; a signed-in user also sees a hidden
--     review they wrote, one on a boat they manage, or any review if they are an
--     admin, so the reviewer and the operator can see that it was hidden.
--  7. reply_to_review and admin_set_review_visibility.
--  8. boat_rating_summary: average, count, 5-to-1 distribution and category
--     averages per boat, over visible reviews only.
--  9. Backfill reviewer_name and trip_month for existing reviews.
--
-- The operator's reply keeps its existing column, operator_response (05), so
-- nothing already written is lost; operator_responded_at is new.

-- 1. Columns ---------------------------------------------------------------------

alter table public.reviews
  add column if not exists reviewer_name text,
  add column if not exists trip_month date,
  add column if not exists rating_condition smallint,
  add column if not exists rating_crew smallint,
  add column if not exists rating_value smallint,
  add column if not exists rating_safety smallint,
  add column if not exists operator_responded_at timestamptz,
  add column if not exists hidden boolean not null default false,
  add column if not exists hidden_reason text,
  add column if not exists hidden_by uuid references public.profiles(id),
  add column if not exists hidden_at timestamptz;

alter table public.reviews drop constraint if exists reviews_category_ratings_range;
alter table public.reviews add constraint reviews_category_ratings_range check (
  (rating_condition is null or rating_condition between 1 and 5)
  and (rating_crew is null or rating_crew between 1 and 5)
  and (rating_value is null or rating_value between 1 and 5)
  and (rating_safety is null or rating_safety between 1 and 5)
);

-- A hidden review always says why; a visible one carries no moderation residue.
alter table public.reviews drop constraint if exists reviews_hidden_consistent;
alter table public.reviews add constraint reviews_hidden_consistent check (
  (not hidden and hidden_reason is null and hidden_by is null and hidden_at is null)
  or (hidden and hidden_reason in ('abuse', 'personal_data', 'spam') and hidden_at is not null)
);

create index if not exists reviews_hidden_by_idx on public.reviews (hidden_by);

comment on column public.reviews.reviewer_name is
  'The guest''s first name only, copied from their profile by the server when the review is written. Shown publicly instead of the full name.';
comment on column public.reviews.trip_month is
  'First day of the month the reviewed trip started. Set by the server from the booking; the exact date is not published.';
comment on column public.reviews.operator_response is
  'The operator''s one public reply. Written only through reply_to_review by the boat''s owner or a member of its company; editable, never the review itself.';
comment on column public.reviews.hidden is
  'Hidden by an admin (admin_set_review_visibility). Hidden reviews are left out of public lists and averages; the reviewer and the operator still see them, marked hidden.';

-- 2. Who manages a boat ------------------------------------------------------------
-- Security definer so the read policy below can consult boats and company_members
-- without recursing through their own row level security, like is_company_member.
-- NULL-safe: with no auth.uid() both tests are false.

create or replace function public.is_boat_manager(p_boat_id uuid)
returns boolean language sql stable security definer
set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.boats b
    where b.id = p_boat_id
      and (
        b.owner_id = auth.uid()
        or (b.company_id is not null and public.is_company_member(b.company_id))
      )
  );
$$;

revoke all on function public.is_boat_manager(uuid) from public, anon, authenticated;
grant execute on function public.is_boat_manager(uuid) to authenticated;

-- 3. Authenticity on INSERT, now also stamping the display fields ------------------
-- Unchanged checks from 05: the booking exists, is completed, and is the caller's
-- (or the caller is an admin). New: the reviewer and trip month come from the
-- booking, so a client cannot attach a review to someone else's name or a
-- different month.

create or replace function public.guard_review_authenticity()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $$
declare v_booking public.bookings;
begin
  select * into v_booking from public.bookings where id = new.booking_id;
  if not found then raise exception 'Review must reference a real booking'; end if;
  if v_booking.status <> 'completed' then
    raise exception 'You can only review a trip after it is marked completed';
  end if;
  if v_booking.tourist_id is distinct from auth.uid() and not public.is_admin() then
    raise exception 'You can only review your own trip';
  end if;
  new.boat_id := v_booking.boat_id;
  new.tourist_id := coalesce(v_booking.tourist_id, new.tourist_id);
  new.trip_month := date_trunc('month', v_booking.start_date)::date;
  -- First name only, for privacy. NULL when the profile has no name; the
  -- interface then says "Guest".
  select left(nullif(split_part(btrim(coalesce(p.full_name, '')), ' ', 1), ''), 40)
    into new.reviewer_name
    from public.profiles p where p.id = new.tourist_id;
  return new;
end; $$;

-- 4. One guard for INSERT and UPDATE ------------------------------------------------

drop trigger if exists reviews_guard_immutability on public.reviews;
drop function if exists public.guard_review_immutability();

create or replace function public.guard_review_write()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $$
begin
  -- Trusted server callers (service role, migrations) have no end user and pass
  -- through, matching the 28c and 29 guards. anon holds no write grant here.
  if auth.uid() is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- A new review is the guest's alone: no reply, not hidden, stamped now.
    new.operator_response := null;
    new.operator_responded_at := null;
    new.hidden := false;
    new.hidden_reason := null;
    new.hidden_by := null;
    new.hidden_at := null;
    new.created_at := now();
    return new;
  end if;

  -- The guest's words, scores and provenance are frozen for everyone, admins
  -- included: moderation hides a review, it never rewrites one.
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

  -- The operator's reply: the boat's owner or a member of its company only.
  if new.operator_response is distinct from old.operator_response
     or new.operator_responded_at is distinct from old.operator_responded_at then
    if not public.is_boat_manager(old.boat_id) then
      raise exception 'Only the boat''s operator can reply to its reviews';
    end if;
    new.operator_response := nullif(btrim(coalesce(new.operator_response, '')), '');
    if new.operator_response is distinct from old.operator_response then
      new.operator_responded_at := case when new.operator_response is null then null else now() end;
    else
      new.operator_responded_at := old.operator_responded_at;
    end if;
  end if;

  -- Moderation: admins only, stamped by the server.
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
end; $$;

drop trigger if exists reviews_guard_write on public.reviews;
create trigger reviews_guard_write
before insert or update on public.reviews
for each row execute function public.guard_review_write();

-- 5. Grants -------------------------------------------------------------------------
-- Revoke the table-wide grants Supabase hands both roles by default before handing
-- back columns, or the column list means nothing (28c, 29). Verified live before
-- this migration: anon still held INSERT, UPDATE and DELETE on reviews, and
-- authenticated held INSERT on every column including operator_response. RLS was
-- the only thing in the way.

revoke all on public.reviews from anon, authenticated;
grant select on public.reviews to anon, authenticated;
grant insert (booking_id, boat_id, tourist_id, rating, comment,
              rating_condition, rating_crew, rating_value, rating_safety)
  on public.reviews to authenticated;
-- No UPDATE or DELETE for either role: replies and moderation go through the
-- security definer RPCs below, and a review is never deleted from the client.

drop policy if exists "reviews_update_owner_response" on public.reviews;

-- 6. Reads ------------------------------------------------------------------------
-- Two policies, one per role, so no role meets two permissive SELECT policies
-- (the 25b consolidation), and anon never evaluates is_boat_manager, which it
-- cannot execute.

drop policy if exists "reviews_read_all" on public.reviews;
drop policy if exists "reviews_read_visible" on public.reviews;
drop policy if exists "reviews_read_visible_or_involved" on public.reviews;

create policy "reviews_read_visible" on public.reviews
  for select to anon
  using (not hidden);

create policy "reviews_read_visible_or_involved" on public.reviews
  for select to authenticated
  using (
    not hidden
    or tourist_id = (select auth.uid())
    or (select public.is_admin())
    or public.is_boat_manager(boat_id)
  );

-- 7. RPCs -------------------------------------------------------------------------

-- The operator's one public reply. An empty reply removes it. The guard trigger
-- re-checks the caller and stamps operator_responded_at.
create or replace function public.reply_to_review(p_review_id uuid, p_reply text)
returns void language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_review public.reviews;
  v_reply text := nullif(btrim(coalesce(p_reply, '')), '');
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if public.has_outstanding_required_consent() then raise exception 'Consent required'; end if;
  select * into v_review from public.reviews where id = p_review_id for update;
  if not found then raise exception 'Review not found'; end if;
  if not public.is_boat_manager(v_review.boat_id) then
    raise exception 'Only the boat''s operator can reply to its reviews';
  end if;
  if v_reply is not null and length(v_reply) > 1000 then
    raise exception 'A reply can be at most 1000 characters';
  end if;
  update public.reviews set operator_response = v_reply where id = p_review_id;
end; $$;

-- Hide a review with a required reason, or restore it.
create or replace function public.admin_set_review_visibility(
  p_review_id uuid, p_hidden boolean, p_reason text default null
)
returns void language plpgsql security definer
set search_path = public, pg_temp as $$
begin
  if not public.is_admin() then
    raise exception 'Only an administrator can hide or restore a review';
  end if;
  if p_hidden and (p_reason is null or p_reason not in ('abuse', 'personal_data', 'spam')) then
    raise exception 'Choose why this review is being hidden: abuse, personal data or spam';
  end if;
  update public.reviews
     set hidden = p_hidden,
         hidden_reason = case when p_hidden then p_reason end,
         hidden_by = case when p_hidden then auth.uid() end,
         hidden_at = case when p_hidden then now() end
   where id = p_review_id;
  if not found then raise exception 'Review not found'; end if;
end; $$;

revoke all on function public.reply_to_review(uuid, text) from public, anon, authenticated;
revoke all on function public.admin_set_review_visibility(uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.reply_to_review(uuid, text) to authenticated;
grant execute on function public.admin_set_review_visibility(uuid, boolean, text) to authenticated;

-- 8. The public rating summary -----------------------------------------------------
-- security_invoker, so it reads through the caller's RLS rather than as the view
-- owner, and an explicit `not hidden`, so a signed-in operator or reviewer (who
-- can read their hidden rows) gets the same public figures as everyone else.
-- Boats with no visible review have no row; the interface shows "New".

create or replace view public.boat_rating_summary
with (security_invoker = true) as
select
  r.boat_id,
  count(*)::int                                   as review_count,
  round(avg(r.rating)::numeric, 2)                as average_rating,
  count(*) filter (where r.rating = 5)::int       as count_5,
  count(*) filter (where r.rating = 4)::int       as count_4,
  count(*) filter (where r.rating = 3)::int       as count_3,
  count(*) filter (where r.rating = 2)::int       as count_2,
  count(*) filter (where r.rating = 1)::int       as count_1,
  round(avg(r.rating_condition)::numeric, 2)      as avg_condition,
  round(avg(r.rating_crew)::numeric, 2)           as avg_crew,
  round(avg(r.rating_value)::numeric, 2)          as avg_value,
  round(avg(r.rating_safety)::numeric, 2)         as avg_safety
from public.reviews r
where not r.hidden
group by r.boat_id;

comment on view public.boat_rating_summary is
  'Per boat: count, average, 5-to-1 distribution and category averages over visible (not hidden) reviews only.';

revoke all on public.boat_rating_summary from anon, authenticated;
grant select on public.boat_rating_summary to anon, authenticated;

-- 9. Backfill ---------------------------------------------------------------------
-- Runs with no auth.uid(), so guard_review_write lets it through.

update public.reviews r
   set trip_month = date_trunc('month', b.start_date)::date
  from public.bookings b
 where b.id = r.booking_id and r.trip_month is null;

update public.reviews r
   set reviewer_name = left(nullif(split_part(btrim(coalesce(p.full_name, '')), ' ', 1), ''), 40)
  from public.profiles p
 where p.id = r.tourist_id and r.reviewer_name is null;

update public.reviews
   set operator_responded_at = created_at
 where operator_response is not null and operator_responded_at is null;
