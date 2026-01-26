import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type SortOption = 'lastRead' | 'title' | 'progress' | 'dateCreated' | 'author' | 'rating';
export type SortOrder = 'asc' | 'desc';
export type TypeFilter = 'all' | 'pdf' | 'epub';
export type ProgressFilter = 'all' | 'unread' | 'reading' | 'completed';
export type SearchMode = 'title' | 'content';

interface LibraryFiltersState {
  // Persisted filter preferences
  sort: SortOption;
  sortOrder: SortOrder;
  typeFilter: TypeFilter;
  progressFilter: ProgressFilter;
  searchMode: SearchMode;

  // Actions
  setSort: (sort: SortOption) => void;
  setSortOrder: (order: SortOrder) => void;
  toggleSortOrder: () => void;
  setTypeFilter: (filter: TypeFilter) => void;
  setProgressFilter: (filter: ProgressFilter) => void;
  setSearchMode: (mode: SearchMode) => void;
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
      searchMode: 'title',

      // Actions
      setSort: (sort) => set({ sort }),
      setSortOrder: (sortOrder) => set({ sortOrder }),
      toggleSortOrder: () => set({ sortOrder: get().sortOrder === 'asc' ? 'desc' : 'asc' }),
      setTypeFilter: (typeFilter) => set({ typeFilter }),
      setProgressFilter: (progressFilter) => set({ progressFilter }),
      setSearchMode: (searchMode) => set({ searchMode }),
      clearFilters: () => set({
        typeFilter: 'all',
        progressFilter: 'all',
        // Don't clear sort preferences as they're more like display preferences
      }),
    }),
    {
      name: 'pulp-library-filters',
    }
  )
);
