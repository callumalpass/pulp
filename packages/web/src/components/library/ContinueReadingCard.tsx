import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { LiteratureNoteSummary } from '@pulp/shared';
import { useReadingStatsStore } from '../../stores/readingStats';
import { api } from '../../lib/api';

interface ContinueReadingCardProps {
  note: LiteratureNoteSummary;
}

export function ContinueReadingCard({ note }: ContinueReadingCardProps) {
  const [imageError, setImageError] = useState(false);
  const { getFormattedReadingTime } = useReadingStatsStore();
  const bookStats = note.readingStats;

  // Calculate estimated time remaining
  const getEstimatedTimeRemaining = (): string | null => {
    if (!note.totalPages || note.progress >= 100) return null;

    const pagesPerHour = bookStats?.pagesPerHour ?? 25;
    const pagesRemaining = Math.ceil(note.totalPages * ((100 - note.progress) / 100));
    const hoursRemaining = pagesRemaining / pagesPerHour;

    if (hoursRemaining < 1) {
      const mins = Math.round(hoursRemaining * 60);
      return `${mins} min`;
    } else if (hoursRemaining < 10) {
      const hours = Math.round(hoursRemaining * 10) / 10;
      return `${hours} hr`;
    } else {
      const hours = Math.round(hoursRemaining);
      return `${hours} hr`;
    }
  };

  const estimatedTime = getEstimatedTimeRemaining();

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
                  ~{estimatedTime} left
                </span>
              )}
            </div>
            <div className="w-full h-1.5 bg-bg-deep rounded-full overflow-hidden">
              <div
                className="h-full bg-accent-primary transition-all duration-300"
                style={{ width: `${note.progress}%` }}
              />
            </div>
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

function formatLastRead(isoDate: string): string {
  const date = new Date(isoDate);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'today';
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  return date.toLocaleDateString();
}
