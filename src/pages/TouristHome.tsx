import { useMemo, useRef, useState } from 'react';
import { motion, useReducedMotion, useScroll, useTransform } from 'framer-motion';
import { Search, Users, ArrowDownUp, Anchor } from 'lucide-react';
import PageTransition from '../components/PageTransition';
import BoatCard, { BOAT_TYPE_LABELS, priceView } from '../components/BoatCard';
import BoatCardSkeleton from '../components/BoatCardSkeleton';
import LakeBackdrop from '../components/LakeBackdrop';
import Reveal from '../components/Reveal';
import { riseOnMount } from '../components/motion';
import { ErrorState } from '../components/StateViews';
import { useAsync } from '../hooks/useAsync';
import BoatTypeTiles from '../components/landing/BoatTypeTiles';
import DepartureLocations from '../components/landing/DepartureLocations';
import EditorialBand from '../components/landing/EditorialBand';
import { heroPhoto } from '../data/photos';
import * as boats from '../services/boats.service';
import * as imagesSvc from '../services/images.service';
import * as reviewsSvc from '../services/reviews.service';
import type { BoatKind } from '../services/boats.service';

const TYPE_OPTIONS: (BoatKind | 'all')[] = ['all', 'houseboat', 'speedboat', 'fishing', 'cruiser', 'pontoon'];

export default function TouristHome() {
  const { data, loading, error, reload } = useAsync(() => boats.listPublicBoats(), []);
  const idsKey = (data ?? []).map((b) => b.id).join(',');
  const { data: imagesByBoat } = useAsync(
    () => imagesSvc.listImagesForBoats(idsKey ? idsKey.split(',') : []),
    [idsKey],
  );
  // Every card's rating in one request (boat_rating_summary, or computed from the
  // visible reviews before migration 32). Undefined per card until it answers.
  const { data: ratingsByBoat } = useAsync(
    () => reviewsSvc.getRatingSummaries(idsKey ? idsKey.split(',') : []),
    [idsKey],
  );
  const [groupSize, setGroupSize] = useState(2);
  const [boatType, setBoatType] = useState<BoatKind | 'all'>('all');
  const [maxPrice, setMaxPrice] = useState(700);
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [sort, setSort] = useState<'recommended' | 'price_low' | 'capacity' | 'top_rated'>('recommended');

  const resetFilters = () => {
    setBoatType('all'); setGroupSize(1); setMaxPrice(700); setVerifiedOnly(false);
  };

  const heroRef = useRef<HTMLElement>(null);
  const reduceMotion = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ['start start', 'end start'] });

  // The photo drifts as gently as the parallax bands further down: 8% of its
  // height over the whole hero scroll, with no zoom. It moves down, so the gap
  // it opens at its top is always inside the part of the hero already scrolled
  // off screen (8% of the hero against 100% of it), and no edge ever shows. The
  // fixed 1.08 scale is the crop the art direction below was chosen at; it no
  // longer grows. A full-bleed image that drifts under the page is the textbook
  // vestibular trigger, so under prefers-reduced-motion the photograph is simply
  // a photograph: it still dims on scroll, because that is an opacity change
  // which aids comprehension rather than implying movement.
  const heroY = useTransform(scrollYProgress, [0, 1], ['0%', reduceMotion ? '0%' : '8%']);
  const heroOpacity = useTransform(scrollYProgress, [0, 1], [1, reduceMotion ? 0.7 : 0.55]);
  // The headline lags the page a little as the hero scrolls away and fades out
  // over the first three quarters of it, the way MSC's hero copy leaves. Under
  // reduced motion it scrolls as plain text, at full opacity.
  const heroCopyY = useTransform(scrollYProgress, [0, 1], [0, reduceMotion ? 0 : 64]);
  const heroCopyOpacity = useTransform(scrollYProgress, [0, 0.75], [1, reduceMotion ? 1 : 0]);

  /**
   * Hero entry: a short rise that settles without overshoot. Nothing here was
   * thrown by the user, so bounce would be motion for its own sake; `bounce: 0`
   * is the critically damped default. Under reduced motion the travel is dropped
   * and only the cross-fade remains.
   */
  const rise = (delay: number) => riseOnMount(reduceMotion, delay);

  // Listed boats per type, straight from the live listings and independent of
  // the filters, so each tile answers "how many of these are on the platform".
  // Null until the listings have loaded, so a tile never shows a made-up zero.
  const typeCounts = useMemo(() => {
    if (!data) return null;
    const counts: Record<BoatKind, number> = { houseboat: 0, speedboat: 0, fishing: 0, cruiser: 0, pontoon: 0 };
    for (const b of data) counts[b.boatType] += 1;
    return counts;
  }, [data]);

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
    } else if (sort === 'top_rated') {
      // The real average over visible reviews. Boats with no reviews yet go after
      // every rated boat rather than counting as 0; ties go to the boat with more
      // reviews, then to the operator's trust score.
      const avg = (id: string) => ratingsByBoat?.[id]?.average ?? -1;
      const count = (id: string) => ratingsByBoat?.[id]?.count ?? 0;
      arr.sort((a, b) => avg(b.id) - avg(a.id) || count(b.id) - count(a.id) || b.operatorTrustScore - a.operatorTrustScore);
    } else {
      arr.sort((a, b) => b.operatorTrustScore - a.operatorTrustScore);
    }
    return arr;
  }, [filtered, sort, ratingsByBoat]);

  return (
    <PageTransition>
      {/* Navy under the photograph, so the white headline is legible before the
          image arrives and the photo fades towards navy, not page white, on scroll. */}
      <section ref={heroRef} className="relative overflow-hidden bg-lake-950 text-white min-h-[600px] sm:min-h-[680px] lg:min-h-[min(84svh,780px)]">
        {/* Decorative: the headline says what the page is. Art-directed, because a
            phone crops the landscape frame to its middle third, which put the rear
            houseboat right behind the subtitle; the portrait frame of the same scene
            keeps all three boats below the type. From 640px the landscape frame
            shows its top edge, so the boats sit low and clear of the copy. From
            1024px the hero is wide and short (about 1.6:1 to 2.1:1 between a
            1024x768 and a 1280x720 screen), the booking bar overlaps its foot, and
            a top-anchored crop put the front houseboat under the bar; anchoring at
            30% keeps the boats between the subtitle and the bar from 1024 through
            1150, 1280 and 1440px. */}
        <picture aria-hidden>
          <source media="(max-width: 639px)" srcSet={heroPhoto.portrait.srcSet} sizes="100vw" />
          <motion.img
            src={heroPhoto.landscape.src}
            srcSet={heroPhoto.landscape.srcSet}
            sizes="100vw"
            alt=""
            fetchPriority="high"
            style={{ y: heroY, scale: reduceMotion ? 1 : 1.08, opacity: heroOpacity, willChange: reduceMotion ? undefined : 'transform' }}
            className="absolute inset-0 h-full w-full object-cover object-center sm:object-[52%_0%] lg:object-[52%_30%]"
          />
        </picture>
        {/* The headline is centred over open water, which is pale, so the scrim
            runs top-down and stays dense well past the subtitle: 82% navy at the
            top, 62% by the subtitle, then clearing by the waterline so the boats
            stay the subject. Measured on this photo at 375, 768, 1440 and 1920px,
            the subtitle is 4.8:1 or better and the headline 6.7:1 or better. */}
        <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgb(13_37_50/0.82),rgb(13_37_50/0.62)_45%,rgb(13_37_50/0.2)_75%,rgb(13_37_50/0.1))]" />

        <motion.div
          style={{ y: heroCopyY, opacity: heroCopyOpacity }}
          className="relative mx-auto max-w-6xl px-4 sm:px-6 pt-20 sm:pt-24 lg:pt-28 text-center"
        >
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
        </motion.div>
      </section>

      {/* Everything between the hero and the departures band sits on the same
          layered lake background as the portals (LakeBackdrop), so the pale part
          of the page never reads as a flat fill. It starts at the foot of the
          photograph; the booking bar is pulled up over the hero from inside it.
          flow-root keeps the bar's negative margin from collapsing through this
          box, which would drag the background up over the photograph too. */}
      <div className="relative isolate flow-root">
        <LakeBackdrop />

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
                <span className="block text-xs font-bold uppercase tracking-[0.08em] text-lake-600">Boat type</span>
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
                <span className="block text-xs font-bold uppercase tracking-[0.08em] text-lake-600">Guests</span>
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
                <span className="flex items-baseline justify-between text-xs font-bold uppercase tracking-[0.08em] text-lake-600">
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
                className="m-1 inline-flex items-center justify-center gap-2 rounded-md bg-sunset-500 px-6 py-3.5 text-[15px] font-bold text-lake-950
                           transition-[background-color,transform] duration-150 hover:bg-sunset-400 active:scale-[0.98]
                           outline-none focus-visible:ring-2 focus-visible:ring-sunset-500 focus-visible:ring-offset-2 sm:col-span-2 lg:col-span-1"
              >
                <Search size={17} aria-hidden />
                {/* Zero gets its own words: "Show 0 boats" offers something that is
                    not there. It still scrolls down, to the empty state and its
                    "Clear filters" button. */}
                {/* While loading, or if the list failed, there is no count to give:
                    "No matching boats" would claim the lake is empty. */}
                {loading || error
                  ? 'Show boats'
                  : filtered.length === 0
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
          {/* Each claim rises in on its rule, in a wave across the row. */}
          <dl className="grid grid-cols-1 gap-x-10 gap-y-6 sm:grid-cols-3">
            <Reveal className="border-t-2 border-lake-950 pt-4">
              {/* Worded to what the platform actually enforces: every listing goes
                  through the admin approval queue, while the verified badge is a
                  separate, per-company check. It does not claim every operator's
                  documents were reviewed, because grandfathered operators exist. */}
              <dt className="text-[15px] font-bold text-lake-950">Every listing reviewed</dt>
              <dd className="mt-1 text-sm leading-relaxed text-lake-700">
                Our team approves each boat before it goes live. Look for the verified badge on checked operators.
              </dd>
            </Reveal>
            <Reveal className="border-t-2 border-lake-950 pt-4">
              <dt className="text-[15px] font-bold text-lake-950">The price up front</dt>
              <dd className="mt-1 text-sm leading-relaxed text-lake-700">
                See the full rate before you ask. A deposit confirms the booking, the rest is paid on the day.
              </dd>
            </Reveal>
            <Reveal className="border-t-2 border-lake-950 pt-4">
              <dt className="text-[15px] font-bold text-lake-950">Reviews from real trips</dt>
              <dd className="mt-1 text-sm leading-relaxed text-lake-700">
                Only guests whose trip was completed can leave a review.
              </dd>
            </Reveal>
          </dl>
        </section>

        <BoatTypeTiles counts={typeCounts} selected={boatType} onSelect={setBoatType} />

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
                  <p className="mt-1 text-sm text-lake-700">
                    {loading ? 'Loading boats…' : error ? 'Boats could not be loaded' : (
                      <>
                        <span className="font-semibold tabular-nums text-lake-950">{filtered.length}</span>{' '}
                        {filtered.length === 1 ? 'boat matches' : 'boats match'} your search
                      </>
                    )}
                  </p>
                </div>
                <label className="flex items-center gap-2 text-sm text-lake-700">
                  <ArrowDownUp size={14} className="text-lake-400" />
                  <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}
                    className="rounded-lg border border-lake-100 bg-lake-50 px-3 py-1.5 text-sm outline-none focus:border-lake-400">
                    <option value="recommended">Recommended</option>
                    <option value="price_low">Price: low to high</option>
                    <option value="capacity">Largest first</option>
                    <option value="top_rated">Top rated</option>
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
            <div className="rounded-xl border border-dashed border-lake-300 py-16 text-center text-lake-700">
              No boats are listed yet. Check back soon.
            </div>
          )}
          {!loading && !error && (data ?? []).length > 0 && sorted.length === 0 && (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-lake-300 py-16 text-center text-lake-700">
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
                <BoatCard key={boat.id} boat={boat} images={imagesByBoat?.[boat.id] ?? []}
                  rating={ratingsByBoat ? ratingsByBoat[boat.id] ?? reviewsSvc.EMPTY_SUMMARY : undefined} />
              ))}
            </div>
          )}
        </section>
      </div>

      {!loading && !error && data && <DepartureLocations locations={data.map((b) => b.location)} />}

      <EditorialBand />
    </PageTransition>
  );
}
