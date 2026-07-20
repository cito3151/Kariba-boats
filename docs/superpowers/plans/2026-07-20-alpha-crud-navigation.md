# Alpha CRUD, Navigation, and Login Clarity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (or subagent-driven-development) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the booking lifecycle across all roles, add admin user-verification, make dashboard tiles clickable drill-downs, add a login portal selector, and wipe demo data to a single admin account for alpha testing.

**Architecture:** Booking status transitions and user verification are enforced by `SECURITY DEFINER` RPCs (role + ownership + legal-transition checks); direct client `UPDATE` on bookings is revoked. New role-scoped pages consume a thin service layer. Dashboard tiles become filter/drill-down controls. This continues the existing Supabase-backed architecture, no new patterns.

**Tech Stack:** Supabase (Postgres 17, Auth, Storage), @supabase/supabase-js v2, React 19, TypeScript, Vite, Tailwind v4, framer-motion, react-router-dom v7.

## Global Constraints

- Supabase project ref: `sbrsptgpnjljnongklus`. Never target `ckkpucbphqendxtrnqcz` (AgriSense).
- Every migration applied with `mcp__c0221db5-...__apply_migration`, and also saved to `supabase/migrations/NN_name.sql` (identical SQL). Next sequence number is `12`.
- No em dashes anywhere (UI copy, comments, SQL, commit messages). Use commas, colons, or "to".
- Commit each task with `git -c user.email=paulkwanisi12@gmail.com -c user.name=paulo`.
- Money is `numeric(10,2)`, hours `numeric(10,1)`. snake_case in SQL, camelCase in TS mapped in the service layer.
- After the final migration, `get_advisors type: security` must return zero ERROR-level findings.
- Alpha: no seeded/dummy content; only `admin@kariba.com` survives the wipe.

---

## Task 1: Booking and verification RPCs (migration 12)

**Files:**
- Migration: `create_booking_and_verification_rpcs`
- Save: `supabase/migrations/12_create_booking_and_verification_rpcs.sql`

**Interfaces:**
- Consumes: `public.bookings`, `public.boats`, `public.profiles`, `public.is_admin()`, `booking_status` enum.
- Produces: `owner_set_booking_status(uuid, booking_status)`, `cancel_booking(uuid)`, `admin_set_verification(uuid, boolean, int)`; direct UPDATE on `bookings` revoked from `authenticated`.

- [ ] **Step 1: Apply the migration**

```sql
-- Owners (or admin) drive booking status through a legal transition graph.
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
```

- [ ] **Step 2: Verify the functions exist and are SECURITY DEFINER**

Run `execute_sql`:
```sql
select proname, prosecdef from pg_proc
where proname in ('owner_set_booking_status','cancel_booking','admin_set_verification')
order by proname;
```
Expected: three rows, `prosecdef` true for all.

- [ ] **Step 3: Save the migration locally** to `supabase/migrations/12_create_booking_and_verification_rpcs.sql` (identical SQL, with a leading comment block explaining the transition graph).

- [ ] **Step 4: Commit**
```bash
git add -A && git -c user.email=paulkwanisi12@gmail.com -c user.name=paulo commit -m "Add booking status and user verification RPCs, lock down direct booking updates"
```

---

## Task 2: Regenerate types and extend the service layer

**Files:**
- Modify: `src/types/database.ts` (regenerated)
- Modify: `src/services/bookings.service.ts`
- Create: `src/services/users.service.ts`

**Interfaces:**
- Consumes: RPCs from Task 1.
- Produces: `listBookingsForOwner`, `listMyBookings`, `listAllBookings`, `setOwnerBookingStatus`, `cancelBooking` (bookings.service); `listOwnersAndHotels`, `setVerification`, `AppUserRow` (users.service). `BookingRow` gains `boatName` and `boatLocation`.

- [ ] **Step 1: Regenerate database types**

Call `generate_typescript_types` for `sbrsptgpnjljnongklus` and write the result verbatim to `src/types/database.ts`.

- [ ] **Step 2: Extend `bookings.service.ts`**

Add `boatName`/`boatLocation` to `BookingRow` and `toBookingRow` (read from an embedded `boats(name, location)` join). Add:

```ts
const BOOKING_SELECT =
  'id, boat_id, guest_name, start_date, days, start_time, duration_hours, status, price_total, deposit_amount, group_size, hotel_id, created_at, boats(name, location)';

function toBookingRow(r: any): BookingRow {
  return {
    id: r.id, boatId: r.boat_id, guestName: r.guest_name, startDate: r.start_date,
    days: r.days, startTime: r.start_time,
    durationHours: r.duration_hours === null ? null : Number(r.duration_hours),
    status: r.status, priceTotal: Number(r.price_total), depositAmount: Number(r.deposit_amount),
    groupSize: r.group_size, hotelId: r.hotel_id, createdAt: r.created_at,
    boatName: r.boats?.name ?? 'Boat', boatLocation: r.boats?.location ?? '',
  };
}

export async function listMyBookings(touristId: string): Promise<BookingRow[]> {
  const { data, error } = await supabase.from('bookings').select(BOOKING_SELECT)
    .eq('tourist_id', touristId).order('start_date', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(toBookingRow);
}

export async function listBookingsForOwner(ownerId: string): Promise<BookingRow[]> {
  // RLS bookings_read_involved already restricts to the owner's boats; filter by
  // owned boat ids so the query is explicit.
  const { data: boats, error: bErr } = await supabase.from('boats')
    .select('id').eq('owner_id', ownerId).eq('is_deleted', false);
  if (bErr) throw new Error(bErr.message);
  const ids = (boats ?? []).map((b) => b.id);
  if (ids.length === 0) return [];
  const { data, error } = await supabase.from('bookings').select(BOOKING_SELECT)
    .in('boat_id', ids).order('start_date', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(toBookingRow);
}

export async function listAllBookings(): Promise<BookingRow[]> {
  const { data, error } = await supabase.from('bookings').select(BOOKING_SELECT)
    .order('start_date', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(toBookingRow);
}

export async function setOwnerBookingStatus(id: string, status: BookingStatus) {
  const { error } = await supabase.rpc('owner_set_booking_status', { p_booking_id: id, p_status: status });
  if (error) throw new Error(error.message);
}

export async function cancelBooking(id: string) {
  const { error } = await supabase.rpc('cancel_booking', { p_booking_id: id });
  if (error) throw new Error(error.message);
}
```

Update the `BookingRow` interface to add `boatName: string; boatLocation: string;`. Remove the now-unused `listBookingsForBoat`'s old `toBookingRow` duplication if it conflicts (keep one `toBookingRow`; `listBookingsForBoat` keeps working by using `BOOKING_SELECT`).

- [ ] **Step 3: Create `users.service.ts`**

```ts
import { supabase } from '../lib/supabase';

export interface AppUserRow {
  id: string; fullName: string; role: 'tourist' | 'owner' | 'hotel' | 'admin';
  businessName: string | null; phone: string | null; isVerified: boolean; trustScore: number;
}

export async function listOwnersAndHotels(): Promise<AppUserRow[]> {
  const { data, error } = await supabase.from('profiles')
    .select('id, full_name, role, business_name, phone, is_verified, trust_score')
    .in('role', ['owner', 'hotel']).order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    id: r.id, fullName: r.full_name, role: r.role, businessName: r.business_name,
    phone: r.phone, isVerified: r.is_verified, trustScore: r.trust_score,
  }));
}

export async function setVerification(userId: string, verified: boolean, trustScore: number) {
  const { error } = await supabase.rpc('admin_set_verification', {
    p_user_id: userId, p_verified: verified, p_trust_score: trustScore,
  });
  if (error) throw new Error(error.message);
}
```

- [ ] **Step 4: Verify**

Run: `npx tsc -b --noEmit`
Expected: no errors in `src/services/`.

- [ ] **Step 5: Commit**
```bash
git add -A && git -c user.email=paulkwanisi12@gmail.com -c user.name=paulo commit -m "Regenerate types and add booking and user verification service functions"
```

---

## Task 3: Owner bookings page

**Files:**
- Create: `src/pages/owner/OwnerBookingsPage.tsx`
- Modify: `src/App.tsx` (route `/owner/bookings`), `src/components/Layout.tsx` (owner nav is unchanged; add link in OwnerDashboard instead), `src/pages/owner/OwnerDashboard.tsx` (add a "Bookings" link near the Maintenance link)

**Interfaces:**
- Consumes: `listBookingsForOwner`, `setOwnerBookingStatus`, `cancelBooking`, `useAuth`, `useAsync`, `StatusBadge`, state views.

- [ ] **Step 1: Build the page**

`OwnerBookingsPage` renders `useAsync(() => listBookingsForOwner(currentUser.id))`. Group rows by `status` order requested, confirmed, deposit_paid, then the rest. Each row shows `boatName`, `guestName`, `startDate` (and `startTime` + `durationHours` if present, else `days` day(s)), `groupSize` guests, `$priceTotal`, and a `StatusBadge`. Actions by current status:
- `requested`: Confirm (`setOwnerBookingStatus(id,'confirmed')`), Decline (`'declined'`).
- `confirmed`: Mark deposit paid (`'deposit_paid'`), Complete (`'completed'`), Cancel (`cancelBooking`).
- `deposit_paid`: Complete (`'completed'`), Cancel (`cancelBooking`).
- terminal (`completed`/`declined`/`cancelled`): no actions.
Each action sets a per-row busy state, calls the service, `reload()`s on success, and shows the error string inline on failure. Empty state: "No bookings yet." Wrap in `PageTransition`, `max-w-3xl`, a back link to `/owner`.

- [ ] **Step 2: Wire route and links**

In `App.tsx` add inside `<Routes>`:
```tsx
<Route path="/owner/bookings" element={
  <ProtectedRoute allow={['owner', 'admin']}><OwnerBookingsPage /></ProtectedRoute>} />
```
In `OwnerDashboard.tsx`, add a "Bookings" link button next to the existing "Maintenance" link (`to="/owner/bookings"`, icon `CalendarDays`).

- [ ] **Step 3: Verify**

Run: `npx tsc -b --noEmit` (expect clean). Browser check deferred to Task 8's full run.

- [ ] **Step 4: Commit**
```bash
git add -A && git -c user.email=paulkwanisi12@gmail.com -c user.name=paulo commit -m "Add owner bookings page with confirm, decline, complete, and cancel"
```

---

## Task 4: Tourist My Trips page

**Files:**
- Create: `src/pages/TouristTripsPage.tsx`
- Modify: `src/App.tsx` (route `/trips`), `src/components/Layout.tsx` (add "My Trips" nav entry for tourist role and, since anyone can have trips, show it for any signed-in non-admin)

**Interfaces:**
- Consumes: `listMyBookings`, `cancelBooking`, `useAuth`, `useAsync`, `StatusBadge`.

- [ ] **Step 1: Build the page**

`TouristTripsPage` renders `useAsync(() => listMyBookings(currentUser.id))`. Each row: `boatName` + `boatLocation`, date (and time/duration or days), group size, price, `StatusBadge`. Cancel button shown only when status is `requested`, `confirmed`, or `deposit_paid`; calls `cancelBooking(id)`, `reload()` on success, inline error on failure. Empty state: "You have not booked any trips yet." with a link to Browse Boats (`/`). `PageTransition`, `max-w-3xl`.

- [ ] **Step 2: Wire route and nav**

`App.tsx`:
```tsx
<Route path="/trips" element={
  <ProtectedRoute allow={['tourist', 'hotel', 'owner', 'admin']}><TouristTripsPage /></ProtectedRoute>} />
```
`Layout.tsx`: add `{ to: '/trips', label: 'My Trips', icon: Ticket }` to `allNavItems`, shown for any signed-in user (all roles) but not when logged out. Extend the filter: `if (item.to === '/trips') return !!currentUser;`.

- [ ] **Step 3: Verify** `npx tsc -b --noEmit` clean.

- [ ] **Step 4: Commit**
```bash
git add -A && git -c user.email=paulkwanisi12@gmail.com -c user.name=paulo commit -m "Add tourist My Trips page with cancel"
```

---

## Task 5: Admin bookings oversight and user verification

**Files:**
- Create: `src/components/admin/UserVerification.tsx`, `src/components/admin/AdminBookings.tsx`
- Modify: `src/pages/AdminDashboard.tsx` (add both sections and two stat tiles)

**Interfaces:**
- Consumes: `listAllBookings`, `cancelBooking`, `listOwnersAndHotels`, `setVerification`, `useAsync`, `StatusBadge`, state views.

- [ ] **Step 1: UserVerification component**

Lists `useAsync(listOwnersAndHotels)`. Each row: `fullName` (or `businessName`), role chip, a verified toggle, a trust-score number input (0 to 100), and a Save button that calls `setVerification(id, verified, trustScore)` then `reload()`. Inline error on failure. Empty state: "No owners or hotels have signed up yet."

- [ ] **Step 2: AdminBookings component**

Lists `useAsync(listAllBookings)`. Each row: `boatName`, `guestName`, date, group size, price, `StatusBadge`, and a Cancel button (calls `cancelBooking(id)`, reload) hidden when status is `completed`/`cancelled`/`declined`. Empty state: "No bookings on the platform yet."

- [ ] **Step 3: Wire into AdminDashboard**

Below the existing `<ApprovalQueue />`, render `<AdminBookings />` and `<UserVerification />` under headed sections. Add two stat tiles computed from a `listAllBookings` fetch and a `listOwnersAndHotels` fetch (or reuse counts): "Active bookings" (status in requested/confirmed/deposit_paid) and "Unverified owners/hotels". These tiles are wired clickable in Task 6.

- [ ] **Step 4: Verify** `npx tsc -b --noEmit` clean.

- [ ] **Step 5: Commit**
```bash
git add -A && git -c user.email=paulkwanisi12@gmail.com -c user.name=paulo commit -m "Add admin bookings oversight and owner/hotel verification"
```

---

## Task 6: Clickable stat tiles and admin drill-downs

**Files:**
- Modify: `src/pages/owner/OwnerDashboard.tsx`, `src/pages/AdminDashboard.tsx`
- Create: `src/components/StatTile.tsx`

**Interfaces:**
- Produces: `StatTile` (`{ label, value, active?, onClick? }`).

- [ ] **Step 1: StatTile component**

```tsx
export default function StatTile({ label, value, active, onClick }: {
  label: string; value: number; active?: boolean; onClick?: () => void;
}) {
  const base = 'min-w-0 overflow-hidden rounded-xl border p-4 text-left transition-colors';
  const cls = onClick
    ? `${base} ${active ? 'border-lake-500 bg-lake-50' : 'border-lake-100 bg-white hover:border-lake-300'}`
    : `${base} border-lake-100 bg-white`;
  const inner = (<><p className="text-2xl font-bold tabular-nums text-lake-950">{value}</p>
    <p className="truncate text-xs text-lake-500">{label}</p></>);
  return onClick
    ? <button type="button" onClick={onClick} className={`${cls} w-full`}>{inner}</button>
    : <div className={cls}>{inner}</div>;
}
```

- [ ] **Step 2: Owner dashboard tiles filter the grid**

Add `const [filter, setFilter] = useState<'all'|'live'|'pending'|'attention'>('all')`. Each tile sets the filter (clicking the active one resets to `all`). The boat grid renders `list` filtered: `live` -> approved && isActive; `pending` -> status pending; `attention` -> maintenanceStatus due/overdue. Show a small "Showing: X" caption with a clear button when a filter is active. Replace the inline stat card markup with `StatTile`.

- [ ] **Step 3: Admin dashboard drill-downs**

Add `const [view, setView] = useState<'queue'|'all'|'live'|'attention'|'bookings'|'users'>('queue')`. Tiles set `view`. Render below the tiles:
- `queue` -> `<ApprovalQueue />` (default)
- `all` -> a boat list from `listBoatsForAdmin()` showing every boat with name, owner, status chip, maintenance chip, capacity, prices, location, and a link to `/boats/:id` when approved (else a read-only inline detail); each boat row is clickable to expand its full info.
- `live` -> same list filtered to approved && isActive
- `attention` -> boats with maintenanceStatus due/overdue
- `bookings` -> `<AdminBookings />`
- `users` -> `<UserVerification />`
This directly satisfies "click the N-boats tile, see those boats' full information." Use `StatTile` with `active={view === ...}`.

- [ ] **Step 4: Verify** `npx tsc -b --noEmit` clean.

- [ ] **Step 5: Commit**
```bash
git add -A && git -c user.email=paulkwanisi12@gmail.com -c user.name=paulo commit -m "Make dashboard stat tiles clickable drill-downs"
```

---

## Task 7: Login portal selector

**Files:**
- Modify: `src/pages/Login.tsx`

**Interfaces:**
- Consumes: `useAuth` (`currentUser`, `login`).

- [ ] **Step 1: Add the portal tabs**

Add `const PORTALS = [{ key: 'tourist', label: 'Tourist', home: '/' }, { key: 'owner', label: 'Owner', home: '/owner' }, { key: 'hotel', label: 'Hotel', home: '/hotel' }, { key: 'admin', label: 'Admin', home: '/admin' }] as const;` and `const [portal, setPortal] = useState<typeof PORTALS[number]['key']>('tourist')`. Render a 4-button tab row above the form (same chip style as the Signup role selector). The card subtitle becomes `Log in to the {selectedLabel} portal`.

- [ ] **Step 2: Route with a mismatch note**

Keep the existing `useEffect` that redirects when `currentUser` arrives, but compare the account role to the selected portal. If they differ, set an inline note state and navigate to the account's real role home; if they match, navigate there directly. Copy: `This is a {role} account, taking you to {roleHomeLabel}.` The `roleHome` map already maps role to path. Show the note as a non-error info banner (lake-50) for ~a render before redirect, or persist it via navigation state on the destination. Simplest: `setInfo(...)` then `navigate(home)`; the note shows briefly.

- [ ] **Step 3: Verify** `npx tsc -b --noEmit` clean.

- [ ] **Step 4: Commit**
```bash
git add -A && git -c user.email=paulkwanisi12@gmail.com -c user.name=paulo commit -m "Add portal selector to the login screen"
```

---

## Task 8: Wipe demo data and verify the full alpha flow

**Files:** none (data + verification)

- [ ] **Step 1: Wipe storage objects and remove non-admin demo content**

First list image storage paths, then remove them via the storage API in the browser session (owners/admin), OR since we delete everything, remove all objects in `boat-images`. Then run `execute_sql`:
```sql
delete from public.reviews;
delete from public.boat_operating_hours;
delete from public.boat_maintenance_records;
delete from public.maintenance_notifications;
delete from public.admin_approval_logs;
delete from public.bookings;
delete from public.boat_images;
delete from public.boats;
delete from auth.users where email in ('tourist@kariba.com','caribbea@kariba.com','tigerfish@kariba.com');
delete from public.hotels;
```
(Storage: enumerate `boat-images` objects and remove them so no orphans remain. Use `execute_sql` to read `storage.objects` names in the bucket, then remove via the storage API, or `delete from storage.objects where bucket_id = 'boat-images';`.)

- [ ] **Step 2: Confirm only admin remains**
```sql
select email from auth.users order by email;
select count(*) as boats from public.boats;
select count(*) as bookings from public.bookings;
```
Expected: one user `admin@kariba.com`; zero boats; zero bookings.

- [ ] **Step 3: Full browser verification (no dummy data)**

Start the preview. Then, driving the real app + the in-page supabase client where a step needs an account that does not exist yet:
1. Sign up a new owner (`owner` role) via the Signup form. If email confirmation blocks login, confirm the user via `execute_sql` (`update auth.users set email_confirmed_at = now(), confirmation_token = '' where email = '<owner>'`) to simulate the click, since alpha email is not configured.
2. Log in as admin, open the Users drill-down, verify the new owner (toggle verified, set trust score). Confirm the profile row updates.
3. As the owner, register a boat with a photo, submit for review.
4. As admin, approve it. Confirm it appears in `public_boats`.
5. Sign up a tourist (confirm email as above), book the boat.
6. As the owner, open Bookings, Confirm the request. As the tourist, open My Trips, see status confirmed. Cancel is offered; owner marks Complete instead; confirm status completed and Cancel disappears.
7. CRUD boundary checks via the in-page client: a tourist calling `owner_set_booking_status` is rejected; `cancel_booking` on a completed trip is rejected; a non-admin calling `admin_set_verification` is rejected.
8. Click owner and admin stat tiles, confirm the drill-downs filter correctly. Confirm the login portal tabs route and show the mismatch note.

- [ ] **Step 4: Advisor and build gates**

Call `get_advisors type: security` -> zero ERROR. Run `npx tsc -b --noEmit`, `npm run build`, `npm run lint` -> all pass.

- [ ] **Step 5: Commit**
```bash
git add -A && git -c user.email=paulkwanisi12@gmail.com -c user.name=paulo commit --allow-empty -m "Verify alpha flow end to end and wipe demo data to admin-only"
```

---

## Self-review notes

- Spec CRUD matrix maps to: boats (existing), bookings (Tasks 1, 3, 4, 5), images (existing), users (Tasks 1, 5). Clickable tiles: Task 6. Login: Task 7. Wipe + test: Task 8.
- No placeholders: migration and service code are complete; UI tasks specify exact fields, actions, routes, and copy against established component idioms (`StatusBadge`, `useAsync`, state views, `StatTile`).
- Type consistency: `setOwnerBookingStatus`/`cancelBooking`/`setVerification` names match across service and UI tasks; `BookingRow` gains `boatName`/`boatLocation` in Task 2 and is consumed in Tasks 3 to 5; RPC names match the migration exactly (`owner_set_booking_status`, `cancel_booking`, `admin_set_verification`).
