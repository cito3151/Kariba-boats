import { supabase } from '../lib/supabase';
import { humanizeError } from './errors';

export interface Review {
  id: string; rating: number; comment: string | null;
  operatorResponse: string | null; createdAt: string; touristName: string;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function listReviewsForBoat(boatId: string): Promise<Review[]> {
  const { data, error } = await supabase.from('reviews')
    .select('id, rating, comment, operator_response, created_at, tourist_id, profiles(full_name)')
    .eq('boat_id', boatId).order('created_at', { ascending: false });
  if (error) throw new Error(humanizeError(error.message));
  return (data ?? []).map((r: any) => ({
    id: r.id, rating: r.rating, comment: r.comment,
    operatorResponse: r.operator_response, createdAt: r.created_at,
    touristName: r.profiles?.full_name ?? 'Guest',
  }));
}

export async function createReview(bookingId: string, touristId: string, rating: number, comment: string) {
  const { error } = await supabase.from('reviews').insert({
    booking_id: bookingId, boat_id: '00000000-0000-0000-0000-000000000000',
    tourist_id: touristId, rating, comment,
  });
  // boat_id is overwritten server side by guard_review_authenticity, which also
  // rejects reviews for trips that are not completed or not yours.
  if (error) throw new Error(humanizeError(error.message));
}
