import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { LiteratureNoteSummary } from '@pulp/shared';
import { Card } from '../ui/Card';
import { ProgressIndicator } from './ProgressIndicator';
import { usePinned } from '../../hooks/usePinned';
import { useRating } from '../../hooks/useRating';
import { useReadingStatsStore } from '../../stores/readingStats';
import { api } from '../../lib/api';

interface BookCardProps {
  note: LiteratureNoteSummary;
}

export function BookCard({ note }: BookCardProps) {
  const [imageError, setImageError] = useState(false);
  const [showRatingMenu, setShowRatingMenu] = useState(false);
  const { togglePin } = usePinned();
  const { setRating } = useRating();
  const { getFormattedReadingTime } = useReadingStatsStore();
  // Use stats from note data (from API)
  const bookStats = note.readingStats;

  const handlePinClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    togglePin(note.id, note.pinned);
  };

  const handleRatingClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setShowRatingMenu(!showRatingMenu);
  };

  const handleSetRating = (e: React.MouseEvent, rating: number | null) => {
    e.preventDefault();
    e.stopPropagation();
    setRating(note.id, rating);
    setShowRatingMenu(false);
  };

  // Calculate estimated time remaining based on reading speed and progress
  const getEstimatedTimeRemaining = (): string | null => {
    if (!note.totalPages || note.progress >= 100) return null;

    // Default reading speed if we don't have user's speed
    const pagesPerHour = bookStats?.pagesPerHour ?? 25;
    const pagesRemaining = Math.ceil(note.totalPages * ((100 - note.progress) / 100));
    const hoursRemaining = pagesRemaining / pagesPerHour;

    if (hoursRemaining < 1) {
      const mins = Math.round(hoursRemaining * 60);
      return `${mins}m left`;
    } else if (hoursRemaining < 10) {
      const hours = Math.round(hoursRemaining * 10) / 10;
      return `${hours}h left`;
    } else {
      const hours = Math.round(hoursRemaining);
      return `${hours}h left`;
    }
  };

  const estimatedTime = getEstimatedTimeRemaining();

  return (
    <Link to={`/read/${note.id}`}>
      <Card hover className="flex flex-col group relative">
        <div className="aspect-[2/3] bg-bg-deep relative overflow-hidden">
          {note.cover && !imageError ? (
            <img
              src={api.covers.getUrl(note.id)}
              alt={note.title}
              className="w-full h-full object-cover"
              loading="lazy"
              onError={() => setImageError(true)}
            />
          ) : (
            <DefaultCover title={note.title} type={note.sourceType} />
          )}

          {/* Top-right actions: Pin button */}
          <button
            onClick={handlePinClick}
            className={`absolute top-2 right-2 p-1.5 rounded-full bg-bg-surface/80 backdrop-blur-sm transition-opacity ${
              note.pinned ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
            }`}
            title={note.pinned ? 'Unpin' : 'Pin'}
          >
            <PinIcon filled={note.pinned} />
          </button>

          {/* Estimated time remaining badge - visible on mobile, hover-only on desktop */}
          {estimatedTime && (
            <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded bg-bg-surface/80 backdrop-blur-sm text-xs text-text-primary md:opacity-0 md:group-hover:opacity-100 transition-opacity">
              {estimatedTime}
            </div>
          )}

          {/* Pages badge for unread books - always visible */}
          {note.progress === 0 && note.totalPages && (
            <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded bg-bg-surface/80 backdrop-blur-sm text-xs text-text-secondary md:opacity-0 md:group-hover:opacity-100 transition-opacity">
              {note.totalPages} pages
            </div>
          )}

          {note.progress > 0 && (
            <div className="absolute bottom-0 left-0 right-0">
              <ProgressIndicator progress={note.progress} />
            </div>
          )}
        </div>

        <div className="p-3 flex-1 flex flex-col">
          <h3 className="text-sm font-medium text-text-primary line-clamp-2 leading-tight">
            {note.title}
          </h3>
          {note.author && (
            <p className="text-xs text-text-secondary line-clamp-1 mt-0.5">
              {note.author}
            </p>
          )}
          <div className="flex items-center gap-2 mt-auto pt-1.5 flex-wrap">
            <span className="text-xs text-text-secondary uppercase">
              {note.sourceType}
            </span>
            {/* Rating display */}
            <button
              onClick={handleRatingClick}
              className="flex items-center gap-0.5 text-xs hover:bg-bg-deep rounded px-1 py-0.5 -mx-1 -my-0.5 transition-colors"
              title={note.rating ? `Rating: ${note.rating}/5` : 'Add rating'}
            >
              {note.rating ? (
                <StarRating rating={note.rating} size={10} />
              ) : (
                <span className="text-text-secondary opacity-0 group-hover:opacity-100 transition-opacity">
                  Rate
                </span>
              )}
            </button>
            {bookStats && bookStats.totalReadingTimeMs > 0 && (
              <span className="text-xs text-accent-primary flex items-center gap-1" title="Total reading time">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
                {getFormattedReadingTime(bookStats.totalReadingTimeMs)}
              </span>
            )}
            {note.lastRead && (
              <span className="text-xs text-text-secondary">
                {formatLastRead(note.lastRead)}
              </span>
            )}
          </div>
        </div>

        {/* Rating dropdown menu */}
        {showRatingMenu && (
          <div
            className="absolute top-full left-0 right-0 mt-1 z-50 bg-bg-surface border border-text-secondary/20 rounded-lg shadow-lg p-2"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-center gap-1 mb-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  onClick={(e) => handleSetRating(e, star)}
                  className="p-1 hover:bg-bg-deep rounded transition-colors"
                  title={`Rate ${star} stars`}
                >
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill={note.rating && star <= note.rating ? 'currentColor' : 'none'}
                    stroke="currentColor"
                    strokeWidth="2"
                    className={note.rating && star <= note.rating ? 'text-yellow-500' : 'text-text-secondary'}
                  >
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                  </svg>
                </button>
              ))}
            </div>
            {note.rating && (
              <button
                onClick={(e) => handleSetRating(e, null)}
                className="w-full text-xs text-text-secondary hover:text-text-primary hover:bg-bg-deep rounded px-2 py-1 transition-colors"
              >
                Remove rating
              </button>
            )}
          </div>
        )}
      </Card>
    </Link>
  );
}

function PinIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={filled ? 'text-accent-primary' : 'text-text-secondary'}
    >
      <line x1="12" y1="17" x2="12" y2="22" />
      <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z" />
    </svg>
  );
}

function DefaultCover({ title, type }: { title: string; type: 'pdf' | 'epub' }) {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center p-4 bg-gradient-to-br from-accent-primary/20 to-accent-secondary/20">
      <div className="text-4xl mb-2">{type === 'pdf' ? '📄' : '📚'}</div>
      <p className="text-xs text-center text-text-secondary line-clamp-3">{title}</p>
    </div>
  );
}

function formatLastRead(isoDate: string): string {
  const date = new Date(isoDate);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return date.toLocaleDateString();
}

function StarRating({ rating, size = 12 }: { rating: number; size?: number }) {
  return (
    <div className="flex items-center gap-px">
      {[1, 2, 3, 4, 5].map((star) => (
        <svg
          key={star}
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill={star <= rating ? 'currentColor' : 'none'}
          stroke="currentColor"
          strokeWidth="2"
          className={star <= rating ? 'text-yellow-500' : 'text-text-secondary/30'}
        >
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
      ))}
    </div>
  );
}
