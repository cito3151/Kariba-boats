import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Users, ShieldCheck, Zap } from 'lucide-react';
import type { Boat } from '../data/types';
import StarRating from './StarRating';
import AutoCarousel from './AutoCarousel';
import { experienceLabels } from '../data/mockData';

const MotionLink = motion.create(Link);

export default function BoatCard({ boat }: { boat: Boat }) {
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
          <AutoCarousel
            images={boat.images}
            alt={boat.name}
            className="h-full w-full"
            intervalMs={3200 + boat.id.length * 137}
            showDots
          />
          <div className="absolute top-2 left-2 flex gap-1.5 z-10">
            {boat.verified && (
              <span className="inline-flex items-center gap-1 rounded-full bg-white/95 px-2 py-1 text-[11px] font-semibold text-lake-700 shadow">
                <ShieldCheck size={12} className="text-lake-600" /> Verified
              </span>
            )}
            {boat.availableToday && (
              <span className="inline-flex items-center gap-1 rounded-full bg-sunset-500 px-2 py-1 text-[11px] font-semibold text-white shadow">
                <Zap size={12} /> Available today
              </span>
            )}
          </div>
          <div className="absolute bottom-2 right-2 z-10 rounded-full bg-black/60 px-2.5 py-1 text-xs font-semibold text-white">
            ${boat.priceAmount}
            <span className="opacity-75">/{boat.priceUnit}</span>
          </div>
        </div>

        <div className="p-4">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-semibold text-lake-950 leading-snug">{boat.name}</h3>
          </div>
          <p className="mt-0.5 text-xs text-lake-500">{boat.location}</p>

          <div className="mt-2 flex flex-wrap gap-1.5">
            {boat.experiences.slice(0, 2).map((e) => (
              <span key={e} className="rounded-full bg-lake-50 px-2 py-0.5 text-[11px] text-lake-600 border border-lake-100">
                {experienceLabels[e]}
              </span>
            ))}
          </div>

          <div className="mt-3 flex items-center justify-between">
            <StarRating rating={boat.rating} size={12} />
            <span className="inline-flex items-center gap-1 text-xs text-lake-500">
              <Users size={12} /> {boat.capacity}
            </span>
          </div>
        </div>
      </MotionLink>
    </motion.div>
  );
}
