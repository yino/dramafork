export function BrandLogo() {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9 }}>
      <svg width="26" height="26" viewBox="0 0 28 28" fill="none" aria-hidden="true">
        <defs>
          <linearGradient id="df-logo-grad" x1="2" y1="2" x2="26" y2="26" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#ff6b9d" />
            <stop offset="50%" stopColor="#c06bff" />
            <stop offset="100%" stopColor="#ffb86c" />
          </linearGradient>
        </defs>
        <path
          d="M4 7.5C4 5.8 5.4 4.5 7 4.5H10.5C12.8 4.5 14 6.2 14 8.5V19.5C14 21.8 12.8 23.5 10.5 23.5H7C5.4 23.5 4 22.2 4 20.5V7.5Z"
          stroke="url(#df-logo-grad)"
          strokeWidth="2.3"
        />
        <path
          d="M14 14H19.5M19.5 14L24 8.5M19.5 14L24 19.5"
          stroke="url(#df-logo-grad)"
          strokeWidth="2.3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="24" cy="8.5" r="2" fill="#ffb86c" />
        <circle cx="24" cy="19.5" r="2" fill="#c06bff" />
      </svg>
      <span className="df-brand-wordmark">DramaFork</span>
    </span>
  );
}
