import { useLocation } from 'react-router-dom';
import { ConnectionStatus } from '../ui/ConnectionStatus';
import { usePreferencesStore } from '../../stores/preferences';

export function Header() {
  const location = useLocation();

  const getTitle = () => {
    if (location.pathname === '/') return 'Library';
    if (location.pathname.startsWith('/read/')) return 'Reading';
    return 'Pulp';
  };

  return (
    <header className="h-14 bg-bg-surface border-b border-text-secondary/10 flex items-center px-6" role="banner">
      <h1 className="text-lg font-semibold text-text-primary">{getTitle()}</h1>

      <div className="ml-auto flex items-center gap-4">
        <ConnectionStatus />
        <ThemeToggle />
      </div>
    </header>
  );
}

function ThemeToggle() {
  const theme = usePreferencesStore((state) => state.theme);
  const setTheme = usePreferencesStore((state) => state.setTheme);

  const toggleTheme = () => {
    setTheme(theme === 'light' ? 'dark' : 'light');
  };

  const isLight = theme === 'light';

  return (
    <button
      onClick={toggleTheme}
      className="min-w-[44px] min-h-[44px] w-10 h-10 rounded-xl flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-bg-deep/80 active:scale-95 transition-all duration-150 relative overflow-hidden"
      title="Toggle theme"
      aria-label={`Switch to ${isLight ? 'dark' : 'light'} mode`}
      data-testid="theme-toggle"
    >
      {/* Sun icon */}
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        aria-hidden="true"
        className={`absolute transition-all duration-300 ease-out ${
          isLight
            ? 'opacity-0 rotate-90 scale-50'
            : 'opacity-100 rotate-0 scale-100'
        }`}
      >
        <circle cx="12" cy="12" r="5" />
        <line x1="12" y1="1" x2="12" y2="3" />
        <line x1="12" y1="21" x2="12" y2="23" />
        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
        <line x1="1" y1="12" x2="3" y2="12" />
        <line x1="21" y1="12" x2="23" y2="12" />
        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
        <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
      </svg>
      {/* Moon icon */}
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        aria-hidden="true"
        className={`absolute transition-all duration-300 ease-out ${
          isLight
            ? 'opacity-100 rotate-0 scale-100'
            : 'opacity-0 -rotate-90 scale-50'
        }`}
      >
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
      </svg>
    </button>
  );
}
