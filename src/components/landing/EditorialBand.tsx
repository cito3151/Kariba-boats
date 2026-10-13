import { useReducedMotion } from 'framer-motion';
import Reveal from '../Reveal';
import PhotoBackdrop from '../PhotoBackdrop';
import { photos } from '../../data/photos';
import { scrollToBoats } from './scrollToBoats';

/**
 * The closing call to action: a short heading, two plain sentences and one
 * button. Every sentence describes what the platform does today.
 *
 * Set light, not navy. It sits directly above the footer, which is lake-950, so a
 * navy band here met it with no gap in the same colour and read as one oversized
 * footer. A pale band keeps the two as separate blocks; the boat comes in as an
 * image card beside the copy (a fishing boat at sunset, used nowhere else), so no
 * text ever sits on the photograph.
 *
 * Pale but not flat: a diagonal lake-50 to lake-200 wash under the shared water
 * texture at 8% lake-700. At the darkest corner, behind the button, lake-700 text
 * would still be 5.3:1; behind the copy it is 6:1 or better.
 */
export default function EditorialBand() {
  const reduceMotion = useReducedMotion();

  return (
    <section className="relative isolate overflow-hidden border-t border-lake-200 bg-lake-100">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-linear-to-br from-lake-50 via-lake-100 to-lake-200/70" />
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 water-texture bg-lake-700/8" />
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-16">
        <Reveal>
          {/* Copy and button on the left, the photo on the right; on a phone the
              photo follows the button, so the call to action is read first. */}
          <div className="grid gap-8 md:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)] md:items-center md:gap-12">
            <div>
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
                className="mt-6 inline-flex items-center justify-center rounded-md bg-sunset-500 px-7 py-3.5 text-[15px] font-bold text-lake-950
                           transition-[background-color,transform] duration-150 hover:bg-sunset-400 active:scale-[0.98]
                           outline-none focus-visible:ring-2 focus-visible:ring-lake-500 focus-visible:ring-offset-2 focus-visible:ring-offset-lake-100"
              >
                Browse available boats
              </button>
            </div>
            {/* 4:3 at every width. The source is near square, so the frame shows
                its lower part: the boat at the foot, the sun above it. */}
            <div className="relative aspect-[4/3] overflow-hidden rounded-md bg-lake-900 shadow-[0_20px_50px_-24px_rgba(13,37,50,0.55)]">
              <PhotoBackdrop
                photo={photos.sunsetAnglers}
                sizes="(min-width: 1152px) 470px, (min-width: 768px) 40vw, calc(100vw - 32px)"
              />
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
