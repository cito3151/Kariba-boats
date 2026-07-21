# Clean Role Separation Design (production-ready)

**Goal:** Make admin a pure oversight role and keep boats owned and operated only by dedicated owner accounts. Admins can approve/reject/suspend boats, review proposed changes, verify owners/hotels, and cancel any booking, but cannot create, edit, operate, or delete boats, nor operate bookings.

**Context:** Migration 13 temporarily let admins insert boats (to unblock an admin who hit an RLS error in the owner portal). We are reversing that toward clean separation. Owner-operational RPCs currently also accept admin; those get tightened to owner-only.

## Global constraints

- Supabase project ref `sbrsptgpnjljnongklus`. Never target `ckkpucbphqendxtrnqcz` (AgriSense).
- Migrations applied via the Supabase MCP AND saved to `supabase/migrations/NN_name.sql` (identical SQL). Next number is `14`.
- Commit each logical step as `git -c user.email=paulkwanisi12@gmail.com -c user.name=paulo`.
- No em dashes anywhere.
- After the migration, `get_advisors type: security` returns zero ERROR-level findings.
- No dummy/seed data; alpha DB currently holds only admin@kariba.com and the user's cyton.kwanisi@agri-forge.net (admin).

## Role matrix (target)

| Capability | Tourist | Hotel | Owner | Admin |
|---|---|---|---|---|
| Create/edit/delete boats | no | no | own only | NO |
| Submit boat for review | no | no | own only | no |
| Log hours / complete maintenance | no | no | own only | NO |
| Approve/reject/suspend/unsuspend boats | no | no | no | YES |
| Review proposed changes | no | no | no | YES |
| Verify owners/hotels | no | no | no | YES |
| Create bookings | own | on behalf | no | no |
| Confirm/decline/deposit/complete bookings | no | no | own boats | NO |
| Cancel booking | own | no | own boats | any (oversight) |
| Read all boats/bookings | public only | public + own | own | all (oversight) |

## Database (migration 14: `separate_admin_oversight_from_owner_ops`)

1. Boats INSERT policy back to owner-only:
   - drop `boats_insert_own_or_admin`; create `boats_insert_own_as_owner` with check `owner_id = auth.uid() and current_user_role() = 'owner'`.
2. Boats UPDATE policy to owner-only (defense in depth; admin acts via SECURITY DEFINER RPCs that bypass RLS):
   - drop `boats_update_own_or_admin`; create `boats_update_own` using/with-check `owner_id = auth.uid()`.
3. Tighten owner-operational RPCs to owner-only (drop the `and not public.is_admin()` / `or admin` allowance). The ownership check becomes `if v_boat.owner_id <> auth.uid() then raise ...`:
   - `log_operating_hours` (message: "You can only log hours for your own boats")
   - `complete_maintenance` (message: "You can only complete maintenance for your own boats")
   - `soft_delete_boat` (message: "Not your boat")
   - `owner_set_booking_status`: owner-of-boat-only. Message: "Only the boat owner can change this booking".
   Each keeps its transaction-local guard-bypass flag (`app.boat_hours_ctx`) where it already sets one.
4. Unchanged (admin oversight): `admin_review_boat`, `admin_review_changes`, `admin_set_verification`, `cancel_booking` (tourist/owner/admin), boats SELECT policy (`boats_read_public_or_own_or_admin`), bookings read/insert policies.

## Frontend

- `src/App.tsx`: owner routes change `allow={['owner', 'admin']}` to `allow={['owner']}` for `/owner`, `/owner/boats/new`, `/owner/boats/:id/edit`, `/owner/maintenance`, `/owner/bookings`. Admin hitting these is redirected home by ProtectedRoute.
- `src/components/Layout.tsx`: rework the nav filter so admin sees only Browse Boats and Admin. Owner Portal and Hotel Portal are hidden from admin; My Trips is hidden from admin (admin has no bookings). Owner/hotel/tourist navigation is unchanged.
- Admin dashboard, approval queue, admin bookings (cancel-only), and user verification are already read-only oversight; no control removal needed. The all-boats drill-down stays read-only with a "view public listing" link.

## Owner account for the user

`cyton.kwanisi@agri-forge.net` is admin (oversight). To list or test boats, create a dedicated owner account through the app Sign up flow with the "Boat owner" role. Guidance only, no code.

## Verification (real data)

Authenticated API checks against the live DB:
- Admin insert into boats is rejected by RLS (was allowed under migration 13).
- A signed-up owner can insert their own boat (201).
- Owner-only RPCs reject an admin caller (log hours, complete maintenance, soft delete, owner_set_booking_status).
- Admin oversight still works: admin_review_boat (approve/suspend), admin_set_verification, cancel_booking.
- UI: admin nav shows only Browse Boats + Admin; navigating to /owner as admin redirects home; owner account sees the owner portal and can register a boat.
- `npx tsc -b --noEmit`, `npm run build`, `npm run lint` pass; security advisor zero ERROR.
- Clean up any verification artifacts so only admin + the user's account remain, zero boats/bookings.

## Edge cases

| Case | Handling |
|---|---|
| Admin opens /owner directly | ProtectedRoute (allow owner only) redirects to / |
| Admin calls owner RPC via API | RPC ownership check raises a clear error |
| Admin still needs to take a boat down | Uses suspend via admin_review_boat (not delete) |
| Owner acts on own boat | All owner RPCs and insert/update policies permit owner_id = auth.uid() |
| Existing admin-owned boats | None exist (DB wiped); not a concern for alpha |

## Out of scope

- Force-delete for admins (chose suspend-only).
- Payments, SMTP/email, admin acting on behalf of owners.
