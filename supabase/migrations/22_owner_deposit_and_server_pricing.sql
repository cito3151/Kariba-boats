-- Subsystem A: owner-configurable deposit and server-authoritative pricing.
-- Add boats.deposit_percent (floor 20). Rework create_booking to compute price_total
-- and deposit_amount on the server from the boat's own rates and deposit_percent,
-- ignoring the client-supplied amounts, so a booking cannot be created at a forged price.
-- The rate type is inferred (hourly when start_time + duration_hours are present, else
-- daily), matching the period column, so the signature is unchanged and this is a
-- backward-compatible body-only replace.

alter table public.boats
  add column if not exists deposit_percent numeric not null default 20
  check (deposit_percent >= 20 and deposit_percent <= 100);

create or replace function public.create_booking(
  p_boat_id uuid, p_guest_name text, p_guest_phone text,
  p_start_date date, p_days int, p_group_size int, p_experience_type text,
  p_price_total numeric, p_deposit_amount numeric, p_waiver_version int, p_waiver_accepted boolean,
  p_hotel_id uuid default null, p_start_time time default null,
  p_duration_hours numeric default null, p_notes text default null
) returns table(id uuid, deposit_amount numeric)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_id uuid; v_dep numeric; v_tourist uuid; v_doc public.legal_documents;
  v_boat public.boats; v_total numeric; v_hourly boolean;
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

  select * into v_boat from public.boats where id = p_boat_id;
  if not found then raise exception 'Boat not found'; end if;

  -- Ignore any client-supplied price; compute server-side from the boat's own rates.
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

  v_tourist := case when p_hotel_id is null then auth.uid() else null end;

  begin
    insert into public.bookings
      (boat_id, tourist_id, hotel_id, guest_name, guest_phone, start_date, days,
       start_time, duration_hours, group_size, experience_type, price_total, deposit_amount, notes)
    values
      (p_boat_id, v_tourist, p_hotel_id, p_guest_name, p_guest_phone, p_start_date, p_days,
       p_start_time, p_duration_hours, p_group_size, p_experience_type, v_total, v_dep, p_notes)
    returning bookings.id, bookings.deposit_amount into v_id, v_dep;
  exception when exclusion_violation then
    raise exception 'That slot was just booked by someone else. Pick another time.';
  end;

  insert into public.consent_records (user_id, document_id, doc_type, version, context, booking_id, accepted)
  values (auth.uid(), v_doc.id, 'booking_waiver', p_waiver_version, 'booking', v_id, true);

  id := v_id; deposit_amount := v_dep; return next;
end; $$;
