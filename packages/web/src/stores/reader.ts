import { create } from 'zustand';

export type ZoomMode = 'fit-width' | 'fit-page' | 'custom';
export type PDFViewMode = 'single' | 'spread' | 'presentation';
export type PDFColorMode = 'light' | 'dark';

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

  // Search state
  searchQuery: string;
  searchResults: SearchMatch[];
  currentMatchIndex: number;
  isSearchOpen: boolean;

  // Reading mode state
  pdfViewMode: PDFViewMode;
  pdfColorMode: PDFColorMode;

  setCurrentPage: (page: number) => void;
  setTotalPages: (total: number) => void;
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

  // Search state
  searchQuery: '',
  searchResults: [],
  currentMatchIndex: 0,
  isSearchOpen: false,

  // Reading mode state
  pdfViewMode: 'single',
  pdfColorMode: 'light',

  setCurrentPage: (page) => set({ currentPage: page }),
  setTotalPages: (total) => set({ totalPages: total }),
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

  // Reading mode actions
  setPdfViewMode: (mode) => set({ pdfViewMode: mode }),
  setPdfColorMode: (mode) => set({ pdfColorMode: mode }),
  togglePdfColorMode: () => set((state) => ({
    pdfColorMode: state.pdfColorMode === 'light' ? 'dark' : 'light',
  })),

  reset: () => set({
    currentPage: 1,
    totalPages: 0,
    zoom: 1,
    zoomMode: 'fit-width',
    tocOpen: false,
    markdownPanelOpen: false,
    scrollToPage: null,
    isLoading: true,
    searchQuery: '',
    searchResults: [],
    currentMatchIndex: 0,
    isSearchOpen: false,
    pdfViewMode: 'single',
    pdfColorMode: 'light',
  }),
}));
