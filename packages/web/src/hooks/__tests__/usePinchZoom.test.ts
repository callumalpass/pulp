import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── React mocks ─────────────────────────────────────────────────────────

let refMap: Record<number, { current: unknown }> = {};
let refCounter = 0;

vi.mock('react', () => ({
  useCallback: (fn: Function, _deps: unknown[]) => fn,
  useRef: (initial: unknown) => {
    const idx = refCounter++;
    if (!refMap[idx]) {
      refMap[idx] = { current: initial };
    }
    return refMap[idx];
  },
}));

import { usePinchZoom } from '../usePinchZoom';

// ── Helpers ─────────────────────────────────────────────────────────────

function resetMockState() {
  refMap = {};
  refCounter = 0;
}

function createTwoFingerTouchEvent(
  x1: number,
  y1: number,
  x2: number,
  y2: number
): React.TouchEvent {
  return {
    touches: [
      { clientX: x1, clientY: y1 },
      { clientX: x2, clientY: y2 },
    ],
    changedTouches: [
      { clientX: x1, clientY: y1 },
      { clientX: x2, clientY: y2 },
    ],
  } as unknown as React.TouchEvent;
}

function createSingleFingerTouchEvent(x: number, y: number): React.TouchEvent {
  return {
    touches: [{ clientX: x, clientY: y }],
    changedTouches: [{ clientX: x, clientY: y }],
  } as unknown as React.TouchEvent;
}

function createZeroTouchEvent(): React.TouchEvent {
  return {
    touches: [],
    changedTouches: [],
  } as unknown as React.TouchEvent;
}

// ── Tests ───────────────────────────────────────────────────────────────

describe('usePinchZoom', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    resetMockState();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('return values', () => {
    it('returns handlePinchStart, handlePinchMove, handlePinchEnd, and isPinching', () => {
      const result = usePinchZoom({ onZoomChange: vi.fn() });

      expect(typeof result.handlePinchStart).toBe('function');
      expect(typeof result.handlePinchMove).toBe('function');
      expect(typeof result.handlePinchEnd).toBe('function');
      expect(typeof result.isPinching).toBe('boolean');
    });

    it('isPinching is initially false', () => {
      const result = usePinchZoom({ onZoomChange: vi.fn() });

      expect(result.isPinching).toBe(false);
    });
  });

  describe('handlePinchStart', () => {
    it('ignores single-finger touch events', () => {
      const onZoomChange = vi.fn();
      const { handlePinchStart, handlePinchMove, handlePinchEnd } = usePinchZoom({
        onZoomChange,
      });

      handlePinchStart(createSingleFingerTouchEvent(100, 100), 1.0);
      handlePinchMove(createSingleFingerTouchEvent(150, 100));
      handlePinchEnd(createZeroTouchEvent());

      expect(onZoomChange).not.toHaveBeenCalled();
    });

    it('ignores three-finger touch events', () => {
      const onZoomChange = vi.fn();
      const { handlePinchStart } = usePinchZoom({ onZoomChange });

      const threeFinger = {
        touches: [
          { clientX: 0, clientY: 0 },
          { clientX: 50, clientY: 0 },
          { clientX: 100, clientY: 0 },
        ],
      } as unknown as React.TouchEvent;

      handlePinchStart(threeFinger, 1.0);

      // Should not set up pinch state
      expect(onZoomChange).not.toHaveBeenCalled();
    });

    it('stores initial distance for two-finger touch', () => {
      const onZoomChange = vi.fn();
      const { handlePinchStart, handlePinchMove } = usePinchZoom({ onZoomChange });

      // Two fingers 100px apart horizontally
      handlePinchStart(createTwoFingerTouchEvent(0, 0, 100, 0), 1.0);

      // Spread fingers to 200px apart (2x zoom)
      handlePinchMove(createTwoFingerTouchEvent(0, 0, 200, 0));
      vi.advanceTimersByTime(20);

      expect(onZoomChange).toHaveBeenCalledWith(2.0);
    });

    it('does nothing when disabled', () => {
      const onZoomChange = vi.fn();
      const { handlePinchStart, handlePinchMove, handlePinchEnd } = usePinchZoom({
        onZoomChange,
        enabled: false,
      });

      handlePinchStart(createTwoFingerTouchEvent(0, 0, 100, 0), 1.0);
      handlePinchMove(createTwoFingerTouchEvent(0, 0, 200, 0));
      vi.advanceTimersByTime(20);
      handlePinchEnd(createZeroTouchEvent());

      expect(onZoomChange).not.toHaveBeenCalled();
    });
  });

  describe('zoom calculations', () => {
    it('calculates correct zoom for pinch out (zoom in)', () => {
      const onZoomChange = vi.fn();
      const { handlePinchStart, handlePinchMove } = usePinchZoom({ onZoomChange });

      // Start with fingers 100px apart
      handlePinchStart(createTwoFingerTouchEvent(50, 100, 150, 100), 1.0);

      // Spread to 150px apart (1.5x zoom)
      handlePinchMove(createTwoFingerTouchEvent(25, 100, 175, 100));
      vi.advanceTimersByTime(20);

      expect(onZoomChange).toHaveBeenCalledWith(1.5);
    });

    it('calculates correct zoom for pinch in (zoom out)', () => {
      const onZoomChange = vi.fn();
      const { handlePinchStart, handlePinchMove } = usePinchZoom({ onZoomChange });

      // Start with fingers 100px apart at 1.0 zoom
      handlePinchStart(createTwoFingerTouchEvent(0, 0, 100, 0), 1.0);

      // Pinch to 50px apart (0.5x zoom)
      handlePinchMove(createTwoFingerTouchEvent(25, 0, 75, 0));
      vi.advanceTimersByTime(20);

      expect(onZoomChange).toHaveBeenCalledWith(0.5);
    });

    it('correctly handles diagonal finger distance', () => {
      const onZoomChange = vi.fn();
      const { handlePinchStart, handlePinchMove } = usePinchZoom({ onZoomChange });

      // Fingers at (0,0) and (30,40) = 50px apart (3-4-5 triangle)
      handlePinchStart(createTwoFingerTouchEvent(0, 0, 30, 40), 1.0);

      // Move to (0,0) and (60,80) = 100px apart (2x distance)
      handlePinchMove(createTwoFingerTouchEvent(0, 0, 60, 80));
      vi.advanceTimersByTime(20);

      expect(onZoomChange).toHaveBeenCalledWith(2.0);
    });

    it('preserves initial zoom level when scaling', () => {
      const onZoomChange = vi.fn();
      const { handlePinchStart, handlePinchMove } = usePinchZoom({ onZoomChange });

      // Start at 2.0 zoom with fingers 100px apart
      handlePinchStart(createTwoFingerTouchEvent(0, 0, 100, 0), 2.0);

      // Double the distance - should result in 4.0 zoom (2.0 * 2)
      handlePinchMove(createTwoFingerTouchEvent(0, 0, 200, 0));
      vi.advanceTimersByTime(20);

      // But clamped to maxZoom (default 3.0)
      expect(onZoomChange).toHaveBeenCalledWith(3.0);
    });
  });

  describe('zoom bounds', () => {
    it('clamps zoom to minZoom (default 0.5)', () => {
      const onZoomChange = vi.fn();
      const { handlePinchStart, handlePinchMove } = usePinchZoom({ onZoomChange });

      // Start with fingers 100px apart
      handlePinchStart(createTwoFingerTouchEvent(0, 0, 100, 0), 1.0);

      // Pinch to 10px apart (would be 0.1x but clamped to 0.5)
      handlePinchMove(createTwoFingerTouchEvent(45, 0, 55, 0));
      vi.advanceTimersByTime(20);

      expect(onZoomChange).toHaveBeenCalledWith(0.5);
    });

    it('clamps zoom to maxZoom (default 3.0)', () => {
      const onZoomChange = vi.fn();
      const { handlePinchStart, handlePinchMove } = usePinchZoom({ onZoomChange });

      // Start with fingers 100px apart
      handlePinchStart(createTwoFingerTouchEvent(0, 0, 100, 0), 1.0);

      // Spread to 500px apart (would be 5x but clamped to 3.0)
      handlePinchMove(createTwoFingerTouchEvent(0, 0, 500, 0));
      vi.advanceTimersByTime(20);

      expect(onZoomChange).toHaveBeenCalledWith(3.0);
    });

    it('respects custom minZoom', () => {
      const onZoomChange = vi.fn();
      const { handlePinchStart, handlePinchMove } = usePinchZoom({
        onZoomChange,
        minZoom: 0.25,
      });

      // Start with fingers 100px apart
      handlePinchStart(createTwoFingerTouchEvent(0, 0, 100, 0), 1.0);

      // Pinch to 20px apart (0.2x, clamped to 0.25)
      handlePinchMove(createTwoFingerTouchEvent(40, 0, 60, 0));
      vi.advanceTimersByTime(20);

      expect(onZoomChange).toHaveBeenCalledWith(0.25);
    });

    it('respects custom maxZoom', () => {
      const onZoomChange = vi.fn();
      const { handlePinchStart, handlePinchMove } = usePinchZoom({
        onZoomChange,
        maxZoom: 5.0,
      });

      // Start with fingers 100px apart
      handlePinchStart(createTwoFingerTouchEvent(0, 0, 100, 0), 1.0);

      // Spread to 500px apart (5x, should be exactly at max)
      handlePinchMove(createTwoFingerTouchEvent(0, 0, 500, 0));
      vi.advanceTimersByTime(20);

      expect(onZoomChange).toHaveBeenCalledWith(5.0);
    });

    it('handles minZoom equal to maxZoom', () => {
      const onZoomChange = vi.fn();
      const { handlePinchStart, handlePinchMove } = usePinchZoom({
        onZoomChange,
        minZoom: 1.5,
        maxZoom: 1.5,
      });

      // Start with fingers 100px apart
      handlePinchStart(createTwoFingerTouchEvent(0, 0, 100, 0), 1.0);

      // Any movement should result in 1.5
      handlePinchMove(createTwoFingerTouchEvent(0, 0, 500, 0));
      vi.advanceTimersByTime(20);

      expect(onZoomChange).toHaveBeenCalledWith(1.5);
    });
  });

  describe('debouncing', () => {
    it('debounces zoom updates for performance', () => {
      const onZoomChange = vi.fn();
      const { handlePinchStart, handlePinchMove } = usePinchZoom({ onZoomChange });

      handlePinchStart(createTwoFingerTouchEvent(0, 0, 100, 0), 1.0);

      // Multiple rapid moves
      handlePinchMove(createTwoFingerTouchEvent(0, 0, 150, 0));
      handlePinchMove(createTwoFingerTouchEvent(0, 0, 160, 0));
      handlePinchMove(createTwoFingerTouchEvent(0, 0, 170, 0));

      // Before timer fires, no updates
      expect(onZoomChange).not.toHaveBeenCalled();

      // After 16ms, should fire once with latest value
      vi.advanceTimersByTime(20);

      expect(onZoomChange).toHaveBeenCalledTimes(1);
      expect(onZoomChange).toHaveBeenCalledWith(1.7);
    });

    it('ignores zoom changes smaller than 0.02', () => {
      const onZoomChange = vi.fn();
      const { handlePinchStart, handlePinchMove } = usePinchZoom({ onZoomChange });

      handlePinchStart(createTwoFingerTouchEvent(0, 0, 100, 0), 1.0);

      // Move slightly - less than 2% change (101px = 1.01x zoom)
      handlePinchMove(createTwoFingerTouchEvent(0, 0, 101, 0));
      vi.advanceTimersByTime(20);

      expect(onZoomChange).not.toHaveBeenCalled();
    });

    it('triggers update when zoom change exceeds 0.02', () => {
      const onZoomChange = vi.fn();
      const { handlePinchStart, handlePinchMove } = usePinchZoom({ onZoomChange });

      handlePinchStart(createTwoFingerTouchEvent(0, 0, 100, 0), 1.0);

      // Move enough to exceed threshold (103px = 1.03x zoom, > 0.02 change)
      handlePinchMove(createTwoFingerTouchEvent(0, 0, 103, 0));
      vi.advanceTimersByTime(20);

      expect(onZoomChange).toHaveBeenCalledTimes(1);
    });
  });

  describe('handlePinchEnd', () => {
    it('applies final zoom when pinch ends', () => {
      const onZoomChange = vi.fn();
      const { handlePinchStart, handlePinchMove, handlePinchEnd } = usePinchZoom({
        onZoomChange,
      });

      handlePinchStart(createTwoFingerTouchEvent(0, 0, 100, 0), 1.0);
      handlePinchMove(createTwoFingerTouchEvent(0, 0, 150, 0));
      vi.advanceTimersByTime(20);

      onZoomChange.mockClear();

      // End with one finger lifted (single touch remaining)
      handlePinchEnd(createSingleFingerTouchEvent(0, 0));

      expect(onZoomChange).toHaveBeenCalledWith(1.5);
    });

    it('does not apply final zoom if zoom did not change', () => {
      const onZoomChange = vi.fn();
      const { handlePinchStart, handlePinchEnd } = usePinchZoom({ onZoomChange });

      handlePinchStart(createTwoFingerTouchEvent(0, 0, 100, 0), 1.0);
      // No move, zoom stayed at initial value

      handlePinchEnd(createSingleFingerTouchEvent(0, 0));

      expect(onZoomChange).not.toHaveBeenCalled();
    });

    it('resets pinch state when all fingers lifted', () => {
      const onZoomChange = vi.fn();
      const { handlePinchStart, handlePinchMove, handlePinchEnd } = usePinchZoom({
        onZoomChange,
      });

      // First pinch
      handlePinchStart(createTwoFingerTouchEvent(0, 0, 100, 0), 1.0);
      handlePinchMove(createTwoFingerTouchEvent(0, 0, 150, 0));
      vi.advanceTimersByTime(20);
      handlePinchEnd(createZeroTouchEvent());

      // handlePinchEnd calls onZoomChange with final zoom
      expect(onZoomChange).toHaveBeenLastCalledWith(1.5);

      onZoomChange.mockClear();

      // Attempt to move without new pinch start - should do nothing
      // because initialDistance.current was reset to null
      handlePinchMove(createTwoFingerTouchEvent(0, 0, 200, 0));
      vi.advanceTimersByTime(20);

      expect(onZoomChange).not.toHaveBeenCalled();
    });

    it('does not reset state when two fingers remain', () => {
      const onZoomChange = vi.fn();
      const { handlePinchStart, handlePinchMove, handlePinchEnd } = usePinchZoom({
        onZoomChange,
      });

      handlePinchStart(createTwoFingerTouchEvent(0, 0, 100, 0), 1.0);
      handlePinchMove(createTwoFingerTouchEvent(0, 0, 150, 0));
      vi.advanceTimersByTime(20);

      // "End" with 2 fingers still touching (like a third finger being lifted)
      handlePinchEnd(createTwoFingerTouchEvent(0, 0, 150, 0));

      onZoomChange.mockClear();

      // Continue pinching should still work
      handlePinchMove(createTwoFingerTouchEvent(0, 0, 200, 0));
      vi.advanceTimersByTime(20);

      expect(onZoomChange).toHaveBeenCalled();
    });
  });

  describe('enabled state', () => {
    it('does not process pinch when disabled', () => {
      const onZoomChange = vi.fn();
      const { handlePinchStart, handlePinchMove, handlePinchEnd } = usePinchZoom({
        onZoomChange,
        enabled: false,
      });

      handlePinchStart(createTwoFingerTouchEvent(0, 0, 100, 0), 1.0);
      handlePinchMove(createTwoFingerTouchEvent(0, 0, 200, 0));
      vi.advanceTimersByTime(20);
      handlePinchEnd(createSingleFingerTouchEvent(0, 0));

      expect(onZoomChange).not.toHaveBeenCalled();
    });

    it('works when enabled is explicitly true', () => {
      const onZoomChange = vi.fn();
      const { handlePinchStart, handlePinchMove, handlePinchEnd } = usePinchZoom({
        onZoomChange,
        enabled: true,
      });

      handlePinchStart(createTwoFingerTouchEvent(0, 0, 100, 0), 1.0);
      handlePinchMove(createTwoFingerTouchEvent(0, 0, 200, 0));
      vi.advanceTimersByTime(20);
      handlePinchEnd(createSingleFingerTouchEvent(0, 0));

      expect(onZoomChange).toHaveBeenCalled();
    });

    it('defaults to enabled when not specified', () => {
      const onZoomChange = vi.fn();
      const { handlePinchStart, handlePinchMove } = usePinchZoom({ onZoomChange });

      handlePinchStart(createTwoFingerTouchEvent(0, 0, 100, 0), 1.0);
      handlePinchMove(createTwoFingerTouchEvent(0, 0, 200, 0));
      vi.advanceTimersByTime(20);

      expect(onZoomChange).toHaveBeenCalled();
    });

    it('ignores move when disabled even if started when enabled', () => {
      const onZoomChange = vi.fn();

      // Start enabled
      const { handlePinchStart } = usePinchZoom({
        onZoomChange,
        enabled: true,
      });
      handlePinchStart(createTwoFingerTouchEvent(0, 0, 100, 0), 1.0);

      // Create new hook with disabled state
      resetMockState();
      const { handlePinchMove } = usePinchZoom({
        onZoomChange,
        enabled: false,
      });

      // Move is ignored because hook is disabled
      handlePinchMove(createTwoFingerTouchEvent(0, 0, 200, 0));
      vi.advanceTimersByTime(20);

      expect(onZoomChange).not.toHaveBeenCalled();
    });
  });

  describe('edge cases', () => {
    it('handles zero initial distance gracefully', () => {
      const onZoomChange = vi.fn();
      const { handlePinchStart, handlePinchMove } = usePinchZoom({ onZoomChange });

      // Both fingers at same position (0 distance)
      handlePinchStart(createTwoFingerTouchEvent(100, 100, 100, 100), 1.0);
      handlePinchMove(createTwoFingerTouchEvent(50, 100, 150, 100));
      vi.advanceTimersByTime(20);

      // Should result in Infinity zoom, but clamped to maxZoom
      expect(onZoomChange).toHaveBeenCalledWith(3.0);
    });

    it('handles negative coordinates', () => {
      const onZoomChange = vi.fn();
      const { handlePinchStart, handlePinchMove } = usePinchZoom({ onZoomChange });

      handlePinchStart(createTwoFingerTouchEvent(-100, -100, 0, -100), 1.0);
      handlePinchMove(createTwoFingerTouchEvent(-200, -100, 0, -100));
      vi.advanceTimersByTime(20);

      expect(onZoomChange).toHaveBeenCalledWith(2.0);
    });

    it('handles very small distances', () => {
      const onZoomChange = vi.fn();
      const { handlePinchStart, handlePinchMove } = usePinchZoom({ onZoomChange });

      handlePinchStart(createTwoFingerTouchEvent(0, 0, 1, 0), 1.0);
      handlePinchMove(createTwoFingerTouchEvent(0, 0, 2, 0));
      vi.advanceTimersByTime(20);

      expect(onZoomChange).toHaveBeenCalledWith(2.0);
    });

    it('handles very large distances', () => {
      const onZoomChange = vi.fn();
      const { handlePinchStart, handlePinchMove } = usePinchZoom({ onZoomChange });

      handlePinchStart(createTwoFingerTouchEvent(0, 0, 1000, 0), 1.0);
      handlePinchMove(createTwoFingerTouchEvent(0, 0, 2000, 0));
      vi.advanceTimersByTime(20);

      expect(onZoomChange).toHaveBeenCalledWith(2.0);
    });

    it('handles handlePinchMove before handlePinchStart', () => {
      const onZoomChange = vi.fn();
      const { handlePinchMove } = usePinchZoom({ onZoomChange });

      // Move without start - should be a no-op
      expect(() => {
        handlePinchMove(createTwoFingerTouchEvent(0, 0, 200, 0));
        vi.advanceTimersByTime(20);
      }).not.toThrow();

      expect(onZoomChange).not.toHaveBeenCalled();
    });

    it('handles handlePinchEnd before handlePinchStart', () => {
      const onZoomChange = vi.fn();
      const { handlePinchEnd } = usePinchZoom({ onZoomChange });

      // End without start - should be a no-op
      expect(() => {
        handlePinchEnd(createSingleFingerTouchEvent(0, 0));
      }).not.toThrow();

      expect(onZoomChange).not.toHaveBeenCalled();
    });

    it('handles decimal coordinates', () => {
      const onZoomChange = vi.fn();
      const { handlePinchStart, handlePinchMove } = usePinchZoom({ onZoomChange });

      handlePinchStart(createTwoFingerTouchEvent(0.5, 0.5, 100.5, 0.5), 1.0);
      handlePinchMove(createTwoFingerTouchEvent(0.5, 0.5, 200.5, 0.5));
      vi.advanceTimersByTime(20);

      expect(onZoomChange).toHaveBeenCalledWith(2.0);
    });
  });

  describe('multiple pinch gestures', () => {
    it('can perform multiple sequential pinch gestures', () => {
      const onZoomChange = vi.fn();
      const { handlePinchStart, handlePinchMove, handlePinchEnd } = usePinchZoom({
        onZoomChange,
      });

      // First pinch: 1.0 -> 1.5
      handlePinchStart(createTwoFingerTouchEvent(0, 0, 100, 0), 1.0);
      handlePinchMove(createTwoFingerTouchEvent(0, 0, 150, 0));
      vi.advanceTimersByTime(20);
      handlePinchEnd(createSingleFingerTouchEvent(0, 0));

      expect(onZoomChange).toHaveBeenLastCalledWith(1.5);

      onZoomChange.mockClear();

      // Second pinch: 1.5 -> 2.25
      handlePinchStart(createTwoFingerTouchEvent(0, 0, 100, 0), 1.5);
      handlePinchMove(createTwoFingerTouchEvent(0, 0, 150, 0));
      vi.advanceTimersByTime(20);
      handlePinchEnd(createSingleFingerTouchEvent(0, 0));

      expect(onZoomChange).toHaveBeenLastCalledWith(2.25);
    });

    it('starts fresh after previous pinch ends', () => {
      const onZoomChange = vi.fn();
      const { handlePinchStart, handlePinchMove, handlePinchEnd } = usePinchZoom({
        onZoomChange,
      });

      // First pinch with 100px initial distance
      handlePinchStart(createTwoFingerTouchEvent(0, 0, 100, 0), 1.0);
      handlePinchMove(createTwoFingerTouchEvent(0, 0, 200, 0));
      vi.advanceTimersByTime(20);
      handlePinchEnd(createZeroTouchEvent());

      onZoomChange.mockClear();

      // Second pinch with different initial distance (50px)
      handlePinchStart(createTwoFingerTouchEvent(0, 0, 50, 0), 2.0);
      handlePinchMove(createTwoFingerTouchEvent(0, 0, 100, 0));
      vi.advanceTimersByTime(20);

      // Should be 2x relative to new initial distance
      // 100/50 = 2, so 2.0 * 2 = 4.0, clamped to 3.0
      expect(onZoomChange).toHaveBeenCalledWith(3.0);
    });
  });

  describe('rapid movements', () => {
    it('handles rapid successive movements correctly', () => {
      const onZoomChange = vi.fn();
      const { handlePinchStart, handlePinchMove } = usePinchZoom({ onZoomChange });

      handlePinchStart(createTwoFingerTouchEvent(0, 0, 100, 0), 1.0);

      // Simulate rapid movements
      for (let i = 110; i <= 200; i += 10) {
        handlePinchMove(createTwoFingerTouchEvent(0, 0, i, 0));
      }

      vi.advanceTimersByTime(20);

      // Should end up at final position
      expect(onZoomChange).toHaveBeenLastCalledWith(2.0);
    });
  });
});
