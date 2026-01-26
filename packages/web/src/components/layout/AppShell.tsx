import { type ReactNode } from 'react';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { MobileBottomNav } from './MobileBottomNav';
import { useMobile } from '../../hooks/useMobile';

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const isMobile = useMobile();

  return (
    <div className="h-screen bg-bg-deep flex overflow-hidden">
      {/* Skip link for keyboard navigation */}
      <a
        href="#main-content"
        className="skip-link"
      >
        Skip to main content
      </a>

      {/* Sidebar - hidden on mobile */}
      {!isMobile && <Sidebar />}

      <div className="flex-1 flex flex-col min-h-0 min-w-0">
        <Header />
        <main
          id="main-content"
          className={`flex-1 min-h-0 overflow-auto scroll-smooth ${isMobile ? 'pb-16' : ''}`}
          tabIndex={-1}
        >
          {children}
        </main>
      </div>

      {/* Mobile bottom navigation */}
      {isMobile && <MobileBottomNav />}
    </div>
  );
}
