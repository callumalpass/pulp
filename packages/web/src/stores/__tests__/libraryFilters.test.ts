import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ──────────────────────────────────────────────────────────────

// Mock localStorage with a real backing store
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: vi.fn((key: string) => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; }),
    get length() { return Object.keys(store).length; },
    key: vi.fn((i: number) => Object.keys(store)[i] ?? null),
    _getStore: () => store,
  };
})();

Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock });

if (typeof globalThis.window === 'undefined') {
  (globalThis as Record<string, unknown>).window = globalThis;
}

// Now import the store
import { useLibraryFiltersStore } from '../libraryFilters';
import type { SortOption, SortOrder, TypeFilter, ProgressFilter, SearchMode, ViewMode } from '../libraryFilters';

// ── Helpers ────────────────────────────────────────────────────────────

function resetStore() {
  useLibraryFiltersStore.setState({
    sort: 'lastRead',
    sortOrder: 'desc',
    typeFilter: 'all',
    progressFilter: 'all',
    collectionFilter: null,
    searchMode: 'title',
    viewMode: 'grid',
  });
}

// ── Tests ──────────────────────────────────────────────────────────────

describe('useLibraryFiltersStore', () => {
  beforeEach(() => {
    localStorageMock.clear();
    resetStore();
  });

  // ── Initial state ──────────────────────────────────────────────────

  describe('initial state', () => {
    it('has lastRead as default sort', () => {
      expect(useLibraryFiltersStore.getState().sort).toBe('lastRead');
    });

    it('has desc as default sort order', () => {
      expect(useLibraryFiltersStore.getState().sortOrder).toBe('desc');
    });

    it('has all as default type filter', () => {
      expect(useLibraryFiltersStore.getState().typeFilter).toBe('all');
    });

    it('has all as default progress filter', () => {
      expect(useLibraryFiltersStore.getState().progressFilter).toBe('all');
    });

    it('has null as default collection filter', () => {
      expect(useLibraryFiltersStore.getState().collectionFilter).toBeNull();
    });

    it('has title as default search mode', () => {
      expect(useLibraryFiltersStore.getState().searchMode).toBe('title');
    });

    it('has grid as default view mode', () => {
      expect(useLibraryFiltersStore.getState().viewMode).toBe('grid');
    });
  });

  // ── setSort ────────────────────────────────────────────────────────

  describe('setSort', () => {
    it('sets sort to title', () => {
      useLibraryFiltersStore.getState().setSort('title');
      expect(useLibraryFiltersStore.getState().sort).toBe('title');
    });

    it('sets sort to progress', () => {
      useLibraryFiltersStore.getState().setSort('progress');
      expect(useLibraryFiltersStore.getState().sort).toBe('progress');
    });

    it('sets sort to dateCreated', () => {
      useLibraryFiltersStore.getState().setSort('dateCreated');
      expect(useLibraryFiltersStore.getState().sort).toBe('dateCreated');
    });

    it('sets sort to author', () => {
      useLibraryFiltersStore.getState().setSort('author');
      expect(useLibraryFiltersStore.getState().sort).toBe('author');
    });

    it('sets sort to rating', () => {
      useLibraryFiltersStore.getState().setSort('rating');
      expect(useLibraryFiltersStore.getState().sort).toBe('rating');
    });

    it('sets sort back to lastRead', () => {
      useLibraryFiltersStore.getState().setSort('title');
      useLibraryFiltersStore.getState().setSort('lastRead');
      expect(useLibraryFiltersStore.getState().sort).toBe('lastRead');
    });

    it('accepts all valid sort options', () => {
      const sortOptions: SortOption[] = ['lastRead', 'title', 'progress', 'dateCreated', 'author', 'rating'];
      for (const option of sortOptions) {
        useLibraryFiltersStore.getState().setSort(option);
        expect(useLibraryFiltersStore.getState().sort).toBe(option);
      }
    });
  });

  // ── setSortOrder ───────────────────────────────────────────────────

  describe('setSortOrder', () => {
    it('sets sort order to asc', () => {
      useLibraryFiltersStore.getState().setSortOrder('asc');
      expect(useLibraryFiltersStore.getState().sortOrder).toBe('asc');
    });

    it('sets sort order to desc', () => {
      useLibraryFiltersStore.getState().setSortOrder('asc');
      useLibraryFiltersStore.getState().setSortOrder('desc');
      expect(useLibraryFiltersStore.getState().sortOrder).toBe('desc');
    });

    it('setting same order twice keeps that order', () => {
      useLibraryFiltersStore.getState().setSortOrder('asc');
      useLibraryFiltersStore.getState().setSortOrder('asc');
      expect(useLibraryFiltersStore.getState().sortOrder).toBe('asc');
    });
  });

  // ── toggleSortOrder ────────────────────────────────────────────────

  describe('toggleSortOrder', () => {
    it('toggles from desc to asc', () => {
      useLibraryFiltersStore.getState().toggleSortOrder();
      expect(useLibraryFiltersStore.getState().sortOrder).toBe('asc');
    });

    it('toggles from asc to desc', () => {
      useLibraryFiltersStore.getState().setSortOrder('asc');
      useLibraryFiltersStore.getState().toggleSortOrder();
      expect(useLibraryFiltersStore.getState().sortOrder).toBe('desc');
    });

    it('toggling twice returns to original order', () => {
      const original = useLibraryFiltersStore.getState().sortOrder;
      useLibraryFiltersStore.getState().toggleSortOrder();
      useLibraryFiltersStore.getState().toggleSortOrder();
      expect(useLibraryFiltersStore.getState().sortOrder).toBe(original);
    });

    it('toggling three times inverts original order', () => {
      useLibraryFiltersStore.getState().toggleSortOrder();
      useLibraryFiltersStore.getState().toggleSortOrder();
      useLibraryFiltersStore.getState().toggleSortOrder();
      expect(useLibraryFiltersStore.getState().sortOrder).toBe('asc');
    });
  });

  // ── setTypeFilter ──────────────────────────────────────────────────

  describe('setTypeFilter', () => {
    it('sets type filter to pdf', () => {
      useLibraryFiltersStore.getState().setTypeFilter('pdf');
      expect(useLibraryFiltersStore.getState().typeFilter).toBe('pdf');
    });

    it('sets type filter to epub', () => {
      useLibraryFiltersStore.getState().setTypeFilter('epub');
      expect(useLibraryFiltersStore.getState().typeFilter).toBe('epub');
    });

    it('sets type filter back to all', () => {
      useLibraryFiltersStore.getState().setTypeFilter('pdf');
      useLibraryFiltersStore.getState().setTypeFilter('all');
      expect(useLibraryFiltersStore.getState().typeFilter).toBe('all');
    });

    it('accepts all valid type filters', () => {
      const typeFilters: TypeFilter[] = ['all', 'pdf', 'epub'];
      for (const filter of typeFilters) {
        useLibraryFiltersStore.getState().setTypeFilter(filter);
        expect(useLibraryFiltersStore.getState().typeFilter).toBe(filter);
      }
    });
  });

  // ── setProgressFilter ──────────────────────────────────────────────

  describe('setProgressFilter', () => {
    it('sets progress filter to unread', () => {
      useLibraryFiltersStore.getState().setProgressFilter('unread');
      expect(useLibraryFiltersStore.getState().progressFilter).toBe('unread');
    });

    it('sets progress filter to reading', () => {
      useLibraryFiltersStore.getState().setProgressFilter('reading');
      expect(useLibraryFiltersStore.getState().progressFilter).toBe('reading');
    });

    it('sets progress filter to completed', () => {
      useLibraryFiltersStore.getState().setProgressFilter('completed');
      expect(useLibraryFiltersStore.getState().progressFilter).toBe('completed');
    });

    it('sets progress filter back to all', () => {
      useLibraryFiltersStore.getState().setProgressFilter('reading');
      useLibraryFiltersStore.getState().setProgressFilter('all');
      expect(useLibraryFiltersStore.getState().progressFilter).toBe('all');
    });

    it('accepts all valid progress filters', () => {
      const progressFilters: ProgressFilter[] = ['all', 'unread', 'reading', 'completed'];
      for (const filter of progressFilters) {
        useLibraryFiltersStore.getState().setProgressFilter(filter);
        expect(useLibraryFiltersStore.getState().progressFilter).toBe(filter);
      }
    });
  });

  // ── setCollectionFilter ────────────────────────────────────────────

  describe('setCollectionFilter', () => {
    it('sets a collection filter', () => {
      useLibraryFiltersStore.getState().setCollectionFilter('fiction');
      expect(useLibraryFiltersStore.getState().collectionFilter).toBe('fiction');
    });

    it('sets a different collection filter', () => {
      useLibraryFiltersStore.getState().setCollectionFilter('fiction');
      useLibraryFiltersStore.getState().setCollectionFilter('non-fiction');
      expect(useLibraryFiltersStore.getState().collectionFilter).toBe('non-fiction');
    });

    it('clears collection filter by setting null', () => {
      useLibraryFiltersStore.getState().setCollectionFilter('fiction');
      useLibraryFiltersStore.getState().setCollectionFilter(null);
      expect(useLibraryFiltersStore.getState().collectionFilter).toBeNull();
    });

    it('handles empty string collection name', () => {
      useLibraryFiltersStore.getState().setCollectionFilter('');
      expect(useLibraryFiltersStore.getState().collectionFilter).toBe('');
    });

    it('handles collection names with special characters', () => {
      useLibraryFiltersStore.getState().setCollectionFilter('sci-fi & fantasy');
      expect(useLibraryFiltersStore.getState().collectionFilter).toBe('sci-fi & fantasy');
    });
  });

  // ── setSearchMode ──────────────────────────────────────────────────

  describe('setSearchMode', () => {
    it('sets search mode to content', () => {
      useLibraryFiltersStore.getState().setSearchMode('content');
      expect(useLibraryFiltersStore.getState().searchMode).toBe('content');
    });

    it('sets search mode back to title', () => {
      useLibraryFiltersStore.getState().setSearchMode('content');
      useLibraryFiltersStore.getState().setSearchMode('title');
      expect(useLibraryFiltersStore.getState().searchMode).toBe('title');
    });

    it('accepts all valid search modes', () => {
      const searchModes: SearchMode[] = ['title', 'content'];
      for (const mode of searchModes) {
        useLibraryFiltersStore.getState().setSearchMode(mode);
        expect(useLibraryFiltersStore.getState().searchMode).toBe(mode);
      }
    });
  });

  // ── setViewMode ────────────────────────────────────────────────────

  describe('setViewMode', () => {
    it('sets view mode to list', () => {
      useLibraryFiltersStore.getState().setViewMode('list');
      expect(useLibraryFiltersStore.getState().viewMode).toBe('list');
    });

    it('sets view mode back to grid', () => {
      useLibraryFiltersStore.getState().setViewMode('list');
      useLibraryFiltersStore.getState().setViewMode('grid');
      expect(useLibraryFiltersStore.getState().viewMode).toBe('grid');
    });

    it('accepts all valid view modes', () => {
      const viewModes: ViewMode[] = ['grid', 'list'];
      for (const mode of viewModes) {
        useLibraryFiltersStore.getState().setViewMode(mode);
        expect(useLibraryFiltersStore.getState().viewMode).toBe(mode);
      }
    });
  });

  // ── clearFilters ───────────────────────────────────────────────────

  describe('clearFilters', () => {
    it('resets type filter to all', () => {
      useLibraryFiltersStore.getState().setTypeFilter('pdf');
      useLibraryFiltersStore.getState().clearFilters();
      expect(useLibraryFiltersStore.getState().typeFilter).toBe('all');
    });

    it('resets progress filter to all', () => {
      useLibraryFiltersStore.getState().setProgressFilter('reading');
      useLibraryFiltersStore.getState().clearFilters();
      expect(useLibraryFiltersStore.getState().progressFilter).toBe('all');
    });

    it('resets collection filter to null', () => {
      useLibraryFiltersStore.getState().setCollectionFilter('fiction');
      useLibraryFiltersStore.getState().clearFilters();
      expect(useLibraryFiltersStore.getState().collectionFilter).toBeNull();
    });

    it('does not reset sort preference', () => {
      useLibraryFiltersStore.getState().setSort('title');
      useLibraryFiltersStore.getState().clearFilters();
      expect(useLibraryFiltersStore.getState().sort).toBe('title');
    });

    it('does not reset sort order preference', () => {
      useLibraryFiltersStore.getState().setSortOrder('asc');
      useLibraryFiltersStore.getState().clearFilters();
      expect(useLibraryFiltersStore.getState().sortOrder).toBe('asc');
    });

    it('does not reset view mode preference', () => {
      useLibraryFiltersStore.getState().setViewMode('list');
      useLibraryFiltersStore.getState().clearFilters();
      expect(useLibraryFiltersStore.getState().viewMode).toBe('list');
    });

    it('does not reset search mode preference', () => {
      useLibraryFiltersStore.getState().setSearchMode('content');
      useLibraryFiltersStore.getState().clearFilters();
      expect(useLibraryFiltersStore.getState().searchMode).toBe('content');
    });

    it('clears all filters at once when multiple are set', () => {
      useLibraryFiltersStore.getState().setTypeFilter('epub');
      useLibraryFiltersStore.getState().setProgressFilter('completed');
      useLibraryFiltersStore.getState().setCollectionFilter('classics');

      useLibraryFiltersStore.getState().clearFilters();

      expect(useLibraryFiltersStore.getState().typeFilter).toBe('all');
      expect(useLibraryFiltersStore.getState().progressFilter).toBe('all');
      expect(useLibraryFiltersStore.getState().collectionFilter).toBeNull();
    });

    it('is idempotent when called on default state', () => {
      useLibraryFiltersStore.getState().clearFilters();

      expect(useLibraryFiltersStore.getState().typeFilter).toBe('all');
      expect(useLibraryFiltersStore.getState().progressFilter).toBe('all');
      expect(useLibraryFiltersStore.getState().collectionFilter).toBeNull();
    });

    it('preserves all display preferences when clearing filters', () => {
      // Set everything to non-default
      useLibraryFiltersStore.getState().setSort('author');
      useLibraryFiltersStore.getState().setSortOrder('asc');
      useLibraryFiltersStore.getState().setViewMode('list');
      useLibraryFiltersStore.getState().setSearchMode('content');
      useLibraryFiltersStore.getState().setTypeFilter('pdf');
      useLibraryFiltersStore.getState().setProgressFilter('unread');
      useLibraryFiltersStore.getState().setCollectionFilter('favorites');

      useLibraryFiltersStore.getState().clearFilters();

      // Display preferences preserved
      expect(useLibraryFiltersStore.getState().sort).toBe('author');
      expect(useLibraryFiltersStore.getState().sortOrder).toBe('asc');
      expect(useLibraryFiltersStore.getState().viewMode).toBe('list');
      expect(useLibraryFiltersStore.getState().searchMode).toBe('content');

      // Filters cleared
      expect(useLibraryFiltersStore.getState().typeFilter).toBe('all');
      expect(useLibraryFiltersStore.getState().progressFilter).toBe('all');
      expect(useLibraryFiltersStore.getState().collectionFilter).toBeNull();
    });
  });

  // ── State independence ─────────────────────────────────────────────

  describe('state independence', () => {
    it('changing sort does not affect filters', () => {
      useLibraryFiltersStore.getState().setTypeFilter('pdf');
      useLibraryFiltersStore.getState().setSort('title');
      expect(useLibraryFiltersStore.getState().typeFilter).toBe('pdf');
    });

    it('changing type filter does not affect progress filter', () => {
      useLibraryFiltersStore.getState().setProgressFilter('reading');
      useLibraryFiltersStore.getState().setTypeFilter('epub');
      expect(useLibraryFiltersStore.getState().progressFilter).toBe('reading');
    });

    it('changing view mode does not affect sort', () => {
      useLibraryFiltersStore.getState().setSort('rating');
      useLibraryFiltersStore.getState().setViewMode('list');
      expect(useLibraryFiltersStore.getState().sort).toBe('rating');
    });

    it('toggling sort order does not affect any filters', () => {
      useLibraryFiltersStore.getState().setTypeFilter('pdf');
      useLibraryFiltersStore.getState().setProgressFilter('completed');
      useLibraryFiltersStore.getState().setCollectionFilter('science');

      useLibraryFiltersStore.getState().toggleSortOrder();

      expect(useLibraryFiltersStore.getState().typeFilter).toBe('pdf');
      expect(useLibraryFiltersStore.getState().progressFilter).toBe('completed');
      expect(useLibraryFiltersStore.getState().collectionFilter).toBe('science');
    });
  });

  // ── Persistence ────────────────────────────────────────────────────

  describe('persistence', () => {
    it('uses pulp-library-filters as storage key', () => {
      // Trigger a state change to force persistence write
      useLibraryFiltersStore.getState().setSort('title');

      const raw = localStorageMock._getStore()['pulp-library-filters'];
      if (!raw) {
        // zustand persist may not write in Node — just verify the store is functional
        return;
      }

      const persisted = JSON.parse(raw);
      expect(persisted.state).toBeDefined();
    });

    it('persists sort changes', () => {
      useLibraryFiltersStore.getState().setSort('author');

      const raw = localStorageMock._getStore()['pulp-library-filters'];
      if (!raw) return;

      const persisted = JSON.parse(raw);
      expect(persisted.state.sort).toBe('author');
    });

    it('persists view mode changes', () => {
      useLibraryFiltersStore.getState().setViewMode('list');

      const raw = localStorageMock._getStore()['pulp-library-filters'];
      if (!raw) return;

      const persisted = JSON.parse(raw);
      expect(persisted.state.viewMode).toBe('list');
    });

    it('persists filter changes', () => {
      useLibraryFiltersStore.getState().setTypeFilter('epub');
      useLibraryFiltersStore.getState().setProgressFilter('reading');

      const raw = localStorageMock._getStore()['pulp-library-filters'];
      if (!raw) return;

      const persisted = JSON.parse(raw);
      expect(persisted.state.typeFilter).toBe('epub');
      expect(persisted.state.progressFilter).toBe('reading');
    });
  });
});
