import { useRef, useCallback } from 'react';

interface PinchZoomOptions {
  onZoomChange: (zoom: number) => void;
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
  onZoomChange,
  minZoom = 0.5,
  maxZoom = 3.0,
  enabled = true,
}: PinchZoomOptions) {
  const initialDistance = useRef<number | null>(null);
  const initialZoom = useRef<number>(1);
  const lastZoom = useRef<number>(1);
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);

  const handleTouchStart = useCallback(
    (e: React.TouchEvent, currentZoom: number) => {
      if (!enabled || e.touches.length !== 2) return;

      const touch1 = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      const touch2 = { x: e.touches[1].clientX, y: e.touches[1].clientY };

      initialDistance.current = getDistance(touch1, touch2);
      initialZoom.current = currentZoom;
      lastZoom.current = currentZoom;
    },
    [enabled]
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!enabled || e.touches.length !== 2 || initialDistance.current === null) return;

      const touch1 = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      const touch2 = { x: e.touches[1].clientX, y: e.touches[1].clientY };

      const currentDistance = getDistance(touch1, touch2);
      const scale = currentDistance / initialDistance.current;
      let newZoom = initialZoom.current * scale;

      // Clamp to bounds
      newZoom = Math.max(minZoom, Math.min(maxZoom, newZoom));

      // Debounce updates for performance
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }

      // Only trigger update if zoom changed significantly
      if (Math.abs(newZoom - lastZoom.current) > 0.02) {
        lastZoom.current = newZoom;
        debounceTimer.current = setTimeout(() => {
          onZoomChange(newZoom);
        }, 16); // ~60fps
      }
    },
    [enabled, minZoom, maxZoom, onZoomChange]
  );

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length < 2) {
        // Pinch ended, apply final zoom
        if (initialDistance.current !== null && lastZoom.current !== initialZoom.current) {
          onZoomChange(lastZoom.current);
        }
        initialDistance.current = null;
      }
    },
    [onZoomChange]
  );

  return {
    handlePinchStart: handleTouchStart,
    handlePinchMove: handleTouchMove,
    handlePinchEnd: handleTouchEnd,
    isPinching: initialDistance.current !== null,
  };
}
