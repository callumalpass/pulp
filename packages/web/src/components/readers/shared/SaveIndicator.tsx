import type { SaveStatus } from '../../../hooks/useProgress';

interface SaveIndicatorProps {
  status: SaveStatus;
  className?: string;
}

export function SaveIndicator({ status, className = '' }: SaveIndicatorProps) {
  if (status === 'idle') {
    return null;
  }

  return (
    <div
      className={`flex items-center gap-1.5 text-xs ${className}`}
      role="status"
      aria-live="polite"
    >
      {status === 'pending' && (
        <>
          <div className="w-1.5 h-1.5 rounded-full bg-text-secondary/50" />
          <span className="text-text-secondary">Unsaved</span>
        </>
      )}
      {status === 'saving' && (
        <>
          <div className="w-3 h-3">
            <svg className="animate-spin" viewBox="0 0 24 24" fill="none">
              <circle
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="2"
                strokeOpacity="0.25"
                className="text-text-secondary"
              />
              <path
                d="M12 2a10 10 0 0 1 10 10"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                className="text-accent-primary"
              />
            </svg>
          </div>
          <span className="text-text-secondary">Saving...</span>
        </>
      )}
      {status === 'saved' && (
        <>
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="text-green-500"
          >
            <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="text-green-500">Saved</span>
        </>
      )}
      {status === 'error' && (
        <>
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="text-red-400"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M12 8v4M12 16h.01" />
          </svg>
          <span className="text-red-400">Save failed</span>
        </>
      )}
    </div>
  );
}
