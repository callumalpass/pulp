import { useState, useMemo } from 'react';
import { useLibrary } from '../hooks/useLibrary';
import { LibraryGrid } from '../components/library/LibraryGrid';
import { Button } from '../components/ui/Button';
import type { LiteratureNoteSummary } from '@pulp/shared';

type SortOption = 'lastRead' | 'title' | 'progress' | 'dateCreated';
type SortOrder = 'asc' | 'desc';
type TypeFilter = 'all' | 'pdf' | 'epub';
type ProgressFilter = 'all' | 'unread' | 'reading' | 'completed';

const SORT_LABELS: Record<SortOption, string> = {
  lastRead: 'Recent',
  dateCreated: 'Added',
  title: 'Title',
  progress: 'Progress',
};

const PROGRESS_LABELS: Record<ProgressFilter, string> = {
  all: 'All',
  unread: 'Unread',
  reading: 'Reading',
  completed: 'Completed',
};

export function LibraryPage() {
  const [sort, setSort] = useState<SortOption>('lastRead');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [progressFilter, setProgressFilter] = useState<ProgressFilter>('all');

  const { data: notes, isLoading, error, refetch } = useLibrary(sort, sortOrder);

  const filteredNotes = useMemo(() => {
    if (!notes) return [];

    return notes.filter((note: LiteratureNoteSummary) => {
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        if (!note.title.toLowerCase().includes(query)) {
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

      return true;
    });
  }, [notes, searchQuery, typeFilter, progressFilter]);

  const hasActiveFilters = searchQuery || typeFilter !== 'all' || progressFilter !== 'all';

  const clearFilters = () => {
    setSearchQuery('');
    setTypeFilter('all');
    setProgressFilter('all');
  };

  const toggleSortOrder = () => {
    setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-accent-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-text-secondary">
        <p className="mb-4">Failed to load library</p>
        <Button variant="secondary" onClick={() => refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Search and filters */}
      <div className="flex flex-col gap-4 mb-6">
        {/* Search bar */}
        <div className="relative">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary" />
          <input
            type="text"
            placeholder="Search library..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-bg-surface border border-text-secondary/20 rounded-lg text-text-primary placeholder:text-text-secondary focus:outline-none focus:ring-2 focus:ring-accent-primary/50 focus:border-accent-primary"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary hover:text-text-primary"
            >
              <XIcon className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Filter row */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Type filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-text-secondary uppercase tracking-wide">Type</span>
            <div className="flex rounded-lg bg-bg-surface border border-text-secondary/20 overflow-hidden">
              <FilterButton
                active={typeFilter === 'all'}
                onClick={() => setTypeFilter('all')}
              >
                All
              </FilterButton>
              <FilterButton
                active={typeFilter === 'pdf'}
                onClick={() => setTypeFilter('pdf')}
              >
                PDF
              </FilterButton>
              <FilterButton
                active={typeFilter === 'epub'}
                onClick={() => setTypeFilter('epub')}
              >
                EPUB
              </FilterButton>
            </div>
          </div>

          {/* Progress filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-text-secondary uppercase tracking-wide">Status</span>
            <div className="flex rounded-lg bg-bg-surface border border-text-secondary/20 overflow-hidden">
              {(Object.keys(PROGRESS_LABELS) as ProgressFilter[]).map((key) => (
                <FilterButton
                  key={key}
                  active={progressFilter === key}
                  onClick={() => setProgressFilter(key)}
                >
                  {PROGRESS_LABELS[key]}
                </FilterButton>
              ))}
            </div>
          </div>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Sort controls */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-text-secondary uppercase tracking-wide">Sort</span>
            <div className="flex rounded-lg bg-bg-surface border border-text-secondary/20 overflow-hidden">
              {(Object.keys(SORT_LABELS) as SortOption[]).map((key) => (
                <FilterButton
                  key={key}
                  active={sort === key}
                  onClick={() => setSort(key)}
                >
                  {SORT_LABELS[key]}
                </FilterButton>
              ))}
            </div>
            <button
              onClick={toggleSortOrder}
              className="p-1.5 rounded-lg bg-bg-surface border border-text-secondary/20 text-text-secondary hover:text-text-primary hover:bg-bg-deep transition-colors"
              title={sortOrder === 'asc' ? 'Ascending' : 'Descending'}
            >
              {sortOrder === 'asc' ? (
                <SortAscIcon className="w-4 h-4" />
              ) : (
                <SortDescIcon className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>

        {/* Active filters summary */}
        {hasActiveFilters && (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-text-secondary">
              Showing {filteredNotes.length} of {notes?.length || 0} items
            </span>
            <button
              onClick={clearFilters}
              className="text-accent-primary hover:underline transition-colors"
            >
              Clear filters
            </button>
          </div>
        )}
      </div>

      <LibraryGrid notes={filteredNotes} />
    </div>
  );
}

function FilterButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 text-sm transition-colors ${
        active
          ? 'bg-accent-primary/20 text-accent-primary'
          : 'text-text-secondary hover:text-text-primary hover:bg-bg-deep'
      }`}
    >
      {children}
    </button>
  );
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
  );
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function SortAscIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 4h13M3 8h9M3 12h5m8-4v12m0 0l-4-4m4 4l4-4" />
    </svg>
  );
}

function SortDescIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 4h13M3 8h9M3 12h5m8 0v12m0-12l4 4m-4-4l-4 4" />
    </svg>
  );
}
