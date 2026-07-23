import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Users, ShieldCheck } from 'lucide-react';
import AutoCarousel from './AutoCarousel';
import { useAsync } from '../hooks/useAsync';
import * as imagesSvc from '../services/images.service';
import type { PublicBoat, BoatKind } from '../services/boats.service';

const MotionLink = motion.create(Link);

export const BOAT_TYPE_LABELS: Record<BoatKind, string> = {
  houseboat: 'Houseboat',
  speedboat: 'Speedboat',
  fishing: 'Fishing boat',
  cruiser: 'Cruiser',
  pontoon: 'Pontoon',
};

export function priceView(boat: PublicBoat): { amount: number; unit: 'hour' | 'day' } | null {
  if (boat.pricePerDay != null) return { amount: boat.pricePerDay, unit: 'day' };
  if (boat.pricePerHour != null) return { amount: boat.pricePerHour, unit: 'hour' };
  return null;
}

// Every rate the owner set, in display order (hourly then daily). Used to show
// hourly and/or daily pricing depending on what the boat offers.
export function priceLabels(boat: Pick<PublicBoat, 'pricePerHour' | 'pricePerDay'>): { amount: number; unit: 'hour' | 'day'; short: string }[] {
  const out: { amount: number; unit: 'hour' | 'day'; short: string }[] = [];
  if (boat.pricePerHour != null) out.push({ amount: boat.pricePerHour, unit: 'hour', short: 'hr' });
  if (boat.pricePerDay != null) out.push({ amount: boat.pricePerDay, unit: 'day', short: 'day' });
  return out;
}

export default function BoatCard({ boat }: { boat: PublicBoat }) {
  const { data } = useAsync(() => imagesSvc.listBoatImages(boat.id), [boat.id]);
  const sorted = [...(data ?? [])].sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary));
  const images = sorted.length
    ? sorted.map((i) => imagesSvc.publicImageUrl(i.storagePath))
    : [`illustration:${boat.boatType}`];
  const rates = priceLabels(boat);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 32 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.25 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
    >
      <MotionLink
        to={`/boats/${boat.id}`}
        whileHover={{ y: -6 }}
        transition={{ type: 'spring', stiffness: 300, damping: 22 }}
        className="group block overflow-hidden rounded-2xl bg-white border border-lake-100 shadow-sm hover:shadow-lg transition-shadow"
      >
        <div className="relative h-44 overflow-hidden">
          <AutoCarousel images={images} alt={boat.name} className="h-full w-full" showDots />
          <div className="absolute top-2 left-2 flex gap-1.5 z-10">
            {boat.operatorVerified && (
              <span className="inline-flex items-center gap-1 rounded-full bg-white/95 px-2 py-1 text-[11px] font-semibold text-lake-700 shadow">
                <ShieldCheck size={12} className="text-lake-600" /> Verified operator
              </span>
            )}
          </div>
          {rates.length > 0 && (
            <div className="absolute bottom-2 right-2 z-10 flex gap-1.5">
              {rates.map((r) => (
                <span key={r.unit} className="rounded-full bg-black/60 px-2.5 py-1 text-xs font-semibold text-white">
                  ${r.amount}<span className="opacity-75">/{r.short}</span>
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="p-4">
          <h3 className="font-semibold text-lake-950 leading-snug">{boat.name}</h3>
          <p className="mt-0.5 text-xs text-lake-500">{boat.location}</p>

          <div className="mt-2 flex flex-wrap gap-1.5">
            <span className="rounded-full bg-lake-50 px-2 py-0.5 text-[11px] text-lake-600 border border-lake-100">
              {BOAT_TYPE_LABELS[boat.boatType]}
            </span>
          </div>

          <div className="mt-3 flex items-center justify-between text-xs text-lake-500">
            <span className="inline-flex items-center gap-1">
              Trust {boat.operatorTrustScore}
            </span>
            <span className="inline-flex items-center gap-1">
              <Users size={12} /> {boat.capacity}
            </span>
          </div>
        </div>
      </MotionLink>
    </motion.div>
  );
}
