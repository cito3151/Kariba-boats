export type ExperienceType =
  | 'fishing'
  | 'sunset'
  | 'houseboat'
  | 'private'
  | 'wildlife'
  | 'family';

export type BoatType = 'fishing' | 'houseboat' | 'cruise' | 'charter';

export type PriceUnit = 'hour' | 'day' | 'weekend';

export type BookingStatus =
  | 'requested'
  | 'confirmed'
  | 'deposit_paid'
  | 'completed'
  | 'declined'
  | 'cancelled';

export interface Operator {
  id: string;
  businessName: string;
  contactName: string;
  phone: string;
  verified: boolean;
  trustScore: number; // 0-100
  responseTimeHours: number;
  joinedYear: number;
  cancellationRate: number; // %
}

export interface Boat {
  id: string;
  operatorId: string;
  name: string;
  type: BoatType;
  experiences: ExperienceType[];
  capacity: number;
  priceAmount: number;
  priceUnit: PriceUnit;
  location: string;
  description: string;
  amenities: string[];
  safetyEquipment: string[];
  registrationNumber: string;
  verified: boolean;
  images: string[];
  rating: number;
  reviewCount: number;
  crewIncluded: boolean;
  availableToday: boolean;
}

export interface Hotel {
  id: string;
  name: string;
  location: string;
  commissionRate: number; // %
  verified: boolean;
}

export interface Review {
  id: string;
  bookingId: string;
  boatId: string;
  touristName: string;
  rating: number;
  comment: string;
  date: string;
}

export interface Booking {
  id: string;
  boatId: string;
  touristName: string;
  touristPhone: string;
  hotelId: string | null;
  date: string; // ISO date, first (or only) day of the trip
  days: number; // number of days blocked: 1 for hourly/day trips, 3 for weekends
  startTime?: string; // "HH:MM", only for hourly boats
  durationHours?: number; // only for hourly boats
  groupSize: number;
  experienceType: ExperienceType;
  status: BookingStatus;
  priceTotal: number;
  depositAmount: number;
  createdAt: string;
  notes?: string;
}

export interface VerificationItem {
  id: string;
  entityType: 'boat' | 'operator' | 'hotel';
  entityId: string;
  entityName: string;
  submittedDate: string;
  status: 'pending' | 'approved' | 'rejected';
}
