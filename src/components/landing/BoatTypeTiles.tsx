import { useLayoutEffect, useRef } from 'react';
import { useReducedMotion } from 'framer-motion';
import Reveal from '../Reveal';
import { BOAT_TYPE_LABELS } from '../BoatCard';
import { photos } from '../../data/photos';
import type { BoatKind } from '../../services/boats.service';
import { scrollToBoats } from './scrollToBoats';

const TYPES: BoatKind[] = ['houseboat', 'speedboat', 'fishing', 'cruiser', 'pontoon'];

/**
 * What sits behind each label. Every tile is a photograph under the same navy
 * gradient: flat illustrations beside photographs made the row look half
 * finished. Only fishing has a photo of the boat itself (a kapenta rig); the rest
 * carry Kariba scenery, so the label names a category and does not caption the
 * picture. None of these carry the burned-in camera date stamp, and none repeat
 * the hero photograph.
 */
const TILE_IMAGE: Record<BoatKind, string> = {
  houseboat: photos.wildlife1,
  speedboat: photos.sunset3,
  fishing: photos.kapentaRig,
  cruiser: photos.sunset1,
  pontoon: photos.sunset2,
};

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
        <p className="mt-1 text-sm text-lake-600">Choose a type to see the boats listed under it.</p>
      </Reveal>

      <Reveal delay={0.05} className="mt-6">
        {/* A snap row on phones, where the tiles bleed to the screen edge so the
            next one is visibly there to swipe to. From md up it is a plain grid. */}
        <div
          ref={rowRef}
          className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 py-1 scroll-pl-4 sm:-mx-6 sm:px-6 sm:scroll-pl-6
                     md:mx-0 md:grid md:grid-cols-5 md:gap-4 md:overflow-visible md:px-0 md:py-0"
        >
          {ordered.map((type) => {
            const isSelected = selected === type;
            const count = counts?.[type];
            // An empty type stays clickable (it lands on the empty state with its
            // "Clear filters" action) but reads as unavailable, not as a promise.
            const isEmpty = count === 0;
            return (
              <button
                key={type}
                type="button"
                aria-pressed={isSelected}
                onClick={() => {
                  onSelect(type);
                  scrollToBoats(reduceMotion);
                }}
                className="group relative aspect-[4/5] w-[62%] shrink-0 snap-start overflow-hidden rounded-md bg-lake-950 text-left text-white
                           outline-none transition-transform duration-150 active:scale-[0.98]
                           focus-visible:ring-2 focus-visible:ring-sunset-500 focus-visible:ring-offset-2
                           sm:w-[38%] md:w-auto"
              >
                <span
                  aria-hidden
                  className="absolute inset-0 transition-transform duration-500 ease-out group-hover:scale-105 motion-reduce:transition-none motion-reduce:group-hover:scale-100"
                >
                  <img
                    src={TILE_IMAGE[type]}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className={`h-full w-full object-cover transition-[filter,opacity] duration-200 ${
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
            );
          })}
        </div>
      </Reveal>
    </section>
  );
}
