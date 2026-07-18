export default function CruiserIllustration({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 140" className={className} xmlns="http://www.w3.org/2000/svg">
      <circle cx="155" cy="28" r="14" fill="#ffab6d" opacity="0.6" />
      <path d="M0 100 Q20 92 40 100 T80 100 T120 100 T160 100 T200 100 V140 H0 Z" fill="#7dc0d8" opacity="0.5" />
      <path d="M0 112 Q20 104 40 112 T80 112 T120 112 T160 112 T200 112 V140 H0 Z" fill="#46a0c0" opacity="0.7" />

      <path d="M15 95 Q100 116 185 95 L173 101 Q100 119 27 101 Z" fill="#19536c" />
      <path d="M25 95 L175 95 L165 78 L35 78 Z" fill="#ffffff" stroke="#19536c" strokeWidth="2" />

      <rect x="68" y="52" width="64" height="26" rx="3" fill="#eef7fb" stroke="#19536c" strokeWidth="2" />
      <rect x="76" y="58" width="14" height="12" fill="#2683a3" />
      <rect x="96" y="58" width="14" height="12" fill="#2683a3" />
      <rect x="116" y="58" width="10" height="12" fill="#2683a3" />
      <rect x="63" y="46" width="74" height="8" rx="2" fill="#19536c" />

      <line x1="100" y1="46" x2="100" y2="30" stroke="#19536c" strokeWidth="2" />
      <path d="M100 30 L114 34.5 L100 39 Z" fill="#fd5d0c" />
    </svg>
  );
}
