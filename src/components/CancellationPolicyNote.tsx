import { CalendarX2, ChevronDown } from 'lucide-react';
import { OFF_PLATFORM_NOTE, POLICY_INFO, POLICY_OVERRIDES } from '../data/cancellation';
import type { CancellationPolicy } from '../data/cancellation';

/**
 * A boat's (or a booking's) cancellation policy: its name and one line, with the
 * bands and the protections that always apply behind a native disclosure, so the
 * price block stays short and the detail is one tap away. Used beside the price on
 * the boat page and in the booking form before the request is sent.
 *
 * `tone="plain"` drops the box for a card that already has its own border. The
 * text is lake-700 or darker on white (7:1 and up); nothing is under 14px.
 */
export default function CancellationPolicyNote({
  policy, tone = 'boxed', className = '',
}: {
  policy: CancellationPolicy;
  tone?: 'boxed' | 'plain';
  className?: string;
}) {
  const info = POLICY_INFO[policy];
  return (
    <div className={`${tone === 'boxed' ? 'rounded-lg border border-lake-200 bg-white px-3.5 py-3' : ''} ${className}`}>
      <p className="flex items-start gap-2.5 text-[15px] leading-snug text-lake-800">
        <CalendarX2 size={17} className="mt-px shrink-0 text-lake-700" aria-hidden />
        <span className="min-w-0">
          <span className="font-semibold text-lake-950">{info.label} cancellation.</span>{' '}
          {info.summary}
        </span>
      </p>
      <details className="group mt-1.5 pl-[27px]">
        <summary className="inline-flex min-h-10 cursor-pointer list-none items-center gap-1 rounded-sm text-sm font-semibold text-lake-800 underline underline-offset-2 outline-none hover:text-lake-950 focus-visible:ring-2 focus-visible:ring-lake-500 [&::-webkit-details-marker]:hidden">
          What you get back
          <ChevronDown size={15} aria-hidden className="transition-transform group-open:rotate-180 motion-reduce:transition-none" />
        </summary>
        <ul className="mt-1 list-disc space-y-1 pl-4 text-sm leading-snug text-lake-800">
          {info.tiers.map((t) => <li key={t}>{t}</li>)}
        </ul>
        <p className="mt-2.5 text-sm font-semibold text-lake-950">Always, whatever the policy</p>
        <ul className="mt-1 list-disc space-y-1 pl-4 text-sm leading-snug text-lake-800">
          {POLICY_OVERRIDES.map((t) => <li key={t}>{t}</li>)}
        </ul>
        <p className="mt-2.5 text-sm leading-snug text-lake-700">
          Days count to the trip date on the Kariba calendar. {OFF_PLATFORM_NOTE}
        </p>
      </details>
    </div>
  );
}
