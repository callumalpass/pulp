import { useEffect, useRef, useCallback, useState, useMemo } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { TextLayer } from 'pdfjs-dist';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import type { LiteratureNote, PDFHighlight, TextSelection } from '@pulp/shared';
import { useReaderStore, type ZoomMode, type SearchMatch } from '../../stores/reader';
import { useReadingStatsStore } from '../../stores/readingStats';
import { useProgress } from '../../hooks/useProgress';
import { useHighlights } from '../../hooks/useNote';
import { useMobile } from '../../hooks/useMobile';
import { useSwipeGesture } from '../../hooks/useSwipeGesture';
import { ReaderControls } from './shared/ReaderControls';
import { HighlightPopup } from './shared/HighlightPopup';
import { HighlightEditPopup } from './shared/HighlightEditPopup';
import { PDFTableOfContents } from './shared/PDFTableOfContents';
import { MarkdownEditorPanel } from './shared/MarkdownEditorPanel';
import { KeyboardShortcutsPanel } from './shared/KeyboardShortcutsPanel';
import { BookmarksPanel } from './shared/BookmarksPanel';
import { ReadingStatsPanel } from './shared/ReadingStatsPanel';
import { ReadingGoalsPanel } from './shared/ReadingGoalsPanel';
import { api } from '../../lib/api';
import { PdfRenderQueue, type TextContentData } from '../../lib/pdf-render-queue';

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

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
  selection: TextSelection;
  position: { x: number; y: number };
}

interface PageDimensions {
  width: number;
  height: number;
}

const PAGE_BUFFER = 3; // Number of pages to pre-render above/below viewport
const VIRTUALIZATION_BUFFER = 8; // Number of pages above/below to keep in DOM
const ZOOM_DEBOUNCE_MS = 150; // Debounce delay for zoom changes
const PAGE_DIMENSION_CONCURRENCY = 6; // Parallelism for initial page measurements

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
    markdownPanelOpen,
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
    setZoom,
    setZoomMode,
    setTocOpen,
    setMarkdownPanelOpen,
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
    setStatsOpen,
    toggleStats,
    setGoalsOpen,
    toggleGoals,
    toggleToc,
    togglePdfColorMode,
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

  const { updateProgress, saveImmediately } = useProgress(note.id);
  const { data: highlights } = useHighlights(note.id);

  const [selection, setSelection] = useState<Selection | null>(null);
  const [editingHighlight, setEditingHighlight] = useState<{ highlight: PDFHighlight; position: { x: number; y: number } } | null>(null);
  const [renderedPages, setRenderedPages] = useState<Set<number>>(new Set());
  const [visiblePages, setVisiblePages] = useState<Set<number>>(new Set([1]));
  const [pageDimensions, setPageDimensions] = useState<Map<number, PageDimensions>>(new Map());
  const [hasToc, setHasToc] = useState(false);
  const [isPresentation, setIsPresentation] = useState(false);
  const [presentationPage, setPresentationPage] = useState(1);
  const [showClickZones, setShowClickZones] = useState(true);
  const [headerVisible, setHeaderVisible] = useState(true);

  // Mobile support
  const isMobile = useMobile();

  // Virtualization: track which pages should have DOM elements
  const [virtualizedRange, setVirtualizedRange] = useState<{ start: number; end: number }>({ start: 1, end: 10 });

  // Debounced zoom state for triggering re-renders
  const [debouncedZoom, setDebouncedZoom] = useState(zoom);

  // Scroll direction tracking for predictive preloading
  const lastScrollTopRef = useRef(0);
  const scrollDirectionRef = useRef<'up' | 'down' | 'none'>('none');
  const idleCallbackRef = useRef<number | null>(null);

  // Text content cache for search
  const textContentCache = useRef<Map<number, string>>(new Map());
  const searchLayerRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  // Debounce zoom changes
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedZoom(zoom);
    }, ZOOM_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [zoom]);

  // Memoized cumulative page heights for O(1) scroll offset lookups
  // pageHeights[i] = cumulative height from start to top of page i (1-indexed)
  // pageHeights[totalPages + 1] = total document height
  const pageHeights = useMemo(() => {
    const heights: number[] = [0]; // heights[0] unused (1-indexed)
    let accumulated = 16; // Initial padding

    for (let i = 1; i <= totalPages; i++) {
      heights.push(accumulated);
      const dims = pageDimensions.get(i);
      if (dims) {
        accumulated += dims.height * debouncedZoom + 16; // page height + gap
      }
    }
    heights.push(accumulated); // Total document height at index totalPages + 1

    return heights;
  }, [pageDimensions, debouncedZoom, totalPages]);

  // Binary search to find page at a given scroll position - O(log n)
  const findPageAtScrollPosition = useCallback((scrollTop: number): number => {
    if (totalPages === 0) return 1;

    let low = 1;
    let high = totalPages;

    while (low < high) {
      const mid = Math.floor((low + high + 1) / 2);
      if (pageHeights[mid] <= scrollTop) {
        low = mid;
      } else {
        high = mid - 1;
      }
    }

    return low;
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

  // Load PDF document
  useEffect(() => {
    reset();

    // Initialize render queue for worker-based rendering
    if (!renderQueueRef.current) {
      renderQueueRef.current = new PdfRenderQueue(15); // Cache up to 15 pages
    }

    loadPDF();

    return () => {
      // Cleanup on unmount
      saveImmediately();
      endSession(); // End reading session when leaving
      textLayerTasksRef.current.forEach(task => task.cancel());
      if (idleCallbackRef.current !== null) {
        cancelIdleCallback(idleCallbackRef.current);
      }
      renderQueueRef.current?.destroy();
      renderQueueRef.current = null;
      pdfDocRef.current?.destroy();
    };
  }, [note.id]);

  const loadPDF = async () => {
    try {
      setIsLoading(true);
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
      });
      const pdf = await loadingTask.promise;
      pdfDocRef.current = pdf;
      setTotalPages(pdf.numPages);

      // Get dimensions for all pages (concurrency-limited)
      const dimensions = new Map<number, PageDimensions>();
      let maxWidth = 0;
      let nextPage = 1;
      const workerCount = Math.min(PAGE_DIMENSION_CONCURRENCY, pdf.numPages);
      const workers = Array.from({ length: workerCount }, async () => {
        while (true) {
          const pageNum = nextPage++;
          if (pageNum > pdf.numPages) break;
          const page = await pdf.getPage(pageNum);
          const viewport = page.getViewport({ scale: 1 });
          dimensions.set(pageNum, { width: viewport.width, height: viewport.height });
          if (viewport.width > maxWidth) maxWidth = viewport.width;
        }
      });
      await Promise.all(workers);
      setPageDimensions(dimensions);

      // Check if PDF has table of contents
      const outline = await pdf.getOutline();
      setHasToc(outline !== null && outline.length > 0);

      // Load page labels (logical page numbers like "iv", "12", "A-3")
      const labels = await pdf.getPageLabels();
      setPageLabels(labels);

      // Calculate initial zoom based on container and widest page
      if (scrollContainerRef.current && zoomMode === 'fit-width') {
        const containerWidth = scrollContainerRef.current.clientWidth;
        const fitZoom = calculateFitWidthZoom(containerWidth, maxWidth);
        setZoom(fitZoom);
        // Re-set zoom mode since setZoom changes it to 'custom'
        setZoomMode('fit-width');
      }

      // Restore progress or jump to initial page (from search deep link)
      const targetPage = initialPage && initialPage >= 1 && initialPage <= pdf.numPages
        ? initialPage
        : note.progress > 0
          ? Math.max(1, Math.round((note.progress / 100) * pdf.numPages))
          : null;

      if (targetPage) {
        setCurrentPage(targetPage);
        // Scroll to target page after render
        setTimeout(() => setScrollToPage(targetPage), 100);
      }

      setIsLoading(false);

      // Start reading session after PDF is loaded
      const startPage = targetPage || 1;
      startSession(note.id, startPage, pdf.numPages);
    } catch (error) {
      console.error('Failed to load PDF:', error);
      setIsLoading(false);
    }
  };

  // Track page changes for reading stats
  useEffect(() => {
    if (!isLoading && totalPages > 0) {
      updateStatsCurrentPage(currentPage);
    }
  }, [currentPage, isLoading, totalPages, updateStatsCurrentPage]);

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

  // Auto-hide click zone hints after initial display (e-ink mode)
  useEffect(() => {
    if (pdfColorMode === 'eink' && !isLoading && showClickZones) {
      const timer = setTimeout(() => {
        setShowClickZones(false);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [pdfColorMode, isLoading, showClickZones]);

  // Get max page width for fit-width calculations
  const getMaxPageWidth = useCallback(() => {
    let maxWidth = 0;
    pageDimensions.forEach((dims) => {
      maxWidth = Math.max(maxWidth, dims.width);
    });
    return maxWidth;
  }, [pageDimensions]);

  // Handle zoom mode changes
  const handleZoomModeChange = useCallback((mode: ZoomMode) => {
    if (pageDimensions.size === 0 || !scrollContainerRef.current) return;

    setZoomMode(mode);

    const firstPage = pageDimensions.get(1);
    if (!firstPage) return;

    if (mode === 'fit-width') {
      const containerWidth = scrollContainerRef.current.clientWidth;
      const maxWidth = getMaxPageWidth();
      const newZoom = calculateFitWidthZoom(containerWidth, maxWidth);
      setZoom(newZoom);
      setZoomMode('fit-width'); // Re-set because setZoom changes it
    } else if (mode === 'fit-page') {
      const containerWidth = scrollContainerRef.current.clientWidth;
      const containerHeight = scrollContainerRef.current.clientHeight;
      const newZoom = calculateFitPageZoom(containerWidth, containerHeight, firstPage.width, firstPage.height);
      setZoom(newZoom);
      setZoomMode('fit-page'); // Re-set because setZoom changes it
    }
  }, [pageDimensions, getMaxPageWidth, calculateFitWidthZoom, calculateFitPageZoom, setZoom, setZoomMode]);

  // Recalculate zoom on window resize for fit modes
  useEffect(() => {
    if (pageDimensions.size === 0 || !scrollContainerRef.current) return;

    const firstPage = pageDimensions.get(1);
    if (!firstPage) return;

    const handleResize = () => {
      if (zoomMode === 'fit-width') {
        const containerWidth = scrollContainerRef.current!.clientWidth;
        const maxWidth = getMaxPageWidth();
        const newZoom = calculateFitWidthZoom(containerWidth, maxWidth);
        setZoom(newZoom);
        setZoomMode('fit-width');
      } else if (zoomMode === 'fit-page') {
        const containerWidth = scrollContainerRef.current!.clientWidth;
        const containerHeight = scrollContainerRef.current!.clientHeight;
        const newZoom = calculateFitPageZoom(containerWidth, containerHeight, firstPage.width, firstPage.height);
        setZoom(newZoom);
        setZoomMode('fit-page');
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [pageDimensions, zoomMode, getMaxPageWidth, calculateFitWidthZoom, calculateFitPageZoom, setZoom, setZoomMode]);

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
      handleZoomModeChange('fit-page');
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
      renderQueueRef.current.renderBuffer(pagesToPreload, debouncedZoom);
    }
  }, [pdfColorMode, currentPage, totalPages, debouncedZoom]);

  // Render text layers for visible pages that have canvas but no text layer
  // This handles pages that were pre-rendered as buffer pages
  useEffect(() => {
    if (!pdfDocRef.current || isLoading) return;

    visiblePages.forEach((pageNum) => {
      const textLayerDiv = textLayerRefs.current.get(pageNum);
      // Only render if page is rendered but text layer is empty
      if (textLayerDiv && renderedPages.has(pageNum) && textLayerDiv.childElementCount === 0) {
        renderTextLayer(pageNum, textLayerDiv, debouncedZoom);
      }
    });
  }, [visiblePages, renderedPages, debouncedZoom, isLoading]);

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
    if (pageDimensions.size === 0 || totalPages === 0) {
      return { start: 1, end: Math.min(10, totalPages) };
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
      start: Math.max(1, startPage - VIRTUALIZATION_BUFFER),
      end: Math.min(totalPages, endPage + VIRTUALIZATION_BUFFER),
    };
  }, [pageDimensions, totalPages, findPageAtScrollPosition]);

  // Update current page based on scroll position - O(log n) using binary search
  // Skip in e-ink mode since pages are controlled manually, not by scroll
  useEffect(() => {
    // E-ink mode: page is controlled manually, skip scroll-based detection
    if (pdfColorMode === 'eink') return;

    const scrollContainer = scrollContainerRef.current;
    if (!scrollContainer || pageDimensions.size === 0) return;

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
      const dims = pageDimensions.get(page);
      let newCurrentPage = page;

      // Adjust for the "50% rule" - if we've scrolled past half the page, go to next
      if (dims && page < totalPages) {
        const pageTop = pageHeights[page];
        const pageMiddle = pageTop + (dims.height * debouncedZoom) / 2;
        if (scrollTop > pageMiddle) {
          newCurrentPage = page + 1;
        }
      }

      if (newCurrentPage !== currentPage) {
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
  }, [pageDimensions, debouncedZoom, totalPages, currentPage, setCurrentPage, updateProgress, calculateVirtualizedRange, findPageAtScrollPosition, pageHeights, pdfColorMode]);

  // Handle programmatic scroll to page
  useEffect(() => {
    if (scrollToPage === null || !scrollContainerRef.current || pageDimensions.size === 0) return;

    const targetScroll = getScrollOffsetToPage(scrollToPage);

    scrollContainerRef.current.scrollTo({
      top: targetScroll,
      behavior: 'smooth',
    });

    setScrollToPage(null);
  }, [scrollToPage, pageDimensions, zoom, setScrollToPage, getScrollOffsetToPage]);

  // Version counter to trigger re-renders when debounced zoom changes
  const [renderVersion, setRenderVersion] = useState(0);

  // Track pages currently being rendered to avoid duplicates
  const renderingRef = useRef<Set<number>>(new Set());
  // Track rendered pages in a ref to avoid stale closures
  const renderedPagesRef = useRef<Set<number>>(new Set());
  // Track the zoom level each page was rendered at
  const pageZoomRef = useRef<Map<number, number>>(new Map());

  // Clear rendered pages and bump version when debounced zoom changes
  useEffect(() => {
    // Clear both state and refs immediately to ensure re-renders
    setRenderedPages(new Set());
    renderedPagesRef.current = new Set();
    renderingRef.current = new Set();
    pageZoomRef.current = new Map();
    // Clear text layer contents so they get re-rendered at the new zoom level
    textLayerRefs.current.forEach((textLayerDiv) => {
      textLayerDiv.innerHTML = '';
    });
    // Cancel any pending text layer tasks
    textLayerTasksRef.current.forEach((task) => task.cancel());
    textLayerTasksRef.current.clear();
    textLayerRenderingRef.current.clear();
    setRenderVersion((v) => v + 1);
  }, [debouncedZoom]);

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
    const forwardBuffer = direction === 'down' ? PAGE_BUFFER + 2 : PAGE_BUFFER;
    const backwardBuffer = direction === 'up' ? PAGE_BUFFER + 2 : PAGE_BUFFER;

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
      const needsRender = !renderedPagesRef.current.has(pageNum) || wasRenderedAtZoom !== debouncedZoom;

      if (needsRender && !renderingRef.current.has(pageNum)) {
        renderingRef.current.add(pageNum);
        renderPage(pageNum).finally(() => {
          renderingRef.current.delete(pageNum);
        });
      }
    });

    // Render buffer pages during idle time
    if (bufferPages.size > 0) {
      idleCallbackRef.current = requestIdleCallback(
        (deadline) => {
          const pagesToRender = Array.from(bufferPages).filter((pageNum) => {
            const wasRenderedAtZoom = pageZoomRef.current.get(pageNum);
            return !renderedPagesRef.current.has(pageNum) || wasRenderedAtZoom !== debouncedZoom;
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
        if (Math.abs(pageNum - visiblePage) <= PAGE_BUFFER + 1) {
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
  }, [visiblePages, totalPages, isLoading, renderVersion, debouncedZoom]);

  // Render highlights when pages are ready
  useEffect(() => {
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
  }, [highlights, renderedPages]);

  const renderPage = async (pageNum: number) => {
    if (!pdfDocRef.current) return;

    // Skip if already rendered at current zoom level
    const renderedAtZoom = pageZoomRef.current.get(pageNum);
    if (renderedPages.has(pageNum) && renderedAtZoom === debouncedZoom) return;

    // Check if page is still in virtualized range (might have scrolled away during async wait)
    if (pageNum < virtualizedRange.start || pageNum > virtualizedRange.end) return;

    // Cancel existing text layer task for this page
    textLayerTasksRef.current.get(pageNum)?.cancel();

    const canvas = pageCanvasRefs.current.get(pageNum);
    const textLayerDiv = textLayerRefs.current.get(pageNum);
    if (!canvas) return;

    const scale = debouncedZoom;
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
            textLayerDiv.innerHTML = '';
            textLayerDiv.style.width = `${displayViewport.width}px`;
            textLayerDiv.style.height = `${displayViewport.height}px`;

            page.getTextContent().then((textContent) => {
              const pageText = textContent.items
                .map((item) => ('str' in item ? item.str : ''))
                .join(' ');
              textContentCache.current.set(pageNum, pageText);

              const textLayer = new TextLayer({
                textContentSource: textContent,
                container: textLayerDiv,
                viewport: displayViewport,
              });

              textLayerTasksRef.current.set(pageNum, textLayer);
              textLayer.render().then(() => {
                const spans = textLayerDiv.querySelectorAll('span');
                spans.forEach((span, idx) => {
                  span.setAttribute('data-idx', String(idx));
                  span.classList.add('textLayerNode');
                });
              });
            });
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
    if (existingLayer && textLayerDiv.querySelectorAll('span').length > 0) return;

    textLayerRenderingRef.current.add(pageNum);

    try {
      const page = await pdfDocRef.current.getPage(pageNum);

      // When canvas dimensions are provided (worker rendering), compute the exact scale
      // that produces those dimensions to avoid floating-point mismatches.
      // The bitmap dimensions are integers (truncated), so we need to match exactly.
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

      // Clear and size the text layer
      textLayerDiv.innerHTML = '';
      textLayerDiv.style.width = `${layerWidth}px`;
      textLayerDiv.style.height = `${layerHeight}px`;

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

      if (!textContentData) {
        textContentData = await page.getTextContent();
      }
      if (!textContentData) return;

      const pageText = textContentData.items
        .map((item) => ('str' in item ? item.str : ''))
        .join(' ');
      textContentCache.current.set(pageNum, pageText);

      const textLayer = new TextLayer({
        textContentSource: textContentData,
        container: textLayerDiv,
        viewport: textLayerViewport,
      });

      textLayerTasksRef.current.set(pageNum, textLayer);
      await textLayer.render();

      // Add data-idx attributes to spans for PDF++ compatibility
      const spans = textLayerDiv.querySelectorAll('span');
      spans.forEach((span, idx) => {
        span.setAttribute('data-idx', String(idx));
        span.classList.add('textLayerNode');
      });
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

    // Create highlight elements
    for (const rect of mergedRects) {
      const highlightEl = document.createElement('div');
      highlightEl.className = 'pdf-highlight';
      highlightEl.dataset.highlightId = highlight.id;
      highlightEl.style.cssText = `
        position: absolute;
        left: ${rect.left}px;
        top: ${rect.top}px;
        width: ${rect.width}px;
        height: ${rect.height}px;
        background-color: rgba(255, 235, 59, 0.4);
        pointer-events: auto;
        border-radius: 2px;
        cursor: pointer;
        transition: background-color 0.15s ease;
      `;
      highlightEl.addEventListener('mouseenter', () => {
        highlightEl.style.backgroundColor = 'rgba(255, 235, 59, 0.6)';
      });
      highlightEl.addEventListener('mouseleave', () => {
        highlightEl.style.backgroundColor = 'rgba(255, 235, 59, 0.4)';
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
          textContentCache.current.set(pageNum, pageText);
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
  }, [searchQuery, searchResults, currentMatchIndex, renderedPages]);

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

  // Swipe gestures for mobile navigation
  const swipeHandlers = useSwipeGesture({
    onSwipeLeft: () => goToPage(currentPage + 1),
    onSwipeRight: () => goToPage(currentPage - 1),
    enabled: isMobile && pdfViewMode === 'single',
    threshold: 50,
  });

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
    const pageElement = range.startContainer.parentElement?.closest('[data-page]') as HTMLElement | null;
    const pageNum = pageElement ? parseInt(pageElement.getAttribute('data-page') || '1', 10) : currentPage;

    if (!pageElement) return;

    // Get selection in PDF++ format
    const textSelection = getTextSelectionRange(pageElement, range);
    if (!textSelection) {
      console.warn('Could not get text selection range');
      return;
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
  }, [currentPage, pageLabels]);

  // Handle mouse up for desktop
  const handleMouseUp = useCallback(() => {
    checkTextSelection();
  }, [checkTextSelection]);

  // Handle touch end for mobile - only show popup when user lifts finger
  useEffect(() => {
    if (!isMobile) return;

    const handleTouchEnd = () => {
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed && sel.toString().trim()) {
        checkTextSelection();
      }
    };

    document.addEventListener('touchend', handleTouchEnd);
    return () => document.removeEventListener('touchend', handleTouchEnd);
  }, [isMobile, checkTextSelection]);

  // Prevent native context menu when there's a text selection
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed) {
      e.preventDefault();
    }
  }, []);

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
        handleZoomModeChange('fit-width');
        return;
      }

      // Fullscreen/presentation: F
      if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        enterPresentation();
        return;
      }

      // Toggle header/UI visibility: H (e-ink mode)
      if ((e.key === 'h' || e.key === 'H') && pdfColorMode === 'eink') {
        e.preventDefault();
        setHeaderVisible(prev => {
          if (!prev) setShowClickZones(true);
          return !prev;
        });
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
        setZoom(zoom + 0.25);
      } else if (e.key === '-') {
        setZoom(zoom - 0.25);
      } else if (e.key === 'Escape' && isSearchOpen) {
        clearSearch();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentPage, totalPages, zoom, goToPage, setZoom, toggleSearch, isSearchOpen, clearSearch, isPresentation, exitPresentation, shortcutsOpen, bookmarksOpen, statsOpen, goalsOpen, toggleShortcuts, setShortcutsOpen, toggleBookmarks, setBookmarksOpen, toggleStats, setStatsOpen, toggleGoals, setGoalsOpen, toggleToc, togglePdfColorMode, handleZoomModeChange, enterPresentation, pdfColorMode]);

  // Render a single page container - use debouncedZoom to match canvas size
  const renderPageContainer = (pageNum: number) => {
    const dims = pageDimensions.get(pageNum);
    const isRendered = renderedPages.has(pageNum);
    // Use debouncedZoom for container to match canvas rendering
    const containerZoom = debouncedZoom;

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
          width: dims ? `${dims.width * containerZoom}px` : 'auto',
          height: dims ? `${dims.height * containerZoom}px` : 'auto',
        }}
      >
        {/* Skeleton loading placeholder */}
        {!isRendered && (
          <div className="pdf-page-skeleton">
            {Array.from({ length: 20 }, (_, i) => (
              <div key={i} className="skeleton-line" style={{ animationDelay: `${i * 50}ms` }} />
            ))}
          </div>
        )}

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
          style={{ zIndex: 1 }}
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
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-accent-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Presentation mode overlay
  if (isPresentation) {
    const dims = pageDimensions.get(presentationPage);
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
    <div className="flex-1 flex flex-col overflow-hidden min-w-0" ref={containerRef}>
      <div
        className={`transition-opacity duration-200 ${
          pdfColorMode === 'eink' && !headerVisible ? 'opacity-0 pointer-events-none' : 'opacity-100'
        }`}
      >
        <ReaderControls
          noteId={note.id}
          currentPage={currentPage}
          totalPages={totalPages}
          zoom={zoom}
          pageLabels={pageLabels}
          onPageChange={goToPage}
          onZoomChange={setZoom}
          onZoomModeChange={handleZoomModeChange}
          onViewModeChange={setPdfViewMode}
          onEnterPresentation={enterPresentation}
          hasToc={hasToc}
        />
      </div>

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

        {/* TOC Sidebar */}
        {tocOpen && (
          <PDFTableOfContents pdfDoc={pdfDocRef.current} pageLabels={pageLabels} onClose={() => setTocOpen(false)} />
        )}

        {/* PDF Pages Container */}
        <div
          ref={scrollContainerRef}
          className={`flex-1 bg-bg-deep ${pdfColorMode === 'dark' ? 'pdf-dark-mode' : ''} ${pdfColorMode === 'eink' ? 'pdf-eink-mode overflow-hidden' : 'overflow-auto'} ${isMobile ? 'hide-scrollbar-mobile' : ''}`}
          onMouseUp={handleMouseUp}
          onTouchStart={swipeHandlers.handleTouchStart}
          onTouchEnd={swipeHandlers.handleTouchEnd}
          onContextMenu={handleContextMenu}
        >
          <div className={`pdf-pages-container flex flex-col items-center py-4 gap-4 ${pdfViewMode === 'spread' ? 'pdf-spread-layout' : ''} ${pdfColorMode === 'eink' ? 'eink-single-page' : ''}`}>
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

        {/* Markdown Editor Panel */}
        {markdownPanelOpen && (
          <MarkdownEditorPanel noteId={note.id} onClose={() => setMarkdownPanelOpen(false)} />
        )}

        {/* Reading Statistics Panel */}
        {statsOpen && (
          <ReadingStatsPanel
            noteId={note.id}
            currentPage={currentPage}
            totalPages={totalPages}
            onClose={() => setStatsOpen(false)}
          />
        )}

        {/* Reading Goals Panel */}
        {goalsOpen && (
          <ReadingGoalsPanel onClose={() => setGoalsOpen(false)} />
        )}
      </div>

      {selection && (
        <HighlightPopup selection={selection} noteId={note.id} onClose={() => setSelection(null)} />
      )}

      {editingHighlight && (
        <HighlightEditPopup
          highlight={editingHighlight.highlight}
          noteId={note.id}
          position={editingHighlight.position}
          onClose={() => setEditingHighlight(null)}
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
