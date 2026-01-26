import { Link, useLocation } from 'react-router-dom';
import { clsx } from 'clsx';

const navItems = [
  { path: '/', label: 'Library', icon: LibraryIcon },
];

export function Sidebar() {
  const location = useLocation();

  return (
    <aside className="w-16 bg-bg-surface flex flex-col items-center py-4 border-r border-text-secondary/10">
      <Link to="/" className="mb-8">
        <div className="w-10 h-10 bg-accent-primary rounded-lg flex items-center justify-center">
          <span className="text-bg-deep font-bold text-lg">P</span>
        </div>
      </Link>

      <nav className="flex-1 flex flex-col gap-2">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          const Icon = item.icon;

          return (
            <Link
              key={item.path}
              to={item.path}
              className={clsx(
                'w-10 h-10 rounded-lg flex items-center justify-center transition-smooth',
                isActive
                  ? 'bg-accent-primary/20 text-accent-primary'
                  : 'text-text-secondary hover:text-text-primary hover:bg-bg-deep'
              )}
              title={item.label}
            >
              <Icon />
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}

function LibraryIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  );
}
