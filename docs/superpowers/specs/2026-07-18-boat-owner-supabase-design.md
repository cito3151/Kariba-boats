# Kariba Lake Access: Supabase Migration and Boat Owner System

**Date:** 2026-07-18
**Supabase project:** Kariba Boats (`sbrsptgpnjljnongklus`, eu-central-1), currently empty
**Status:** Design, awaiting approval

## 1. Goal

Move the platform off mock data onto Supabase, and build the boat owner/operator side properly: register boats, upload images, manage listings, track operating hours aviation-style, and receive maintenance alerts. Admin approves before anything reaches tourists.

## 2. Decisions taken

| Decision | Choice | Consequence |
|---|---|---|
| Auth | Supabase Auth, email confirmation ON | Real confirmation flow; demo accounts seeded pre-confirmed via SQL so they still work instantly |
| Edits to approved boats | Pending-changes diff | Boat stays live on old approved values; admin approves the diff. No downtime for a price typo |
| Maintenance blocking | Overdue blocks booking, due-soon warns | Boat disappears from tourist search only once it operates past due |
| Scope | Full migration, phased | No mock data survives; nothing left half-wired |

## 3. Architectural corrections to the original brief

Three places where I am deliberately not building what was asked, because the asked-for shape causes problems:

**3.1 "Maintenance due" is not a status.** The brief lists boat status as `pending / approved / rejected / suspended / maintenance due / unavailable`. Maintenance state is orthogonal to approval state: a boat can be simultaneously approved and maintenance-due. If `maintenance_due` overwrites `approved`, the approval is destroyed and must be reconstructed after servicing, and the audit trail lies. Instead `status` covers the approval lifecycle only, and maintenance is **derived from hours** in a generated column. Visibility is a function of both.

**3.2 Operating hours are a ledger, not a number.** The brief says owners "enter or update operating hours". If owners can write `accumulated_hours` directly they can silently reduce it to dodge a service. Instead, `boat_operating_hours` is an append-only log; a trigger increments the boat total. Owners can only add hours, never rewrite history. This is the actual aviation model and it closes the "hiding maintenance problems" vector from section 14 of the brief.

**3.3 Double-booking is prevented by the database, not the app.** The current in-memory conflict check cannot survive two concurrent requests. A Postgres `EXCLUDE` constraint over a time range makes overlapping bookings physically impossible regardless of what the client does.

## 4. Schema

Ten tables plus one public view.

### profiles
Extends `auth.users`. Holds `role` (`tourist | owner | hotel | admin`), name, phone, business name, verification flag, trust score.

**Role escalation is the number one risk here.** Three layers of defence:
1. `handle_new_user()` trigger on `auth.users` insert reads `raw_user_meta_data->>'role'` and whitelists it against `('tourist','owner','hotel')`. Anything else, including `admin`, silently becomes `tourist`. Admin can never be self-assigned at signup.
2. Column-level grant: `REVOKE UPDATE (role, is_verified, trust_score) ON profiles FROM authenticated`.
3. A `BEFORE UPDATE` trigger that raises if `role` changed and the caller is not an admin.

### boats
Identity, pricing (`price_per_hour` and/or `price_per_day`, at least one required), capacity, facilities, safety equipment, crew, fuel policy, registration number.

Lifecycle columns: `status`, `is_active` (owner toggle), `is_deleted` (soft delete), `rejection_reason`, `pending_changes jsonb`, `approved_at`, `approved_by`.

**Sensitive fields**, exhaustively, are the ones that divert an edit into `pending_changes` on an already-approved boat: `name`, `boat_type`, `capacity`, `price_per_hour`, `price_per_day`, `safety_equipment`, `crew_included`, `registration_number`, and any image add or removal. Everything else (`description`, `facilities`, `location`, `fuel_policy`, `is_active`, and all maintenance columns) applies immediately, because none of it can misrepresent what a tourist is buying or how safe it is. The list lives in one database function, `is_sensitive_change()`, so the rule cannot drift between client and server.

Maintenance columns: `maintenance_interval_hours` (owner-set, never hardcoded), `accumulated_hours`, `last_maintenance_hours`, `maintenance_warn_hours` (default 10).

Three **generated columns** compute maintenance with no trigger and no possibility of drift:

```sql
next_maintenance_hours numeric GENERATED ALWAYS AS
  (last_maintenance_hours + maintenance_interval_hours) STORED,

hours_remaining numeric GENERATED ALWAYS AS
  (last_maintenance_hours + maintenance_interval_hours - accumulated_hours) STORED,

maintenance_status text GENERATED ALWAYS AS (
  CASE
    WHEN accumulated_hours - (last_maintenance_hours + maintenance_interval_hours)
         >= maintenance_warn_hours THEN 'overdue'
    WHEN accumulated_hours >= last_maintenance_hours + maintenance_interval_hours THEN 'due'
    WHEN (last_maintenance_hours + maintenance_interval_hours) - accumulated_hours
         <= maintenance_warn_hours THEN 'approaching'
    ELSE 'ok'
  END
) STORED
```

Verified against the brief's example: accumulated 260, interval 100, last service at 200. `next_due = 300`, `remaining = 40`, warn 10, so status `ok`. At 292 hours, remaining 8, status `approaching`. At 300, remaining 0, status `due`. At 310, `310 - 300 = 10 >= 10`, status `overdue`.

### boat_images
`storage_path` (unique), `sort_order`, `is_primary`, `moderation_status`, `uploaded_by`. Partial unique index guarantees exactly one primary per boat.

### boat_operating_hours
Append-only ledger: `hours` (0 < h <= 24), `logged_by`, optional `booking_id`, `note`, and `reading_after` snapshotting the running total. Trigger increments `boats.accumulated_hours` and fires notifications on threshold crossings.

### boat_maintenance_records
`performed_at`, `hours_at_service`, `interval_at_service`, `description`, `cost`, `service_provider`. Insert trigger sets `boats.last_maintenance_hours = hours_at_service`, which resets the cycle.

### maintenance_notifications
`level` (`approaching | due | overdue`), `message`, `hours_at_trigger`, `is_read`. Unique on `(boat_id, level, hours_at_trigger)` so the owner is not spammed on every hour logged.

### admin_approval_logs
Every admin action with `action`, `reason`, and a `snapshot jsonb` of the boat at that moment. This is the audit trail.

### bookings
Carries over the time model already built: `start_date`, `days`, `start_time`, `duration_hours`, plus guest details, status, pricing.

The double-booking guard:

```sql
period tsrange GENERATED ALWAYS AS (
  CASE WHEN start_time IS NOT NULL AND duration_hours IS NOT NULL
    THEN tsrange((start_date + start_time),
                 (start_date + start_time) + make_interval(mins => (duration_hours*60)::int), '[)')
    ELSE tsrange(start_date::timestamp, (start_date + days)::timestamp, '[)')
  END) STORED

ALTER TABLE bookings ADD CONSTRAINT bookings_no_overlap
  EXCLUDE USING gist (boat_id WITH =, period WITH &&)
  WHERE (status IN ('requested','confirmed','deposit_paid'));
```

Requires `btree_gist`. `tsrange` rather than `tstzrange` because generated columns must be immutable and `date::timestamptz` depends on the session timezone. Kariba is CAT year-round with no DST, so this is correct, not a shortcut.

### reviews
One per booking (`booking_id` unique). A `BEFORE INSERT` trigger rejects the row unless the booking is `completed` and belongs to the caller. Fake reviews from non-customers become impossible.

### hotels
Retained for the existing hotel portal.

### public_boats (view)
The single source of truth for tourist visibility:

```sql
WHERE status = 'approved'
  AND is_active
  AND NOT is_deleted
  AND maintenance_status <> 'overdue'
```

Declared `WITH (security_invoker = on)` and backed by a matching RLS policy on `boats`, so the view is ergonomics and RLS is the real gate. Passes Supabase's security advisor, which flags SECURITY DEFINER views.

## 5. RLS policies

| Table | tourist / anon | owner | admin |
|---|---|---|---|
| profiles | own row | own row | all |
| boats | `public_boats` predicate only | full CRUD where `owner_id = auth.uid()` | all |
| boat_images | approved images of visible boats | own boats only | all |
| boat_operating_hours | none | insert + read own boats | all |
| boat_maintenance_records | none | insert + read own boats | all |
| maintenance_notifications | none | own only | all |
| admin_approval_logs | none | read own boats' entries | all |
| bookings | own bookings | bookings for own boats | all |
| reviews | read all public, write own completed | read + respond on own boats | all |

`is_admin()` is a `SECURITY DEFINER STABLE` helper reading `profiles.role`, so policies never recursively query a table that is itself RLS-protected.

Sensitive columns `pending_changes` and `rejection_reason` are revoked from `anon`. An authenticated non-owner could still read them for a publicly visible boat. This is low severity (an upcoming price change, no PII) and the fix, if it ever matters, is to split them into a `boat_review_state` table with owner-and-admin-only RLS. Logged as a known tradeoff rather than silently ignored.

## 6. Storage

Bucket `boat-images`, path `{owner_id}/{boat_id}/{uuid}.{ext}`.

**Public bucket, unguessable UUID filenames.** Signed URLs were considered and rejected: a tourist grid renders dozens of images, and minting a signed URL per image per page load is slow, uncacheable, and defeats the CDN. Boat photos are not PII. The honest tradeoff: a leaked URL to a rejected image stays fetchable until deleted, which is why rejecting an image hard-deletes the storage object rather than just flagging the row.

Bucket-level enforcement, which the client cannot bypass:
- `file_size_limit` 5 MB
- `allowed_mime_types` `image/jpeg, image/png, image/webp`

The critical write policy ties the storage path to boat ownership:

```sql
CREATE POLICY "owners upload to own boat folder"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'boat-images'
  AND (storage.foldername(name))[1] = auth.uid()::text
  AND EXISTS (SELECT 1 FROM boats b
              WHERE b.id::text = (storage.foldername(name))[2]
                AND b.owner_id = auth.uid())
);
```

An owner cannot write into another owner's folder, and cannot write into a folder for a boat they do not own even inside their own.

## 7. Delete versus deactivate

Three states, not two:

1. **`is_active = false`** — owner-controlled, reversible, instant, no admin. Hidden from tourists, bookings preserved. This is "my boat is out of the water this month".
2. **`is_deleted = true`** — soft delete. Hidden everywhere except admin. Blocked by RPC if the boat has any booking in `requested / confirmed / deposit_paid` with `start_date >= today`, returning a clear error naming the booking count.
3. **Hard delete** — admin only, for fraudulent listings and data-erasure requests. Cascades `boat_images` rows and purges the storage objects.

`bookings.boat_id` uses `ON DELETE RESTRICT`, so the database physically refuses to orphan booking history even if application logic is wrong. This makes hard delete possible only for a boat with **zero booking rows of any status**, which is the intended envelope: a fraudulent listing caught before it transacted. A boat that has ever been booked can only be soft-deleted, and the admin RPC returns that as an explicit error rather than a constraint violation.

## 8. Maintenance logic

```
next_due  = last_maintenance_hours + maintenance_interval_hours
remaining = next_due - accumulated_hours
```

**Logging hours** (RPC `log_operating_hours`): insert ledger row, trigger adds to `accumulated_hours`, trigger compares status before and after and inserts a deduplicated notification if a threshold was crossed.

**Completing maintenance** (RPC `complete_maintenance`): insert a `boat_maintenance_records` row with `hours_at_service = current accumulated_hours`, trigger sets `last_maintenance_hours`, open notifications marked read, cycle resets to `hours_at_service + interval`.

## 9. Security safeguards, mapped to the brief's threats

| Threat | Safeguard |
|---|---|
| Fake boats | Nothing is publicly visible before admin approval; registration number captured; owner verification flag |
| Inappropriate images | Bucket MIME and size limits; `moderation_status` per image; admin reviews images inside the approval queue; reject hard-deletes the object |
| Capacity/safety edited after approval | Sensitive-field edits divert to `pending_changes`; tourists keep seeing approved values until admin clears the diff |
| Hiding maintenance problems | Hours are an append-only ledger; owner cannot write `accumulated_hours` directly; admin dashboard lists overdue boats |
| Deleting a boat with live bookings | RPC blocks it; FK `ON DELETE RESTRICT` is the backstop |
| Tourists seeing unapproved listings | `public_boats` view plus a matching RLS predicate, enforced at the database |
| File upload abuse | Bucket limits (5 MB, image MIME only), path-ownership policy, UUID filenames, cap of 10 images per boat enforced by a `BEFORE INSERT` trigger on `boat_images` |
| Cross-owner access | Every owner policy is `owner_id = auth.uid()`; storage policy checks folder against boat ownership |
| Missing audit trail | `admin_approval_logs` with full snapshots; hours ledger; maintenance history |

## 10. Frontend structure

```
src/lib/supabase.ts
src/services/    auth, boats, images, maintenance, bookings, reviews
src/hooks/       useOwnerBoats, usePendingBoats, usePublicBoats, useMaintenance
src/types/database.ts   (generated from the live schema)
```

`AppDataContext` is deleted. `AuthContext` keeps its current shape but is backed by a Supabase session so pages need minimal changes. New owner routes: `/owner`, `/owner/boats/new`, `/owner/boats/:id/edit`, `/owner/maintenance`. Every data surface gets loading, empty, and error states, plus form validation.

## 11. Implementation order

1. Client, env, Supabase Auth, profiles, role trigger, seeded demo users
2. Boats and images schema, RLS, storage bucket and policies
3. Owner dashboard: register, edit, images, soft delete
4. Maintenance: ledger, records, notifications, RPCs, owner UI
5. Admin: approval queue, image review, pending-changes diff, audit log
6. Tourist side onto `public_boats`; bookings and reviews migrated; mock data deleted

## 12. Testing checklist

- Owner A cannot read, edit, or upload to Owner B's boat, by API and by direct storage path
- A signup requesting `role: admin` lands as `tourist`
- A pending boat never appears in `public_boats`
- Editing price on an approved boat leaves the tourist-visible price unchanged until admin approves
- Two concurrent bookings for the same slot: exactly one succeeds
- Logging hours past the threshold flips status to due, then overdue, and removes the boat from tourist search
- Completing maintenance resets the cycle and clears notifications
- Soft-deleting a boat with a future confirmed booking is refused
- Uploading a 10 MB file or a `.pdf` renamed to `.jpg` is refused by the bucket
- `get_advisors` returns no security errors after the final migration
