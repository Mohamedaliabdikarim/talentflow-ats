/** TalentFlow wordmark: gradient tile with a forward arrow, the "move talent forward" idea. */
export function LogoMark({
  id = "tf-mark",
  className = "size-6",
}: {
  id?: string;
  className?: string;
}) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#6d8cff" />
          <stop offset="1" stopColor="#8b5cf6" />
        </linearGradient>
      </defs>
      <rect width="24" height="24" rx="6" fill={`url(#${id})`} />
      <path
        d="M6.5 12h8.5m0 0-3.2-3.2M15 12l-3.2 3.2"
        stroke="#070a12"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
