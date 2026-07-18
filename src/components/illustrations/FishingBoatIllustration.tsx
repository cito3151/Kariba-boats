export default function FishingBoatIllustration({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 140" className={className} xmlns="http://www.w3.org/2000/svg">
      <circle cx="152" cy="30" r="14" fill="#ffab6d" opacity="0.6" />
      <path d="M0 100 Q20 92 40 100 T80 100 T120 100 T160 100 T200 100 V140 H0 Z" fill="#7dc0d8" opacity="0.5" />
      <path d="M0 112 Q20 104 40 112 T80 112 T120 112 T160 112 T200 112 V140 H0 Z" fill="#46a0c0" opacity="0.7" />

      {/* Small skiff hull */}
      <path d="M40 92 Q100 108 160 92 L150 100 Q100 112 50 100 Z" fill="#19536c" />
      <path d="M46 92 L154 92 L146 80 L54 80 Z" fill="#ffffff" stroke="#19536c" strokeWidth="2" />

      {/* Bench seats */}
      <line x1="65" y1="80" x2="65" y2="92" stroke="#2683a3" strokeWidth="3" />
      <line x1="100" y1="80" x2="100" y2="92" stroke="#2683a3" strokeWidth="3" />
      <line x1="135" y1="80" x2="135" y2="92" stroke="#2683a3" strokeWidth="3" />

      {/* Outboard motor */}
      <rect x="146" y="86" width="8" height="16" rx="2" fill="#19536c" />

      {/* Fishing rod */}
      <line x1="70" y1="80" x2="40" y2="50" stroke="#19536c" strokeWidth="2" />
      <line x1="40" y1="50" x2="34" y2="66" stroke="#2683a3" strokeWidth="1.5" />
    </svg>
  );
}
