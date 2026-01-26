import { useEffect, useState } from 'react';
import { useReadingStatsStore } from '../../../stores/readingStats';

interface ReadingTimeIndicatorProps {
  noteId: string;
  currentPage: number;
  totalPages: number;
  onClick?: () => void;
  className?: string;
}

export function ReadingTimeIndicator({
  noteId,
  currentPage,
  totalPages,
  onClick,
  className = '',
}: ReadingTimeIndicatorProps) {
  const {
    getFormattedReadingTime,
    getActiveSessionDuration,
    getEstimatedTimeRemaining,
    activeSession,
  } = useReadingStatsStore();

  const [sessionDuration, setSessionDuration] = useState(0);

  // Update session duration every second
  useEffect(() => {
    const interval = setInterval(() => {
      setSessionDuration(getActiveSessionDuration());
    }, 1000);
    return () => clearInterval(interval);
  }, [getActiveSessionDuration]);

  const estimatedRemaining = getEstimatedTimeRemaining(noteId, currentPage, totalPages);
  const isActive = activeSession !== null && activeSession.noteId === noteId;

  if (!isActive) return null;

  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-2 py-1 rounded text-xs transition-colors hover:bg-bg-deep ${className}`}
      title="Click to view reading statistics"
      aria-label={`Reading time: ${getFormattedReadingTime(sessionDuration)}. Click for statistics.`}
    >
      {/* Timer icon */}
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        className="text-accent-primary"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>

      {/* Session time */}
      <span className="font-mono text-text-primary tabular-nums">
        {getFormattedReadingTime(sessionDuration)}
      </span>

      {/* Estimated remaining (if available) */}
      {estimatedRemaining && (
        <>
          <span className="text-text-secondary/50">|</span>
          <span className="text-text-secondary" title="Estimated time remaining">
            ~{getFormattedReadingTime(estimatedRemaining)} left
          </span>
        </>
      )}
    </button>
  );
}
