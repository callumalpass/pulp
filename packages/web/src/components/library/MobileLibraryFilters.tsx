import { useEffect } from 'react';
import type { SortOption, SortOrder, TypeFilter, ProgressFilter } from '../../stores/libraryFilters';

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
  sort: SortOption;
  sortOrder: SortOrder;
  onTypeChange: (type: TypeFilter) => void;
  onProgressChange: (progress: ProgressFilter) => void;
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
  sort,
  sortOrder,
  onTypeChange,
  onProgressChange,
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

  const handleTypeSelect = (type: TypeFilter) => {
    onTypeChange(type);
  };

  const handleProgressSelect = (progress: ProgressFilter) => {
    onProgressChange(progress);
  };

  const handleSortSelect = (sortOption: SortOption) => {
    onSortChange(sortOption);
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
        aria-label="Library filters"
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-text-secondary/30 rounded-full" />
        </div>

        {/* Header with title and close button */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-text-secondary/10">
          <h2 className="text-base font-semibold text-text-primary">Filters</h2>
          <button
            onClick={onClose}
            type="button"
            className="px-4 py-1.5 text-sm font-semibold bg-accent-primary text-white rounded-lg transition-all duration-150 hover:bg-accent-primary/90 active:scale-95"
            aria-label="Close filters"
          >
            Done
          </button>
        </div>

        {/* Menu Content */}
        <div className="px-4 py-4 pb-6 max-h-[60vh] overflow-y-auto">
          {/* Type Filter */}
          <div className="mb-6">
            <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-3">
              Type
            </h3>
            <div className="grid grid-cols-3 gap-2">
              <FilterButton
                active={typeFilter === 'all'}
                onClick={() => handleTypeSelect('all')}
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
          </div>

          {/* Status Filter */}
          <div className="mb-6">
            <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-3">
              Status
            </h3>
            <div className="grid grid-cols-4 gap-2">
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
          </div>

          {/* Sort Options */}
          <div className="mb-6">
            <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-3">
              Sort By
            </h3>
            <div className="grid grid-cols-4 gap-2">
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
              className="mt-3 w-full flex items-center justify-center gap-2 py-2 px-4 rounded-xl bg-bg-deep text-text-primary transition-all duration-150 active:scale-[0.98] active:bg-accent-primary/10"
              aria-label={`Sort order: ${sortOrder === 'asc' ? 'ascending' : 'descending'}`}
            >
              {sortOrder === 'asc' ? (
                <>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 4h13M3 8h9M3 12h5m8-4v12m0 0l-4-4m4 4l4-4" />
                  </svg>
                  <span className="text-sm">Ascending</span>
                </>
              ) : (
                <>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 4h13M3 8h9M3 12h5m8 0v12m0-12l4 4m-4-4l-4 4" />
                  </svg>
                  <span className="text-sm">Descending</span>
                </>
              )}
            </button>
          </div>

          {/* Clear Filters Action */}
          {hasActiveFilters && (
            <button
              onClick={handleClearAndClose}
              type="button"
              className="w-full py-3 px-4 rounded-xl bg-accent-primary/20 text-accent-primary font-medium text-sm transition-all duration-150 active:scale-[0.98] active:bg-accent-primary/30"
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
      className={`touch-target flex flex-col items-center justify-center gap-1 p-3 rounded-xl transition-all duration-150 select-none active:scale-95 ${
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
