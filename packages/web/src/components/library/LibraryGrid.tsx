import { useMemo } from 'react';
import type { LiteratureNoteSummary } from '@pulp/shared';
import { BookCard } from './BookCard';

interface LibraryGridProps {
  notes: LiteratureNoteSummary[];
}

const gridClasses = 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4';

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
          <h2 className="text-sm font-medium text-text-secondary uppercase tracking-wide mb-4">
            Pinned
          </h2>
          <div className={gridClasses}>
            {pinned.map((note) => (
              <BookCard key={note.id} note={note} />
            ))}
          </div>
        </section>
      )}

      {unpinned.length > 0 && (
        <section>
          {pinned.length > 0 && (
            <h2 className="text-sm font-medium text-text-secondary uppercase tracking-wide mb-4">
              Library
            </h2>
          )}
          <div className={gridClasses}>
            {unpinned.map((note) => (
              <BookCard key={note.id} note={note} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
