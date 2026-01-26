import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { LiteratureNoteSummary } from '@pulp/shared';
import { useReadingStatsStore } from '../../stores/readingStats';
import { api } from '../../lib/api';
import { formatLastRead, getEstimatedTimeRemaining } from '../../lib/format';
import { ProgressIndicator } from './ProgressIndicator';

interface ContinueReadingCardProps {
  note: LiteratureNoteSummary;
}

export function ContinueReadingCard({ note }: ContinueReadingCardProps) {
  const [imageError, setImageError] = useState(false);
  const { getFormattedReadingTime } = useReadingStatsStore();
  const bookStats = note.readingStats;

  const estimatedTime = getEstimatedTimeRemaining({
    totalPages: note.totalPages,
    progress: note.progress,
    pagesPerHour: bookStats?.pagesPerHour,
  });

  return (
    <Link to={`/read/${note.id}`}>
      <div className="flex gap-4 p-4 bg-bg-surface rounded-xl hover:bg-bg-surface/80 transition-colors group">
        {/* Cover thumbnail */}
        <div className="w-16 h-24 flex-shrink-0 bg-bg-deep rounded-lg overflow-hidden relative">
          {note.cover && !imageError ? (
            <img
              src={api.covers.getUrl(note.id)}
              alt={note.title}
              className="w-full h-full object-cover"
              onError={() => setImageError(true)}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-accent-primary/20 to-accent-secondary/20">
              <span className="text-2xl">{note.sourceType === 'pdf' ? '📄' : '📚'}</span>
            </div>
          )}
        </div>

        {/* Book info */}
        <div className="flex-1 min-w-0 flex flex-col justify-center">
          <h3 className="text-base font-medium text-text-primary line-clamp-1 group-hover:text-accent-primary transition-colors">
            {note.title}
          </h3>
          {note.author && (
            <p className="text-sm text-text-secondary line-clamp-1 mt-0.5">
              {note.author}
            </p>
          )}

          {/* Progress bar */}
          <div className="mt-2">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-text-secondary">
                {Math.round(note.progress)}% complete
              </span>
              {estimatedTime && (
                <span className="text-xs text-accent-primary">
                  ~{estimatedTime}
                </span>
              )}
            </div>
            <ProgressIndicator progress={note.progress} height="h-1.5" />
          </div>

          {/* Stats row */}
          <div className="flex items-center gap-3 mt-2 text-xs text-text-secondary">
            {bookStats && bookStats.totalReadingTimeMs > 0 && (
              <span className="flex items-center gap-1">
                <ClockIcon className="w-3.5 h-3.5" />
                {getFormattedReadingTime(bookStats.totalReadingTimeMs)} read
              </span>
            )}
            {note.lastRead && (
              <span>Last read {formatLastRead(note.lastRead)}</span>
            )}
          </div>
        </div>

        {/* Continue button */}
        <div className="flex items-center">
          <div className="w-10 h-10 flex items-center justify-center rounded-full bg-accent-primary text-white group-hover:bg-accent-primary/90 transition-colors">
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
    <div className="flex gap-4 p-4 bg-bg-surface rounded-xl animate-pulse">
      {/* Cover thumbnail skeleton */}
      <div className="w-16 h-24 flex-shrink-0 bg-bg-deep rounded-lg" />

      {/* Book info skeleton */}
      <div className="flex-1 min-w-0 flex flex-col justify-center">
        {/* Title skeleton */}
        <div className="h-5 w-3/4 bg-bg-deep rounded" />
        {/* Author skeleton */}
        <div className="h-4 w-1/2 bg-bg-deep rounded mt-1.5" />

        {/* Progress bar skeleton */}
        <div className="mt-2">
          <div className="flex items-center justify-between mb-1">
            <div className="h-3 w-20 bg-bg-deep rounded" />
            <div className="h-3 w-12 bg-bg-deep rounded" />
          </div>
          <div className="w-full h-1.5 bg-bg-deep rounded-full" />
        </div>

        {/* Stats row skeleton */}
        <div className="flex items-center gap-3 mt-2">
          <div className="h-3 w-16 bg-bg-deep rounded" />
          <div className="h-3 w-24 bg-bg-deep rounded" />
        </div>
      </div>

      {/* Continue button skeleton */}
      <div className="flex items-center">
        <div className="w-10 h-10 rounded-full bg-bg-deep" />
      </div>
    </div>
  );
}
