import { useRef, useCallback } from 'react';

interface PinchZoomOptions {
  onPreviewChange?: (preview: { scale: number; center: TouchPoint } | null) => void;
  onZoomCommit?: (zoom: number, center: TouchPoint) => void;
  onZoomChange?: (zoom: number) => void;
  minZoom?: number;
  maxZoom?: number;
  enabled?: boolean;
}

interface TouchPoint {
  x: number;
  y: number;
}

function getDistance(touch1: TouchPoint, touch2: TouchPoint): number {
  const dx = touch1.x - touch2.x;
  const dy = touch1.y - touch2.y;
  return Math.sqrt(dx * dx + dy * dy);
}

export function usePinchZoom({
  onPreviewChange,
  onZoomCommit,
  onZoomChange,
  minZoom = 0.5,
  maxZoom = 3.0,
  enabled = true,
}: PinchZoomOptions) {
  const initialDistance = useRef<number | null>(null);
  const initialZoom = useRef<number>(1);
  const lastZoom = useRef<number>(1);
  const lastCenter = useRef<TouchPoint | null>(null);

  const handleTouchStart = useCallback(
    (e: React.TouchEvent, currentZoom: number) => {
      if (!enabled || e.touches.length !== 2) return;
      e.preventDefault();

      const touch1 = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      const touch2 = { x: e.touches[1].clientX, y: e.touches[1].clientY };

      initialDistance.current = getDistance(touch1, touch2);
      initialZoom.current = currentZoom;
      lastZoom.current = currentZoom;
      lastCenter.current = {
        x: (touch1.x + touch2.x) / 2,
        y: (touch1.y + touch2.y) / 2,
      };
      onPreviewChange?.({
        scale: 1,
        center: lastCenter.current,
      });
    },
    [enabled, onPreviewChange]
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!enabled || e.touches.length !== 2 || initialDistance.current === null) return;
      e.preventDefault();

      const touch1 = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      const touch2 = { x: e.touches[1].clientX, y: e.touches[1].clientY };

      const currentDistance = getDistance(touch1, touch2);
      const scale = currentDistance / initialDistance.current;
      let newZoom = initialZoom.current * scale;

      // Clamp to bounds
      newZoom = Math.max(minZoom, Math.min(maxZoom, newZoom));
      lastZoom.current = newZoom;
      lastCenter.current = {
        x: (touch1.x + touch2.x) / 2,
        y: (touch1.y + touch2.y) / 2,
      };
      onPreviewChange?.({
        scale: initialZoom.current === 0 ? 1 : newZoom / initialZoom.current,
        center: lastCenter.current,
      });
      onZoomChange?.(newZoom);
    },
    [enabled, maxZoom, minZoom, onPreviewChange, onZoomChange]
  );

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length < 2) {
        onPreviewChange?.(null);
        if (
          initialDistance.current !== null &&
          lastCenter.current &&
          Math.abs(lastZoom.current - initialZoom.current) > 0.0001
        ) {
          onZoomCommit?.(lastZoom.current, lastCenter.current);
          onZoomChange?.(lastZoom.current);
        }
        initialDistance.current = null;
        lastCenter.current = null;
      }
    },
    [onPreviewChange, onZoomCommit, onZoomChange]
  );

  return {
    handlePinchStart: handleTouchStart,
    handlePinchMove: handleTouchMove,
    handlePinchEnd: handleTouchEnd,
    isPinching: initialDistance.current !== null,
  };
}
