import { supabase } from '../lib/supabase';
import type { TablesInsert } from '../types/database';
import { humanizeError } from './errors';

/* Ratings and reviews.
 *
 * Migration 32 adds the reviewer's first name and trip month (stamped by the
 * server), four optional category scores, operator reply timestamps, admin
 * moderation (hidden, hidden_reason) and the boat_rating_summary view. Until it
 * is applied, every read here falls back to the columns migration 05 created:
 * summaries are computed in the browser from the visible reviews, there are no
 * category scores, and the reply and moderation controls stay hidden (callers
 * check hasReviewsUpgrade()). Nothing throws because a column is missing. */

export type HiddenReason = 'abuse' | 'personal_data' | 'spam';
export type RatingCategory = 'condition' | 'crew' | 'value' | 'safety';
export type CategoryScores = Partial<Record<RatingCategory, number>>;

export const RATING_CATEGORIES: readonly RatingCategory[] = ['condition', 'crew', 'value', 'safety'];

export const CATEGORY_LABELS: Record<RatingCategory, string> = {
  condition: 'Boat condition',
  crew: 'Captain and crew',
  value: 'Value',
  safety: 'Safety',
};

export const HIDDEN_REASON_LABELS: Record<HiddenReason, string> = {
  abuse: 'Abuse',
  personal_data: 'Personal data',
  spam: 'Spam',
};

/** What each star means, for the rating control and its screen reader labels. */
export const RATING_WORDS: Record<number, string> = {
  1: 'Poor', 2: 'Fair', 3: 'Good', 4: 'Very good', 5: 'Excellent',
};

export const REVIEW_MAX_LENGTH = 1000;
export const REPLY_MAX_LENGTH = 1000;

export interface Review {
  id: string;
  boatId: string;
  bookingId: string;
  touristId: string;
  rating: number;
  comment: string | null;
  operatorResponse: string | null;
  operatorRespondedAt: string | null;
  createdAt: string;
  /** First name only, or "Guest". Never the full name. */
  reviewerName: string;
  /** First day of the trip's month (ISO date), or null before migration 32. */
  tripMonth: string | null;
  categories: CategoryScores;
  hidden: boolean;
  hiddenReason: HiddenReason | null;
  hiddenAt: string | null;
  /** Filled for the owner and admin lists only. */
  boatName: string | null;
  bookingReference: string | null;
}

export interface RatingSummary {
  count: number;
  /** Null when there are no visible reviews: the interface says "New", never 0. */
  average: number | null;
  /** Reviews per star, index 0 = 1 star ... index 4 = 5 stars. */
  distribution: [number, number, number, number, number];
  categories: CategoryScores;
}

export const EMPTY_SUMMARY: RatingSummary = {
  count: 0, average: null, distribution: [0, 0, 0, 0, 0], categories: {},
};

// ---- Is migration 32 applied? ------------------------------------------------------

type PgError = { code?: string; message?: string } | null;

function isSchemaMissing(e: PgError): boolean {
  if (!e) return false;
  // 42703 undefined column, 42P01 undefined table, PGRST2xx schema cache misses.
  return ['42703', '42P01', '42883', 'PGRST200', 'PGRST202', 'PGRST204', 'PGRST205'].includes(e.code ?? '')
    || /does not exist|schema cache/i.test(e.message ?? '');
}

let upgradeProbe: Promise<boolean> | null = null;

/**
 * True once migration 32's columns exist. Asked once per page load and cached;
 * a network failure is not cached, so the next call asks again.
 */
export function hasReviewsUpgrade(): Promise<boolean> {
  if (!upgradeProbe) {
    upgradeProbe = (async () => {
      const { error } = await supabase.from('reviews').select('hidden').limit(1);
      if (!error) return true;
      if (!isSchemaMissing(error)) upgradeProbe = null;
      return false;
    })();
  }
  return upgradeProbe;
}

// ---- Mapping -----------------------------------------------------------------------

const V32_COLS = `id, boat_id, booking_id, tourist_id, rating, comment, operator_response,
  operator_responded_at, created_at, reviewer_name, trip_month,
  rating_condition, rating_crew, rating_value, rating_safety,
  hidden, hidden_reason, hidden_at`;

// The FK is named because migration 32 adds a second link to profiles (hidden_by).
// Profiles are readable only by their owner and admins, so for everyone else the
// name comes back null and the review says "Guest".
const LEGACY_COLS = `id, boat_id, booking_id, tourist_id, rating, comment, operator_response,
  created_at, profiles!reviews_tourist_id_fkey(full_name)`;

const LIST_EXTRAS = ', boats(name), bookings(reference)';

/** First name only, for privacy, from whatever the database holds. */
function firstName(name: string | null | undefined): string {
  const first = (name ?? '').trim().split(/\s+/)[0] ?? '';
  return first ? first.slice(0, 40) : 'Guest';
}

const HIDDEN_REASONS: readonly HiddenReason[] = ['abuse', 'personal_data', 'spam'];

/* eslint-disable @typescript-eslint/no-explicit-any */
function toReview(r: any): Review {
  const categories: CategoryScores = {};
  if (r.rating_condition != null) categories.condition = r.rating_condition;
  if (r.rating_crew != null) categories.crew = r.rating_crew;
  if (r.rating_value != null) categories.value = r.rating_value;
  if (r.rating_safety != null) categories.safety = r.rating_safety;
  return {
    id: r.id,
    boatId: r.boat_id,
    bookingId: r.booking_id,
    touristId: r.tourist_id,
    rating: r.rating,
    comment: r.comment,
    operatorResponse: r.operator_response,
    operatorRespondedAt: r.operator_responded_at ?? null,
    createdAt: r.created_at,
    reviewerName: firstName(r.reviewer_name ?? r.profiles?.full_name),
    tripMonth: r.trip_month ?? null,
    categories,
    hidden: r.hidden === true,
    hiddenReason: HIDDEN_REASONS.includes(r.hidden_reason) ? r.hidden_reason : null,
    hiddenAt: r.hidden_at ?? null,
    boatName: r.boats?.name ?? null,
    bookingReference: r.bookings?.reference ?? null,
  };
}

// ---- Summaries ---------------------------------------------------------------------

/** The summary of a set of reviews, leaving hidden ones out, as the view does. */
export function summarize(reviews: Pick<Review, 'rating' | 'categories' | 'hidden'>[]): RatingSummary {
  const visible = reviews.filter((r) => !r.hidden);
  if (visible.length === 0) return EMPTY_SUMMARY;
  const distribution: RatingSummary['distribution'] = [0, 0, 0, 0, 0];
  let total = 0;
  for (const r of visible) {
    total += r.rating;
    if (r.rating >= 1 && r.rating <= 5) distribution[r.rating - 1] += 1;
  }
  const categories: CategoryScores = {};
  for (const key of RATING_CATEGORIES) {
    const scores = visible.map((r) => r.categories[key]).filter((n): n is number => n != null);
    if (scores.length) categories[key] = scores.reduce((s, n) => s + n, 0) / scores.length;
  }
  return { count: visible.length, average: total / visible.length, distribution, categories };
}

function fromSummaryRow(r: any): RatingSummary {
  const count = Number(r.review_count ?? 0);
  if (count === 0) return EMPTY_SUMMARY;
  const categories: CategoryScores = {};
  if (r.avg_condition != null) categories.condition = Number(r.avg_condition);
  if (r.avg_crew != null) categories.crew = Number(r.avg_crew);
  if (r.avg_value != null) categories.value = Number(r.avg_value);
  if (r.avg_safety != null) categories.safety = Number(r.avg_safety);
  return {
    count,
    average: r.average_rating != null ? Number(r.average_rating) : null,
    distribution: [r.count_1, r.count_2, r.count_3, r.count_4, r.count_5].map((n) => Number(n ?? 0)) as RatingSummary['distribution'],
    categories,
  };
}

/**
 * The public rating of each boat, keyed by boat id, with an entry for every id
 * asked for (EMPTY_SUMMARY when it has no visible review). One request for the
 * whole list, so the landing grid does not fetch per card.
 */
export async function getRatingSummaries(boatIds: string[]): Promise<Record<string, RatingSummary>> {
  const out: Record<string, RatingSummary> = {};
  for (const id of boatIds) out[id] = EMPTY_SUMMARY;
  if (boatIds.length === 0) return out;

  if (await hasReviewsUpgrade()) {
    const { data, error } = await supabase.from('boat_rating_summary').select('*').in('boat_id', boatIds);
    if (!error) {
      for (const row of data ?? []) if (row.boat_id) out[row.boat_id] = fromSummaryRow(row);
      return out;
    }
    if (!isSchemaMissing(error)) throw new Error(humanizeError(error.message));
  }

  // Before migration 32: every review is visible, so the average is simply theirs.
  const { data, error } = await supabase.from('reviews').select('boat_id, rating').in('boat_id', boatIds);
  if (error) throw new Error(humanizeError(error.message));
  const byBoat: Record<string, { rating: number; categories: CategoryScores; hidden: boolean }[]> = {};
  for (const r of data ?? []) (byBoat[r.boat_id] ??= []).push({ rating: r.rating, categories: {}, hidden: false });
  for (const [id, rows] of Object.entries(byBoat)) out[id] = summarize(rows);
  return out;
}

export async function getRatingSummary(boatId: string): Promise<RatingSummary> {
  const all = await getRatingSummaries([boatId]);
  return all[boatId] ?? EMPTY_SUMMARY;
}

// ---- Lists -------------------------------------------------------------------------

/** A boat's public reviews, newest first. Hidden ones are left out for everyone. */
export async function listReviewsForBoat(boatId: string): Promise<Review[]> {
  if (await hasReviewsUpgrade()) {
    const { data, error } = await supabase.from('reviews').select(V32_COLS)
      .eq('boat_id', boatId).eq('hidden', false).order('created_at', { ascending: false });
    if (error) throw new Error(humanizeError(error.message));
    return (data ?? []).map(toReview);
  }
  const { data, error } = await supabase.from('reviews').select(LEGACY_COLS)
    .eq('boat_id', boatId).order('created_at', { ascending: false });
  if (error) throw new Error(humanizeError(error.message));
  return (data ?? []).map(toReview);
}

/** The signed-in guest's own reviews, hidden ones included (marked hidden). */
export async function listMyReviews(touristId: string): Promise<Review[]> {
  if (!touristId) return [];
  const cols = (await hasReviewsUpgrade()) ? V32_COLS : LEGACY_COLS;
  const { data, error } = await supabase.from('reviews').select(cols).eq('tourist_id', touristId);
  if (error) throw new Error(humanizeError(error.message));
  return (data ?? []).map(toReview);
}

export interface OwnerReviews {
  boats: { id: string; name: string }[];
  reviews: Review[];
}

/** Every review of the owner's boats, hidden ones included, newest first. */
export async function listReviewsForOwner(ownerId: string): Promise<OwnerReviews> {
  const { data: boats, error: bErr } = await supabase.from('boats')
    .select('id, name').eq('owner_id', ownerId).eq('is_deleted', false)
    .order('name', { ascending: true });
  if (bErr) throw new Error(humanizeError(bErr.message));
  const list = (boats ?? []).map((b) => ({ id: b.id, name: b.name }));
  if (list.length === 0) return { boats: [], reviews: [] };
  const cols = ((await hasReviewsUpgrade()) ? V32_COLS : LEGACY_COLS) + LIST_EXTRAS;
  const { data, error } = await supabase.from('reviews').select(cols)
    .in('boat_id', list.map((b) => b.id)).order('created_at', { ascending: false });
  if (error) throw new Error(humanizeError(error.message));
  return { boats: list, reviews: (data ?? []).map(toReview) };
}

/** Every review on the platform, for moderation. RLS gives admins all of them. */
export async function listAllReviews(): Promise<Review[]> {
  const cols = ((await hasReviewsUpgrade()) ? V32_COLS : LEGACY_COLS) + LIST_EXTRAS;
  const { data, error } = await supabase.from('reviews').select(cols)
    .order('created_at', { ascending: false }).limit(500);
  if (error) throw new Error(humanizeError(error.message));
  return (data ?? []).map(toReview);
}

// ---- Writes ------------------------------------------------------------------------

export async function createReview(
  bookingId: string, touristId: string, rating: number, comment: string, categories: CategoryScores = {},
) {
  const row: TablesInsert<'reviews'> = {
    booking_id: bookingId, boat_id: '00000000-0000-0000-0000-000000000000',
    tourist_id: touristId, rating, comment: comment || null,
  };
  // Category scores only once their columns exist; before that they are not offered.
  if (await hasReviewsUpgrade()) {
    if (categories.condition) row.rating_condition = categories.condition;
    if (categories.crew) row.rating_crew = categories.crew;
    if (categories.value) row.rating_value = categories.value;
    if (categories.safety) row.rating_safety = categories.safety;
  }
  // boat_id is overwritten server side by guard_review_authenticity, which also
  // rejects reviews for trips that are not completed or not yours.
  const { error } = await supabase.from('reviews').insert(row);
  if (error) {
    if (error.code === '23505') throw new Error('You have already reviewed this trip.');
    throw new Error(humanizeError(error.message));
  }
}

/** The operator's one public reply. An empty reply removes it. */
export async function replyToReview(reviewId: string, reply: string) {
  const { error } = await supabase.rpc('reply_to_review', { p_review_id: reviewId, p_reply: reply });
  if (error) throw new Error(humanizeError(error.message));
}

export async function setReviewHidden(reviewId: string, hidden: boolean, reason?: HiddenReason) {
  const { error } = await supabase.rpc('admin_set_review_visibility', {
    p_review_id: reviewId, p_hidden: hidden, ...(hidden && reason ? { p_reason: reason } : {}),
  });
  if (error) throw new Error(humanizeError(error.message));
}

// ---- Formatting --------------------------------------------------------------------

/** "June 2026" from an ISO date or timestamp. */
export function formatMonth(iso: string): string {
  const [y, m] = iso.slice(0, 7).split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

/** "4.8" — one decimal, as the cards and the boat page show it. */
export function formatAverage(n: number): string {
  return n.toFixed(1);
}
