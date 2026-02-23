import { useRef, useCallback } from 'react';

interface PinchZoomOptions {
  onZoomChange: (zoom: number) => void;
  minZoom?: number;
  maxZoom?: number;
  enabled?: boolean;
  updateThreshold?: number;
  maxUpdatesPerSecond?: number;
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
  updateThreshold = 0.015,
  maxUpdatesPerSecond = 15,
}: PinchZoomOptions) {
  const initialDistance = useRef<number | null>(null);
  const initialZoom = useRef<number>(1);
  const lastZoom = useRef<number>(1);
  const lastEmittedZoom = useRef<number>(1);
  const lastEmitAt = useRef<number | null>(null);
  const pendingZoom = useRef<number | null>(null);
  const frameHandle = useRef<number | ReturnType<typeof setTimeout> | null>(null);
  const frameUsesRaf = useRef(false);

  const minIntervalMs = Math.max(1, Math.round(1000 / Math.max(1, maxUpdatesPerSecond)));

  const emitZoom = useCallback((value: number) => {
    if (Math.abs(value - lastEmittedZoom.current) <= 0.0001) return;
    lastEmittedZoom.current = value;
    onZoomChange(value);
  }, [onZoomChange]);

  const flushPendingZoom = useCallback(() => {
    frameHandle.current = null;
    frameUsesRaf.current = false;
    if (pendingZoom.current === null) return;

    const now = Date.now();
    const elapsed = lastEmitAt.current === null ? Infinity : now - lastEmitAt.current;
    if (elapsed < minIntervalMs) {
      const waitMs = minIntervalMs - elapsed;
      frameHandle.current = setTimeout(() => flushPendingZoom(), waitMs);
      return;
    }

    const value = pendingZoom.current;
    pendingZoom.current = null;
    lastEmitAt.current = now;
    emitZoom(value);
  }, [emitZoom, minIntervalMs]);

  const scheduleZoomFlush = useCallback(() => {
    if (frameHandle.current !== null) return;
    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      frameUsesRaf.current = true;
      frameHandle.current = window.requestAnimationFrame(() => flushPendingZoom());
      return;
    }
    frameUsesRaf.current = false;
    frameHandle.current = setTimeout(() => flushPendingZoom(), 16);
  }, [flushPendingZoom]);

  const handleTouchStart = useCallback(
    (e: React.TouchEvent, currentZoom: number) => {
      if (!enabled || e.touches.length !== 2) return;
      e.preventDefault();

      const touch1 = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      const touch2 = { x: e.touches[1].clientX, y: e.touches[1].clientY };

      initialDistance.current = getDistance(touch1, touch2);
      initialZoom.current = currentZoom;
      lastZoom.current = currentZoom;
      lastEmittedZoom.current = currentZoom;
      lastEmitAt.current = null;
      pendingZoom.current = null;
    },
    [enabled]
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

      // Skip tiny changes to reduce render churn during pinch.
      if (Math.abs(newZoom - lastZoom.current) > updateThreshold) {
        lastZoom.current = newZoom;
        pendingZoom.current = newZoom;
        scheduleZoomFlush();
      }
    },
    [enabled, minZoom, maxZoom, scheduleZoomFlush, updateThreshold]
  );

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length < 2) {
        if (frameHandle.current !== null) {
          if (frameUsesRaf.current && typeof window !== 'undefined' && typeof window.cancelAnimationFrame === 'function') {
            window.cancelAnimationFrame(frameHandle.current);
          } else {
            clearTimeout(frameHandle.current as ReturnType<typeof setTimeout>);
          }
          frameHandle.current = null;
          frameUsesRaf.current = false;
        }
        flushPendingZoom();
        // Pinch ended, apply final zoom
        if (initialDistance.current !== null && lastZoom.current !== initialZoom.current) {
          lastEmitAt.current = Date.now();
          emitZoom(lastZoom.current);
        }
        initialDistance.current = null;
      }
    },
    [emitZoom, flushPendingZoom]
  );

  return {
    handlePinchStart: handleTouchStart,
    handlePinchMove: handleTouchMove,
    handlePinchEnd: handleTouchEnd,
    isPinching: initialDistance.current !== null,
  };
}
