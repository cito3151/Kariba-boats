import { Star } from 'lucide-react';

export default function StarRating({
  rating,
  size = 14,
  showNumber = true,
}: {
  rating: number;
  size?: number;
  showNumber?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="inline-flex items-center">
        {Array.from({ length: 5 }).map((_, i) => {
          const filled = i < Math.round(rating);
          return (
            <Star
              key={i}
              size={size}
              className={filled ? 'fill-sunset-500 text-sunset-500' : 'text-lake-200'}
            />
          );
        })}
      </span>
      {showNumber && <span className="text-xs text-lake-600 font-medium">{rating.toFixed(1)}</span>}
    </span>
  );
}
