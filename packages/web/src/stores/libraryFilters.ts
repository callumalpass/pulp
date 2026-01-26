import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type SortOption = 'lastRead' | 'title' | 'progress' | 'dateCreated' | 'author' | 'rating';
export type SortOrder = 'asc' | 'desc';
export type TypeFilter = 'all' | 'pdf' | 'epub';
export type ProgressFilter = 'all' | 'unread' | 'reading' | 'completed';
export type SearchMode = 'title' | 'content';
export type ViewMode = 'grid' | 'list';

interface LibraryFiltersState {
  // Persisted filter preferences
  sort: SortOption;
  sortOrder: SortOrder;
  typeFilter: TypeFilter;
  progressFilter: ProgressFilter;
  collectionFilter: string | null; // null means no collection filter
  searchMode: SearchMode;
  viewMode: ViewMode;

  // Actions
  setSort: (sort: SortOption) => void;
  setSortOrder: (order: SortOrder) => void;
  toggleSortOrder: () => void;
  setTypeFilter: (filter: TypeFilter) => void;
  setProgressFilter: (filter: ProgressFilter) => void;
  setCollectionFilter: (collection: string | null) => void;
  setSearchMode: (mode: SearchMode) => void;
  setViewMode: (mode: ViewMode) => void;
  clearFilters: () => void;
}

export const useLibraryFiltersStore = create<LibraryFiltersState>()(
  persist(
    (set, get) => ({
      // Default values
      sort: 'lastRead',
      sortOrder: 'desc',
      typeFilter: 'all',
      progressFilter: 'all',
      collectionFilter: null,
      searchMode: 'title',
      viewMode: 'grid',

      // Actions
      setSort: (sort) => set({ sort }),
      setSortOrder: (sortOrder) => set({ sortOrder }),
      toggleSortOrder: () => set({ sortOrder: get().sortOrder === 'asc' ? 'desc' : 'asc' }),
      setTypeFilter: (typeFilter) => set({ typeFilter }),
      setProgressFilter: (progressFilter) => set({ progressFilter }),
      setCollectionFilter: (collectionFilter) => set({ collectionFilter }),
      setSearchMode: (searchMode) => set({ searchMode }),
      setViewMode: (viewMode) => set({ viewMode }),
      clearFilters: () => set({
        typeFilter: 'all',
        progressFilter: 'all',
        collectionFilter: null,
        // Don't clear sort/view preferences as they're more like display preferences
      }),
    }),
    {
      name: 'pulp-library-filters',
    }
  )
);
