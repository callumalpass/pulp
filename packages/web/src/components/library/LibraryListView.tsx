import { useMemo, useState, memo, useRef, useCallback, useEffect } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Link } from 'react-router-dom';
import type { LiteratureNoteSummary } from '@pulp/shared';
import { ProgressIndicator } from './ProgressIndicator';
import { api } from '../../lib/api';
import { formatLastRead } from '../../lib/format';
import { usePerformanceMode } from '../../hooks/usePerformanceMode';
import { usePinned } from '../../hooks/usePinned';
import { useMetadataPane } from '../../contexts/MetadataPaneContext';

interface LibraryListViewProps {
  notes: LiteratureNoteSummary[];
}

function getStaggerClass(index: number): string {
  if (index >= 12) return '';
  return `card-enter card-stagger-${index + 1}`;
}

const DEFAULT_VIRTUALIZATION_THRESHOLD = 80;
const LOW_END_VIRTUALIZATION_THRESHOLD = 40;
const LIST_ROW_GAP_PX = 4;
const MOBILE_ROW_ESTIMATE_PX = 96;
const DESKTOP_ROW_ESTIMATE_PX = 80;

const SimpleList = memo(function SimpleList({
  notes,
  listOffset,
  label,
}: {
  notes: LiteratureNoteSummary[];
  listOffset: number;
  label: string;
}) {
  return (
    <div className="space-y-1" role="list" aria-label={label}>
      {notes.map((note, index) => (
        <div key={note.id} className={getStaggerClass(listOffset + index)}>
          <ListRow note={note} />
        </div>
      ))}
    </div>
  );
});

const VirtualizedList = memo(function VirtualizedList({
  notes,
  listOffset,
  label,
}: {
  notes: LiteratureNoteSummary[];
  listOffset: number;
  label: string;
}) {
  const { isLowEnd } = usePerformanceMode();
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollMargin, setScrollMargin] = useState(0);

  // Match the library grid virtualizer and use the main app scroll container.
  const scrollRef = useRef<HTMLElement | null>(
    typeof document !== 'undefined' ? document.getElementById('main-content') : null,
  );

  const updateScrollMargin = useCallback(() => {
    const scrollElement = scrollRef.current;
    const containerElement = containerRef.current;
    if (!scrollElement || !containerElement) return;

    const scrollRect = scrollElement.getBoundingClientRect();
    const containerRect = containerElement.getBoundingClientRect();
    // Convert list container top to scroll-content coordinates.
    const nextMargin = containerRect.top - scrollRect.top + scrollElement.scrollTop;
    setScrollMargin(nextMargin);
  }, []);

  useEffect(() => {
    updateScrollMargin();

    const scrollElement = scrollRef.current;
    const containerElement = containerRef.current;
    if (!scrollElement || !containerElement) return;

    const observer = new ResizeObserver(updateScrollMargin);
    observer.observe(scrollElement);
    observer.observe(containerElement);
    window.addEventListener('resize', updateScrollMargin);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateScrollMargin);
    };
  }, [notes.length, updateScrollMargin]);

  const estimateSize = useCallback(() => {
    const width = containerRef.current?.clientWidth ?? (typeof window !== 'undefined' ? window.innerWidth : 1024);
    const rowHeight = width < 640 ? MOBILE_ROW_ESTIMATE_PX : DESKTOP_ROW_ESTIMATE_PX;
    return rowHeight + LIST_ROW_GAP_PX;
  }, []);

  const virtualizer = useVirtualizer({
    count: notes.length,
    getScrollElement: () => scrollRef.current,
    estimateSize,
    overscan: isLowEnd ? 4 : 8,
    scrollMargin,
  });

  return (
    <div ref={containerRef} role="list" aria-label={label}>
      <div
        style={{
          height: virtualizer.getTotalSize(),
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const note = notes[virtualRow.index];
          if (!note) return null;

          return (
            <div
              key={virtualRow.key}
              data-index={virtualRow.index}
              ref={virtualizer.measureElement}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualRow.start - scrollMargin}px)`,
              }}
            >
              <div className={`pb-1 ${getStaggerClass(listOffset + virtualRow.index)}`}>
                <ListRow note={note} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
});

export const LibraryListView = memo(function LibraryListView({ notes }: LibraryListViewProps) {
  const { isLowEnd } = usePerformanceMode();
  const { pinned, unpinned } = useMemo(() => {
    const pinned: LiteratureNoteSummary[] = [];
    const unpinned: LiteratureNoteSummary[] = [];
    for (const note of notes) {
      if (note.pinned) {
        pinned.push(note);
      } else {
        unpinned.push(note);
      }
    }
    return { pinned, unpinned };
  }, [notes]);

  if (notes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-text-secondary">
        <BookIcon className="w-16 h-16 mb-4 opacity-50" />
        <p className="text-lg">No literature notes found</p>
        <p className="text-sm mt-1">Add notes with the literature-note tag to your vault</p>
      </div>
    );
  }

  const virtualizationThreshold = isLowEnd ? LOW_END_VIRTUALIZATION_THRESHOLD : DEFAULT_VIRTUALIZATION_THRESHOLD;
  const shouldVirtualizePinned = pinned.length >= virtualizationThreshold;
  const shouldVirtualizeUnpinned = unpinned.length >= virtualizationThreshold;

  return (
    <div
      className="space-y-4"
      data-testid="library-list-view"
      aria-label="Library books"
    >
      {/* Column headers (desktop only) */}
      <div
        className="library-list-header hidden lg:flex items-center gap-3 px-2 py-2 text-xs text-text-secondary uppercase tracking-wider font-semibold border-b border-subtle bg-bg-deep rounded-lg mb-2"
        role="row"
        aria-hidden="true"
      >
        <div className="w-11 flex-shrink-0" /> {/* Cover spacer */}
        <div className="flex-1">Title</div>
        <div className="w-36">Author</div>
        <div className="w-14 text-center">Year</div>
        <div className="w-16 text-center">Type</div>
        <div className="w-16 text-right">Progress</div>
        <div className="w-20 text-center">Rating</div>
        <div className="w-20 text-right">Last Read</div>
        <div className="w-12 text-right">Notes</div>
        <div className="w-14 text-right">Pages</div>
      </div>

      {pinned.length > 0 && (
        <section aria-labelledby="pinned-books-list-heading">
          <SectionHeader icon={<PinIcon className="w-4 h-4" />}>
            <span id="pinned-books-list-heading">Pinned</span>
          </SectionHeader>
          {shouldVirtualizePinned ? (
            <VirtualizedList notes={pinned} listOffset={0} label="Pinned books" />
          ) : (
            <SimpleList notes={pinned} listOffset={0} label="Pinned books" />
          )}
        </section>
      )}

      {unpinned.length > 0 && (
        <section
          aria-labelledby={pinned.length > 0 ? 'all-books-list-heading' : undefined}
          aria-label={pinned.length === 0 ? 'All books' : undefined}
        >
          {pinned.length > 0 && (
            <SectionHeader icon={<ListIcon className="w-4 h-4" />}>
              <span id="all-books-list-heading">All Books</span>
            </SectionHeader>
          )}
          {shouldVirtualizeUnpinned ? (
            <VirtualizedList notes={unpinned} listOffset={pinned.length} label="All books" />
          ) : (
            <SimpleList notes={unpinned} listOffset={pinned.length} label="All books" />
          )}
        </section>
      )}
    </div>
  );
});

const ListRow = memo(function ListRow({ note }: { note: LiteratureNoteSummary }) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const { togglePin, isPending: isPinPending } = usePinned();
  const { openPane } = useMetadataPane();
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const csl = note.csl;

  // Format publication info (for mobile subtitle)
  const pubInfo = useMemo(() => {
    const parts: string[] = [];
    if (csl?.publisher) parts.push(csl.publisher);
    if (csl?.issued) parts.push(csl.issued);
    return parts.join(', ');
  }, [csl]);

  // Format type badge — show source format (PDF/EPUB) to match filter buttons
  const typeLabel = useMemo(() => {
    return note.sourceType.toUpperCase();
  }, [note.sourceType]);

  // Build accessible label for screen readers
  const accessibleLabel = useMemo(() => {
    const parts = [note.title];
    if (note.author) parts.push(`by ${note.author}`);
    if (note.progress === 100) parts.push('completed');
    else if (note.progress > 0) parts.push(`${note.progress}% complete`);
    else parts.push('unread');
    if (note.rating) parts.push(`rated ${note.rating} out of 5 stars`);
    return parts.join(', ');
  }, [note.title, note.author, note.progress, note.rating]);

  const handleInfoClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    openPane(note.id);
  }, [note.id, openPane]);

  const handlePinClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isPinPending) {
      togglePin(note.id, note.pinned);
    }
  }, [isPinPending, note.id, note.pinned, togglePin]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    longPressTimer.current = setTimeout(() => {
      e.preventDefault();
      openPane(note.id);
    }, 500);
  }, [note.id, openPane]);

  const clearLongPress = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'i' || e.key === 'I') {
      e.preventDefault();
      openPane(note.id);
    }
  }, [note.id, openPane]);

  return (
    <Link
      to={`/read/${note.id}`}
      className="library-list-row group flex items-center gap-3 p-2 rounded-xl hover:bg-bg-surface transition-[background-color] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/60 focus-visible:ring-offset-1 focus-visible:ring-offset-bg-deep relative list-row-hover scroll-mt-4"
      data-testid="library-list-row"
      role="listitem"
      aria-label={accessibleLabel}
      onTouchStart={handleTouchStart}
      onTouchEnd={clearLongPress}
      onTouchMove={clearLongPress}
      onKeyDown={handleKeyDown}
    >
      {/* Cover thumbnail */}
      <div className="w-11 h-[60px] flex-shrink-0 rounded-md overflow-hidden bg-bg-deep relative transition-transform duration-200 group-hover:scale-105">
        {note.cover ? (
          <img
            src={api.covers.getUrl(note.id)}
            alt=""
            className={`w-full h-full object-cover transition-opacity duration-300 ${imageLoaded ? 'opacity-100' : 'opacity-0'}`}
            loading="lazy"
            onLoad={() => setImageLoaded(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-accent-primary/20 to-accent-secondary/10">
            <BookIcon className="w-5 h-5 text-accent-primary/60" />
          </div>
        )}
        {/* Progress bar on thumbnail */}
        {note.progress > 0 && (
          <div className="absolute bottom-0 left-0 right-0">
            <ProgressIndicator progress={note.progress} height="h-1" animateOnMount={false} />
          </div>
        )}
      </div>

      {/* Title and mobile subtitle */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start gap-2">
          <h3 className="text-sm font-medium text-text-primary truncate flex-1" data-testid="list-row-title">
            {note.title}
          </h3>
          <div className="hidden lg:flex items-center gap-1 flex-shrink-0">
            <button
              onClick={handleInfoClick}
              type="button"
              aria-label="Show metadata"
              className="w-8 h-8 flex items-center justify-center rounded-lg text-text-secondary hover:text-text-primary hover:bg-bg-deep transition-colors opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
            >
              <InfoIcon className="w-4 h-4" />
            </button>
            <button
              onClick={handlePinClick}
              type="button"
              aria-label={note.pinned ? 'Unpin' : 'Pin'}
              aria-pressed={note.pinned}
              disabled={isPinPending}
              className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors ${
                note.pinned
                  ? 'text-accent-primary bg-accent-primary/10 opacity-100'
                  : 'text-text-secondary hover:text-text-primary hover:bg-bg-deep opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'
              } ${isPinPending ? 'opacity-50' : ''}`}
            >
              <PinIcon className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Mobile: show author and pub info inline */}
        <div className="lg:hidden flex items-center gap-2 mt-0.5 text-xs text-text-secondary">
          {note.author && (
            <span className="truncate max-w-[150px]">{note.author}</span>
          )}
          {note.author && pubInfo && <span className="text-text-secondary/60">·</span>}
          {pubInfo && (
            <span className="truncate max-w-[100px] text-text-secondary/70">{pubInfo}</span>
          )}
        </div>

        {/* Container title for chapters (mobile) */}
        <div className="lg:hidden">
          {csl?.containerTitle && (
            <p className="text-xs text-text-secondary/60 truncate mt-0.5 italic">
              in {csl.containerTitle}
            </p>
          )}
        </div>
      </div>

      {/* Desktop metadata columns */}
      <div className="hidden lg:flex items-center gap-3 flex-shrink-0">
        {/* Author column */}
        <div className="w-36 min-w-0" data-testid="list-row-author">
          {note.author ? (
            <span className="text-xs text-text-secondary block truncate">{note.author}</span>
          ) : (
            <span className="text-xs text-text-secondary/40">-</span>
          )}
        </div>

        {/* Year/Issued */}
        <div className="w-14 text-center">
          {csl?.issued ? (
            <span className="text-xs text-text-secondary/70">{csl.issued.slice(0, 4)}</span>
          ) : (
            <span className="text-xs text-text-secondary/40">-</span>
          )}
        </div>

        {/* Type badge */}
        <span className="text-xs text-text-secondary/70 uppercase w-16 text-center" data-testid="list-row-type">
          {typeLabel}
        </span>

        {/* Progress */}
        <div className="w-16 text-right" data-testid="list-row-progress">
          {note.progress >= 100 ? (
            <span className="text-xs text-green-500 flex items-center justify-end gap-1">
              <CheckIcon className="w-3.5 h-3.5" />
              Done
            </span>
          ) : Math.round(note.progress) > 0 ? (
            <span className="text-xs text-accent-primary font-medium">{Math.round(note.progress)}%</span>
          ) : (
            <span className="text-xs text-text-secondary">Unread</span>
          )}
        </div>

        {/* Rating */}
        <div className="w-20 flex justify-center" data-testid="list-row-rating">
          {note.rating ? (
            <StarRating rating={note.rating} />
          ) : (
            <span className="text-xs text-text-secondary/40">-</span>
          )}
        </div>

        {/* Last read */}
        <div className="w-20 text-right">
          {note.lastRead ? (
            <span className="text-xs text-text-secondary">
              {formatLastRead(note.lastRead)}
            </span>
          ) : (
            <span className="text-xs text-text-secondary/40">-</span>
          )}
        </div>

        {/* Highlights */}
        <div className="w-12 text-right">
          {note.highlightCount > 0 ? (
            <span className="text-xs text-text-secondary flex items-center justify-end gap-1">
              <HighlightIcon className="w-3 h-3 opacity-60" />
              {note.highlightCount}
            </span>
          ) : (
            <span className="text-xs text-text-secondary/40">-</span>
          )}
        </div>

        {/* Pages */}
        <div className="w-14 text-right">
          {note.totalPages ? (
            <span className="text-xs text-text-secondary">{note.totalPages}p</span>
          ) : (
            <span className="text-xs text-text-secondary/40">-</span>
          )}
        </div>
      </div>

      {/* Mobile metadata (right side) */}
      <div className="lg:hidden flex items-center gap-2 flex-shrink-0">
        <button
          onClick={handleInfoClick}
          type="button"
          aria-label="Show metadata"
          className="w-10 h-10 flex items-center justify-center rounded-lg text-text-secondary hover:text-text-primary hover:bg-bg-deep transition-colors"
        >
          <InfoIcon className="w-4 h-4" />
        </button>
        <button
          onClick={handlePinClick}
          type="button"
          aria-label={note.pinned ? 'Unpin' : 'Pin'}
          aria-pressed={note.pinned}
          disabled={isPinPending}
          className={`w-10 h-10 flex items-center justify-center rounded-lg transition-colors ${
            note.pinned
              ? 'text-accent-primary bg-accent-primary/10'
              : 'text-text-secondary hover:text-text-primary hover:bg-bg-deep'
          } ${isPinPending ? 'opacity-50' : ''}`}
        >
          <PinIcon className="w-4 h-4" />
        </button>
        {note.progress > 0 && note.progress < 100 && (
          <span className="text-xs text-accent-primary">{Math.round(note.progress)}%</span>
        )}
        {note.progress === 100 && (
          <CheckIcon className="w-4 h-4 text-green-500" />
        )}
        {note.rating && <StarRating rating={note.rating} size={8} />}
      </div>
    </Link>
  );
});

const InfoIcon = memo(function InfoIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  );
});

const STAR_POINTS = '12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2';

const StarRating = memo(function StarRating({ rating, size = 10 }: { rating: number; size?: number }) {
  const gap = 1;
  const totalWidth = size * 5 + gap * 4;
  return (
    <svg
      width={totalWidth}
      height={size}
      viewBox={`0 0 ${totalWidth} ${size}`}
      aria-hidden="true"
      className="flex-shrink-0"
    >
      {[0, 1, 2, 3, 4].map((i) => {
        const filled = i < rating;
        return (
          <g key={i} transform={`translate(${i * (size + gap)}, 0)`}>
            <svg viewBox="0 0 24 24" width={size} height={size}>
              <polygon
                points={STAR_POINTS}
                fill={filled ? '#eab308' : 'none'}
                stroke={filled ? '#eab308' : 'currentColor'}
                strokeWidth="2"
                className={!filled ? 'text-text-secondary/40' : undefined}
              />
            </svg>
          </g>
        );
      })}
    </svg>
  );
});

const SectionHeader = memo(function SectionHeader({ children, icon }: { children: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      {icon && <span className="text-accent-primary/70">{icon}</span>}
      <h2 className="text-xs font-semibold tracking-wider text-text-secondary uppercase">
        {children}
      </h2>
    </div>
  );
});

const BookIcon = memo(function BookIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 19.5A2.5 2.5 0 016.5 17H20" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" />
    </svg>
  );
});

const PinIcon = memo(function PinIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="17" x2="12" y2="22" />
      <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z" />
    </svg>
  );
});

const ListIcon = memo(function ListIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" />
      <line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  );
});

const CheckIcon = memo(function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
});

const HighlightIcon = memo(function HighlightIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
    </svg>
  );
});
