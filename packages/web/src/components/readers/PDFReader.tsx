import { lazy, Suspense, useEffect, useRef, useCallback, useState, useMemo, useLayoutEffect } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { TextLayer } from 'pdfjs-dist';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import type { LiteratureNote, PDFHighlight, TextSelection, HighlightCategory } from '@pulp/shared';
import { HIGHLIGHT_CATEGORIES } from '@pulp/shared';
import { useReaderStore, type ZoomMode, type SearchMatch } from '../../stores/reader';
import { useReadingStatsStore } from '../../stores/readingStats';
import { useProgress } from '../../hooks/useProgress';
import { useHighlights } from '../../hooks/useNote';
import { useCreateHighlight } from '../../hooks/useHighlights';
import { useToast } from '../../contexts/ToastContext';
import { useMobile } from '../../hooks/useMobile';
import { useTouchDevice } from '../../hooks/useTouchDevice';
import { usePerformanceMode } from '../../hooks/usePerformanceMode';
import { usePinchZoom } from '../../hooks/usePinchZoom';
import { useDoubleTapZoom } from '../../hooks/useDoubleTapZoom';
import { useIdleDetection } from '../../hooks/useIdleDetection';
import { useBeforeUnload, useSaveShortcut } from '../../hooks/useBeforeUnload';
import { ReaderControls } from './shared/ReaderControls';
import { HighlightPopup } from './shared/HighlightPopup';
import { HighlightEditPopup } from './shared/HighlightEditPopup';
import { PDFTableOfContents } from './shared/PDFTableOfContents';
import { KeyboardShortcutsPanel } from './shared/KeyboardShortcutsPanel';
import { BookmarksPanel } from './shared/BookmarksPanel';
import { HighlightsPanel } from './shared/HighlightsPanel';
import { api } from '../../lib/api';
import { PdfRenderQueue, type TextContentData } from '../../lib/pdf-render-queue';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

const ReadingStatsPanel = lazy(() =>
  import('./shared/ReadingStatsPanel').then((m) => ({ default: m.ReadingStatsPanel }))
);
const ReadingGoalsPanel = lazy(() =>
  import('./shared/ReadingGoalsPanel').then((m) => ({ default: m.ReadingGoalsPanel }))
);

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

// PDF.js resource URLs for accurate text rendering
const PDFJS_CDN_BASE = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}`;
const CMAP_URL = `${PDFJS_CDN_BASE}/cmaps/`;
const STANDARD_FONT_URL = `${PDFJS_CDN_BASE}/standard_fonts/`;

interface PDFReaderProps {
  note: LiteratureNote;
  initialPage?: number;
}

interface Selection {
  text: string;
  page: number;
  pageLabel?: string;
  selection: TextSelection | null;
  position: { x: number; y: number };
}

interface ZoomAnchorSnapshot {
  page: number;
  pageOffsetRatio: number;
}

interface PinchPreviewState {
  scale: number;
  originX: number;
  originY: number;
}

interface PageDimensions {
  width: number;
  height: number;
}

interface PdfLoadProgress {
  loaded: number;
  total: number | null;
  percent: number | null;
}

const DEFAULT_PAGE_BUFFER = 3; // Number of pages to pre-render above/below viewport
const DEFAULT_VIRTUALIZATION_BUFFER = 8; // Number of pages above/below to keep in DOM
const PAGE_DIMENSION_CONCURRENCY = 6; // Parallelism for initial page measurements
const MAX_TEXT_CACHE_SIZE = 100; // Maximum pages to keep in text content cache
const BACKGROUND_DIMENSION_BATCH_SIZE = 25;
const PDF_RANGE_CHUNK_SIZE = 512 * 1024;
const FALLBACK_PAGE_DIMENSIONS: PageDimensions = { width: 816, height: 1056 };
const MOBILE_SELECTION_SETTLE_MS = 450;
const PINCH_COMMIT_MAX_SETTLE_MS = 400;

function findPageAtOffset(heights: number[], totalPages: number, offset: number): number {
  if (totalPages === 0) return 1;

  let low = 1;
  let high = totalPages;

  while (low < high) {
    const mid = Math.floor((low + high + 1) / 2);
    if ((heights[mid] ?? 0) <= offset) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }

  return low;
}

export function PDFReader({ note, initialPage }: PDFReaderProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const pdfDocRef = useRef<PDFDocumentProxy | null>(null);
  const pageCanvasRefs = useRef<Map<number, HTMLCanvasElement>>(new Map());
  const textLayerRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const highlightLayerRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const pageContainerRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const textLayerTasksRef = useRef<Map<number, TextLayer>>(new Map());
  const textLayerRenderingRef = useRef<Set<number>>(new Set()); // Track pages currently rendering text layer
  const textLayerGenRef = useRef(0); // Generation counter to detect stale text layer renders
  const pageRenderingRef = useRef<Set<number>>(new Set()); // Track pages currently rendering (main thread)

  // Web Worker render queue for off-main-thread rendering
  const renderQueueRef = useRef<PdfRenderQueue | null>(null);
  const useWorkerRendering = useRef(true); // Feature flag for worker rendering

  const {
    currentPage,
    totalPages,
    zoom,
    zoomMode,
    tocOpen,
    scrollToPage,
    isLoading,
    pageLabels,
    searchQuery,
    searchResults,
    currentMatchIndex,
    isSearchOpen,
    pdfViewMode,
    pdfColorMode,
    shortcutsOpen,
    bookmarksOpen,
    statsOpen,
    goalsOpen,
    setCurrentPage,
    setTotalPages,
    setPageLabels,
    setZoomValue,
    setCustomZoom,
    setZoomMode,
    setTocOpen,
    setScrollToPage,
    setIsLoading,
    setSearchResults,
    toggleSearch,
    clearSearch,
    setPdfViewMode,
    setShortcutsOpen,
    toggleShortcuts,
    setBookmarksOpen,
    toggleBookmarks,
    highlightsOpen,
    setHighlightsOpen,
    toggleHighlights,
    setStatsOpen,
    toggleStats,
    setGoalsOpen,
    toggleGoals,
    toggleToc,
    togglePdfColorMode,
    loadError,
    setLoadError,
    reset,
  } = useReaderStore();

  // Reading statistics tracking
  const {
    startSession,
    updateCurrentPage: updateStatsCurrentPage,
    endSession,
    pauseSession,
    resumeSession,
    setBookStats,
  } = useReadingStatsStore();

  // Populate stats cache from note data
  useEffect(() => {
    if (note.readingStats) {
      setBookStats(note.id, note.readingStats);
    }
  }, [note.id, note.readingStats, setBookStats]);

  const { updateProgress, saveImmediately, hasPendingChanges, saveStatus } = useProgress(note.id);
  const { data: highlights } = useHighlights(note.id);
  const createHighlight = useCreateHighlight(note.id);
  const { showToast } = useToast();

  // Save progress before the tab is closed or navigated away
  useBeforeUnload({
    onBeforeUnload: saveImmediately,
    hasUnsavedChanges: hasPendingChanges,
  });

  // Ctrl+S / Cmd+S to save immediately
  useSaveShortcut(saveImmediately);

  const [selection, setSelection] = useState<Selection | null>(null);
  const [editingHighlight, setEditingHighlight] = useState<{ highlight: PDFHighlight; position: { x: number; y: number } } | null>(null);
  const [renderedPages, setRenderedPages] = useState<Set<number>>(new Set());
  const [visiblePages, setVisiblePages] = useState<Set<number>>(new Set([1]));
  const [pageDimensions, setPageDimensions] = useState<Map<number, PageDimensions>>(new Map());
  const [defaultPageDimensions, setDefaultPageDimensions] = useState<PageDimensions | null>(null);
  const [hasToc, setHasToc] = useState(false);
  const [isPresentation, setIsPresentation] = useState(false);
  const [presentationPage, setPresentationPage] = useState(1);
  const [loadProgress, setLoadProgress] = useState<PdfLoadProgress | null>(null);

  // Mobile support
  const isMobile = useMobile();
  const isTouchDevice = useTouchDevice();
  const { isLowEnd } = usePerformanceMode();
  const pageBuffer = isLowEnd ? 1 : DEFAULT_PAGE_BUFFER;
  const virtualizationBuffer = isLowEnd ? 4 : DEFAULT_VIRTUALIZATION_BUFFER;

  // Idle detection for reading stats (the hook sets up activity listeners)
  // isIdlePaused is shown in the ReadingStatsPanel when open
  useIdleDetection();

  // Virtualization: track which pages should have DOM elements
  const [virtualizedRange, setVirtualizedRange] = useState<{ start: number; end: number }>({
    start: 1,
    end: isLowEnd ? 6 : 10,
  });
  const [pinchPreview, setPinchPreview] = useState<PinchPreviewState | null>(null);
  const [isPinchSettling, setIsPinchSettling] = useState(false);

  // Scroll direction tracking for predictive preloading
  const lastScrollTopRef = useRef(0);
  const scrollDirectionRef = useRef<'up' | 'down' | 'none'>('none');
  const idleCallbackRef = useRef<number | null>(null);

  // Text content cache for search (with LRU eviction)
  const textContentCache = useRef<Map<number, string>>(new Map());
  const textCacheAccessOrder = useRef<number[]>([]); // Track access order for LRU
  const searchLayerRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const loadGenerationRef = useRef(0);
  const restoreTargetPageRef = useRef<number | null>(null);
  const pendingZoomAnchorRef = useRef<ZoomAnchorSnapshot | null>(null);
  const pinchSettleTimeoutRef = useRef<number | null>(null);
  const mobileSelectionCheckTimeoutRef = useRef<number | null>(null);
  const mobileSelectionDismissedRef = useRef(false);
  const lastMobileSelectionSignatureRef = useRef<string | null>(null);

  const getPageDimensions = useCallback((pageNum: number): PageDimensions | null => {
    return pageDimensions.get(pageNum) || defaultPageDimensions;
  }, [defaultPageDimensions, pageDimensions]);

  const formatLoadedSize = useCallback((bytes: number) => {
    if (bytes <= 0) return '0 B';

    const units = ['B', 'KB', 'MB', 'GB'];
    let value = bytes;
    let unitIndex = 0;

    while (value >= 1024 && unitIndex < units.length - 1) {
      value /= 1024;
      unitIndex += 1;
    }

    const digits = value >= 100 || unitIndex === 0 ? 0 : 1;
    return `${value.toFixed(digits)} ${units[unitIndex]}`;
  }, []);

  // LRU cache helper for text content
  const setTextCacheEntry = useCallback((pageNum: number, text: string) => {
    const cache = textContentCache.current;
    const accessOrder = textCacheAccessOrder.current;

    // If already in cache, update access order
    if (cache.has(pageNum)) {
      const idx = accessOrder.indexOf(pageNum);
      if (idx > -1) {
        accessOrder.splice(idx, 1);
      }
      accessOrder.push(pageNum);
      cache.set(pageNum, text);
      return;
    }

    // Evict oldest entries if over limit
    while (cache.size >= MAX_TEXT_CACHE_SIZE && accessOrder.length > 0) {
      const oldest = accessOrder.shift();
      if (oldest !== undefined) {
        cache.delete(oldest);
      }
    }

    // Add new entry
    cache.set(pageNum, text);
    accessOrder.push(pageNum);
  }, []);

  // Memoized cumulative page heights for O(1) scroll offset lookups
  // pageHeights[i] = cumulative height from start to top of page i (1-indexed)
  // pageHeights[totalPages + 1] = total document height
  const pageHeights = useMemo(() => {
    const heights: number[] = [0]; // heights[0] unused (1-indexed)
    let accumulated = 16; // Initial padding

    for (let i = 1; i <= totalPages; i++) {
      heights.push(accumulated);
      const dims = pageDimensions.get(i) || defaultPageDimensions;
      if (dims) {
        accumulated += dims.height * zoom + 16; // page height + gap
      }
    }
    heights.push(accumulated); // Total document height at index totalPages + 1

    return heights;
  }, [defaultPageDimensions, pageDimensions, zoom, totalPages]);

  // Binary search to find page at a given scroll position - O(log n)
  const findPageAtScrollPosition = useCallback((scrollTop: number): number => {
    return findPageAtOffset(pageHeights, totalPages, scrollTop);
  }, [pageHeights, totalPages]);

  // Calculate fit-width zoom
  const calculateFitWidthZoom = useCallback((containerWidth: number, pageWidth: number) => {
    const padding = 48; // Account for page margins and scrollbar
    return (containerWidth - padding) / pageWidth;
  }, []);

  // Calculate fit-page zoom
  const calculateFitPageZoom = useCallback((containerWidth: number, containerHeight: number, pageWidth: number, pageHeight: number) => {
    const paddingX = 48;
    const paddingY = 32;
    const scaleX = (containerWidth - paddingX) / pageWidth;
    const scaleY = (containerHeight - paddingY) / pageHeight;
    return Math.min(scaleX, scaleY);
  }, []);

  const hasMeasuredLayoutThroughPage = useCallback((targetPage: number) => {
    if (!defaultPageDimensions) return false;
    for (let pageNum = 1; pageNum <= targetPage; pageNum += 1) {
      if (!pageDimensions.has(pageNum)) {
        return false;
      }
    }
    return true;
  }, [defaultPageDimensions, pageDimensions]);

  // Load PDF document
  useEffect(() => {
    reset();
    setDefaultPageDimensions(null);
    setLoadProgress(null);
    restoreTargetPageRef.current = null;
    mobileSelectionDismissedRef.current = false;
    lastMobileSelectionSignatureRef.current = null;
    setPinchPreview(null);
    setIsPinchSettling(false);
    if (pinchSettleTimeoutRef.current !== null) {
      window.clearTimeout(pinchSettleTimeoutRef.current);
      pinchSettleTimeoutRef.current = null;
    }
    if (mobileSelectionCheckTimeoutRef.current !== null) {
      window.clearTimeout(mobileSelectionCheckTimeoutRef.current);
      mobileSelectionCheckTimeoutRef.current = null;
    }
    loadGenerationRef.current += 1;
    const loadGeneration = loadGenerationRef.current;

    // Initialize render queue for worker-based rendering
    if (!renderQueueRef.current) {
      renderQueueRef.current = new PdfRenderQueue(15); // Cache up to 15 pages
    }

    loadPDF(loadGeneration);

    return () => {
      // Cleanup on unmount
      saveImmediately();
      endSession(); // End reading session when leaving
      textLayerTasksRef.current.forEach(task => task.cancel());
      if (idleCallbackRef.current !== null) {
        cancelIdleCallback(idleCallbackRef.current);
      }
      if (pinchSettleTimeoutRef.current !== null) {
        window.clearTimeout(pinchSettleTimeoutRef.current);
      }
      if (mobileSelectionCheckTimeoutRef.current !== null) {
        window.clearTimeout(mobileSelectionCheckTimeoutRef.current);
      }
      renderQueueRef.current?.destroy();
      renderQueueRef.current = null;
      pdfDocRef.current?.destroy();
    };
  }, [note.id, isMobile]);

  const loadPDF = async (loadGeneration: number) => {
    try {
      setIsLoading(true);
      setLoadError(null);
      const pdfUrl = api.files.getUrl(note.id);
      // Worker needs absolute URL since it can't resolve relative paths
      const absolutePdfUrl = new URL(pdfUrl, window.location.origin).href;

      // Set PDF URL for worker-based rendering
      renderQueueRef.current?.setPdfUrl(absolutePdfUrl);

      const loadingTask = pdfjsLib.getDocument({
        url: pdfUrl,
        cMapUrl: CMAP_URL,
        cMapPacked: true,
        standardFontDataUrl: STANDARD_FONT_URL,
        disableAutoFetch: true,
        disableStream: false,
        rangeChunkSize: PDF_RANGE_CHUNK_SIZE,
      });
      loadingTask.onProgress = ({ loaded, total }: { loaded: number; total?: number }) => {
        if (loadGeneration !== loadGenerationRef.current) return;

        const safeTotal = typeof total === 'number' && Number.isFinite(total) && total > 0 ? total : null;
        const percent = safeTotal ? Math.min(100, Math.round((loaded / safeTotal) * 100)) : null;
        setLoadProgress({ loaded, total: safeTotal, percent });
      };
      const pdf = await loadingTask.promise;
      if (loadGeneration !== loadGenerationRef.current) return;
      pdfDocRef.current = pdf;
      setTotalPages(pdf.numPages);
      setLoadProgress((current) => current ?? { loaded: 0, total: null, percent: null });

      // Seed layout with a reasonable page estimate so the reader can paint immediately.
      const initialDimensions = new Map<number, PageDimensions>();
      setPageDimensions(initialDimensions);
      setDefaultPageDimensions(FALLBACK_PAGE_DIMENSIONS);

      // Calculate initial zoom based on container and widest page
      if (scrollContainerRef.current && zoomMode === 'fit-width') {
        const containerWidth = scrollContainerRef.current.clientWidth;
        const fitZoom = calculateFitWidthZoom(containerWidth, FALLBACK_PAGE_DIMENSIONS.width);
        setZoomValue(fitZoom);
      }

      // Restore progress or jump to initial page (from search deep link)
      const targetPage = initialPage && initialPage >= 1 && initialPage <= pdf.numPages
        ? initialPage
        : note.progress > 0
          ? Math.max(1, Math.round((note.progress / 100) * pdf.numPages))
          : null;

      if (targetPage) {
        restoreTargetPageRef.current = targetPage;
      }

      setIsLoading(false);
      setLoadProgress(null);

      // Start reading session after PDF is loaded
      const startPage = targetPage || 1;
      startSession(note.id, startPage, pdf.numPages);

      // Fill in document metadata and page dimensions after the reader is usable.
      void (async () => {
        try {
          const [outline, labels] = await Promise.all([
            pdf.getOutline(),
            pdf.getPageLabels(),
          ]);
          if (loadGeneration !== loadGenerationRef.current) return;
          setHasToc(outline !== null && outline.length > 0);
          setPageLabels(labels);
        } catch (error) {
          console.warn('Failed to load PDF outline or page labels', error);
        }
      })();

      void (async () => {
        const measuredDimensions = new Map<number, PageDimensions>(initialDimensions);
        let nextPage = 1;
        let pagesMeasuredSinceFlush = 0;

        const flushDimensions = () => {
          pagesMeasuredSinceFlush = 0;
          if (loadGeneration !== loadGenerationRef.current) return;
          setPageDimensions(new Map(measuredDimensions));
          const firstMeasuredPage = measuredDimensions.get(1);
          if (firstMeasuredPage) {
            setDefaultPageDimensions(firstMeasuredPage);
          }
        };

        const workerCount = Math.min(PAGE_DIMENSION_CONCURRENCY, Math.max(1, pdf.numPages));
        const workers = Array.from({ length: workerCount }, async () => {
          while (true) {
            const pageNum = nextPage++;
            if (pageNum > pdf.numPages || loadGeneration !== loadGenerationRef.current) break;

            const page = await pdf.getPage(pageNum);
            if (loadGeneration !== loadGenerationRef.current) break;

            const viewport = page.getViewport({ scale: 1 });
            measuredDimensions.set(pageNum, { width: viewport.width, height: viewport.height });
            pagesMeasuredSinceFlush += 1;

            if (pagesMeasuredSinceFlush >= BACKGROUND_DIMENSION_BATCH_SIZE) {
              flushDimensions();
            }
          }
        });

        await Promise.all(workers);
        if (loadGeneration !== loadGenerationRef.current) return;
        flushDimensions();
      })();
    } catch (error) {
      console.error('Failed to load PDF:', error);
      const errorMessage = error instanceof Error
        ? error.message
        : 'An unknown error occurred while loading the PDF';
      setLoadError(errorMessage);
      setIsLoading(false);
      setLoadProgress(null);
    }
  };

  // Track page changes for reading stats
  useEffect(() => {
    if (!isLoading && totalPages > 0) {
      updateStatsCurrentPage(currentPage);
    }
  }, [currentPage, isLoading, totalPages, updateStatsCurrentPage]);

  const captureZoomAnchor = useCallback((center?: { x: number; y: number }) => {
    const scrollContainer = scrollContainerRef.current;
    if (!scrollContainer || totalPages === 0 || pdfColorMode === 'eink') {
      pendingZoomAnchorRef.current = null;
      return;
    }

    const rect = scrollContainer.getBoundingClientRect();
    const anchorX = center ? center.x - rect.left : rect.width / 2;
    const anchorY = center ? center.y - rect.top : rect.height / 2;
    const viewportAnchor = scrollContainer.scrollTop + anchorY;
    const anchorPage = findPageAtOffset(pageHeights, totalPages, viewportAnchor);
    const pageTop = pageHeights[anchorPage] ?? 0;
    const pageBottom = pageHeights[anchorPage + 1] ?? pageTop;
    const pageHeight = Math.max(1, pageBottom - pageTop);
    const pageOffsetRatio = Math.max(0, Math.min(1, (viewportAnchor - pageTop) / pageHeight));

    pendingZoomAnchorRef.current = {
      page: anchorPage,
      pageOffsetRatio,
    };
  }, [pageHeights, pdfColorMode, totalPages]);

  // Keep the viewport anchored to the same place in the document when zoom changes.
  useLayoutEffect(() => {
    const scrollContainer = scrollContainerRef.current;
    const zoomAnchor = pendingZoomAnchorRef.current;

    if (
      scrollContainer &&
      zoomAnchor &&
      restoreTargetPageRef.current === null &&
      totalPages > 0 &&
      pdfColorMode !== 'eink'
    ) {
      const pageTop = pageHeights[zoomAnchor.page] ?? 0;
      const pageBottom = pageHeights[zoomAnchor.page + 1] ?? pageTop;
      const pageHeight = Math.max(1, pageBottom - pageTop);
      const viewportAnchor = pageTop + zoomAnchor.pageOffsetRatio * pageHeight;
      const nextScrollTop = Math.max(0, viewportAnchor - scrollContainer.clientHeight / 2);

      scrollContainer.scrollTop = nextScrollTop;
    }

    pendingZoomAnchorRef.current = null;
  }, [pageHeights, pdfColorMode, totalPages, zoom]);

  // Wait until layout is measured through the restore target, then scroll once.
  useEffect(() => {
    const targetPage = restoreTargetPageRef.current;
    if (targetPage === null || isLoading || totalPages === 0) return;
    if (!hasMeasuredLayoutThroughPage(targetPage)) return;

    setCurrentPage(targetPage);
    updateProgress((targetPage / totalPages) * 100);
    setScrollToPage(targetPage);
  }, [defaultPageDimensions, pageDimensions, hasMeasuredLayoutThroughPage, isLoading, setCurrentPage, setScrollToPage, totalPages, updateProgress]);

  // Pause/resume session on visibility change (tab switching)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        pauseSession();
      } else {
        resumeSession();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [pauseSession, resumeSession]);

  // Get max page width for fit-width calculations
  const getMaxPageWidth = useCallback(() => {
    let maxWidth = defaultPageDimensions?.width || 0;
    pageDimensions.forEach((dims) => {
      maxWidth = Math.max(maxWidth, dims.width);
    });
    return maxWidth;
  }, [defaultPageDimensions?.width, pageDimensions]);

  const applyCustomZoom = useCallback((nextZoom: number) => {
    captureZoomAnchor();
    setCustomZoom(nextZoom);
  }, [captureZoomAnchor, setCustomZoom]);

  const handlePinchPreviewChange = useCallback((preview: { scale: number; center: { x: number; y: number } } | null) => {
    if (!preview) {
      setPinchPreview(null);
      return;
    }

    const scrollContainer = scrollContainerRef.current;
    if (!scrollContainer) return;

    const rect = scrollContainer.getBoundingClientRect();
    setPinchPreview({
      scale: preview.scale,
      originX: preview.center.x - rect.left,
      originY: preview.center.y - rect.top + scrollContainer.scrollTop,
    });
  }, []);

  const handlePinchZoomCommit = useCallback((nextZoom: number, center: { x: number; y: number }) => {
    setIsPinchSettling(true);
    if (pinchSettleTimeoutRef.current !== null) {
      window.clearTimeout(pinchSettleTimeoutRef.current);
    }
    pinchSettleTimeoutRef.current = window.setTimeout(() => {
      setIsPinchSettling(false);
      pinchSettleTimeoutRef.current = null;
    }, PINCH_COMMIT_MAX_SETTLE_MS);
    captureZoomAnchor(center);
    setCustomZoom(nextZoom);
  }, [captureZoomAnchor, setCustomZoom]);

  useEffect(() => {
    if (!isPinchSettling) return;

    const visiblePagesReady = Array.from(visiblePages).every((pageNum) => (
      renderedPagesRef.current.has(pageNum) &&
      pageZoomRef.current.get(pageNum) === zoom &&
      textLayerZoomRef.current.get(pageNum) === zoom
    ));

    if (!visiblePagesReady) return;

    const settleFrame = window.requestAnimationFrame(() => {
      setIsPinchSettling(false);
      if (pinchSettleTimeoutRef.current !== null) {
        window.clearTimeout(pinchSettleTimeoutRef.current);
        pinchSettleTimeoutRef.current = null;
      }
    });

    return () => window.cancelAnimationFrame(settleFrame);
  }, [isPinchSettling, visiblePages, zoom]);

  const applyZoomMode = useCallback((mode: ZoomMode) => {
    if (pageDimensions.size === 0 || !scrollContainerRef.current) return;

    const firstPage = getPageDimensions(1);
    if (!firstPage) return;

    let nextZoom = zoom;
    if (mode === 'fit-width') {
      const containerWidth = scrollContainerRef.current.clientWidth;
      const maxWidth = getMaxPageWidth();
      nextZoom = calculateFitWidthZoom(containerWidth, maxWidth);
    } else if (mode === 'fit-page') {
      const containerWidth = scrollContainerRef.current.clientWidth;
      const containerHeight = scrollContainerRef.current.clientHeight;
      nextZoom = calculateFitPageZoom(containerWidth, containerHeight, firstPage.width, firstPage.height);
    }

    captureZoomAnchor();
    setZoomMode(mode);
    setZoomValue(nextZoom);
  }, [calculateFitPageZoom, calculateFitWidthZoom, captureZoomAnchor, getMaxPageWidth, getPageDimensions, pageDimensions.size, scrollContainerRef, setZoomMode, setZoomValue, zoom]);

  // Recalculate zoom on window resize for fit modes
  useEffect(() => {
    if (pageDimensions.size === 0 || !scrollContainerRef.current) return;

    const handleResize = () => {
      if (zoomMode === 'fit-width') {
        applyZoomMode('fit-width');
      } else if (zoomMode === 'fit-page') {
        applyZoomMode('fit-page');
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [applyZoomMode, pageDimensions.size, zoomMode]);

  // Update visible pages based on virtualized range
  // This replaces the IntersectionObserver approach for better performance
  useEffect(() => {
    if (!pdfDocRef.current || isLoading) return;

    // E-ink mode: only show current page
    if (pdfColorMode === 'eink') {
      setVisiblePages(new Set([currentPage]));
      setRenderedPages((prev) => {
        const updated = new Set<number>();
        if (prev.has(currentPage)) {
          updated.add(currentPage);
        }
        renderedPagesRef.current = updated;
        return updated;
      });
      return;
    }

    // Set visible pages to the virtualized range
    const newVisiblePages = new Set<number>();
    for (let i = virtualizedRange.start; i <= virtualizedRange.end; i++) {
      newVisiblePages.add(i);
    }
    setVisiblePages(newVisiblePages);

    // Clear rendered state for pages that left the DOM
    // This ensures they get re-rendered when they come back into view
    setRenderedPages((prev) => {
      const updated = new Set<number>();
      prev.forEach((pageNum) => {
        if (pageNum >= virtualizedRange.start && pageNum <= virtualizedRange.end) {
          updated.add(pageNum);
        }
      });
      // Also clear refs for pages no longer in range
      renderedPagesRef.current = updated;
      return updated;
    });
  }, [virtualizedRange, isLoading, pdfColorMode, currentPage]);

  // E-ink mode: force fit-page zoom for optimal e-reader display
  useEffect(() => {
    if (pdfColorMode === 'eink' && zoomMode !== 'fit-page') {
      applyZoomMode('fit-page');
    }
  }, [pdfColorMode]);

  // E-ink mode: update virtualized range to match current page
  // Without this, pages beyond the initial range (1-10) won't render
  // because renderPage checks virtualizedRange before rendering
  useEffect(() => {
    if (pdfColorMode === 'eink') {
      setVirtualizedRange({ start: currentPage, end: currentPage });
    }
  }, [pdfColorMode, currentPage]);

  // E-ink mode: preload adjacent pages for instant navigation
  useEffect(() => {
    if (pdfColorMode !== 'eink' || !renderQueueRef.current || totalPages === 0) return;

    // Preload next and previous pages
    const pagesToPreload: number[] = [];
    if (currentPage > 1) pagesToPreload.push(currentPage - 1);
    if (currentPage < totalPages) pagesToPreload.push(currentPage + 1);
    // Also preload 2 pages ahead for faster forward navigation
    if (currentPage < totalPages - 1) pagesToPreload.push(currentPage + 2);

    if (pagesToPreload.length > 0) {
      renderQueueRef.current.renderBuffer(pagesToPreload, zoom);
    }
  }, [pdfColorMode, currentPage, totalPages, zoom]);

  // Render text layers for visible pages that have canvas but no text layer
  // This handles pages that were pre-rendered as buffer pages
  useEffect(() => {
    if (!pdfDocRef.current || isLoading) return;

    visiblePages.forEach((pageNum) => {
      const textLayerDiv = textLayerRefs.current.get(pageNum);
      // Only render if page is rendered but text layer is empty
      if (textLayerDiv && renderedPages.has(pageNum) && textLayerDiv.childElementCount === 0) {
        renderTextLayer(pageNum, textLayerDiv, zoom);
      }
    });
  }, [visiblePages, renderedPages, zoom, isLoading]);

  // Calculate cumulative scroll offset to a page - O(1) lookup
  const getScrollOffsetToPage = useCallback((targetPage: number) => {
    return pageHeights[targetPage] ?? 16;
  }, [pageHeights]);

  // Calculate height for a range of pages - O(1) lookup
  const getHeightForPageRange = useCallback((startPage: number, endPage: number) => {
    // Height from start of startPage to end of endPage
    const startOffset = pageHeights[startPage] ?? 0;
    const endOffset = pageHeights[endPage + 1] ?? pageHeights[totalPages + 1] ?? 0;
    return endOffset - startOffset;
  }, [pageHeights, totalPages]);

  // Calculate which pages should be in the DOM based on scroll position - O(log n)
  const calculateVirtualizedRange = useCallback((scrollTop: number, viewportHeight: number) => {
    if ((!defaultPageDimensions && pageDimensions.size === 0) || totalPages === 0) {
      return { start: 1, end: Math.min(virtualizationBuffer + 2, totalPages) };
    }

    // Find the first page that could be visible (using binary search)
    // We want pages where bottom edge >= scrollTop - viewportHeight (buffer above)
    const bufferTop = Math.max(0, scrollTop - viewportHeight);
    const startPage = findPageAtScrollPosition(bufferTop);

    // Find the last page that could be visible
    // We want pages where top edge <= scrollTop + viewportHeight * 2 (buffer below)
    const bufferBottom = scrollTop + viewportHeight * 2;
    const endPage = findPageAtScrollPosition(bufferBottom);

    // Add virtualization buffer
    return {
      start: Math.max(1, startPage - virtualizationBuffer),
      end: Math.min(totalPages, endPage + virtualizationBuffer),
    };
  }, [defaultPageDimensions, pageDimensions, totalPages, findPageAtScrollPosition, virtualizationBuffer]);

  // Update current page based on scroll position - O(log n) using binary search
  // Skip in e-ink mode since pages are controlled manually, not by scroll
  useEffect(() => {
    // E-ink mode: page is controlled manually, skip scroll-based detection
    if (pdfColorMode === 'eink') return;

    const scrollContainer = scrollContainerRef.current;
    if (!scrollContainer || (!defaultPageDimensions && pageDimensions.size === 0)) return;

    const handleScroll = () => {
      const scrollTop = scrollContainer.scrollTop;
      const viewportHeight = scrollContainer.clientHeight;

      // Track scroll direction for predictive preloading
      const scrollDelta = scrollTop - lastScrollTopRef.current;
      if (Math.abs(scrollDelta) > 10) {
        scrollDirectionRef.current = scrollDelta > 0 ? 'down' : 'up';
      }
      lastScrollTopRef.current = scrollTop;

      // Find which page we're on using binary search
      // Consider page "current" when its top half is visible
      const page = findPageAtScrollPosition(scrollTop);
      const dims = getPageDimensions(page);
      let newCurrentPage = page;

      // Adjust for the "50% rule" - if we've scrolled past half the page, go to next
      if (dims && page < totalPages) {
        const pageTop = pageHeights[page];
        const pageMiddle = pageTop + (dims.height * zoom) / 2;
        if (scrollTop > pageMiddle) {
          newCurrentPage = page + 1;
        }
      }

      if (restoreTargetPageRef.current === null && newCurrentPage !== currentPage) {
        setCurrentPage(newCurrentPage);
        const progress = (newCurrentPage / totalPages) * 100;
        updateProgress(progress);
      }

      // Update virtualized range
      const newRange = calculateVirtualizedRange(scrollTop, viewportHeight);
      setVirtualizedRange((prev) => {
        if (prev.start !== newRange.start || prev.end !== newRange.end) {
          return newRange;
        }
        return prev;
      });
    };

    // Initial calculation
    handleScroll();

    scrollContainer.addEventListener('scroll', handleScroll, { passive: true });
    return () => scrollContainer.removeEventListener('scroll', handleScroll);
  }, [defaultPageDimensions, pageDimensions, zoom, totalPages, currentPage, setCurrentPage, updateProgress, calculateVirtualizedRange, findPageAtScrollPosition, getPageDimensions, pageHeights, pdfColorMode]);

  // Handle programmatic scroll to page
  useEffect(() => {
    if (scrollToPage === null || !scrollContainerRef.current || (!defaultPageDimensions && pageDimensions.size === 0)) return;

    const targetScroll = getScrollOffsetToPage(scrollToPage);
    const isInitialRestore = restoreTargetPageRef.current === scrollToPage;

    scrollContainerRef.current.scrollTo({
      top: targetScroll,
      behavior: isInitialRestore ? 'auto' : 'smooth',
    });

    if (isInitialRestore) {
      restoreTargetPageRef.current = null;
    }
    setScrollToPage(null);
  }, [scrollToPage, defaultPageDimensions, pageDimensions, zoom, setScrollToPage, getScrollOffsetToPage]);

  // Version counter to trigger re-renders when debounced zoom changes
  const [renderVersion, setRenderVersion] = useState(0);

  // Track pages currently being rendered to avoid duplicates
  const renderingRef = useRef<Set<number>>(new Set());
  // Track rendered pages in a ref to avoid stale closures
  const renderedPagesRef = useRef<Set<number>>(new Set());
  // Track the zoom level each page was rendered at
  const pageZoomRef = useRef<Map<number, number>>(new Map());
  const textLayerZoomRef = useRef<Map<number, number>>(new Map());

  // Clear rendered pages and bump version when debounced zoom changes
  useEffect(() => {
    // Clear both state and refs immediately to ensure re-renders
    setRenderedPages(new Set());
    renderedPagesRef.current = new Set();
    renderingRef.current = new Set();
    pageZoomRef.current = new Map();
    textLayerZoomRef.current = new Map();
    // Clear text layer contents so they get re-rendered at the new zoom level
    textLayerRefs.current.forEach((textLayerDiv) => {
      textLayerDiv.innerHTML = '';
    });
    // Cancel any pending text layer tasks
    textLayerTasksRef.current.forEach((task) => task.cancel());
    textLayerTasksRef.current.clear();
    textLayerRenderingRef.current.clear();
    textLayerGenRef.current++;
    setRenderVersion((v) => v + 1);
  }, [zoom]);

  // Keep ref in sync with state
  useEffect(() => {
    renderedPagesRef.current = renderedPages;
  }, [renderedPages]);

  // Render visible pages and buffer with predictive preloading
  useEffect(() => {
    if (!pdfDocRef.current || isLoading) return;

    // Cancel any pending idle callback
    if (idleCallbackRef.current !== null) {
      cancelIdleCallback(idleCallbackRef.current);
      idleCallbackRef.current = null;
    }

    const priorityPages = new Set<number>();
    const bufferPages = new Set<number>();

    // Add visible pages with high priority
    visiblePages.forEach((pageNum) => {
      priorityPages.add(pageNum);
    });

    // Add buffer pages based on scroll direction (predictive preloading)
    const direction = scrollDirectionRef.current;
    const forwardBuffer = direction === 'down' ? pageBuffer + 2 : pageBuffer;
    const backwardBuffer = direction === 'up' ? pageBuffer + 2 : pageBuffer;

    visiblePages.forEach((pageNum) => {
      // Pages ahead (in scroll direction get more buffer)
      for (let i = 1; i <= forwardBuffer; i++) {
        const p = pageNum + i;
        if (p <= totalPages && !priorityPages.has(p)) {
          bufferPages.add(p);
        }
      }
      // Pages behind
      for (let i = 1; i <= backwardBuffer; i++) {
        const p = pageNum - i;
        if (p >= 1 && !priorityPages.has(p)) {
          bufferPages.add(p);
        }
      }
    });

    // Render priority pages immediately
    priorityPages.forEach((pageNum) => {
      const wasRenderedAtZoom = pageZoomRef.current.get(pageNum);
      const needsRender = !renderedPagesRef.current.has(pageNum) || wasRenderedAtZoom !== zoom;

      if (needsRender && !renderingRef.current.has(pageNum)) {
        renderingRef.current.add(pageNum);
        renderPage(pageNum).finally(() => {
          renderingRef.current.delete(pageNum);
        });
      } else if (renderedPagesRef.current.has(pageNum) && wasRenderedAtZoom === zoom) {
        // Page was already rendered (e.g. as a buffer page) but may not have a text layer.
        // Ensure text layer is rendered for visible pages.
        const textLayerDiv = textLayerRefs.current.get(pageNum);
        if (!isPinchSettling && textLayerDiv && textLayerDiv.querySelectorAll('span').length === 0) {
          const canvas = pageCanvasRefs.current.get(pageNum);
          if (canvas) {
            const cssWidth = parseFloat(canvas.style.width);
            const cssHeight = parseFloat(canvas.style.height);
            renderTextLayer(pageNum, textLayerDiv, zoom,
              isNaN(cssWidth) ? undefined : cssWidth,
              isNaN(cssHeight) ? undefined : cssHeight);
          }
        }
      }
    });

    // Render buffer pages during idle time
    if (!isPinchSettling && bufferPages.size > 0) {
      idleCallbackRef.current = requestIdleCallback(
        (deadline) => {
          const pagesToRender = Array.from(bufferPages).filter((pageNum) => {
            const wasRenderedAtZoom = pageZoomRef.current.get(pageNum);
            return !renderedPagesRef.current.has(pageNum) || wasRenderedAtZoom !== zoom;
          });

          for (const pageNum of pagesToRender) {
            if (deadline.timeRemaining() < 5) break; // Stop if no time left
            if (!renderingRef.current.has(pageNum)) {
              renderingRef.current.add(pageNum);
              renderPage(pageNum).finally(() => {
                renderingRef.current.delete(pageNum);
              });
            }
          }
        },
        { timeout: 500 }
      );
    }

    // Cleanup pages far from viewport (memory optimization)
    const pagesToRemove: number[] = [];
    renderedPagesRef.current.forEach((pageNum) => {
      let shouldKeep = false;
      visiblePages.forEach((visiblePage) => {
        if (Math.abs(pageNum - visiblePage) <= pageBuffer + 1) {
          shouldKeep = true;
        }
      });

      if (!shouldKeep) {
        // Clear the canvas but keep the element
        const canvas = pageCanvasRefs.current.get(pageNum);
        if (canvas) {
          const ctx = canvas.getContext('2d');
          ctx?.clearRect(0, 0, canvas.width, canvas.height);
        }
        const textLayer = textLayerRefs.current.get(pageNum);
        if (textLayer) {
          textLayer.innerHTML = '';
        }
        const highlightLayer = highlightLayerRefs.current.get(pageNum);
        if (highlightLayer) {
          highlightLayer.innerHTML = '';
        }
        pagesToRemove.push(pageNum);
      }
    });
    if (pagesToRemove.length > 0) {
      setRenderedPages((prev) => {
        const next = new Set(prev);
        pagesToRemove.forEach((pageNum) => next.delete(pageNum));
        return next;
      });
    }
  }, [visiblePages, totalPages, isLoading, renderVersion, zoom, pageBuffer, isPinchSettling]);

  // Render highlights when pages are ready
  useEffect(() => {
    if (isPinchSettling) return;
    if (!highlights) return;

    renderedPages.forEach((pageNum) => {
      const textLayerDiv = textLayerRefs.current.get(pageNum);
      const highlightLayerDiv = highlightLayerRefs.current.get(pageNum);
      if (!textLayerDiv || !highlightLayerDiv) return;

      // Clear existing highlights
      highlightLayerDiv.innerHTML = '';

      // Filter highlights for this page
      const pageHighlights = highlights.filter(
        (h): h is PDFHighlight => h.type === 'pdf' && h.page === pageNum
      );

      // Render each highlight
      for (const highlight of pageHighlights) {
        renderHighlightFromSelection(textLayerDiv, highlightLayerDiv, highlight);
      }
    });
  }, [highlights, isPinchSettling, renderedPages]);

  const renderPage = async (pageNum: number) => {
    if (!pdfDocRef.current) return;

    // Skip if already rendered at current zoom level
    const renderedAtZoom = pageZoomRef.current.get(pageNum);
    if (renderedPages.has(pageNum) && renderedAtZoom === zoom) return;

    // Check if page is still in virtualized range (might have scrolled away during async wait)
    if (pageNum < virtualizedRange.start || pageNum > virtualizedRange.end) return;

    // Cancel existing text layer task for this page
    textLayerTasksRef.current.get(pageNum)?.cancel();

    const canvas = pageCanvasRefs.current.get(pageNum);
    const textLayerDiv = textLayerRefs.current.get(pageNum);
    if (!canvas) return;

    const scale = zoom;
    const devicePixelRatio = window.devicePixelRatio || 1;

    try {
      // Try worker-based rendering first (off main thread)
      if (useWorkerRendering.current && renderQueueRef.current) {
        // Check cache first
        let bitmap: ImageBitmap | null | undefined = renderQueueRef.current.getCached(pageNum, scale);

        if (!bitmap) {
          const includeText = visiblePages.has(pageNum);
          // Request render from worker
          const results = await renderQueueRef.current.renderVisible([pageNum], scale, includeText);
          bitmap = results.get(pageNum) ?? null;
        }

        if (bitmap) {
          // Re-check if page is still in range after async operation
          if (pageNum < virtualizedRange.start || pageNum > virtualizedRange.end) return;

          // Draw ImageBitmap to canvas (very fast, ~1ms)
          const width = bitmap.width;
          const height = bitmap.height;

          // Calculate CSS dimensions - these must match the text layer exactly
          const cssWidth = width / devicePixelRatio;
          const cssHeight = height / devicePixelRatio;

          canvas.width = width;
          canvas.height = height;
          canvas.style.width = `${cssWidth}px`;
          canvas.style.height = `${cssHeight}px`;

          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(bitmap, 0, 0);
          }

          // Mark page as rendered
          pageZoomRef.current.set(pageNum, scale);
          setRenderedPages((prev) => new Set(prev).add(pageNum));

          // Only render text layer for visible pages (not buffer pages)
          // Text layer is expensive and only needed for selection
          // Pass canvas CSS dimensions to ensure exact alignment
          if (visiblePages.has(pageNum)) {
            renderTextLayer(pageNum, textLayerDiv, scale, cssWidth, cssHeight);
          }
          return;
        }
      }

      // Fallback to main thread rendering if worker fails or is disabled
      // Guard against concurrent renders on the same canvas
      if (pageRenderingRef.current.has(pageNum)) return;
      pageRenderingRef.current.add(pageNum);

      try {
        const page: PDFPageProxy = await pdfDocRef.current.getPage(pageNum);

        // Re-check if page is still in range after async operation
        if (pageNum < virtualizedRange.start || pageNum > virtualizedRange.end) {
          pageRenderingRef.current.delete(pageNum);
          return;
        }

        const displayViewport = page.getViewport({ scale });
        const renderViewport = page.getViewport({ scale: scale * devicePixelRatio });

        canvas.width = renderViewport.width;
        canvas.height = renderViewport.height;
        canvas.style.width = `${displayViewport.width}px`;
        canvas.style.height = `${displayViewport.height}px`;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          pageRenderingRef.current.delete(pageNum);
          return;
        }

        // Render the page on main thread
        const renderTask = page.render({
          canvasContext: ctx,
          viewport: renderViewport,
        });

        await renderTask.promise;

        // Mark page as rendered
        pageZoomRef.current.set(pageNum, scale);
        setRenderedPages((prev) => new Set(prev).add(pageNum));

        // Render text layer
        if (textLayerDiv) {
          requestAnimationFrame(() => {
            renderTextLayer(pageNum, textLayerDiv, scale, displayViewport.width, displayViewport.height);
          });
        }
      } catch (mainThreadError) {
        // Cleanup on main thread fallback error
        if ((mainThreadError as Error).name !== 'RenderingCancelledException') {
          console.error(`Failed to render page ${pageNum} (main thread):`, mainThreadError);
        }
      } finally {
        pageRenderingRef.current.delete(pageNum);
      }
    } catch (error) {
      if ((error as Error).name !== 'RenderingCancelledException') {
        console.error(`Failed to render page ${pageNum}:`, error);
      }
    }
  };

  /**
   * Render text layer for a page (used with worker rendering)
   * @param canvasWidth - Optional canvas CSS width to match exactly (avoids floating-point mismatch)
   * @param canvasHeight - Optional canvas CSS height to match exactly (avoids floating-point mismatch)
   */
  const renderTextLayer = async (
    pageNum: number,
    textLayerDiv: HTMLDivElement | undefined,
    scale: number,
    canvasWidth?: number,
    canvasHeight?: number,
  ) => {
    if (!textLayerDiv || !pdfDocRef.current) return;

    // Skip if already rendering or already rendered at this scale
    if (textLayerRenderingRef.current.has(pageNum)) return;
    const existingLayer = textLayerTasksRef.current.get(pageNum);
    if (existingLayer && textLayerDiv.querySelectorAll('span').length > 0 && textLayerZoomRef.current.get(pageNum) === scale) return;

    textLayerRenderingRef.current.add(pageNum);
    textLayerZoomRef.current.delete(pageNum);
    const generation = textLayerGenRef.current;

    try {
      const page = await pdfDocRef.current.getPage(pageNum);

      // Abort if zoom changed since we started (stale render)
      if (generation !== textLayerGenRef.current) return;

      // When canvas dimensions are provided (worker rendering), compute the exact scale
      // that produces those dimensions to avoid floating-point mismatches.
      // The bitmap dimensions are integers (rounded), so we need to match exactly.
      let textLayerViewport;
      let layerWidth: number;
      let layerHeight: number;

      if (canvasWidth !== undefined && canvasHeight !== undefined) {
        // Compute the actual scale from canvas dimensions
        const baseViewport = page.getViewport({ scale: 1 });
        const actualScale = canvasWidth / baseViewport.width;
        textLayerViewport = page.getViewport({ scale: actualScale });
        layerWidth = canvasWidth;
        layerHeight = canvasHeight;
      } else {
        // Use the requested scale directly
        textLayerViewport = page.getViewport({ scale });
        layerWidth = textLayerViewport.width;
        layerHeight = textLayerViewport.height;
      }

      // Clear the text layer and set --scale-factor for PDF.js v4.
      // PDF.js TextLayer uses this CSS custom property for font-size
      // (calc(var(--scale-factor) * Npx)) and container dimensions
      // (round(down, var(--scale-factor) * pageWidthPx, 1px)).
      textLayerDiv.innerHTML = '';
      textLayerDiv.style.setProperty('--scale-factor', String(textLayerViewport.scale));

      // Prefer worker cached text content (avoids main-thread extraction)
      let textContentData = renderQueueRef.current?.getTextContent(pageNum) ?? null;
      if (!textContentData && renderQueueRef.current) {
        textContentData = await new Promise<TextContentData | null>((resolve) => {
          let unsubscribe = () => {};
          const timeout = setTimeout(() => {
            unsubscribe();
            resolve(null);
          }, 250);
          unsubscribe = renderQueueRef.current!.onTextContent((pn, tc) => {
            if (pn === pageNum) {
              clearTimeout(timeout);
              unsubscribe();
              resolve(tc);
            }
          });
          const cached = renderQueueRef.current?.getTextContent(pageNum);
          if (cached) {
            clearTimeout(timeout);
            unsubscribe();
            resolve(cached);
          }
        });
      }

      // Abort if zoom changed while waiting for text content
      if (generation !== textLayerGenRef.current) return;

      if (!textContentData) {
        textContentData = await page.getTextContent();
      }
      if (!textContentData) return;

      // Final generation check before rendering
      if (generation !== textLayerGenRef.current) return;

      const pageText = textContentData.items
        .map((item) => ('str' in item ? item.str : ''))
        .join(' ');
      setTextCacheEntry(pageNum, pageText);

      const textLayer = new TextLayer({
        textContentSource: textContentData,
        container: textLayerDiv,
        viewport: textLayerViewport,
      });

      // Override the container dimensions set by setLayerDimensions (which uses
      // round(down, ...)) with the exact viewport dimensions. This eliminates
      // sub-pixel gaps between the text layer and canvas, since span positions
      // use percentage-based left/top relative to the container width/height.
      if (canvasWidth !== undefined && canvasHeight !== undefined) {
        textLayerDiv.style.width = `${canvasWidth}px`;
        textLayerDiv.style.height = `${canvasHeight}px`;
      } else {
        textLayerDiv.style.width = `${layerWidth}px`;
        textLayerDiv.style.height = `${layerHeight}px`;
      }

      textLayerTasksRef.current.set(pageNum, textLayer);
      await textLayer.render();

      // Abort if zoom changed during render - don't add stale data-idx attributes
      if (generation !== textLayerGenRef.current) return;

      // Add data-idx attributes to spans for PDF++ compatibility
      const spans = textLayerDiv.querySelectorAll('span');
      spans.forEach((span, idx) => {
        span.setAttribute('data-idx', String(idx));
        span.classList.add('textLayerNode');
      });
      textLayerZoomRef.current.set(pageNum, scale);
    } catch (error) {
      // Ignore errors (page might have been removed from DOM)
    } finally {
      textLayerRenderingRef.current.delete(pageNum);
    }
  };

  /**
   * Render a highlight overlay by looking up text layer spans.
   */
  const renderHighlightFromSelection = (
    textLayerDiv: HTMLDivElement,
    highlightLayerDiv: HTMLDivElement,
    highlight: PDFHighlight
  ) => {
    const spans = Array.from(textLayerDiv.querySelectorAll('span'));
    if (spans.length === 0) return;

    const { beginIndex, beginOffset, endIndex, endOffset } = highlight.selection;

    // Clamp indices to valid range
    const startIdx = Math.max(0, Math.min(beginIndex, spans.length - 1));
    const endIdx = Math.max(startIdx, Math.min(endIndex, spans.length - 1));

    // Collect bounding rects for selected text spans
    const rects: DOMRect[] = [];

    for (let i = startIdx; i <= endIdx; i++) {
      const span = spans[i];
      const text = span.textContent || '';

      if (!text) continue;

      // Calculate start and end offsets for this span
      const spanStart = i === startIdx ? Math.min(beginOffset, text.length) : 0;
      const spanEnd = i === endIdx ? Math.min(endOffset, text.length) : text.length;

      if (spanStart >= spanEnd) continue;

      // Create a range for the selected portion of this span
      const range = document.createRange();
      const textNode = span.firstChild;

      if (textNode && textNode.nodeType === Node.TEXT_NODE) {
        try {
          range.setStart(textNode, spanStart);
          range.setEnd(textNode, spanEnd);
          const rangeRects = range.getClientRects();
          for (let j = 0; j < rangeRects.length; j++) {
            rects.push(rangeRects[j]);
          }
        } catch {
          // Fallback: use the whole span
          rects.push(span.getBoundingClientRect());
        }
      } else {
        // No text node, use span bounds
        rects.push(span.getBoundingClientRect());
      }
    }

    // Convert client rects to positions relative to the text layer
    const layerRect = textLayerDiv.getBoundingClientRect();

    // Merge adjacent/overlapping rects on the same line
    const mergedRects = mergeHighlightRects(rects, layerRect);

    // Get category colors (default to highlight if not set)
    const category: HighlightCategory = highlight.category || 'highlight';
    const categoryInfo = HIGHLIGHT_CATEGORIES[category];
    const color = categoryInfo.color;
    const hoverColor = categoryInfo.hoverColor;

    // Create highlight elements
    for (const rect of mergedRects) {
      const highlightEl = document.createElement('div');
      highlightEl.className = `pdf-highlight${highlight.note ? ' has-note' : ''}`;
      highlightEl.dataset.highlightId = highlight.id;
      highlightEl.dataset.category = category;
      highlightEl.style.cssText = `
        position: absolute;
        left: ${rect.left}px;
        top: ${rect.top}px;
        width: ${rect.width}px;
        height: ${rect.height}px;
        background-color: ${color};
        pointer-events: auto;
        border-radius: 2px;
        cursor: pointer;
        transition: background-color 0.15s ease;
      `;
      highlightEl.addEventListener('mouseenter', () => {
        highlightEl.style.backgroundColor = hoverColor;
      });
      highlightEl.addEventListener('mouseleave', () => {
        highlightEl.style.backgroundColor = color;
      });
      highlightEl.addEventListener('click', (e) => {
        e.stopPropagation();
        const containerRect = containerRef.current?.getBoundingClientRect();
        if (!containerRect) return;

        setEditingHighlight({
          highlight,
          position: {
            x: e.clientX - containerRect.left,
            y: e.clientY - containerRect.top + 10,
          },
        });
      });
      highlightLayerDiv.appendChild(highlightEl);
    }
  };

  /**
   * Merge adjacent rects on the same line into larger rectangles.
   */
  const mergeHighlightRects = (rects: DOMRect[], layerRect: DOMRect) => {
    if (rects.length === 0) return [];

    const relativeRects = rects.map((r) => ({
      left: r.left - layerRect.left,
      top: r.top - layerRect.top,
      width: r.width,
      height: r.height,
      right: r.right - layerRect.left,
      bottom: r.bottom - layerRect.top,
    }));

    // Sort by top, then left
    relativeRects.sort((a, b) => a.top - b.top || a.left - b.left);

    const merged: typeof relativeRects = [];
    let current = relativeRects[0];

    for (let i = 1; i < relativeRects.length; i++) {
      const next = relativeRects[i];

      // Check if on same line (within 5px tolerance) and adjacent
      const sameLine = Math.abs(next.top - current.top) < 5;
      const adjacent = next.left <= current.right + 5;

      if (sameLine && adjacent) {
        // Merge
        current = {
          left: Math.min(current.left, next.left),
          top: Math.min(current.top, next.top),
          right: Math.max(current.right, next.right),
          bottom: Math.max(current.bottom, next.bottom),
          width: 0,
          height: 0,
        };
        current.width = current.right - current.left;
        current.height = current.bottom - current.top;
      } else {
        merged.push(current);
        current = next;
      }
    }
    merged.push(current);

    return merged;
  };

  /**
   * Search through PDF text content
   */
  const performSearch = useCallback(async (query: string) => {
    if (!query.trim() || !pdfDocRef.current) {
      setSearchResults([]);
      return;
    }

    const results: SearchMatch[] = [];
    const lowerQuery = query.toLowerCase();

    // Search through all pages
    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      // Try to get text from cache, otherwise load it
      let pageText = textContentCache.current.get(pageNum);

      if (!pageText && pdfDocRef.current) {
        try {
          const page = await pdfDocRef.current.getPage(pageNum);
          const textContent = await page.getTextContent();
          pageText = textContent.items
            .map((item) => ('str' in item ? item.str : ''))
            .join(' ');
          setTextCacheEntry(pageNum, pageText);
        } catch {
          continue;
        }
      }

      if (!pageText) continue;

      // Find all matches in this page
      const lowerPageText = pageText.toLowerCase();
      let searchIndex = 0;
      let matchIndex = 0;

      while ((searchIndex = lowerPageText.indexOf(lowerQuery, searchIndex)) !== -1) {
        results.push({
          pageNum,
          spanIndex: matchIndex,
          startOffset: searchIndex,
          endOffset: searchIndex + query.length,
          text: pageText.slice(searchIndex, searchIndex + query.length),
        });
        searchIndex += 1;
        matchIndex++;
      }

      if (pageNum % 5 === 0) {
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      }
    }

    setSearchResults(results);
  }, [totalPages, setSearchResults]);

  // Perform search when query changes
  useEffect(() => {
    const debounceTimer = setTimeout(() => {
      performSearch(searchQuery);
    }, 300);

    return () => clearTimeout(debounceTimer);
  }, [searchQuery, performSearch]);

  // Scroll to current search match
  useEffect(() => {
    if (searchResults.length === 0 || currentMatchIndex >= searchResults.length) return;

    const match = searchResults[currentMatchIndex];
    setScrollToPage(match.pageNum);
  }, [currentMatchIndex, searchResults, setScrollToPage]);

  // Render search highlights on rendered pages
  useEffect(() => {
    if (isPinchSettling) return;
    if (!searchQuery) {
      // Clear all search highlights
      searchLayerRefs.current.forEach((layer) => {
        layer.innerHTML = '';
      });
      return;
    }

    renderedPages.forEach((pageNum) => {
      const textLayerDiv = textLayerRefs.current.get(pageNum);
      const searchLayerDiv = searchLayerRefs.current.get(pageNum);
      if (!textLayerDiv || !searchLayerDiv) return;

      // Clear existing search highlights
      searchLayerDiv.innerHTML = '';

      // Find matches for this page
      const pageMatches = searchResults.filter((m: SearchMatch) => m.pageNum === pageNum);
      if (pageMatches.length === 0) return;

      const spans = Array.from(textLayerDiv.querySelectorAll('span'));
      const layerRect = textLayerDiv.getBoundingClientRect();

      // For each match, find the corresponding text and highlight it
      pageMatches.forEach((match: SearchMatch) => {
        const globalIdx = searchResults.findIndex(
          (m: SearchMatch) => m.pageNum === match.pageNum && m.startOffset === match.startOffset
        );
        const isCurrent = globalIdx === currentMatchIndex;

        // Search through spans to find text that matches
        let charCount = 0;
        for (const span of spans) {
          const text = span.textContent || '';
          const spanStart = charCount;
          const spanEnd = charCount + text.length;

          // Check if this span contains part of the match
          if (spanEnd > match.startOffset && spanStart < match.endOffset) {
            const rect = span.getBoundingClientRect();
            const highlightEl = document.createElement('div');
            highlightEl.className = `pdf-search-highlight ${isCurrent ? 'current' : ''}`;
            highlightEl.style.cssText = `
              position: absolute;
              left: ${rect.left - layerRect.left}px;
              top: ${rect.top - layerRect.top}px;
              width: ${rect.width}px;
              height: ${rect.height}px;
            `;
            searchLayerDiv.appendChild(highlightEl);
          }

          charCount += text.length + 1; // +1 for space between spans
        }
      });
    });
  }, [currentMatchIndex, isPinchSettling, renderedPages, searchQuery, searchResults]);

  // Enter presentation mode
  const enterPresentation = useCallback(() => {
    setIsPresentation(true);
    setPresentationPage(currentPage);
    document.documentElement.requestFullscreen?.();
  }, [currentPage]);

  // Exit presentation mode
  const exitPresentation = useCallback(() => {
    setIsPresentation(false);
    if (document.fullscreenElement) {
      document.exitFullscreen?.();
    }
  }, []);

  // Listen for fullscreen change
  useEffect(() => {
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement && isPresentation) {
        setIsPresentation(false);
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, [isPresentation]);

  // Handle page navigation (now scrolls to page)
  const goToPage = useCallback(
    (page: number) => {
      const newPage = Math.max(1, Math.min(totalPages, page));
      if (pdfColorMode === 'eink') {
        // E-ink mode: directly set current page (no scrolling)
        setCurrentPage(newPage);
      } else {
        setScrollToPage(newPage);
      }
    },
    [totalPages, setScrollToPage, setCurrentPage, pdfColorMode]
  );

  // Pinch zoom for mobile
  const pinchHandlers = usePinchZoom({
    onPreviewChange: handlePinchPreviewChange,
    onZoomCommit: handlePinchZoomCommit,
    minZoom: 0.5,
    maxZoom: 3.0,
    enabled: isTouchDevice,
  });

  // Double-tap zoom for mobile (toggle between fit-width and 150%)
  const doubleTapHandlers = useDoubleTapZoom({
    onDoubleTap: (zoomedIn) => {
      if (zoomedIn) {
        // Zoom to 150%
        applyCustomZoom(1.5);
      } else {
        // Reset to fit-width
        applyZoomMode('fit-width');
      }
    },
    enabled: isTouchDevice,
  });

  // Combined touch handlers for mobile
  const handleMobileTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length === 2) {
        // Two fingers: pinch zoom
        pinchHandlers.handlePinchStart(e, zoom);
      }
    },
    [pinchHandlers, zoom]
  );

  const handleMobileTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length === 2) {
        pinchHandlers.handlePinchMove(e);
      }
    },
    [pinchHandlers]
  );

  const handleMobileTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length < 2) {
        pinchHandlers.handlePinchEnd(e);
      }
      if (e.touches.length === 0) {
        doubleTapHandlers.handleDoubleTapEnd(e);
      }
    },
    [pinchHandlers, doubleTapHandlers]
  );

  // Prevent browser/page pinch-zoom over the PDF viewport on mobile.
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!isTouchDevice || !el) return;

    const preventPinchPageZoom = (event: TouchEvent) => {
      if (event.touches.length === 2) {
        event.preventDefault();
      }
    };

    const preventGestureZoom = (event: Event) => {
      event.preventDefault();
    };

    el.addEventListener('touchmove', preventPinchPageZoom, { passive: false });
    el.addEventListener('gesturestart', preventGestureZoom);
    el.addEventListener('gesturechange', preventGestureZoom);

    return () => {
      el.removeEventListener('touchmove', preventPinchPageZoom);
      el.removeEventListener('gesturestart', preventGestureZoom);
      el.removeEventListener('gesturechange', preventGestureZoom);
    };
  }, [isTouchDevice]);

  // Also suppress browser pinch-zoom over the full reader surface (including toolbar).
  useEffect(() => {
    const el = containerRef.current;
    if (!isTouchDevice || !el) return;

    const preventPinchPageZoom = (event: TouchEvent) => {
      if (event.touches.length === 2) {
        event.preventDefault();
      }
    };

    const preventGestureZoom = (event: Event) => {
      event.preventDefault();
    };

    el.addEventListener('touchmove', preventPinchPageZoom, { passive: false });
    el.addEventListener('gesturestart', preventGestureZoom);
    el.addEventListener('gesturechange', preventGestureZoom);

    return () => {
      el.removeEventListener('touchmove', preventPinchPageZoom);
      el.removeEventListener('gesturestart', preventGestureZoom);
      el.removeEventListener('gesturechange', preventGestureZoom);
    };
  }, [isTouchDevice]);

  /**
   * Find the page element containing the given DOM node.
   */
  const getPageElementForNode = (node: Node): HTMLElement | null => {
    if (node instanceof HTMLElement) {
      return node.closest('[data-page]') as HTMLElement | null;
    }

    let current: Node | null = node.parentNode;
    while (current) {
      if (current instanceof HTMLElement) {
        const pageElement = current.closest('[data-page]') as HTMLElement | null;
        if (pageElement) return pageElement;
      }
      current = current.parentNode;
    }

    return null;
  };

  /**
   * Get text selection in PDF++ format
   */
  const getTextSelectionRange = (pageEl: HTMLElement, range: Range): TextSelection | null => {
    const textLayerDiv = pageEl.querySelector('.textLayer');
    if (!textLayerDiv) return null;

    // Find start text layer node
    const startNode = getTextLayerNode(pageEl, range.startContainer);
    const endNode = getTextLayerNode(pageEl, range.endContainer);

    if (!startNode || !endNode) return null;

    const beginIndex = parseInt(startNode.getAttribute('data-idx') || '0', 10);
    const endIndex = parseInt(endNode.getAttribute('data-idx') || '0', 10);

    const beginOffset = getOffsetInTextLayerNode(startNode, range.startContainer, range.startOffset);
    const endOffset = getOffsetInTextLayerNode(endNode, range.endContainer, range.endOffset);

    if (beginOffset === null || endOffset === null) return null;

    return { beginIndex, beginOffset, endIndex, endOffset };
  };

  /**
   * Find the text layer node containing the given DOM node.
   */
  const getTextLayerNode = (pageEl: HTMLElement, node: Node): HTMLElement | null => {
    if (!pageEl.contains(node)) return null;

    if (node instanceof HTMLElement && node.classList.contains('textLayerNode')) {
      return node;
    }

    let n: Node | null = node;
    while ((n = n.parentNode)) {
      if (n === pageEl) return null;
      if (n instanceof HTMLElement && n.classList.contains('textLayerNode')) {
        return n;
      }
    }

    return null;
  };

  /**
   * Get character offset within a text layer node.
   */
  const getOffsetInTextLayerNode = (
    textLayerNode: HTMLElement,
    node: Node,
    offsetInNode: number
  ): number | null => {
    if (!textLayerNode.contains(node)) return null;

    const iterator = document.createNodeIterator(textLayerNode, NodeFilter.SHOW_TEXT);
    let textNode;
    let offset = offsetInNode;

    while ((textNode = iterator.nextNode()) && node !== textNode) {
      offset += textNode.textContent?.length || 0;
    }

    return offset;
  };

  // Handle text selection (shared logic for mouse and touch)
  const checkTextSelection = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) {
      setSelection(null);
      return;
    }

    const text = sel.toString().trim();
    if (!text) {
      setSelection(null);
      return;
    }

    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    const containerRect = containerRef.current?.getBoundingClientRect();

    if (!containerRect) return;

    // Get the page element
    const pageElement = getPageElementForNode(range.startContainer) ?? getPageElementForNode(range.commonAncestorContainer);
    const pageNum = pageElement ? parseInt(pageElement.getAttribute('data-page') || '1', 10) : currentPage;

    // Get selection in PDF++ format
    const textSelection = pageElement ? getTextSelectionRange(pageElement, range) : null;
    if (!textSelection && !isTouchDevice) {
      console.warn('Could not get text selection range');
      return;
    }
    if (!pageElement && !isTouchDevice) {
      console.warn('Could not determine selected PDF page');
      return;
    }
    if (!textSelection) {
      // On mobile, still show the bottom sheet even if we can't yet derive the
      // exact PDF++ selection payload. Saving will surface a concrete error.
    }
    if (!pageElement && isTouchDevice) {
      // Fall back to the reader's current page when the browser selection DOM
      // doesn't map cleanly back to a rendered PDF page element.
    }

    if (!textSelection && isTouchDevice) {
      setSelection({
        text,
        page: currentPage,
        pageLabel: pageLabels?.[currentPage - 1],
        selection: null,
        position: {
          x: rect.left + rect.width / 2 - containerRect.left,
          y: rect.bottom - containerRect.top + 10,
        },
      });
      return;
    }

    if (!textSelection) {
      if (!isTouchDevice) {
        console.warn('Could not get text selection range');
        return;
      }
    }

    setSelection({
      text,
      page: pageNum,
      pageLabel: pageLabels?.[pageNum - 1],
      selection: textSelection,
      position: {
        x: rect.left + rect.width / 2 - containerRect.left,
        y: rect.bottom - containerRect.top + 10,
      },
    });
  }, [currentPage, isTouchDevice, pageLabels]);

  // Handle mouse up for desktop
  const handleMouseUp = useCallback(() => {
    checkTextSelection();
  }, [checkTextSelection]);

  // On mobile, open the bottom sheet only after selection has settled.
  useEffect(() => {
    if (!isTouchDevice) return;

    const getSelectionSignature = (): string | null => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.toString().trim() || sel.rangeCount === 0) {
        return null;
      }

      const range = sel.getRangeAt(0);
      const pageElement = getPageElementForNode(range.startContainer) ?? getPageElementForNode(range.commonAncestorContainer);
      const page = pageElement?.getAttribute('data-page') || 'unknown';
      const rect = range.getBoundingClientRect();
      const top = Math.round(rect.top);
      const left = Math.round(rect.left);
      const width = Math.round(rect.width);
      const height = Math.round(rect.height);

      return `${page}:${sel.toString().trim()}:${top}:${left}:${width}:${height}`;
    };

    const queueSelectionCheck = () => {
      if (mobileSelectionCheckTimeoutRef.current !== null) {
        window.clearTimeout(mobileSelectionCheckTimeoutRef.current);
      }
      mobileSelectionCheckTimeoutRef.current = window.setTimeout(() => {
        mobileSelectionCheckTimeoutRef.current = null;
        if (mobileSelectionDismissedRef.current) return;
        const sel = window.getSelection();
        if (sel && !sel.isCollapsed && sel.toString().trim()) {
          checkTextSelection();
        } else {
          setSelection(null);
        }
      }, MOBILE_SELECTION_SETTLE_MS);
    };

    const handleSelectionChange = () => {
      const signature = getSelectionSignature();
      if (!signature) {
        lastMobileSelectionSignatureRef.current = null;
        mobileSelectionDismissedRef.current = false;
        setSelection(null);
        return;
      }

      if (signature !== lastMobileSelectionSignatureRef.current) {
        lastMobileSelectionSignatureRef.current = signature;
        mobileSelectionDismissedRef.current = false;
      }

      queueSelectionCheck();
    };

    document.addEventListener('selectionchange', handleSelectionChange);
    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange);
      if (mobileSelectionCheckTimeoutRef.current !== null) {
        window.clearTimeout(mobileSelectionCheckTimeoutRef.current);
        mobileSelectionCheckTimeoutRef.current = null;
      }
    };
  }, [isTouchDevice, checkTextSelection]);

  // Prevent native context menu when there's a text selection
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    if (isTouchDevice) return;
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed) {
      e.preventDefault();
    }
  }, [isTouchDevice]);

  const closeSelectionPopup = useCallback((options?: { clearDomSelection?: boolean; dismissOnly?: boolean }) => {
    if (options?.dismissOnly) {
      mobileSelectionDismissedRef.current = true;
      setSelection(null);
      return;
    }

    if (options?.clearDomSelection !== false) {
      window.getSelection()?.removeAllRanges();
    }
    mobileSelectionDismissedRef.current = false;
    lastMobileSelectionSignatureRef.current = null;
    setSelection(null);
  }, []);

  // Quick highlight with category (for keyboard shortcuts)
  const quickHighlight = useCallback(async (category: HighlightCategory = 'highlight') => {
    if (!selection) return;
    if (!selection.selection) {
      showToast('Could not resolve the selected PDF text', 'error');
      return;
    }

    try {
      await createHighlight.mutateAsync({
        type: 'pdf',
        page: selection.page,
        pageLabel: selection.pageLabel,
        selection: selection.selection,
        text: selection.text,
        category,
      });
      closeSelectionPopup({ clearDomSelection: true });
      showToast('Highlight saved', 'success');
    } catch (error) {
      console.error('Failed to create highlight:', error);
      showToast('Failed to create highlight', 'error');
    }
  }, [selection, createHighlight, showToast, closeSelectionPopup]);

  // Navigate to a highlight and flash it
  const navigateToHighlight = useCallback((page?: number, _cfi?: string, highlightId?: string) => {
    if (page) {
      goToPage(page);
      // Flash the highlight after scrolling
      if (highlightId) {
        setTimeout(() => {
          const highlightEl = document.querySelector(`[data-highlight-id="${highlightId}"]`);
          if (highlightEl) {
            highlightEl.classList.add('highlight-flash');
            setTimeout(() => {
              highlightEl.classList.remove('highlight-flash');
            }, 1200);
          }
        }, 300); // Wait for scroll to complete
      }
    }
  }, [goToPage]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle shortcuts if typing in an input or contenteditable (CodeMirror)
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      if (e.target instanceof HTMLElement && (e.target.isContentEditable || e.target.closest('.cm-editor'))) {
        return;
      }

      // Search shortcut: Ctrl/Cmd + F
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        toggleSearch();
        return;
      }

      // Presentation mode navigation
      if (isPresentation) {
        if (e.key === 'Escape') {
          exitPresentation();
        } else if (e.key === 'ArrowRight' || e.key === ' ') {
          setPresentationPage((p) => Math.min(totalPages, p + 1));
        } else if (e.key === 'ArrowLeft') {
          setPresentationPage((p) => Math.max(1, p - 1));
        }
        return;
      }

      // Keyboard shortcuts help: ?
      if (e.key === '?') {
        e.preventDefault();
        toggleShortcuts();
        return;
      }

      // Close shortcuts panel on Escape (if open)
      if (e.key === 'Escape' && shortcutsOpen) {
        setShortcutsOpen(false);
        return;
      }

      // Close bookmarks panel on Escape (if open)
      if (e.key === 'Escape' && bookmarksOpen) {
        setBookmarksOpen(false);
        return;
      }

      // Close highlights panel on Escape (if open)
      if (e.key === 'Escape' && highlightsOpen) {
        setHighlightsOpen(false);
        return;
      }

      // Bookmarks: B
      if (e.key === 'b' || e.key === 'B') {
        e.preventDefault();
        toggleBookmarks();
        return;
      }

      // Table of contents: T
      if (e.key === 't' || e.key === 'T') {
        e.preventDefault();
        toggleToc();
        return;
      }

      // Go to page (focus input): G
      if (e.key === 'g' || e.key === 'G') {
        e.preventDefault();
        const pageInput = document.getElementById('page-input');
        if (pageInput) {
          (pageInput as HTMLInputElement).focus();
          (pageInput as HTMLInputElement).select();
        }
        return;
      }

      // Toggle dark mode: D
      if (e.key === 'd' || e.key === 'D') {
        e.preventDefault();
        togglePdfColorMode();
        return;
      }

      // Reset zoom: 0
      if (e.key === '0') {
        e.preventDefault();
        applyZoomMode('fit-width');
        return;
      }

      // Fullscreen/presentation: F
      if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        enterPresentation();
        return;
      }

      // Statistics: S
      if (e.key === 's' || e.key === 'S') {
        e.preventDefault();
        toggleStats();
        return;
      }

      // Close stats panel on Escape (if open)
      if (e.key === 'Escape' && statsOpen) {
        setStatsOpen(false);
        return;
      }

      // Goals: R (for "Reading goals")
      if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        toggleGoals();
        return;
      }

      // Close goals panel on Escape (if open)
      if (e.key === 'Escape' && goalsOpen) {
        setGoalsOpen(false);
        return;
      }

      // Highlights panel: A
      if (e.key === 'a' || e.key === 'A') {
        e.preventDefault();
        toggleHighlights();
        return;
      }

      // Quick highlight shortcuts (when text is selected)
      if (selection) {
        // H - Quick highlight with default category
        if (e.key === 'h' || e.key === 'H') {
          e.preventDefault();
          quickHighlight('highlight');
          return;
        }

        // 1-5 - Quick highlight with specific category
        const categoryKeys: Record<string, HighlightCategory> = {
          '1': 'highlight',
          '2': 'important',
          '3': 'question',
          '4': 'todo',
          '5': 'definition',
        };
        if (categoryKeys[e.key]) {
          e.preventDefault();
          quickHighlight(categoryKeys[e.key]);
          return;
        }

        // N - Open note input for selected text (handled by existing popup)
        if (e.key === 'n' || e.key === 'N') {
          // Selection popup is already open, just let it handle notes
          // The popup has its own note button
          return;
        }
      }

      // Normal navigation
      if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        goToPage(currentPage + 1);
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        goToPage(currentPage - 1);
      } else if (e.key === 'Home') {
        goToPage(1);
      } else if (e.key === 'End') {
        goToPage(totalPages);
      } else if (e.key === '+' || e.key === '=') {
        applyCustomZoom(zoom + 0.25);
      } else if (e.key === '-') {
        applyCustomZoom(zoom - 0.25);
      } else if (e.key === 'Escape' && isSearchOpen) {
        clearSearch();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentPage, totalPages, zoom, goToPage, applyCustomZoom, toggleSearch, isSearchOpen, clearSearch, isPresentation, exitPresentation, shortcutsOpen, bookmarksOpen, highlightsOpen, statsOpen, goalsOpen, toggleShortcuts, setShortcutsOpen, toggleBookmarks, setBookmarksOpen, toggleHighlights, setHighlightsOpen, toggleStats, setStatsOpen, toggleGoals, setGoalsOpen, toggleToc, togglePdfColorMode, applyZoomMode, enterPresentation, selection, quickHighlight]);

  // Render a single page container - use zoom to match canvas size
  const renderPageContainer = (pageNum: number) => {
    const dims = getPageDimensions(pageNum);
    // Use zoom for container to match canvas rendering
    const containerZoom = zoom;
    const containerWidth = dims ? `${dims.width * containerZoom}px` : 'auto';
    const containerHeight = dims ? `${dims.height * containerZoom}px` : 'auto';

    return (
      <div
        key={pageNum}
        data-page={pageNum}
        ref={(el) => {
          if (el) {
            pageContainerRefs.current.set(pageNum, el);
          } else {
            pageContainerRefs.current.delete(pageNum);
          }
        }}
        className="pdf-page-container relative bg-white shadow-lg"
        style={{
          width: containerWidth,
          height: containerHeight,
        }}
      >
        <canvas
          ref={(el) => {
            if (el) {
              pageCanvasRefs.current.set(pageNum, el);
              // Trigger render for this page when canvas mounts
              if (!renderedPagesRef.current.has(pageNum) && !renderingRef.current.has(pageNum)) {
                renderingRef.current.add(pageNum);
                renderPage(pageNum).finally(() => {
                  renderingRef.current.delete(pageNum);
                });
              }
            } else {
              pageCanvasRefs.current.delete(pageNum);
            }
          }}
          className="block"
          style={{
            width: containerWidth,
            height: containerHeight,
          }}
        />

        {/* Text layer for selection */}
        <div
          ref={(el) => {
            if (el) {
              textLayerRefs.current.set(pageNum, el);
            } else {
              textLayerRefs.current.delete(pageNum);
            }
          }}
          className="textLayer absolute top-0 left-0"
          style={{
            zIndex: 1,
            width: containerWidth,
            height: containerHeight,
          }}
        />

        {/* Search highlight layer */}
        <div
          ref={(el) => {
            if (el) {
              searchLayerRefs.current.set(pageNum, el);
            } else {
              searchLayerRefs.current.delete(pageNum);
            }
          }}
          className="absolute top-0 left-0"
          style={{ width: '100%', height: '100%', zIndex: 2, pointerEvents: 'none' }}
        />

        {/* Highlight layer - above text layer for clickable highlights */}
        <div
          ref={(el) => {
            if (el) {
              highlightLayerRefs.current.set(pageNum, el);
            } else {
              highlightLayerRefs.current.delete(pageNum);
            }
          }}
          className="absolute top-0 left-0"
          style={{ width: '100%', height: '100%', zIndex: 3, pointerEvents: 'none' }}
        />

        {/* Page number indicator */}
        <div className="absolute bottom-2 right-2 px-2 py-1 bg-black/50 text-white text-xs rounded">
          {pageLabels?.[pageNum - 1] ?? pageNum}
        </div>
      </div>
    );
  };

  if (isLoading) {
    const progressPercent = loadProgress?.percent;
    const progressLabel = progressPercent !== null
      ? `${progressPercent}% loaded`
      : loadProgress
        ? `${formatLoadedSize(loadProgress.loaded)} loaded`
        : 'Opening document';
    const progressDetail = loadProgress
      ? loadProgress.total
        ? `${formatLoadedSize(loadProgress.loaded)} of ${formatLoadedSize(loadProgress.total)}`
        : `${formatLoadedSize(loadProgress.loaded)} downloaded so far`
      : 'Parsing PDF structure and preparing the first page.';

    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md rounded-2xl border border-border-default bg-bg-surface p-6 shadow-lg">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 border-2 border-accent-primary border-t-transparent rounded-full animate-spin shrink-0" />
            <div>
              <h2 className="text-lg font-semibold text-text-primary">Opening PDF</h2>
              <p className="text-sm text-text-secondary">{progressLabel}</p>
            </div>
          </div>

          <div className="mt-5">
            <div className="h-2 overflow-hidden rounded-full bg-bg-deep">
              <div
                className="h-full rounded-full bg-accent-primary transition-[width] duration-200"
                style={{ width: `${progressPercent ?? 20}%` }}
              />
            </div>
            <p className="mt-3 text-sm text-text-secondary">{progressDetail}</p>
            <p className="mt-1 text-xs text-text-secondary">
              Large non-linearized PDFs may need to download and parse much more data before the first page is ready.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Error state UI
  if (loadError) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="max-w-md text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-500/10 flex items-center justify-center">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-red-500">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-text-primary mb-2">
            Failed to load document
          </h2>
          <p className="text-text-secondary mb-4">
            {loadError}
          </p>
          <div className="flex flex-col gap-2">
            <button
              onClick={() => {
                setLoadError(null);
                loadGenerationRef.current += 1;
                loadPDF(loadGenerationRef.current);
              }}
              className="px-4 py-2 bg-accent-primary text-white rounded-lg hover:bg-accent-primary/90 transition-colors"
            >
              Try Again
            </button>
            <button
              onClick={() => window.history.back()}
              className="px-4 py-2 text-text-secondary hover:text-text-primary transition-colors"
            >
              Go Back
            </button>
          </div>
          <p className="text-xs text-text-secondary mt-4">
            If this problem persists, the PDF file may be corrupted or inaccessible.
          </p>
        </div>
      </div>
    );
  }

  // Presentation mode overlay
  if (isPresentation) {
    const dims = getPageDimensions(presentationPage);
    const presZoom = dims ? Math.min(
      (window.innerWidth - 100) / dims.width,
      (window.innerHeight - 150) / dims.height
    ) : 1;

    return (
      <div className="pdf-presentation-mode">
        <div
          className="pdf-page-container relative bg-white shadow-lg"
          style={{
            width: dims ? `${dims.width * presZoom}px` : 'auto',
            height: dims ? `${dims.height * presZoom}px` : 'auto',
          }}
        >
          <canvas
            ref={(el) => {
              if (el) {
                // Render the presentation page
                const existingCanvas = pageCanvasRefs.current.get(presentationPage);
                if (existingCanvas) {
                  const ctx = el.getContext('2d');
                  el.width = existingCanvas.width;
                  el.height = existingCanvas.height;
                  el.style.width = dims ? `${dims.width * presZoom}px` : 'auto';
                  el.style.height = dims ? `${dims.height * presZoom}px` : 'auto';
                  ctx?.drawImage(existingCanvas, 0, 0);
                }
              }
            }}
            className="block"
          />
        </div>

        <div className="pdf-presentation-controls">
          <button
            onClick={() => setPresentationPage((p) => Math.max(1, p - 1))}
            disabled={presentationPage <= 1}
            className="px-4 py-2 text-white hover:bg-white/20 rounded disabled:opacity-50"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          <span className="px-4 py-2 text-white">
            {pageLabels?.[presentationPage - 1] ?? presentationPage} / {totalPages}
          </span>
          <button
            onClick={() => setPresentationPage((p) => Math.min(totalPages, p + 1))}
            disabled={presentationPage >= totalPages}
            className="px-4 py-2 text-white hover:bg-white/20 rounded disabled:opacity-50"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 18l6-6-6-6" />
            </svg>
          </button>
          <div className="w-px h-6 bg-white/30 mx-2" />
          <button
            onClick={exitPresentation}
            className="px-4 py-2 text-white hover:bg-white/20 rounded"
          >
            Exit
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex-1 flex flex-col overflow-hidden min-w-0 ${isTouchDevice ? 'touch-pan-only' : ''}`} ref={containerRef}>
      <ReaderControls
        noteId={note.id}
        currentPage={currentPage}
        totalPages={totalPages}
        zoom={zoom}
        pageLabels={pageLabels}
        onPageChange={goToPage}
        onZoomChange={applyCustomZoom}
        onZoomModeChange={applyZoomMode}
        onViewModeChange={setPdfViewMode}
        onEnterPresentation={enterPresentation}
        hasToc={hasToc}
        saveStatus={saveStatus}
      />

      <div className="flex-1 flex overflow-hidden min-w-0 relative">
        {/* Bookmarks Panel */}
        {bookmarksOpen && (
          <BookmarksPanel
            noteId={note.id}
            currentPage={currentPage}
            pageLabels={pageLabels}
            onNavigate={(page) => page && goToPage(page)}
            onClose={() => setBookmarksOpen(false)}
          />
        )}

        {/* Highlights Panel */}
        {highlightsOpen && (
          <HighlightsPanel
            noteId={note.id}
            highlights={highlights || []}
            currentPage={currentPage}
            pageLabels={pageLabels}
            onNavigate={navigateToHighlight}
            onClose={() => setHighlightsOpen(false)}
          />
        )}

        {/* TOC Sidebar */}
        {tocOpen && (
          <PDFTableOfContents pdfDoc={pdfDocRef.current} pageLabels={pageLabels} onClose={() => setTocOpen(false)} />
        )}

        {/* PDF Pages Container */}
        <div
          ref={scrollContainerRef}
          className={`relative flex-1 bg-bg-deep ${pdfColorMode === 'dark' ? 'pdf-dark-mode' : ''} ${pdfColorMode === 'eink' ? 'pdf-eink-mode overflow-hidden' : 'overflow-auto'} ${isTouchDevice ? 'hide-scrollbar-mobile touch-manipulation' : ''}`}
          onMouseUp={handleMouseUp}
          onTouchStart={isTouchDevice ? handleMobileTouchStart : undefined}
          onTouchMove={isTouchDevice ? handleMobileTouchMove : undefined}
          onTouchEnd={isTouchDevice ? handleMobileTouchEnd : undefined}
          onContextMenu={handleContextMenu}
        >
          <div
            className={`pdf-pages-container flex flex-col items-center py-4 gap-4 ${pdfViewMode === 'spread' ? 'pdf-spread-layout' : ''} ${pdfColorMode === 'eink' ? 'eink-single-page' : ''} ${pinchPreview ? 'pdf-pages-container-pinching' : ''} ${isPinchSettling ? 'pdf-pages-container-zoom-settling' : ''}`}
            style={pinchPreview ? {
              transform: `scale(${pinchPreview.scale})`,
              transformOrigin: `${pinchPreview.originX}px ${pinchPreview.originY}px`,
            } : undefined}
          >
            {/* E-ink mode: single page, no scroll */}
            {pdfColorMode === 'eink' ? (
              <div className="eink-page-container flex flex-col items-center justify-center h-full w-full">
                {/* Navigation buttons */}
                <div className="eink-nav absolute inset-x-0 top-1/2 -translate-y-1/2 flex justify-between px-2 pointer-events-none z-10">
                  <button
                    onClick={() => goToPage(currentPage - 1)}
                    disabled={currentPage <= 1}
                    className="pointer-events-auto w-12 h-24 flex items-center justify-center bg-white/80 border border-gray-300 disabled:opacity-30"
                  >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M15 18l-6-6 6-6" />
                    </svg>
                  </button>
                  <button
                    onClick={() => goToPage(currentPage + 1)}
                    disabled={currentPage >= totalPages}
                    className="pointer-events-auto w-12 h-24 flex items-center justify-center bg-white/80 border border-gray-300 disabled:opacity-30"
                  >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M9 18l6-6-6-6" />
                    </svg>
                  </button>
                </div>
                {/* Current page */}
                {renderPageContainer(currentPage)}
              </div>
            ) : pdfViewMode === 'spread' ? (
              // Spread mode: pair pages side by side (no virtualization for simplicity)
              <>
                {/* First page alone */}
                {totalPages > 0 && (
                  <div className="pdf-spread-container first-page">
                    {renderPageContainer(1)}
                  </div>
                )}
                {/* Remaining pages in pairs */}
                {Array.from({ length: Math.ceil((totalPages - 1) / 2) }, (_, i) => {
                  const leftPage = i * 2 + 2;
                  const rightPage = leftPage + 1;
                  return (
                    <div key={leftPage} className="pdf-spread-container">
                      {renderPageContainer(leftPage)}
                      {rightPage <= totalPages && renderPageContainer(rightPage)}
                    </div>
                  );
                })}
              </>
            ) : (
              // Single page mode with virtualization
              <>
                {/* Top spacer for pages before virtualized range */}
                {virtualizedRange.start > 1 && (
                  <div
                    key="top-spacer"
                    style={{
                      height: `${getHeightForPageRange(1, virtualizedRange.start - 1)}px`,
                      width: '100%',
                    }}
                  />
                )}

                {/* Render only pages within virtualized range */}
                {Array.from(
                  { length: virtualizedRange.end - virtualizedRange.start + 1 },
                  (_, i) => virtualizedRange.start + i
                ).map((pageNum) => renderPageContainer(pageNum))}

                {/* Bottom spacer for pages after virtualized range */}
                {virtualizedRange.end < totalPages && (
                  <div
                    key="bottom-spacer"
                    style={{
                      height: `${getHeightForPageRange(virtualizedRange.end + 1, totalPages)}px`,
                      width: '100%',
                    }}
                  />
                )}
              </>
            )}
          </div>
        </div>

        {/* Reading Statistics Panel */}
        {statsOpen && (
          <Suspense fallback={<div className="w-80 bg-bg-surface border-l border-text-secondary/10" />}>
            <ReadingStatsPanel
              noteId={note.id}
              currentPage={currentPage}
              totalPages={totalPages}
              dateFinished={note.dateFinished}
              onClose={() => setStatsOpen(false)}
            />
          </Suspense>
        )}

        {/* Reading Goals Panel */}
        {goalsOpen && (
          <Suspense fallback={<div className="w-80 bg-bg-surface border-l border-text-secondary/10" />}>
            <ReadingGoalsPanel onClose={() => setGoalsOpen(false)} />
          </Suspense>
        )}
      </div>

      {selection && (
        <HighlightPopup
          selection={selection}
          noteId={note.id}
          onClose={() => closeSelectionPopup({ dismissOnly: isTouchDevice })}
          containerRef={scrollContainerRef}
        />
      )}

      {editingHighlight && (
        <HighlightEditPopup
          highlight={editingHighlight.highlight}
          noteId={note.id}
          position={editingHighlight.position}
          onClose={() => setEditingHighlight(null)}
          containerRef={scrollContainerRef}
        />
      )}

      {/* Keyboard Shortcuts Panel */}
      <KeyboardShortcutsPanel
        isOpen={shortcutsOpen}
        onClose={() => setShortcutsOpen(false)}
        readerType="pdf"
      />
    </div>
  );
}
