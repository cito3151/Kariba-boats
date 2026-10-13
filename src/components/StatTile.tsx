import { motion, useReducedMotion } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';

// A figure tile for the portal dashboards, in the portal card grammar (thin border,
// 8px radius, one soft shadow). Clickable tiles act as filters: the active one gets
// a navy border and the orange bar the site header and portal tabs use for "here".
export default function StatTile({
  label, value, icon: Icon, active, onClick, index = 0,
}: {
  label: string;
  /** Omit for a tile that opens a view rather than counting something. */
  value?: number;
  icon?: LucideIcon;
  active?: boolean;
  onClick?: () => void;
  index?: number;
}) {
  const reduce = useReducedMotion();
  const clickable = Boolean(onClick);

  const base =
    'group relative min-w-0 overflow-hidden rounded-lg border bg-white p-4 text-left shadow-[0_1px_2px_rgb(13_37_50/0.06)] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-lake-500 focus-visible:ring-offset-2';
  const state = !clickable
    ? 'border-lake-100'
    : active
      ? 'w-full cursor-pointer border-lake-950'
      : 'w-full cursor-pointer border-lake-100 hover:border-lake-300';

  const chip = active
    ? 'bg-lake-950 text-white'
    : 'bg-lake-50 text-lake-700 group-hover:bg-lake-100';

  const inner = (
    <>
      {Icon && (
        <span className={`inline-flex h-9 w-9 items-center justify-center rounded-md transition-colors ${chip}`}>
          <Icon size={18} />
        </span>
      )}
      {/* A made-up 0 on a tile that counts nothing reads as "empty". Without a
          figure the tile says it opens a view, at the same height as a number. */}
      {value === undefined ? (
        <p className="mt-3 flex h-8 items-end text-[15px] font-semibold text-lake-700">
          View <span aria-hidden className="ml-1 transition-transform group-hover:translate-x-0.5">→</span>
        </p>
      ) : (
        <p className="mt-3 text-[2rem] font-bold leading-none tracking-[-0.02em] tabular-nums text-lake-950">{value}</p>
      )}
      <p className="mt-2 break-words text-sm font-semibold leading-snug text-lake-700">{label}</p>
      {active && (
        <motion.span
          layoutId={reduce ? undefined : 'stat-tile-accent'}
          transition={{ type: 'spring', bounce: 0, duration: 0.35 }}
          className="absolute inset-x-0 bottom-0 h-[3px] bg-sunset-500"
        />
      )}
    </>
  );

  const entrance = reduce
    ? {}
    : {
        initial: { opacity: 0, y: 12 },
        animate: { opacity: 1, y: 0 },
        transition: { type: 'spring' as const, bounce: 0, duration: 0.4, delay: index * 0.05 },
      };

  if (!clickable) {
    return <motion.div {...entrance} className={`${base} ${state}`}>{inner}</motion.div>;
  }
  return (
    <motion.button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      // Its own transition, or the press would inherit the staggered entrance delay.
      whileTap={reduce ? undefined : { scale: 0.98, transition: { type: 'spring', bounce: 0, duration: 0.15 } }}
      {...entrance}
      className={`${base} ${state}`}
    >
      {inner}
    </motion.button>
  );
}
