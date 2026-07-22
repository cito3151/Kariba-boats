import { motion, useReducedMotion } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';

export default function StatTile({
  label, value, icon: Icon, active, onClick, index = 0,
}: {
  label: string;
  value: number;
  icon?: LucideIcon;
  active?: boolean;
  onClick?: () => void;
  index?: number;
}) {
  const reduce = useReducedMotion();
  const clickable = Boolean(onClick);

  const base =
    'group relative min-w-0 overflow-hidden rounded-2xl border p-4 text-left shadow-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-lake-500 focus-visible:ring-offset-2';
  const state = !clickable
    ? 'border-lake-100 bg-white'
    : active
      ? 'w-full cursor-pointer border-lake-500 bg-gradient-to-br from-lake-50 to-white'
      : 'w-full cursor-pointer border-lake-100 bg-white hover:border-lake-300 hover:shadow-md';

  const chip = active
    ? 'bg-lake-600 text-white'
    : 'bg-lake-50 text-lake-600 group-hover:bg-lake-100';

  const inner = (
    <>
      {Icon && (
        <span className={`inline-flex h-9 w-9 items-center justify-center rounded-xl transition-colors ${chip}`}>
          <Icon size={18} />
        </span>
      )}
      <p className="mt-3 text-3xl font-bold leading-none tabular-nums text-lake-950">{value}</p>
      <p className="mt-1.5 truncate text-xs font-medium text-lake-500">{label}</p>
      {active && (
        <motion.span
          layoutId="stat-tile-accent"
          className="absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-lake-500 to-sunset-400"
        />
      )}
    </>
  );

  const entrance = reduce
    ? {}
    : {
        initial: { opacity: 0, y: 12, scale: 0.96 },
        animate: { opacity: 1, y: 0, scale: 1 },
        transition: { duration: 0.35, delay: index * 0.05, ease: [0.22, 1, 0.36, 1] as const },
      };

  if (!clickable) {
    return <motion.div {...entrance} className={`${base} ${state}`}>{inner}</motion.div>;
  }
  return (
    <motion.button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      whileHover={reduce ? undefined : { y: -3 }}
      whileTap={reduce ? undefined : { scale: 0.98 }}
      {...entrance}
      className={`${base} ${state}`}
    >
      {inner}
    </motion.button>
  );
}
