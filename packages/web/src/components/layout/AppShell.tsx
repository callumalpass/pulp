import { type ReactNode } from 'react';
import { Header } from './Header';
import { MobileBottomNav } from './MobileBottomNav';
import { useMobile } from '../../hooks/useMobile';

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const isMobile = useMobile();

  return (
    <div className="h-screen bg-bg-deep flex flex-col overflow-hidden">
      {/* Skip link for keyboard navigation */}
      <a
        href="#main-content"
        className="skip-link"
      >
        Skip to main content
      </a>

      <Header />
      <main
        id="main-content"
        className={`flex-1 min-h-0 overflow-auto scroll-smooth ${isMobile ? 'pb-16' : ''}`}
        tabIndex={-1}
      >
        {children}
      </main>

      {/* Mobile bottom navigation */}
      {isMobile && <MobileBottomNav />}
    </div>
  );
}
