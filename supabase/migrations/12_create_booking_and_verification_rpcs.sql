-- Booking status and user-verification CRUD, enforced server-side.
-- Legal booking transition graph:
--   requested    -> confirmed, declined, cancelled
--   confirmed    -> deposit_paid, completed, cancelled
--   deposit_paid -> completed, cancelled
--   completed / declined / cancelled are terminal
-- Direct client UPDATE on bookings is revoked; all status changes go through the
-- SECURITY DEFINER RPCs below, so a tourist cannot self-confirm.

-- Owners (or admin) drive booking status through the legal transition graph.
create or replace function public.owner_set_booking_status(
  p_booking_id uuid, p_status booking_status
) returns public.bookings language plpgsql security definer
set search_path = public, pg_temp as $$
declare v_booking public.bookings; v_owner uuid; v_ok boolean;
begin
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found then raise exception 'Booking not found'; end if;
  select owner_id into v_owner from public.boats where id = v_booking.boat_id;
  if v_owner <> auth.uid() and not public.is_admin() then
    raise exception 'Only the boat owner can change this booking';
  end if;

  v_ok := case v_booking.status
    when 'requested' then p_status in ('confirmed','declined','cancelled')
    when 'confirmed' then p_status in ('deposit_paid','completed','cancelled')
    when 'deposit_paid' then p_status in ('completed','cancelled')
    else false
  end;
  if not v_ok then
    raise exception 'Cannot change a % booking to %', v_booking.status, p_status;
  end if;

  update public.bookings set status = p_status where id = p_booking_id returning * into v_booking;
  return v_booking;
end; $$;

-- Cancel: the booking's tourist, the boat's owner, or admin. Never a completed trip.
create or replace function public.cancel_booking(p_booking_id uuid)
returns public.bookings language plpgsql security definer
set search_path = public, pg_temp as $$
declare v_booking public.bookings; v_owner uuid;
begin
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found then raise exception 'Booking not found'; end if;
  select owner_id into v_owner from public.boats where id = v_booking.boat_id;
  if v_booking.tourist_id is distinct from auth.uid()
     and v_owner <> auth.uid() and not public.is_admin() then
    raise exception 'You can only cancel your own booking';
  end if;
  if v_booking.status = 'completed' then
    raise exception 'A completed trip cannot be cancelled';
  end if;
  if v_booking.status = 'cancelled' then return v_booking; end if;
  update public.bookings set status = 'cancelled' where id = p_booking_id returning * into v_booking;
  return v_booking;
end; $$;

-- Admin verifies owners/hotels. is_admin() is true for the caller so the
-- profiles guard trigger permits it; the RPC is definer-owned so column grants
-- do not block the is_verified/trust_score write.
create or replace function public.admin_set_verification(
  p_user_id uuid, p_verified boolean, p_trust_score int
) returns public.profiles language plpgsql security definer
set search_path = public, pg_temp as $$
declare v_profile public.profiles;
begin
  if not public.is_admin() then raise exception 'Administrator only'; end if;
  if p_trust_score < 0 or p_trust_score > 100 then
    raise exception 'Trust score must be between 0 and 100';
  end if;
  update public.profiles set is_verified = p_verified, trust_score = p_trust_score
  where id = p_user_id returning * into v_profile;
  return v_profile;
end; $$;

-- All booking status changes now flow through the RPCs.
revoke update on public.bookings from authenticated;

revoke all on function public.owner_set_booking_status(uuid, booking_status) from public, anon;
revoke all on function public.cancel_booking(uuid) from public, anon;
revoke all on function public.admin_set_verification(uuid, boolean, int) from public, anon;
grant execute on function public.owner_set_booking_status(uuid, booking_status) to authenticated;
grant execute on function public.cancel_booking(uuid) to authenticated;
grant execute on function public.admin_set_verification(uuid, boolean, int) to authenticated;
