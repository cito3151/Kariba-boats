# Alpha CRUD, Navigation, and Login Clarity Design

**Goal:** Prepare Kariba Lake Access for alpha testing by closing the booking-lifecycle gap, giving each role the right level of CRUD, making dashboard stat tiles clickable drill-downs, clarifying which portal a user is logging into, and wiping demo content down to a single admin account.

**Context:** The Supabase backend and owner/admin/tourist surfaces are already built and merged. Bookings can be created but no screen acts on them (`setBookingStatus` is unused). Verification of owners/hotels has no UI. Dashboard tiles are static. Login has one form with role-based redirect but no pre-login framing.

## Global constraints

- Supabase project ref `sbrsptgpnjljnongklus`. Never target `ckkpucbphqendxtrnqcz` (AgriSense).
- Migrations applied via the Supabase MCP AND saved locally to `supabase/migrations/NN_name.sql` (identical SQL), continuing the existing sequence (next is `12`).
- Commit each task with `git -c user.email=paulkwanisi12@gmail.com -c user.name=paulo`.
- No em dashes anywhere.
- After migrations, `get_advisors type: security` must show zero ERROR-level findings.
- Alpha testing: no seeded/dummy content. Only the admin account survives the wipe.

## 1. CRUD matrix (authoritative)

| Entity | Tourist | Hotel | Owner | Admin |
|---|---|---|---|---|
| Boats | Read (public_boats only) | Read (public) | Create, Read own, Update own (sensitive edits park in pending_changes), soft-Delete own (booking-guarded), submit for review | Read all, approve/reject/suspend/unsuspend, review pending changes. No direct field edit or delete. |
| Bookings | Create, Read own, Cancel own (not once completed) | Create on behalf of guest, Read own hotel's | Read their boats' bookings, set status: confirm, decline, mark deposit-paid, complete | Read all, Cancel any |
| Images | Read | Read | Full CRUD on own boats' images | Read |
| Users/profiles | Update own (full_name, phone, business_name) | Update own | Update own | Verify owners/hotels: set is_verified and trust_score |

Enforcement is server-side. Booking status changes and user verification go through `SECURITY DEFINER` RPCs with role, ownership, and legal-transition checks. Direct client `UPDATE` on `bookings` is revoked so no tourist can self-confirm.

## 2. Database (migration 12, `create_booking_and_verification_rpcs`)

Legal booking transition graph:
- `requested` -> `confirmed`, `declined`, `cancelled`
- `confirmed` -> `deposit_paid`, `completed`, `cancelled`
- `deposit_paid` -> `completed`, `cancelled`
- terminal: `completed`, `declined`, `cancelled`

RPCs:
- `owner_set_booking_status(p_booking_id uuid, p_status booking_status) returns public.bookings` — caller must be the boat's owner or admin; validates the transition against the graph; raises on illegal transitions. Owners may not set `cancelled` from `completed`.
- `cancel_booking(p_booking_id uuid) returns public.bookings` — caller must be the booking's tourist, the boat's owner, or admin; refuses if status is `completed`; sets `cancelled`.
- `admin_set_verification(p_user_id uuid, p_verified boolean, p_trust_score int) returns public.profiles` — admin only; validates trust_score 0..100; the only path that writes `is_verified`/`trust_score` (column grants already block direct writes). Uses the same transaction-local guard-bypass flag pattern as the existing hours RPCs so `guard_profile_privileges` permits the write.

Policy change: `revoke update on public.bookings from authenticated;` (the `bookings_update_involved` policy is superseded by the RPCs). Reads keep `bookings_read_involved`. Grants: execute on the three RPCs to `authenticated`; revoke from `anon`.

## 3. Service layer additions

- `bookings.service.ts`: `listBookingsForOwner(ownerId)` (join through boats), `listMyBookings(touristId)`, `listAllBookings()` (admin), `setOwnerBookingStatus(id, status)` -> rpc, `cancelBooking(id)` -> rpc. Map rows to a `BookingRow` that also carries boat name and location for display (select with an embedded `boats(name, location)`), plus a status label.
- `users.service.ts` (new): `listOwnersAndHotels()` (admin read of profiles where role in owner/hotel), `setVerification(userId, verified, trustScore)` -> rpc.

## 4. UI

New pages (all under existing role-gated routes):
- `src/pages/owner/OwnerBookingsPage.tsx` (`/owner/bookings`): incoming bookings grouped by boat; Confirm/Decline on `requested`; Mark deposit-paid/Complete/Cancel on active; shows guest name, date/time, group size, price, status chip. Uses `StatusBadge`.
- `src/pages/TouristTripsPage.tsx` (`/trips`, role tourist/hotel/owner/admin can view own): the signed-in user's bookings with status and a Cancel action (hidden once completed/cancelled/declined).
- `src/pages/admin/AdminBookingsPage.tsx` or a section inside AdminDashboard: all bookings, read + Cancel.
- Admin Users verification: a `src/components/admin/UserVerification.tsx` panel listing owners/hotels with a verify toggle and trust-score input, wired into AdminDashboard.

Clickable stat tiles:
- A shared `StatTile` that optionally takes an `onClick`/`to`. Owner dashboard tiles filter the boat grid (client-side filter state: all / live / pending / attention). Admin tiles drill to filtered views: Total boats -> full boat list with per-boat info and a link to a detail/inspect view; Awaiting review -> the queue; Live -> approved list; Maintenance attention -> that list.
- Admin gets a read-only boat inspect route or modal so "click the tile, see those boats' full information" works even for non-pending boats (admin already can read all boats via RLS).

Login portal selector:
- `Login.tsx` gains Tourist/Owner/Hotel/Admin tabs. The chosen tab sets copy ("Log in to the Owner portal") and an intended redirect. After the session resolves, route to the account's real role home; if it differs from the chosen tab, show a gentle inline note ("This is a tourist account, taking you to Browse Boats"). The tab never grants access the account lacks.
- Nav (`Layout.tsx`) adds the new entries per role: Owner gets Bookings; tourist/hotel get My trips; admin gets Bookings + Users (or sections).

## 5. Test-data wipe (execution step, not a migration)

Via `execute_sql` at execution time (data cleanup specific to this live DB, not schema):
1. Delete all `boat_images` rows and remove their storage objects from the `boat-images` bucket.
2. Delete all `bookings`, `reviews`, `boat_operating_hours`, `boat_maintenance_records`, `maintenance_notifications`, `admin_approval_logs`, then all `boats`.
3. Delete the `tourist@kariba.com`, `caribbea@kariba.com`, `tigerfish@kariba.com` users from `auth.users` (cascades to profiles). Keep `admin@kariba.com`.
4. Keep the `Caribbea Bay Resort` hotel row or delete it; delete it since its linked user is gone, so no orphan.

Alpha note (surfaced to the user, not code): testers self-register. Because email confirmation requires SMTP that is not configured, recommend disabling "Confirm email" in Supabase Auth settings for the alpha so testers can sign up and log in immediately. This is a dashboard toggle, not something in this repo.

## 6. Testing (no dummy data)

Browser verification against the live DB, real flow only:
- Admin logs in, opens Users, sees a freshly signed-up owner, verifies them.
- Owner signs up (or is the verified one), registers a boat with a photo, submits; admin approves.
- Tourist signs up, books the boat; owner sees the request, confirms it; tourist sees "confirmed" in My trips; owner marks complete.
- CRUD boundary checks: a tourist cannot confirm a booking (RPC rejects); a tourist can cancel only their own; an owner cannot cancel a completed trip; only admin can verify a user.
- Clickable tiles navigate correctly; login tabs route and show the mismatch note.
- `npx tsc -b --noEmit`, `npm run build`, `npm run lint` all pass. `get_advisors` security shows zero ERROR.

## Edge cases

| Case | Handling |
|---|---|
| Tourist tries to confirm own booking | `owner_set_booking_status` requires boat owner/admin; rejects |
| Owner cancels a completed trip | `cancel_booking` refuses when status is completed |
| Illegal transition (e.g., declined -> confirmed) | RPC validates against the transition graph and raises |
| Admin sets trust_score out of range | RPC validates 0..100 |
| Tile clicked with zero items | Drill-down shows an EmptyState |
| Login tab mismatch vs account role | Login succeeds, routes to real portal, shows inline note |
| Wipe leaves no owner/tourist | Expected for alpha; testers self-register; admin remains |

## Out of scope

- Payments (Paynow/EcoCash).
- Real email/SMTP setup.
- Admin direct field-editing or deleting of boats (approve/reject/suspend only, per decision).
- Operator response to reviews UI (schema supports it; defer).
