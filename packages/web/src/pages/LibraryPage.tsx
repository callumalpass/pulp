import { useState, useMemo, useEffect } from 'react';
import { useLibrary } from '../hooks/useLibrary';
import { useSearch, useSearchStatus } from '../hooks/useSearch';
import { useCollections } from '../hooks/useCollections';
import { useMobile } from '../hooks/useMobile';
import { LibraryGrid } from '../components/library/LibraryGrid';
import { SearchResults } from '../components/library/SearchResults';
import { MobileLibraryFilters } from '../components/library/MobileLibraryFilters';
import { ContinueReadingCard, ContinueReadingCardSkeleton } from '../components/library/ContinueReadingCard';
import { Button } from '../components/ui/Button';
import { useLibraryFiltersStore, type SortOption, type ProgressFilter } from '../stores/libraryFilters';
import type { LiteratureNoteSummary } from '@pulp/shared';

const SORT_LABELS: Record<SortOption, string> = {
  lastRead: 'Recent',
  dateCreated: 'Added',
  title: 'Title',
  progress: 'Progress',
  author: 'Author',
  rating: 'Rating',
};

const PROGRESS_LABELS: Record<ProgressFilter, string> = {
  all: 'All',
  unread: 'Unread',
  reading: 'Reading',
  completed: 'Completed',
};

export function LibraryPage() {
  // Use persisted filter store for preferences that should survive page reloads
  const {
    sort,
    sortOrder,
    typeFilter,
    progressFilter,
    collectionFilter,
    searchMode,
    setSort,
    toggleSortOrder,
    setTypeFilter,
    setProgressFilter,
    setCollectionFilter,
    setSearchMode,
    clearFilters,
  } = useLibraryFiltersStore();

  // Transient state (search query, mobile filters visibility)
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [showMobileFilters, setShowMobileFilters] = useState(false);

  const isMobile = useMobile();
  const { data: notes, isLoading, error, refetch } = useLibrary(sort, sortOrder);
  const { data: collectionsData } = useCollections();
  const { data: searchStatus } = useSearchStatus();
  const { data: searchResults, isLoading: isSearching } = useSearch(debouncedQuery, {
    enabled: searchMode === 'content' && debouncedQuery.length >= 2,
    limit: 50,
  });

  // Debounce search query for content search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const filteredNotes = useMemo(() => {
    if (!notes) return [];

    return notes.filter((note: LiteratureNoteSummary) => {
      // Search filter (only for title mode)
      if (searchMode === 'title' && searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesTitle = note.title.toLowerCase().includes(query);
        const matchesCitekey = note.citekey?.toLowerCase().includes(query);
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
  }, [notes, searchQuery, typeFilter, progressFilter, collectionFilter, searchMode]);

  const hasActiveFilters = Boolean(searchQuery) || typeFilter !== 'all' || progressFilter !== 'all' || collectionFilter !== null;

  // Count active filters for badge display
  const activeFilterCount = [
    typeFilter !== 'all',
    progressFilter !== 'all',
    collectionFilter !== null,
  ].filter(Boolean).length;

  // Get available collections
  const availableCollections = collectionsData?.collections || [];

  const handleClearFilters = () => {
    setSearchQuery('');
    clearFilters();
  };

  const isShowingSearchResults = searchMode === 'content' && debouncedQuery.length >= 2;

  // Find the most recently read book that's still in progress for "Continue Reading"
  const continueReadingBook = useMemo(() => {
    if (!notes) return null;

    // Find books that are in progress (between 1% and 99%) and have been read
    const inProgress = notes.filter(
      (note: LiteratureNoteSummary) => note.progress > 0 && note.progress < 100 && note.lastRead
    );

    if (inProgress.length === 0) return null;

    // Sort by last read date (most recent first)
    const sorted = [...inProgress].sort((a, b) => {
      const dateA = a.lastRead ? new Date(a.lastRead).getTime() : 0;
      const dateB = b.lastRead ? new Date(b.lastRead).getTime() : 0;
      return dateB - dateA;
    });

    return sorted[0];
  }, [notes]);

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
        {/* Search bar with mode toggle */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary" />
            <input
              type="text"
              placeholder={searchMode === 'title' ? 'Search by title...' : 'Search document contents...'}
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

          {/* Search mode toggle */}
          <div className="flex rounded-lg bg-bg-surface border border-text-secondary/20 overflow-hidden">
            <button
              onClick={() => setSearchMode('title')}
              className={`px-3 py-2 text-sm transition-colors flex items-center gap-1.5 ${
                searchMode === 'title'
                  ? 'bg-accent-primary/20 text-accent-primary'
                  : 'text-text-secondary hover:text-text-primary hover:bg-bg-deep'
              }`}
              title="Search by title"
            >
              <TitleIcon className="w-4 h-4" />
              <span className="hidden sm:inline">Title</span>
            </button>
            <button
              onClick={() => setSearchMode('content')}
              className={`px-3 py-2 text-sm transition-colors flex items-center gap-1.5 ${
                searchMode === 'content'
                  ? 'bg-accent-primary/20 text-accent-primary'
                  : 'text-text-secondary hover:text-text-primary hover:bg-bg-deep'
              }`}
              title="Search document contents"
            >
              <ContentIcon className="w-4 h-4" />
              <span className="hidden sm:inline">Content</span>
            </button>
          </div>
        </div>

        {/* Indexing status indicator (only show when content search is active and indexing) */}
        {searchMode === 'content' && searchStatus && !searchStatus.isComplete && (
          <div className="flex items-center gap-2 text-sm text-text-secondary bg-bg-surface border border-text-secondary/20 rounded-lg px-3 py-2">
            <div className="w-4 h-4 border-2 border-accent-primary/50 border-t-accent-primary rounded-full animate-spin" />
            <span>
              Indexing documents for search... {searchStatus.percentComplete}% ({searchStatus.indexedDocuments}/{searchStatus.totalDocuments})
            </span>
          </div>
        )}

        {/* Filter row - hide when showing search results */}
        {!isShowingSearchResults && (
          isMobile ? (
            /* Mobile: Filters button that opens bottom sheet */
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowMobileFilters(true)}
                className="flex items-center gap-2 px-4 py-2 bg-bg-surface border border-text-secondary/20 rounded-lg text-text-primary"
              >
                <FilterIcon className="w-4 h-4" />
                <span className="text-sm">Filters</span>
                {activeFilterCount > 0 && (
                  <span className="flex items-center justify-center w-5 h-5 text-xs font-medium bg-accent-primary text-white rounded-full">
                    {activeFilterCount}
                  </span>
                )}
              </button>
              {/* Sort order button on mobile */}
              <button
                onClick={toggleSortOrder}
                className="p-2 rounded-lg bg-bg-surface border border-text-secondary/20 text-text-secondary hover:text-text-primary hover:bg-bg-deep transition-colors"
                title={sortOrder === 'asc' ? 'Ascending' : 'Descending'}
              >
                {sortOrder === 'asc' ? (
                  <SortAscIcon className="w-4 h-4" />
                ) : (
                  <SortDescIcon className="w-4 h-4" />
                )}
              </button>
            </div>
          ) : (
            /* Desktop: Inline filters */
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

              {/* Collection filter */}
              {availableCollections.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-text-secondary uppercase tracking-wide">Collection</span>
                  <select
                    value={collectionFilter || ''}
                    onChange={(e) => setCollectionFilter(e.target.value || null)}
                    className="px-2 py-1.5 text-sm bg-bg-surface border border-text-secondary/20 rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-primary/50"
                  >
                    <option value="">All</option>
                    {availableCollections.map((collection) => (
                      <option key={collection} value={collection}>
                        {collection}
                      </option>
                    ))}
                  </select>
                </div>
              )}

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
          )
        )}

        {/* Active filters summary */}
        {!isShowingSearchResults && hasActiveFilters && (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-text-secondary">
              Showing {filteredNotes.length} of {notes?.length || 0} items
            </span>
            <button
              onClick={handleClearFilters}
              className="text-accent-primary hover:underline transition-colors"
            >
              Clear filters
            </button>
          </div>
        )}
      </div>

      {/* Continue Reading Section */}
      {!isShowingSearchResults && !hasActiveFilters && (
        isLoading ? (
          <div className="mb-8">
            <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wide mb-3">
              Continue Reading
            </h2>
            <ContinueReadingCardSkeleton />
          </div>
        ) : continueReadingBook ? (
          <div className="mb-8">
            <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wide mb-3">
              Continue Reading
            </h2>
            <ContinueReadingCard note={continueReadingBook} />
          </div>
        ) : null
      )}

      {/* Content - either search results or library grid */}
      {isShowingSearchResults ? (
        <SearchResults
          results={searchResults?.results || []}
          query={debouncedQuery}
          isLoading={isSearching}
        />
      ) : (
        <>
          {!hasActiveFilters && continueReadingBook && (
            <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wide mb-3">
              Library
            </h2>
          )}
          <LibraryGrid notes={filteredNotes} />
        </>
      )}

      {/* Mobile filters bottom sheet */}
      {showMobileFilters && (
        <MobileLibraryFilters
          typeFilter={typeFilter}
          progressFilter={progressFilter}
          sort={sort}
          sortOrder={sortOrder}
          onTypeChange={setTypeFilter}
          onProgressChange={setProgressFilter}
          onSortChange={setSort}
          onSortOrderToggle={toggleSortOrder}
          onClearFilters={handleClearFilters}
          hasActiveFilters={hasActiveFilters}
          onClose={() => setShowMobileFilters(false)}
        />
      )}
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

function TitleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
    </svg>
  );
}

function ContentIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
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

function FilterIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
    </svg>
  );
}
