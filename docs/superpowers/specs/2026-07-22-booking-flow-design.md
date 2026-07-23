# Booking Flow Upgrade (Subsystem A)

Date: 2026-07-22
Status: Approved design, ready for implementation plan

## Goal

Make the booking flow production-grade: let tourists book a multi-day range, show
hourly and/or daily pricing based on what the owner set, let the owner configure
the deposit (floor 20%), and compute price and deposit server-side so they cannot
be forged from the client.

## Decisions (approved)

- Deposit is a **percentage** of the booking total, floor 20%, owner-raisable per boat.
- When a boat has **both** an hourly and a daily price, the tourist chooses the rate
  (hourly or daily) at booking time.
- A multi-day (daily-rate) booking is an **inclusive** calendar-day range: Mon to Wed
  is 3 days.

## Key existing facts

- `bookings.period` is a generated `tsrange`: for hourly (`start_time` + `duration_hours`)
  it spans the time slot; otherwise it spans `[start_date, start_date + days)`. A GiST
  exclusion constraint blocks overlapping `period` for active bookings on the same boat.
  So a multi-day span is **already** blocked via `days`: date-range booking is a UI change,
  not a schema change.
- `boats` already store `price_per_hour` and `price_per_day` independently (either nullable).
- `create_booking` (migration 20) currently takes client-supplied `p_price_total` and
  `p_deposit_amount`.

## Data model (migration 22)

- Add `boats.deposit_percent numeric not null default 20 check (deposit_percent >= 20 and deposit_percent <= 100)`.

## Server-authoritative pricing: rework `create_booking` (migration 22)

- **No signature change** and no new parameter: a body-only `create or replace`, so it is
  fully backward compatible (a production frontend on the old build keeps working during
  the deploy, no drop, no PGRST202 window).
- The rate type is **inferred** exactly as the `period` column does: hourly when both
  `p_start_time` and `p_duration_hours` are present, otherwise daily. This matches how the
  client already sends the fields, so no `p_rate_type` param is needed. (When a boat has
  both rates and the tourist picks one, the client simply sends the fields for that rate.)
- `p_price_total` and `p_deposit_amount` are still received but **ignored**; the server
  computes both:
  - daily: `v_total := boat.price_per_day * p_days` (require `price_per_day` not null).
  - hourly: `v_total := boat.price_per_hour * p_duration_hours` (require `price_per_hour` not null).
  - `v_deposit := round(v_total * coalesce(boat.deposit_percent, 20) / 100)`.
  - Insert with the **computed** `price_total` and `deposit_amount`. Consent guard, waiver
    recording, `tourist_id` derivation, and exclusion-violation handling are unchanged.

## Client changes

- `boats.service.ts`: `BoatInput` and `OwnerBoat` gain `depositPercent: number`; map
  `deposit_percent`. `toChanges` includes `deposit_percent`.
- `bookings.service.ts`: `createBooking` sends the span for the chosen rate (days for
  daily, or start_time + duration_hours for hourly). It may still send a client-computed
  price; the server ignores it and returns the authoritative `deposit_amount`.
- `components/owner/BoatForm.tsx`: a "Deposit percentage" number input (min 20, max 100,
  default 20) with helper text.
- `components/BoatCard.tsx` and `pages/BoatDetail.tsx`: show hourly and/or daily price,
  both when both are set. A small `priceLabels(boat)` helper returns the 1 or 2 rate
  strings to render.
- `components/BookingModal.tsx`:
  - If the boat has both rates, a Hourly / Daily segmented toggle (default daily).
  - Daily mode: start-date and end-date pickers; `days = differenceInCalendarDays(end, start) + 1`
    (guard end >= start). Hourly mode: single date + start time + duration (existing).
  - Show the computed total and the deposit (using the boat's `depositPercent`).
  - Pass `p_rate_type` and the correct span to `createBooking`.

## Non-goals

- No change to the exclusion constraint or `period` generation.
- No new bookings columns (end date is derived as `start_date + days - 1` for display).
- Availability calendar UI (showing already-booked dates) is out of scope for this subsystem.

## Testing / verification

1. Migration applies; `deposit_percent` defaults to 20; inserting/altering a boat with
   `deposit_percent` below 20 is rejected by the check.
2. `create_booking`:
   - daily, 3-day range on a boat at $100/day, 20% deposit -> total 300, deposit 60.
   - hourly, 2h on a boat at $50/hour, 30% deposit -> total 100, deposit 30.
   - rejects when the chosen rate has no price on the boat.
   - a call with the current arg shape (sends `p_price_total`) still resolves and computes
     server-side; the returned deposit reflects the boat's percent, not the client value.
3. Multi-day double-booking across an overlapping span is still rejected (exclusion constraint).
4. UI: a both-rate boat shows the toggle; date range computes inclusive days; the deposit
   shown reflects the owner's percent; a day-only boat shows only daily; hour-only only hourly.
5. Build, lint, and security advisor clean; no new ERROR; new column and function keep
   the append-only/guard guarantees intact.

## Consequences

- Price and deposit are trustworthy (server-computed), a prerequisite for real payments later.
- Owners control their deposit within a 20% floor.
- Tourists can book real multi-day trips and pick the rate that suits them.
