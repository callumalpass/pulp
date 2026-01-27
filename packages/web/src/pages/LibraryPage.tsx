import { useState, useMemo, useEffect, useDeferredValue, useCallback, useRef, memo } from 'react';
import { useLibrary } from '../hooks/useLibrary';
import { useSearch, useSearchStatus } from '../hooks/useSearch';
import { useCollections } from '../hooks/useCollections';
import { useMobile } from '../hooks/useMobile';
import { useConnection } from '../contexts/ConnectionContext';
import { MetadataPaneProvider } from '../contexts/MetadataPaneContext';
import { LibraryGrid } from '../components/library/LibraryGrid';
import { LibraryListView } from '../components/library/LibraryListView';
import { SearchResults } from '../components/library/SearchResults';
import { MobileLibraryFilters } from '../components/library/MobileLibraryFilters';
import { ContinueReadingCard, ContinueReadingCardSkeleton } from '../components/library/ContinueReadingCard';
import { MetadataPane } from '../components/library/MetadataPane';
import { Button } from '../components/ui/Button';
import { useLibraryFiltersStore, type SortOption, type ProgressFilter, type TypeFilter, type SearchMode, type ViewMode } from '../stores/libraryFilters';
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

const TYPE_FILTER_OPTIONS: FilterOption<TypeFilter>[] = [
  { value: 'all', label: 'All' },
  { value: 'pdf', label: 'PDF' },
  { value: 'epub', label: 'EPUB' },
];

const PROGRESS_FILTER_OPTIONS: FilterOption<ProgressFilter>[] = (
  Object.keys(PROGRESS_LABELS) as ProgressFilter[]
).map((key) => ({ value: key, label: PROGRESS_LABELS[key] }));

const SORT_FILTER_OPTIONS: FilterOption<SortOption>[] = (
  Object.keys(SORT_LABELS) as SortOption[]
).map((key) => ({ value: key, label: SORT_LABELS[key] }));

const SEARCH_MODE_OPTIONS: FilterOption<SearchMode>[] = [
  { value: 'title', label: <><TitleIcon className="w-4 h-4" /><span className="hidden sm:inline">Title</span></>, ariaLabel: 'Search by title' },
  { value: 'content', label: <><ContentIcon className="w-4 h-4" /><span className="hidden sm:inline">Content</span></>, ariaLabel: 'Search document contents' },
];

const VIEW_MODE_OPTIONS: FilterOption<ViewMode>[] = [
  { value: 'grid', label: <GridViewIcon className="w-4 h-4" />, ariaLabel: 'Grid view', iconOnly: true },
  { value: 'list', label: <ListViewIcon className="w-4 h-4" />, ariaLabel: 'List view', iconOnly: true },
];

export function LibraryPage() {
  return (
    <MetadataPaneProvider>
      <LibraryPageContent />
    </MetadataPaneProvider>
  );
}

function LibraryPageContent() {
  // Use persisted filter store for preferences that should survive page reloads
  const {
    sort,
    sortOrder,
    typeFilter,
    progressFilter,
    collectionFilter,
    searchMode,
    viewMode,
    setSort,
    toggleSortOrder,
    setTypeFilter,
    setProgressFilter,
    setCollectionFilter,
    setSearchMode,
    setViewMode,
    clearFilters,
  } = useLibraryFiltersStore();

  // Transient state (search query, mobile filters visibility)
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const deferredQuery = useDeferredValue(searchQuery);

  // Filter changes update immediately for instant button feedback
  // The expensive filtering is already deferred via useMemo
  const handleTypeFilter = useCallback((value: typeof typeFilter) => {
    setTypeFilter(value);
  }, [setTypeFilter]);

  const handleProgressFilter = useCallback((value: typeof progressFilter) => {
    setProgressFilter(value);
  }, [setProgressFilter]);

  const handleSortChange = useCallback((value: typeof sort) => {
    setSort(value);
  }, [setSort]);

  const isMobile = useMobile();
  const { status: connectionStatus } = useConnection();
  const { data: notes, isLoading, error, refetch, isFetching } = useLibrary(sort, sortOrder);
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

    const normalizedQuery = deferredQuery.trim().toLowerCase();

    return notes.filter((note: LiteratureNoteSummary) => {
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
  }, [notes, deferredQuery, typeFilter, progressFilter, collectionFilter, searchMode]);

  // Memoize filter calculations to prevent recalculation on unrelated state changes
  const hasActiveFilters = useMemo(() =>
    Boolean(searchQuery) || typeFilter !== 'all' || progressFilter !== 'all' || collectionFilter !== null,
    [searchQuery, typeFilter, progressFilter, collectionFilter]
  );

  // Count active filters for badge display
  const activeFilterCount = useMemo(() => [
    typeFilter !== 'all',
    progressFilter !== 'all',
    collectionFilter !== null,
  ].filter(Boolean).length, [typeFilter, progressFilter, collectionFilter]);

  // Get available collections
  const availableCollections = collectionsData?.collections || [];

  const handleClearFilters = useCallback(() => {
    setSearchQuery('');
    clearFilters();
  }, [clearFilters]);

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

  // Show connection error when disconnected and fetching or no data
  const showConnectionError = connectionStatus === 'disconnected' && (isFetching || !notes);

  if (isLoading && !showConnectionError) {
    return (
      <div className="p-6 page-transition">
        {/* Search bar skeleton */}
        <div className="flex flex-col gap-4 mb-6">
          <div className="flex gap-2">
            <div className="flex-1 h-11 skeleton rounded-xl" />
            <div className="w-28 h-11 skeleton rounded-xl" />
          </div>
          {/* Filter row skeleton */}
          {!isMobile && (
            <div className="flex flex-wrap items-center gap-3">
              <div className="w-32 h-9 skeleton rounded-xl" />
              <div className="w-48 h-9 skeleton rounded-xl" />
              <div className="flex-1" />
              <div className="w-64 h-9 skeleton rounded-xl" />
            </div>
          )}
        </div>

        {/* Continue Reading skeleton */}
        <div className="mb-8">
          <div className="w-36 h-4 skeleton rounded mb-4" />
          <ContinueReadingCardSkeleton />
        </div>

        {/* Library grid skeleton */}
        <div className="w-20 h-4 skeleton rounded mb-4" />
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="flex flex-col gap-2">
              <div className="aspect-[2/3] skeleton rounded-xl" />
              <div className="h-4 skeleton rounded w-3/4" />
              <div className="h-3 skeleton rounded w-1/2" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error || showConnectionError) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-text-secondary">
        <DisconnectedIcon className="w-16 h-16 mb-4 opacity-50" />
        <p className="text-lg text-text-primary mb-2">
          {showConnectionError ? 'Connection Lost' : 'Failed to load library'}
        </p>
        <p className="text-sm mb-4 text-center max-w-md">
          {showConnectionError
            ? 'Unable to connect to the server. Please check your connection and try again.'
            : 'Something went wrong while loading your library.'}
        </p>
        <Button variant="secondary" onClick={() => refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  // Empty library state - shown when there are no books at all
  if (notes && notes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 page-transition">
        <div className="relative mb-8 animate-float">
          {/* Decorative background circles */}
          <div className="absolute -inset-12 bg-gradient-to-br from-accent-primary/15 via-transparent to-accent-secondary/15 rounded-full blur-3xl" />
          <div className="relative bg-bg-surface p-8 rounded-3xl border border-subtle shadow-xl shadow-black/20 animate-pulse-glow">
            <BookStackIcon className="w-20 h-20 text-accent-primary" />
          </div>
        </div>
        <h2 className="text-2xl font-bold text-text-primary mb-3">
          Your library awaits
        </h2>
        <p className="text-text-secondary text-center max-w-md mb-2 leading-relaxed">
          Start building your reading collection by adding literature notes with linked PDFs or EPUBs.
        </p>
        <p className="text-text-secondary/60 text-sm text-center max-w-md mb-8 leading-relaxed">
          Place your markdown files in your configured library folder and link them to documents using the <code className="px-1.5 py-0.5 rounded-md bg-bg-surface text-accent-secondary text-xs font-mono">source</code> frontmatter key.
        </p>
        <Button variant="secondary" onClick={() => refetch()}>
          Refresh Library
        </Button>
      </div>
    );
  }

  return (
    <div className="library-page-container">
      <div className="library-page-main p-6">
        {/* Search and filters */}
        <div className="flex flex-col gap-4 mb-6">
          {/* Search bar with mode toggle */}
          <div className="flex gap-2">
          <div className="relative flex-1 group/search">
            <SearchIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary transition-colors group-focus-within/search:text-accent-primary" />
            <input
              type="search"
              placeholder={searchMode === 'title' ? 'Search by title...' : 'Search document contents...'}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-10 py-2.5 bg-bg-surface border border-subtle rounded-xl text-text-primary placeholder:text-text-secondary/60 focus:outline-none focus:ring-2 focus:ring-accent-primary/30 focus:border-accent-primary/50 transition-all duration-200 hover:border-text-secondary/30"
            />
            <button
              onClick={() => setSearchQuery('')}
              type="button"
              aria-label="Clear search"
              className={`absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary hover:text-text-primary transition-all duration-150 ${
                searchQuery
                  ? 'opacity-100 scale-100'
                  : 'opacity-0 scale-75 pointer-events-none'
              }`}
              tabIndex={searchQuery ? 0 : -1}
            >
              <XIcon className="w-4 h-4" />
            </button>
          </div>

          {/* Search mode toggle */}
          <FilterButtonGroup
            options={SEARCH_MODE_OPTIONS}
            value={searchMode}
            onChange={setSearchMode}
          />
        </div>

        {/* Indexing status indicator (only show when content search is active and indexing) */}
        {searchMode === 'content' && searchStatus && !searchStatus.isComplete && (
          <div
            className="flex items-center gap-2 text-sm text-text-secondary bg-bg-surface border border-text-secondary/20 rounded-lg px-3 py-2"
            role="status"
            aria-live="polite"
          >
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
                aria-haspopup="dialog"
                aria-expanded={showMobileFilters}
                aria-controls="library-filters-sheet"
                type="button"
                className="flex items-center gap-2 min-h-[44px] px-4 py-2.5 bg-bg-surface border border-text-secondary/20 rounded-xl text-text-primary hover:border-text-secondary/40 transition-colors active:scale-[0.97]"
              >
                <FilterIcon className="w-4 h-4" />
                <span className="text-sm font-medium">Filters</span>
                {activeFilterCount > 0 && (
                  <span className="flex items-center justify-center w-5 h-5 text-xs font-bold bg-accent-primary text-bg-deep rounded-full">
                    {activeFilterCount}
                  </span>
                )}
              </button>
              {/* View mode toggle on mobile */}
              <button
                onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
                type="button"
                className="w-11 h-11 flex items-center justify-center rounded-xl bg-bg-surface border border-text-secondary/20 text-text-secondary hover:text-text-primary hover:bg-bg-deep hover:border-text-secondary/40 transition-colors active:scale-[0.97]"
                title={viewMode === 'grid' ? 'Switch to list view' : 'Switch to grid view'}
                aria-label={viewMode === 'grid' ? 'Switch to list view' : 'Switch to grid view'}
              >
                {viewMode === 'grid' ? (
                  <ListViewIcon className="w-5 h-5" />
                ) : (
                  <GridViewIcon className="w-5 h-5" />
                )}
              </button>
              {/* Sort order button on mobile */}
              <button
                onClick={toggleSortOrder}
                type="button"
                className="w-11 h-11 flex items-center justify-center rounded-xl bg-bg-surface border border-text-secondary/20 text-text-secondary hover:text-text-primary hover:bg-bg-deep hover:border-text-secondary/40 transition-colors active:scale-[0.97]"
                title={sortOrder === 'asc' ? 'Ascending' : 'Descending'}
                aria-label={`Sort order: ${sortOrder === 'asc' ? 'ascending' : 'descending'}`}
                aria-pressed={sortOrder === 'asc'}
              >
                {sortOrder === 'asc' ? (
                  <SortAscIcon className="w-5 h-5" />
                ) : (
                  <SortDescIcon className="w-5 h-5" />
                )}
              </button>
            </div>
          ) : (
            /* Desktop: Inline filters */
            <div className="flex flex-wrap items-center gap-3">
              {/* Type filter */}
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-text-secondary/70 uppercase tracking-wider font-medium">Type</span>
                <FilterButtonGroup
                  options={TYPE_FILTER_OPTIONS}
                  value={typeFilter}
                  onChange={handleTypeFilter}
                />
              </div>

              {/* Progress filter */}
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-text-secondary/70 uppercase tracking-wider font-medium">Status</span>
                <FilterButtonGroup
                  options={PROGRESS_FILTER_OPTIONS}
                  value={progressFilter}
                  onChange={handleProgressFilter}
                />
              </div>

              {/* Collection filter */}
              {availableCollections.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-text-secondary/70 uppercase tracking-wider font-medium">Collection</span>
                  <select
                    value={collectionFilter || ''}
                    onChange={(e) => setCollectionFilter(e.target.value || null)}
                    className="collection-select px-3 py-2 text-sm bg-bg-surface border border-subtle rounded-xl text-text-primary focus:outline-none min-h-[38px]"
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

              {/* View mode toggle */}
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-text-secondary/70 uppercase tracking-wider font-medium">View</span>
                <FilterButtonGroup
                  options={VIEW_MODE_OPTIONS}
                  value={viewMode}
                  onChange={setViewMode}
                />
              </div>

              {/* Sort controls */}
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-text-secondary/70 uppercase tracking-wider font-medium">Sort</span>
                <FilterButtonGroup
                  options={SORT_FILTER_OPTIONS}
                  value={sort}
                  onChange={handleSortChange}
                />
                <button
                  onClick={toggleSortOrder}
                  type="button"
                  className="w-10 h-10 flex items-center justify-center rounded-xl filter-btn-group text-text-secondary hover:text-accent-primary hover:bg-bg-deep transition-all duration-150 active:scale-95"
                  title={sortOrder === 'asc' ? 'Ascending' : 'Descending'}
                  aria-label={`Sort order: ${sortOrder === 'asc' ? 'ascending' : 'descending'}`}
                  aria-pressed={sortOrder === 'asc'}
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
                type="button"
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
            <SectionHeader icon={<PlayCircleIcon className="w-4 h-4" />}>
              Continue Reading
            </SectionHeader>
            <ContinueReadingCardSkeleton />
          </div>
        ) : continueReadingBook ? (
          <div className="mb-8">
            <SectionHeader icon={<PlayCircleIcon className="w-4 h-4" />}>
              Continue Reading
            </SectionHeader>
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
            <SectionHeader icon={<LibraryIcon className="w-4 h-4" />}>
              All Books
            </SectionHeader>
          )}
          {filteredNotes.length === 0 && (notes?.length ?? 0) > 0 ? (
            <FilteredEmptyState
              query={searchQuery}
              onClear={handleClearFilters}
            />
          ) : (
            <div key={viewMode} className="view-switch-enter">
              {viewMode === 'list' ? (
                <LibraryListView notes={filteredNotes} />
              ) : (
                <LibraryGrid notes={filteredNotes} />
              )}
            </div>
          )}
        </>
      )}

        {/* Mobile filters bottom sheet */}
        {showMobileFilters && (
          <MobileLibraryFilters
            dialogId="library-filters-sheet"
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

      {/* Metadata Pane */}
      <MetadataPane />
    </div>
  );
}

interface FilterOption<T extends string> {
  value: T;
  label: React.ReactNode;
  ariaLabel?: string;
  /** Use for icon-only buttons */
  iconOnly?: boolean;
}

const FilterButtonGroup = memo(function FilterButtonGroup<T extends string>({
  options,
  value,
  onChange,
}: {
  options: FilterOption<T>[];
  value: T;
  onChange: (value: T) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [indicatorStyle, setIndicatorStyle] = useState({ left: 0, width: 0 });
  const buttonRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  const setButtonRef = useCallback((id: string) => (el: HTMLButtonElement | null) => {
    if (el) {
      buttonRefs.current.set(id, el);
    } else {
      buttonRefs.current.delete(id);
    }
  }, []);

  // Update indicator position when value changes
  useEffect(() => {
    const updateIndicator = () => {
      const activeButton = buttonRefs.current.get(value);
      const container = containerRef.current;
      if (activeButton && container) {
        const containerRect = container.getBoundingClientRect();
        const buttonRect = activeButton.getBoundingClientRect();
        setIndicatorStyle({
          left: buttonRect.left - containerRect.left,
          width: buttonRect.width,
        });
      }
    };

    updateIndicator();

    window.addEventListener('resize', updateIndicator);
    return () => window.removeEventListener('resize', updateIndicator);
  }, [value]);

  return (
    <div ref={containerRef} className="flex rounded-xl filter-btn-group overflow-hidden relative">
      {/* Sliding indicator */}
      <div
        className="absolute top-0 h-full filter-btn-active rounded-xl transition-all duration-200 ease-stoody pointer-events-none"
        style={{
          left: indicatorStyle.left,
          width: indicatorStyle.width,
          opacity: indicatorStyle.width > 0 ? 1 : 0,
        }}
      />
      {options.map((opt) => (
        <button
          key={opt.value}
          ref={setButtonRef(opt.value)}
          type="button"
          onClick={() => onChange(opt.value)}
          aria-pressed={value === opt.value}
          aria-label={opt.ariaLabel}
          title={opt.ariaLabel}
          className={`filter-btn ${opt.iconOnly ? 'p-2.5 min-h-[38px] min-w-[38px] flex items-center justify-center' : 'px-3.5 py-2 min-h-[38px] flex items-center gap-1.5'} text-sm font-medium transition-colors duration-150 select-none relative z-[1] ${
            value === opt.value
              ? 'text-accent-primary'
              : 'text-text-secondary hover:text-text-primary'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}) as <T extends string>(props: {
  options: FilterOption<T>[];
  value: T;
  onChange: (value: T) => void;
}) => React.ReactElement;

const FilteredEmptyState = memo(function FilteredEmptyState({
  query,
  onClear,
}: {
  query: string;
  onClear: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-text-secondary page-transition">
      <div className="relative mb-4">
        <div className="absolute -inset-4 bg-accent-primary/5 rounded-full blur-xl" />
        <div className="relative p-4 bg-bg-surface rounded-2xl border border-white/[0.05]">
          <SearchIcon className="w-10 h-10 text-text-secondary/50" />
        </div>
      </div>
      <p className="text-lg font-semibold text-text-primary mb-1">No matches found</p>
      <p className="text-sm text-text-secondary/70 mb-6">
        {query ? `No titles match "${query}".` : 'Try adjusting your filters.'}
      </p>
      <button
        type="button"
        onClick={onClear}
        className="min-h-[44px] px-5 py-2.5 rounded-xl bg-accent-primary/15 text-accent-primary text-sm font-medium hover:bg-accent-primary/25 transition-colors active:scale-[0.97]"
      >
        Clear filters
      </button>
    </div>
  );
});

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

function DisconnectedIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
    </svg>
  );
}

function BookStackIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      {/* Bottom book */}
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 19.5A2.5 2.5 0 016.5 17H20" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" />
      {/* Book pages decoration */}
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h8M8 11h6" />
    </svg>
  );
}

function PlayCircleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <circle cx="12" cy="12" r="10" />
      <polygon points="10 8 16 12 10 16 10 8" fill="currentColor" stroke="none" />
    </svg>
  );
}

function LibraryIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z" />
    </svg>
  );
}

const SectionHeader = memo(function SectionHeader({ children, icon }: { children: React.ReactNode; icon?: React.ReactNode }) {
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
});

function GridViewIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}

function ListViewIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" strokeLinecap="round" />
      <line x1="3" y1="12" x2="3.01" y2="12" strokeLinecap="round" />
      <line x1="3" y1="18" x2="3.01" y2="18" strokeLinecap="round" />
    </svg>
  );
}
