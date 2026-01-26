import { useMemo } from 'react';
import type { LiteratureNoteSummary } from '@pulp/shared';
import { BookCard } from './BookCard';

interface LibraryGridProps {
  notes: LiteratureNoteSummary[];
}

const gridClasses = 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 library-grid-optimized';

function getStaggerClass(index: number): string {
  // Limit stagger effect to first 12 items for performance
  if (index >= 12) return '';
  return `card-enter card-stagger-${index + 1}`;
}

function SectionHeader({ children, icon }: { children: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      {icon && (
        <span className="text-accent-primary/70">{icon}</span>
      )}
      <h2 className="text-xs font-semibold tracking-wider text-text-secondary uppercase">
        {children}
      </h2>
    </div>
  );
}

function PinIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="17" x2="12" y2="22" />
      <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z" />
    </svg>
  );
}

function GridIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
    </svg>
  );
}

export function LibraryGrid({ notes }: LibraryGridProps) {
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
        <svg
          width="64"
          height="64"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          className="mb-4 opacity-50"
        >
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
        </svg>
        <p className="text-lg">No literature notes found</p>
        <p className="text-sm mt-1">Add notes with the literature-note tag to your vault</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {pinned.length > 0 && (
        <section>
          <SectionHeader icon={<PinIcon className="w-4 h-4" />}>
            Pinned
          </SectionHeader>
          <div className={gridClasses}>
            {pinned.map((note, index) => (
              <div key={note.id} className={getStaggerClass(index)}>
                <BookCard note={note} />
              </div>
            ))}
          </div>
        </section>
      )}

      {unpinned.length > 0 && (
        <section>
          {pinned.length > 0 && (
            <SectionHeader icon={<GridIcon className="w-4 h-4" />}>
              All Books
            </SectionHeader>
          )}
          <div className={gridClasses}>
            {unpinned.map((note, index) => (
              <div key={note.id} className={getStaggerClass(pinned.length > 0 ? index : index)}>
                <BookCard note={note} />
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
