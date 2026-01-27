import { useState, useCallback, useRef, useEffect, memo } from 'react';
import { Link } from 'react-router-dom';
import type { LiteratureNoteSummary } from '@pulp/shared';
import { Card } from '../ui/Card';
import { ProgressIndicator } from './ProgressIndicator';
import { usePinned } from '../../hooks/usePinned';
import { useRating } from '../../hooks/useRating';
import { useReadingStatsStore } from '../../stores/readingStats';
import { useMetadataPane } from '../../contexts/MetadataPaneContext';
import { api } from '../../lib/api';
import { formatLastRead, getEstimatedTimeRemaining, formatEstimatedCompletion } from '../../lib/format';

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
  const { openPane } = useMetadataPane();
  const ratingMenuRef = useRef<HTMLDivElement>(null);
  const ratingButtonRef = useRef<HTMLButtonElement>(null);
  const cardRef = useRef<HTMLAnchorElement>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
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

  const handleInfoClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    openPane(note.id);
  }, [note.id, openPane]);

  // Long-press handlers for mobile
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    longPressTimer.current = setTimeout(() => {
      e.preventDefault();
      openPane(note.id);
    }, 500);
  }, [note.id, openPane]);

  const handleTouchEnd = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const handleTouchMove = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  // Keyboard handler for 'i' key when focused
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'i' || e.key === 'I') {
      e.preventDefault();
      openPane(note.id);
    }
  }, [note.id, openPane]);

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

  const estimatedCompletion = formatEstimatedCompletion(bookStats?.estimatedCompletionDate ?? null);

  // Build accessible label for screen readers
  const accessibleLabel = [
    note.title,
    note.author && `by ${note.author}`,
    note.progress === 100 ? 'completed' : note.progress > 0 ? `${Math.round(note.progress)}% complete` : 'unread',
    note.rating && `rated ${note.rating} out of 5 stars`,
    estimatedTime && `${estimatedTime} remaining`,
  ].filter(Boolean).join(', ');

  return (
    <Link
      ref={cardRef}
      to={`/read/${note.id}`}
      className="group block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg-deep rounded-xl"
      aria-label={accessibleLabel}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchMove={handleTouchMove}
      onKeyDown={handleKeyDown}
    >
      <Card hover className="library-card flex flex-col relative active:scale-[0.98]">
        <div className="aspect-[2/3] bg-bg-deep relative overflow-hidden rounded-t-xl">
          {note.cover && !imageError ? (
            <img
              src={api.covers.getUrl(note.id)}
              alt={note.title}
              className="w-full h-full object-cover"
              loading="lazy"
              decoding="async"
              onError={() => setImageError(true)}
            />
          ) : (
            <DefaultCover title={note.title} type={note.sourceType} />
          )}

          {/* Top-left action: Info button */}
          <button
            onClick={handleInfoClick}
            type="button"
            aria-label="Show metadata"
            className="absolute top-1 left-1 w-9 h-9 flex items-center justify-center rounded-full bg-bg-surface/90 backdrop-blur-sm transition-all duration-200 focus-visible:ring-2 focus-visible:ring-accent-primary/60 hover:bg-bg-surface active:scale-90 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
            title="Show metadata (i)"
          >
            <InfoIcon />
          </button>

          {/* Top-right actions: Pin button */}
          <button
            onClick={handlePinClick}
            type="button"
            aria-label={note.pinned ? 'Unpin' : 'Pin'}
            aria-pressed={note.pinned}
            className={`absolute top-1 right-1 w-9 h-9 flex items-center justify-center rounded-full bg-bg-surface/90 backdrop-blur-sm transition-all duration-200 focus-visible:ring-2 focus-visible:ring-accent-primary/60 hover:bg-bg-surface active:scale-90 ${
              note.pinned ? 'opacity-100 shadow-md' : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'
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
            <div
              className="absolute top-2 left-2 px-1.5 py-0.5 rounded bg-bg-surface/80 backdrop-blur-sm text-xs text-text-primary md:opacity-0 md:group-hover:opacity-100 transition-opacity"
              title={estimatedCompletion ? `Est. finish: ${estimatedCompletion}` : 'Time remaining'}
            >
              {estimatedTime}
              {estimatedCompletion && <span className="text-text-secondary ml-1">({estimatedCompletion})</span>}
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
          {/* Show current chapter for in-progress books */}
          {note.currentChapter && note.progress > 0 && note.progress < 100 && (
            <p className="text-xs text-text-secondary/70 line-clamp-1 mt-0.5 italic">
              {note.currentChapter}
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
              type="button"
              className={`flex items-center gap-0.5 text-xs hover:bg-bg-deep rounded px-1 py-0.5 -mx-1 -my-0.5 transition-colors focus-visible:ring-2 focus-visible:ring-accent-primary/60 ${isRatingPending ? 'opacity-50' : ''}`}
              title={note.rating ? `Rating: ${note.rating}/5` : 'Add rating'}
              aria-label={note.rating ? `Rating: ${note.rating} out of 5 stars. Press to change.` : 'Add rating'}
              aria-haspopup="true"
              aria-expanded={showRatingMenu}
              disabled={isRatingPending}
            >
              {note.rating ? (
                <StarRating rating={note.rating} size={10} />
              ) : (
                <span className="text-text-secondary opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
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
            className="absolute top-full left-0 right-0 mt-1 z-50 bg-bg-surface border border-text-secondary/20 rounded-lg shadow-lg p-2 rating-menu-enter"
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
                  className={`p-1.5 rounded transition-all duration-150 rating-star-btn ${
                    focusedStar === star
                      ? 'ring-2 ring-accent-primary bg-bg-deep scale-110'
                      : 'hover:bg-bg-deep hover:scale-110'
                  } ${isRatingPending ? 'opacity-50 cursor-not-allowed' : ''}`}
                  title={`Rate ${star} star${star > 1 ? 's' : ''}`}
                  aria-label={`${star} star${star > 1 ? 's' : ''}`}
                  aria-checked={note.rating === star}
                  role="radio"
                  tabIndex={focusedStar === star ? 0 : -1}
                  disabled={isRatingPending}
                >
                  <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill={note.rating && star <= note.rating ? 'currentColor' : (focusedStar && star <= focusedStar ? 'currentColor' : 'none')}
                    stroke="currentColor"
                    strokeWidth="2"
                    className={`transition-all duration-150 ${
                      note.rating && star <= note.rating
                        ? 'text-yellow-500 drop-shadow-[0_0_3px_rgba(234,179,8,0.5)]'
                        : focusedStar && star <= focusedStar
                          ? 'text-yellow-500/60'
                          : 'text-text-secondary/50'
                    }`}
                  >
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                  </svg>
                </button>
              ))}
            </div>
            {note.rating && (
              <button
                onClick={(e) => handleSetRating(e, null)}
                type="button"
                className={`w-full text-xs text-text-secondary hover:text-text-primary hover:bg-bg-deep rounded px-2 py-1.5 transition-colors ${isRatingPending ? 'opacity-50 cursor-not-allowed' : ''}`}
                disabled={isRatingPending}
              >
                Remove rating
              </button>
            )}
            <p className="text-xs text-text-secondary/60 text-center mt-1.5">
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

function InfoIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-text-secondary"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  );
}

function DefaultCover({ title, type }: { title: string; type: 'pdf' | 'epub' }) {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center p-4 bg-gradient-to-br from-accent-primary/20 via-bg-deep to-accent-secondary/10 relative overflow-hidden">
      {/* Decorative pattern */}
      <div className="absolute inset-0 opacity-[0.03]" style={{
        backgroundImage: `radial-gradient(circle at 2px 2px, currentColor 1px, transparent 0)`,
        backgroundSize: '16px 16px'
      }} />

      <div className="relative p-4 rounded-2xl bg-bg-surface/70 backdrop-blur-sm mb-3 shadow-lg shadow-black/10 border border-white/[0.05] group-hover:shadow-xl group-hover:scale-105 transition-all duration-200">
        {type === 'pdf' ? (
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-accent-primary">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
            <line x1="10" y1="9" x2="8" y2="9" />
          </svg>
        ) : (
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-accent-primary">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
            <line x1="8" y1="6" x2="16" y2="6" />
            <line x1="8" y1="10" x2="14" y2="10" />
          </svg>
        )}
      </div>
      <p className="relative text-xs text-center text-text-primary/90 line-clamp-3 font-medium leading-snug px-2">{title}</p>
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
