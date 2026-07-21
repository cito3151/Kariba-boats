# Clean Role Separation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make admin a pure oversight role; boats are created, operated, and deleted only by owner accounts.

**Architecture:** Tighten Postgres RLS policies and RPC ownership checks so admin cannot create/edit/operate/delete boats (admin acts only through the oversight RPCs, which are SECURITY DEFINER and bypass RLS). Lock the owner portal routes to the owner role and hide owner/hotel nav from admin.

**Tech Stack:** Supabase (Postgres 17), @supabase/supabase-js v2, React 19, TypeScript, Vite, react-router-dom v7.

## Global Constraints

- Supabase project ref `sbrsptgpnjljnongklus`. Never target `ckkpucbphqendxtrnqcz`.
- Migration applied via Supabase MCP AND saved to `supabase/migrations/14_separate_admin_oversight_from_owner_ops.sql` (identical SQL).
- Commit each task with `git -c user.email=paulkwanisi12@gmail.com -c user.name=paulo`.
- No em dashes. After the migration, `get_advisors type: security` returns zero ERROR.

---

## Task 1: Tighten DB policies and RPCs (migration 14)

**Files:**
- Migration: `separate_admin_oversight_from_owner_ops`
- Save: `supabase/migrations/14_separate_admin_oversight_from_owner_ops.sql`

**Interfaces:**
- Produces: boats INSERT owner-only (`boats_insert_own_as_owner`), boats UPDATE owner-only (`boats_update_own`); `log_operating_hours`, `complete_maintenance`, `soft_delete_boat`, `owner_set_booking_status` reject non-owner callers.

- [ ] **Step 1: Apply the migration** (full SQL below: swap the two boats policies and recreate the four RPCs owner-only, keeping their bodies otherwise identical to migrations 06/10/12).

```sql
-- Boats INSERT: owner-only (reverses migration 13's admin allowance)
drop policy if exists "boats_insert_own_or_admin" on public.boats;
drop policy if exists "boats_insert_own_as_owner" on public.boats;
create policy "boats_insert_own_as_owner" on public.boats
  for insert to authenticated
  with check (owner_id = auth.uid() and public.current_user_role() = 'owner');

-- Boats UPDATE: owner-only (admin manages via SECURITY DEFINER RPCs that bypass RLS)
drop policy if exists "boats_update_own_or_admin" on public.boats;
create policy "boats_update_own" on public.boats
  for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- log_operating_hours: owner-only
create or replace function public.log_operating_hours(
  p_boat_id uuid, p_hours numeric, p_note text default null, p_booking_id uuid default null
) returns public.boats
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_boat public.boats; v_status_before text; v_new_total numeric(10,1);
begin
  select * into v_boat from public.boats where id = p_boat_id for update;
  if not found then raise exception 'Boat not found'; end if;
  if v_boat.owner_id <> auth.uid() then
    raise exception 'You can only log hours for your own boats';
  end if;
  if p_hours is null or p_hours <= 0 or p_hours > 24 then
    raise exception 'Hours must be greater than 0 and at most 24 per entry';
  end if;
  v_status_before := v_boat.maintenance_status;
  v_new_total := v_boat.accumulated_hours + p_hours;
  insert into public.boat_operating_hours (boat_id, booking_id, hours, reading_after, note, logged_by)
  values (p_boat_id, p_booking_id, p_hours, v_new_total, p_note, auth.uid());
  perform set_config('app.boat_hours_ctx', 'on', true);
  update public.boats set accumulated_hours = v_new_total where id = p_boat_id returning * into v_boat;
  perform set_config('app.boat_hours_ctx', 'off', true);
  if v_boat.maintenance_status <> v_status_before
     and v_boat.maintenance_status in ('approaching','due','overdue') then
    insert into public.maintenance_notifications (boat_id, recipient_id, level, message, hours_at_trigger)
    values (p_boat_id, v_boat.owner_id, v_boat.maintenance_status,
      case v_boat.maintenance_status
        when 'approaching' then v_boat.name || ' is approaching maintenance, ' || v_boat.hours_remaining || ' hours remaining.'
        when 'due' then v_boat.name || ' has reached its maintenance interval at ' || v_boat.accumulated_hours || ' hours.'
        else v_boat.name || ' is overdue for maintenance and has been hidden from tourist search.'
      end, v_boat.accumulated_hours)
    on conflict (boat_id, level, hours_at_trigger) do nothing;
  end if;
  return v_boat;
end; $$;

-- complete_maintenance: owner-only
create or replace function public.complete_maintenance(
  p_boat_id uuid, p_description text, p_performed_at date default current_date,
  p_cost numeric default null, p_service_provider text default null
) returns public.boats
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_boat public.boats;
begin
  select * into v_boat from public.boats where id = p_boat_id for update;
  if not found then raise exception 'Boat not found'; end if;
  if v_boat.owner_id <> auth.uid() then
    raise exception 'You can only complete maintenance for your own boats';
  end if;
  insert into public.boat_maintenance_records
    (boat_id, performed_at, hours_at_service, interval_at_service, description, cost, service_provider, performed_by)
  values (p_boat_id, p_performed_at, v_boat.accumulated_hours, v_boat.maintenance_interval_hours,
          p_description, p_cost, p_service_provider, auth.uid());
  perform set_config('app.boat_hours_ctx', 'on', true);
  update public.boats set last_maintenance_hours = v_boat.accumulated_hours where id = p_boat_id returning * into v_boat;
  perform set_config('app.boat_hours_ctx', 'off', true);
  update public.maintenance_notifications set is_read = true where boat_id = p_boat_id and not is_read;
  return v_boat;
end; $$;

-- soft_delete_boat: owner-only
create or replace function public.soft_delete_boat(p_boat_id uuid)
returns public.boats language plpgsql security definer
set search_path = public, pg_temp as $$
declare v_boat public.boats; v_active int;
begin
  select * into v_boat from public.boats where id = p_boat_id;
  if not found then raise exception 'Boat not found'; end if;
  if v_boat.owner_id <> auth.uid() then raise exception 'Not your boat'; end if;
  select count(*) into v_active from public.bookings
  where boat_id = p_boat_id and status in ('requested','confirmed','deposit_paid') and start_date >= current_date;
  if v_active > 0 then
    raise exception 'This boat has % upcoming booking(s). Cancel or complete them before deleting, or set the boat to unavailable instead.', v_active;
  end if;
  update public.boats set is_deleted = true, deleted_at = now(), is_active = false
  where id = p_boat_id returning * into v_boat;
  return v_boat;
end; $$;

-- owner_set_booking_status: boat owner only (admin uses cancel_booking for oversight)
create or replace function public.owner_set_booking_status(
  p_booking_id uuid, p_status booking_status
) returns public.bookings language plpgsql security definer
set search_path = public, pg_temp as $$
declare v_booking public.bookings; v_owner uuid; v_ok boolean;
begin
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found then raise exception 'Booking not found'; end if;
  select owner_id into v_owner from public.boats where id = v_booking.boat_id;
  if v_owner <> auth.uid() then
    raise exception 'Only the boat owner can change this booking';
  end if;
  v_ok := case v_booking.status
    when 'requested' then p_status in ('confirmed','declined','cancelled')
    when 'confirmed' then p_status in ('deposit_paid','completed','cancelled')
    when 'deposit_paid' then p_status in ('completed','cancelled')
    else false end;
  if not v_ok then raise exception 'Cannot change a % booking to %', v_booking.status, p_status; end if;
  update public.bookings set status = p_status where id = p_booking_id returning * into v_booking;
  return v_booking;
end; $$;
```

- [ ] **Step 2: Verify policies and functions**

Run `execute_sql`:
```sql
select policyname, cmd, with_check from pg_policies
where schemaname='public' and tablename='boats' and cmd in ('INSERT','UPDATE') order by cmd;
```
Expected: INSERT check requires `current_user_role() = 'owner'` (no is_admin); UPDATE using/check is `owner_id = auth.uid()` only.

- [ ] **Step 3: Save the migration locally** to `supabase/migrations/14_separate_admin_oversight_from_owner_ops.sql` with the exact SQL from Step 1 plus a leading comment.

- [ ] **Step 4: Commit**
```bash
git add -A && git -c user.email=paulkwanisi12@gmail.com -c user.name=paulo commit -m "Separate admin oversight from owner operations at the DB layer"
```

---

## Task 2: Lock owner routes and admin nav

**Files:**
- Modify: `src/App.tsx` (owner route guards), `src/components/Layout.tsx` (nav filter)

**Interfaces:**
- Consumes: `ProtectedRoute` (`allow: Role[]`), `useAuth().currentUser`.

- [ ] **Step 1: Restrict owner routes to owners**

In `src/App.tsx`, for each of `/owner`, `/owner/boats/new`, `/owner/boats/:id/edit`, `/owner/maintenance`, `/owner/bookings`, change `allow={['owner', 'admin']}` to `allow={['owner']}`.

- [ ] **Step 2: Hide owner/hotel portals and My Trips from admin**

In `src/components/Layout.tsx`, replace the nav filter so admin sees only Browse Boats and Admin:

```tsx
  const navItems = allNavItems.filter((item) => {
    if (item.to === '/') return true;
    if (currentUser?.role === 'admin') return item.to === '/admin';
    if (item.to === '/trips') return !!currentUser;
    if (!currentUser) return true;
    if (item.to === '/hotel') return currentUser.role === 'hotel';
    if (item.to === '/owner') return currentUser.role === 'owner';
    if (item.to === '/admin') return false;
    return true;
  });
```

- [ ] **Step 3: Verify**

Run: `npx tsc -b --noEmit`
Expected: exit 0.

- [ ] **Step 4: Commit**
```bash
git add -A && git -c user.email=paulkwanisi12@gmail.com -c user.name=paulo commit -m "Lock owner portal to owners and trim admin navigation"
```

---

## Task 3: Verify separation end to end and clean up

**Files:** none (verification)

- [ ] **Step 1: DB-level role checks via authenticated API**

Using the auth token endpoint + REST/RPC (as done previously):
- Sign up a throwaway owner (role owner), confirm via `update auth.users set email_confirmed_at = now() where email = ...` if needed.
- As admin (`admin@kariba.com` / `admin123`): POST `/rest/v1/boats` with owner_id = admin id. Expected: 403 / RLS error (blocked).
- As the owner: POST `/rest/v1/boats` with owner_id = own id. Expected: 201.
- As admin: rpc `log_operating_hours` on the owner's boat. Expected: error "You can only log hours for your own boats". rpc `soft_delete_boat`. Expected: "Not your boat". rpc `owner_set_booking_status`. Expected: "Only the boat owner can change this booking".
- As admin: rpc `admin_review_boat` approve on the owner's boat (Expected: success), `admin_set_verification` (success), `cancel_booking` on a booking (success).

- [ ] **Step 2: UI checks**

Start the preview. Signed in as admin: nav shows only Browse Boats + Admin; navigating to `/owner` redirects to `/`. Signed in as the owner: Owner Portal is visible and the register form works.

- [ ] **Step 3: Gates**

`npx tsc -b --noEmit`, `npm run build`, `npm run lint` pass. `get_advisors type: security` zero ERROR.

- [ ] **Step 4: Clean up verification artifacts**

Delete any test owner account, boats, bookings, and orphaned storage objects created during verification so the DB holds only `admin@kariba.com` and `cyton.kwanisi@agri-forge.net`, zero boats/bookings.

- [ ] **Step 5: Commit**
```bash
git add -A && git -c user.email=paulkwanisi12@gmail.com -c user.name=paulo commit --allow-empty -m "Verify clean role separation end to end"
```

---

## Self-review notes
- Spec coverage: DB tightening (Task 1) covers matrix rows for create/edit/operate/delete + owner_set_booking_status; route/nav (Task 2) covers UI separation; verification + cleanup (Task 3).
- No placeholders: full RPC bodies and policy SQL included; nav filter shown in full.
- Type/name consistency: policy names `boats_insert_own_as_owner`, `boats_update_own`; RPC signatures unchanged from migrations 06/10/12 (only ownership checks tightened). `owner_set_booking_status(uuid, booking_status)`, `cancel_booking(uuid)`, `admin_set_verification(uuid, boolean, int)` names match the service layer.
