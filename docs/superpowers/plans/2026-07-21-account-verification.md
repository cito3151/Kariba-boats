# Account Verification and Access Gating Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Gate owners/hotels so they can prepare but cannot go live or transact until an admin verifies the account; admin can verify or reject with a reason.

**Architecture:** A `verification_status` tri-state on profiles (single source of truth, replacing `is_verified`), enforced server-side: `submit_boat_for_review` requires the owner verified; a BEFORE INSERT trigger on bookings blocks unverified/unlinked hotel bookings. Admin reviews accounts through RPCs and a review-queue UI.

**Tech Stack:** Supabase (Postgres 17), supabase-js v2, React 19, TypeScript, Vite.

## Global Constraints

- Project ref `sbrsptgpnjljnongklus`. Never target `ckkpucbphqendxtrnqcz`.
- Migration applied via MCP AND saved to `supabase/migrations/15_add_account_verification_status.sql`.
- Commit each task with `git -c user.email=paulkwanisi12@gmail.com -c user.name=paulo`.
- No em dashes. After migration, `get_advisors type: security` zero ERROR.

---

## Task 1: Verification schema, gates, and RPCs (migration 15)

**Files:** Migration `add_account_verification_status`; save `supabase/migrations/15_add_account_verification_status.sql`.

**Interfaces produced:** `verification_status` enum; `profiles.verification_status/verification_note/reviewed_by/reviewed_at`; `admin_review_account(uuid, verification_status, int, text)`; `admin_verify_hotel(uuid, text, text, numeric, int)`; gated `submit_boat_for_review`; trigger `bookings_guard_hotel`. Drops `profiles.is_verified` and `admin_set_verification`.

- [ ] **Step 1: Apply the migration**

```sql
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

-- Guard admin-only columns (now verification_status + note/reviewer + hotel_id, no is_verified).
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

-- Now the boolean is unreferenced; remove it.
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
```

- [ ] **Step 2: Verify** with `execute_sql`:
```sql
select column_name from information_schema.columns where table_schema='public' and table_name='profiles' and column_name in ('verification_status','is_verified');
select proname from pg_proc where proname in ('admin_review_account','admin_verify_hotel','admin_set_verification','guard_hotel_booking') order by proname;
```
Expected: `verification_status` present, `is_verified` absent; `admin_review_account`, `admin_verify_hotel`, `guard_hotel_booking` present, `admin_set_verification` absent.

- [ ] **Step 3: Save** identical SQL to `supabase/migrations/15_add_account_verification_status.sql` with a leading comment.

- [ ] **Step 4: Commit**
```bash
git add -A && git -c user.email=paulkwanisi12@gmail.com -c user.name=paulo commit -m "Add account verification status, access gates, and review RPCs"
```

---

## Task 2: Regenerate types and update the service layer

**Files:** Modify `src/types/database.ts` (regenerated), `src/services/auth.service.ts`, `src/services/users.service.ts`.

- [ ] **Step 1: Regenerate types** via `generate_typescript_types`, write to `src/types/database.ts`.

- [ ] **Step 2: auth.service.ts** — extend `AppUser` and `fetchProfile`:

```ts
export type VerificationStatus = 'pending' | 'verified' | 'rejected';

export interface AppUser {
  id: string; email: string; name: string; role: Role;
  phone: string | null; businessName: string | null;
  hotelId: string | null; verificationStatus: VerificationStatus;
  verificationNote: string | null; isVerified: boolean;
}
```
In `fetchProfile`, change the select to `'id, role, full_name, phone, business_name, hotel_id, verification_status, verification_note'` and map:
```ts
  return {
    id: data.id, email, name: data.full_name, role: data.role as Role,
    phone: data.phone, businessName: data.business_name, hotelId: data.hotel_id,
    verificationStatus: data.verification_status as VerificationStatus,
    verificationNote: data.verification_note,
    isVerified: data.verification_status === 'verified',
  };
```

- [ ] **Step 3: users.service.ts** — extend the row type and replace the write API:

```ts
export interface AppUserRow {
  id: string; fullName: string; role: 'tourist' | 'owner' | 'hotel' | 'admin';
  businessName: string | null; phone: string | null;
  verificationStatus: 'pending' | 'verified' | 'rejected';
  verificationNote: string | null; trustScore: number; hotelId: string | null;
}

export async function listOwnersAndHotels(): Promise<AppUserRow[]> {
  const { data, error } = await supabase.from('profiles')
    .select('id, full_name, role, business_name, phone, verification_status, verification_note, trust_score, hotel_id, created_at')
    .in('role', ['owner', 'hotel']).order('created_at', { ascending: false });
  if (error) throw new Error(humanizeError(error.message));
  return (data ?? []).map((r) => ({
    id: r.id, fullName: r.full_name, role: r.role, businessName: r.business_name, phone: r.phone,
    verificationStatus: r.verification_status, verificationNote: r.verification_note,
    trustScore: r.trust_score, hotelId: r.hotel_id,
  }));
}

export async function reviewAccount(userId: string, status: 'verified' | 'rejected' | 'pending', trustScore?: number, note?: string) {
  const { error } = await supabase.rpc('admin_review_account', {
    p_user_id: userId, p_status: status, p_trust_score: trustScore ?? undefined, p_note: note ?? undefined,
  });
  if (error) throw new Error(humanizeError(error.message));
}

export async function verifyHotel(userId: string, input: { hotelName: string; location: string; commission?: number; trustScore?: number }) {
  const { error } = await supabase.rpc('admin_verify_hotel', {
    p_user_id: userId, p_hotel_name: input.hotelName, p_location: input.location,
    p_commission: input.commission ?? undefined, p_trust_score: input.trustScore ?? undefined,
  });
  if (error) throw new Error(humanizeError(error.message));
}
```
Remove the old `setVerification` export.

- [ ] **Step 4: Verify** `npx tsc -b --noEmit`. Fix any residual `isVerified`/`setVerification` references flagged by the compiler (they are addressed in Task 3).

- [ ] **Step 5: Commit**
```bash
git add -A && git -c user.email=paulkwanisi12@gmail.com -c user.name=paulo commit -m "Wire verification_status through types and services"
```

---

## Task 3: Admin review queue and owner/hotel gating UI

**Files:** Modify `src/components/admin/UserVerification.tsx`, `src/pages/owner/OwnerDashboard.tsx`, `src/pages/owner/BoatFormPage.tsx`, `src/pages/HotelDashboard.tsx`, `src/pages/AdminDashboard.tsx`.

- [ ] **Step 1: UserVerification review queue**

Rewrite so it groups `listOwnersAndHotels()` by `verificationStatus`. For each account row show name/role and the status chip (pending amber, verified lake, rejected red with `verificationNote`). Actions:
- Owner pending/rejected: `Verify` (calls `reviewAccount(id, 'verified', trustScore)`) and `Reject` (opens a reason field, min 5 chars, calls `reviewAccount(id, 'rejected', undefined, reason)`).
- Hotel pending/rejected: a `Verify hotel` form with hotel name, location, commission (default 8), then `verifyHotel(id, {...})`; plus `Reject` as above.
- Verified accounts: show a `Revoke` action calling `reviewAccount(id, 'pending')` (optional but include). Reload after each action; inline errors.

- [ ] **Step 2: Owner gating banner**

In `OwnerDashboard.tsx` and `BoatFormPage.tsx`, read `currentUser.verificationStatus`. When not `verified`, render a banner near the top: pending -> neutral lake-50 ("Your owner account is under review. You can prepare boats and photos, but cannot submit them for review until an admin verifies your account."); rejected -> red with `currentUser.verificationNote`. In `BoatFormPage.tsx`, disable the "Submit for review" button when `verificationStatus !== 'verified'` and show the reason inline. Creating/editing drafts and uploading photos stay enabled.

- [ ] **Step 3: Hotel gating banner**

In `HotelDashboard.tsx`, when `currentUser.verificationStatus !== 'verified'`, show the pending/rejected banner and keep "Book for guest" disabled with the message "Your hotel account must be verified and linked before you can book for guests." The existing `disabled={!hotelId}` becomes `disabled={!hotelId || currentUser.verificationStatus !== 'verified'}`.

- [ ] **Step 4: Admin dashboard count**

In `AdminDashboard.tsx`, change the "Unverified owners/hotels" tile to count `verificationStatus === 'pending'`.

- [ ] **Step 5: Verify** `npx tsc -b --noEmit` clean.

- [ ] **Step 6: Commit**
```bash
git add -A && git -c user.email=paulkwanisi12@gmail.com -c user.name=paulo commit -m "Add admin account review queue and owner/hotel gating UI"
```

---

## Task 4: Verify end to end and clean up

- [ ] **Step 1: Server-side gate checks** (authenticated API, as in prior tasks):
  - Sign up owner (pending). rpc `submit_boat_for_review` on a draft boat -> expect "pending verification" error.
  - As admin: `admin_review_account(owner, 'verified', 90)`. Owner submit -> succeeds.
  - Sign up hotel (pending). Insert a booking with that hotel's id -> expect the hotel-guard error. As admin: `admin_verify_hotel(hotelUser, 'Test Lodge', 'Kariba', 8, 90)`; confirm profiles.hotel_id set and a hotels row created; hotel booking insert now succeeds.
  - As admin: `admin_review_account(owner2, 'rejected', null, 'Incomplete documents')`; owner2 submit still blocked; verification_note readable.
  - `select operator_verified from public_boats limit 1` reflects verification_status.

- [ ] **Step 2: UI checks** — start preview: admin Users section shows Pending group with Verify/Reject; owner pending sees banner + disabled submit; after admin verify, owner can submit; hotel pending sees banner + disabled Book.

- [ ] **Step 3: Gates** — `npx tsc -b --noEmit`, `npm run build`, `npm run lint` pass; `get_advisors type: security` zero ERROR.

- [ ] **Step 4: Clean up** all verification artifacts (test owner/hotel accounts, boats, bookings, hotel rows, storage objects) so only `cyton.kwanisi@agri-forge.net` remains, zero boats/bookings.

- [ ] **Step 5: Commit**
```bash
git add -A && git -c user.email=paulkwanisi12@gmail.com -c user.name=paulo commit --allow-empty -m "Verify account verification gating end to end"
```

---

## Self-review notes
- Spec coverage: data model + gates + RPCs (Task 1); types + services (Task 2); admin queue + owner/hotel banners + count (Task 3); verification + cleanup (Task 4).
- No placeholders: full migration SQL and service code included; UI specified by exact fields, actions, and copy against existing idioms (`StateViews`, chips, `useAsync`).
- Type consistency: `verificationStatus`/`verificationNote` names match across auth.service, users.service, and UI. RPC names `admin_review_account`, `admin_verify_hotel` match services; `admin_set_verification`/`setVerification`/`is_verified` fully removed.
