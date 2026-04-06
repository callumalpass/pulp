import { useEffect } from 'react';
import type { SortOption, SortOrder, TypeFilter, ProgressFilter, TagMatchMode } from '../../stores/libraryFilters';

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

interface MobileLibraryFiltersProps {
  dialogId?: string;
  typeFilter: TypeFilter;
  progressFilter: ProgressFilter;
  includedTags: string[];
  excludedTags: string[];
  tagMatchMode: TagMatchMode;
  showTagFilters: boolean;
  sort: SortOption;
  sortOrder: SortOrder;
  availableTags: Array<{ key: string; label: string; count: number }>;
  onTypeChange: (type: TypeFilter) => void;
  onProgressChange: (progress: ProgressFilter) => void;
  onCycleTag: (tagKey: string) => void;
  onTagMatchModeChange: (mode: TagMatchMode) => void;
  onShowTagFiltersChange: (show: boolean) => void;
  onSortChange: (sort: SortOption) => void;
  onSortOrderToggle: () => void;
  onClearFilters: () => void;
  hasActiveFilters: boolean;
  onClose: () => void;
}

export function MobileLibraryFilters({
  dialogId = 'mobile-library-filters',
  typeFilter,
  progressFilter,
  includedTags,
  excludedTags,
  tagMatchMode,
  showTagFilters,
  sort,
  sortOrder,
  availableTags,
  onTypeChange,
  onProgressChange,
  onCycleTag,
  onTagMatchModeChange,
  onShowTagFiltersChange,
  onSortChange,
  onSortOrderToggle,
  onClearFilters,
  hasActiveFilters,
  onClose,
}: MobileLibraryFiltersProps) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  useEffect(() => {
    if (includedTags.length > 0 || excludedTags.length > 0) {
      onShowTagFiltersChange(true);
    }
  }, [includedTags, excludedTags, onShowTagFiltersChange]);

  const handleTypeSelect = (type: TypeFilter) => {
    onTypeChange(type);
  };

  const handleProgressSelect = (progress: ProgressFilter) => {
    onProgressChange(progress);
  };

  const handleSortSelect = (sortOption: SortOption) => {
    onSortChange(sortOption);
  };

  const tagStateFor = (tagKey: string): 'off' | 'include' | 'exclude' => {
    if (includedTags.includes(tagKey)) return 'include';
    if (excludedTags.includes(tagKey)) return 'exclude';
    return 'off';
  };

  const handleClearAndClose = () => {
    onClearFilters();
    onClose();
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="mobile-bottom-sheet-backdrop animate-fade-in"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Bottom Sheet */}
      <div
        className="mobile-bottom-sheet animate-slide-up pb-safe"
        id={dialogId}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${dialogId}-title`}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-text-secondary/30 rounded-full" />
        </div>

        {/* Header with title and close button */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-text-secondary/10">
          <h2 id={`${dialogId}-title`} className="text-base font-semibold text-text-primary">Filters</h2>
          <button
            onClick={onClose}
            type="button"
            className="px-4 py-1.5 text-sm font-semibold bg-accent-primary text-white rounded-lg transition-[background-color,transform] duration-150 hover:bg-accent-primary/90 active:scale-95"
            aria-label="Close filters"
          >
            Done
          </button>
        </div>

        {/* Menu Content */}
        <div className="px-4 py-4 pb-6 max-h-[60vh] overflow-y-auto space-y-5">
          {/* Type Filter */}
          <section className="bg-bg-deep/50 rounded-2xl p-4">
            <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-3 flex items-center gap-2">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-accent-primary">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
              Type
            </h3>
            <div className="grid grid-cols-3 gap-2">
              <FilterButton
                active={typeFilter === 'all'}
                onClick={() => handleTypeSelect('all')}
                icon={
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="3" width="7" height="7" rx="1" />
                    <rect x="14" y="3" width="7" height="7" rx="1" />
                    <rect x="3" y="14" width="7" height="7" rx="1" />
                    <rect x="14" y="14" width="7" height="7" rx="1" />
                  </svg>
                }
              >
                All
              </FilterButton>
              <FilterButton
                active={typeFilter === 'pdf'}
                onClick={() => handleTypeSelect('pdf')}
                icon={
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                }
              >
                PDF
              </FilterButton>
              <FilterButton
                active={typeFilter === 'epub'}
                onClick={() => handleTypeSelect('epub')}
                icon={
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                  </svg>
                }
              >
                EPUB
              </FilterButton>
            </div>
          </section>

          {/* Status Filter */}
          <section className="bg-bg-deep/50 rounded-2xl p-4">
            <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-3 flex items-center gap-2">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-accent-primary">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
              Status
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(PROGRESS_LABELS) as ProgressFilter[]).map((key) => (
                <FilterButton
                  key={key}
                  active={progressFilter === key}
                  onClick={() => handleProgressSelect(key)}
                >
                  {PROGRESS_LABELS[key]}
                </FilterButton>
              ))}
            </div>
          </section>

          {availableTags.length > 0 && (
            <section className="bg-bg-deep/50 rounded-2xl p-4">
              <button
                type="button"
                onClick={() => onShowTagFiltersChange(!showTagFilters)}
                className="w-full flex items-center justify-between gap-3 text-left"
                aria-expanded={showTagFilters}
                aria-controls={`${dialogId}-tag-filters`}
              >
                <span className="text-xs font-semibold text-text-secondary uppercase tracking-wide flex items-center gap-2">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-accent-primary">
                    <path d="M20 10V4a2 2 0 0 0-2-2h-6L2 12l10 10 10-10V10z" />
                    <circle cx="15" cy="7" r="1.5" />
                  </svg>
                  Tags
                  {(includedTags.length > 0 || excludedTags.length > 0) && (
                    <span className="rounded-full bg-accent-primary/15 px-2 py-0.5 text-[10px] text-accent-primary">
                      {includedTags.length + excludedTags.length}
                    </span>
                  )}
                </span>
                <span className="text-text-secondary text-sm">{showTagFilters ? 'Hide' : 'Show'}</span>
              </button>
              {showTagFilters && (
                <div id={`${dialogId}-tag-filters`} className="mt-3">
                  <div className="flex flex-wrap items-center gap-2 mb-3">
                    <button
                      type="button"
                      onClick={() => onTagMatchModeChange('any')}
                      className={`rounded-lg px-2.5 py-1 text-xs ${
                        tagMatchMode === 'any'
                          ? 'bg-accent-primary text-white'
                          : 'bg-bg-surface border border-subtle text-text-secondary'
                      }`}
                    >
                      Match any
                    </button>
                    <button
                      type="button"
                      onClick={() => onTagMatchModeChange('all')}
                      className={`rounded-lg px-2.5 py-1 text-xs ${
                        tagMatchMode === 'all'
                          ? 'bg-accent-primary text-white'
                          : 'bg-bg-surface border border-subtle text-text-secondary'
                      }`}
                    >
                      Match all
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {availableTags.map((tag) => {
                      const state = tagStateFor(tag.key);
                      const stateClass =
                        state === 'include'
                          ? 'border-emerald-400/50 bg-emerald-500/15 text-emerald-300'
                          : state === 'exclude'
                            ? 'border-rose-400/50 bg-rose-500/15 text-rose-300'
                            : 'border-subtle bg-bg-surface text-text-secondary';

                      return (
                        <button
                          key={tag.key}
                          type="button"
                          onClick={() => onCycleTag(tag.key)}
                          className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${stateClass}`}
                        >
                          #{tag.label}
                          <span className="ml-1 opacity-70">{tag.count}</span>
                        </button>
                      );
                    })}
                  </div>
                  <p className="mt-3 text-xs text-text-secondary">
                    Tap once to include, again to exclude, and a third time to clear.
                  </p>
                </div>
              )}
            </section>
          )}

          {/* Sort Options */}
          <section className="bg-bg-deep/50 rounded-2xl p-4">
            <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-3 flex items-center gap-2">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-accent-primary">
                <path d="M3 4h13M3 8h9M3 12h5m8-4v12m0 0l-4-4m4 4l4-4" />
              </svg>
              Sort By
            </h3>
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(SORT_LABELS) as SortOption[]).map((key) => (
                <FilterButton
                  key={key}
                  active={sort === key}
                  onClick={() => handleSortSelect(key)}
                >
                  {SORT_LABELS[key]}
                </FilterButton>
              ))}
            </div>
            {/* Sort Order Toggle */}
            <button
              onClick={onSortOrderToggle}
              type="button"
              className="mt-3 w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-bg-surface border border-subtle text-text-primary transition-[background-color,transform] duration-150 active:scale-[0.98] active:bg-accent-primary/10"
              aria-label={`Sort order: ${sortOrder === 'asc' ? 'ascending' : 'descending'}`}
            >
              {sortOrder === 'asc' ? (
                <>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-accent-primary">
                    <path d="M3 4h13M3 8h9M3 12h5m8-4v12m0 0l-4-4m4 4l4-4" />
                  </svg>
                  <span className="text-sm font-medium">Ascending</span>
                </>
              ) : (
                <>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-accent-primary">
                    <path d="M3 4h13M3 8h9M3 12h5m8 0v12m0-12l4 4m-4-4l-4 4" />
                  </svg>
                  <span className="text-sm font-medium">Descending</span>
                </>
              )}
            </button>
          </section>

          {/* Clear Filters Action */}
          {hasActiveFilters && (
            <button
              onClick={handleClearAndClose}
              type="button"
              className="w-full py-3.5 px-4 rounded-xl bg-accent-primary/20 text-accent-primary font-semibold text-sm transition-[background-color,transform] duration-150 active:scale-[0.98] active:bg-accent-primary/30 border border-accent-primary/30"
            >
              Clear All Filters
            </button>
          )}
        </div>
      </div>
    </>
  );
}

interface FilterButtonProps {
  children: React.ReactNode;
  onClick: () => void;
  active?: boolean;
  icon?: React.ReactNode;
}

function FilterButton({ children, onClick, active, icon }: FilterButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`touch-target flex flex-col items-center justify-center gap-1 p-3 rounded-xl transition-[color,background-color,transform] duration-150 select-none active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg-deep ${
        active
          ? 'bg-accent-primary/20 text-accent-primary'
          : 'bg-bg-deep text-text-primary hover:bg-bg-deep/80 active:bg-accent-primary/10'
      }`}
    >
      {icon}
      <span className="text-xs font-medium">{children}</span>
    </button>
  );
}
