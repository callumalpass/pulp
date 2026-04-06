import { memo, useCallback, useEffect, useRef, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import type {
  ProgressFilter,
  SearchMode,
  SortOption,
  TypeFilter,
  ViewMode,
} from '../../stores/libraryFilters';

export interface FilterOption<T extends string> {
  value: T;
  label: ReactNode;
  ariaLabel?: string;
  iconOnly?: boolean;
}

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

export const TYPE_FILTER_OPTIONS: FilterOption<TypeFilter>[] = [
  { value: 'all', label: 'All' },
  { value: 'pdf', label: 'PDF' },
  { value: 'epub', label: 'EPUB' },
];

export const PROGRESS_FILTER_OPTIONS: FilterOption<ProgressFilter>[] = (
  Object.keys(PROGRESS_LABELS) as ProgressFilter[]
).map((key) => ({ value: key, label: PROGRESS_LABELS[key] }));

export const SORT_FILTER_OPTIONS: FilterOption<SortOption>[] = (
  Object.keys(SORT_LABELS) as SortOption[]
).map((key) => ({ value: key, label: SORT_LABELS[key] }));

export const SEARCH_MODE_OPTIONS: FilterOption<SearchMode>[] = [
  {
    value: 'title',
    label: (
      <>
        <TitleIcon className="w-4 h-4" />
        <span className="hidden sm:inline">Title</span>
      </>
    ),
    ariaLabel: 'Title search mode',
  },
  {
    value: 'content',
    label: (
      <>
        <ContentIcon className="w-4 h-4" />
        <span className="hidden sm:inline">Content</span>
      </>
    ),
    ariaLabel: 'Content search mode',
  },
];

export const VIEW_MODE_OPTIONS: FilterOption<ViewMode>[] = [
  {
    value: 'grid',
    label: <GridViewIcon className="w-4 h-4" />,
    ariaLabel: 'Grid view',
    iconOnly: true,
  },
  {
    value: 'list',
    label: <ListViewIcon className="w-4 h-4" />,
    ariaLabel: 'List view',
    iconOnly: true,
  },
];

export const FilterButtonGroup = memo(function FilterButtonGroup<T extends string>({
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

  const setButtonRef = useCallback(
    (id: string) => (el: HTMLButtonElement | null) => {
      if (el) {
        buttonRefs.current.set(id, el);
      } else {
        buttonRefs.current.delete(id);
      }
    },
    []
  );

  const updateIndicator = useCallback(() => {
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
  }, [value]);

  useEffect(() => {
    updateIndicator();
  }, [updateIndicator]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(updateIndicator);
    observer.observe(container);
    return () => observer.disconnect();
  }, [updateIndicator]);

  return (
    <div
      ref={containerRef}
      className="flex rounded-xl filter-btn-group overflow-hidden relative"
    >
      <div
        className="absolute top-0 left-0 h-full filter-btn-active rounded-xl transition-[transform,width,opacity] duration-200 ease-out pointer-events-none"
        style={{
          transform: `translateX(${indicatorStyle.left}px)`,
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
          className={`filter-btn ${
            opt.iconOnly
              ? 'p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center'
              : 'px-3.5 py-2 min-h-[44px] flex items-center gap-1.5'
          } text-sm transition-colors duration-150 select-none relative z-[1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary focus-visible:ring-inset rounded-xl ${
            value === opt.value
              ? 'text-accent-primary font-semibold'
              : 'text-text-secondary font-medium hover:text-text-primary'
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
}) => ReactElement;

export const FilteredEmptyState = memo(function FilteredEmptyState({
  query,
  onClear,
}: {
  query: string;
  onClear: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-text-secondary page-transition">
      <div className="relative mb-5">
        <div className="absolute -inset-4 bg-accent-primary/5 rounded-full blur-xl" />
        <div className="relative p-4 bg-bg-surface rounded-2xl border border-subtle animate-search-peek">
          <SearchIcon className="w-10 h-10 text-text-secondary" />
        </div>
      </div>
      <p className="text-lg font-semibold text-text-primary mb-1">Nothing here</p>
      <p className="text-sm text-text-secondary mb-6 text-center max-w-xs">
        {query ? (
          <>
            No books matching{' '}
            <span className="text-text-primary font-medium">"{query}"</span>. Maybe
            it's on your to-read list?
          </>
        ) : (
          'No books match these filters. Try loosening things up.'
        )}
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

export const SectionHeader = memo(function SectionHeader({
  children,
  icon,
}: {
  children: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 mb-4">
      {icon && <span className="text-accent-primary/70">{icon}</span>}
      <h2 className="text-[0.8125rem] font-semibold tracking-wider text-text-secondary uppercase">
        {children}
      </h2>
    </div>
  );
});

export function SearchIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
      />
    </svg>
  );
}

export function XIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function TitleIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z"
      />
    </svg>
  );
}

function ContentIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
      />
    </svg>
  );
}

export function SortAscIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 4h13M3 8h9M3 12h5m8-4v12m0 0l-4-4m4 4l4-4"
      />
    </svg>
  );
}

export function SortDescIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 4h13M3 8h9M3 12h5m8 0v12m0-12l4 4m-4-4l-4 4"
      />
    </svg>
  );
}

export function FilterIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
      />
    </svg>
  );
}

export function DisconnectedIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
      />
    </svg>
  );
}

export function BookStackIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 19.5A2.5 2.5 0 016.5 17H20" />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"
      />
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h8M8 11h6" />
    </svg>
  );
}

export function PlayCircleIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <circle cx="12" cy="12" r="10" />
      <polygon points="10 8 16 12 10 16 10 8" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function LibraryIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z"
      />
    </svg>
  );
}

export function GridViewIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}

export function ListViewIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" strokeLinecap="round" />
      <line x1="3" y1="12" x2="3.01" y2="12" strokeLinecap="round" />
      <line x1="3" y1="18" x2="3.01" y2="18" strokeLinecap="round" />
    </svg>
  );
}

export function KeyboardIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path
        d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M6 12h.01M10 12h.01M14 12h.01M18 12h.01M8 16h8"
        strokeLinecap="round"
      />
    </svg>
  );
}
