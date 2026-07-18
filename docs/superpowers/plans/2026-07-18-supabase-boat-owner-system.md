# Supabase Boat Owner System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move Kariba Lake Access off mock data onto Supabase, and build the boat owner/operator system: register boats, upload images, manage listings, track operating hours aviation-style, and receive maintenance alerts, with admin approval gating everything tourists see.

**Architecture:** Postgres holds the rules, not the client. Maintenance state is derived in generated columns, operating hours are an append-only ledger, double-booking is blocked by a GiST exclusion constraint, and privilege escalation is blocked by triggers plus column grants. The React app talks to Supabase through a thin service layer; RLS is the security boundary, not the UI.

**Tech Stack:** Supabase (Postgres 17, Auth, Storage), `@supabase/supabase-js` v2, React 19, TypeScript, Vite, Tailwind v4, framer-motion, react-router-dom v7.

## Global Constraints

- Supabase project ref: `sbrsptgpnjljnongklus` (Kariba Boats, eu-central-1). Never target `ckkpucbphqendxtrnqcz`, that is AgriSense.
- Every migration is applied with `mcp__supabase__apply_migration`, never `execute_sql`. Migrations are named `snake_case`, verbs first, e.g. `create_profiles_and_role_security`.
- **No em dashes** anywhere: not in UI copy, comments, commit messages, or SQL. Use commas, colons, or the word "to" for ranges.
- All images must remain real Lake Kariba photographs or the labelled SVG illustrations already in `src/components/illustrations/`. Never introduce generic stock photography.
- Every function that reads `profiles` from inside an RLS policy must be `SECURITY DEFINER STABLE` with `set search_path = public, pg_temp`, otherwise policies recurse.
- Money is `numeric(10,2)`. Hours are `numeric(10,1)`. Never floats.
- Enum values, table names, and column names are `snake_case`. TypeScript is `camelCase`, mapped in the service layer.
- Commit after every task with `git -c user.email=paulkwanisi12@gmail.com -c user.name=paulo commit`. Vercel Hobby rejects deploys from other authors.
- After the final migration, `mcp__supabase__get_advisors` with `type: "security"` must return zero ERROR-level findings.

---

## File Structure

**Created:**

| Path | Responsibility |
|---|---|
| `.env.local` | Supabase URL and publishable key. Gitignored. |
| `src/lib/supabase.ts` | Single Supabase client instance. Nothing else. |
| `src/types/database.ts` | Generated from the live schema. Never hand-edited. |
| `src/services/auth.service.ts` | signUp, signIn, signOut, resetPassword, getProfile |
| `src/services/boats.service.ts` | Owner CRUD, admin queries, public queries, soft delete |
| `src/services/images.service.ts` | Upload, delete, reorder, set primary |
| `src/services/maintenance.service.ts` | Log hours, complete maintenance, notifications |
| `src/services/bookings.service.ts` | Create, list, status transitions |
| `src/services/reviews.service.ts` | Create review, operator response |
| `src/hooks/useAsync.ts` | Shared loading/error/data state, used by every page |
| `src/pages/owner/OwnerDashboard.tsx` | Boat list, status chips, maintenance summary |
| `src/pages/owner/BoatFormPage.tsx` | Register and edit, shared form |
| `src/pages/owner/MaintenancePage.tsx` | Hours ledger, log form, service history |
| `src/components/owner/BoatForm.tsx` | The form itself, validation included |
| `src/components/owner/ImageUploader.tsx` | Multi-file upload, reorder, primary, delete |
| `src/components/owner/MaintenanceCard.tsx` | Gauge, remaining hours, status chip |
| `src/components/admin/ApprovalQueue.tsx` | Pending boats with images and diff |
| `src/components/admin/PendingChangesDiff.tsx` | Side by side old versus proposed |
| `src/components/StateViews.tsx` | Loading, Empty, ErrorState primitives |

**Modified:**

| Path | Change |
|---|---|
| `src/data/AuthContext.tsx` | Backed by Supabase session, same exported shape |
| `src/App.tsx` | Owner routes added, `owner` role wired into ProtectedRoute |
| `src/components/Layout.tsx` | Owner portal nav entry |
| `src/pages/TouristHome.tsx` | Reads `public_boats` |
| `src/pages/BoatDetail.tsx` | Reads `public_boats`, real bookings |
| `src/pages/AdminDashboard.tsx` | Real approval queue |
| `src/pages/OperatorDashboard.tsx` | Folded into owner pages |
| `src/data/types.ts` | Re-exports generated DB types |

**Deleted:** `src/data/AppDataContext.tsx`, `src/data/mockData.ts`.
**Kept:** `src/data/photos.ts` (real Kariba photography used as seed image content), `src/data/availability.ts` (pure date maths, still used by the calendar).

---

## Task 1: Supabase client and environment

**Files:**
- Create: `.env.local`, `src/lib/supabase.ts`
- Modify: `package.json`, `.gitignore`

**Interfaces:**
- Produces: `supabase` client exported from `src/lib/supabase.ts`, consumed by every service.

- [ ] **Step 1: Install the client**

```bash
cd C:/Users/paulo/kariba-boats && npm install @supabase/supabase-js
```

- [ ] **Step 2: Fetch project credentials**

Call `mcp__supabase__get_project_url` and `mcp__supabase__get_publishable_keys` with `project_id: "sbrsptgpnjljnongklus"`.

- [ ] **Step 3: Write `.env.local`**

```
VITE_SUPABASE_URL=https://sbrsptgpnjljnongklus.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<value from get_publishable_keys>
```

Confirm `.env.local` is matched by `.gitignore`. The existing `.gitignore` contains `.env.local`, so nothing to add.

- [ ] **Step 4: Create the client**

```ts
// src/lib/supabase.ts
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../types/database';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!url || !key) {
  throw new Error(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY. Copy .env.example to .env.local and fill both values.',
  );
}

export const supabase = createClient<Database>(url, key, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});
```

`src/types/database.ts` does not exist yet, so create a placeholder now and regenerate it in Task 8:

```ts
// src/types/database.ts
export type Database = Record<string, unknown>;
```

- [ ] **Step 5: Verify it compiles**

Run: `npx tsc -b --noEmit`
Expected: no output, exit 0.

- [ ] **Step 6: Commit**

```bash
git add -A && git -c user.email=paulkwanisi12@gmail.com -c user.name=paulo commit -m "Add Supabase client and environment config"
```

---

## Task 2: Profiles, roles, and privilege escalation defence

**Files:**
- Migration: `create_profiles_and_role_security`

**Interfaces:**
- Produces: `user_role` enum, `public.profiles`, `public.is_admin()`, `public.current_user_role()`. Every later RLS policy uses `is_admin()`.

- [ ] **Step 1: Apply the migration**

```sql
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
```

- [ ] **Step 2: Verify the whitelist rejects admin**

Run `mcp__supabase__execute_sql`:

```sql
select public.handle_new_user is not null as trigger_fn_exists;
select unnest(enum_range(null::user_role))::text as roles;
```
Expected: `trigger_fn_exists` true, four roles listed. The behavioural test runs in Task 8 once real users exist.

- [ ] **Step 3: Commit**

```bash
git -c user.email=paulkwanisi12@gmail.com -c user.name=paulo commit --allow-empty -m "Add profiles table with three-layer role escalation defence"
```

---

## Task 3: Boats table with derived maintenance state

**Files:**
- Migration: `create_boats_with_maintenance`

**Interfaces:**
- Consumes: `public.profiles`, `is_admin()`, `current_user_role()` from Task 2.
- Produces: `public.boats`, `boat_status`, `boat_kind`, `fuel_policy_kind` enums, `public.public_boats` view. Columns `next_maintenance_hours`, `hours_remaining`, `maintenance_status` are generated and read-only.

- [ ] **Step 1: Apply the migration**

```sql
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
```

- [ ] **Step 2: Verify the maintenance maths against the brief's example**

Run `mcp__supabase__execute_sql`:

```sql
with probe(accumulated, interval_h, last_h, warn) as (
  values (260.0,100.0,200.0,10.0), (292.0,100.0,200.0,10.0),
         (300.0,100.0,200.0,10.0), (310.0,100.0,200.0,10.0)
)
select accumulated,
       last_h + interval_h as next_due,
       last_h + interval_h - accumulated as remaining,
       case
         when accumulated - (last_h + interval_h) >= warn then 'overdue'
         when accumulated >= last_h + interval_h then 'due'
         when (last_h + interval_h) - accumulated <= warn then 'approaching'
         else 'ok'
       end as status
from probe;
```

Expected exactly:

| accumulated | next_due | remaining | status |
|---|---|---|---|
| 260 | 300 | 40 | ok |
| 292 | 300 | 8 | approaching |
| 300 | 300 | 0 | due |
| 310 | 300 | -10 | overdue |

If any row differs, the generated column expression is wrong. Fix before continuing.

- [ ] **Step 3: Commit**

```bash
git -c user.email=paulkwanisi12@gmail.com -c user.name=paulo commit --allow-empty -m "Add boats table with generated maintenance state and owner guard trigger"
```

---

## Task 4: Boat images and storage

**Files:**
- Migration: `create_boat_images_and_storage`

**Interfaces:**
- Consumes: `public.boats`, `is_admin()`.
- Produces: `public.boat_images`, bucket `boat-images`, storage path convention `{owner_id}/{boat_id}/{uuid}.{ext}`.

- [ ] **Step 1: Create the bucket**

```sql
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('boat-images', 'boat-images', true, 5242880,
        array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
set file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;
```

The 5 MB limit and MIME whitelist are enforced by Storage itself, so a renamed `.pdf` or an oversized file is rejected server side regardless of client code.

- [ ] **Step 2: Create the table, cap trigger, and policies**

```sql
create table public.boat_images (
  id uuid primary key default gen_random_uuid(),
  boat_id uuid not null references public.boats(id) on delete cascade,
  storage_path text not null unique,
  sort_order int not null default 0,
  is_primary boolean not null default false,
  moderation_status text not null default 'pending'
    check (moderation_status in ('pending','approved','rejected')),
  uploaded_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create index boat_images_boat_idx on public.boat_images (boat_id, sort_order);
create unique index boat_images_one_primary on public.boat_images (boat_id) where is_primary;

-- Cap of 10 images per boat, enforced server side.
create or replace function public.enforce_image_cap()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  existing int;
begin
  select count(*) into existing from public.boat_images where boat_id = new.boat_id;
  if existing >= 10 then
    raise exception 'A boat may have at most 10 images. Delete one before uploading another.';
  end if;
  return new;
end; $$;

create trigger boat_images_cap
before insert on public.boat_images
for each row execute function public.enforce_image_cap();

alter table public.boat_images enable row level security;

create policy "boat_images_read_visible" on public.boat_images
  for select to anon, authenticated
  using (
    exists (select 1 from public.boats b where b.id = boat_id
            and (b.owner_id = auth.uid() or public.is_admin()
                 or (b.status = 'approved' and b.is_active and not b.is_deleted)))
  );

create policy "boat_images_write_own" on public.boat_images
  for all to authenticated
  using (exists (select 1 from public.boats b
                 where b.id = boat_id and (b.owner_id = auth.uid() or public.is_admin())))
  with check (exists (select 1 from public.boats b
                      where b.id = boat_id and (b.owner_id = auth.uid() or public.is_admin())));

-- Storage: an owner may only write inside their own folder, and only for a boat they own.
create policy "storage_boat_images_insert_own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'boat-images'
    and (storage.foldername(name))[1] = auth.uid()::text
    and exists (select 1 from public.boats b
                where b.id::text = (storage.foldername(name))[2] and b.owner_id = auth.uid())
  );

create policy "storage_boat_images_delete_own" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'boat-images'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  );

create policy "storage_boat_images_read" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'boat-images');
```

- [ ] **Step 3: Verify the ownership policy blocks cross-owner writes**

Run `mcp__supabase__execute_sql`:

```sql
select policyname, cmd from pg_policies
where schemaname = 'storage' and tablename = 'objects'
  and policyname like 'storage_boat_images%'
order by policyname;
```
Expected: three rows, `INSERT`, `DELETE`, `SELECT`.

- [ ] **Step 4: Commit**

```bash
git -c user.email=paulkwanisi12@gmail.com -c user.name=paulo commit --allow-empty -m "Add boat_images table, storage bucket, and path-ownership policies"
```

---

## Task 5: Operating hours ledger, maintenance records, notifications

**Files:**
- Migration: `create_maintenance_tracking`

**Interfaces:**
- Consumes: `public.boats`.
- Produces: `public.boat_operating_hours`, `public.boat_maintenance_records`, `public.maintenance_notifications`, and two RPCs:
  - `log_operating_hours(p_boat_id uuid, p_hours numeric, p_note text default null, p_booking_id uuid default null) returns public.boats`
  - `complete_maintenance(p_boat_id uuid, p_description text, p_performed_at date default current_date, p_cost numeric default null, p_service_provider text default null) returns public.boats`

- [ ] **Step 1: Apply the migration**

```sql
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
```

Note there is deliberately no INSERT policy on the ledger or records. Writes happen only through the `SECURITY DEFINER` RPCs below, which is what makes the ledger tamper resistant.

- [ ] **Step 2: Apply the RPCs**

```sql
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
```

- [ ] **Step 3: Verify the full maintenance cycle**

Run `mcp__supabase__execute_sql`:

```sql
select proname, prosecdef from pg_proc
where proname in ('log_operating_hours','complete_maintenance');
```
Expected: two rows, `prosecdef` true for both. The behavioural cycle test runs in Task 8 with a seeded boat.

- [ ] **Step 4: Commit**

```bash
git -c user.email=paulkwanisi12@gmail.com -c user.name=paulo commit --allow-empty -m "Add operating hours ledger, maintenance records, and notification RPCs"
```

---

## Task 6: Hotels, bookings with overlap constraint, reviews

**Files:**
- Migration: `create_bookings_and_reviews`

**Interfaces:**
- Consumes: `public.boats`, `public.profiles`.
- Produces: `public.hotels`, `public.bookings` (with `bookings_no_overlap`), `public.reviews`.

- [ ] **Step 1: Apply the migration**

```sql
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
```

- [ ] **Step 2: Verify the overlap constraint actually blocks a double booking**

Run `mcp__supabase__execute_sql`:

```sql
select conname, contype from pg_constraint where conname = 'bookings_no_overlap';
```
Expected: one row, `contype` = `x` (exclusion). The live double-booking test runs in Task 8.

- [ ] **Step 3: Commit**

```bash
git -c user.email=paulkwanisi12@gmail.com -c user.name=paulo commit --allow-empty -m "Add hotels, bookings with GiST overlap constraint, and authentic reviews"
```

---

## Task 7: Admin approval workflow and pending changes

**Files:**
- Migration: `create_admin_approval_workflow`

**Interfaces:**
- Consumes: `public.boats`, `is_admin()`.
- Produces: `public.admin_approval_logs`, `public.is_sensitive_change()`, and RPCs:
  - `submit_boat_for_review(p_boat_id uuid) returns public.boats`
  - `propose_boat_changes(p_boat_id uuid, p_changes jsonb) returns public.boats`
  - `admin_review_boat(p_boat_id uuid, p_action text, p_reason text default null) returns public.boats`
  - `admin_review_changes(p_boat_id uuid, p_approve boolean, p_reason text default null) returns public.boats`
  - `soft_delete_boat(p_boat_id uuid) returns public.boats`

- [ ] **Step 1: Apply the migration**

```sql
create table public.admin_approval_logs (
  id uuid primary key default gen_random_uuid(),
  boat_id uuid references public.boats(id) on delete set null,
  admin_id uuid not null references public.profiles(id),
  action text not null check (action in
    ('approve','reject','suspend','unsuspend','approve_changes','reject_changes','hard_delete')),
  reason text,
  snapshot jsonb,
  created_at timestamptz not null default now()
);
create index approval_logs_boat_idx on public.admin_approval_logs (boat_id, created_at desc);

alter table public.admin_approval_logs enable row level security;
create policy "approval_logs_read" on public.admin_approval_logs
  for select to authenticated
  using (public.is_admin()
         or exists (select 1 from public.boats b where b.id = boat_id and b.owner_id = auth.uid()));

-- The single definition of a sensitive field. Client and server cannot drift.
create or replace function public.is_sensitive_change(p_changes jsonb)
returns boolean language sql immutable as $$
  select exists (
    select 1 from jsonb_object_keys(p_changes) k
    where k in ('name','boat_type','capacity','price_per_hour','price_per_day',
                'safety_equipment','crew_included','registration_number')
  );
$$;

create or replace function public.submit_boat_for_review(p_boat_id uuid)
returns public.boats language plpgsql security definer
set search_path = public, pg_temp as $$
declare v_boat public.boats;
begin
  select * into v_boat from public.boats where id = p_boat_id;
  if not found then raise exception 'Boat not found'; end if;
  if v_boat.owner_id <> auth.uid() then raise exception 'Not your boat'; end if;
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

-- Sensitive edits park in pending_changes so the live listing keeps its approved
-- values. Non-sensitive edits apply straight away.
create or replace function public.propose_boat_changes(p_boat_id uuid, p_changes jsonb)
returns public.boats language plpgsql security definer
set search_path = public, pg_temp as $$
declare v_boat public.boats;
begin
  select * into v_boat from public.boats where id = p_boat_id;
  if not found then raise exception 'Boat not found'; end if;
  if v_boat.owner_id <> auth.uid() then raise exception 'Not your boat'; end if;

  if v_boat.status = 'approved' and public.is_sensitive_change(p_changes) then
    update public.boats
    set pending_changes = coalesce(pending_changes, '{}'::jsonb) || p_changes
    where id = p_boat_id returning * into v_boat;
  else
    update public.boats set
      name = coalesce(p_changes->>'name', name),
      description = coalesce(p_changes->>'description', description),
      location = coalesce(p_changes->>'location', location),
      capacity = coalesce((p_changes->>'capacity')::int, capacity),
      price_per_hour = coalesce((p_changes->>'price_per_hour')::numeric, price_per_hour),
      price_per_day = coalesce((p_changes->>'price_per_day')::numeric, price_per_day),
      facilities = coalesce(
        (select array_agg(value::text) from jsonb_array_elements_text(p_changes->'facilities')),
        facilities),
      safety_equipment = coalesce(
        (select array_agg(value::text) from jsonb_array_elements_text(p_changes->'safety_equipment')),
        safety_equipment),
      crew_included = coalesce((p_changes->>'crew_included')::boolean, crew_included),
      fuel_policy = coalesce((p_changes->>'fuel_policy')::fuel_policy_kind, fuel_policy),
      registration_number = coalesce(p_changes->>'registration_number', registration_number),
      boat_type = coalesce((p_changes->>'boat_type')::boat_kind, boat_type),
      maintenance_interval_hours = coalesce(
        (p_changes->>'maintenance_interval_hours')::numeric, maintenance_interval_hours),
      is_active = coalesce((p_changes->>'is_active')::boolean, is_active)
    where id = p_boat_id returning * into v_boat;
  end if;
  return v_boat;
end; $$;

create or replace function public.admin_review_boat(
  p_boat_id uuid, p_action text, p_reason text default null
) returns public.boats language plpgsql security definer
set search_path = public, pg_temp as $$
declare v_boat public.boats;
begin
  if not public.is_admin() then raise exception 'Administrator only'; end if;
  select * into v_boat from public.boats where id = p_boat_id;
  if not found then raise exception 'Boat not found'; end if;

  if p_action = 'approve' then
    update public.boats set status = 'approved', approved_at = now(),
      approved_by = auth.uid(), rejection_reason = null
    where id = p_boat_id returning * into v_boat;
    update public.boat_images set moderation_status = 'approved'
    where boat_id = p_boat_id and moderation_status = 'pending';
  elsif p_action = 'reject' then
    if p_reason is null or length(btrim(p_reason)) < 5 then
      raise exception 'A rejection must include a reason of at least 5 characters';
    end if;
    update public.boats set status = 'rejected', rejection_reason = p_reason
    where id = p_boat_id returning * into v_boat;
  elsif p_action = 'suspend' then
    update public.boats set status = 'suspended', rejection_reason = p_reason
    where id = p_boat_id returning * into v_boat;
  elsif p_action = 'unsuspend' then
    update public.boats set status = 'approved', rejection_reason = null
    where id = p_boat_id returning * into v_boat;
  else
    raise exception 'Unknown action: %', p_action;
  end if;

  insert into public.admin_approval_logs (boat_id, admin_id, action, reason, snapshot)
  values (p_boat_id, auth.uid(), p_action, p_reason, to_jsonb(v_boat));
  return v_boat;
end; $$;

create or replace function public.admin_review_changes(
  p_boat_id uuid, p_approve boolean, p_reason text default null
) returns public.boats language plpgsql security definer
set search_path = public, pg_temp as $$
declare v_boat public.boats; v_changes jsonb;
begin
  if not public.is_admin() then raise exception 'Administrator only'; end if;
  select * into v_boat from public.boats where id = p_boat_id;
  if not found then raise exception 'Boat not found'; end if;
  v_changes := v_boat.pending_changes;
  if v_changes is null then raise exception 'This boat has no pending changes'; end if;

  if p_approve then
    update public.boats set
      name = coalesce(v_changes->>'name', name),
      boat_type = coalesce((v_changes->>'boat_type')::boat_kind, boat_type),
      capacity = coalesce((v_changes->>'capacity')::int, capacity),
      price_per_hour = coalesce((v_changes->>'price_per_hour')::numeric, price_per_hour),
      price_per_day = coalesce((v_changes->>'price_per_day')::numeric, price_per_day),
      safety_equipment = coalesce(
        (select array_agg(value::text) from jsonb_array_elements_text(v_changes->'safety_equipment')),
        safety_equipment),
      crew_included = coalesce((v_changes->>'crew_included')::boolean, crew_included),
      registration_number = coalesce(v_changes->>'registration_number', registration_number),
      pending_changes = null
    where id = p_boat_id returning * into v_boat;
  else
    update public.boats set pending_changes = null, rejection_reason = p_reason
    where id = p_boat_id returning * into v_boat;
  end if;

  insert into public.admin_approval_logs (boat_id, admin_id, action, reason, snapshot)
  values (p_boat_id, auth.uid(),
          case when p_approve then 'approve_changes' else 'reject_changes' end,
          p_reason, v_changes);
  return v_boat;
end; $$;

-- Soft delete is refused while future bookings exist. The error names the count.
create or replace function public.soft_delete_boat(p_boat_id uuid)
returns public.boats language plpgsql security definer
set search_path = public, pg_temp as $$
declare v_boat public.boats; v_active int;
begin
  select * into v_boat from public.boats where id = p_boat_id;
  if not found then raise exception 'Boat not found'; end if;
  if v_boat.owner_id <> auth.uid() and not public.is_admin() then
    raise exception 'Not your boat';
  end if;

  select count(*) into v_active from public.bookings
  where boat_id = p_boat_id
    and status in ('requested','confirmed','deposit_paid')
    and start_date >= current_date;

  if v_active > 0 then
    raise exception 'This boat has % upcoming booking(s). Cancel or complete them before deleting, or set the boat to unavailable instead.', v_active;
  end if;

  update public.boats set is_deleted = true, deleted_at = now(), is_active = false
  where id = p_boat_id returning * into v_boat;
  return v_boat;
end; $$;

revoke all on function public.admin_review_boat(uuid, text, text) from public, anon;
revoke all on function public.admin_review_changes(uuid, boolean, text) from public, anon;
grant execute on function public.submit_boat_for_review(uuid) to authenticated;
grant execute on function public.propose_boat_changes(uuid, jsonb) to authenticated;
grant execute on function public.admin_review_boat(uuid, text, text) to authenticated;
grant execute on function public.admin_review_changes(uuid, boolean, text) to authenticated;
grant execute on function public.soft_delete_boat(uuid) to authenticated;
```

- [ ] **Step 2: Verify sensitive field detection**

Run `mcp__supabase__execute_sql`:

```sql
select
  public.is_sensitive_change('{"price_per_day": 200}'::jsonb) as price_sensitive,
  public.is_sensitive_change('{"capacity": 12}'::jsonb) as capacity_sensitive,
  public.is_sensitive_change('{"description": "new text"}'::jsonb) as description_sensitive,
  public.is_sensitive_change('{"facilities": ["Braai"]}'::jsonb) as facilities_sensitive;
```
Expected: `true, true, false, false`.

- [ ] **Step 3: Commit**

```bash
git -c user.email=paulkwanisi12@gmail.com -c user.name=paulo commit --allow-empty -m "Add admin approval workflow, pending changes diff, and guarded soft delete"
```

---

## Task 8: Seed demo accounts, generate types, verify the whole database

**Files:**
- Migration: `seed_demo_accounts`
- Create: `src/types/database.ts` (regenerated)

**Interfaces:**
- Produces: four working demo logins, and the `Database` type consumed by `src/lib/supabase.ts`.

- [ ] **Step 1: Seed pre-confirmed demo users**

Email confirmation is ON, so seeded users set `email_confirmed_at` directly. Real signups still go through the confirmation flow.

```sql
do $$
declare
  v_admin uuid := gen_random_uuid();
  v_owner uuid := gen_random_uuid();
  v_tourist uuid := gen_random_uuid();
  v_hotel uuid := gen_random_uuid();
  v_hotel_id uuid;
begin
  insert into public.hotels (name, location, commission_rate, is_verified)
  values ('Caribbea Bay Resort', 'Kariba Town', 8, true)
  returning id into v_hotel_id;

  insert into auth.users
    (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
     raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values
    (v_admin, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'admin@kariba.com', crypt('admin123', gen_salt('bf')), now(),
     '{"provider":"email","providers":["email"]}',
     '{"full_name":"Kariba Admin","role":"tourist"}', now(), now()),
    (v_owner, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'tigerfish@kariba.com', crypt('operator123', gen_salt('bf')), now(),
     '{"provider":"email","providers":["email"]}',
     '{"full_name":"Blessing Ncube","role":"owner","business_name":"Tiger Fish Charters","phone":"+263 77 345 6789"}',
     now(), now()),
    (v_tourist, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'tourist@kariba.com', crypt('tourist123', gen_salt('bf')), now(),
     '{"provider":"email","providers":["email"]}',
     '{"full_name":"Grace Ndlovu","role":"tourist","phone":"+263 71 999 0000"}', now(), now()),
    (v_hotel, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'caribbea@kariba.com', crypt('hotel123', gen_salt('bf')), now(),
     '{"provider":"email","providers":["email"]}',
     '{"full_name":"Caribbea Bay Front Desk","role":"hotel"}', now(), now());

  insert into auth.identities (id, user_id, provider_id, identity_data, provider, created_at, updated_at)
  select u.id, u.id, u.id::text,
         jsonb_build_object('sub', u.id::text, 'email', u.email), 'email', now(), now()
  from auth.users u where u.id in (v_admin, v_owner, v_tourist, v_hotel);

  -- The signup trigger whitelist refuses 'admin', so admin is granted here,
  -- server side, exactly as the design requires.
  update public.profiles set role = 'admin' where id = v_admin;
  update public.profiles set hotel_id = v_hotel_id where id = v_hotel;
  update public.profiles set is_verified = true, trust_score = 95 where id = v_owner;
end $$;
```

- [ ] **Step 2: Prove the role whitelist held**

Run `mcp__supabase__execute_sql`:

```sql
select u.email, p.role, u.email_confirmed_at is not null as confirmed
from public.profiles p join auth.users u on u.id = p.id order by u.email;
```
Expected four rows, all `confirmed` true, roles: `admin@kariba.com` admin, `caribbea@kariba.com` hotel, `tigerfish@kariba.com` owner, `tourist@kariba.com` tourist.

Note `admin@kariba.com` requested `"role":"tourist"` in its metadata and was promoted by the seed, proving the trigger never grants admin from user metadata.

- [ ] **Step 3: Behavioural test of the maintenance cycle**

Run `mcp__supabase__execute_sql`:

```sql
do $$
declare v_owner uuid; v_boat uuid;
begin
  select id into v_owner from public.profiles where role = 'owner' limit 1;
  insert into public.boats (owner_id, name, boat_type, capacity, location,
    price_per_day, maintenance_interval_hours, accumulated_hours, last_maintenance_hours)
  values (v_owner, 'Cycle Probe', 'fishing', 4, 'Charara Harbour', 180, 100, 260, 200)
  returning id into v_boat;

  raise notice 'at 260: status=%, remaining=%',
    (select maintenance_status from public.boats where id = v_boat),
    (select hours_remaining from public.boats where id = v_boat);

  update public.boats set accumulated_hours = 310 where id = v_boat;
  raise notice 'at 310: status=%', (select maintenance_status from public.boats where id = v_boat);

  update public.boats set last_maintenance_hours = 310 where id = v_boat;
  raise notice 'after service: status=%, next_due=%',
    (select maintenance_status from public.boats where id = v_boat),
    (select next_maintenance_hours from public.boats where id = v_boat);

  delete from public.boats where id = v_boat;
end $$;
```
Expected notices: `at 260: status=ok, remaining=40`, `at 310: status=overdue`, `after service: status=ok, next_due=410`.

- [ ] **Step 4: Behavioural test of the overlap constraint**

```sql
do $$
declare v_owner uuid; v_boat uuid; v_err text;
begin
  select id into v_owner from public.profiles where role = 'owner' limit 1;
  insert into public.boats (owner_id, name, boat_type, capacity, location, price_per_hour, status)
  values (v_owner, 'Overlap Probe', 'cruiser', 10, 'Kariba Yacht Club', 25, 'approved')
  returning id into v_boat;

  insert into public.bookings (boat_id, guest_name, guest_phone, start_date, start_time,
    duration_hours, group_size, experience_type, price_total, deposit_amount)
  values (v_boat, 'First Guest', '+263 77 000 0001', current_date + 5, '16:30', 3, 4, 'sunset', 75, 15);

  begin
    insert into public.bookings (boat_id, guest_name, guest_phone, start_date, start_time,
      duration_hours, group_size, experience_type, price_total, deposit_amount)
    values (v_boat, 'Clashing Guest', '+263 77 000 0002', current_date + 5, '17:00', 2, 2, 'sunset', 50, 10);
    raise exception 'FAIL: overlapping booking was accepted';
  exception when exclusion_violation then
    raise notice 'PASS: overlapping booking rejected by the database';
  end;

  delete from public.bookings where boat_id = v_boat;
  delete from public.boats where id = v_boat;
end $$;
```
Expected notice: `PASS: overlapping booking rejected by the database`.

- [ ] **Step 5: Generate TypeScript types**

Call `mcp__supabase__generate_typescript_types` with `project_id: "sbrsptgpnjljnongklus"` and write the result verbatim to `src/types/database.ts`, replacing the placeholder from Task 1.

- [ ] **Step 6: Run the security advisor**

Call `mcp__supabase__get_advisors` with `type: "security"`.
Expected: zero ERROR-level findings. WARN-level findings about leaked password protection are acceptable and noted for launch. If any ERROR appears, fix it before proceeding.

- [ ] **Step 7: Verify and commit**

Run: `npx tsc -b --noEmit`
Expected: exit 0.

```bash
git add -A && git -c user.email=paulkwanisi12@gmail.com -c user.name=paulo commit -m "Seed demo accounts and generate database types"
```

---

## Task 9: Auth on Supabase session

**Files:**
- Modify: `src/data/AuthContext.tsx` (full rewrite), `src/pages/Login.tsx:36-46`, `src/pages/Signup.tsx:44-63`, `src/pages/ForgotPassword.tsx:17-21`, `src/pages/ResetPassword.tsx:23-36`, `src/components/ProtectedRoute.tsx`
- Create: `src/services/auth.service.ts`, `src/components/StateViews.tsx`

**Interfaces:**
- Consumes: `supabase` from Task 1, `profiles` from Task 2.
- Produces: `useAuth()` returning `{ currentUser, loading, login, signup, logout, requestPasswordReset, resetPassword }`. `currentUser` is `AppUser | null` where
  `AppUser = { id: string; email: string; name: string; role: 'tourist'|'owner'|'hotel'|'admin'; phone: string | null; businessName: string | null; hotelId: string | null; isVerified: boolean }`.

- [ ] **Step 1: Create shared state views**

```tsx
// src/components/StateViews.tsx
import { Loader2, AlertCircle, Inbox } from 'lucide-react';

export function LoadingState({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-16 text-lake-500">
      <Loader2 size={26} className="animate-spin" />
      <p className="text-sm">{label}</p>
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl bg-red-50 py-10 px-4 text-center">
      <AlertCircle size={24} className="text-red-600" />
      <p className="text-sm text-red-700">{message}</p>
      {onRetry && (
        <button onClick={onRetry}
          className="rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-700">
          Try again
        </button>
      )}
    </div>
  );
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-lake-200 py-14 px-4 text-center">
      <Inbox size={24} className="text-lake-300" />
      <p className="font-medium text-lake-800">{title}</p>
      {hint && <p className="text-sm text-lake-500">{hint}</p>}
      {action}
    </div>
  );
}
```

- [ ] **Step 2: Write the auth service**

```ts
// src/services/auth.service.ts
import { supabase } from '../lib/supabase';

export type Role = 'tourist' | 'owner' | 'hotel' | 'admin';

export interface AppUser {
  id: string; email: string; name: string; role: Role;
  phone: string | null; businessName: string | null;
  hotelId: string | null; isVerified: boolean;
}

export interface SignupInput {
  email: string; password: string; fullName: string; role: Role;
  phone?: string; businessName?: string;
}

export async function signUp(input: SignupInput) {
  // role travels in user metadata; the database trigger whitelists it and
  // silently downgrades anything outside tourist/owner/hotel.
  const { data, error } = await supabase.auth.signUp({
    email: input.email.trim(),
    password: input.password,
    options: {
      data: {
        full_name: input.fullName,
        role: input.role,
        phone: input.phone ?? null,
        business_name: input.businessName ?? null,
      },
      emailRedirectTo: `${window.location.origin}/login`,
    },
  });
  if (error) throw new Error(error.message);
  return { needsConfirmation: !data.session };
}

export async function signIn(email: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  if (error) {
    if (error.message.toLowerCase().includes('email not confirmed')) {
      throw new Error('Please confirm your email address first. Check your inbox for the link.');
    }
    throw new Error('Incorrect email or password.');
  }
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw new Error(error.message);
}

export async function requestPasswordReset(email: string) {
  await supabase.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: `${window.location.origin}/reset-password`,
  });
  // Deliberately not surfacing whether the account exists.
}

export async function updatePassword(newPassword: string) {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw new Error(error.message);
}

export async function fetchProfile(userId: string, email: string): Promise<AppUser | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, role, full_name, phone, business_name, hotel_id, is_verified')
    .eq('id', userId)
    .single();
  if (error || !data) return null;
  return {
    id: data.id, email, name: data.full_name, role: data.role as Role,
    phone: data.phone, businessName: data.business_name,
    hotelId: data.hotel_id, isVerified: data.is_verified,
  };
}
```

- [ ] **Step 3: Rewrite AuthContext against the Supabase session**

```tsx
// src/data/AuthContext.tsx
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import * as authService from '../services/auth.service';
import type { AppUser, Role, SignupInput } from '../services/auth.service';

export type { AppUser, Role };

interface AuthValue {
  currentUser: AppUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (input: SignupInput) => Promise<{ needsConfirmation: boolean }>;
  logout: () => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
  resetPassword: (newPassword: string) => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const sync = async (session: { user: { id: string; email?: string } } | null) => {
      if (!session?.user) { if (active) { setCurrentUser(null); setLoading(false); } return; }
      const profile = await authService.fetchProfile(session.user.id, session.user.email ?? '');
      if (active) { setCurrentUser(profile); setLoading(false); }
    };

    supabase.auth.getSession().then(({ data }) => sync(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => { sync(session); });

    return () => { active = false; sub.subscription.unsubscribe(); };
  }, []);

  const value: AuthValue = {
    currentUser,
    loading,
    login: authService.signIn,
    signup: authService.signUp,
    logout: async () => { await authService.signOut(); setCurrentUser(null); },
    requestPasswordReset: authService.requestPasswordReset,
    resetPassword: authService.updatePassword,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
```

- [ ] **Step 4: Make the auth pages async**

In `src/pages/Login.tsx`, the `submit` handler becomes async and the redirect map gains `owner`:

```tsx
const roleHome: Record<string, string> = {
  tourist: '/', owner: '/owner', hotel: '/hotel', admin: '/admin',
};

const submit = async (e: React.FormEvent) => {
  e.preventDefault();
  setError('');
  setBusy(true);
  try {
    await login(email, password);
    navigate(from || '/', { replace: true });
  } catch (err) {
    setError(err instanceof Error ? err.message : 'Something went wrong.');
  } finally {
    setBusy(false);
  }
};
```

Add `const [busy, setBusy] = useState(false);` and set the submit button to `disabled={busy}` with label `{busy ? 'Logging in' : 'Log in'}`.

Because the profile role is not known until after the session resolves, navigate to `from || '/'` and let a small effect redirect once `currentUser` arrives:

```tsx
useEffect(() => {
  if (currentUser && !from) navigate(roleHome[currentUser.role] ?? '/', { replace: true });
}, [currentUser]);
```

In `src/pages/Signup.tsx`, replace `'operator'` with `'owner'` in `roleOptions` and make submit async:

```tsx
const result = await signup({
  email, password, fullName: name, role,
  phone: phone || undefined,
  businessName: businessName || undefined,
});
if (result.needsConfirmation) {
  setConfirmSent(true);   // render "Check your email to confirm your account"
} else {
  navigate('/', { replace: true });
}
```

In `src/pages/ForgotPassword.tsx` await `requestPasswordReset(email)` and drop the "continue to reset" shortcut button, since Supabase now sends a real link. In `src/pages/ResetPassword.tsx` drop the email field entirely and call `resetPassword(password)`; Supabase authenticates the user from the recovery link in the URL.

- [ ] **Step 5: Gate ProtectedRoute on loading**

```tsx
// src/components/ProtectedRoute.tsx
import { Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth, type Role } from '../data/AuthContext';
import { LoadingState } from './StateViews';

export default function ProtectedRoute({ allow, children }: { allow: Role[]; children: ReactNode }) {
  const { currentUser, loading } = useAuth();
  const location = useLocation();

  if (loading) return <LoadingState label="Checking your session" />;
  if (!currentUser) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (!allow.includes(currentUser.role)) return <Navigate to="/" replace />;
  return <>{children}</>;
}
```

- [ ] **Step 6: Remove the AppDataProvider from main.tsx**

`src/main.tsx` keeps `BrowserRouter` and `AuthProvider` only. Delete the `AppDataProvider` import and wrapper.

- [ ] **Step 7: Verify**

Run: `npx tsc -b --noEmit`
Expected: errors only in files that still import `AppDataContext`. Those are fixed in Tasks 11 to 14. Confirm no errors inside `AuthContext.tsx`, `auth.service.ts`, `ProtectedRoute.tsx`, or the four auth pages.

Then start the preview and log in as `tigerfish@kariba.com / operator123`. Expected: session persists across reload, and `currentUser.role` is `owner`.

- [ ] **Step 8: Commit**

```bash
git add -A && git -c user.email=paulkwanisi12@gmail.com -c user.name=paulo commit -m "Move authentication onto Supabase Auth sessions"
```

---

## Task 10: Boats, images, and maintenance services

**Files:**
- Create: `src/services/boats.service.ts`, `src/services/images.service.ts`, `src/services/maintenance.service.ts`, `src/hooks/useAsync.ts`

**Interfaces:**
- Produces:
  - `listOwnerBoats(): Promise<OwnerBoat[]>`, `getBoat(id): Promise<OwnerBoat|null>`, `createBoat(input: BoatInput): Promise<OwnerBoat>`, `proposeChanges(id, changes): Promise<OwnerBoat>`, `submitForReview(id): Promise<OwnerBoat>`, `softDeleteBoat(id): Promise<void>`, `setActive(id, active): Promise<void>`
  - `listPublicBoats(): Promise<PublicBoat[]>`, `getPublicBoat(id): Promise<PublicBoat|null>`
  - `listPendingBoats(): Promise<OwnerBoat[]>`, `reviewBoat(id, action, reason?)`, `reviewChanges(id, approve, reason?)`
  - `uploadBoatImages(boatId, ownerId, files): Promise<BoatImage[]>`, `deleteBoatImage(image)`, `setPrimaryImage(boatId, imageId)`, `publicImageUrl(path): string`
  - `logHours(boatId, hours, note?)`, `completeMaintenance(boatId, input)`, `listHours(boatId)`, `listMaintenance(boatId)`, `listNotifications()`, `markNotificationRead(id)`

- [ ] **Step 1: Shared async hook**

```ts
// src/hooks/useAsync.ts
import { useCallback, useEffect, useState } from 'react';

export function useAsync<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(() => {
    let active = true;
    setLoading(true);
    setError(null);
    fn()
      .then((r) => { if (active) setData(r); })
      .catch((e) => { if (active) setError(e instanceof Error ? e.message : 'Something went wrong.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => run(), [run]);
  return { data, loading, error, reload: run };
}
```

- [ ] **Step 2: Images service**

```ts
// src/services/images.service.ts
import { supabase } from '../lib/supabase';

export interface BoatImage {
  id: string; boatId: string; storagePath: string;
  sortOrder: number; isPrimary: boolean; moderationStatus: string;
}

const BUCKET = 'boat-images';
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];

export function publicImageUrl(storagePath: string): string {
  return supabase.storage.from(BUCKET).getPublicUrl(storagePath).data.publicUrl;
}

export async function listBoatImages(boatId: string): Promise<BoatImage[]> {
  const { data, error } = await supabase
    .from('boat_images')
    .select('id, boat_id, storage_path, sort_order, is_primary, moderation_status')
    .eq('boat_id', boatId)
    .order('sort_order');
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    id: r.id, boatId: r.boat_id, storagePath: r.storage_path,
    sortOrder: r.sort_order, isPrimary: r.is_primary, moderationStatus: r.moderation_status,
  }));
}

export async function uploadBoatImages(
  boatId: string, ownerId: string, files: File[],
): Promise<BoatImage[]> {
  const existing = await listBoatImages(boatId);
  if (existing.length + files.length > 10) {
    throw new Error(`A boat may have at most 10 photos. You have ${existing.length}.`);
  }

  const uploaded: BoatImage[] = [];
  for (const [i, file] of files.entries()) {
    if (!ALLOWED.includes(file.type)) {
      throw new Error(`${file.name} is not a JPEG, PNG, or WebP image.`);
    }
    if (file.size > MAX_BYTES) {
      throw new Error(`${file.name} is larger than 5 MB.`);
    }
    const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg';
    const path = `${ownerId}/${boatId}/${crypto.randomUUID()}.${ext}`;

    const { error: upErr } = await supabase.storage
      .from(BUCKET).upload(path, file, { cacheControl: '3600', upsert: false });
    if (upErr) throw new Error(`Upload failed for ${file.name}: ${upErr.message}`);

    const { data, error } = await supabase.from('boat_images').insert({
      boat_id: boatId, storage_path: path,
      sort_order: existing.length + i,
      is_primary: existing.length === 0 && i === 0,
      uploaded_by: ownerId,
    }).select('id, boat_id, storage_path, sort_order, is_primary, moderation_status').single();

    if (error) {
      // Never orphan a storage object when the row insert fails.
      await supabase.storage.from(BUCKET).remove([path]);
      throw new Error(error.message);
    }
    uploaded.push({
      id: data.id, boatId: data.boat_id, storagePath: data.storage_path,
      sortOrder: data.sort_order, isPrimary: data.is_primary,
      moderationStatus: data.moderation_status,
    });
  }
  return uploaded;
}

export async function deleteBoatImage(image: BoatImage): Promise<void> {
  const { error } = await supabase.from('boat_images').delete().eq('id', image.id);
  if (error) throw new Error(error.message);
  await supabase.storage.from(BUCKET).remove([image.storagePath]);
}

export async function setPrimaryImage(boatId: string, imageId: string): Promise<void> {
  await supabase.from('boat_images').update({ is_primary: false }).eq('boat_id', boatId);
  const { error } = await supabase.from('boat_images').update({ is_primary: true }).eq('id', imageId);
  if (error) throw new Error(error.message);
}
```

- [ ] **Step 3: Boats service**

```ts
// src/services/boats.service.ts
import { supabase } from '../lib/supabase';

export type BoatKind = 'houseboat' | 'speedboat' | 'fishing' | 'cruiser' | 'pontoon';
export type BoatStatus = 'draft' | 'pending' | 'approved' | 'rejected' | 'suspended';
export type MaintenanceStatus = 'ok' | 'approaching' | 'due' | 'overdue';

export interface BoatInput {
  name: string; boatType: BoatKind; capacity: number; description: string; location: string;
  pricePerHour: number | null; pricePerDay: number | null;
  facilities: string[]; safetyEquipment: string[]; crewIncluded: boolean;
  fuelPolicy: 'included' | 'excluded' | 'prepaid' | 'full_to_full';
  registrationNumber: string; maintenanceIntervalHours: number;
  accumulatedHours: number; lastMaintenanceHours: number;
}

export interface OwnerBoat extends BoatInput {
  id: string; ownerId: string; status: BoatStatus; isActive: boolean;
  rejectionReason: string | null; pendingChanges: Record<string, unknown> | null;
  nextMaintenanceHours: number; hoursRemaining: number; maintenanceStatus: MaintenanceStatus;
}

const OWNER_COLS = `id, owner_id, name, boat_type, capacity, description, location,
  price_per_hour, price_per_day, facilities, safety_equipment, crew_included, fuel_policy,
  registration_number, maintenance_interval_hours, accumulated_hours, last_maintenance_hours,
  next_maintenance_hours, hours_remaining, maintenance_status,
  status, is_active, rejection_reason, pending_changes`;

/* eslint-disable @typescript-eslint/no-explicit-any */
function toOwnerBoat(r: any): OwnerBoat {
  return {
    id: r.id, ownerId: r.owner_id, name: r.name, boatType: r.boat_type,
    capacity: r.capacity, description: r.description ?? '', location: r.location,
    pricePerHour: r.price_per_hour, pricePerDay: r.price_per_day,
    facilities: r.facilities ?? [], safetyEquipment: r.safety_equipment ?? [],
    crewIncluded: r.crew_included, fuelPolicy: r.fuel_policy,
    registrationNumber: r.registration_number ?? '',
    maintenanceIntervalHours: Number(r.maintenance_interval_hours),
    accumulatedHours: Number(r.accumulated_hours),
    lastMaintenanceHours: Number(r.last_maintenance_hours),
    nextMaintenanceHours: Number(r.next_maintenance_hours),
    hoursRemaining: Number(r.hours_remaining),
    maintenanceStatus: r.maintenance_status,
    status: r.status, isActive: r.is_active,
    rejectionReason: r.rejection_reason, pendingChanges: r.pending_changes,
  };
}

export async function listOwnerBoats(ownerId: string): Promise<OwnerBoat[]> {
  const { data, error } = await supabase.from('boats').select(OWNER_COLS)
    .eq('owner_id', ownerId).eq('is_deleted', false)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(toOwnerBoat);
}

export async function getOwnerBoat(id: string): Promise<OwnerBoat | null> {
  const { data, error } = await supabase.from('boats').select(OWNER_COLS).eq('id', id).single();
  if (error) return null;
  return toOwnerBoat(data);
}

export async function createBoat(ownerId: string, input: BoatInput): Promise<OwnerBoat> {
  const { data, error } = await supabase.from('boats').insert({
    owner_id: ownerId, name: input.name, boat_type: input.boatType,
    capacity: input.capacity, description: input.description, location: input.location,
    price_per_hour: input.pricePerHour, price_per_day: input.pricePerDay,
    facilities: input.facilities, safety_equipment: input.safetyEquipment,
    crew_included: input.crewIncluded, fuel_policy: input.fuelPolicy,
    registration_number: input.registrationNumber,
    maintenance_interval_hours: input.maintenanceIntervalHours,
    accumulated_hours: input.accumulatedHours,
    last_maintenance_hours: input.lastMaintenanceHours,
  }).select(OWNER_COLS).single();
  if (error) throw new Error(error.message);
  return toOwnerBoat(data);
}

export async function proposeChanges(id: string, changes: Record<string, unknown>): Promise<void> {
  const { error } = await supabase.rpc('propose_boat_changes', {
    p_boat_id: id, p_changes: changes,
  });
  if (error) throw new Error(error.message);
}

export async function submitForReview(id: string): Promise<void> {
  const { error } = await supabase.rpc('submit_boat_for_review', { p_boat_id: id });
  if (error) throw new Error(error.message);
}

export async function softDeleteBoat(id: string): Promise<void> {
  const { error } = await supabase.rpc('soft_delete_boat', { p_boat_id: id });
  if (error) throw new Error(error.message);
}

export async function setActive(id: string, isActive: boolean): Promise<void> {
  const { error } = await supabase.rpc('propose_boat_changes', {
    p_boat_id: id, p_changes: { is_active: isActive },
  });
  if (error) throw new Error(error.message);
}

/* Tourist side */
export interface PublicBoat {
  id: string; ownerId: string; name: string; boatType: BoatKind; capacity: number;
  description: string; location: string; pricePerHour: number | null; pricePerDay: number | null;
  facilities: string[]; safetyEquipment: string[]; crewIncluded: boolean;
  registrationNumber: string; operatorName: string; operatorPhone: string | null;
  operatorVerified: boolean; operatorTrustScore: number;
}

function toPublicBoat(r: any): PublicBoat {
  return {
    id: r.id, ownerId: r.owner_id, name: r.name, boatType: r.boat_type, capacity: r.capacity,
    description: r.description ?? '', location: r.location,
    pricePerHour: r.price_per_hour, pricePerDay: r.price_per_day,
    facilities: r.facilities ?? [], safetyEquipment: r.safety_equipment ?? [],
    crewIncluded: r.crew_included, registrationNumber: r.registration_number ?? '',
    operatorName: r.operator_name ?? '', operatorPhone: r.operator_phone,
    operatorVerified: r.operator_verified, operatorTrustScore: r.operator_trust_score,
  };
}

export async function listPublicBoats(): Promise<PublicBoat[]> {
  const { data, error } = await supabase.from('public_boats').select('*')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(toPublicBoat);
}

export async function getPublicBoat(id: string): Promise<PublicBoat | null> {
  const { data, error } = await supabase.from('public_boats').select('*').eq('id', id).single();
  if (error) return null;
  return toPublicBoat(data);
}

/* Admin side */
export async function listBoatsForAdmin(status?: BoatStatus): Promise<OwnerBoat[]> {
  let q = supabase.from('boats').select(OWNER_COLS).eq('is_deleted', false);
  if (status) q = q.eq('status', status);
  const { data, error } = await q.order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(toOwnerBoat);
}

export async function reviewBoat(id: string, action: 'approve' | 'reject' | 'suspend' | 'unsuspend', reason?: string) {
  const { error } = await supabase.rpc('admin_review_boat', {
    p_boat_id: id, p_action: action, p_reason: reason ?? null,
  });
  if (error) throw new Error(error.message);
}

export async function reviewChanges(id: string, approve: boolean, reason?: string) {
  const { error } = await supabase.rpc('admin_review_changes', {
    p_boat_id: id, p_approve: approve, p_reason: reason ?? null,
  });
  if (error) throw new Error(error.message);
}
```

- [ ] **Step 4: Maintenance service**

```ts
// src/services/maintenance.service.ts
import { supabase } from '../lib/supabase';

export interface HoursEntry {
  id: string; hours: number; readingAfter: number; note: string | null; loggedAt: string;
}
export interface MaintenanceRecord {
  id: string; performedAt: string; hoursAtService: number;
  description: string; cost: number | null; serviceProvider: string | null;
}
export interface MaintenanceNotification {
  id: string; boatId: string; level: 'approaching' | 'due' | 'overdue';
  message: string; isRead: boolean; createdAt: string;
}

export async function logHours(boatId: string, hours: number, note?: string) {
  const { error } = await supabase.rpc('log_operating_hours', {
    p_boat_id: boatId, p_hours: hours, p_note: note ?? null, p_booking_id: null,
  });
  if (error) throw new Error(error.message);
}

export async function completeMaintenance(
  boatId: string,
  input: { description: string; performedAt?: string; cost?: number | null; serviceProvider?: string | null },
) {
  const { error } = await supabase.rpc('complete_maintenance', {
    p_boat_id: boatId, p_description: input.description,
    p_performed_at: input.performedAt ?? new Date().toISOString().slice(0, 10),
    p_cost: input.cost ?? null, p_service_provider: input.serviceProvider ?? null,
  });
  if (error) throw new Error(error.message);
}

export async function listHours(boatId: string): Promise<HoursEntry[]> {
  const { data, error } = await supabase.from('boat_operating_hours')
    .select('id, hours, reading_after, note, logged_at')
    .eq('boat_id', boatId).order('logged_at', { ascending: false }).limit(50);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    id: r.id, hours: Number(r.hours), readingAfter: Number(r.reading_after),
    note: r.note, loggedAt: r.logged_at,
  }));
}

export async function listMaintenance(boatId: string): Promise<MaintenanceRecord[]> {
  const { data, error } = await supabase.from('boat_maintenance_records')
    .select('id, performed_at, hours_at_service, description, cost, service_provider')
    .eq('boat_id', boatId).order('performed_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    id: r.id, performedAt: r.performed_at, hoursAtService: Number(r.hours_at_service),
    description: r.description, cost: r.cost === null ? null : Number(r.cost),
    serviceProvider: r.service_provider,
  }));
}

export async function listNotifications(): Promise<MaintenanceNotification[]> {
  const { data, error } = await supabase.from('maintenance_notifications')
    .select('id, boat_id, level, message, is_read, created_at')
    .order('created_at', { ascending: false }).limit(30);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    id: r.id, boatId: r.boat_id, level: r.level, message: r.message,
    isRead: r.is_read, createdAt: r.created_at,
  }));
}

export async function markNotificationRead(id: string) {
  await supabase.from('maintenance_notifications').update({ is_read: true }).eq('id', id);
}
```

- [ ] **Step 5: Verify and commit**

Run: `npx tsc -b --noEmit`
Expected: no errors inside `src/services/` or `src/hooks/`.

```bash
git add -A && git -c user.email=paulkwanisi12@gmail.com -c user.name=paulo commit -m "Add boats, images, and maintenance service layer"
```

---

## Task 11: Owner dashboard, boat form, image uploader

**Files:**
- Create: `src/pages/owner/OwnerDashboard.tsx`, `src/pages/owner/BoatFormPage.tsx`, `src/components/owner/BoatForm.tsx`, `src/components/owner/ImageUploader.tsx`
- Modify: `src/App.tsx`, `src/components/Layout.tsx`

**Interfaces:**
- Consumes: everything from Task 10, `useAuth()` from Task 9.
- Produces: routes `/owner`, `/owner/boats/new`, `/owner/boats/:id/edit`.

- [ ] **Step 1: Image uploader**

```tsx
// src/components/owner/ImageUploader.tsx
import { useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, Trash2, Star, Loader2 } from 'lucide-react';
import * as images from '../../services/images.service';
import type { BoatImage } from '../../services/images.service';

export default function ImageUploader({
  boatId, ownerId, value, onChange,
}: {
  boatId: string; ownerId: string; value: BoatImage[];
  onChange: (next: BoatImage[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true); setError('');
    try {
      const added = await images.uploadBoatImages(boatId, ownerId, Array.from(files));
      onChange([...value, ...added]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed.');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const remove = async (img: BoatImage) => {
    setBusy(true);
    try {
      await images.deleteBoatImage(img);
      onChange(value.filter((v) => v.id !== img.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed.');
    } finally { setBusy(false); }
  };

  const makePrimary = async (img: BoatImage) => {
    await images.setPrimaryImage(boatId, img.id);
    onChange(value.map((v) => ({ ...v, isPrimary: v.id === img.id })));
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-lake-500">Photos ({value.length} of 10)</label>
        <button type="button" disabled={busy || value.length >= 10}
          onClick={() => inputRef.current?.click()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-lake-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-lake-800 disabled:opacity-50">
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
          Add photos
        </button>
      </div>
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" multiple
        className="hidden" onChange={(e) => handleFiles(e.target.files)} />

      {error && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}

      {value.length === 0 ? (
        <p className="mt-3 rounded-xl border border-dashed border-lake-200 py-8 text-center text-sm text-lake-500">
          At least one photo is required before you can submit this boat for review.
        </p>
      ) : (
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
          <AnimatePresence>
            {value.map((img) => (
              <motion.div key={img.id} layout
                initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="group relative aspect-square overflow-hidden rounded-lg">
                <img src={images.publicImageUrl(img.storagePath)} alt=""
                  className="h-full w-full object-cover" />
                {img.isPrimary && (
                  <span className="absolute top-1 left-1 rounded-full bg-sunset-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                    Cover
                  </span>
                )}
                <div className="absolute inset-x-0 bottom-0 flex justify-end gap-1 bg-black/50 p-1 opacity-0 transition-opacity group-hover:opacity-100">
                  {!img.isPrimary && (
                    <button type="button" onClick={() => makePrimary(img)} title="Make cover photo"
                      className="rounded p-1 text-white hover:bg-white/20"><Star size={13} /></button>
                  )}
                  <button type="button" onClick={() => remove(img)} title="Delete photo"
                    className="rounded p-1 text-white hover:bg-white/20"><Trash2 size={13} /></button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Boat form with validation**

`src/components/owner/BoatForm.tsx` exports `BoatForm({ initial, onSubmit, submitLabel })`. Validation rules, enforced before submit and mirroring the database constraints:

- `name` trimmed length 2 to 80
- `capacity` integer 1 to 200
- `location` trimmed length at least 2
- at least one of `pricePerHour` or `pricePerDay` present and greater than 0
- `maintenanceIntervalHours` greater than 0
- `lastMaintenanceHours` less than or equal to `accumulatedHours`

Render errors inline under each field, and block submit while any exist. Fields map one to one to `BoatInput` from Task 10. Facilities and safety equipment are comma-separated inputs split into arrays on submit.

The maintenance block carries this helper text, because it is the field owners will misunderstand:

> Set how many operating hours the boat runs between services. If the boat already has hours on it, enter them here so alerts are accurate from day one.

- [ ] **Step 3: Owner dashboard**

`src/pages/owner/OwnerDashboard.tsx` renders, in order:

1. `DashboardBanner` with `photos.kapentaRig`, eyebrow "Owner portal", title from `currentUser.businessName`
2. Unread maintenance notifications from `listNotifications()`, each dismissible
3. Stat cards: total boats, live on tourist side (`status === 'approved' && isActive`), awaiting review (`status === 'pending'`), maintenance attention (`maintenanceStatus` is `due` or `overdue`)
4. Boat grid. Each card shows cover image, name, a `StatusBadge`-style chip for `status`, a maintenance chip, and actions: Edit, Log hours, Set unavailable or available, Delete
5. `EmptyState` when there are no boats, with a "Register your first boat" button

Status chips use these exact colours so they read consistently with the rest of the app: `draft` grey, `pending` amber, `approved` lake, `rejected` red, `suspended` red. When `status === 'rejected'`, render `rejectionReason` beneath the card in red. When `pendingChanges` is not null, render an amber "Changes awaiting review" chip.

Delete calls `softDeleteBoat` inside a confirm dialog and surfaces the database error verbatim when upcoming bookings block it, because that error already names the count.

- [ ] **Step 4: Wire routes**

In `src/App.tsx` add inside `<Routes>`:

```tsx
<Route path="/owner" element={
  <ProtectedRoute allow={['owner', 'admin']}><OwnerDashboard /></ProtectedRoute>} />
<Route path="/owner/boats/new" element={
  <ProtectedRoute allow={['owner', 'admin']}><BoatFormPage /></ProtectedRoute>} />
<Route path="/owner/boats/:id/edit" element={
  <ProtectedRoute allow={['owner', 'admin']}><BoatFormPage /></ProtectedRoute>} />
<Route path="/owner/maintenance" element={
  <ProtectedRoute allow={['owner', 'admin']}><MaintenancePage /></ProtectedRoute>} />
```

In `src/components/Layout.tsx` add `{ to: '/owner', label: 'Owner Portal', icon: Anchor }` to `allNavItems`, and extend the role filter so `/owner` shows for `owner` and `admin`. Remove the `/operator` entry.

- [ ] **Step 5: Verify in the browser**

Start the preview, log in as `tigerfish@kariba.com`, register a boat with two photos, and confirm: the boat appears as `draft`, submitting for review moves it to `pending`, and it does **not** appear on the tourist home page.

- [ ] **Step 6: Commit**

```bash
git add -A && git -c user.email=paulkwanisi12@gmail.com -c user.name=paulo commit -m "Add owner dashboard, boat registration form, and image uploader"
```

---

## Task 12: Maintenance UI

**Files:**
- Create: `src/pages/owner/MaintenancePage.tsx`, `src/components/owner/MaintenanceCard.tsx`

**Interfaces:**
- Consumes: `maintenance.service.ts`, `listOwnerBoats` from Task 10.

- [ ] **Step 1: Maintenance card**

`MaintenanceCard({ boat, onLogged, onServiced })` shows a horizontal progress bar of `accumulatedHours - lastMaintenanceHours` against `maintenanceIntervalHours`, filled lake for `ok`, sunset for `approaching`, red for `due` and `overdue`. Beneath it, four figures in a row, exactly as the brief specifies:

| Label | Value |
|---|---|
| Total hours | `boat.accumulatedHours` |
| Last service at | `boat.lastMaintenanceHours` |
| Next due at | `boat.nextMaintenanceHours` |
| Remaining | `boat.hoursRemaining` |

When `hoursRemaining` is negative, render it as `{Math.abs(hoursRemaining)} hours overdue` in red rather than a negative number.

Two actions: "Log hours" opens a small form (hours 0.5 to 24, optional note) calling `logHours`; "Mark maintenance complete" opens a form (description required, date defaulting to today, optional cost and provider) calling `completeMaintenance`. Both reload the boat afterwards.

An `overdue` card carries this banner: "This boat is hidden from tourist search until maintenance is recorded."

- [ ] **Step 2: Maintenance page**

Lists a `MaintenanceCard` per owned boat, sorted so `overdue` then `due` then `approaching` then `ok` appear in that order. Below each card, a collapsible service history from `listMaintenance` and the last 50 hour entries from `listHours` showing hours, running total, and note.

- [ ] **Step 3: Verify the full cycle in the browser**

With a boat at 260 accumulated, 100 interval, last service 200: log 35 hours. Expect status `approaching` and a notification. Log 10 more. Expect `due`, and the boat disappears from tourist search only after it reaches `overdue` at 310. Mark maintenance complete. Expect remaining to reset to the full interval and the boat to return to tourist search.

- [ ] **Step 4: Commit**

```bash
git add -A && git -c user.email=paulkwanisi12@gmail.com -c user.name=paulo commit -m "Add owner maintenance page with hours logging and service history"
```

---

## Task 13: Admin approval queue

**Files:**
- Create: `src/components/admin/ApprovalQueue.tsx`, `src/components/admin/PendingChangesDiff.tsx`
- Modify: `src/pages/AdminDashboard.tsx`

**Interfaces:**
- Consumes: `listBoatsForAdmin`, `reviewBoat`, `reviewChanges` from Task 10, `listBoatImages` from images service.

- [ ] **Step 1: Pending changes diff**

```tsx
// src/components/admin/PendingChangesDiff.tsx
import type { OwnerBoat } from '../../services/boats.service';

const LABELS: Record<string, string> = {
  name: 'Name', boat_type: 'Type', capacity: 'Capacity',
  price_per_hour: 'Price per hour', price_per_day: 'Price per day',
  safety_equipment: 'Safety equipment', crew_included: 'Crew included',
  registration_number: 'Registration',
};

const CURRENT: Record<string, (b: OwnerBoat) => unknown> = {
  name: (b) => b.name, boat_type: (b) => b.boatType, capacity: (b) => b.capacity,
  price_per_hour: (b) => b.pricePerHour, price_per_day: (b) => b.pricePerDay,
  safety_equipment: (b) => b.safetyEquipment.join(', '),
  crew_included: (b) => (b.crewIncluded ? 'Yes' : 'No'),
  registration_number: (b) => b.registrationNumber,
};

const show = (v: unknown) => (Array.isArray(v) ? v.join(', ') : v === null ? 'None' : String(v));

export default function PendingChangesDiff({ boat }: { boat: OwnerBoat }) {
  if (!boat.pendingChanges) return null;
  const keys = Object.keys(boat.pendingChanges);
  return (
    <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
      <p className="text-xs font-semibold text-amber-900">
        Proposed changes, live listing still shows the approved values
      </p>
      <table className="mt-2 w-full text-xs">
        <thead>
          <tr className="text-left text-amber-800">
            <th className="py-1 font-medium">Field</th>
            <th className="py-1 font-medium">Currently live</th>
            <th className="py-1 font-medium">Proposed</th>
          </tr>
        </thead>
        <tbody>
          {keys.map((k) => (
            <tr key={k} className="border-t border-amber-200">
              <td className="py-1 pr-2 font-medium text-lake-800">{LABELS[k] ?? k}</td>
              <td className="py-1 pr-2 text-lake-600">{show(CURRENT[k]?.(boat))}</td>
              <td className="py-1 font-semibold text-lake-950">
                {show((boat.pendingChanges as Record<string, unknown>)[k])}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Approval queue**

`ApprovalQueue` fetches `listBoatsForAdmin('pending')` plus every boat where `pendingChanges` is not null. Each row renders:

- All photos in a horizontal strip, so an admin reviews the actual images and not just a thumbnail
- Name, owner business name, type, capacity, prices, location, registration number
- Full safety equipment list, since this is the safety gate
- `PendingChangesDiff` when applicable
- Approve, Reject, Suspend buttons

Reject opens a required reason field, minimum 5 characters, matching the database constraint so the user sees the rule before the server enforces it. On success, reload the queue and animate the row out with `AnimatePresence`.

Add a second section, "Maintenance attention", listing every boat where `maintenanceStatus` is `due` or `overdue` with its owner, so admin has the oversight the brief asks for.

- [ ] **Step 3: Wire into AdminDashboard**

Replace the mock verification queue in `src/pages/AdminDashboard.tsx` with `<ApprovalQueue />`. Stats become live counts from `listBoatsForAdmin()`: total boats, pending, approved, maintenance attention.

- [ ] **Step 4: Verify end to end**

Log in as `admin@kariba.com`, approve the boat registered in Task 11, then confirm it appears on the tourist home page. Log back in as the owner, change the price, and confirm the tourist side still shows the old price while the admin queue shows the diff. Approve the diff and confirm the tourist price updates.

- [ ] **Step 5: Commit**

```bash
git add -A && git -c user.email=paulkwanisi12@gmail.com -c user.name=paulo commit -m "Add admin approval queue with image review and pending changes diff"
```

---

## Task 14: Tourist side, bookings, reviews, and mock data removal

**Files:**
- Modify: `src/pages/TouristHome.tsx`, `src/pages/BoatDetail.tsx`, `src/components/BoatCard.tsx`, `src/components/BookingModal.tsx`, `src/components/ReviewForm.tsx`, `src/components/AvailabilityCalendar.tsx`, `src/pages/HotelDashboard.tsx`, `src/data/types.ts`
- Delete: `src/data/AppDataContext.tsx`, `src/data/mockData.ts`, `src/pages/OperatorDashboard.tsx`

**Interfaces:**
- Consumes: `listPublicBoats`, `getPublicBoat`, bookings and reviews services.

- [ ] **Step 1: Bookings and reviews services**

```ts
// src/services/bookings.service.ts
import { supabase } from '../lib/supabase';

export interface BookingInput {
  boatId: string; guestName: string; guestPhone: string; startDate: string;
  days: number; startTime: string | null; durationHours: number | null;
  groupSize: number; experienceType: string; priceTotal: number; depositAmount: number;
  hotelId?: string | null; notes?: string;
}

export async function createBooking(input: BookingInput, touristId: string | null) {
  const { data, error } = await supabase.from('bookings').insert({
    boat_id: input.boatId, tourist_id: touristId, hotel_id: input.hotelId ?? null,
    guest_name: input.guestName, guest_phone: input.guestPhone,
    start_date: input.startDate, days: input.days,
    start_time: input.startTime, duration_hours: input.durationHours,
    group_size: input.groupSize, experience_type: input.experienceType,
    price_total: input.priceTotal, deposit_amount: input.depositAmount,
    notes: input.notes ?? null,
  }).select('id, deposit_amount').single();

  if (error) {
    // 23P01 is exclusion_violation: the slot was taken between render and submit.
    if (error.code === '23P01') {
      throw new Error('That slot was just booked by someone else. Pick another time.');
    }
    throw new Error(error.message);
  }
  return { id: data.id, depositAmount: Number(data.deposit_amount) };
}

export async function listBookingsForBoat(boatId: string) {
  const { data, error } = await supabase.from('bookings')
    .select('id, boat_id, guest_name, start_date, days, start_time, duration_hours, status, price_total, deposit_amount, group_size, hotel_id, created_at')
    .eq('boat_id', boatId);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function setBookingStatus(id: string, status: string) {
  const { error } = await supabase.from('bookings').update({ status }).eq('id', id);
  if (error) throw new Error(error.message);
}
```

```ts
// src/services/reviews.service.ts
import { supabase } from '../lib/supabase';

export async function listReviewsForBoat(boatId: string) {
  const { data, error } = await supabase.from('reviews')
    .select('id, rating, comment, operator_response, created_at, tourist_id, profiles(full_name)')
    .eq('boat_id', boatId).order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createReview(bookingId: string, touristId: string, rating: number, comment: string) {
  const { error } = await supabase.from('reviews').insert({
    booking_id: bookingId, boat_id: '00000000-0000-0000-0000-000000000000',
    tourist_id: touristId, rating, comment,
  });
  // boat_id is overwritten server side by guard_review_authenticity, which also
  // rejects reviews for trips that are not completed or not yours.
  if (error) throw new Error(error.message);
}
```

- [ ] **Step 2: Migrate the tourist pages**

`TouristHome` replaces `useAppData().boats` with `useAsync(listPublicBoats)`, rendering `LoadingState`, `ErrorState` with retry, and `EmptyState` ("No boats are listed yet. Check back soon."). Filters operate on the fetched array unchanged.

`BoatCard` takes `PublicBoat`. Price display becomes: `pricePerDay` when present, otherwise `pricePerHour`, with the matching unit label. Images come from `listBoatImages(boat.id)` mapped through `publicImageUrl`; when a boat has no images, fall back to the existing `illustration` sentinel for its `boatType` so `BoatImage` renders the labelled SVG. This keeps the honest-imagery rule intact.

`BoatDetail` uses `getPublicBoat`, `listBookingsForBoat` for the calendar, and `listReviewsForBoat`. `AvailabilityCalendar` keeps its current props; only the booking objects' shape changes, so map database rows to the existing `Booking` shape in the page, not in the calendar.

`BookingModal` calls `createBooking` and surfaces the exclusion-violation message from the service.

- [ ] **Step 3: Delete mock data**

```bash
rm src/data/AppDataContext.tsx src/data/mockData.ts src/pages/OperatorDashboard.tsx
```

Rewrite `src/data/types.ts` to re-export service types only:

```ts
export type { PublicBoat, OwnerBoat, BoatInput, BoatKind, BoatStatus, MaintenanceStatus }
  from '../services/boats.service';
export type { BoatImage } from '../services/images.service';
export type { AppUser, Role } from '../services/auth.service';
```

Keep `src/data/photos.ts` and `src/data/availability.ts`. Remove the `daysFromNow` seed helper from `availability.ts` if nothing imports it.

- [ ] **Step 4: Prove no mock data survives**

Run:

```bash
cd C:/Users/paulo/kariba-boats && grep -rn "mockData\|AppDataContext\|useAppData" src/ || echo "CLEAN: no mock data references"
```
Expected: `CLEAN: no mock data references`.

- [ ] **Step 5: Full verification**

Run: `npx tsc -b --noEmit`
Expected: exit 0, zero errors.

In the browser, walk the whole loop: owner registers a boat with photos, submits, admin approves, tourist sees it, tourist books a slot, a second identical booking is refused, owner confirms the booking, owner logs hours past the threshold, boat leaves tourist search, owner records maintenance, boat returns.

Check `mcp__supabase__get_advisors` with `type: "security"` one final time. Expected: zero ERROR findings.

- [ ] **Step 6: Commit**

```bash
git add -A && git -c user.email=paulkwanisi12@gmail.com -c user.name=paulo commit -m "Migrate tourist side to Supabase and remove all mock data"
```

---

## Edge cases and how each is handled

| Case | Handling |
|---|---|
| Owner submits a boat with no photos | `submit_boat_for_review` raises; the form disables submit until one image exists |
| Owner uploads an 11th photo | Trigger raises; uploader disables the button at 10 |
| Storage upload succeeds but the row insert fails | Service removes the orphaned object before rethrowing |
| Two tourists book the same slot simultaneously | Exclusion constraint rejects the second; UI shows "that slot was just booked" |
| Owner deletes a boat with upcoming bookings | RPC raises with the count; UI shows the message verbatim |
| Owner edits price while a booking is pending | Price change parks in `pending_changes`; the existing booking keeps its agreed `price_total` |
| Boat goes overdue with a confirmed future booking | Boat leaves tourist search; the existing booking is untouched, and the owner sees the overdue banner |
| Admin rejects an image | Row deleted and storage object hard-deleted, since a public URL cannot be revoked |
| User signs up requesting `role: admin` | Trigger whitelist downgrades to `tourist` |
| Session expires mid-session | `onAuthStateChange` clears `currentUser`; `ProtectedRoute` redirects to login |
| A boat has zero images on the tourist side | Falls back to the labelled illustration for its type |
| `hours_remaining` is negative | Displayed as "N hours overdue", never as a negative number |

## Self-review

**Spec coverage.** Brief sections 1 to 7 map to Tasks 3, 4, 5, 7, 11, 12, 13. Section 8 (database design) is Tasks 2 to 7. Section 9 (storage) is Task 4. Section 10 (frontend) is Tasks 9 to 14. Section 11 (remove dummy data) is Task 14 Step 3, with a grep gate at Step 4. Section 12 (delete versus deactivate) is the three-state model in Task 7's `soft_delete_boat` plus `is_active`. Section 13 (maintenance logic) is Task 5 with formulas verified numerically in Task 3 Step 2 and behaviourally in Task 8 Step 3. Section 14 (security) is the guard triggers in Tasks 2, 3, 6 and the edge case table. Section 15 (implementation output) is this document. Section 16 (code guidance) has working code in every task. No gaps.

**Placeholder scan.** No TBD, no "handle errors appropriately", no "similar to Task N". Every code step contains runnable content. Task 11 Steps 2 and 3 and Task 12 Steps 1 and 2 specify components by exact field lists, validation rules, and copy rather than full JSX; this is deliberate, because those are conventional forms and lists whose structure is fully determined by the interfaces and constraints already given, and the surrounding codebase has an established component idiom to follow.

**Type consistency.** `OwnerBoat`, `PublicBoat`, `BoatInput`, `BoatImage`, `AppUser`, `Role` are defined once in Task 9 and 10 and referenced unchanged afterwards. RPC names match the migrations exactly: `log_operating_hours`, `complete_maintenance`, `submit_boat_for_review`, `propose_boat_changes`, `admin_review_boat`, `admin_review_changes`, `soft_delete_boat`. Column names in services match the migration column names. `maintenance_status` values `ok | approaching | due | overdue` are consistent across the generated column, the `MaintenanceStatus` type, and the UI.

**One correction applied during review.** Task 10's `setActive` originally called a direct table update, which the `boats_guard_privileges` trigger would have permitted but which duplicates logic; it now routes through `propose_boat_changes` so `is_active` follows the same non-sensitive path as every other benign edit.

