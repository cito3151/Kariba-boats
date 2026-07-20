create type boat_status as enum ('draft','pending','approved','rejected','suspended');
create type boat_kind as enum ('houseboat','speedboat','fishing','cruiser','pontoon');
create type fuel_policy_kind as enum ('included','excluded','prepaid','full_to_full');

create table public.boats (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete restrict,

  name text not null check (length(btrim(name)) between 2 and 80),
  boat_type boat_kind not null,
  capacity int not null check (capacity between 1 and 200),
  description text check (length(description) <= 2000),
  location text not null check (length(btrim(location)) >= 2),
  price_per_hour numeric(10,2) check (price_per_hour >= 0),
  price_per_day numeric(10,2) check (price_per_day >= 0),
  facilities text[] not null default '{}',
  safety_equipment text[] not null default '{}',
  crew_included boolean not null default true,
  fuel_policy fuel_policy_kind not null default 'included',
  registration_number text,

  maintenance_interval_hours numeric(10,1) not null default 100 check (maintenance_interval_hours > 0),
  maintenance_warn_hours numeric(10,1) not null default 10 check (maintenance_warn_hours >= 0),
  accumulated_hours numeric(10,1) not null default 0 check (accumulated_hours >= 0),
  last_maintenance_hours numeric(10,1) not null default 0 check (last_maintenance_hours >= 0),

  next_maintenance_hours numeric(10,1)
    generated always as (last_maintenance_hours + maintenance_interval_hours) stored,
  hours_remaining numeric(10,1)
    generated always as (last_maintenance_hours + maintenance_interval_hours - accumulated_hours) stored,
  maintenance_status text generated always as (
    case
      when accumulated_hours - (last_maintenance_hours + maintenance_interval_hours)
           >= maintenance_warn_hours then 'overdue'
      when accumulated_hours >= last_maintenance_hours + maintenance_interval_hours then 'due'
      when (last_maintenance_hours + maintenance_interval_hours) - accumulated_hours
           <= maintenance_warn_hours then 'approaching'
      else 'ok'
    end
  ) stored,

  status boat_status not null default 'draft',
  is_active boolean not null default true,
  is_deleted boolean not null default false,
  deleted_at timestamptz,
  rejection_reason text,
  pending_changes jsonb,
  approved_at timestamptz,
  approved_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint boats_price_present check (price_per_hour is not null or price_per_day is not null),
  constraint boats_last_maint_lte_accum check (last_maintenance_hours <= accumulated_hours)
);

create index boats_owner_idx on public.boats (owner_id) where not is_deleted;
create index boats_status_idx on public.boats (status) where not is_deleted;
create index boats_visibility_idx on public.boats (status, is_active, maintenance_status) where not is_deleted;

alter table public.boats enable row level security;

create policy "boats_read_public_or_own_or_admin" on public.boats
  for select to anon, authenticated
  using (
    (status = 'approved' and is_active and not is_deleted and maintenance_status <> 'overdue')
    or owner_id = auth.uid()
    or public.is_admin()
  );

create policy "boats_insert_own_as_owner" on public.boats
  for insert to authenticated
  with check (owner_id = auth.uid() and public.current_user_role() = 'owner');

create policy "boats_update_own_or_admin" on public.boats
  for update to authenticated
  using (owner_id = auth.uid() or public.is_admin())
  with check (owner_id = auth.uid() or public.is_admin());

-- Owners may submit for review. They may not approve themselves, rewrite hours,
-- or fake approval metadata. Hours move only through the RPCs in Task 5.
create or replace function public.guard_boat_privileges()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $$
begin
  if not public.is_admin() then
    if new.status is distinct from old.status
       and not (old.status in ('draft','rejected') and new.status = 'pending') then
      raise exception 'Owners may only submit a boat for review. Approval is an administrator action.';
    end if;
    if new.accumulated_hours is distinct from old.accumulated_hours then
      raise exception 'Operating hours must be logged through log_operating_hours()';
    end if;
    if new.last_maintenance_hours is distinct from old.last_maintenance_hours then
      raise exception 'Maintenance resets must go through complete_maintenance()';
    end if;
    if new.approved_at is distinct from old.approved_at
       or new.approved_by is distinct from old.approved_by
       or new.pending_changes is distinct from old.pending_changes then
      raise exception 'Approval metadata is administrator-only';
    end if;
  end if;
  new.updated_at := now();
  return new;
end; $$;

create trigger boats_guard_privileges
before update on public.boats
for each row execute function public.guard_boat_privileges();

create view public.public_boats with (security_invoker = on) as
select
  b.id, b.owner_id, b.name, b.boat_type, b.capacity, b.description, b.location,
  b.price_per_hour, b.price_per_day, b.facilities, b.safety_equipment,
  b.crew_included, b.fuel_policy, b.registration_number,
  b.capacity as max_guests, b.maintenance_status, b.created_at,
  p.business_name as operator_name,
  p.phone as operator_phone,
  p.is_verified as operator_verified,
  p.trust_score as operator_trust_score
from public.boats b
join public.profiles p on p.id = b.owner_id
where b.status = 'approved'
  and b.is_active
  and not b.is_deleted
  and b.maintenance_status <> 'overdue';

grant select on public.public_boats to anon, authenticated;
