import { useState, useCallback, useRef, useEffect, memo } from 'react';
import { Link } from 'react-router-dom';
import type { LiteratureNoteSummary } from '@pulp/shared';
import { Card } from '../ui/Card';
import { ProgressIndicator } from './ProgressIndicator';
import { usePinned } from '../../hooks/usePinned';
import { useRating } from '../../hooks/useRating';
import { useReadingStatsStore } from '../../stores/readingStats';
import { api } from '../../lib/api';
import { formatLastRead, getEstimatedTimeRemaining } from '../../lib/format';

interface BookCardProps {
  note: LiteratureNoteSummary;
}

export const BookCard = memo(function BookCard({ note }: BookCardProps) {
  const [imageError, setImageError] = useState(false);
  const [showRatingMenu, setShowRatingMenu] = useState(false);
  const [focusedStar, setFocusedStar] = useState<number | null>(null);
  const { togglePin, isPending: isPinPending } = usePinned();
  const { setRating, isPending: isRatingPending } = useRating();
  const { getFormattedReadingTime } = useReadingStatsStore();
  const ratingMenuRef = useRef<HTMLDivElement>(null);
  const ratingButtonRef = useRef<HTMLButtonElement>(null);
  // Use stats from note data (from API)
  const bookStats = note.readingStats;

  // Close rating menu when clicking outside
  useEffect(() => {
    if (!showRatingMenu) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (ratingMenuRef.current && !ratingMenuRef.current.contains(e.target as Node) &&
          ratingButtonRef.current && !ratingButtonRef.current.contains(e.target as Node)) {
        setShowRatingMenu(false);
        setFocusedStar(null);
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowRatingMenu(false);
        setFocusedStar(null);
        ratingButtonRef.current?.focus();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [showRatingMenu]);

  const handlePinClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isPinPending) {
      togglePin(note.id, note.pinned);
    }
  }, [note.id, note.pinned, togglePin, isPinPending]);

  const handleRatingClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setShowRatingMenu(prev => !prev);
    setFocusedStar(note.rating || 1);
  }, [note.rating]);

  const handleSetRating = useCallback((e: React.MouseEvent | React.KeyboardEvent, rating: number | null) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isRatingPending) {
      setRating(note.id, rating);
      setShowRatingMenu(false);
      setFocusedStar(null);
      ratingButtonRef.current?.focus();
    }
  }, [note.id, setRating, isRatingPending]);

  const handleRatingKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!showRatingMenu) return;

    const currentFocus = focusedStar || 1;

    switch (e.key) {
      case 'ArrowLeft':
        e.preventDefault();
        setFocusedStar(Math.max(1, currentFocus - 1));
        break;
      case 'ArrowRight':
        e.preventDefault();
        setFocusedStar(Math.min(5, currentFocus + 1));
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (focusedStar) {
          handleSetRating(e, focusedStar);
        }
        break;
      case 'Delete':
      case 'Backspace':
        e.preventDefault();
        if (note.rating) {
          handleSetRating(e, null);
        }
        break;
    }
  }, [showRatingMenu, focusedStar, note.rating, handleSetRating]);

  const estimatedTime = getEstimatedTimeRemaining({
    totalPages: note.totalPages,
    progress: note.progress,
    pagesPerHour: bookStats?.pagesPerHour,
  });

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

          {/* Completed badge */}
          {note.progress === 100 && note.dateFinished && (
            <div
              className="absolute bottom-2 right-2 p-1 rounded-full bg-green-600/90 backdrop-blur-sm"
              title={`Completed ${formatDateFinished(note.dateFinished)}`}
            >
              <CheckIcon />
            </div>
          )}

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
              ref={ratingButtonRef}
              onClick={handleRatingClick}
              onKeyDown={handleRatingKeyDown}
              className={`flex items-center gap-0.5 text-xs hover:bg-bg-deep rounded px-1 py-0.5 -mx-1 -my-0.5 transition-colors ${isRatingPending ? 'opacity-50' : ''}`}
              title={note.rating ? `Rating: ${note.rating}/5` : 'Add rating'}
              aria-label={note.rating ? `Rating: ${note.rating} out of 5 stars. Press to change.` : 'Add rating'}
              aria-haspopup="true"
              aria-expanded={showRatingMenu}
              disabled={isRatingPending}
            >
              {note.rating ? (
                <StarRating rating={note.rating} size={10} />
              ) : (
                <span className="text-text-secondary opacity-0 group-hover:opacity-100 transition-opacity">
                  Rate
                </span>
              )}
            </button>
            {note.highlightCount > 0 && (
              <span className="text-xs text-text-secondary flex items-center gap-1" title={`${note.highlightCount} highlight${note.highlightCount !== 1 ? 's' : ''}`}>
                <HighlightIcon />
                {note.highlightCount}
              </span>
            )}
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
            ref={ratingMenuRef}
            className="absolute top-full left-0 right-0 mt-1 z-50 bg-bg-surface border border-text-secondary/20 rounded-lg shadow-lg p-2"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={handleRatingKeyDown}
            role="radiogroup"
            aria-label="Select rating"
          >
            <div className="flex items-center justify-center gap-1 mb-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  onClick={(e) => handleSetRating(e, star)}
                  className={`p-1 rounded transition-colors ${
                    focusedStar === star
                      ? 'ring-2 ring-accent-primary bg-bg-deep'
                      : 'hover:bg-bg-deep'
                  } ${isRatingPending ? 'opacity-50 cursor-not-allowed' : ''}`}
                  title={`Rate ${star} star${star > 1 ? 's' : ''}`}
                  aria-label={`${star} star${star > 1 ? 's' : ''}`}
                  aria-checked={note.rating === star}
                  role="radio"
                  tabIndex={focusedStar === star ? 0 : -1}
                  disabled={isRatingPending}
                >
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill={note.rating && star <= note.rating ? 'currentColor' : (focusedStar && star <= focusedStar ? 'currentColor' : 'none')}
                    stroke="currentColor"
                    strokeWidth="2"
                    className={
                      note.rating && star <= note.rating
                        ? 'text-yellow-500'
                        : focusedStar && star <= focusedStar
                          ? 'text-yellow-500/50'
                          : 'text-text-secondary'
                    }
                  >
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                  </svg>
                </button>
              ))}
            </div>
            {note.rating && (
              <button
                onClick={(e) => handleSetRating(e, null)}
                className={`w-full text-xs text-text-secondary hover:text-text-primary hover:bg-bg-deep rounded px-2 py-1 transition-colors ${isRatingPending ? 'opacity-50 cursor-not-allowed' : ''}`}
                disabled={isRatingPending}
              >
                Remove rating
              </button>
            )}
            <p className="text-xs text-text-secondary/60 text-center mt-1">
              Use arrow keys to select
            </p>
          </div>
        )}
      </Card>
    </Link>
  );
});

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

function HighlightIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function formatDateFinished(isoDate: string): string {
  const date = new Date(isoDate);
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}
