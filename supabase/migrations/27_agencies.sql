-- Subsystem B: travel agency portal. Agencies mirror hotels: a verified agency books on
-- behalf of tourists, attributed via bookings.agency_id. Agencies also browse and book like
-- tourists (that is just the public site for a logged-in user). The 'agency' enum value was
-- added in migration 26. Agency verification requires uploaded documents, like owners/hotels.

create table public.agencies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  location text not null,
  commission_rate numeric not null default 8,
  is_verified boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.profiles add column if not exists agency_id uuid references public.agencies(id);
alter table public.bookings add column if not exists agency_id uuid references public.agencies(id);
create index if not exists bookings_agency_idx on public.bookings (agency_id);

-- Let agency signups through the profile trigger (pending, like owners/hotels).
create or replace function public.handle_new_user()
 returns trigger language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare requested text := coalesce(new.raw_user_meta_data->>'role', 'tourist'); safe_role user_role;
begin
  if requested in ('tourist','owner','hotel','agency') then safe_role := requested::user_role; else safe_role := 'tourist'; end if;
  insert into public.profiles (id, role, full_name, phone, business_name, verification_status)
  values (new.id, safe_role,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    new.raw_user_meta_data->>'phone',
    new.raw_user_meta_data->>'business_name',
    case when safe_role in ('owner','hotel','agency') then 'pending'::verification_status else 'verified'::verification_status end);
  return new;
end; $function$;

-- Admin verifies an agency: requires documents, creates the agency, links and verifies.
create or replace function public.admin_verify_agency(p_user_id uuid, p_agency_name text, p_location text, p_commission numeric default 8, p_trust_score integer default 90)
 returns profiles language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare v_profile public.profiles; v_agency_id uuid;
begin
  if not public.is_admin() then raise exception 'Administrator only'; end if;
  if p_trust_score < 0 or p_trust_score > 100 then raise exception 'Trust score must be between 0 and 100'; end if;
  if not exists (select 1 from public.verification_documents where user_id = p_user_id) then
    raise exception 'This account has not uploaded any registration documents yet.';
  end if;
  insert into public.agencies (name, location, commission_rate, is_verified)
  values (p_agency_name, p_location, coalesce(p_commission, 8), true) returning id into v_agency_id;
  update public.profiles set
    agency_id = v_agency_id, verification_status = 'verified',
    trust_score = p_trust_score, verification_note = null,
    reviewed_by = auth.uid(), reviewed_at = now()
  where id = p_user_id returning * into v_profile;
  return v_profile;
end; $function$;
revoke all on function public.admin_verify_agency(uuid, text, text, numeric, integer) from public, anon;
grant execute on function public.admin_verify_agency(uuid, text, text, numeric, integer) to authenticated;

-- create_booking: attribute agency bookings. Server derives agency_id from the caller's
-- own profile, so it cannot be forged. Hotel bookings still use p_hotel_id.
create or replace function public.create_booking(
  p_boat_id uuid, p_guest_name text, p_guest_phone text,
  p_start_date date, p_days int, p_group_size int, p_experience_type text,
  p_price_total numeric, p_deposit_amount numeric, p_waiver_version int, p_waiver_accepted boolean,
  p_hotel_id uuid default null, p_start_time time default null,
  p_duration_hours numeric default null, p_notes text default null
) returns table(id uuid, deposit_amount numeric)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_id uuid; v_dep numeric; v_tourist uuid; v_agency uuid; v_doc public.legal_documents;
  v_boat public.boats; v_total numeric; v_hourly boolean; v_role text; v_caller_agency uuid;
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

  select role::text, agency_id into v_role, v_caller_agency from public.profiles where id = auth.uid();
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
    returning bookings.id, bookings.deposit_amount into v_id, v_dep;
  exception when exclusion_violation then
    raise exception 'That slot was just booked by someone else. Pick another time.';
  end;

  insert into public.consent_records (user_id, document_id, doc_type, version, context, booking_id, accepted)
  values (auth.uid(), v_doc.id, 'booking_waiver', p_waiver_version, 'booking', v_id, true);

  id := v_id; deposit_amount := v_dep; return next;
end; $$;

-- Agencies can read their own bookings.
drop policy if exists "bookings_read_involved" on public.bookings;
create policy "bookings_read_involved" on public.bookings
  for select to authenticated using (
    tourist_id = auth.uid()
    or public.is_admin()
    or exists (select 1 from public.boats b where b.id = bookings.boat_id and b.owner_id = auth.uid())
    or hotel_id = (select hotel_id from public.profiles where id = auth.uid())
    or agency_id = (select agency_id from public.profiles where id = auth.uid())
  );
