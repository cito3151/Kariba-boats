create extension if not exists btree_gist;

create table public.hotels (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  location text not null,
  commission_rate numeric(5,2) not null default 8 check (commission_rate between 0 and 30),
  is_verified boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.profiles add column hotel_id uuid references public.hotels(id);

create type booking_status as enum
  ('requested','confirmed','deposit_paid','completed','declined','cancelled');

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  boat_id uuid not null references public.boats(id) on delete restrict,
  tourist_id uuid references public.profiles(id),
  hotel_id uuid references public.hotels(id),
  guest_name text not null check (length(btrim(guest_name)) >= 2),
  guest_phone text not null check (length(btrim(guest_phone)) >= 6),
  start_date date not null,
  days int not null default 1 check (days between 1 and 30),
  start_time time,
  duration_hours numeric(4,1) check (duration_hours > 0 and duration_hours <= 12),
  group_size int not null check (group_size >= 1),
  experience_type text not null,
  status booking_status not null default 'requested',
  price_total numeric(10,2) not null check (price_total >= 0),
  deposit_amount numeric(10,2) not null check (deposit_amount >= 0),
  notes text,
  created_at timestamptz not null default now(),

  -- tsrange not tstzrange: generated columns must be immutable, and casting a
  -- date to timestamptz depends on the session timezone. Kariba is CAT with no DST.
  period tsrange generated always as (
    case
      when start_time is not null and duration_hours is not null
        then tsrange((start_date + start_time),
                     (start_date + start_time) + make_interval(mins => (duration_hours * 60)::int),
                     '[)')
      else tsrange(start_date::timestamp, (start_date + days)::timestamp, '[)')
    end
  ) stored
);

-- The database itself refuses to double-book, regardless of client behaviour.
alter table public.bookings add constraint bookings_no_overlap
  exclude using gist (boat_id with =, period with &&)
  where (status in ('requested','confirmed','deposit_paid'));

create index bookings_boat_idx on public.bookings (boat_id, start_date);
create index bookings_tourist_idx on public.bookings (tourist_id);

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.bookings(id) on delete cascade,
  boat_id uuid not null references public.boats(id) on delete cascade,
  tourist_id uuid not null references public.profiles(id),
  rating int not null check (rating between 1 and 5),
  comment text check (length(comment) <= 1000),
  operator_response text check (length(operator_response) <= 1000),
  created_at timestamptz not null default now()
);
create index reviews_boat_idx on public.reviews (boat_id, created_at desc);

-- A review must correspond to a completed trip taken by the reviewer.
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
  return new;
end; $$;

create trigger reviews_guard_authenticity
before insert on public.reviews
for each row execute function public.guard_review_authenticity();

alter table public.hotels enable row level security;
alter table public.bookings enable row level security;
alter table public.reviews enable row level security;

create policy "hotels_read_all" on public.hotels for select to anon, authenticated using (true);
create policy "hotels_write_admin" on public.hotels for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "bookings_read_involved" on public.bookings
  for select to authenticated
  using (
    tourist_id = auth.uid()
    or public.is_admin()
    or exists (select 1 from public.boats b where b.id = boat_id and b.owner_id = auth.uid())
    or hotel_id = (select hotel_id from public.profiles where id = auth.uid())
  );

create policy "bookings_insert_authenticated" on public.bookings
  for insert to authenticated with check (true);

create policy "bookings_update_involved" on public.bookings
  for update to authenticated
  using (
    public.is_admin()
    or exists (select 1 from public.boats b where b.id = boat_id and b.owner_id = auth.uid())
    or tourist_id = auth.uid()
  )
  with check (
    public.is_admin()
    or exists (select 1 from public.boats b where b.id = boat_id and b.owner_id = auth.uid())
    or tourist_id = auth.uid()
  );

create policy "reviews_read_all" on public.reviews for select to anon, authenticated using (true);
create policy "reviews_insert_own" on public.reviews
  for insert to authenticated with check (tourist_id = auth.uid());
create policy "reviews_update_owner_response" on public.reviews
  for update to authenticated
  using (exists (select 1 from public.boats b where b.id = boat_id and b.owner_id = auth.uid())
         or public.is_admin());
