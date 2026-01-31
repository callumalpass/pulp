import { useMemo, memo, useRef, useState, useEffect, useCallback } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { LiteratureNoteSummary } from '@pulp/shared';
import { BookCard } from './BookCard';

interface LibraryGridProps {
  notes: LiteratureNoteSummary[];
}

// Tailwind breakpoints (px)
const BREAKPOINTS = [
  { min: 1280, cols: 6 }, // xl
  { min: 1024, cols: 5 }, // lg
  { min: 768, cols: 4 },  // md
  { min: 640, cols: 3 },  // sm
  { min: 0, cols: 2 },    // default
];

const GAP = 16; // gap-4 = 1rem = 16px
const ROW_ASPECT = 2 / 3; // aspect-[2/3] cover + ~80px text area

function getColumnCount(width: number): number {
  for (const bp of BREAKPOINTS) {
    if (width >= bp.min) return bp.cols;
  }
  return 2;
}

function useColumnCount(containerRef: React.RefObject<HTMLDivElement | null>): number {
  const [cols, setCols] = useState(() => {
    if (typeof window === 'undefined') return 4;
    return getColumnCount(window.innerWidth);
  });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const update = () => {
      setCols(getColumnCount(el.clientWidth));
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [containerRef]);

  return cols;
}

function estimateRowHeight(containerWidth: number, cols: number): number {
  const cardWidth = (containerWidth - GAP * (cols - 1)) / cols;
  const coverHeight = cardWidth / ROW_ASPECT;
  const textArea = 80; // title + author + meta row
  return coverHeight + textArea + GAP;
}

function getStaggerClass(index: number): string {
  if (index >= 12) return '';
  return `card-enter card-stagger-${index + 1}`;
}

const SectionHeader = memo(function SectionHeader({ children, icon }: { children: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      {icon && (
        <span className="text-accent-primary/70">{icon}</span>
      )}
      <h2 className="text-[0.8125rem] font-semibold tracking-wider text-text-secondary uppercase">
        {children}
      </h2>
    </div>
  );
});

const PinIcon = memo(function PinIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="12" y1="17" x2="12" y2="22" />
      <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z" />
    </svg>
  );
});

const GridIcon = memo(function GridIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
    </svg>
  );
});

// Threshold below which we render without virtualization (keeps stagger animations working
// for small libraries and avoids virtualizer overhead when it's not needed)
const VIRTUALIZATION_THRESHOLD = 60;

/** Render a simple CSS grid without virtualization (for small lists / pinned section). */
function SimpleGrid({ notes, gridOffset, priorityCount = 0, label = 'Books' }: { notes: LiteratureNoteSummary[]; gridOffset: number; priorityCount?: number; label?: string }) {
  return (
    <div
      className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 library-grid-optimized"
      role="list"
      aria-label={label}
    >
      {notes.map((note, index) => (
        <div key={note.id} className={getStaggerClass(gridOffset + index)} role="listitem">
          <BookCard note={note} priority={index < priorityCount} />
        </div>
      ))}
    </div>
  );
}

/** Virtualized grid that only renders visible rows. */
const VirtualizedGrid = memo(function VirtualizedGrid({
  notes,
}: {
  notes: LiteratureNoteSummary[];
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cols = useColumnCount(containerRef);

  // Find the scroll parent (<main> element) - resolve eagerly for first render
  const scrollRef = useRef<HTMLElement | null>(
    typeof document !== 'undefined' ? document.getElementById('main-content') : null,
  );

  const rowCount = Math.ceil(notes.length / cols);

  const estimateSize = useCallback(
    () => {
      const width = containerRef.current?.clientWidth ?? 800;
      return estimateRowHeight(width, cols);
    },
    [cols],
  );

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollRef.current,
    estimateSize,
    overscan: 3,
  });

  return (
    <div ref={containerRef} role="list" aria-label="Books">
      <div
        style={{
          height: virtualizer.getTotalSize(),
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const startIdx = virtualRow.index * cols;
          const rowNotes = notes.slice(startIdx, startIdx + cols);

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
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                {rowNotes.map((note) => (
                  <div key={note.id} role="listitem">
                    <BookCard note={note} />
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
});

export const LibraryGrid = memo(function LibraryGrid({ notes }: LibraryGridProps) {
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
      <div className="flex flex-col items-center justify-center py-20 text-text-secondary" role="status" aria-label="Empty library">
        <svg
          width="64"
          height="64"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          className="mb-4 opacity-50"
          aria-hidden="true"
        >
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
        </svg>
        <p className="text-lg">No literature notes found</p>
        <p className="text-sm mt-1">Add notes with the literature-note tag to your vault</p>
      </div>
    );
  }

  const useVirtual = unpinned.length >= VIRTUALIZATION_THRESHOLD;

  return (
    <div className="space-y-8">
      {pinned.length > 0 && (
        <section aria-labelledby="pinned-books-heading">
          <SectionHeader icon={<PinIcon className="w-4 h-4" />}>
            <span id="pinned-books-heading">Pinned</span>
          </SectionHeader>
          <SimpleGrid notes={pinned} gridOffset={0} priorityCount={6} label="Pinned books" />
        </section>
      )}

      {unpinned.length > 0 && (
        <section aria-labelledby={pinned.length > 0 ? "all-books-heading" : undefined} aria-label={pinned.length === 0 ? "All books" : undefined}>
          {pinned.length > 0 && (
            <SectionHeader icon={<GridIcon className="w-4 h-4" />}>
              <span id="all-books-heading">All Books</span>
            </SectionHeader>
          )}
          {useVirtual ? (
            <VirtualizedGrid notes={unpinned} />
          ) : (
            <SimpleGrid notes={unpinned} gridOffset={pinned.length} priorityCount={pinned.length === 0 ? 6 : 0} label="All books" />
          )}
        </section>
      )}
    </div>
  );
});
