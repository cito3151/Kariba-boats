/**
 * A booking's reference as a small labelled chip, "REF KLC-7H3QXK", the way a
 * cruise confirmation tags every booking with its number. The number is set in
 * monospace at 14px so similar characters stay distinct, and a click selects all
 * of it, ready to copy into a message to the operator. A screen reader hears
 * "Booking reference KLC-7H3QXK" rather than "ref".
 *
 * Renders nothing when the reference is empty (a row read before migration 31).
 * lake-700 on lake-50 is 7.7:1 and lake-950 is 14.6:1.
 */
export default function BookingRef({ reference, className = '' }: { reference: string; className?: string }) {
  if (!reference) return null;
  return (
    <p className={`inline-flex max-w-full items-center gap-1.5 rounded-md border border-lake-200 bg-lake-50 px-2 py-1 leading-none ${className}`}>
      <span className="sr-only">Booking reference </span>
      <span aria-hidden className="text-sm font-bold uppercase tracking-[0.06em] text-lake-700">Ref</span>
      <span className="select-all break-all font-mono text-sm font-semibold tracking-[0.04em] text-lake-950">{reference}</span>
    </p>
  );
}
