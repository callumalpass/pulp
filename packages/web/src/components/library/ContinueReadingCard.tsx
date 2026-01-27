import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import type { LiteratureNoteSummary } from '@pulp/shared';
import { useReadingStatsStore } from '../../stores/readingStats';
import { api } from '../../lib/api';
import { formatLastRead, getEstimatedTimeRemaining } from '../../lib/format';
import { ProgressIndicator } from './ProgressIndicator';

/**
 * Custom hook for animating a number from 0 to a target value.
 * Creates a smooth counting animation effect.
 */
function useAnimatedCounter(target: number, duration: number = 800): number {
  const [count, setCount] = useState(0);
  const startTimeRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    startTimeRef.current = null;

    const animate = (timestamp: number) => {
      if (startTimeRef.current === null) {
        startTimeRef.current = timestamp;
      }

      const elapsed = timestamp - startTimeRef.current;
      const progress = Math.min(elapsed / duration, 1);

      // Ease-out cubic for smooth deceleration
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(eased * target);

      setCount(current);

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      }
    };

    rafRef.current = requestAnimationFrame(animate);

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [target, duration]);

  return count;
}

interface ContinueReadingCardProps {
  note: LiteratureNoteSummary;
}

export function ContinueReadingCard({ note }: ContinueReadingCardProps) {
  const [imageError, setImageError] = useState(false);
  const { getFormattedReadingTime } = useReadingStatsStore();
  const bookStats = note.readingStats;
  const animatedProgress = useAnimatedCounter(Math.round(note.progress), 800);

  const estimatedTime = getEstimatedTimeRemaining({
    totalPages: note.totalPages,
    progress: note.progress,
    pagesPerHour: bookStats?.pagesPerHour,
  });

  return (
    <Link
      to={`/read/${note.id}`}
      aria-label={`Continue reading ${note.title}. ${Math.round(note.progress)}% complete${estimatedTime ? `, ${estimatedTime} remaining` : ''}`}
      className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg-deep rounded-2xl block"
    >
      <div className="relative flex gap-4 p-4 bg-bg-surface rounded-2xl border border-accent-primary/20 hover:border-accent-primary/40 transition-all duration-200 group overflow-hidden hover:shadow-lg hover:shadow-black/20 continue-reading-glow active:scale-[0.99] active:transition-transform active:duration-75">
        {/* Animated gradient border effect */}
        <div className="absolute -inset-[1px] bg-gradient-to-r from-accent-primary/30 via-accent-secondary/30 to-accent-primary/30 rounded-2xl opacity-50 blur-sm group-hover:opacity-80 transition-opacity animate-gradient-x" />
        <div className="absolute inset-0 bg-bg-surface rounded-2xl" />
        {/* Subtle gradient accent */}
        <div className="absolute inset-0 bg-gradient-to-r from-accent-primary/5 via-transparent to-accent-secondary/5 opacity-50 group-hover:opacity-100 transition-opacity duration-300 rounded-2xl" />

        {/* Cover thumbnail */}
        <div className="relative w-16 h-24 flex-shrink-0 bg-bg-deep rounded-xl overflow-hidden shadow-md shadow-black/20 group-hover:shadow-lg transition-shadow">
          {note.cover && !imageError ? (
            <img
              src={api.covers.getUrl(note.id)}
              alt={note.title}
              className="w-full h-full object-cover"
              onError={() => setImageError(true)}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-accent-primary/20 to-accent-secondary/20">
              {note.sourceType === 'pdf' ? (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-accent-primary">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
              ) : (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-accent-primary">
                  <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                  <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                </svg>
              )}
            </div>
          )}
        </div>

        {/* Book info */}
        <div className="relative flex-1 min-w-0 flex flex-col justify-center">
          <h3 className="text-base font-semibold text-text-primary line-clamp-2 sm:line-clamp-1 group-hover:text-accent-primary transition-colors leading-tight">
            {note.title}
          </h3>
          {note.author && (
            <p className="text-sm text-text-secondary line-clamp-1 mt-1">
              {note.author}
            </p>
          )}

          {/* Progress bar */}
          <div className="mt-3">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-medium text-text-secondary tabular-nums">
                {animatedProgress}% complete
              </span>
              {estimatedTime && (
                <span className="text-xs font-medium text-accent-secondary">
                  {estimatedTime} left
                </span>
              )}
            </div>
            <ProgressIndicator progress={note.progress} height="h-2" />
          </div>

          {/* Stats row */}
          <div className="flex items-center gap-3 mt-2.5 text-xs text-text-secondary">
            {bookStats && bookStats.totalReadingTimeMs > 0 && (
              <span className="flex items-center gap-1.5">
                <ClockIcon className="w-3.5 h-3.5" />
                {getFormattedReadingTime(bookStats.totalReadingTimeMs)} read
              </span>
            )}
            {note.lastRead && (
              <span className="opacity-70">Last read {formatLastRead(note.lastRead)}</span>
            )}
          </div>
        </div>

        {/* Continue button */}
        <div className="relative flex items-center">
          <div className="play-button-pulse w-12 h-12 flex items-center justify-center rounded-full bg-accent-primary text-bg-deep group-hover:scale-105 transition-all duration-200">
            <PlayIcon className="w-5 h-5 ml-0.5" />
          </div>
        </div>
      </div>
    </Link>
  );
}

function ClockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function PlayIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

export function ContinueReadingCardSkeleton() {
  return (
    <div className="flex gap-4 p-4 bg-bg-surface rounded-2xl border border-white/[0.05]">
      {/* Cover thumbnail skeleton */}
      <div className="w-16 h-24 flex-shrink-0 skeleton rounded-xl" />

      {/* Book info skeleton */}
      <div className="flex-1 min-w-0 flex flex-col justify-center">
        {/* Title skeleton */}
        <div className="h-5 w-3/4 skeleton rounded" />
        {/* Author skeleton */}
        <div className="h-4 w-1/2 skeleton rounded mt-2" />

        {/* Progress bar skeleton */}
        <div className="mt-3">
          <div className="flex items-center justify-between mb-1.5">
            <div className="h-3 w-20 skeleton rounded" />
            <div className="h-3 w-12 skeleton rounded" />
          </div>
          <div className="w-full h-2 skeleton rounded-full" />
        </div>

        {/* Stats row skeleton */}
        <div className="flex items-center gap-3 mt-2.5">
          <div className="h-3 w-16 skeleton rounded" />
          <div className="h-3 w-24 skeleton rounded" />
        </div>
      </div>

      {/* Continue button skeleton */}
      <div className="flex items-center">
        <div className="w-12 h-12 rounded-full skeleton" />
      </div>
    </div>
  );
}
