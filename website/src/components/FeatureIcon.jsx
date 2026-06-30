const ICONS = {
  payments: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="2" y="5" width="20" height="14" rx="3" stroke="currentColor" strokeWidth="1.8" />
      <path d="M2 10h20" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  ),
  team: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="9" cy="8" r="3" stroke="currentColor" strokeWidth="1.8" />
      <path d="M3 19c0-3.3 2.7-5 6-5s6 1.7 6 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="17" cy="9" r="2.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M14 19c.4-2.2 1.8-3.5 4-3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  ),
  calendar: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8 3v4M16 3v4M3 10h18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  ),
  news: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4 5h16v14H4z" stroke="currentColor" strokeWidth="1.8" />
      <path d="M7 9h10M7 13h7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  ),
  docs: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M8 4h8l4 4v12H8z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M16 4v4h4M10 13h6M10 17h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  ),
  qr: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="4" y="4" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.8" />
      <rect x="13" y="4" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.8" />
      <rect x="4" y="13" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.8" />
      <path d="M14 14h2v2h-2zM18 14h2v2h-2zM14 18h2v2h-2zM18 18h2v2h-2z" fill="currentColor" />
    </svg>
  ),
};

export default function FeatureIcon({ name, variant }) {
  const className = variant === 'accordion' ? 'feature-icon feature-icon--accordion' : 'feature-icon';
  return <span className={className}>{ICONS[name] || ICONS.news}</span>;
}
