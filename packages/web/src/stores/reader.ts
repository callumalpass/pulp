import { create } from 'zustand';

export type ZoomMode = 'fit-width' | 'fit-page' | 'custom';

interface ReaderState {
  currentPage: number;
  totalPages: number;
  zoom: number;
  zoomMode: ZoomMode;
  tocOpen: boolean;
  scrollToPage: number | null;
  isLoading: boolean;

  setCurrentPage: (page: number) => void;
  setTotalPages: (total: number) => void;
  setZoom: (zoom: number) => void;
  setZoomMode: (mode: ZoomMode) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  setTocOpen: (open: boolean) => void;
  toggleToc: () => void;
  setScrollToPage: (page: number | null) => void;
  setIsLoading: (loading: boolean) => void;
  reset: () => void;
}

export const useReaderStore = create<ReaderState>((set) => ({
  currentPage: 1,
  totalPages: 0,
  zoom: 1,
  zoomMode: 'fit-width',
  tocOpen: false,
  scrollToPage: null,
  isLoading: true,

  setCurrentPage: (page) => set({ currentPage: page }),
  setTotalPages: (total) => set({ totalPages: total }),
  setZoom: (zoom) => set({ zoom: Math.max(0.5, Math.min(3, zoom)), zoomMode: 'custom' }),
  setZoomMode: (mode) => set({ zoomMode: mode }),
  zoomIn: () => set((state) => ({ zoom: Math.min(3, state.zoom + 0.25), zoomMode: 'custom' })),
  zoomOut: () => set((state) => ({ zoom: Math.max(0.5, state.zoom - 0.25), zoomMode: 'custom' })),
  setTocOpen: (open) => set({ tocOpen: open }),
  toggleToc: () => set((state) => ({ tocOpen: !state.tocOpen })),
  setScrollToPage: (page) => set({ scrollToPage: page }),
  setIsLoading: (loading) => set({ isLoading: loading }),
  reset: () => set({ currentPage: 1, totalPages: 0, zoom: 1, zoomMode: 'fit-width', tocOpen: false, scrollToPage: null, isLoading: true }),
}));
