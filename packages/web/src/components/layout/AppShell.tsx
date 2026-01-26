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
      {/* Sidebar - hidden on mobile */}
      {!isMobile && <Sidebar />}

      <div className="flex-1 flex flex-col min-h-0">
        <Header />
        <main className={`flex-1 min-h-0 overflow-auto ${isMobile ? 'pb-16' : ''}`}>
          {children}
        </main>
      </div>

      {/* Mobile bottom navigation */}
      {isMobile && <MobileBottomNav />}
    </div>
  );
}
