# Account Verification and Access Gating Design

**Goal:** Owners and hotels can register and prepare, but cannot go live or transact until an admin verifies their account. Admin can verify or reject (with a reason). Enforcement is server-side; the UI reflects it. This is the first of four governance subsystems (the others: admin/role management, audit trail + soft deletes, terms and consent).

**Context:** Today `is_verified` is a cosmetic boolean that gates nothing. Owners/hotels self-register and immediately reach their portals. Boats are gated by per-boat admin approval before they reach tourists, but nothing gates the owner/hotel account itself. Hotels are inert because no UI links a hotel record to the account. Admin promotion and general audit are out of scope here (separate subsystems).

## Global constraints

- Supabase project ref `sbrsptgpnjljnongklus`. Never target `ckkpucbphqendxtrnqcz`.
- Migrations applied via Supabase MCP AND saved to `supabase/migrations/NN_name.sql` (identical SQL). Next number is `15`.
- Commit each task as `git -c user.email=paulkwanisi12@gmail.com -c user.name=paulo`.
- No em dashes anywhere. After migrations, `get_advisors type: security` returns zero ERROR.
- Alpha DB: only `cyton.kwanisi@agri-forge.net` (admin) exists; zero boats/bookings.

## Decisions

- Gate depth: owners/hotels keep portal access while pending; the gate is at the point of going live (owner cannot submit a boat for review) or transacting (hotel cannot book on behalf). No route lockout.
- Review outcome: tri-state `pending` / `verified` / `rejected`, rejection carries a reason shown to the user.
- Single source of truth: replace `is_verified` with `verification_status`; derived boolean in the app.

## Data model (migration 15: `add_account_verification_status`)

1. New enum `verification_status` with values `pending`, `verified`, `rejected`.
2. On `public.profiles` add:
   - `verification_status verification_status not null default 'pending'`
   - `verification_note text` (rejection reason / admin note)
   - `reviewed_by uuid references public.profiles(id)`
   - `reviewed_at timestamptz`
3. Backfill: set `verification_status = 'verified'` where `role in ('tourist','admin')` or `is_verified = true`; leave owners/hotels that were not verified as `pending`.
4. Update `handle_new_user`: set `verification_status = 'verified'` for tourist/admin metadata roles, `'pending'` for owner/hotel.
5. Update `guard_profile_privileges`: guard `verification_status`, `verification_note`, `reviewed_by`, `reviewed_at`, and `trust_score` as admin-only writes (in addition to `role`). Drop `is_verified` from the guard once the column is removed.
6. Recreate `public_boats` view: `operator_verified` becomes `(p.verification_status = 'verified')`.
7. Drop the now-unused `is_verified` column from `profiles` after the view no longer references it. Column grants on profiles updated so `authenticated` still may write only `full_name, phone, business_name`.

## RPCs (migration 15 continued)

- `admin_review_account(p_user_id uuid, p_status verification_status, p_trust_score int default null, p_note text default null) returns public.profiles` — admin only. Sets `verification_status`, `trust_score` (when provided, 0..100), `verification_note`, `reviewed_by = auth.uid()`, `reviewed_at = now()`. For verifying owners or rejecting either role.
- `admin_verify_hotel(p_user_id uuid, p_hotel_name text, p_location text, p_commission numeric default 8, p_trust_score int default 90) returns public.profiles` — admin only. Creates a `public.hotels` row, sets the target profile's `hotel_id`, `verification_status = 'verified'`, `trust_score`, `reviewed_by/at`. Makes the hotel functional.
- Replace `admin_set_verification` (from migration 12): superseded by `admin_review_account`; drop it.
- Gate `submit_boat_for_review`: after the ownership check, add `if (select verification_status from public.profiles where id = auth.uid()) <> 'verified' then raise exception 'Your owner account is pending verification. An admin will review it before your boats can go live.'; end if;`
- New trigger `guard_hotel_booking` `BEFORE INSERT on public.bookings`: if `new.hotel_id is not null`, require `exists (select 1 from public.profiles where id = auth.uid() and role = 'hotel' and verification_status = 'verified' and hotel_id = new.hotel_id)`, else raise `'Your hotel account is not verified yet, or is not linked to this hotel.'`. Tourist bookings (hotel_id null) are unaffected.

All admin RPCs `revoke from public, anon; grant execute to authenticated` and check `is_admin()` internally.

## Service layer

- `auth.service.ts`: `AppUser` gains `verificationStatus: 'pending'|'verified'|'rejected'` and `verificationNote: string | null`; `isVerified` derives from `verificationStatus === 'verified'`. `fetchProfile` selects the new columns (drops `is_verified`).
- `users.service.ts`: `AppUserRow` gains `verificationStatus`, `verificationNote`. `listOwnersAndHotels` selects the new columns. Replace `setVerification` with `reviewAccount(userId, status, trustScore?, note?)` -> `admin_review_account`, and add `verifyHotel(userId, {hotelName, location, commission, trustScore})` -> `admin_verify_hotel`.
- Regenerate `src/types/database.ts` after the migration.

## Frontend

- `src/components/admin/UserVerification.tsx` becomes a review queue: a "Pending" group (owners/hotels with status pending) with Verify / Reject actions; verifying a hotel opens fields for hotel name / location / commission. Separate "Verified" and "Rejected" groups for visibility. Reject requires a reason (min 5 chars). Uses `reviewAccount` / `verifyHotel`.
- `src/pages/owner/OwnerDashboard.tsx` and `src/pages/owner/BoatFormPage.tsx`: when `currentUser.verificationStatus !== 'verified'`, show a banner (pending: neutral; rejected: red with `verificationNote`) and disable the Submit-for-review control with an explanation. Draft create/edit/photo upload stay enabled.
- `src/pages/HotelDashboard.tsx`: banner for pending/rejected; the "Book for guest" button stays disabled unless `verificationStatus === 'verified'` and `hotelId` is set (message explains why).
- `src/pages/AdminDashboard.tsx`: the Users tile/section shows the pending count and the review queue.

## Verification (real data, no dummy content)

- Sign up an owner (pending). Confirm submit_boat_for_review is blocked server-side. Admin verifies via `admin_review_account`; submit now works.
- Sign up a hotel (pending). Confirm a hotel booking insert is blocked by the trigger. Admin runs `admin_verify_hotel`; the hotel row is created and linked; booking on behalf now works.
- Reject an owner with a reason; confirm submit stays blocked and the reason is readable.
- `public_boats.operator_verified` reflects verification_status.
- `npx tsc -b --noEmit`, `npm run build`, `npm run lint` pass; advisor zero ERROR. Clean up verification artifacts so only the admin account remains.

## Edge cases

| Case | Handling |
|---|---|
| Pending owner submits a boat | RPC raises the pending message; draft work still allowed |
| Rejected owner | status rejected, submit blocked, banner shows verification_note |
| Unverified hotel books on behalf | BEFORE INSERT trigger raises |
| Hotel books under another hotel's id | trigger requires profiles.hotel_id = booking hotel_id |
| Existing admin account | backfilled to verified; unaffected |
| Tourist books | hotel_id null, trigger and gate do not apply |
| Admin sets trust_score out of range | RPC validates 0..100 |

## Out of scope (later subsystems)

- Admin/role management UI and super-admin (subsystem 2).
- General audit trail and soft deletes (subsystem 3).
- Terms and conditions / consent capture (subsystem 4).
