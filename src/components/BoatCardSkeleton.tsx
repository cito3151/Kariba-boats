/**
 * Placeholder that mirrors BoatCard's actual shape: a 176px image band, then the
 * title, location, type chip and meta row. A centred spinner tells the reader
 * only that something is happening; a skeleton in the grid's own geometry tells
 * them what is arriving and stops the page reflowing when it does.
 *
 * Shapes only, no text. The pulse is a plain opacity animation, which is what
 * prefers-reduced-motion leaves alone, so no separate reduced path is needed.
 */
function Line({ className = '' }: { className?: string }) {
  return <div className={`rounded bg-lake-100 ${className}`} />;
}

export default function BoatCardSkeleton() {
  return (
    <div
      aria-hidden
      className="animate-pulse overflow-hidden rounded-2xl border border-lake-100 bg-white shadow-sm"
    >
      <div className="h-44 bg-lake-100" />
      <div className="p-4">
        <Line className="h-4 w-2/3" />
        <Line className="mt-2 h-3 w-2/5" />
        <Line className="mt-3 h-5 w-24 rounded-full" />
        <div className="mt-4 flex items-center justify-between">
          <Line className="h-3 w-16" />
          <Line className="h-3 w-10" />
        </div>
      </div>
    </div>
  );
}
