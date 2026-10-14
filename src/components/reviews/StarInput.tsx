import { useRef, useState, type KeyboardEvent } from 'react';
import { Star } from 'lucide-react';
import { RATING_WORDS } from '../../services/reviews.service';

/**
 * A 1-to-5 star picker, built as a radio group: Tab lands on the chosen star
 * (or the first), the arrow keys move and choose, Home and End jump to 1 and 5.
 * Every star is a 44px target whatever the icon size, and each one is labelled
 * "4 stars, Very good". The word for the current choice sits beside the stars
 * so the scale is never left to colour alone.
 */
export default function StarInput({
  value, onChange, label, labelId, size = 'lg',
}: {
  value: number;
  onChange: (n: number) => void;
  /** Accessible name of the group, when no visible label is linked by labelId. */
  label?: string;
  labelId?: string;
  size?: 'lg' | 'md';
}) {
  const [hover, setHover] = useState(0);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const shown = hover || value;
  const icon = size === 'lg' ? 32 : 24;

  const choose = (n: number) => {
    const next = Math.min(5, Math.max(1, n));
    onChange(next);
    refs.current[next - 1]?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    const current = value || 0;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { e.preventDefault(); choose(current + 1); }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { e.preventDefault(); choose(current ? current - 1 : 1); }
    else if (e.key === 'Home') { e.preventDefault(); choose(1); }
    else if (e.key === 'End') { e.preventDefault(); choose(5); }
  };

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <div role="radiogroup" aria-label={labelId ? undefined : label} aria-labelledby={labelId}
        className="-ml-1.5 flex items-center" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((n) => {
          const checked = value === n;
          return (
            <button
              key={n}
              ref={(el) => { refs.current[n - 1] = el; }}
              type="button"
              role="radio"
              aria-checked={checked}
              aria-label={`${n} star${n > 1 ? 's' : ''}, ${RATING_WORDS[n]}`}
              tabIndex={checked || (value === 0 && n === 1) ? 0 : -1}
              onClick={() => onChange(n)}
              onMouseEnter={() => setHover(n)}
              onKeyDown={onKeyDown}
              className="inline-flex h-11 w-11 items-center justify-center rounded-md outline-none transition-transform duration-150 focus-visible:ring-2 focus-visible:ring-lake-500 active:scale-90 motion-reduce:transition-none motion-reduce:active:scale-100"
            >
              {/* lake-500 for an empty star: it is a control's state and needs 3:1
                  against the pale panel the form sits on. */}
              <Star size={icon} aria-hidden
                className={shown >= n ? 'fill-sunset-500 text-sunset-600' : 'text-lake-500'} />
            </button>
          );
        })}
      </div>
      <span aria-hidden className="min-w-[5.5rem] text-base font-semibold text-lake-900">
        {shown ? RATING_WORDS[shown] : ''}
      </span>
    </div>
  );
}
