import { Star } from 'lucide-react';

// A read-only row of stars. It is one image to a screen reader ("Rated 4 out of
// 5"), so the five icons are not read out one by one.
export default function StarRating({
  rating,
  size = 14,
  showNumber = true,
}: {
  rating: number;
  size?: number;
  showNumber?: boolean;
}) {
  const label = `Rated ${Number.isInteger(rating) ? rating : rating.toFixed(1)} out of 5`;
  return (
    <span className="inline-flex items-center gap-1" role="img" aria-label={label}>
      <span className="inline-flex items-center" aria-hidden>
        {Array.from({ length: 5 }).map((_, i) => {
          const filled = i < Math.round(rating);
          return (
            <Star
              key={i}
              size={size}
              className={filled ? 'fill-sunset-500 text-sunset-500' : 'text-lake-300'}
            />
          );
        })}
      </span>
      {showNumber && <span aria-hidden className="text-xs text-lake-600 font-medium">{rating.toFixed(1)}</span>}
    </span>
  );
}
