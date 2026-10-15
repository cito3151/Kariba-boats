# ADR-001: Guests edit their booking request in place

**Date:** 2026-10-15
**Status:** Accepted (implementation in migration 39, pending review and apply)

## Context

The owner approved the feature: "Go for the guest editing a booking." Today a guest who
picked the wrong day, the wrong group size or mistyped their phone has two options: cancel
and book again, or message the operator. Both lose something. Cancel-and-rebook issues a
new booking reference (the one the guest already shared with family or a hotel desk),
releases the slot before the new one is safe, and leaves the operator two rows to make
sense of. Messaging the operator leaves the request in the system with wrong details.

### What the database already guarantees (checked live, project `sbrsptgpnjljnongklus`)

- **Overlap.** `bookings_no_overlap` is a GiST `EXCLUDE (boat_id =, period &&)` over
  `status in ('requested','confirmed','deposit_paid')`. `period` is a generated column
  from `start_date`, `days`, `start_time` and `duration_hours`. An `UPDATE` of a row is
  checked against every *other* row, so a booking never conflicts with itself.
  `create_booking` maps `exclusion_violation` to a readable message.
- **Calendar.** `boat_busy_periods(boat_id)` (migration 30) returns `start_date, days,
  start_time, duration_hours, status` of blocking, unfinished bookings of a listed boat.
  It deliberately returns no ids.
- **Pricing.** `create_booking` ignores `p_price_total` and `p_deposit_amount` and prices
  from the boat's rates: `price_per_hour * duration_hours` or `price_per_day * days`, and
  `round(total * coalesce(deposit_percent, 20) / 100)` for the deposit.
- **Bookability.** `create_booking` refuses a boat that `public_boats` does not list
  (migration 36 B3).
- **Capacity.** *Not* enforced on the server. `create_booking` accepts any group size of
  at least 1 (`bookings_group_size_check`); only the form's `max={boat.capacity}` stops a
  larger group. This decision closes that gap for both paths.
- **Waiver.** `create_booking` requires `p_waiver_accepted` and the current
  `booking_waiver` version, and writes a `consent_records` row (context `booking`,
  `booking_id`).
- **Reference.** `guard_booking_reference` (migration 31) assigns the reference on insert
  and raises on any change, with no `auth.uid() is null` exemption.
- **Tracking.** `track_booking(reference, phone)` matches the last 9 digits of
  `guest_phone`. Changing the phone changes the number a guest must type on `/track`.
- **Audit.** `audit_bookings` (AFTER INSERT/UPDATE/DELETE, `record_audit`) writes the
  actor, role and a per-column old/new diff to `audit_log` for every update.
- **Writes.** `authenticated` has no UPDATE grant on `bookings`; every change is a
  SECURITY DEFINER RPC (`owner_set_booking_status`, `cancel_booking`, `assign_captain`).
  It still holds table-wide INSERT, DELETE and TRUNCATE, which no policy or client uses.
- **Who acts on a booking.** `cancel_booking` (migration 36 P1-c) allows the tourist, the
  boat's owner, the hotel or agency the booking was made by, and admins.

### Requirements

1. While a booking is `requested`, its party may change the dates (or start time and
   duration for an hourly trip), the group size, the notes, and the guest's name and phone.
2. From `confirmed` on, it is locked: the guest asks the operator, or cancels and rebooks.
3. Every rule `create_booking` applies still applies, priced on the server.
4. The reference never changes.
5. The operator can see that a request changed, and when.
6. Batch 5 replaces owner checks (`owner_id = auth.uid()`) with `is_boat_manager()` for
   multi-user companies; owner-side code touched here must be easy to swap.

## Decision

**We will edit a `requested` booking in place through one SECURITY DEFINER RPC,
`update_booking_request`, which locks the row, re-runs the same validation and pricing as
`create_booking` through a shared helper, and stamps `bookings.updated_by_guest_at`.
Confirmed bookings stay locked; operators and admins do not get an edit path.**

### Scope and window

- **Editable:** start date, days (daily) or start time and duration (hourly), rate basis
  (daily or hourly, where the boat offers both), group size, experience, notes, guest name,
  guest phone.
- **Never editable:** boat, status, reference, tourist / hotel / agency link, captain,
  created_at. Changing boat is a different booking: cancel and rebook.
- **Window:** only while `status = 'requested'`. The check runs after the row is locked,
  so it sees the status the operator last committed.

### Who may edit

- The booking's tourist (`tourist_id` = caller).
- The hotel the booking was made for, by any verified user linked to that hotel, while the
  hotel is active. The agency likewise. This is the same "who" as `cancel_booking`, plus
  the verification checks `create_booking` and `guard_hotel_booking` apply when booking:
  a partner that could no longer create this booking cannot reshape it either.
- **Not the operator.** A request is the guest's offer. If the operator could change it,
  the guest would be committed to dates, a group size or a price they never chose, and the
  operator would be confirming their own edit. The operator already holds the phone number
  and the confirm / decline buttons; for a change they talk to the guest, who edits (or
  they decline and the guest rebooks). It also keeps the owner-side surface that batch 5
  has to migrate to `is_boat_manager()` from growing.
- **Not admins.** No support process needs it today, and an admin edit has the same
  consent problem as an operator edit (the guest did not agree to the new terms, and the
  waiver acceptance would be the admin's, not the guest's). Admins can cancel. Revisit if
  support asks, with the guest's confirmation recorded.

All identity tests compare against a non-null `auth.uid()` (the RPC refuses anonymous
callers first) and test each partner link with `x is not null and x is not distinct from
y`, so a caller with no hotel never matches a booking with no hotel.

### Integrity rules

- **Shared validation and price.** A new internal helper,
  `price_booking_request(boat, name, phone, start, days, group, start_time, duration)`,
  holds everything `create_booking` checked about the trip: boat exists, listed in
  `public_boats`, rate present, total and deposit. `create_booking` is rewritten to call it
  (same signature, same grants, otherwise the live body), so the two paths cannot drift.
  The helper also adds the checks both paths were missing: group size within the boat's
  `capacity`, no start date before today on the Kariba calendar (Africa/Harare), a rate
  of 0 counts as "no rate" (the form already treats it that way), and readable messages
  for the name, phone, days and duration rules that were only table CHECKs.
  The helper is SECURITY INVOKER with EXECUTE revoked from every client role; it only runs
  inside the two definer functions.
- **Price follows the trip.** If any pricing input changes (start date, days, start time,
  duration, rate basis), the booking is re-priced from the boat's current rates and
  deposit percent, exactly as on create. If only contact details, notes, group size or
  experience change, the stored price stands: fixing a typo in a phone number must not
  silently move the price to a rate the operator changed since. The client sends no price
  at all; the RPC has no price parameters.
- **Overlap.** The UPDATE itself is checked by `bookings_no_overlap`; an
  `exclusion_violation` becomes "Those dates or times are already booked… your booking is
  unchanged." Because it is one statement in one transaction, the guest never loses the
  old slot while trying for a new one.
- **Calendar.** The edit form reuses `AvailabilityCalendar` fed by `boat_busy_periods`,
  with the booking's own block removed on the client. Since the function returns no ids,
  the block is matched on its exact `(start_date, days, start_time, duration_hours)`,
  which the exclusion constraint makes unique among blocking rows of one boat. No server
  change and no id-probing parameter on a function anon can call.
- **Waiver.** Re-accepted on every edit, with the same check `create_booking` makes
  (current version, explicit acceptance) and a new `consent_records` row for the booking.
  Reasons: the edit is a new offer under possibly different dates and group; the waiver
  may have been republished since the request; the person editing may not be the person
  who created it (a hotel colleague); and it reuses `create_booking`'s check verbatim.
  Cost to the guest: one checkbox.
- **Reference.** Untouched by the RPC; `guard_booking_reference` still raises if anything
  tries. The confirmation screen shows the same reference.
- **Tracking.** A new phone takes effect for `/track` at once. The form says so under the
  phone field, and the confirmation repeats it.
- **Audit.** No new mechanism: `audit_bookings` records the caller and every changed
  column (including the new timestamp); `consent_records` records the re-acceptance.
- **Concurrency.** `select … for update` on the booking, the same lock
  `owner_set_booking_status` and `cancel_booking` take, so an edit and a confirm
  serialise. Whichever commits second sees the first: an edit after a confirm is refused
  ("no longer a request"); a confirm after an edit is checked by the stale-view guard below.
- **No-op.** If nothing differs, nothing is written and no timestamp is set, so the
  operator is not told about a change that did not happen.

### Telling the operator

- New column `bookings.updated_by_guest_at timestamptz`, set to `now()` by the RPC only.
  No client UPDATE grant exists, so no guard trigger is needed; table-wide SELECT already
  covers it for everyone who can see the booking.
- The owner's bookings page shows a "Changed by guest, <time>" chip on the card.
- **Stale-view guard.** `owner_set_booking_status` gains an optional
  `p_seen_guest_change timestamptz`. While the booking is `requested` and
  `updated_by_guest_at` is set, a transition is refused unless the caller passes the value
  it displayed. The owner page passes it, so an operator who loaded the page before the
  guest changed the dates cannot confirm the new dates unseen; they get "The guest changed
  this request after you opened it…" and the reload shows the new details. Old clients
  that pass nothing still work for every booking a guest never changed.
- Push or email notification is out of scope (there is no notification channel for
  bookings yet); the chip is the minimum the owner asked for.

### Batch 5 note

The only owner-side check this decision touches is the existing
`v_owner is distinct from auth.uid()` in `owner_set_booking_status`, kept verbatim and
marked in the migration. Batch 5 swaps that line for `not public.is_boat_manager(v_booking.boat_id)`
(the function already exists live). `update_booking_request` has no owner path at all.

## Alternatives Considered

| Option | Pros | Cons |
|--------|------|------|
| **Edit in place through an RPC (chosen)** | Atomic: lock, validate, re-price and move the slot in one statement, so the old slot is kept if the new one is taken. Reference, created_at and history stay on one row. Reuses `create_booking`'s rules through a shared helper. Small UI: the existing modal in an edit mode. | A second write path into `bookings` to keep in step with `create_booking` (mitigated by the shared helper). The operator must notice that a request changed (chip plus stale-view guard). |
| Cancel and rebook (client calls `cancel_booking` then `create_booking`) | No new server code. | New reference every time, which breaks requirement 4 and `/track`. Two transactions: the old slot is released before the new one is safe, so a failed rebook leaves the guest with nothing. Two rows, a cancellation and a fresh request, for one trip in the operator's list and the audit log. Remains the documented path for *confirmed* bookings, where it is a deliberate choice. |
| Request a change for the operator to approve (pending-changes row) | Operator stays in control of every change. Would also work for confirmed bookings. | While a booking is `requested` the operator has committed to nothing, so an approval step duplicates the confirm step they are about to take. Needs a new table or JSON column, an approve / reject RPC, a second slot hold (or none, and a race), and owner UI, all of which batch 5 would then migrate. Disproportionate for the requested window; worth revisiting only if changes to confirmed bookings are wanted. |
| Operator (or admin) may edit the request too | Saves a phone call for small fixes. | The guest is bound to terms they did not set; the waiver acceptance would be the operator's; more owner-side surface for batch 5. See "Who may edit". |
| Relax `boat_busy_periods` with `p_exclude_booking_id` | The server removes the guest's own block. | The function is callable by anon; an id parameter lets anyone probe whether a booking id belongs to a boat. The exact-slot match on the client gives the same result without it. |

## Consequences

**Positive:**
- A guest fixes a request in one step and keeps their reference and their slot.
- Hotels and agencies correct a guest's details without a cancellation on the record.
- `create_booking` gains server-side capacity, past-date and zero-rate checks it lacked,
  because both paths now share one helper.
- Every change is audited (who, what, old and new) and re-consented.
- Operators see that a request changed and cannot confirm a version they have not seen.
- `bookings` loses its unused table-wide INSERT, DELETE and TRUNCATE grants for clients;
  every write is an RPC.

**Negative:**
- One more checkbox on edit (waiver re-acceptance).
- `owner_set_booking_status` changes signature (a defaulted third argument); the old
  two-argument function is dropped so calls are not ambiguous.
- `create_booking` is stricter: a group above the boat's capacity, a past start date or a
  0 rate is now refused by the server. The form already prevented all three, so only
  hand-made calls notice.
- The edit form and the owner page depend on the new column: deploy the frontend after
  migration 39 is applied, or the booking lists' select fails.

**Risks:**
- A guest could edit repeatedly to hold a slot while deciding. The hold is the same one a
  request already has; the operator can decline. Rate-limit later if abuse shows up.
- Re-pricing at current rates when the trip changes may raise the price if the operator
  changed rates after the request. The form shows the old and new totals before saving.
- The client's own-block match on `boat_busy_periods` assumes the exclusion constraint
  keeps blocking periods unique per boat; if that constraint were ever relaxed, the
  calendar could hide one extra block (the server still refuses a real clash).
- The stale-view guard trusts the client to echo the timestamp it displayed. A client that
  re-reads just before confirming defeats the purpose, but cannot do harm beyond today's
  behaviour.

## References

- `supabase/migrations/05_create_bookings_and_reviews.sql`: `bookings_no_overlap`.
- `supabase/migrations/30_boat_busy_periods.sql`: the calendar's busy periods.
- `supabase/migrations/31_booking_reference.sql`: reference guard and `track_booking`.
- `supabase/migrations/36_crud_integrity_fixes.sql`: B3 bookability, B4 agency checks,
  P1-c partner cancel, M4 null-safe ownership.
- `supabase/migrations/37_crud_features.sql`: `guard_hotel_booking` active-partner checks.
- `supabase/migrations/39_guest_booking_edits.sql`: this decision.
- Live `pg_get_functiondef` of `create_booking`, `cancel_booking`,
  `owner_set_booking_status`, `guard_hotel_booking`, `is_boat_manager`, read 2026-10-15.
