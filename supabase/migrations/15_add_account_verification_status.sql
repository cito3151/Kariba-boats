-- Account verification and access gating. Adds a verification_status tri-state
-- (pending/verified/rejected) as the single source of truth, replacing the
-- cosmetic is_verified boolean. Owners cannot submit boats for review and hotels
-- cannot book on behalf until an admin verifies the account. Admin reviews via
-- admin_review_account (verify/reject) and admin_verify_hotel (verify + link a
-- hotel record). Supersedes migration 12's admin_set_verification.

create type verification_status as enum ('pending','verified','rejected');

alter table public.profiles
  add column verification_status verification_status not null default 'pending',
  add column verification_note text,
  add column reviewed_by uuid references public.profiles(id),
  add column reviewed_at timestamptz;

-- Backfill from the legacy boolean/role before it is dropped.
update public.profiles
  set verification_status = 'verified'
  where role in ('tourist','admin') or is_verified = true;

-- New signups: owners/hotels start pending; tourists (and any admin) are verified.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare requested text := coalesce(new.raw_user_meta_data->>'role', 'tourist'); safe_role user_role;
begin
  if requested in ('tourist','owner','hotel') then safe_role := requested::user_role; else safe_role := 'tourist'; end if;
  insert into public.profiles (id, role, full_name, phone, business_name, verification_status)
  values (new.id, safe_role,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    new.raw_user_meta_data->>'phone',
    new.raw_user_meta_data->>'business_name',
    case when safe_role in ('owner','hotel') then 'pending'::verification_status else 'verified'::verification_status end);
  return new;
end; $$;

-- Guard admin-only columns (verification_status + note/reviewer + hotel_id).
create or replace function public.guard_profile_privileges()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if (new.role is distinct from old.role
      or new.verification_status is distinct from old.verification_status
      or new.trust_score is distinct from old.trust_score
      or new.verification_note is distinct from old.verification_note
      or new.reviewed_by is distinct from old.reviewed_by
      or new.reviewed_at is distinct from old.reviewed_at
      or new.hotel_id is distinct from old.hotel_id)
     and not public.is_admin() then
    raise exception 'Only an administrator can change account role, verification, or hotel link';
  end if;
  new.updated_at := now();
  return new;
end; $$;

-- Recreate the public view so operator_verified derives from the new column.
create or replace view public.public_boats with (security_invoker = on) as
select
  b.id, b.owner_id, b.name, b.boat_type, b.capacity, b.description, b.location,
  b.price_per_hour, b.price_per_day, b.facilities, b.safety_equipment,
  b.crew_included, b.fuel_policy, b.registration_number,
  b.capacity as max_guests, b.maintenance_status, b.created_at,
  p.business_name as operator_name,
  p.phone as operator_phone,
  (p.verification_status = 'verified') as operator_verified,
  p.trust_score as operator_trust_score
from public.boats b
join public.profiles p on p.id = b.owner_id
where b.status = 'approved' and b.is_active and not b.is_deleted and b.maintenance_status <> 'overdue';

-- The boolean is now unreferenced; remove it.
alter table public.profiles drop column is_verified;

-- Owners must be verified before a boat can enter the review pipeline.
create or replace function public.submit_boat_for_review(p_boat_id uuid)
returns public.boats language plpgsql security definer set search_path = public, pg_temp as $$
declare v_boat public.boats;
begin
  select * into v_boat from public.boats where id = p_boat_id;
  if not found then raise exception 'Boat not found'; end if;
  if v_boat.owner_id <> auth.uid() then raise exception 'Not your boat'; end if;
  if (select verification_status from public.profiles where id = auth.uid()) <> 'verified' then
    raise exception 'Your owner account is pending verification. An admin will review it before your boats can go live.';
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
end; $$;

-- Admin verify/reject an owner or hotel account.
create or replace function public.admin_review_account(
  p_user_id uuid, p_status verification_status, p_trust_score int default null, p_note text default null
) returns public.profiles language plpgsql security definer set search_path = public, pg_temp as $$
declare v_profile public.profiles;
begin
  if not public.is_admin() then raise exception 'Administrator only'; end if;
  if p_trust_score is not null and (p_trust_score < 0 or p_trust_score > 100) then
    raise exception 'Trust score must be between 0 and 100';
  end if;
  update public.profiles set
    verification_status = p_status,
    trust_score = coalesce(p_trust_score, trust_score),
    verification_note = p_note,
    reviewed_by = auth.uid(), reviewed_at = now()
  where id = p_user_id returning * into v_profile;
  if v_profile.id is null then raise exception 'User not found'; end if;
  return v_profile;
end; $$;

-- Admin verifies a hotel and links a hotel record so it can transact.
create or replace function public.admin_verify_hotel(
  p_user_id uuid, p_hotel_name text, p_location text, p_commission numeric default 8, p_trust_score int default 90
) returns public.profiles language plpgsql security definer set search_path = public, pg_temp as $$
declare v_profile public.profiles; v_hotel_id uuid;
begin
  if not public.is_admin() then raise exception 'Administrator only'; end if;
  if p_trust_score < 0 or p_trust_score > 100 then raise exception 'Trust score must be between 0 and 100'; end if;
  insert into public.hotels (name, location, commission_rate, is_verified)
  values (p_hotel_name, p_location, coalesce(p_commission, 8), true) returning id into v_hotel_id;
  update public.profiles set
    hotel_id = v_hotel_id, verification_status = 'verified',
    trust_score = p_trust_score, verification_note = null,
    reviewed_by = auth.uid(), reviewed_at = now()
  where id = p_user_id returning * into v_profile;
  return v_profile;
end; $$;

drop function if exists public.admin_set_verification(uuid, boolean, int);

-- Only a verified, correctly linked hotel may create a hotel booking.
create or replace function public.guard_hotel_booking()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.hotel_id is not null then
    if not exists (select 1 from public.profiles where id = auth.uid()
                   and role = 'hotel' and verification_status = 'verified' and hotel_id = new.hotel_id) then
      raise exception 'Your hotel account is not verified yet, or is not linked to this hotel.';
    end if;
  end if;
  return new;
end; $$;
drop trigger if exists bookings_guard_hotel on public.bookings;
create trigger bookings_guard_hotel before insert on public.bookings
for each row execute function public.guard_hotel_booking();

revoke all on function public.admin_review_account(uuid, verification_status, int, text) from public, anon;
revoke all on function public.admin_verify_hotel(uuid, text, text, numeric, int) from public, anon;
grant execute on function public.admin_review_account(uuid, verification_status, int, text) to authenticated;
grant execute on function public.admin_verify_hotel(uuid, text, text, numeric, int) to authenticated;
