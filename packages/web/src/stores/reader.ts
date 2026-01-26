import { create } from 'zustand';

export type ZoomMode = 'fit-width' | 'fit-page' | 'custom';
export type PDFViewMode = 'single' | 'spread' | 'presentation';
export type PDFColorMode = 'light' | 'dark' | 'eink';

// LocalStorage keys for persisted preferences
const STORAGE_KEY_COLOR_MODE = 'pulp-pdf-color-mode';
const STORAGE_KEY_VIEW_MODE = 'pulp-pdf-view-mode';

// Load persisted preferences
function getPersistedColorMode(): PDFColorMode {
  if (typeof window === 'undefined') return 'light';
  const stored = localStorage.getItem(STORAGE_KEY_COLOR_MODE);
  if (stored === 'light' || stored === 'dark' || stored === 'eink') {
    return stored;
  }
  return 'light';
}

function getPersistedViewMode(): PDFViewMode {
  if (typeof window === 'undefined') return 'single';
  const stored = localStorage.getItem(STORAGE_KEY_VIEW_MODE);
  if (stored === 'single' || stored === 'spread' || stored === 'presentation') {
    return stored;
  }
  return 'single';
}

export interface SearchMatch {
  pageNum: number;
  spanIndex: number;
  startOffset: number;
  endOffset: number;
  text: string;
}

interface ReaderState {
  currentPage: number;
  totalPages: number;
  zoom: number;
  zoomMode: ZoomMode;
  tocOpen: boolean;
  markdownPanelOpen: boolean;
  scrollToPage: number | null;
  isLoading: boolean;

  // Load error state
  loadError: string | null;

  // Page labels (logical page numbers like "iv", "12", "A-3")
  pageLabels: string[] | null;

  // Search state
  searchQuery: string;
  searchResults: SearchMatch[];
  currentMatchIndex: number;
  isSearchOpen: boolean;

  // Reading mode state
  pdfViewMode: PDFViewMode;
  pdfColorMode: PDFColorMode;

  // Mobile state
  mobileMenuOpen: boolean;

  // Shortcuts panel state
  shortcutsOpen: boolean;

  // Bookmarks panel state (data comes from API via useBookmarks hook)
  bookmarksOpen: boolean;

  // Reading stats panel state
  statsOpen: boolean;

  // Reading goals panel state
  goalsOpen: boolean;

  setCurrentPage: (page: number) => void;
  setTotalPages: (total: number) => void;
  setPageLabels: (labels: string[] | null) => void;
  setZoom: (zoom: number) => void;
  setZoomMode: (mode: ZoomMode) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  setTocOpen: (open: boolean) => void;
  toggleToc: () => void;
  setMarkdownPanelOpen: (open: boolean) => void;
  toggleMarkdownPanel: () => void;
  setScrollToPage: (page: number | null) => void;
  setIsLoading: (loading: boolean) => void;
  setLoadError: (error: string | null) => void;

  // Search actions
  setSearchQuery: (query: string) => void;
  setSearchResults: (results: SearchMatch[]) => void;
  nextMatch: () => void;
  prevMatch: () => void;
  toggleSearch: () => void;
  clearSearch: () => void;

  // Reading mode actions
  setPdfViewMode: (mode: PDFViewMode) => void;
  setPdfColorMode: (mode: PDFColorMode) => void;
  togglePdfColorMode: () => void;

  // Mobile actions
  setMobileMenuOpen: (open: boolean) => void;
  toggleMobileMenu: () => void;

  // Shortcuts panel actions
  setShortcutsOpen: (open: boolean) => void;
  toggleShortcuts: () => void;

  // Bookmark panel actions (data managed via useBookmarks hook)
  setBookmarksOpen: (open: boolean) => void;
  toggleBookmarks: () => void;

  // Reading stats actions
  setStatsOpen: (open: boolean) => void;
  toggleStats: () => void;

  // Reading goals actions
  setGoalsOpen: (open: boolean) => void;
  toggleGoals: () => void;

  reset: () => void;
}

export const useReaderStore = create<ReaderState>((set) => ({
  currentPage: 1,
  totalPages: 0,
  zoom: 1,
  zoomMode: 'fit-width',
  tocOpen: false,
  markdownPanelOpen: false,
  scrollToPage: null,
  isLoading: true,

  // Load error state
  loadError: null,

  // Page labels
  pageLabels: null,

  // Search state
  searchQuery: '',
  searchResults: [],
  currentMatchIndex: 0,
  isSearchOpen: false,

  // Reading mode state (persisted)
  pdfViewMode: getPersistedViewMode(),
  pdfColorMode: getPersistedColorMode(),

  // Mobile state
  mobileMenuOpen: false,

  // Shortcuts panel state
  shortcutsOpen: false,

  // Bookmarks panel state (data from API)
  bookmarksOpen: false,

  // Reading stats state
  statsOpen: false,

  // Reading goals state
  goalsOpen: false,

  setCurrentPage: (page) => set({ currentPage: page }),
  setTotalPages: (total) => set({ totalPages: total }),
  setPageLabels: (labels) => set({ pageLabels: labels }),
  setZoom: (zoom) => set({ zoom: Math.max(0.5, Math.min(3, zoom)), zoomMode: 'custom' }),
  setZoomMode: (mode) => set({ zoomMode: mode }),
  zoomIn: () => set((state) => ({ zoom: Math.min(3, state.zoom + 0.25), zoomMode: 'custom' })),
  zoomOut: () => set((state) => ({ zoom: Math.max(0.5, state.zoom - 0.25), zoomMode: 'custom' })),
  setTocOpen: (open) => set({ tocOpen: open }),
  toggleToc: () => set((state) => ({ tocOpen: !state.tocOpen })),
  setMarkdownPanelOpen: (open) => set({ markdownPanelOpen: open }),
  toggleMarkdownPanel: () => set((state) => ({ markdownPanelOpen: !state.markdownPanelOpen })),
  setScrollToPage: (page) => set({ scrollToPage: page }),
  setIsLoading: (loading) => set({ isLoading: loading }),
  setLoadError: (error) => set({ loadError: error }),

  // Search actions
  setSearchQuery: (query) => set({ searchQuery: query, currentMatchIndex: 0 }),
  setSearchResults: (results) => set({ searchResults: results, currentMatchIndex: 0 }),
  nextMatch: () => set((state) => ({
    currentMatchIndex: state.searchResults.length > 0
      ? (state.currentMatchIndex + 1) % state.searchResults.length
      : 0,
  })),
  prevMatch: () => set((state) => ({
    currentMatchIndex: state.searchResults.length > 0
      ? (state.currentMatchIndex - 1 + state.searchResults.length) % state.searchResults.length
      : 0,
  })),
  toggleSearch: () => set((state) => ({ isSearchOpen: !state.isSearchOpen })),
  clearSearch: () => set({ searchQuery: '', searchResults: [], currentMatchIndex: 0, isSearchOpen: false }),

  // Reading mode actions (persisted to localStorage)
  setPdfViewMode: (mode) => {
    localStorage.setItem(STORAGE_KEY_VIEW_MODE, mode);
    return set({ pdfViewMode: mode });
  },
  setPdfColorMode: (mode) => {
    localStorage.setItem(STORAGE_KEY_COLOR_MODE, mode);
    return set({ pdfColorMode: mode });
  },
  togglePdfColorMode: () => set((state) => {
    const modes: PDFColorMode[] = ['light', 'dark', 'eink'];
    const currentIndex = modes.indexOf(state.pdfColorMode);
    const nextIndex = (currentIndex + 1) % modes.length;
    const newMode = modes[nextIndex];
    localStorage.setItem(STORAGE_KEY_COLOR_MODE, newMode);
    return { pdfColorMode: newMode };
  }),

  // Mobile actions
  setMobileMenuOpen: (open) => set({ mobileMenuOpen: open }),
  toggleMobileMenu: () => set((state) => ({ mobileMenuOpen: !state.mobileMenuOpen })),

  // Shortcuts panel actions
  setShortcutsOpen: (open) => set({ shortcutsOpen: open }),
  toggleShortcuts: () => set((state) => ({ shortcutsOpen: !state.shortcutsOpen })),

  // Bookmark panel actions
  setBookmarksOpen: (open) => set({ bookmarksOpen: open }),
  toggleBookmarks: () => set((state) => ({ bookmarksOpen: !state.bookmarksOpen })),

  // Reading stats actions
  setStatsOpen: (open) => set({ statsOpen: open }),
  toggleStats: () => set((state) => ({ statsOpen: !state.statsOpen })),

  // Reading goals actions
  setGoalsOpen: (open) => set({ goalsOpen: open }),
  toggleGoals: () => set((state) => ({ goalsOpen: !state.goalsOpen })),

  reset: () => set({
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
    // Preserve persisted display preferences
    pdfViewMode: getPersistedViewMode(),
    pdfColorMode: getPersistedColorMode(),
    mobileMenuOpen: false,
    shortcutsOpen: false,
    bookmarksOpen: false,
    statsOpen: false,
    goalsOpen: false,
  }),
}));
