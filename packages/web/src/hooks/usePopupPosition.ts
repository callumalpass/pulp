import { useRef, useCallback, useLayoutEffect, useState } from 'react';
import { calculatePopupPosition, type PopupPosition, type PopupPlacement } from '../lib/popup-position';

interface UsePopupPositionOptions {
  /** Anchor position (relative to container) */
  anchor: { x: number; y: number };
  /** Container ref for bounds calculation */
  containerRef?: React.RefObject<HTMLElement | null>;
  /** Initial width estimate */
  initialWidth?: number;
  /** Initial height estimate */
  initialHeight?: number;
  /** Padding from container edges */
  padding?: number;
  /** Gap between anchor and popup */
  gap?: number;
  /** Preferred placement */
  preferredPlacement?: PopupPlacement;
}

interface UsePopupPositionResult {
  /** Ref to attach to the popup element */
  popupRef: React.RefCallback<HTMLDivElement>;
  /** Calculated position */
  position: PopupPosition;
}

/**
 * Hook that uses ResizeObserver to measure actual popup dimensions
 * and calculate optimal positioning.
 *
 * Only updates position when dimensions change by >5px to avoid micro-adjustments.
 */
export function usePopupPosition({
  anchor,
  containerRef,
  initialWidth = 300,
  initialHeight = 150,
  padding = 10,
  gap = 10,
  preferredPlacement = 'below',
}: UsePopupPositionOptions): UsePopupPositionResult {
  const [dimensions, setDimensions] = useState({ width: initialWidth, height: initialHeight });
  const popupElementRef = useRef<HTMLDivElement | null>(null);
  const observerRef = useRef<ResizeObserver | null>(null);
  const lastDimensionsRef = useRef({ width: initialWidth, height: initialHeight });

  // Calculate position based on current dimensions
  const calculatePosition = useCallback((): PopupPosition => {
    const container = containerRef?.current;
    if (!container) {
      // Fallback to viewport-based positioning
      return {
        x: Math.max(10, Math.min(anchor.x - dimensions.width / 2, window.innerWidth - dimensions.width - 10)),
        y: anchor.y + gap,
        placement: 'below',
      };
    }

    const containerRect = container.getBoundingClientRect();

    return calculatePopupPosition({
      anchor,
      popupWidth: dimensions.width,
      popupHeight: dimensions.height,
      containerRect,
      padding,
      gap,
      preferredPlacement,
    });
  }, [anchor, dimensions, containerRef, padding, gap, preferredPlacement]);

  // Callback ref that sets up ResizeObserver
  const popupRef = useCallback((node: HTMLDivElement | null) => {
    // Clean up previous observer
    if (observerRef.current) {
      observerRef.current.disconnect();
      observerRef.current = null;
    }

    popupElementRef.current = node;

    if (node) {
      // Initial measurement
      const rect = node.getBoundingClientRect();
      const newWidth = rect.width;
      const newHeight = rect.height;

      // Only update if significantly different (>5px threshold)
      if (
        Math.abs(newWidth - lastDimensionsRef.current.width) > 5 ||
        Math.abs(newHeight - lastDimensionsRef.current.height) > 5
      ) {
        lastDimensionsRef.current = { width: newWidth, height: newHeight };
        setDimensions({ width: newWidth, height: newHeight });
      }

      // Set up ResizeObserver for future changes
      observerRef.current = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (entry) {
          const { width, height } = entry.contentRect;

          // Only update if significantly different (>5px threshold)
          if (
            Math.abs(width - lastDimensionsRef.current.width) > 5 ||
            Math.abs(height - lastDimensionsRef.current.height) > 5
          ) {
            lastDimensionsRef.current = { width, height };
            setDimensions({ width, height });
          }
        }
      });

      observerRef.current.observe(node);
    }
  }, []);

  // Clean up observer on unmount
  useLayoutEffect(() => {
    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, []);

  return {
    popupRef,
    position: calculatePosition(),
  };
}
