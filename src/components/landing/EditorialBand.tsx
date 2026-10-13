import { useReducedMotion } from 'framer-motion';
import Reveal from '../Reveal';
import { scrollToBoats } from './scrollToBoats';

/**
 * The closing call to action: a short heading, two plain sentences and one
 * button. Every sentence describes what the platform does today.
 *
 * Set light, not navy. It sits directly above the footer, which is lake-950, so a
 * navy band here met it with no gap in the same colour and read as one oversized
 * footer. A pale band keeps the two as separate blocks, and needs no photograph,
 * so it does not repeat one already used in the boat-type tiles above.
 */
export default function EditorialBand() {
  const reduceMotion = useReducedMotion();

  return (
    <section className="border-t border-lake-200 bg-lake-100">
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-16">
        <Reveal>
          <div className="grid gap-6 md:grid-cols-[1fr_auto] md:items-end md:gap-12">
            <div className="max-w-2xl border-l-4 border-sunset-500 pl-5">
              <h2 className="text-2xl font-extrabold uppercase tracking-[0.04em] text-lake-950 sm:text-3xl">
                Book your boat on the lake
              </h2>
              <p className="mt-3 text-base leading-relaxed text-lake-700 sm:text-lg">
                Our team approves every listing before it goes live, and you see the full rate before you ask.
                A deposit confirms your booking. You pay the rest on the day.
              </p>
            </div>
            <button
              type="button"
              onClick={() => scrollToBoats(reduceMotion)}
              // Navy on orange, as in the header and on the cards: white on
              // sunset-500 is 3.11:1 and fails AA at this size.
              className="inline-flex items-center justify-center self-start rounded-md bg-sunset-500 px-7 py-3.5 text-[15px] font-bold text-lake-950
                         transition-[background-color,transform] duration-150 hover:bg-sunset-400 active:scale-[0.98] md:self-auto
                         outline-none focus-visible:ring-2 focus-visible:ring-lake-500 focus-visible:ring-offset-2 focus-visible:ring-offset-lake-100"
            >
              Browse available boats
            </button>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
