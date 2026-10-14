/**
 * Placeholder that mirrors BoatCard's actual shape: a 176px photo band, then the
 * type label, name, rating, location, two detail lines and the price / button footer, at
 * the same line heights the card uses. A centred spinner tells the reader only
 * that something is happening; a skeleton in the grid's own geometry tells them
 * what is arriving and stops the page reflowing when it does.
 *
 * Shapes only, no text. The pulse is a plain opacity animation, which is what
 * prefers-reduced-motion leaves alone, so no separate reduced path is needed.
 */
function Line({ className = '' }: { className?: string }) {
  return <div className={`rounded-sm bg-lake-100 ${className}`} />;
}

export default function BoatCardSkeleton() {
  return (
    <div
      aria-hidden
      className="flex h-full animate-pulse flex-col overflow-hidden rounded-md border border-lake-100 bg-white shadow-[0_1px_3px_rgba(13,37,50,0.08)]"
    >
      <div className="h-44 shrink-0 bg-lake-100" />
      <div className="flex flex-1 flex-col p-4">
        {/* Each row sits in a box with the card's line height, so the bar is
            centred in the same space the real text will occupy. */}
        <div className="flex h-4 items-center"><Line className="h-2.5 w-20" /></div>
        <div className="mt-1 flex h-6 items-center"><Line className="h-4 w-2/3" /></div>
        {/* The rating line. */}
        <div className="mt-1 flex h-6 items-center"><Line className="h-3 w-28" /></div>
        <div className="mt-1 flex h-4 items-center"><Line className="h-2.5 w-2/5" /></div>
        <div className="mt-3 space-y-1">
          <div className="flex h-4 items-center"><Line className="h-2.5 w-24" /></div>
          <div className="flex h-4 items-center"><Line className="h-2.5 w-44" /></div>
        </div>
        <div className="mt-auto pt-4">
          <div className="flex items-end justify-between gap-3 border-t border-lake-100 pt-4">
            <div>
              <div className="flex h-4 items-center"><Line className="h-2.5 w-8" /></div>
              <div className="flex h-8 items-center"><Line className="h-6 w-24" /></div>
              <div className="flex h-4 items-center"><Line className="h-2.5 w-20" /></div>
            </div>
            <Line className="h-9 w-28 rounded-md" />
          </div>
        </div>
      </div>
    </div>
  );
}
