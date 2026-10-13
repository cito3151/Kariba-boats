-- Let anyone who can see a boat see WHEN it is busy, without seeing WHO booked it.
--
-- The boat page draws an availability calendar from the bookings table. The only
-- read policy on that table, bookings_read_involved, shows a booking to the tourist
-- who made it, the hotel or agency that made it for a guest, the boat's owner and
-- admins. Correctly: a booking row carries a guest's name and phone.
--
-- The side effect is that a tourist reading `bookings` for somebody else's boat gets
-- zero rows. The calendar was built on that read, so for every tourist and every
-- logged-out visitor it drew every day as free, including days the database would
-- refuse to book. The EXCLUDE constraint bookings_no_overlap still catches a clash,
-- but only after the guest has filled in the form and pressed send, and the error
-- they then get ("That slot was just booked by someone else") reads as bad luck
-- instead of "the calendar was wrong". It also makes any date-range picker built on
-- the calendar useless: "booked days block the selection" blocks nothing when the
-- client cannot see which days are booked.
--
-- Fix: a narrow SECURITY DEFINER function. It runs as the table owner, so it can
-- read every booking of the one boat asked about, and it hands back only the columns
-- the calendar needs to place a block on a day: when it starts, how many days, and
-- for hourly trips which hours. No id, no guest name or phone, no price, no tourist,
-- hotel or agency id, no notes. The status is returned because the calendar labels a
-- not-yet-confirmed hold "awaiting confirmation"; the function only ever returns
-- the three statuses that block, so the value reveals nothing a block does not.
--
-- Why these rows and no others:
--  * status in ('requested','confirmed','deposit_paid') is the exact predicate of
--    bookings_no_overlap (migration 05) and BLOCKING_STATUSES in src/data/availability.ts.
--    A completed, declined or cancelled booking no longer holds the slot.
--  * Only boats in public_boats (approved, active, not deleted, maintenance not
--    overdue). That is the same set a tourist can open a page for, so the function
--    cannot be used to probe a draft, suspended or deleted boat: it returns nothing
--    for them, indistinguishable from a boat with no bookings.
--  * Only bookings that have not finished yet, judged on the Kariba calendar day
--    (Africa/Harare, CAT, no DST; the period column makes the same assumption). The
--    calendar never shows past days as bookable, so history has no reason to leave
--    the database.
--
-- Columns mirror bookings (start_date, days, start_time, duration_hours) on purpose.
-- The client already has bookingCoversDate / dayStatus / checkAvailability for rows
-- of exactly that shape, so the answer is not reinterpreted into a second format
-- that would need its own overlap maths.
--
-- Grants. Logged-out visitors browse boat pages, so anon needs this. Postgres gives
-- EXECUTE to PUBLIC on every new function, and `revoke ... from anon` alone does not
-- touch that (the mistake migration 28b had to clean up). So revoke from PUBLIC
-- first, name anon and authenticated in the revoke too so the result does not depend
-- on the project's default privileges, and then grant back to exactly the two roles.

create or replace function public.boat_busy_periods(p_boat_id uuid)
returns table (
  start_date     date,
  days           int,
  start_time     time,
  duration_hours numeric,
  status         public.booking_status
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select b.start_date, b.days, b.start_time, b.duration_hours, b.status
  from public.bookings b
  where b.boat_id = p_boat_id
    and b.status in ('requested', 'confirmed', 'deposit_paid')
    and b.start_date + b.days > (now() at time zone 'Africa/Harare')::date
    and exists (select 1 from public.public_boats pb where pb.id = p_boat_id)
  order by b.start_date, b.start_time nulls first;
$$;

comment on function public.boat_busy_periods(uuid) is
  'When a publicly visible boat is busy: start_date, days, start_time, duration_hours and status of its blocking, unfinished bookings. No ids, guest details, prices or user links. Feeds the availability calendar for people who cannot read bookings under RLS.';

revoke all on function public.boat_busy_periods(uuid) from public, anon, authenticated;
grant execute on function public.boat_busy_periods(uuid) to anon, authenticated;
