export default function HouseboatIllustration({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 140" className={className} xmlns="http://www.w3.org/2000/svg">
      <circle cx="152" cy="28" r="16" fill="#ffab6d" opacity="0.6" />
      <path d="M0 100 Q20 92 40 100 T80 100 T120 100 T160 100 T200 100 V140 H0 Z" fill="#7dc0d8" opacity="0.5" />
      <path d="M0 112 Q20 104 40 112 T80 112 T120 112 T160 112 T200 112 V140 H0 Z" fill="#46a0c0" opacity="0.7" />

      <path d="M20 95 L180 95 L170 110 L30 110 Z" fill="#19536c" />

      <rect x="30" y="65" width="140" height="32" rx="4" fill="#ffffff" stroke="#19536c" strokeWidth="2" />
      <rect x="42" y="74" width="14" height="14" rx="2" fill="#2683a3" />
      <rect x="64" y="74" width="14" height="14" rx="2" fill="#2683a3" />
      <rect x="86" y="74" width="14" height="14" rx="2" fill="#2683a3" />
      <rect x="108" y="74" width="14" height="14" rx="2" fill="#2683a3" />
      <rect x="130" y="74" width="14" height="14" rx="2" fill="#2683a3" />
      <rect x="152" y="74" width="10" height="14" rx="2" fill="#2683a3" />

      <rect x="45" y="46" width="90" height="20" rx="3" fill="#eef7fb" stroke="#19536c" strokeWidth="2" />
      <rect x="55" y="52" width="12" height="10" fill="#2683a3" />
      <rect x="75" y="52" width="12" height="10" fill="#2683a3" />
      <rect x="95" y="52" width="12" height="10" fill="#2683a3" />
      <rect x="115" y="52" width="12" height="10" fill="#2683a3" />

      <line x1="45" y1="46" x2="45" y2="38" stroke="#19536c" strokeWidth="2" />
      <line x1="135" y1="46" x2="135" y2="38" stroke="#19536c" strokeWidth="2" />
      <line x1="45" y1="38" x2="135" y2="38" stroke="#19536c" strokeWidth="2" />
    </svg>
  );
}
