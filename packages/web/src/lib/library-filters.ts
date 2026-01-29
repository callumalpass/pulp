import type { LiteratureNoteSummary } from '@pulp/shared';
import type { TypeFilter, ProgressFilter, SearchMode } from '../stores/libraryFilters';

export interface LibraryFilterOptions {
  searchQuery: string;
  searchMode: SearchMode;
  typeFilter: TypeFilter;
  progressFilter: ProgressFilter;
  collectionFilter: string | null;
}

/**
 * Filter library notes based on search query, type, progress, and collection filters.
 */
export function filterNotes(
  notes: LiteratureNoteSummary[],
  options: LibraryFilterOptions,
): LiteratureNoteSummary[] {
  const { searchQuery, searchMode, typeFilter, progressFilter, collectionFilter } = options;
  const normalizedQuery = searchQuery.trim().toLowerCase();

  return notes.filter((note) => {
    // Search filter (only for title mode)
    if (searchMode === 'title' && normalizedQuery) {
      const matchesTitle = note.title.toLowerCase().includes(normalizedQuery);
      const matchesCitekey = note.citekey?.toLowerCase().includes(normalizedQuery);
      if (!matchesTitle && !matchesCitekey) {
        return false;
      }
    }

    // Type filter
    if (typeFilter !== 'all' && note.sourceType !== typeFilter) {
      return false;
    }

    // Progress filter
    if (progressFilter !== 'all') {
      const progress = note.progress;
      if (progressFilter === 'unread' && progress !== 0) return false;
      if (progressFilter === 'reading' && (progress === 0 || progress === 100)) return false;
      if (progressFilter === 'completed' && progress !== 100) return false;
    }

    // Collection filter
    if (collectionFilter !== null) {
      if (!note.collections.includes(collectionFilter)) return false;
    }

    return true;
  });
}

/**
 * Determine whether any filters are active (search query, type, progress, or collection).
 */
export function hasActiveFilters(
  searchQuery: string,
  typeFilter: TypeFilter,
  progressFilter: ProgressFilter,
  collectionFilter: string | null,
): boolean {
  return Boolean(searchQuery) || typeFilter !== 'all' || progressFilter !== 'all' || collectionFilter !== null;
}

/**
 * Count the number of active non-search filters (type, progress, collection).
 */
export function countActiveFilters(
  typeFilter: TypeFilter,
  progressFilter: ProgressFilter,
  collectionFilter: string | null,
): number {
  return [
    typeFilter !== 'all',
    progressFilter !== 'all',
    collectionFilter !== null,
  ].filter(Boolean).length;
}

/**
 * Find the most recently read book that is still in progress (between 1% and 99% inclusive)
 * for the "Continue Reading" feature.
 *
 * Returns null if no books are in progress.
 */
export function findContinueReadingBook(
  notes: LiteratureNoteSummary[],
): LiteratureNoteSummary | null {
  // Find books that are in progress (between 1% and 99%) and have been read
  const inProgress = notes.filter(
    (note) => note.progress > 0 && note.progress < 100 && note.lastRead,
  );

  if (inProgress.length === 0) return null;

  // Sort by last read date (most recent first)
  const sorted = [...inProgress].sort((a, b) => {
    const dateA = a.lastRead ? new Date(a.lastRead).getTime() : 0;
    const dateB = b.lastRead ? new Date(b.lastRead).getTime() : 0;
    return dateB - dateA;
  });

  return sorted[0];
}

/**
 * Remove the "continue reading" book from the grid notes to avoid showing it twice.
 */
export function excludeContinueReadingBook(
  notes: LiteratureNoteSummary[],
  continueReadingBook: LiteratureNoteSummary | null,
): LiteratureNoteSummary[] {
  if (!continueReadingBook) return notes;
  return notes.filter((n) => n.id !== continueReadingBook.id);
}
