-- Subsystem D: captain assignment. Owners keep a reusable roster of captains and assign
-- one to a booking after they confirm it. The chosen captain's name and phone are
-- snapshotted onto the booking so the tourist, hotel, or agency who booked can see who
-- will run the trip (they read it through the existing booking select policy, with no
-- need to expose the owner's whole roster).

create table public.captains (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  phone text not null,
  created_at timestamptz not null default now()
);
create index captains_owner_idx on public.captains (owner_id);

alter table public.captains enable row level security;
create policy "captains_owner_all" on public.captains
  for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
revoke all on public.captains from anon, authenticated;
grant select, insert, update, delete on public.captains to authenticated;

create trigger audit_captains after insert or update or delete on public.captains
  for each row execute function public.record_audit();

alter table public.bookings
  add column if not exists captain_name text,
  add column if not exists captain_phone text;

-- assign_captain: owner of the boat assigns one of their own captains to a confirmed
-- booking. Snapshots the captain's name and phone onto the booking.
create or replace function public.assign_captain(p_booking_id uuid, p_captain_id uuid)
returns bookings language plpgsql security definer set search_path = public, pg_temp as $$
declare v_booking public.bookings; v_owner uuid; v_captain public.captains;
begin
  if public.has_outstanding_required_consent() then raise exception 'Consent required'; end if;
  select * into v_booking from public.bookings where id = p_booking_id;
  if not found then raise exception 'Booking not found'; end if;
  select owner_id into v_owner from public.boats where id = v_booking.boat_id;
  if v_owner <> auth.uid() then raise exception 'Only the boat owner can assign a captain'; end if;
  if v_booking.status not in ('confirmed','deposit_paid','completed') then
    raise exception 'Confirm the booking before assigning a captain';
  end if;
  select * into v_captain from public.captains where id = p_captain_id;
  if not found or v_captain.owner_id <> auth.uid() then
    raise exception 'That captain is not on your roster';
  end if;
  update public.bookings set captain_name = v_captain.name, captain_phone = v_captain.phone
  where id = p_booking_id returning * into v_booking;
  return v_booking;
end; $$;
revoke all on function public.assign_captain(uuid, uuid) from public, anon;
grant execute on function public.assign_captain(uuid, uuid) to authenticated;
