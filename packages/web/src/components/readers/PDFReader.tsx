import { useEffect, useRef, useCallback, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { TextLayer } from 'pdfjs-dist';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import type { LiteratureNote, PDFHighlight, TextSelection } from '@pulp/shared';
import { useReaderStore, type ZoomMode } from '../../stores/reader';
import { useProgress } from '../../hooks/useProgress';
import { useHighlights } from '../../hooks/useNote';
import { ReaderControls } from './shared/ReaderControls';
import { HighlightPopup } from './shared/HighlightPopup';
import { HighlightEditPopup } from './shared/HighlightEditPopup';
import { PDFTableOfContents } from './shared/PDFTableOfContents';
import { api } from '../../lib/api';

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

interface PDFReaderProps {
  note: LiteratureNote;
}

interface Selection {
  text: string;
  page: number;
  selection: TextSelection;
  position: { x: number; y: number };
}

interface PageDimensions {
  width: number;
  height: number;
}

const PAGE_BUFFER = 2; // Number of pages to pre-render above/below viewport

export function PDFReader({ note }: PDFReaderProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const pdfDocRef = useRef<PDFDocumentProxy | null>(null);
  const pageCanvasRefs = useRef<Map<number, HTMLCanvasElement>>(new Map());
  const textLayerRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const highlightLayerRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const pageContainerRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const renderTasksRef = useRef<Map<number, { cancel: () => void }>>(new Map());
  const textLayerTasksRef = useRef<Map<number, TextLayer>>(new Map());
  const observerRef = useRef<IntersectionObserver | null>(null);

  const {
    currentPage,
    totalPages,
    zoom,
    zoomMode,
    tocOpen,
    scrollToPage,
    isLoading,
    setCurrentPage,
    setTotalPages,
    setZoom,
    setZoomMode,
    setTocOpen,
    setScrollToPage,
    setIsLoading,
    reset,
  } = useReaderStore();

  const { updateProgress, saveImmediately } = useProgress(note.id);
  const { data: highlights } = useHighlights(note.id);

  const [selection, setSelection] = useState<Selection | null>(null);
  const [editingHighlight, setEditingHighlight] = useState<{ highlight: PDFHighlight; position: { x: number; y: number } } | null>(null);
  const [renderedPages, setRenderedPages] = useState<Set<number>>(new Set());
  const [visiblePages, setVisiblePages] = useState<Set<number>>(new Set([1]));
  const [pageDimensions, setPageDimensions] = useState<Map<number, PageDimensions>>(new Map());
  const [hasToc, setHasToc] = useState(false);

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
    loadPDF();

    return () => {
      // Cleanup on unmount
      saveImmediately();
      renderTasksRef.current.forEach(task => task.cancel());
      textLayerTasksRef.current.forEach(task => task.cancel());
      observerRef.current?.disconnect();
      pdfDocRef.current?.destroy();
    };
  }, [note.id]);

  const loadPDF = async () => {
    try {
      setIsLoading(true);
      const loadingTask = pdfjsLib.getDocument(api.files.getUrl(note.id));
      const pdf = await loadingTask.promise;
      pdfDocRef.current = pdf;
      setTotalPages(pdf.numPages);

      // Get dimensions for all pages
      const dimensions = new Map<number, PageDimensions>();
      let maxWidth = 0;
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 1 });
        dimensions.set(i, { width: viewport.width, height: viewport.height });
        maxWidth = Math.max(maxWidth, viewport.width);
      }
      setPageDimensions(dimensions);

      // Check if PDF has table of contents
      const outline = await pdf.getOutline();
      setHasToc(outline !== null && outline.length > 0);

      // Calculate initial zoom based on container and widest page
      if (scrollContainerRef.current && zoomMode === 'fit-width') {
        const containerWidth = scrollContainerRef.current.clientWidth;
        const fitZoom = calculateFitWidthZoom(containerWidth, maxWidth);
        setZoom(fitZoom);
        // Re-set zoom mode since setZoom changes it to 'custom'
        setZoomMode('fit-width');
      }

      // Restore progress
      if (note.progress > 0) {
        const restoredPage = Math.max(1, Math.round((note.progress / 100) * pdf.numPages));
        setCurrentPage(restoredPage);
        // Scroll to restored page after render
        setTimeout(() => setScrollToPage(restoredPage), 100);
      }

      setIsLoading(false);
    } catch (error) {
      console.error('Failed to load PDF:', error);
      setIsLoading(false);
    }
  };

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

  // Setup intersection observer for lazy loading
  useEffect(() => {
    if (!pdfDocRef.current || isLoading) return;

    observerRef.current?.disconnect();

    observerRef.current = new IntersectionObserver(
      (entries) => {
        setVisiblePages((prev) => {
          const updated = new Set(prev);
          entries.forEach((entry) => {
            const pageNum = parseInt(entry.target.getAttribute('data-page') || '1', 10);
            if (entry.isIntersecting) {
              updated.add(pageNum);
            } else {
              updated.delete(pageNum);
            }
          });
          return updated;
        });
      },
      {
        root: scrollContainerRef.current,
        rootMargin: '200px 0px',
        threshold: 0.1,
      }
    );

    // Observe all page containers
    pageContainerRefs.current.forEach((container) => {
      observerRef.current?.observe(container);
    });

    return () => observerRef.current?.disconnect();
  }, [totalPages, isLoading]);

  // Calculate cumulative scroll offset to a page (accounts for variable page heights)
  const getScrollOffsetToPage = useCallback((targetPage: number) => {
    let offset = 16; // Initial padding
    for (let i = 1; i < targetPage; i++) {
      const dims = pageDimensions.get(i);
      if (dims) {
        offset += dims.height * zoom + 16; // page height + gap
      }
    }
    return offset;
  }, [pageDimensions, zoom]);

  // Update current page based on scroll position
  useEffect(() => {
    const scrollContainer = scrollContainerRef.current;
    if (!scrollContainer || pageDimensions.size === 0) return;

    const handleScroll = () => {
      const scrollTop = scrollContainer.scrollTop;

      // Find which page we're on by accumulating heights
      let accumulatedHeight = 16; // Initial padding
      let newCurrentPage = 1;

      for (let i = 1; i <= totalPages; i++) {
        const dims = pageDimensions.get(i);
        if (!dims) continue;

        const pageBottom = accumulatedHeight + dims.height * zoom;
        if (scrollTop < pageBottom - dims.height * zoom * 0.5) {
          newCurrentPage = i;
          break;
        }
        accumulatedHeight = pageBottom + 16; // Add gap
        newCurrentPage = i;
      }

      if (newCurrentPage !== currentPage) {
        setCurrentPage(newCurrentPage);
        const progress = (newCurrentPage / totalPages) * 100;
        updateProgress(progress);
      }
    };

    scrollContainer.addEventListener('scroll', handleScroll, { passive: true });
    return () => scrollContainer.removeEventListener('scroll', handleScroll);
  }, [pageDimensions, zoom, totalPages, currentPage, setCurrentPage, updateProgress]);

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

  // Version counter to trigger re-renders when zoom changes
  const [renderVersion, setRenderVersion] = useState(0);

  // Clear rendered pages and bump version when zoom changes
  useEffect(() => {
    setRenderedPages(new Set());
    setRenderVersion((v) => v + 1);
  }, [zoom]);

  // Render visible pages and buffer
  useEffect(() => {
    if (!pdfDocRef.current || isLoading) return;

    const pagesToRender = new Set<number>();

    visiblePages.forEach((pageNum) => {
      // Add visible page
      pagesToRender.add(pageNum);
      // Add buffer pages
      for (let i = 1; i <= PAGE_BUFFER; i++) {
        if (pageNum - i >= 1) pagesToRender.add(pageNum - i);
        if (pageNum + i <= totalPages) pagesToRender.add(pageNum + i);
      }
    });

    pagesToRender.forEach((pageNum) => {
      if (!renderedPages.has(pageNum)) {
        renderPage(pageNum);
      }
    });

    // Cleanup pages far from viewport (memory optimization)
    renderedPages.forEach((pageNum) => {
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
        setRenderedPages((prev) => {
          const next = new Set(prev);
          next.delete(pageNum);
          return next;
        });
      }
    });
  }, [visiblePages, totalPages, isLoading, renderVersion]);

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
    if (!pdfDocRef.current || renderedPages.has(pageNum)) return;

    // Cancel existing render task for this page
    renderTasksRef.current.get(pageNum)?.cancel();
    textLayerTasksRef.current.get(pageNum)?.cancel();

    try {
      const page: PDFPageProxy = await pdfDocRef.current.getPage(pageNum);
      const canvas = pageCanvasRefs.current.get(pageNum);
      const textLayerDiv = textLayerRefs.current.get(pageNum);
      if (!canvas) return;

      const scale = zoom;
      const viewport = page.getViewport({ scale: scale * window.devicePixelRatio });
      const displayViewport = page.getViewport({ scale });

      canvas.width = viewport.width;
      canvas.height = viewport.height;
      canvas.style.width = `${displayViewport.width}px`;
      canvas.style.height = `${displayViewport.height}px`;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const renderTask = page.render({
        canvasContext: ctx,
        viewport,
      });

      renderTasksRef.current.set(pageNum, renderTask);
      await renderTask.promise;

      // Render text layer for selection
      if (textLayerDiv) {
        // Clear existing text layer content
        textLayerDiv.innerHTML = '';
        textLayerDiv.style.width = `${displayViewport.width}px`;
        textLayerDiv.style.height = `${displayViewport.height}px`;

        const textContent = await page.getTextContent();

        const textLayer = new TextLayer({
          textContentSource: textContent,
          container: textLayerDiv,
          viewport: displayViewport,
        });

        textLayerTasksRef.current.set(pageNum, textLayer);
        await textLayer.render();

        // Add data-idx attributes to spans for PDF++ compatibility
        const spans = textLayerDiv.querySelectorAll('span');
        spans.forEach((span, idx) => {
          span.setAttribute('data-idx', String(idx));
          span.classList.add('textLayerNode');
        });
      }

      setRenderedPages((prev) => new Set(prev).add(pageNum));
    } catch (error) {
      if ((error as Error).name !== 'RenderingCancelledException') {
        console.error(`Failed to render page ${pageNum}:`, error);
      }
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

  // Handle page navigation (now scrolls to page)
  const goToPage = useCallback(
    (page: number) => {
      const newPage = Math.max(1, Math.min(totalPages, page));
      setScrollToPage(newPage);
    },
    [totalPages, setScrollToPage]
  );

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

  // Handle text selection
  const handleMouseUp = useCallback(() => {
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
      selection: textSelection,
      position: {
        x: rect.left + rect.width / 2 - containerRect.left,
        y: rect.bottom - containerRect.top + 10,
      },
    });
  }, [currentPage]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
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
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentPage, totalPages, zoom, goToPage, setZoom]);

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-accent-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden" ref={containerRef}>
      <ReaderControls
        currentPage={currentPage}
        totalPages={totalPages}
        zoom={zoom}
        onPageChange={goToPage}
        onZoomChange={setZoom}
        onZoomModeChange={handleZoomModeChange}
        hasToc={hasToc}
      />

      <div className="flex-1 flex overflow-hidden">
        {/* TOC Sidebar */}
        {tocOpen && (
          <PDFTableOfContents pdfDoc={pdfDocRef.current} onClose={() => setTocOpen(false)} />
        )}

        {/* PDF Pages Container */}
        <div
          ref={scrollContainerRef}
          className="flex-1 overflow-auto bg-bg-deep"
          onMouseUp={handleMouseUp}
        >
          <div className="pdf-pages-container flex flex-col items-center py-4 gap-4">
            {/* Render all pages */}
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => {
              const dims = pageDimensions.get(pageNum);
              return (
              <div
                key={pageNum}
                data-page={pageNum}
                ref={(el) => {
                  if (el) {
                    pageContainerRefs.current.set(pageNum, el);
                    observerRef.current?.observe(el);
                  }
                }}
                className="pdf-page-container relative bg-white shadow-lg"
                style={{
                  width: dims ? `${dims.width * zoom}px` : 'auto',
                  height: dims ? `${dims.height * zoom}px` : 'auto',
                }}
              >
                <canvas
                  ref={(el) => {
                    if (el) pageCanvasRefs.current.set(pageNum, el);
                  }}
                  className="block"
                />

                {/* Text layer for selection */}
                <div
                  ref={(el) => {
                    if (el) textLayerRefs.current.set(pageNum, el);
                  }}
                  className="textLayer absolute top-0 left-0"
                  style={{ zIndex: 1 }}
                />

                {/* Highlight layer - above text layer for clickable highlights */}
                <div
                  ref={(el) => {
                    if (el) highlightLayerRefs.current.set(pageNum, el);
                  }}
                  className="absolute top-0 left-0"
                  style={{ width: '100%', height: '100%', zIndex: 2, pointerEvents: 'none' }}
                />

                {/* Page number indicator */}
                <div className="absolute bottom-2 right-2 px-2 py-1 bg-black/50 text-white text-xs rounded">
                  {pageNum}
                </div>
              </div>
              );
            })}
          </div>
        </div>
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
    </div>
  );
}
