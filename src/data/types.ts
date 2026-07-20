// All domain types now come from the Supabase service layer. This module just
// re-exports them so existing imports of '../data/types' keep working.
export type {
  PublicBoat, OwnerBoat, BoatInput, BoatKind, BoatStatus, MaintenanceStatus,
} from '../services/boats.service';
export type { BoatImage } from '../services/images.service';
export type { AppUser, Role } from '../services/auth.service';
export type { BookingStatus, BookingRow, BookingInput } from '../services/bookings.service';
export type { Review } from '../services/reviews.service';
