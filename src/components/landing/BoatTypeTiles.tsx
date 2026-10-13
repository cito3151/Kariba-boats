import { useLayoutEffect, useRef } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import Reveal from '../Reveal';
import { staggerContainer, staggerItem } from '../motion';
import { BOAT_TYPE_LABELS } from '../BoatCard';
import { photos, type Photo } from '../../data/photos';
import type { BoatKind } from '../../services/boats.service';
import { scrollToBoats } from './scrollToBoats';

const TYPES: BoatKind[] = ['houseboat', 'speedboat', 'fishing', 'cruiser', 'pontoon'];

/**
 * What sits behind each label: a photograph of that type of boat, under the same
 * navy gradient on every tile. Each was cropped by its `position` so the boat
 * sits above the label at both the phone and the desktop tile size, and none
 * repeats the hero photograph. Measured under the gradient, the label is 6.7:1
 * or better on every tile.
 */
const TILE_IMAGE: Record<BoatKind, Photo> = {
  houseboat: photos.houseboat,
  speedboat: photos.speedboat,
  fishing: photos.fishing,
  cruiser: photos.cruiser,
  pontoon: photos.pontoon,
};

// Tile widths: 62% of a phone screen, 38% from sm, then one of five columns in
// the 1152px content column from md (230px at most).
const TILE_SIZES = '(min-width: 1152px) 230px, (min-width: 768px) 20vw, (min-width: 640px) 38vw, 62vw';

function countLabel(count: number) {
  if (count === 0) return 'None listed yet';
  return `${count} ${count === 1 ? 'boat' : 'boats'} listed`;
}

export default function BoatTypeTiles({
  counts,
  selected,
  onSelect,
}: {
  /** Listed boats per type, or null while the listings are loading or failed. */
  counts: Record<BoatKind, number> | null;
  selected: BoatKind | 'all';
  onSelect: (type: BoatKind) => void;
}) {
  const reduceMotion = useReducedMotion();

  // Types with boats listed lead, most first. With a small fleet, three of five
  // types can be empty, and leading with them advertised an empty marketplace.
  // Array sort is stable, so equal counts keep the TYPES order. Until the counts
  // arrive the order is left alone, so tiles do not jump once data lands.
  const ordered = counts
    ? [...TYPES].sort((a, b) => (counts[b] > 0 ? 1 : 0) - (counts[a] > 0 ? 1 : 0) || counts[b] - counts[a])
    : TYPES;

  // Scroll snap re-snaps to the same element after a layout change. Before the
  // counts arrive, houseboat is first and becomes the snap target; once the tiles
  // reorder it is third, and the browser scrolled the row sideways to keep it in
  // place, hiding the types that actually have boats. Return to the start instead.
  const rowRef = useRef<HTMLDivElement>(null);
  const orderKey = ordered.join(",");
  useLayoutEffect(() => {
    if (rowRef.current) rowRef.current.scrollLeft = 0;
  }, [orderKey]);

  return (
    <section className="mx-auto max-w-6xl px-4 pt-14 pb-2 sm:px-6" aria-labelledby="boat-types-heading">
      <Reveal>
        <h2
          id="boat-types-heading"
          className="text-2xl font-extrabold uppercase tracking-[0.04em] text-lake-950"
        >
          Explore by boat type
        </h2>
        <p className="mt-1 text-sm text-lake-700">Choose a type to see the boats listed under it.</p>
      </Reveal>

      {/* A snap row on phones, where the tiles bleed to the screen edge so the
          next one is visibly there to swipe to. From md up it is a plain grid.
          The row, not each tile, decides when they arrive: on a phone most tiles
          sit off to the side, where they would never count as in view, so all
          five rise in a wave as soon as the row reaches the screen. The rise
          would make the row scroll up and down for a moment, hence
          overflow-y-hidden, which leaves the sideways scroll and the snap alone. */}
      <motion.div
        ref={rowRef}
        variants={staggerContainer}
        initial={reduceMotion ? false : 'hidden'}
        whileInView="show"
        viewport={{ once: true, amount: 0.2 }}
        className="-mx-4 mt-6 flex snap-x snap-mandatory gap-3 overflow-x-auto overflow-y-hidden px-4 py-1 scroll-pl-4 sm:-mx-6 sm:px-6 sm:scroll-pl-6
                   md:mx-0 md:grid md:grid-cols-5 md:gap-4 md:overflow-visible md:px-0 md:py-0"
      >
        {ordered.map((type) => {
          const isSelected = selected === type;
          const count = counts?.[type];
          // An empty type stays clickable (it lands on the empty state with its
          // "Clear filters" action) but reads as unavailable, not as a promise.
          const isEmpty = count === 0;
          return (
            // The entrance moves this wrapper; the hover lift and press moves
            // are CSS on the button inside, so the two never fight over one
            // element's transform.
            <motion.div key={type} variants={staggerItem} className="w-[62%] shrink-0 snap-start sm:w-[38%] md:w-auto">
              {/* Lifts 4px on hover from md, where the row no longer clips it;
                  `hover:` only applies on devices that can hover, so a tap on a
                  phone never leaves a tile raised. */}
              <button
                type="button"
                aria-pressed={isSelected}
                onClick={() => {
                  onSelect(type);
                  scrollToBoats(reduceMotion);
                }}
                className="group relative block aspect-[4/5] w-full overflow-hidden rounded-md bg-lake-950 text-left text-white
                           outline-none transition-transform duration-200 ease-out active:scale-[0.98]
                           focus-visible:ring-2 focus-visible:ring-sunset-500 focus-visible:ring-offset-2
                           md:hover:-translate-y-1 motion-reduce:md:hover:translate-y-0"
              >
                <span
                  aria-hidden
                  className="absolute inset-0 transition-transform duration-500 ease-out group-hover:scale-105 motion-reduce:transition-none motion-reduce:group-hover:scale-100"
                >
                  <img
                    src={TILE_IMAGE[type].src}
                    srcSet={TILE_IMAGE[type].srcSet}
                    sizes={TILE_SIZES}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className={`h-full w-full object-cover transition-[filter,opacity] duration-200 ${TILE_IMAGE[type].position} ${
                      isEmpty ? 'opacity-60 grayscale' : ''
                    }`}
                  />

                </span>
                <span
                  aria-hidden
                  className="absolute inset-0 bg-gradient-to-t from-lake-950/95 via-lake-950/50 to-lake-950/15
                             transition-colors duration-200"
                />
                <span className="absolute inset-x-0 bottom-0 block p-4 pb-5">
                  <span className="block text-lg font-extrabold uppercase leading-tight tracking-[0.04em] sm:text-[19px]">
                    {BOAT_TYPE_LABELS[type]}
                  </span>
                  <span className="mt-1 block min-h-5 text-sm leading-5 text-white/90 tabular-nums">
                    {count === undefined ? '' : countLabel(count)}
                  </span>
                </span>
                {isSelected && (
                  <span aria-hidden className="absolute inset-x-0 bottom-0 h-1 bg-sunset-500" />
                )}
              </button>
            </motion.div>
          );
        })}
      </motion.div>
    </section>
  );
}
