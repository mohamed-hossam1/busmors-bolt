/** Decorative wordmark shared by the hero and closing presentation with glowing gradient outline. */
export default function BrandOutline() {
  return (
    <svg
      viewBox="0 15 1200 190"
      fill="none"
      aria-hidden="true"
      focusable="false"
      className="block h-auto w-full overflow-visible"
    >
      <defs>
        <linearGradient id="brand-outline-grad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#5272ff" />
          <stop offset="35%" stopColor="#8f72ff" />
          <stop offset="70%" stopColor="#b692fe" />
          <stop offset="100%" stopColor="#5272ff" />
        </linearGradient>
        <filter id="brand-outline-glow" x="-15%" y="-30%" width="130%" height="160%">
          <feGaussianBlur stdDeviation="5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      {/* Background ambient glow stroke */}
      <text
        x="600"
        y="190"
        textAnchor="middle"
        textLength="1160"
        lengthAdjust="spacingAndGlyphs"
        stroke="url(#brand-outline-grad)"
        strokeWidth="5"
        strokeOpacity="0.45"
        filter="url(#brand-outline-glow)"
        className="marketing-brand-outline-text select-none"
      >
        Busmora
      </text>
      {/* Crisp foreground stroke + subtle ambient fill */}
      <text
        x="600"
        y="190"
        textAnchor="middle"
        textLength="1160"
        lengthAdjust="spacingAndGlyphs"
        stroke="url(#brand-outline-grad)"
        strokeWidth="2.2"
        fill="rgba(120, 85, 255, 0.05)"
        className="marketing-brand-outline-text select-none"
      >
        Busmora
      </text>
    </svg>
  );
}
