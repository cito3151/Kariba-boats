create table public.boat_operating_hours (
  id uuid primary key default gen_random_uuid(),
  boat_id uuid not null references public.boats(id) on delete cascade,
  booking_id uuid,
  hours numeric(6,1) not null check (hours > 0 and hours <= 24),
  reading_after numeric(10,1) not null,
  note text,
  logged_by uuid not null references public.profiles(id),
  logged_at timestamptz not null default now()
);
create index boat_hours_boat_idx on public.boat_operating_hours (boat_id, logged_at desc);

create table public.boat_maintenance_records (
  id uuid primary key default gen_random_uuid(),
  boat_id uuid not null references public.boats(id) on delete cascade,
  performed_at date not null default current_date,
  hours_at_service numeric(10,1) not null,
  interval_at_service numeric(10,1) not null,
  description text not null check (length(btrim(description)) >= 3),
  cost numeric(10,2) check (cost >= 0),
  service_provider text,
  performed_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);
create index boat_maint_boat_idx on public.boat_maintenance_records (boat_id, performed_at desc);

create table public.maintenance_notifications (
  id uuid primary key default gen_random_uuid(),
  boat_id uuid not null references public.boats(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id),
  level text not null check (level in ('approaching','due','overdue')),
  message text not null,
  hours_at_trigger numeric(10,1) not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);
-- Dedup: one alert per boat per level per reading, so logging hours repeatedly does not spam.
create unique index maint_notif_dedup
  on public.maintenance_notifications (boat_id, level, hours_at_trigger);

alter table public.boat_operating_hours enable row level security;
alter table public.boat_maintenance_records enable row level security;
alter table public.maintenance_notifications enable row level security;

create policy "hours_read_own_or_admin" on public.boat_operating_hours
  for select to authenticated
  using (exists (select 1 from public.boats b where b.id = boat_id
                 and (b.owner_id = auth.uid() or public.is_admin())));

create policy "maint_read_own_or_admin" on public.boat_maintenance_records
  for select to authenticated
  using (exists (select 1 from public.boats b where b.id = boat_id
                 and (b.owner_id = auth.uid() or public.is_admin())));

create policy "notif_read_own" on public.maintenance_notifications
  for select to authenticated
  using (recipient_id = auth.uid() or public.is_admin());

create policy "notif_update_own" on public.maintenance_notifications
  for update to authenticated
  using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());

-- No INSERT policy on the ledger or records by design. Writes happen only through the
-- SECURITY DEFINER RPCs below, which is what makes the ledger tamper resistant.

create or replace function public.log_operating_hours(
  p_boat_id uuid, p_hours numeric, p_note text default null, p_booking_id uuid default null
) returns public.boats
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_boat public.boats;
  v_status_before text;
  v_new_total numeric(10,1);
begin
  select * into v_boat from public.boats where id = p_boat_id for update;
  if not found then raise exception 'Boat not found'; end if;
  if v_boat.owner_id <> auth.uid() and not public.is_admin() then
    raise exception 'You can only log hours for your own boats';
  end if;
  if p_hours is null or p_hours <= 0 or p_hours > 24 then
    raise exception 'Hours must be greater than 0 and at most 24 per entry';
  end if;

  v_status_before := v_boat.maintenance_status;
  v_new_total := v_boat.accumulated_hours + p_hours;

  insert into public.boat_operating_hours (boat_id, booking_id, hours, reading_after, note, logged_by)
  values (p_boat_id, p_booking_id, p_hours, v_new_total, p_note, auth.uid());

  update public.boats set accumulated_hours = v_new_total
  where id = p_boat_id returning * into v_boat;

  -- Notify only when the status actually changed, and dedup on the reading.
  if v_boat.maintenance_status <> v_status_before
     and v_boat.maintenance_status in ('approaching','due','overdue') then
    insert into public.maintenance_notifications
      (boat_id, recipient_id, level, message, hours_at_trigger)
    values (
      p_boat_id, v_boat.owner_id, v_boat.maintenance_status,
      case v_boat.maintenance_status
        when 'approaching' then v_boat.name || ' is approaching maintenance, ' ||
             v_boat.hours_remaining || ' hours remaining.'
        when 'due' then v_boat.name || ' has reached its maintenance interval at ' ||
             v_boat.accumulated_hours || ' hours.'
        else v_boat.name || ' is overdue for maintenance and has been hidden from tourist search.'
      end,
      v_boat.accumulated_hours
    )
    on conflict (boat_id, level, hours_at_trigger) do nothing;
  end if;

  return v_boat;
end; $$;

create or replace function public.complete_maintenance(
  p_boat_id uuid, p_description text, p_performed_at date default current_date,
  p_cost numeric default null, p_service_provider text default null
) returns public.boats
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_boat public.boats;
begin
  select * into v_boat from public.boats where id = p_boat_id for update;
  if not found then raise exception 'Boat not found'; end if;
  if v_boat.owner_id <> auth.uid() and not public.is_admin() then
    raise exception 'You can only complete maintenance for your own boats';
  end if;

  insert into public.boat_maintenance_records
    (boat_id, performed_at, hours_at_service, interval_at_service,
     description, cost, service_provider, performed_by)
  values (p_boat_id, p_performed_at, v_boat.accumulated_hours,
          v_boat.maintenance_interval_hours, p_description, p_cost,
          p_service_provider, auth.uid());

  -- Reset the cycle: next due becomes accumulated + interval.
  update public.boats set last_maintenance_hours = v_boat.accumulated_hours
  where id = p_boat_id returning * into v_boat;

  update public.maintenance_notifications
  set is_read = true where boat_id = p_boat_id and not is_read;

  return v_boat;
end; $$;

revoke all on function public.log_operating_hours(uuid, numeric, text, uuid) from public, anon;
revoke all on function public.complete_maintenance(uuid, text, date, numeric, text) from public, anon;
grant execute on function public.log_operating_hours(uuid, numeric, text, uuid) to authenticated;
grant execute on function public.complete_maintenance(uuid, text, date, numeric, text) to authenticated;
