// Words for the cancellation policies, reasons and refund states (ADR-003 section 1,
// migration 42). The rules themselves live in the database (cancellation_terms); this
// file only names them, so every screen describes a policy the same way.

export type CancellationPolicy = 'flexible' | 'moderate' | 'strict';
export type CancelledByParty = 'guest' | 'partner' | 'operator' | 'admin' | 'system';
export type CancelReason =
  | 'guest_request' | 'guest_compassionate' | 'partner_error' | 'guest_no_show'
  | 'weather_safety' | 'boat_breakdown' | 'operator_unavailable' | 'operator_breach' | 'other';
export type RefundStatus = 'none' | 'due' | 'refunded' | 'disputed' | 'resolved';
export type RefundOutcome = 'refund_confirmed' | 'no_refund_owed' | 'operator_did_not_pay';
export type CancellationRule =
  | 'request_only' | 'no_show' | 'operator_cancelled' | 'cooling_off' | 'compassionate'
  | 'no_deposit_paid' | 'policy_full_refund' | 'policy_half_kept' | 'policy_deposit_kept';

export const DEFAULT_POLICY: CancellationPolicy = 'moderate';

/** Each preset in one line, as the boat form and the booking pages say it. */
export const POLICY_INFO: Record<CancellationPolicy, { label: string; summary: string; tiers: string[] }> = {
  flexible: {
    label: 'Flexible',
    summary: 'Full deposit back up to 2 days before the trip.',
    tiers: [
      'Cancel 2 or more days before: the whole deposit is refunded.',
      'Cancel less than 2 days before, or no-show: the operator keeps the deposit.',
    ],
  },
  moderate: {
    label: 'Moderate',
    summary: 'Full deposit back up to 14 days before, half back from 3 to 13 days.',
    tiers: [
      'Cancel 14 or more days before: the whole deposit is refunded.',
      'Cancel 3 to 13 days before: half the deposit is refunded.',
      'Cancel less than 3 days before, or no-show: the operator keeps the deposit.',
    ],
  },
  strict: {
    label: 'Strict',
    summary: 'Full deposit back up to 30 days before, half back from 8 to 29 days.',
    tiers: [
      'Cancel 30 or more days before: the whole deposit is refunded.',
      'Cancel 8 to 29 days before: half the deposit is refunded.',
      'Cancel 7 days before or less, or no-show: the operator keeps the deposit.',
    ],
  },
};

export const POLICY_ORDER: CancellationPolicy[] = ['flexible', 'moderate', 'strict'];

/** What always applies on top of every policy (terms, "Cancellations, changes and refunds"). */
export const POLICY_OVERRIDES = [
  'Within 7 days of booking you can cancel with no fee.',
  'No fee if the guest or close family has died or is in hospital.',
  'If the operator cancels, the whole deposit is refunded.',
  'Before the deposit is paid there is nothing to pay and nothing to refund.',
];

/** Said wherever a refund appears: the platform records refunds, it never moves money. */
export const OFF_PLATFORM_NOTE =
  'Kariba Lake Connect does not hold or send money. The operator pays any refund back to you directly, the same way the deposit was paid.';

export const REASON_LABELS: Record<CancelReason, string> = {
  guest_request: 'The guest asked to cancel',
  guest_compassionate: 'Death or hospitalisation',
  partner_error: 'Booked in error by the hotel or agency',
  guest_no_show: 'The guest did not show up',
  weather_safety: 'Weather or safety',
  boat_breakdown: 'Boat breakdown',
  operator_unavailable: 'Operator unavailable',
  operator_breach: 'Operator did not honour the booking',
  other: 'Other',
};

/** The reasons each canceller may choose, before and after the trip's start time. */
export function reasonsFor(party: CancelledByParty, started: boolean): CancelReason[] {
  switch (party) {
    case 'partner': return ['guest_request', 'partner_error'];
    case 'operator':
      return started
        ? ['guest_no_show', 'weather_safety', 'boat_breakdown']
        : ['weather_safety', 'boat_breakdown', 'operator_unavailable', 'guest_request', 'other'];
    case 'admin':
      return started
        ? ['guest_request', 'guest_no_show', 'weather_safety', 'boat_breakdown', 'operator_unavailable', 'operator_breach', 'other']
        : ['guest_request', 'partner_error', 'weather_safety', 'boat_breakdown', 'operator_unavailable', 'operator_breach', 'other'];
    default: return ['guest_request'];
  }
}

/** Why the fee is what it is, in a sentence. */
export const RULE_TEXT: Record<CancellationRule, string> = {
  request_only: 'The operator has not confirmed this request, so there is nothing to pay.',
  no_show: 'A no-show: the operator keeps the deposit.',
  operator_cancelled: 'Cancelled for an operator reason, so the whole deposit is refunded.',
  cooling_off: 'Booked 7 days ago or less, so there is no fee.',
  compassionate: 'Death or hospitalisation: no fee.',
  no_deposit_paid: 'No deposit has been paid, so there is no fee and nothing to refund.',
  policy_full_refund: 'Enough notice under the policy: the whole deposit is refunded.',
  policy_half_kept: 'Under the policy the operator keeps half the deposit.',
  policy_deposit_kept: 'Too close to the trip under the policy: the operator keeps the deposit.',
};

export const REFUND_STATUS_LABELS: Record<RefundStatus, string> = {
  none: 'No refund due',
  due: 'Refund due',
  refunded: 'Marked refunded by the operator',
  disputed: 'Reported not received',
  resolved: 'Resolved by Kariba Lake Connect',
};

export const REFUND_OUTCOME_LABELS: Record<RefundOutcome, string> = {
  refund_confirmed: 'The guest has been refunded',
  no_refund_owed: 'No further refund was owed',
  operator_did_not_pay: 'The operator did not pay',
};

/** "$40" or "$40.50", for deposit-sized amounts. */
export function money(n: number | null | undefined): string {
  const v = Number(n ?? 0);
  return `$${Number.isInteger(v) ? v : v.toFixed(2)}`;
}

/** "29 Oct 2026" from an ISO date or timestamp. */
export function longDate(iso: string | null | undefined): string {
  if (!iso) return '';
  // A bare date is read as a calendar day, never shifted by the viewer's time zone.
  const d = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T12:00:00`) : new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Today on the Kariba calendar (Africa/Harare), as YYYY-MM-DD, the day the server uses. */
export function karibaToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Harare' }).format(new Date());
}

/** Coerce a value from the server into a known policy, or null. */
export function asPolicy(v: unknown): CancellationPolicy | null {
  return v === 'flexible' || v === 'moderate' || v === 'strict' ? v : null;
}

const REFUND_STATUSES: readonly RefundStatus[] = ['none', 'due', 'refunded', 'disputed', 'resolved'];
export function asRefundStatus(v: unknown): RefundStatus {
  return REFUND_STATUSES.includes(v as RefundStatus) ? (v as RefundStatus) : 'none';
}

/** Whose screen a booking is shown on. */
export type Viewer = 'guest' | 'partner' | 'operator' | 'admin';

/** "you", "the guest", "Lake View Lodge", "the operator"... from the reader's side. */
export function cancelledByText(
  party: CancelledByParty | null, viewer: Viewer | 'public',
  opts: { partnerName?: string | null; isAgency?: boolean; guestWord?: string } = {},
): string {
  const guestWord = opts.guestWord ?? 'guest';
  switch (party) {
    case 'guest': return viewer === 'guest' || viewer === 'public' ? 'you' : `the ${guestWord}`;
    case 'partner':
      if (opts.partnerName) return opts.partnerName;
      if (viewer === 'partner') return 'your team';
      return opts.isAgency ? 'the travel agency' : 'the hotel';
    case 'operator': return viewer === 'operator' ? 'your team' : 'the operator';
    case 'admin':
    case 'system': return 'Kariba Lake Connect';
    default: return 'someone';
  }
}

/** Whether a refund needs an administrator now: reported not received, or past its due date. */
export function refundNeedsAdmin(
  b: { refundStatus: RefundStatus; refundDueBy: string | null }, today = karibaToday(),
): boolean {
  return b.refundStatus === 'disputed'
    || (b.refundStatus === 'due' && b.refundDueBy !== null && today > b.refundDueBy);
}
