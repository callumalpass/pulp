import { useCallback, useEffect, useLayoutEffect, useState, type MutableRefObject, type RefObject } from 'react';
import type { ZoomMode, PDFColorMode } from '../../../stores/reader';

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

interface UsePdfZoomControllerArgs {
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  totalPages: number;
  zoom: number;
  zoomMode: ZoomMode;
  pdfColorMode: PDFColorMode;
  pageHeights: number[];
  pageDimensionsSize: number;
  visiblePages: Set<number>;
  restoreTargetPageRef: MutableRefObject<number | null>;
  pendingZoomAnchorRef: MutableRefObject<ZoomAnchorSnapshot | null>;
  pinchSettleTimeoutRef: MutableRefObject<number | null>;
  renderedPagesRef: MutableRefObject<Set<number>>;
  pageZoomRef: MutableRefObject<Map<number, number>>;
  textLayerZoomRef: MutableRefObject<Map<number, number>>;
  getPageDimensions: (pageNum: number) => PageDimensions | null;
  getMaxPageWidth: () => number;
  calculateFitWidthZoom: (containerWidth: number, pageWidth: number) => number;
  calculateFitPageZoom: (
    containerWidth: number,
    containerHeight: number,
    pageWidth: number,
    pageHeight: number
  ) => number;
  setCustomZoom: (zoom: number) => void;
  setZoomMode: (mode: ZoomMode) => void;
  setZoomValue: (zoom: number) => void;
}

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

export function usePdfZoomController({
  scrollContainerRef,
  totalPages,
  zoom,
  zoomMode,
  pdfColorMode,
  pageHeights,
  pageDimensionsSize,
  visiblePages,
  restoreTargetPageRef,
  pendingZoomAnchorRef,
  pinchSettleTimeoutRef,
  renderedPagesRef,
  pageZoomRef,
  textLayerZoomRef,
  getPageDimensions,
  getMaxPageWidth,
  calculateFitWidthZoom,
  calculateFitPageZoom,
  setCustomZoom,
  setZoomMode,
  setZoomValue,
}: UsePdfZoomControllerArgs) {
  const [pinchPreview, setPinchPreview] = useState<PinchPreviewState | null>(null);
  const [isPinchSettling, setIsPinchSettling] = useState(false);

  const captureZoomAnchor = useCallback((center?: { x: number; y: number }) => {
    const scrollContainer = scrollContainerRef.current;
    if (!scrollContainer || totalPages === 0 || pdfColorMode === 'eink') {
      pendingZoomAnchorRef.current = null;
      return;
    }

    const rect = scrollContainer.getBoundingClientRect();
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
  }, [pageHeights, pdfColorMode, scrollContainerRef, totalPages, pendingZoomAnchorRef]);

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
  }, [pageHeights, pdfColorMode, scrollContainerRef, totalPages, zoom, pendingZoomAnchorRef, restoreTargetPageRef]);

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
  }, [scrollContainerRef]);

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
  }, [captureZoomAnchor, pinchSettleTimeoutRef, setCustomZoom]);

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
  }, [isPinchSettling, pageZoomRef, pinchSettleTimeoutRef, renderedPagesRef, textLayerZoomRef, visiblePages, zoom]);

  const applyZoomMode = useCallback((mode: ZoomMode) => {
    if (pageDimensionsSize === 0 || !scrollContainerRef.current) return;

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
  }, [
    calculateFitPageZoom,
    calculateFitWidthZoom,
    captureZoomAnchor,
    getMaxPageWidth,
    getPageDimensions,
    pageDimensionsSize,
    scrollContainerRef,
    setZoomMode,
    setZoomValue,
    zoom,
  ]);

  useEffect(() => {
    if (pageDimensionsSize === 0 || !scrollContainerRef.current) return;

    const handleResize = () => {
      if (zoomMode === 'fit-width') {
        applyZoomMode('fit-width');
      } else if (zoomMode === 'fit-page') {
        applyZoomMode('fit-page');
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [applyZoomMode, pageDimensionsSize, scrollContainerRef, zoomMode]);

  return {
    pinchPreview,
    isPinchSettling,
    applyCustomZoom,
    applyZoomMode,
    handlePinchPreviewChange,
    handlePinchZoomCommit,
  };
}
