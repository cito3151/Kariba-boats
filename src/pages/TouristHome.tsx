import { useMemo, useRef, useState } from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';
import { Search, Users, ShieldCheck, ArrowDownUp, Wallet, MessagesSquare, Anchor } from 'lucide-react';
import PageTransition from '../components/PageTransition';
import BoatCard, { BOAT_TYPE_LABELS, priceView } from '../components/BoatCard';
import Reveal from '../components/Reveal';
import { LoadingState, ErrorState } from '../components/StateViews';
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
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ['start start', 'end start'] });
  const heroY = useTransform(scrollYProgress, [0, 1], ['0%', '30%']);
  const heroScale = useTransform(scrollYProgress, [0, 1], [1.08, 1.25]);
  const heroOpacity = useTransform(scrollYProgress, [0, 1], [1, 0.4]);

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
      <section ref={heroRef} className="relative overflow-hidden text-white">
        <motion.img
          src={heroImage}
          alt="Sunset over Lake Kariba, Zimbabwe"
          style={{ y: heroY, scale: heroScale, opacity: heroOpacity }}
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-lake-950/80 via-lake-950/55 to-lake-50" />

        <div className="relative mx-auto max-w-6xl px-4 sm:px-6 py-20 sm:py-28">
          <motion.p
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
            className="text-sunset-300 font-semibold text-sm tracking-[0.15em] uppercase"
          >
            Lake Kariba, Zimbabwe
          </motion.p>
          <motion.h1
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12, duration: 0.6 }}
            className="mt-3 font-display text-4xl sm:text-6xl font-medium leading-[1.05] max-w-2xl"
          >
            Find and book a real, verified boat on Kariba, today.
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.22 }}
            className="mt-5 max-w-xl text-lg text-lake-100"
          >
            Compare fishing boats, houseboats, and sunset cruises with transparent pricing,
            verified safety checks, and real reviews. No phone calls needed.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.32, duration: 0.5 }}
            className="mt-9 rounded-2xl bg-white/95 backdrop-blur p-4 sm:p-5 text-lake-950 shadow-2xl"
          >
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div>
                <label className="text-xs font-medium text-lake-500">Boat type</label>
                <select
                  value={boatType}
                  onChange={(e) => setBoatType(e.target.value as BoatKind | 'all')}
                  className="mt-1 w-full rounded-lg border border-lake-100 bg-lake-50 px-3 py-2 text-sm outline-none focus:border-lake-400"
                >
                  <option value="all">Any type</option>
                  {TYPE_OPTIONS.slice(1).map((t) => (
                    <option key={t} value={t}>{BOAT_TYPE_LABELS[t as BoatKind]}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-lake-500">Group size</label>
                <div className="mt-1 flex items-center gap-2 rounded-lg border border-lake-100 bg-lake-50 px-3 py-2">
                  <Users size={14} className="text-lake-400" />
                  <input
                    type="number" min={1} max={200} value={groupSize}
                    onChange={(e) => setGroupSize(Number(e.target.value) || 1)}
                    className="w-full bg-transparent text-sm outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-lake-500">Max price (${maxPrice})</label>
                <input
                  type="range" min={20} max={700} step={10} value={maxPrice}
                  onChange={(e) => setMaxPrice(Number(e.target.value))}
                  className="mt-3 w-full accent-lake-600"
                />
              </div>
              <div className="flex flex-col justify-end">
                <label className="flex items-center gap-2 rounded-lg border border-lake-100 bg-lake-50 px-3 py-2 text-sm cursor-pointer select-none">
                  <input
                    type="checkbox" checked={verifiedOnly}
                    onChange={(e) => setVerifiedOnly(e.target.checked)}
                    className="accent-lake-600"
                  />
                  <ShieldCheck size={14} className="text-lake-500" /> Verified only
                </label>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      <section className="border-b border-lake-100 bg-white">
        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-3 px-4 py-4 sm:grid-cols-3 sm:px-6">
          <div className="flex items-center gap-2 text-sm text-lake-700">
            <ShieldCheck size={16} className="text-lake-600" /> Verified operators and safety checks
          </div>
          <div className="flex items-center gap-2 text-sm text-lake-700">
            <Wallet size={16} className="text-lake-600" /> Transparent pricing, pay a deposit to confirm
          </div>
          <div className="flex items-center gap-2 text-sm text-lake-700">
            <MessagesSquare size={16} className="text-lake-600" /> Real reviews from completed trips
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 sm:px-6 py-12">
        <Reveal>
          <div className="mb-5 flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-display text-xl font-medium text-lake-950 flex items-center gap-2">
                <Search size={16} /> {filtered.length} boat{filtered.length !== 1 ? 's' : ''} found
              </h2>
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
                  className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
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

        {loading && <LoadingState label="Finding boats on Kariba" />}
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
