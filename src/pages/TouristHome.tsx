import { useMemo, useRef, useState } from 'react';
import { motion, useReducedMotion, useScroll, useTransform } from 'framer-motion';
import { Search, Users, ArrowDownUp, Anchor } from 'lucide-react';
import PageTransition from '../components/PageTransition';
import BoatCard, { BOAT_TYPE_LABELS, priceView } from '../components/BoatCard';
import BoatCardSkeleton from '../components/BoatCardSkeleton';
import Reveal from '../components/Reveal';
import { ErrorState } from '../components/StateViews';
import { useAsync } from '../hooks/useAsync';
import { heroImage } from '../data/photos';
import * as boats from '../services/boats.service';
import * as imagesSvc from '../services/images.service';
import type { BoatKind } from '../services/boats.service';

const TYPE_OPTIONS: (BoatKind | 'all')[] = ['all', 'houseboat', 'speedboat', 'fishing', 'cruiser', 'pontoon'];

export default function TouristHome() {
  const { data, loading, error, reload } = useAsync(() => boats.listPublicBoats(), []);
  const idsKey = (data ?? []).map((b) => b.id).join(',');
  const { data: imagesByBoat } = useAsync(
    () => imagesSvc.listImagesForBoats(idsKey ? idsKey.split(',') : []),
    [idsKey],
  );
  const [groupSize, setGroupSize] = useState(2);
  const [boatType, setBoatType] = useState<BoatKind | 'all'>('all');
  const [maxPrice, setMaxPrice] = useState(700);
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [sort, setSort] = useState<'recommended' | 'price_low' | 'capacity'>('recommended');

  const resetFilters = () => {
    setBoatType('all'); setGroupSize(1); setMaxPrice(700); setVerifiedOnly(false);
  };

  const heroRef = useRef<HTMLElement>(null);
  const reduceMotion = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ['start start', 'end start'] });

  // A full-bleed image that drifts and scales under the page is the textbook
  // vestibular trigger. Under prefers-reduced-motion the photograph is simply a
  // photograph: it still dims on scroll, because that is an opacity change which
  // aids comprehension rather than implying movement.
  const heroY = useTransform(scrollYProgress, [0, 1], ['0%', reduceMotion ? '0%' : '30%']);
  const heroScale = useTransform(scrollYProgress, [0, 1], reduceMotion ? [1, 1] : [1.08, 1.25]);
  const heroOpacity = useTransform(scrollYProgress, [0, 1], [1, reduceMotion ? 0.7 : 0.4]);

  /**
   * Hero entry: a short rise that settles without overshoot. Nothing here was
   * thrown by the user, so bounce would be motion for its own sake; `bounce: 0`
   * is the critically damped default. Under reduced motion the travel is dropped
   * and only the cross-fade remains.
   */
  const rise = (delay: number) => ({
    initial: reduceMotion ? { opacity: 0 } : { opacity: 0, y: 16 },
    animate: { opacity: 1, y: 0 },
    transition: reduceMotion
      ? { duration: 0.2, delay: delay / 2 }
      : ({ type: 'spring', bounce: 0, duration: 0.5, delay } as const),
  });

  const filtered = useMemo(() => {
    return (data ?? []).filter((b) => {
      if (boatType !== 'all' && b.boatType !== boatType) return false;
      if (b.capacity < Math.max(groupSize, 1)) return false;
      const price = priceView(b);
      if (price && price.amount > maxPrice) return false;
      if (verifiedOnly && !b.operatorVerified) return false;
      return true;
    });
  }, [data, groupSize, boatType, maxPrice, verifiedOnly]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    if (sort === 'price_low') {
      arr.sort((a, b) => (priceView(a)?.amount ?? Infinity) - (priceView(b)?.amount ?? Infinity));
    } else if (sort === 'capacity') {
      arr.sort((a, b) => b.capacity - a.capacity);
    } else {
      arr.sort((a, b) => b.operatorTrustScore - a.operatorTrustScore);
    }
    return arr;
  }, [filtered, sort]);

  return (
    <PageTransition>
      <section ref={heroRef} className="relative overflow-hidden text-white min-h-[600px] sm:min-h-[680px] lg:min-h-[min(84svh,780px)]">
        <motion.img
          src={heroImage}
          alt="A kapenta fishing boat out on Lake Kariba, with the hills of the far shore behind"
          style={{ y: heroY, scale: heroScale, opacity: heroOpacity }}
          className="absolute inset-0 h-full w-full object-cover object-[36%_32%] sm:object-[center_32%] 2xl:object-[center_56%]"
        />
        {/* The headline is centred over the sky, so the scrim runs top-down: dense
            enough behind the type to carry white text, clear by the waterline so the
            boat stays the subject of the photograph. */}
        <div className="absolute inset-0 bg-gradient-to-b from-lake-950/70 via-lake-950/35 to-lake-950/10" />

        <div className="relative mx-auto max-w-6xl px-4 sm:px-6 pt-20 sm:pt-24 lg:pt-28 text-center">
          {/* Set the way boat and cruise booking sites set theirs: one bold sans,
              a few plain words, and no eyebrow or qualifier stacked on top. The old
              headline ("Find and book a real, verified boat on Kariba, today.") was
              nine words and two commas spent reassuring rather than saying what the
              site is. */}
          <motion.h1
            {...rise(0.08)}
            className="mx-auto max-w-3xl font-bold text-white text-balance
                       text-[clamp(2.25rem,5vw,4rem)] leading-[1.04] tracking-[-0.025em]"
          >
            Book a boat on Lake Kariba
          </motion.h1>
          <motion.p
            {...rise(0.18)}
            className="mx-auto mt-4 max-w-xl text-lg sm:text-xl text-pretty text-white/90"
          >
            Houseboats, fishing trips and sunset cruises from verified local operators.
          </motion.p>
        </div>
      </section>

      {/* The booking bar overlaps the foot of the photograph, the way the search
          sits on every boat and cruise booking site: it belongs to the hero, but
          it is the first thing on the page you actually use. */}
      <div className="relative z-10 mx-auto -mt-24 max-w-6xl px-4 sm:-mt-28 sm:px-6">
        <motion.div
          {...rise(0.28)}
          className="rounded-lg bg-white p-2 text-lake-950 shadow-[0_20px_50px_-18px_rgba(13,37,50,0.45)]"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[1.2fr_0.8fr_1.2fr_auto_auto] lg:items-stretch">
            <label className="block rounded-md px-4 py-3 hover:bg-lake-50 focus-within:bg-lake-50">
              <span className="block text-[11px] font-bold uppercase tracking-[0.08em] text-lake-500">Boat type</span>
              <select
                value={boatType}
                onChange={(e) => setBoatType(e.target.value as BoatKind | 'all')}
                className="mt-1 w-full bg-transparent text-[15px] font-semibold text-lake-950 outline-none"
              >
                <option value="all">Any boat</option>
                {TYPE_OPTIONS.slice(1).map((t) => (
                  <option key={t} value={t}>{BOAT_TYPE_LABELS[t as BoatKind]}</option>
                ))}
              </select>
            </label>
            <label className="block rounded-md px-4 py-3 hover:bg-lake-50 focus-within:bg-lake-50 lg:border-l lg:border-lake-100">
              <span className="block text-[11px] font-bold uppercase tracking-[0.08em] text-lake-500">Guests</span>
              <span className="mt-1 flex items-center gap-2">
                <Users size={15} className="text-lake-400" aria-hidden />
                <input
                  type="number" min={1} max={200} value={groupSize}
                  onChange={(e) => setGroupSize(Number(e.target.value) || 1)}
                  className="w-full bg-transparent text-[15px] font-semibold tabular-nums text-lake-950 outline-none"
                />
              </span>
            </label>
            <label className="block rounded-md px-4 py-3 hover:bg-lake-50 focus-within:bg-lake-50 lg:border-l lg:border-lake-100">
              <span className="flex items-baseline justify-between text-[11px] font-bold uppercase tracking-[0.08em] text-lake-500">
                Max price
                <span className="text-[13px] font-semibold normal-case tracking-normal tabular-nums text-lake-950">
                  ${maxPrice}
                </span>
              </span>
              <input
                type="range" min={20} max={700} step={10} value={maxPrice}
                onChange={(e) => setMaxPrice(Number(e.target.value))}
                className="mt-2.5 w-full accent-sunset-500"
              />
            </label>
            <label className="flex cursor-pointer select-none items-center gap-2 rounded-md px-4 py-3 text-[15px] font-semibold text-lake-950 hover:bg-lake-50 focus-within:bg-lake-50 lg:border-l lg:border-lake-100">
              <input
                type="checkbox" checked={verifiedOnly}
                onChange={(e) => setVerifiedOnly(e.target.checked)}
                className="h-4 w-4 accent-sunset-500"
              />
              Verified only
            </label>
            {/* The filters already apply as you change them, so this does not
                submit anything. It takes you to the results, which is what a
                search button on a booking bar is for, and its label says how many
                boats are waiting there. */}
            <button
              type="button"
              onClick={() => document.getElementById('boats')?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' })}
              className="m-1 inline-flex items-center justify-center gap-2 rounded-md bg-sunset-500 px-6 py-3.5 text-[15px] font-bold text-white
                         transition-[background-color,transform] duration-150 hover:bg-sunset-600 active:scale-[0.98]
                         outline-none focus-visible:ring-2 focus-visible:ring-sunset-500 focus-visible:ring-offset-2 sm:col-span-2 lg:col-span-1"
            >
              <Search size={17} aria-hidden />
              {/* Zero gets its own words: "Show 0 boats" offers something that is
                  not there. It still scrolls down, to the empty state and its
                  "Clear filters" button. */}
              {filtered.length === 0
                ? 'No matching boats'
                : `Show ${filtered.length} boat${filtered.length === 1 ? '' : 's'}`}
            </button>
          </div>
        </motion.div>
      </div>

      {/* Value propositions, set as type rather than an icon row: a short bold
          claim and one line backing it, which is how the booking sites present
          theirs. */}
      <section className="mx-auto max-w-6xl px-4 pt-14 pb-2 sm:px-6">
        <dl className="grid grid-cols-1 gap-x-10 gap-y-6 sm:grid-cols-3">
          <div className="border-t-2 border-lake-950 pt-4">
            {/* Worded to what the platform actually enforces: every listing goes
                through the admin approval queue, while the verified badge is a
                separate, per-company check. It does not claim every operator's
                documents were reviewed, because grandfathered operators exist. */}
            <dt className="text-[15px] font-bold text-lake-950">Every listing reviewed</dt>
            <dd className="mt-1 text-sm leading-relaxed text-lake-600">
              Our team approves each boat before it goes live. Look for the verified badge on checked operators.
            </dd>
          </div>
          <div className="border-t-2 border-lake-950 pt-4">
            <dt className="text-[15px] font-bold text-lake-950">The price up front</dt>
            <dd className="mt-1 text-sm leading-relaxed text-lake-600">
              See the full rate before you ask. A deposit confirms the booking, the rest is paid on the day.
            </dd>
          </div>
          <div className="border-t-2 border-lake-950 pt-4">
            <dt className="text-[15px] font-bold text-lake-950">Reviews from real trips</dt>
            <dd className="mt-1 text-sm leading-relaxed text-lake-600">
              Only guests whose trip was completed can leave a review.
            </dd>
          </div>
        </dl>
      </section>

      {/* scroll-mt clears the sticky header, so "Show boats" lands on the heading
          rather than tucking it underneath the nav. */}
      <section id="boats" className="mx-auto max-w-6xl scroll-mt-20 px-4 sm:px-6 pt-14 pb-16">
        <Reveal>
          <div className="mb-6 flex flex-col gap-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              {/* Section titles set as MSC sets theirs: short, bold, upper case,
                  with positive tracking because capitals read cramped at the
                  default spacing. The count stays, smaller, because it is the
                  answer to the filters above. */}
              <div>
                <h2 className="text-2xl font-extrabold uppercase tracking-[0.04em] text-lake-950">
                  Available boats
                </h2>
                <p className="mt-1 text-sm text-lake-600">
                  <span className="font-semibold tabular-nums text-lake-950">{filtered.length}</span>{' '}
                  boat{filtered.length !== 1 ? 's' : ''} match your search
                </p>
              </div>
              <label className="flex items-center gap-2 text-sm text-lake-600">
                <ArrowDownUp size={14} className="text-lake-400" />
                <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}
                  className="rounded-lg border border-lake-100 bg-lake-50 px-3 py-1.5 text-sm outline-none focus:border-lake-400">
                  <option value="recommended">Recommended</option>
                  <option value="price_low">Price: low to high</option>
                  <option value="capacity">Largest first</option>
                </select>
              </label>
            </div>
            <div className="flex flex-wrap gap-2">
              {TYPE_OPTIONS.map((t) => (
                <button key={t} type="button" onClick={() => setBoatType(t)}
                  aria-pressed={boatType === t}
                  /* Feedback on the press itself, not only on the settled state, and
                     a focus ring so the filter row is usable from the keyboard. */
                  className={`rounded-full px-3.5 py-1.5 text-xs font-semibold outline-none
                    transition-[color,background-color,border-color,transform] duration-200
                    active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-lake-500 focus-visible:ring-offset-2 ${
                    boatType === t
                      ? 'bg-lake-700 text-white'
                      : 'border border-lake-100 bg-white text-lake-600 hover:border-lake-300'
                  }`}>
                  {t === 'all' ? 'All boats' : BOAT_TYPE_LABELS[t as BoatKind]}
                </button>
              ))}
            </div>
          </div>
        </Reveal>

        {loading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5" role="status" aria-busy="true">
            <span className="sr-only">Finding boats on Kariba</span>
            {Array.from({ length: 6 }, (_, i) => <BoatCardSkeleton key={i} />)}
          </div>
        )}
        {error && <ErrorState message={error} onRetry={reload} />}
        {!loading && !error && (data ?? []).length === 0 && (
          <div className="rounded-xl border border-dashed border-lake-200 py-16 text-center text-lake-500">
            No boats are listed yet. Check back soon.
          </div>
        )}
        {!loading && !error && (data ?? []).length > 0 && sorted.length === 0 && (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-lake-200 py-16 text-center text-lake-500">
            <Anchor size={22} className="text-lake-300" />
            <p>No boats match those filters.</p>
            <button onClick={resetFilters}
              className="rounded-lg bg-lake-700 px-4 py-2 text-xs font-semibold text-white hover:bg-lake-800">
              Clear filters
            </button>
          </div>
        )}
        {sorted.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {sorted.map((boat) => (
              <BoatCard key={boat.id} boat={boat} images={imagesByBoat?.[boat.id] ?? []} />
            ))}
          </div>
        )}
      </section>
    </PageTransition>
  );
}
