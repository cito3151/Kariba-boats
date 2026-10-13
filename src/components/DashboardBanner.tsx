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
    <div className="relative flex min-h-40 items-end sm:min-h-52 overflow-hidden rounded-2xl">
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
        className="relative min-w-0 p-4 pt-16 sm:p-6 sm:pt-20 text-white"
      >
        <p className="flex items-center gap-1.5 text-[13px] font-semibold uppercase tracking-[0.06em] text-sunset-300">
          <Icon size={15} /> {eyebrow}
        </p>
        <h1 className="mt-1.5 break-words font-display text-[1.75rem] font-bold leading-tight tracking-[-0.02em] sm:text-[2rem]">{title}</h1>
      </motion.div>
    </div>
  );
}
