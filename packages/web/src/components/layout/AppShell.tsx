import { type ReactNode, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { Header } from './Header';
import { MobileBottomNav } from './MobileBottomNav';
import { useMobile } from '../../hooks/useMobile';

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const isMobile = useMobile();
  const location = useLocation();
  const isReaderRoute = location.pathname.startsWith('/read/');

  // When the skip link targets #main-content, focus lands on the <main> element
  // (tabIndex={-1}). Pressing Tab from there should move to the first focusable
  // child inside <main>, but some browsers struggle with this. We help by
  // explicitly moving focus forward on the first Tab keypress.
  const handleMainKeyDown = useCallback((e: React.KeyboardEvent<HTMLElement>) => {
    if (e.key === 'Tab' && !e.shiftKey && e.currentTarget === e.target) {
      const firstFocusable = e.currentTarget.querySelector<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (firstFocusable) {
        e.preventDefault();
        firstFocusable.focus();
      }
    }
  }, []);

  return (
    <div className="h-screen bg-bg-deep flex flex-col overflow-hidden">
      {/* Skip link for keyboard navigation */}
      <a
        href="#main-content"
        className="skip-link"
      >
        Skip to main content
      </a>

      {!isReaderRoute && <Header />}
      <main
        id="main-content"
        role="main"
        className={`flex-1 min-h-0 overflow-auto scroll-smooth ${isMobile ? 'pb-16' : ''}`}
        tabIndex={-1}
        onKeyDown={handleMainKeyDown}
      >
        {children}
      </main>

      {/* Mobile bottom navigation */}
      {isMobile && <MobileBottomNav />}
    </div>
  );
}
