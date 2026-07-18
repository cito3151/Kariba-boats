import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import type {
  Boat,
  Booking,
  Review,
  VerificationItem,
  BookingStatus,
  Hotel,
  Operator,
} from './types';
import {
  boats as boatsSeed,
  operators as operatorsSeed,
  hotels as hotelsSeed,
  reviews as reviewsSeed,
  initialBookings,
  verificationQueue as verificationSeed,
} from './mockData';
import { checkAvailability } from './availability';

export type Role = 'tourist' | 'hotel' | 'operator' | 'admin';

interface NewBookingInput {
  boatId: string;
  touristName: string;
  touristPhone: string;
  hotelId: string | null;
  date: string;
  days?: number;
  startTime?: string;
  durationHours?: number;
  groupSize: number;
  experienceType: Booking['experienceType'];
  notes?: string;
}

interface NewHotelInput {
  name: string;
  location: string;
}

interface NewOperatorInput {
  businessName: string;
  contactName: string;
  phone: string;
}

interface AppDataValue {
  boats: Boat[];
  operators: Operator[];
  hotels: Hotel[];
  bookings: Booking[];
  reviews: Review[];
  verifications: VerificationItem[];
  currentHotelId: string;
  setCurrentHotelId: (id: string) => void;
  currentOperatorId: string;
  setCurrentOperatorId: (id: string) => void;
  createBooking: (input: NewBookingInput) => Booking;
  setBookingStatus: (id: string, status: BookingStatus) => void;
  addReview: (review: Omit<Review, 'id' | 'date'>) => void;
  setVerificationDecision: (id: string, decision: 'approved' | 'rejected') => void;
  addHotel: (input: NewHotelInput) => Hotel;
  addOperator: (input: NewOperatorInput) => Operator;
  getBoat: (id: string) => Boat | undefined;
  getOperator: (id: string) => Operator | undefined;
  getHotel: (id: string) => Hotel | undefined;
}

const AppDataContext = createContext<AppDataValue | null>(null);

let bookingCounter = 2000;
let hotelCounter = 100;
let operatorCounter = 100;

export function AppDataProvider({ children }: { children: ReactNode }) {
  const [boats, setBoats] = useState<Boat[]>(boatsSeed);
  const [operators, setOperators] = useState<Operator[]>(operatorsSeed);
  const [hotels, setHotels] = useState<Hotel[]>(hotelsSeed);
  const [bookings, setBookings] = useState<Booking[]>(initialBookings);
  const [reviewList, setReviewList] = useState<Review[]>(reviewsSeed);
  const [verifications, setVerifications] = useState<VerificationItem[]>(verificationSeed);
  const [currentHotelId, setCurrentHotelId] = useState('hotel-1');
  const [currentOperatorId, setCurrentOperatorId] = useState('op-1');

  const createBooking = (input: NewBookingInput): Booking => {
    const boat = boats.find((b) => b.id === input.boatId);
    if (!boat) throw new Error('Boat not found.');

    // Weekend boats always block 3 days; hourly boats block time within 1 day.
    const days = boat.priceUnit === 'weekend' ? 3 : boat.priceUnit === 'hour' ? 1 : (input.days ?? 1);

    const check = checkAvailability(boat, bookings, {
      date: input.date,
      days,
      startTime: input.startTime,
      durationHours: input.durationHours,
    });
    if (!check.ok) throw new Error(check.reason);

    const priceTotal =
      boat.priceUnit === 'hour'
        ? boat.priceAmount * (input.durationHours ?? 2)
        : boat.priceUnit === 'weekend'
          ? boat.priceAmount
          : boat.priceAmount * days;

    const booking: Booking = {
      id: `bk-${bookingCounter++}`,
      boatId: input.boatId,
      touristName: input.touristName,
      touristPhone: input.touristPhone,
      hotelId: input.hotelId,
      date: input.date,
      days,
      startTime: input.startTime,
      durationHours: input.durationHours,
      groupSize: input.groupSize,
      experienceType: input.experienceType,
      status: 'requested',
      priceTotal,
      depositAmount: Math.round(priceTotal * 0.2),
      createdAt: new Date().toISOString(),
      notes: input.notes,
    };
    setBookings((prev) => [booking, ...prev]);
    return booking;
  };

  const setBookingStatus = (id: string, status: BookingStatus) => {
    setBookings((prev) => prev.map((b) => (b.id === id ? { ...b, status } : b)));
  };

  const addReview = (review: Omit<Review, 'id' | 'date'>) => {
    const newReview: Review = {
      ...review,
      id: `rev-${Date.now()}`,
      date: new Date().toISOString().slice(0, 10),
    };
    setReviewList((prev) => [newReview, ...prev]);
    setBoats((prev) =>
      prev.map((b) =>
        b.id === review.boatId
          ? {
              ...b,
              reviewCount: b.reviewCount + 1,
              rating: Number(
                ((b.rating * b.reviewCount + review.rating) / (b.reviewCount + 1)).toFixed(1),
              ),
            }
          : b,
      ),
    );
  };

  const setVerificationDecision = (id: string, decision: 'approved' | 'rejected') => {
    const item = verifications.find((v) => v.id === id);
    setVerifications((prev) => prev.map((v) => (v.id === id ? { ...v, status: decision } : v)));
    if (item && decision === 'approved') {
      if (item.entityType === 'boat') {
        setBoats((prev) => prev.map((b) => (b.id === item.entityId ? { ...b, verified: true } : b)));
      }
      if (item.entityType === 'operator') {
        setOperators((prev) => prev.map((o) => (o.id === item.entityId ? { ...o, verified: true } : o)));
      }
      if (item.entityType === 'hotel') {
        setHotels((prev) => prev.map((h) => (h.id === item.entityId ? { ...h, verified: true } : h)));
      }
    }
  };

  const addHotel = (input: NewHotelInput): Hotel => {
    const hotel: Hotel = {
      id: `hotel-${hotelCounter++}`,
      name: input.name,
      location: input.location || 'Kariba Town',
      commissionRate: 8,
      verified: false,
    };
    setHotels((prev) => [...prev, hotel]);
    setVerifications((prev) => [
      {
        id: `ver-${Date.now()}`,
        entityType: 'hotel',
        entityId: hotel.id,
        entityName: hotel.name,
        submittedDate: new Date().toISOString().slice(0, 10),
        status: 'pending',
      },
      ...prev,
    ]);
    return hotel;
  };

  const addOperator = (input: NewOperatorInput): Operator => {
    const operator: Operator = {
      id: `op-${operatorCounter++}`,
      businessName: input.businessName,
      contactName: input.contactName,
      phone: input.phone,
      verified: false,
      trustScore: 50,
      responseTimeHours: 24,
      joinedYear: new Date().getFullYear(),
      cancellationRate: 0,
    };
    setOperators((prev) => [...prev, operator]);
    setVerifications((prev) => [
      {
        id: `ver-${Date.now()}`,
        entityType: 'operator',
        entityId: operator.id,
        entityName: operator.businessName,
        submittedDate: new Date().toISOString().slice(0, 10),
        status: 'pending',
      },
      ...prev,
    ]);
    return operator;
  };

  const getBoat = (id: string) => boats.find((b) => b.id === id);
  const getOperator = (id: string) => operators.find((o) => o.id === id);
  const getHotel = (id: string) => hotels.find((h) => h.id === id);

  const value = useMemo<AppDataValue>(
    () => ({
      boats,
      operators,
      hotels,
      bookings,
      reviews: reviewList,
      verifications,
      currentHotelId,
      setCurrentHotelId,
      currentOperatorId,
      setCurrentOperatorId,
      createBooking,
      setBookingStatus,
      addReview,
      setVerificationDecision,
      addHotel,
      addOperator,
      getBoat,
      getOperator,
      getHotel,
    }),
    [boats, operators, hotels, bookings, reviewList, verifications, currentHotelId, currentOperatorId],
  );

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

export function useAppData() {
  const ctx = useContext(AppDataContext);
  if (!ctx) throw new Error('useAppData must be used within AppDataProvider');
  return ctx;
}
