import HouseboatIllustration from './illustrations/HouseboatIllustration';
import CruiserIllustration from './illustrations/CruiserIllustration';
import FishingBoatIllustration from './illustrations/FishingBoatIllustration';

const illustrations: Record<string, typeof HouseboatIllustration> = {
  houseboat: HouseboatIllustration,
  cruiser: CruiserIllustration,
  fishing: FishingBoatIllustration,
};

export function isIllustration(src: string) {
  return src.startsWith('illustration:');
}

export default function BoatImage({
  src,
  alt = '',
  className = '',
  showBadge = true,
}: {
  src: string;
  alt?: string;
  className?: string;
  showBadge?: boolean;
}) {
  if (isIllustration(src)) {
    const key = src.replace('illustration:', '');
    const Illustration = illustrations[key] ?? CruiserIllustration;
    return (
      <div className={`relative flex items-center justify-center bg-lake-100 ${className}`}>
        <Illustration className="h-3/4 w-3/4 max-w-xs" />
        {showBadge && (
          <span className="absolute bottom-2 left-2 rounded-full bg-lake-950/70 px-2 py-0.5 text-[10px] font-medium text-white">
            Illustration, real photo pending
          </span>
        )}
      </div>
    );
  }

  return <img src={src} alt={alt} className={`object-cover ${className}`} />;
}
