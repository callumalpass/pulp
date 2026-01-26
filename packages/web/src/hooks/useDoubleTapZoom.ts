import { useRef, useCallback } from 'react';

interface DoubleTapZoomOptions {
  onDoubleTap: (zoomedIn: boolean) => void;
  tapTimeout?: number;
  enabled?: boolean;
}

interface TapInfo {
  time: number;
  x: number;
  y: number;
}

export function useDoubleTapZoom({
  onDoubleTap,
  tapTimeout = 300,
  enabled = true,
}: DoubleTapZoomOptions) {
  const lastTap = useRef<TapInfo | null>(null);
  const isZoomedIn = useRef(false);

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (!enabled) return;

      // Only handle single-finger taps
      if (e.changedTouches.length !== 1) return;

      const touch = e.changedTouches[0];
      const now = Date.now();

      if (lastTap.current) {
        const timeDelta = now - lastTap.current.time;
        const distanceX = Math.abs(touch.clientX - lastTap.current.x);
        const distanceY = Math.abs(touch.clientY - lastTap.current.y);

        // Check if this is a double tap (within time and distance thresholds)
        if (timeDelta < tapTimeout && distanceX < 30 && distanceY < 30) {
          // Toggle zoom state
          isZoomedIn.current = !isZoomedIn.current;
          onDoubleTap(isZoomedIn.current);
          lastTap.current = null;
          return;
        }
      }

      // Store this tap
      lastTap.current = {
        time: now,
        x: touch.clientX,
        y: touch.clientY,
      };

      // Clear stored tap after timeout
      setTimeout(() => {
        if (lastTap.current && Date.now() - lastTap.current.time >= tapTimeout) {
          lastTap.current = null;
        }
      }, tapTimeout);
    },
    [enabled, tapTimeout, onDoubleTap]
  );

  const resetZoomState = useCallback(() => {
    isZoomedIn.current = false;
  }, []);

  return {
    handleDoubleTapEnd: handleTouchEnd,
    resetZoomState,
    isZoomedIn: isZoomedIn.current,
  };
}
