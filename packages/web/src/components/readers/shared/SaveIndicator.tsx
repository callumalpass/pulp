import { useEffect, useRef, useState } from 'react';
import type { SaveStatus } from '../../../hooks/useProgress';

interface SaveIndicatorProps {
  status: SaveStatus;
  className?: string;
}

/**
 * Renders the icon + label for a given save status.
 * Each state is wrapped so the parent can crossfade between them.
 */
function SaveStateContent({ status }: { status: Exclude<SaveStatus, 'idle'> }) {
  switch (status) {
    case 'pending':
      return (
        <>
          <div className="w-1.5 h-1.5 rounded-full bg-text-secondary/50" />
          <span className="text-text-secondary">Unsaved</span>
        </>
      );
    case 'saving':
      return (
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
      );
    case 'saved':
      return (
        <>
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            className="text-green-500"
          >
            <path
              d="M20 6L9 17l-5-5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="save-indicator-checkmark"
            />
          </svg>
          <span className="text-green-500">Saved</span>
        </>
      );
    case 'error':
      return (
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
      );
  }
}

export function SaveIndicator({ status, className = '' }: SaveIndicatorProps) {
  // Track previous non-idle status for crossfade
  const [displayedStatus, setDisplayedStatus] = useState<Exclude<SaveStatus, 'idle'> | null>(
    status === 'idle' ? null : status
  );
  const [isEntering, setIsEntering] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    if (status === 'idle') {
      // Fade out, then unmount
      setIsEntering(false);
      timeoutRef.current = setTimeout(() => {
        setDisplayedStatus(null);
      }, 200);
    } else {
      // Swap content and trigger fade-in
      setIsEntering(false);
      // Use rAF to ensure the opacity-0 frame renders before transitioning in
      requestAnimationFrame(() => {
        setDisplayedStatus(status);
        requestAnimationFrame(() => {
          setIsEntering(true);
        });
      });
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [status]);

  if (!displayedStatus) {
    return null;
  }

  return (
    <div
      className={`flex items-center gap-1.5 text-xs transition-opacity duration-200 ease-out ${
        isEntering ? 'opacity-100' : 'opacity-0'
      } ${className}`}
      role="status"
      aria-live="polite"
    >
      <SaveStateContent status={displayedStatus} />
    </div>
  );
}
