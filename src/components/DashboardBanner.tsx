import { motion } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';

export default function DashboardBanner({
  image,
  eyebrow,
  title,
  icon: Icon,
}: {
  image: string;
  eyebrow: string;
  title: string;
  icon: LucideIcon;
}) {
  return (
    <div className="relative h-40 sm:h-52 overflow-hidden rounded-2xl">
      <motion.img
        src={image}
        alt=""
        initial={{ opacity: 0, scale: 1.15 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
        className="absolute inset-0 h-full w-full object-cover"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-lake-950/85 via-lake-950/30 to-transparent" />
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="absolute bottom-0 left-0 p-4 sm:p-6 text-white"
      >
        <p className="text-xs font-semibold uppercase tracking-[0.15em] text-sunset-300 flex items-center gap-1.5">
          <Icon size={14} /> {eyebrow}
        </p>
        <h1 className="mt-1 font-display text-2xl sm:text-4xl font-medium">{title}</h1>
      </motion.div>
    </div>
  );
}
