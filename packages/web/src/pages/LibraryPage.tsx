import { useState, useMemo, useEffect, useDeferredValue, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
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
import { LibraryShortcutsPanel } from '../components/library/LibraryShortcutsPanel';
import { LibraryStats } from '../components/library/LibraryStats';
import { Button } from '../components/ui/Button';
import { useLibraryFiltersStore, type ViewMode } from '../stores/libraryFilters';
import { usePreferencesStore } from '../stores/preferences';
import { filterNotes, hasActiveFilters as computeHasActiveFilters, countActiveFilters, findContinueReadingBook, excludeContinueReadingBook } from '../lib/library-filters';
import type { LiteratureNoteSummary } from '@pulp/shared';
import {
  BookStackIcon,
  DisconnectedIcon,
  FilteredEmptyState,
  FilterButtonGroup,
  FilterIcon,
  GridViewIcon,
  KeyboardIcon,
  LibraryIcon,
  ListViewIcon,
  PlayCircleIcon,
  PROGRESS_FILTER_OPTIONS,
  SEARCH_MODE_OPTIONS,
  SearchIcon,
  SectionHeader,
  SORT_FILTER_OPTIONS,
  SortAscIcon,
  SortDescIcon,
  TYPE_FILTER_OPTIONS,
  VIEW_MODE_OPTIONS,
  XIcon,
} from './library/libraryPageUi';

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
  const [showShortcuts, setShowShortcuts] = useState(false);
  const deferredQuery = useDeferredValue(searchQuery);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const continueReadingRef = useRef<LiteratureNoteSummary | null>(null);

  // Global keyboard shortcuts: "/" to focus search, "?" to toggle shortcuts help, "c" to continue reading
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const isInput =
        document.activeElement?.tagName === 'INPUT' ||
        document.activeElement?.tagName === 'TEXTAREA' ||
        document.activeElement?.getAttribute('contenteditable');

      if (e.key === '/' && !isInput) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }

      if (e.key === '?' && !isInput) {
        e.preventDefault();
        setShowShortcuts(prev => !prev);
      }

      if (e.key === 'c' && !isInput) {
        const book = continueReadingRef.current;
        if (book) {
          e.preventDefault();
          navigate(`/read/${book.id}`);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [navigate]);

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
  const einkMode = usePreferencesStore((state) => state.einkMode);
  const { status: connectionStatus } = useConnection();
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
    return filterNotes(notes, {
      searchQuery: deferredQuery,
      searchMode,
      typeFilter,
      progressFilter,
      collectionFilter,
    });
  }, [notes, deferredQuery, typeFilter, progressFilter, collectionFilter, searchMode]);

  // Memoize filter calculations to prevent recalculation on unrelated state changes
  const hasActiveFilters = useMemo(() =>
    computeHasActiveFilters(searchQuery, typeFilter, progressFilter, collectionFilter),
    [searchQuery, typeFilter, progressFilter, collectionFilter]
  );

  // Count active filters for badge display
  const activeFilterCount = useMemo(() =>
    countActiveFilters(typeFilter, progressFilter, collectionFilter),
    [typeFilter, progressFilter, collectionFilter]
  );

  // Get available collections
  const availableCollections = collectionsData?.collections || [];
  // E-ink mode prioritizes readability and fast refresh; force list rendering
  // while preserving the stored preference for standard mode.
  const effectiveViewMode: ViewMode = einkMode ? 'list' : viewMode;

  const handleClearFilters = useCallback(() => {
    setSearchQuery('');
    clearFilters();
  }, [clearFilters]);

  const isShowingSearchResults = searchMode === 'content' && debouncedQuery.length >= 2;

  // Find the most recently read book that's still in progress for "Continue Reading"
  const continueReadingBook = useMemo(() => {
    if (!notes) return null;
    return findContinueReadingBook(notes);
  }, [notes]);

  // Keep ref in sync for keyboard shortcut handler
  continueReadingRef.current = continueReadingBook;

  // When the continue-reading card is visible, suppress that book from the
  // grid/list to avoid showing it twice on screen.
  const showContinueReading = !hasActiveFilters && !isShowingSearchResults && !!continueReadingBook;
  const gridNotes = useMemo(() => {
    if (!showContinueReading) return filteredNotes;
    return excludeContinueReadingBook(filteredNotes, continueReadingBook);
  }, [filteredNotes, showContinueReading, continueReadingBook]);

  // Show connection error when disconnected and we have no cached data to display.
  // During the initial load (isLoading), always prefer the skeleton so users see
  // a loading state rather than an immediate "Connection Lost" message.
  const showConnectionError = connectionStatus === 'disconnected' && !notes && !isLoading;

  if (isLoading) {
    return (
      <div className="p-6 page-transition" role="status" aria-label="Loading library">
        <span className="sr-only">Loading your library...</span>
        {/* Search bar skeleton */}
        <div className="flex flex-col gap-4 mb-6">
          <div className="flex gap-2">
            <div className="flex-1 h-11 skeleton rounded-xl" />
            {/* Search mode toggle skeleton (Title / Content) */}
            <div className="w-40 h-11 skeleton rounded-xl" />
          </div>
          {/* Filter row skeleton — matches the two-row Type/Status + Sort layout */}
          {!isMobile && (
            <div className="flex flex-wrap items-center gap-3 gap-y-3">
              {/* Type label + buttons */}
              <div className="w-8 h-4 skeleton rounded" />
              <div className="w-32 h-9 skeleton rounded-xl" />
              {/* Status label + buttons */}
              <div className="w-10 h-4 skeleton rounded" />
              <div className="w-48 h-9 skeleton rounded-xl" />
              {/* Collection dropdown */}
              <div className="w-16 h-4 skeleton rounded" />
              <div className="w-24 h-9 skeleton rounded-xl" />
              <div className="flex-1 min-w-[2rem]" />
              {/* View toggle */}
              <div className="w-8 h-4 skeleton rounded" />
              <div className="w-20 h-9 skeleton rounded-xl" />
              {/* Sort buttons + order toggle */}
              <div className="w-8 h-4 skeleton rounded" />
              <div className="w-64 h-9 skeleton rounded-xl" />
              <div className="w-11 h-9 skeleton rounded-xl" />
              {/* Keyboard shortcuts */}
              <div className="w-11 h-9 skeleton rounded-lg" />
            </div>
          )}
        </div>

        {/* Stats bar skeleton */}
        <div className="mb-6">
          <div className="flex items-center gap-6">
            <div className="w-28 h-4 skeleton rounded" />
            <div className="w-20 h-4 skeleton rounded" />
            <div className="w-20 h-4 skeleton rounded" />
            <div className="w-24 h-4 skeleton rounded" />
          </div>
        </div>

        {/* Continue Reading skeleton */}
        <div className="mb-8">
          <div className="w-36 h-4 skeleton rounded mb-4" />
          <ContinueReadingCardSkeleton />
        </div>

        {/* Library grid skeleton */}
        <div className="w-20 h-4 skeleton rounded mb-4" />
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
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
        <p className="text-text-secondary text-sm text-center max-w-md mb-8 leading-relaxed">
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
          <div className="relative flex-1 group/search" role="search" aria-label="Search library">
            <SearchIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary transition-colors group-focus-within/search:text-accent-primary" />
            <input
              ref={searchInputRef}
              type="search"
              placeholder={searchMode === 'title' ? 'Search by title...' : 'Search document contents...'}
              aria-label={searchMode === 'title' ? 'Search by title' : 'Search document contents'}
              aria-describedby="search-shortcut-hint"
              aria-keyshortcuts="/"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  searchInputRef.current?.blur();
                }
              }}
              className="w-full pl-10 pr-12 py-2.5 bg-bg-surface border border-subtle rounded-xl text-text-primary placeholder:text-text-secondary/60 focus:outline-none focus:ring-2 focus:ring-accent-primary/30 focus:border-accent-primary/50 focus-visible:ring-2 focus-visible:ring-accent-primary/40 focus-visible:border-accent-primary/50 transition-[border-color,box-shadow] duration-200 hover:border-text-secondary/30"
            />
            {/* Keyboard shortcut hint */}
            <span id="search-shortcut-hint" className="sr-only">Press / to focus search</span>
            {!searchQuery && (
              <kbd className="absolute right-3 top-1/2 -translate-y-1/2 hidden sm:flex items-center justify-center w-5 h-5 text-xs font-mono text-text-secondary/50 border border-text-secondary/20 rounded group-focus-within/search:opacity-0 transition-opacity duration-150 pointer-events-none" aria-hidden="true">/</kbd>
            )}
            <button
              onClick={() => setSearchQuery('')}
              type="button"
              aria-label="Clear search"
              className={`absolute right-1 top-1/2 -translate-y-1/2 z-10 w-11 h-11 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-text-secondary hover:text-text-primary hover:bg-bg-deep/50 transition-[color,background-color,opacity] duration-150 ${
                searchQuery
                  ? 'opacity-100'
                  : 'opacity-0 pointer-events-none'
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
              {/* View mode toggle on mobile (hidden in e-ink mode; list is forced) */}
              {!einkMode && (
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
              )}
              {/* Sort order button on mobile */}
              <button
                onClick={toggleSortOrder}
                type="button"
                className="w-11 h-11 flex items-center justify-center rounded-xl bg-bg-surface border border-text-secondary/20 text-text-secondary hover:text-text-primary hover:bg-bg-deep hover:border-text-secondary/40 transition-colors active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary"
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
            <div className="flex flex-wrap items-center gap-3 gap-y-3">
              {/* Type filter */}
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-text-secondary uppercase tracking-wider font-medium">Type</span>
                <FilterButtonGroup
                  options={TYPE_FILTER_OPTIONS}
                  value={typeFilter}
                  onChange={handleTypeFilter}
                />
              </div>

              {/* Progress filter */}
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-text-secondary uppercase tracking-wider font-medium">Status</span>
                <FilterButtonGroup
                  options={PROGRESS_FILTER_OPTIONS}
                  value={progressFilter}
                  onChange={handleProgressFilter}
                />
              </div>

              {/* Collection filter */}
              {availableCollections.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-text-secondary uppercase tracking-wider font-medium">Collection</span>
                  <select
                    value={collectionFilter || ''}
                    onChange={(e) => setCollectionFilter(e.target.value || null)}
                    aria-label="Filter by collection"
                    className="collection-select px-3 py-2 text-sm bg-bg-surface border border-subtle rounded-xl text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50 focus-visible:border-accent-primary/50 min-h-[44px]"
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

              {/* Spacer — flexible so right-side controls align right; on narrow
                   widths this collapses, allowing items to wrap naturally. */}
              <div className="flex-1 min-w-[2rem]" />

              {/* View mode toggle (hidden in e-ink mode; list is forced) */}
              {!einkMode && (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-text-secondary uppercase tracking-wider font-medium">View</span>
                  <FilterButtonGroup
                    options={VIEW_MODE_OPTIONS}
                    value={viewMode}
                    onChange={setViewMode}
                  />
                </div>
              )}

              {/* Sort controls */}
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-text-secondary uppercase tracking-wider font-medium">Sort</span>
                <FilterButtonGroup
                  options={SORT_FILTER_OPTIONS}
                  value={sort}
                  onChange={handleSortChange}
                />
                <button
                  onClick={toggleSortOrder}
                  type="button"
                  className={`w-11 h-11 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl filter-btn-group hover:text-accent-primary hover:bg-bg-deep transition-[color,background-color,transform] duration-150 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary ${
                    sortOrder === 'asc'
                      ? 'text-accent-primary bg-accent-primary/10'
                      : 'text-text-secondary'
                  }`}
                  title={sortOrder === 'asc' ? 'Sort ascending — click to switch to descending' : 'Sort descending — click to switch to ascending'}
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

              {/* Keyboard shortcuts help */}
              <button
                onClick={() => setShowShortcuts(true)}
                type="button"
                className="w-11 h-11 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-text-secondary/70 hover:text-text-primary hover:bg-bg-deep transition-[color,background-color] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary"
                title="Keyboard shortcuts (?)"
                aria-label="Show keyboard shortcuts"
              >
                <KeyboardIcon className="w-4 h-4" />
              </button>
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
                className="text-accent-primary hover:underline transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg-deep rounded"
              >
                Clear filters
              </button>
            </div>
        )}
      </div>

      {/* Reading stats bar */}
      {!isShowingSearchResults && !hasActiveFilters && (
        <div className="mb-4 min-w-0">
          <LibraryStats />
        </div>
      )}

      {/* Continue Reading Section */}
      {!isShowingSearchResults && !hasActiveFilters && (
        isLoading ? (
          <div className="mb-6">
            <SectionHeader icon={<PlayCircleIcon className="w-4 h-4" />}>
              Continue Reading
            </SectionHeader>
            <ContinueReadingCardSkeleton />
          </div>
        ) : continueReadingBook ? (
          <div className="mb-6">
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
          {!hasActiveFilters && continueReadingBook && !filteredNotes.some(n => n.pinned) && (
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
            <div key={effectiveViewMode} className="view-switch-enter">
              {effectiveViewMode === 'list' ? (
                <LibraryListView notes={gridNotes} />
              ) : (
                <LibraryGrid notes={gridNotes} />
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

      {/* Keyboard shortcuts help */}
      <LibraryShortcutsPanel
        isOpen={showShortcuts}
        onClose={() => setShowShortcuts(false)}
      />
    </div>
  );
}
