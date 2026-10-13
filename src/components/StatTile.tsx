import { useLayoutEffect, useRef } from 'react';
import { animate, motion, useReducedMotion } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';
import { REVEAL_STAGGER, REVEAL_TRAVEL, revealSpring } from './motion';

/**
 * A figure that counts up from 0 to its value when it first appears, and from
 * the old figure to the new one when it changes (a reload after an approval).
 * StatTile mounts it only once the real value is known, so the count starts the
 * moment the data arrives, never from a placeholder 0. The digits are written straight into the DOM from a
 * motion value, so counting never re-renders React. Screen readers get the
 * real value at once from the visually hidden copy; the counting digits are
 * hidden from them. Under reduced motion the final figure is simply drawn.
 */
function CountUp({ value }: { value: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduce = useReducedMotion();
  // The figure currently on screen, so a change counts on from where it is.
  const shown = useRef(0);

  // Before paint, so the final figure never flashes ahead of the count.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const write = (n: number) => {
      shown.current = n;
      el.textContent = String(n);
    };
    if (reduce || shown.current === value) {
      write(value);
      return;
    }
    write(shown.current);
    const controls = animate(shown.current, value, {
      duration: 0.8,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => write(Math.round(v)),
    });
    // Interrupted (a new value, or unmounting): stop where it is; the next run
    // counts on from that figure.
    return () => controls.stop();
  }, [value, reduce]);

  return (
    <>
      <span ref={ref} aria-hidden />
      <span className="sr-only">{value}</span>
    </>
  );
}

// A figure tile for the portal dashboards, in the portal card grammar (thin border,
// 8px radius, one soft shadow). Clickable tiles act as filters: the active one gets
// a navy border and the orange bar the site header and portal tabs use for "here".
export default function StatTile({
  label, value, icon: Icon, active, onClick, index = 0,
}: {
  label: string;
  /**
   * Omit for a tile that opens a view rather than counting something. Null while
   * the figure is still loading: the tile holds its place with a quiet bar, and
   * the count runs from 0 when the real value arrives.
   */
  value?: number | null;
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
      ) : value === null ? (
        <p className="mt-3 flex h-8 items-center">
          <span aria-hidden className="block h-6 w-12 rounded-md bg-lake-100 motion-safe:animate-pulse" />
          <span className="sr-only">Loading</span>
        </p>
      ) : (
        <p className="mt-3 text-[2rem] font-bold leading-none tracking-[-0.02em] tabular-nums text-lake-950">
          <CountUp value={value} />
        </p>
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

  // The tiles sit at the top of every dashboard, so they rise on mount rather
  // than waiting for the observer, in a wave across the row.
  const entrance = reduce
    ? {}
    : {
        initial: { opacity: 0, y: REVEAL_TRAVEL },
        animate: { opacity: 1, y: 0 },
        transition: { ...revealSpring, delay: 0.1 + Math.min(index, 6) * REVEAL_STAGGER },
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
