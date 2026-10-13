import { motion, useReducedMotion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ArrowRight, Gauge, MapPin, ShieldCheck, Users } from 'lucide-react';
import AutoCarousel from './AutoCarousel';
import { revealSpring, useReveal } from './motion';
import { useAsync } from '../hooks/useAsync';
import * as imagesSvc from '../services/images.service';
import type { BoatImage } from '../services/images.service';
import type { PublicBoat, BoatKind } from '../services/boats.service';

const MotionLink = motion.create(Link);

export const BOAT_TYPE_LABELS: Record<BoatKind, string> = {
  houseboat: 'Houseboat',
  speedboat: 'Speedboat',
  fishing: 'Fishing boat',
  cruiser: 'Cruiser',
  pontoon: 'Pontoon',
};

/**
 * A rate the owner actually set. `0` means "I don't offer this", not "free":
 * BoatForm has always validated with `!= null && > 0`, but the tourist-facing
 * helpers checked only for null, so a boat with price_per_day = 0 advertised
 * "$0/day", sorted to the top of "price: low to high", and opened the booking
 * modal on a $0 daily rate. There is a live boat in exactly that state.
 */
function hasRate(value: number | null): value is number {
  return value != null && value > 0;
}

export function priceView(boat: PublicBoat): { amount: number; unit: 'hour' | 'day' } | null {
  if (hasRate(boat.pricePerDay)) return { amount: boat.pricePerDay, unit: 'day' };
  if (hasRate(boat.pricePerHour)) return { amount: boat.pricePerHour, unit: 'hour' };
  return null;
}

// Every rate the owner set, in display order (hourly then daily). Used to show
// hourly and/or daily pricing depending on what the boat offers.
export function priceLabels(boat: Pick<PublicBoat, 'pricePerHour' | 'pricePerDay'>): { amount: number; unit: 'hour' | 'day'; short: string }[] {
  const out: { amount: number; unit: 'hour' | 'day'; short: string }[] = [];
  if (hasRate(boat.pricePerHour)) out.push({ amount: boat.pricePerHour, unit: 'hour', short: 'hr' });
  if (hasRate(boat.pricePerDay)) out.push({ amount: boat.pricePerDay, unit: 'day', short: 'day' });
  return out;
}

export default function BoatCard({ boat, images: providedImages }: { boat: PublicBoat; images?: BoatImage[] }) {
  const reduce = useReducedMotion();
  const reveal = useReveal();
  // When the parent list supplies images (batched, no N+1), use them; otherwise fetch
  // this one boat's images as a fallback. The hook is always called (Promise.resolve
  // skips the network when images were provided).
  const { data } = useAsync(
    () => (providedImages ? Promise.resolve(providedImages) : imagesSvc.listBoatImages(boat.id)),
    [boat.id, providedImages],
  );
  const rows = providedImages ?? data ?? [];
  const sorted = [...rows].sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary));
  const images = sorted.length
    ? sorted.map((i) => imagesSvc.publicImageUrl(i.storagePath))
    : [`illustration:${boat.boatType}`];
  // The headline rate comes from priceView (day if offered, else hour); the other
  // rate, if the owner set one, is shown smaller beneath it. Both go through
  // hasRate, so a 0 rate never reaches the card.
  const price = priceView(boat);
  const secondary = priceLabels(boat).find((r) => r.unit !== price?.unit);

  return (
    <motion.div
      // Slides to its new place when the filters reorder the grid, except under
      // reduced motion, where the grid simply redraws.
      layout={!reduce}
      transition={revealSpring}
      // Rises in as it scrolls into view, in a wave with the cards beside it
      // (see useReveal); reduced motion keeps only a short cross-fade.
      {...reveal}
      className="h-full"
    >
      {/* Hover lifts the card 3px and slowly zooms its photo. framer's hover
          ignores touch, and the zoom is a `group-hover:` class, which Tailwind
          only applies on devices that can hover, so a tap never leaves either
          behind. */}
      <MotionLink
        to={`/boats/${boat.id}`}
        whileHover={reduce ? undefined : { y: -3 }}
        transition={{ type: 'spring', bounce: 0, duration: 0.3 }}
        className="group flex h-full flex-col overflow-hidden rounded-md border border-lake-100 bg-white shadow-[0_1px_3px_rgba(13,37,50,0.08)] outline-none transition-[box-shadow,scale] duration-200 hover:shadow-[0_10px_28px_rgba(13,37,50,0.14)] focus-visible:ring-2 focus-visible:ring-lake-500 focus-visible:ring-offset-2 active:scale-[0.98] motion-reduce:active:scale-100"
      >
        <div className="relative h-44 shrink-0 overflow-hidden">
          <AutoCarousel
            images={images}
            alt={boat.name}
            className="h-full w-full"
            imageClassName="transition-[scale] duration-500 ease-out group-hover:scale-105 motion-reduce:transition-none motion-reduce:group-hover:scale-100"
            showDots
          />
          {/* lake-950 rather than pure black: the scrim reads as part of the
              palette instead of a neutral dropped on top of it. It sits under
              the carousel dots so they stay legible on pale photos. */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[5] h-14 bg-linear-to-t from-lake-950/45 to-transparent" />
          {boat.operatorVerified && (
            <span className="absolute left-2 top-2 z-10 inline-flex items-center gap-1 rounded-sm bg-white px-2 py-1 text-[11px] font-bold uppercase leading-none tracking-[0.06em] text-lake-950 shadow-[0_1px_3px_rgba(13,37,50,0.25)]">
              <ShieldCheck size={12} className="text-lake-600" aria-hidden /> Verified operator
            </span>
          )}
        </div>

        <div className="flex flex-1 flex-col p-4">
          <p className="text-[11px] font-bold uppercase leading-4 tracking-[0.1em] text-lake-600">
            {BOAT_TYPE_LABELS[boat.boatType]}
          </p>
          <h3 className="mt-1 line-clamp-2 text-lg font-bold leading-6 text-lake-950">{boat.name}</h3>
          <p className="mt-1 flex items-center gap-1 text-xs leading-4 text-lake-600">
            <MapPin size={12} className="shrink-0" aria-hidden />
            <span className="truncate">Departs from {boat.location}</span>
          </p>

          <ul className="mt-3 space-y-1 text-xs leading-4 text-lake-600">
            <li className="flex items-center gap-1.5">
              <Users size={12} className="shrink-0" aria-hidden />
              <span>
                Up to <span className="font-semibold tabular-nums text-lake-950">{boat.capacity}</span>{' '}
                {boat.capacity === 1 ? 'guest' : 'guests'}
              </span>
            </li>
            <li className="flex items-center gap-1.5">
              <Gauge size={12} className="shrink-0" aria-hidden />
              <span>
                Operator trust score{' '}
                <span className="font-semibold tabular-nums text-lake-950">{boat.operatorTrustScore}</span>
                <span className="tabular-nums">/100</span>
              </span>
            </li>
          </ul>

          <div className="mt-auto pt-4">
          <div className="flex items-end justify-between gap-3 border-t border-lake-100 pt-4">
            <div className="min-w-0">
              {price ? (
                <>
                  <p className="text-[11px] font-bold uppercase leading-4 tracking-[0.1em] text-lake-600">From</p>
                  <p className="leading-8 text-lake-950">
                    <span className="text-2xl font-bold tabular-nums">${price.amount}</span>
                    <span className="text-sm text-lake-600"> / {price.unit}</span>
                  </p>
                  {secondary && (
                    <p className="text-xs leading-4 text-lake-600">
                      or <span className="font-semibold tabular-nums text-lake-950">${secondary.amount}</span> / {secondary.unit}
                    </p>
                  )}
                </>
              ) : (
                <p className="text-sm leading-5 text-lake-600">Rate not listed</p>
              )}
            </div>
            {/* A span, not a link: the whole card is already the one link. Navy
                on sunset-500 is 5.08:1; white on it is 3.11:1 and fails AA at
                this size. */}
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-sunset-500 px-3.5 py-2.5 text-xs font-bold uppercase leading-4 tracking-[0.08em] text-lake-950 transition-colors group-hover:bg-sunset-400 group-focus-visible:bg-sunset-400">
              View boat <ArrowRight size={14} aria-hidden />
            </span>
          </div>
          </div>
        </div>
      </MotionLink>
    </motion.div>
  );
}
