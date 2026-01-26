import { Link, useLocation } from 'react-router-dom';

export function MobileBottomNav() {
  const location = useLocation();

  // Don't show bottom nav on reader pages
  if (location.pathname.startsWith('/read/')) {
    return null;
  }

  const isActive = (path: string) => location.pathname === path;

  return (
    <nav
      className="mobile-bottom-nav pb-safe"
      data-testid="mobile-bottom-nav"
      aria-label="Mobile navigation"
    >
      <Link
        to="/"
        className={`touch-target flex flex-col items-center justify-center gap-1 px-6 ${
          isActive('/') ? 'text-accent-primary' : 'text-text-secondary'
        }`}
        aria-current={isActive('/') ? 'page' : undefined}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
        </svg>
        <span className="text-xs font-medium">Library</span>
      </Link>
    </nav>
  );
}
