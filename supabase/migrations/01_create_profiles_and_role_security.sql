create type user_role as enum ('tourist','owner','hotel','admin');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role user_role not null default 'tourist',
  full_name text not null default '',
  phone text,
  business_name text,
  is_verified boolean not null default false,
  trust_score int not null default 50 check (trust_score between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Reads profiles from inside policies without recursing into profiles RLS.
create or replace function public.is_admin()
returns boolean language sql stable security definer
set search_path = public, pg_temp as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

create or replace function public.current_user_role()
returns user_role language sql stable security definer
set search_path = public, pg_temp as $$
  select role from public.profiles where id = auth.uid();
$$;

-- Layer 1: signup cannot grant admin. Anything outside the whitelist becomes tourist.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  requested text := coalesce(new.raw_user_meta_data->>'role', 'tourist');
  safe_role user_role;
begin
  if requested in ('tourist','owner','hotel') then
    safe_role := requested::user_role;
  else
    safe_role := 'tourist';
  end if;

  insert into public.profiles (id, role, full_name, phone, business_name)
  values (
    new.id,
    safe_role,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    new.raw_user_meta_data->>'phone',
    new.raw_user_meta_data->>'business_name'
  );
  return new;
end; $$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Layer 2: a user cannot promote themselves after signup either.
create or replace function public.guard_profile_privileges()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $$
begin
  if (new.role is distinct from old.role
      or new.is_verified is distinct from old.is_verified
      or new.trust_score is distinct from old.trust_score)
     and not public.is_admin() then
    raise exception 'Only an administrator can change role, verification, or trust score';
  end if;
  new.updated_at := now();
  return new;
end; $$;

create trigger profiles_guard_privileges
before update on public.profiles
for each row execute function public.guard_profile_privileges();

create policy "profiles_read_own_or_admin" on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_admin());

-- Owner profiles are public so tourists can see operator name and trust score.
create policy "profiles_read_owners_public" on public.profiles
  for select to anon, authenticated
  using (role = 'owner');

create policy "profiles_update_own_or_admin" on public.profiles
  for update to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

-- Layer 3: column grants. Even a bypassed trigger cannot write these columns.
revoke update on public.profiles from authenticated;
grant update (full_name, phone, business_name) on public.profiles to authenticated;
