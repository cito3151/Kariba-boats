-- A booking reference number for every booking, for tracking.
--
-- "Each and every time a person books the boat there should be a booking number
-- for tracking process." A booking's uuid is not something a guest can read out
-- over the phone, so every booking gets a short, human reference such as
-- KLC-7H3QXK: the prefix, then six characters from an alphabet with no 0/O, 1/I
-- or L, so it survives being read aloud, handwritten or typed from a WhatsApp
-- message. 31 symbols to the power of 6 is about 887 million references.
--
-- What this migration does, in order:
--  1. bookings.reference text, a format check and a unique index.
--  2. generate_booking_reference(): random, rejection-sampled, retried on collision.
--  3. Backfill every existing booking, then set the column NOT NULL.
--  4. One BEFORE INSERT OR UPDATE trigger: on INSERT it always assigns a fresh
--     reference (a client cannot choose its own); on UPDATE it rejects any change.
--  5. create_booking also returns the reference (drop and create, because the
--     return type changes). Arguments, body, security and grants are otherwise
--     exactly the live definition (pg_get_functiondef, same as 27b).
--  6. track_booking(reference, phone): a narrow public lookup for the /track page.
--
-- Reads. No grant or policy change is needed for the people who can already see
-- bookings: `authenticated` holds SELECT on bookings at table level (not per
-- column), so the new column is covered, and bookings_read_involved already decides
-- which rows each tourist, owner, admin, hotel and agency sees. anon also holds a
-- table-level SELECT, but no policy names anon, so RLS returns it nothing.

-- 1. The column ----------------------------------------------------------------

alter table public.bookings add column if not exists reference text;

alter table public.bookings drop constraint if exists bookings_reference_format;
alter table public.bookings add constraint bookings_reference_format
  check (reference ~ '^KLC-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$');

create unique index if not exists bookings_reference_key on public.bookings (reference);

comment on column public.bookings.reference is
  'Customer-facing booking reference, KLC- plus 6 characters (no 0/O/1/I/L). Assigned by the server on insert and never changed.';

-- 2. The generator --------------------------------------------------------------
-- gen_random_bytes is pgcrypto's CSPRNG (installed in the `extensions` schema).
-- Each byte below 248 maps onto the 31-symbol alphabet with byte % 31; bytes 248
-- to 255 are thrown away, because keeping them would make the first 8 symbols a
-- little likelier than the rest (248 = 31 * 8). The collision check is a probe
-- of the unique index. Two concurrent inserts drawing the same six characters in
-- the same instant would still be caught by the unique index, which fails one of
-- them; at 1 in ~887 million per pair that is left to the index.
--
-- SECURITY INVOKER, and nobody but the owner may execute it: it is only called
-- by the trigger function below (SECURITY DEFINER, so it runs as the owner and
-- its collision probe sees every booking, not just the caller's) and by the
-- backfill in this migration.

create or replace function public.generate_booking_reference()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_alphabet constant text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  v_code  text;
  v_bytes bytea;
  v_byte  int;
  i       int;
begin
  loop
    v_code := '';
    while length(v_code) < 6 loop
      v_bytes := extensions.gen_random_bytes(12);
      for i in 0 .. 11 loop
        v_byte := get_byte(v_bytes, i);
        if v_byte < 248 and length(v_code) < 6 then
          v_code := v_code || substr(v_alphabet, (v_byte % 31) + 1, 1);
        end if;
      end loop;
    end loop;
    v_code := 'KLC-' || v_code;
    exit when not exists (select 1 from public.bookings b where b.reference = v_code);
  end loop;
  return v_code;
end; $$;

revoke all on function public.generate_booking_reference() from public, anon, authenticated;

-- 3. Backfill -------------------------------------------------------------------
-- Row by row, so each generated reference is visible to the collision check of
-- the next one. Runs before the trigger exists, which would otherwise refuse the
-- change from NULL. The AFTER trigger audit_bookings logs each of these updates
-- (actor NULL), the same as any other migration-time change to bookings.

do $$
declare r record;
begin
  for r in select id from public.bookings where reference is null order by created_at loop
    update public.bookings set reference = public.generate_booking_reference() where id = r.id;
  end loop;
end $$;

alter table public.bookings alter column reference set not null;

-- 4. Assign on insert, immutable after ------------------------------------------
-- One trigger for both events, the shape the 28c/29 guards use. Unlike those
-- guards it has no `auth.uid() is null` exemption: a reference that has been
-- given to a guest must keep meaning the same booking, whoever is writing (a
-- service-role script included). The NOT NULL already stops it being cleared;
-- this stops it being swapped. A genuine correction needs a reviewed migration
-- that disables the trigger explicitly.

create or replace function public.guard_booking_reference()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    -- Always the server's own value: whatever the caller sent is discarded.
    new.reference := public.generate_booking_reference();
    return new;
  end if;

  if new.reference is distinct from old.reference then
    raise exception 'A booking reference cannot be changed once it has been issued.';
  end if;
  return new;
end; $$;

revoke all on function public.guard_booking_reference() from public, anon, authenticated;

drop trigger if exists bookings_guard_reference on public.bookings;
create trigger bookings_guard_reference
before insert or update on public.bookings
for each row execute function public.guard_booking_reference();

-- 5. create_booking returns the reference ----------------------------------------
-- The live definition (checked with pg_get_functiondef before writing this) is
-- 27b's. Only the RETURNS TABLE gains `reference text`, the RETURNING clause
-- fetches it (qualified, since `reference` is now also an OUT parameter name) and
-- it is assigned before `return next`. Live grants were EXECUTE for postgres,
-- authenticated and service_role only; dropping the function loses them, and a
-- new function gets PUBLIC (and, from this project's default privileges, anon)
-- EXECUTE, so both are revoked and the two roles granted back.

drop function if exists public.create_booking(
  uuid, text, text, date, integer, integer, text, numeric, numeric, integer, boolean,
  uuid, time without time zone, numeric, text
);

create function public.create_booking(
  p_boat_id uuid, p_guest_name text, p_guest_phone text,
  p_start_date date, p_days int, p_group_size int, p_experience_type text,
  p_price_total numeric, p_deposit_amount numeric, p_waiver_version int, p_waiver_accepted boolean,
  p_hotel_id uuid default null, p_start_time time default null,
  p_duration_hours numeric default null, p_notes text default null
) returns table(id uuid, deposit_amount numeric, reference text)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_id uuid; v_dep numeric; v_tourist uuid; v_agency uuid; v_doc public.legal_documents;
  v_boat public.boats; v_total numeric; v_hourly boolean; v_role text; v_caller_agency uuid;
  v_ref text;
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

  select b.* into v_boat from public.boats b where b.id = p_boat_id;
  if not found then raise exception 'Boat not found'; end if;

  v_hourly := p_start_time is not null and p_duration_hours is not null;
  if v_hourly then
    if v_boat.price_per_hour is null then raise exception 'This boat has no hourly rate.'; end if;
    v_total := v_boat.price_per_hour * p_duration_hours;
  else
    if v_boat.price_per_day is null then raise exception 'This boat has no daily rate.'; end if;
    if p_days is null or p_days < 1 then raise exception 'Choose at least one day.'; end if;
    v_total := v_boat.price_per_day * p_days;
  end if;
  v_dep := round(v_total * coalesce(v_boat.deposit_percent, 20) / 100);

  select p.role::text, p.agency_id into v_role, v_caller_agency from public.profiles p where p.id = auth.uid();
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
end; $$;

revoke all on function public.create_booking(
  uuid, text, text, date, integer, integer, text, numeric, numeric, integer, boolean,
  uuid, time without time zone, numeric, text
) from public, anon;
grant execute on function public.create_booking(
  uuid, text, text, date, integer, integer, text, numeric, numeric, integer, boolean,
  uuid, time without time zone, numeric, text
) to authenticated, service_role;

-- 6. track_booking ---------------------------------------------------------------
-- The public /track page: a guest types their reference and the phone number they
-- booked with, signed in or not, and sees where the booking stands.
--
-- What it returns: the reference, status, boat name and location, when, how
-- long, group size, total and deposit, and when it was made. Never the guest's
-- name or phone, notes, captain, or any user, hotel or agency id.
--
-- When it returns a row: only when BOTH match.
--  * The reference, case-insensitively and ignoring surrounding spaces (stored
--    references are upper case, so the input is upper-cased onto the unique index).
--  * The phone, compared on its last 9 digits after removing everything that is
--    not a digit (spaces, dashes, '+', brackets, dots), on both sides. So
--    "+263 77 123 4567", "263771234567" and "077-123-4567" all match each other.
--    9 digits is a Zimbabwean subscriber number without the 0 or 263 prefix.
--    Input with fewer than 9 digits never matches, so a short or empty phone
--    cannot match a short stored one.
-- Anything else, including a right reference with a wrong phone, returns no rows,
-- exactly like a reference that does not exist. The reference alone therefore
-- discloses nothing, not even that it exists.
--
-- Limits worth knowing: there is no rate limit in SQL. Guessing needs a valid
-- reference (1 in ~887 million) and the matching phone together, and a hit
-- reveals only trip logistics, but if abuse shows up, put a rate limit in front
-- of /rest/v1/rpc/track_booking (edge function or gateway).
--
-- Grants as in migration 30: revoke from PUBLIC, anon and authenticated first,
-- then grant back to exactly anon and authenticated.

create or replace function public.track_booking(p_reference text, p_phone text)
returns table (
  reference       text,
  status          public.booking_status,
  boat_name       text,
  boat_location   text,
  start_date      date,
  start_time      time,
  days            int,
  duration_hours  numeric,
  group_size      int,
  price_total     numeric,
  deposit_amount  numeric,
  created_at      timestamptz
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
         b.price_total, b.deposit_amount, b.created_at
  from input i
  join public.bookings b on b.reference = i.ref
  join public.boats bt on bt.id = b.boat_id
  where length(i.phone) >= 9
    and right(regexp_replace(b.guest_phone, '[^0-9]', '', 'g'), 9) = right(i.phone, 9)
  limit 1;
$$;

comment on function public.track_booking(text, text) is
  'Public booking tracker: given a booking reference and the phone it was booked with (last 9 digits), returns status and trip logistics only. No guest name, phone, notes or user ids. Returns nothing unless both match.';

revoke all on function public.track_booking(text, text) from public, anon, authenticated;
grant execute on function public.track_booking(text, text) to anon, authenticated;

-- PostgREST caches function signatures; create_booking's return shape changed.
notify pgrst, 'reload schema';
