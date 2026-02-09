import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useReaderStore } from '../reader';
import type { SearchMatch } from '../reader';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn<(key: string) => string | null>((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: vi.fn((key: string) => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; }),
    get length() { return Object.keys(store).length; },
    key: vi.fn((i: number) => Object.keys(store)[i] ?? null),
  };
})();

Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock });
// The reader store checks `typeof window !== 'undefined'` for SSR safety.
// In Node test environment, we need window to be defined for localStorage reads.
if (typeof globalThis.window === 'undefined') {
  (globalThis as Record<string, unknown>).window = globalThis;
}

function resetStore() {
  useReaderStore.setState({
    currentPage: 1,
    totalPages: 0,
    zoom: 1,
    zoomMode: 'fit-width',
    tocOpen: false,
    markdownPanelOpen: false,
    scrollToPage: null,
    isLoading: true,
    loadError: null,
    pageLabels: null,
    searchQuery: '',
    searchResults: [],
    currentMatchIndex: 0,
    isSearchOpen: false,
    pdfViewMode: 'single',
    pdfColorMode: 'light',
    mobileMenuOpen: false,
    shortcutsOpen: false,
    bookmarksOpen: false,
    highlightsOpen: false,
    statsOpen: false,
    goalsOpen: false,
  });
}

describe('useReaderStore', () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
    resetStore();
  });

  describe('initial state', () => {
    it('has correct default values', () => {
      const state = useReaderStore.getState();
      expect(state.currentPage).toBe(1);
      expect(state.totalPages).toBe(0);
      expect(state.zoom).toBe(1);
      expect(state.zoomMode).toBe('fit-width');
      expect(state.tocOpen).toBe(false);
      expect(state.markdownPanelOpen).toBe(false);
      expect(state.scrollToPage).toBeNull();
      expect(state.isLoading).toBe(true);
      expect(state.loadError).toBeNull();
      expect(state.pageLabels).toBeNull();
    });

    it('has correct default search state', () => {
      const state = useReaderStore.getState();
      expect(state.searchQuery).toBe('');
      expect(state.searchResults).toEqual([]);
      expect(state.currentMatchIndex).toBe(0);
      expect(state.isSearchOpen).toBe(false);
    });

    it('has correct default panel states', () => {
      const state = useReaderStore.getState();
      expect(state.mobileMenuOpen).toBe(false);
      expect(state.shortcutsOpen).toBe(false);
      expect(state.bookmarksOpen).toBe(false);
      expect(state.highlightsOpen).toBe(false);
      expect(state.statsOpen).toBe(false);
      expect(state.goalsOpen).toBe(false);
    });
  });

  describe('page navigation', () => {
    it('sets current page', () => {
      useReaderStore.getState().setCurrentPage(5);
      expect(useReaderStore.getState().currentPage).toBe(5);
    });

    it('sets total pages', () => {
      useReaderStore.getState().setTotalPages(100);
      expect(useReaderStore.getState().totalPages).toBe(100);
    });

    it('sets page labels', () => {
      const labels = ['i', 'ii', '1', '2', '3'];
      useReaderStore.getState().setPageLabels(labels);
      expect(useReaderStore.getState().pageLabels).toEqual(labels);
    });

    it('clears page labels with null', () => {
      useReaderStore.getState().setPageLabels(['i', 'ii']);
      useReaderStore.getState().setPageLabels(null);
      expect(useReaderStore.getState().pageLabels).toBeNull();
    });

    it('sets scrollToPage', () => {
      useReaderStore.getState().setScrollToPage(10);
      expect(useReaderStore.getState().scrollToPage).toBe(10);
    });

    it('clears scrollToPage with null', () => {
      useReaderStore.getState().setScrollToPage(10);
      useReaderStore.getState().setScrollToPage(null);
      expect(useReaderStore.getState().scrollToPage).toBeNull();
    });
  });

  describe('zoom controls', () => {
    it('sets zoom directly', () => {
      useReaderStore.getState().setZoom(1.5);
      const state = useReaderStore.getState();
      expect(state.zoom).toBe(1.5);
      expect(state.zoomMode).toBe('custom');
    });

    it('switches to custom zoom mode when zoom is set', () => {
      useReaderStore.getState().setZoomMode('fit-page');
      expect(useReaderStore.getState().zoomMode).toBe('fit-page');

      useReaderStore.getState().setZoom(2);
      expect(useReaderStore.getState().zoomMode).toBe('custom');
    });

    it('clamps zoom to minimum of 0.5', () => {
      useReaderStore.getState().setZoom(0.1);
      expect(useReaderStore.getState().zoom).toBe(0.5);
    });

    it('clamps zoom to maximum of 3', () => {
      useReaderStore.getState().setZoom(5);
      expect(useReaderStore.getState().zoom).toBe(3);
    });

    it('clamps zoom at exactly 0.5', () => {
      useReaderStore.getState().setZoom(0.5);
      expect(useReaderStore.getState().zoom).toBe(0.5);
    });

    it('clamps zoom at exactly 3', () => {
      useReaderStore.getState().setZoom(3);
      expect(useReaderStore.getState().zoom).toBe(3);
    });

    it('clamps negative zoom to minimum', () => {
      useReaderStore.getState().setZoom(-1);
      expect(useReaderStore.getState().zoom).toBe(0.5);
    });

    it('clamps zero zoom to minimum', () => {
      useReaderStore.getState().setZoom(0);
      expect(useReaderStore.getState().zoom).toBe(0.5);
    });

    it('zooms in by 0.25', () => {
      useReaderStore.getState().zoomIn();
      const state = useReaderStore.getState();
      expect(state.zoom).toBe(1.25);
      expect(state.zoomMode).toBe('custom');
    });

    it('zooms out by 0.25', () => {
      useReaderStore.getState().zoomOut();
      const state = useReaderStore.getState();
      expect(state.zoom).toBe(0.75);
      expect(state.zoomMode).toBe('custom');
    });

    it('does not zoom in beyond max of 3', () => {
      useReaderStore.getState().setZoom(2.9);
      useReaderStore.getState().zoomIn();
      expect(useReaderStore.getState().zoom).toBe(3);
    });

    it('does not zoom out below min of 0.5', () => {
      useReaderStore.getState().setZoom(0.6);
      useReaderStore.getState().zoomOut();
      expect(useReaderStore.getState().zoom).toBe(0.5);
    });

    it('caps at max when zooming in from max', () => {
      useReaderStore.getState().setZoom(3);
      useReaderStore.getState().zoomIn();
      expect(useReaderStore.getState().zoom).toBe(3);
    });

    it('caps at min when zooming out from min', () => {
      useReaderStore.getState().setZoom(0.5);
      useReaderStore.getState().zoomOut();
      expect(useReaderStore.getState().zoom).toBe(0.5);
    });

    it('sets zoom mode directly', () => {
      useReaderStore.getState().setZoomMode('fit-page');
      expect(useReaderStore.getState().zoomMode).toBe('fit-page');

      useReaderStore.getState().setZoomMode('fit-width');
      expect(useReaderStore.getState().zoomMode).toBe('fit-width');
    });
  });

  describe('loading state', () => {
    it('sets isLoading', () => {
      useReaderStore.getState().setIsLoading(false);
      expect(useReaderStore.getState().isLoading).toBe(false);

      useReaderStore.getState().setIsLoading(true);
      expect(useReaderStore.getState().isLoading).toBe(true);
    });

    it('sets load error', () => {
      useReaderStore.getState().setLoadError('File not found');
      expect(useReaderStore.getState().loadError).toBe('File not found');
    });

    it('clears load error', () => {
      useReaderStore.getState().setLoadError('Error');
      useReaderStore.getState().setLoadError(null);
      expect(useReaderStore.getState().loadError).toBeNull();
    });
  });

  describe('panel toggles', () => {
    it('toggles table of contents', () => {
      expect(useReaderStore.getState().tocOpen).toBe(false);
      useReaderStore.getState().toggleToc();
      expect(useReaderStore.getState().tocOpen).toBe(true);
      useReaderStore.getState().toggleToc();
      expect(useReaderStore.getState().tocOpen).toBe(false);
    });

    it('sets table of contents open state directly', () => {
      useReaderStore.getState().setTocOpen(true);
      expect(useReaderStore.getState().tocOpen).toBe(true);
      useReaderStore.getState().setTocOpen(false);
      expect(useReaderStore.getState().tocOpen).toBe(false);
    });

    it('toggles markdown panel', () => {
      expect(useReaderStore.getState().markdownPanelOpen).toBe(false);
      useReaderStore.getState().toggleMarkdownPanel();
      expect(useReaderStore.getState().markdownPanelOpen).toBe(true);
      useReaderStore.getState().toggleMarkdownPanel();
      expect(useReaderStore.getState().markdownPanelOpen).toBe(false);
    });

    it('sets markdown panel open state directly', () => {
      useReaderStore.getState().setMarkdownPanelOpen(true);
      expect(useReaderStore.getState().markdownPanelOpen).toBe(true);
    });

    it('toggles mobile menu', () => {
      expect(useReaderStore.getState().mobileMenuOpen).toBe(false);
      useReaderStore.getState().toggleMobileMenu();
      expect(useReaderStore.getState().mobileMenuOpen).toBe(true);
      useReaderStore.getState().toggleMobileMenu();
      expect(useReaderStore.getState().mobileMenuOpen).toBe(false);
    });

    it('sets mobile menu open state directly', () => {
      useReaderStore.getState().setMobileMenuOpen(true);
      expect(useReaderStore.getState().mobileMenuOpen).toBe(true);
    });

    it('toggles shortcuts panel', () => {
      expect(useReaderStore.getState().shortcutsOpen).toBe(false);
      useReaderStore.getState().toggleShortcuts();
      expect(useReaderStore.getState().shortcutsOpen).toBe(true);
      useReaderStore.getState().toggleShortcuts();
      expect(useReaderStore.getState().shortcutsOpen).toBe(false);
    });

    it('sets shortcuts open state directly', () => {
      useReaderStore.getState().setShortcutsOpen(true);
      expect(useReaderStore.getState().shortcutsOpen).toBe(true);
    });

    it('toggles bookmarks panel', () => {
      expect(useReaderStore.getState().bookmarksOpen).toBe(false);
      useReaderStore.getState().toggleBookmarks();
      expect(useReaderStore.getState().bookmarksOpen).toBe(true);
      useReaderStore.getState().toggleBookmarks();
      expect(useReaderStore.getState().bookmarksOpen).toBe(false);
    });

    it('sets bookmarks open state directly', () => {
      useReaderStore.getState().setBookmarksOpen(true);
      expect(useReaderStore.getState().bookmarksOpen).toBe(true);
    });

    it('toggles highlights panel', () => {
      expect(useReaderStore.getState().highlightsOpen).toBe(false);
      useReaderStore.getState().toggleHighlights();
      expect(useReaderStore.getState().highlightsOpen).toBe(true);
      useReaderStore.getState().toggleHighlights();
      expect(useReaderStore.getState().highlightsOpen).toBe(false);
    });

    it('sets highlights open state directly', () => {
      useReaderStore.getState().setHighlightsOpen(true);
      expect(useReaderStore.getState().highlightsOpen).toBe(true);
    });

    it('toggles stats panel', () => {
      expect(useReaderStore.getState().statsOpen).toBe(false);
      useReaderStore.getState().toggleStats();
      expect(useReaderStore.getState().statsOpen).toBe(true);
      useReaderStore.getState().toggleStats();
      expect(useReaderStore.getState().statsOpen).toBe(false);
    });

    it('sets stats open state directly', () => {
      useReaderStore.getState().setStatsOpen(true);
      expect(useReaderStore.getState().statsOpen).toBe(true);
    });

    it('toggles goals panel', () => {
      expect(useReaderStore.getState().goalsOpen).toBe(false);
      useReaderStore.getState().toggleGoals();
      expect(useReaderStore.getState().goalsOpen).toBe(true);
      useReaderStore.getState().toggleGoals();
      expect(useReaderStore.getState().goalsOpen).toBe(false);
    });

    it('sets goals open state directly', () => {
      useReaderStore.getState().setGoalsOpen(true);
      expect(useReaderStore.getState().goalsOpen).toBe(true);
    });
  });

  describe('search', () => {
    const makeMatches = (count: number): SearchMatch[] =>
      Array.from({ length: count }, (_, i) => ({
        pageNum: i + 1,
        spanIndex: 0,
        startOffset: 0,
        endOffset: 5,
        text: `match ${i}`,
      }));

    it('sets search query and resets match index', () => {
      useReaderStore.setState({ currentMatchIndex: 3 });
      useReaderStore.getState().setSearchQuery('hello');
      const state = useReaderStore.getState();
      expect(state.searchQuery).toBe('hello');
      expect(state.currentMatchIndex).toBe(0);
    });

    it('sets search results and resets match index', () => {
      useReaderStore.setState({ currentMatchIndex: 5 });
      const matches = makeMatches(3);
      useReaderStore.getState().setSearchResults(matches);
      const state = useReaderStore.getState();
      expect(state.searchResults).toEqual(matches);
      expect(state.currentMatchIndex).toBe(0);
    });

    it('toggles search open', () => {
      expect(useReaderStore.getState().isSearchOpen).toBe(false);
      useReaderStore.getState().toggleSearch();
      expect(useReaderStore.getState().isSearchOpen).toBe(true);
      useReaderStore.getState().toggleSearch();
      expect(useReaderStore.getState().isSearchOpen).toBe(false);
    });

    it('clears search state completely', () => {
      useReaderStore.setState({
        searchQuery: 'test',
        searchResults: makeMatches(5),
        currentMatchIndex: 3,
        isSearchOpen: true,
      });

      useReaderStore.getState().clearSearch();
      const state = useReaderStore.getState();
      expect(state.searchQuery).toBe('');
      expect(state.searchResults).toEqual([]);
      expect(state.currentMatchIndex).toBe(0);
      expect(state.isSearchOpen).toBe(false);
    });

    describe('match navigation', () => {
      it('advances to next match', () => {
        useReaderStore.setState({
          searchResults: makeMatches(5),
          currentMatchIndex: 0,
        });
        useReaderStore.getState().nextMatch();
        expect(useReaderStore.getState().currentMatchIndex).toBe(1);
      });

      it('wraps around to first match from last', () => {
        useReaderStore.setState({
          searchResults: makeMatches(5),
          currentMatchIndex: 4,
        });
        useReaderStore.getState().nextMatch();
        expect(useReaderStore.getState().currentMatchIndex).toBe(0);
      });

      it('goes to previous match', () => {
        useReaderStore.setState({
          searchResults: makeMatches(5),
          currentMatchIndex: 3,
        });
        useReaderStore.getState().prevMatch();
        expect(useReaderStore.getState().currentMatchIndex).toBe(2);
      });

      it('wraps around to last match from first', () => {
        useReaderStore.setState({
          searchResults: makeMatches(5),
          currentMatchIndex: 0,
        });
        useReaderStore.getState().prevMatch();
        expect(useReaderStore.getState().currentMatchIndex).toBe(4);
      });

      it('stays at 0 when no search results (nextMatch)', () => {
        useReaderStore.setState({
          searchResults: [],
          currentMatchIndex: 0,
        });
        useReaderStore.getState().nextMatch();
        expect(useReaderStore.getState().currentMatchIndex).toBe(0);
      });

      it('stays at 0 when no search results (prevMatch)', () => {
        useReaderStore.setState({
          searchResults: [],
          currentMatchIndex: 0,
        });
        useReaderStore.getState().prevMatch();
        expect(useReaderStore.getState().currentMatchIndex).toBe(0);
      });

      it('handles single result (nextMatch wraps to itself)', () => {
        useReaderStore.setState({
          searchResults: makeMatches(1),
          currentMatchIndex: 0,
        });
        useReaderStore.getState().nextMatch();
        expect(useReaderStore.getState().currentMatchIndex).toBe(0);
      });

      it('handles single result (prevMatch wraps to itself)', () => {
        useReaderStore.setState({
          searchResults: makeMatches(1),
          currentMatchIndex: 0,
        });
        useReaderStore.getState().prevMatch();
        expect(useReaderStore.getState().currentMatchIndex).toBe(0);
      });
    });
  });

  describe('PDF view mode', () => {
    it('sets PDF view mode and persists to localStorage', () => {
      useReaderStore.getState().setPdfViewMode('spread');
      expect(useReaderStore.getState().pdfViewMode).toBe('spread');
      expect(localStorageMock.setItem).toHaveBeenCalledWith('pulp-pdf-view-mode', 'spread');
    });

    it('sets PDF view mode to presentation', () => {
      useReaderStore.getState().setPdfViewMode('presentation');
      expect(useReaderStore.getState().pdfViewMode).toBe('presentation');
      expect(localStorageMock.setItem).toHaveBeenCalledWith('pulp-pdf-view-mode', 'presentation');
    });

    it('sets PDF view mode to single', () => {
      useReaderStore.getState().setPdfViewMode('single');
      expect(useReaderStore.getState().pdfViewMode).toBe('single');
      expect(localStorageMock.setItem).toHaveBeenCalledWith('pulp-pdf-view-mode', 'single');
    });
  });

  describe('PDF color mode', () => {
    it('sets PDF color mode and persists to localStorage', () => {
      useReaderStore.getState().setPdfColorMode('dark');
      expect(useReaderStore.getState().pdfColorMode).toBe('dark');
      expect(localStorageMock.setItem).toHaveBeenCalledWith('pulp-pdf-color-mode', 'dark');
    });

    it('sets PDF color mode to eink', () => {
      useReaderStore.getState().setPdfColorMode('eink');
      expect(useReaderStore.getState().pdfColorMode).toBe('eink');
      expect(localStorageMock.setItem).toHaveBeenCalledWith('pulp-pdf-color-mode', 'eink');
    });

    it('cycles through color modes: light -> dark -> eink -> light', () => {
      // Start at light
      useReaderStore.setState({ pdfColorMode: 'light' });

      useReaderStore.getState().togglePdfColorMode();
      expect(useReaderStore.getState().pdfColorMode).toBe('dark');

      useReaderStore.getState().togglePdfColorMode();
      expect(useReaderStore.getState().pdfColorMode).toBe('eink');

      useReaderStore.getState().togglePdfColorMode();
      expect(useReaderStore.getState().pdfColorMode).toBe('light');
    });

    it('persists color mode on toggle', () => {
      useReaderStore.setState({ pdfColorMode: 'light' });
      useReaderStore.getState().togglePdfColorMode();
      expect(localStorageMock.setItem).toHaveBeenCalledWith('pulp-pdf-color-mode', 'dark');
    });

    it('cycles correctly starting from dark', () => {
      useReaderStore.setState({ pdfColorMode: 'dark' });
      useReaderStore.getState().togglePdfColorMode();
      expect(useReaderStore.getState().pdfColorMode).toBe('eink');
    });

    it('cycles correctly starting from eink', () => {
      useReaderStore.setState({ pdfColorMode: 'eink' });
      useReaderStore.getState().togglePdfColorMode();
      expect(useReaderStore.getState().pdfColorMode).toBe('light');
    });
  });

  describe('reset', () => {
    it('resets all state to defaults', () => {
      // Modify everything
      useReaderStore.setState({
        currentPage: 50,
        totalPages: 200,
        zoom: 2.5,
        zoomMode: 'custom',
        tocOpen: true,
        markdownPanelOpen: true,
        scrollToPage: 42,
        isLoading: false,
        loadError: 'some error',
        pageLabels: ['i', 'ii', '1'],
        searchQuery: 'test search',
        searchResults: [{ pageNum: 1, spanIndex: 0, startOffset: 0, endOffset: 4, text: 'test' }],
        currentMatchIndex: 3,
        isSearchOpen: true,
        mobileMenuOpen: true,
        shortcutsOpen: true,
        bookmarksOpen: true,
        highlightsOpen: true,
        statsOpen: true,
        goalsOpen: true,
      });

      useReaderStore.getState().reset();
      const state = useReaderStore.getState();

      expect(state.currentPage).toBe(1);
      expect(state.totalPages).toBe(0);
      expect(state.zoom).toBe(1);
      expect(state.zoomMode).toBe('fit-width');
      expect(state.tocOpen).toBe(false);
      expect(state.markdownPanelOpen).toBe(false);
      expect(state.scrollToPage).toBeNull();
      expect(state.isLoading).toBe(true);
      expect(state.loadError).toBeNull();
      expect(state.pageLabels).toBeNull();
      expect(state.searchQuery).toBe('');
      expect(state.searchResults).toEqual([]);
      expect(state.currentMatchIndex).toBe(0);
      expect(state.isSearchOpen).toBe(false);
      expect(state.mobileMenuOpen).toBe(false);
      expect(state.shortcutsOpen).toBe(false);
      expect(state.bookmarksOpen).toBe(false);
      expect(state.highlightsOpen).toBe(false);
      expect(state.statsOpen).toBe(false);
      expect(state.goalsOpen).toBe(false);
    });

    it('reads persisted view mode from localStorage on reset', () => {
      // Use the store's own action to persist 'spread' to localStorage
      useReaderStore.getState().setPdfViewMode('spread');
      expect(useReaderStore.getState().pdfViewMode).toBe('spread');

      // Verify localStorage was written
      const stored = localStorage.getItem('pulp-pdf-view-mode');
      expect(stored).toBe('spread');

      // Now modify state without persisting
      useReaderStore.setState({ pdfViewMode: 'presentation' });
      expect(useReaderStore.getState().pdfViewMode).toBe('presentation');

      // Verify localStorage still has 'spread'
      const stored2 = localStorage.getItem('pulp-pdf-view-mode');
      expect(stored2).toBe('spread');

      // Reset should restore the persisted value from localStorage
      useReaderStore.getState().reset();
      expect(useReaderStore.getState().pdfViewMode).toBe('spread');
    });

    it('reads persisted color mode from localStorage on reset', () => {
      // Use the store's own action to persist 'dark' to localStorage
      useReaderStore.getState().setPdfColorMode('dark');
      expect(useReaderStore.getState().pdfColorMode).toBe('dark');

      // Now modify state without persisting
      useReaderStore.setState({ pdfColorMode: 'eink' });
      expect(useReaderStore.getState().pdfColorMode).toBe('eink');

      // Reset should restore the persisted value from localStorage
      useReaderStore.getState().reset();
      expect(useReaderStore.getState().pdfColorMode).toBe('dark');
    });

    it('falls back to defaults when localStorage has no persisted values', () => {
      localStorageMock.getItem.mockReturnValue(null);

      useReaderStore.setState({ pdfViewMode: 'spread', pdfColorMode: 'eink' });
      useReaderStore.getState().reset();

      expect(useReaderStore.getState().pdfViewMode).toBe('single');
      expect(useReaderStore.getState().pdfColorMode).toBe('light');
    });

    it('falls back to defaults when localStorage has invalid values', () => {
      localStorageMock.getItem.mockImplementation((key: string) => {
        if (key === 'pulp-pdf-view-mode') return 'invalid-mode';
        if (key === 'pulp-pdf-color-mode') return 'neon-pink';
        return null;
      });

      useReaderStore.getState().reset();

      expect(useReaderStore.getState().pdfViewMode).toBe('single');
      expect(useReaderStore.getState().pdfColorMode).toBe('light');
    });
  });

  describe('zoom edge cases', () => {
    it('handles multiple sequential zoom ins', () => {
      // Start at 1, zoom in 8 times (1 + 8*0.25 = 3, which is max)
      for (let i = 0; i < 8; i++) {
        useReaderStore.getState().zoomIn();
      }
      expect(useReaderStore.getState().zoom).toBe(3);

      // One more should stay at 3
      useReaderStore.getState().zoomIn();
      expect(useReaderStore.getState().zoom).toBe(3);
    });

    it('handles multiple sequential zoom outs', () => {
      // Start at 1, zoom out 2 times (1 - 2*0.25 = 0.5, which is min)
      useReaderStore.getState().zoomOut();
      useReaderStore.getState().zoomOut();
      expect(useReaderStore.getState().zoom).toBe(0.5);

      // One more should stay at 0.5
      useReaderStore.getState().zoomOut();
      expect(useReaderStore.getState().zoom).toBe(0.5);
    });

    it('setZoom followed by zoomIn respects clamping', () => {
      useReaderStore.getState().setZoom(2.9);
      useReaderStore.getState().zoomIn();
      // 2.9 + 0.25 = 3.15, clamped to 3
      expect(useReaderStore.getState().zoom).toBe(3);
    });

    it('setZoom followed by zoomOut respects clamping', () => {
      useReaderStore.getState().setZoom(0.6);
      useReaderStore.getState().zoomOut();
      // 0.6 - 0.25 = 0.35, clamped to 0.5
      expect(useReaderStore.getState().zoom).toBe(0.5);
    });
  });

  describe('search navigation edge cases', () => {
    it('handles rapid consecutive nextMatch calls', () => {
      const matches: SearchMatch[] = Array.from({ length: 3 }, (_, i) => ({
        pageNum: i + 1,
        spanIndex: 0,
        startOffset: 0,
        endOffset: 1,
        text: `m${i}`,
      }));
      useReaderStore.setState({ searchResults: matches, currentMatchIndex: 0 });

      // Navigate through all matches and wrap
      useReaderStore.getState().nextMatch(); // 1
      useReaderStore.getState().nextMatch(); // 2
      useReaderStore.getState().nextMatch(); // 0 (wrapped)
      expect(useReaderStore.getState().currentMatchIndex).toBe(0);
    });

    it('handles rapid consecutive prevMatch calls', () => {
      const matches: SearchMatch[] = Array.from({ length: 3 }, (_, i) => ({
        pageNum: i + 1,
        spanIndex: 0,
        startOffset: 0,
        endOffset: 1,
        text: `m${i}`,
      }));
      useReaderStore.setState({ searchResults: matches, currentMatchIndex: 2 });

      useReaderStore.getState().prevMatch(); // 1
      useReaderStore.getState().prevMatch(); // 0
      useReaderStore.getState().prevMatch(); // 2 (wrapped)
      expect(useReaderStore.getState().currentMatchIndex).toBe(2);
    });

    it('handles two results correctly', () => {
      const matches: SearchMatch[] = [
        { pageNum: 1, spanIndex: 0, startOffset: 0, endOffset: 1, text: 'a' },
        { pageNum: 2, spanIndex: 0, startOffset: 0, endOffset: 1, text: 'b' },
      ];
      useReaderStore.setState({ searchResults: matches, currentMatchIndex: 0 });

      useReaderStore.getState().nextMatch();
      expect(useReaderStore.getState().currentMatchIndex).toBe(1);

      useReaderStore.getState().nextMatch();
      expect(useReaderStore.getState().currentMatchIndex).toBe(0);

      useReaderStore.getState().prevMatch();
      expect(useReaderStore.getState().currentMatchIndex).toBe(1);
    });
  });
});
