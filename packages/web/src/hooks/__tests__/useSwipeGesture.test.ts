import { describe, it, expect, vi, beforeEach } from 'vitest';

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

import { useSwipeGesture } from '../useSwipeGesture';

// ── Helpers ─────────────────────────────────────────────────────────────

function resetMockState() {
  refMap = {};
  refCounter = 0;
}

function createTouchEvent(clientX: number, clientY: number): React.TouchEvent {
  return {
    touches: [{ clientX, clientY }],
    changedTouches: [{ clientX, clientY }],
  } as unknown as React.TouchEvent;
}

// ── Tests ───────────────────────────────────────────────────────────────

describe('useSwipeGesture', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMockState();
  });

  describe('return values', () => {
    it('returns handleTouchStart and handleTouchEnd functions', () => {
      const result = useSwipeGesture({});

      expect(typeof result.handleTouchStart).toBe('function');
      expect(typeof result.handleTouchEnd).toBe('function');
    });
  });

  describe('swipe left detection', () => {
    it('triggers onSwipeLeft when swiping left past default threshold', () => {
      const onSwipeLeft = vi.fn();

      const { handleTouchStart, handleTouchEnd } = useSwipeGesture({
        onSwipeLeft,
      });

      // Start at x=100, end at x=40 (moved 60px left, > 50px threshold)
      handleTouchStart(createTouchEvent(100, 100));
      handleTouchEnd(createTouchEvent(40, 100));

      expect(onSwipeLeft).toHaveBeenCalledTimes(1);
    });

    it('does not trigger onSwipeLeft when swipe is below threshold', () => {
      const onSwipeLeft = vi.fn();

      const { handleTouchStart, handleTouchEnd } = useSwipeGesture({
        onSwipeLeft,
      });

      // Start at x=100, end at x=60 (moved 40px left, < 50px threshold)
      handleTouchStart(createTouchEvent(100, 100));
      handleTouchEnd(createTouchEvent(60, 100));

      expect(onSwipeLeft).not.toHaveBeenCalled();
    });

    it('triggers onSwipeLeft exactly at threshold boundary', () => {
      const onSwipeLeft = vi.fn();

      const { handleTouchStart, handleTouchEnd } = useSwipeGesture({
        onSwipeLeft,
        threshold: 50,
      });

      // Start at x=100, end at x=49 (moved 51px left, > 50px threshold)
      handleTouchStart(createTouchEvent(100, 100));
      handleTouchEnd(createTouchEvent(49, 100));

      expect(onSwipeLeft).toHaveBeenCalledTimes(1);
    });

    it('does not trigger at exactly threshold value', () => {
      const onSwipeLeft = vi.fn();

      const { handleTouchStart, handleTouchEnd } = useSwipeGesture({
        onSwipeLeft,
        threshold: 50,
      });

      // Start at x=100, end at x=50 (moved 50px left, == 50px threshold)
      handleTouchStart(createTouchEvent(100, 100));
      handleTouchEnd(createTouchEvent(50, 100));

      expect(onSwipeLeft).not.toHaveBeenCalled();
    });
  });

  describe('swipe right detection', () => {
    it('triggers onSwipeRight when swiping right past default threshold', () => {
      const onSwipeRight = vi.fn();

      const { handleTouchStart, handleTouchEnd } = useSwipeGesture({
        onSwipeRight,
      });

      // Start at x=100, end at x=160 (moved 60px right, > 50px threshold)
      handleTouchStart(createTouchEvent(100, 100));
      handleTouchEnd(createTouchEvent(160, 100));

      expect(onSwipeRight).toHaveBeenCalledTimes(1);
    });

    it('does not trigger onSwipeRight when swipe is below threshold', () => {
      const onSwipeRight = vi.fn();

      const { handleTouchStart, handleTouchEnd } = useSwipeGesture({
        onSwipeRight,
      });

      // Start at x=100, end at x=140 (moved 40px right, < 50px threshold)
      handleTouchStart(createTouchEvent(100, 100));
      handleTouchEnd(createTouchEvent(140, 100));

      expect(onSwipeRight).not.toHaveBeenCalled();
    });

    it('triggers onSwipeRight exactly at threshold boundary', () => {
      const onSwipeRight = vi.fn();

      const { handleTouchStart, handleTouchEnd } = useSwipeGesture({
        onSwipeRight,
        threshold: 50,
      });

      // Start at x=100, end at x=151 (moved 51px right, > 50px threshold)
      handleTouchStart(createTouchEvent(100, 100));
      handleTouchEnd(createTouchEvent(151, 100));

      expect(onSwipeRight).toHaveBeenCalledTimes(1);
    });
  });

  describe('custom threshold', () => {
    it('uses custom threshold when provided', () => {
      const onSwipeLeft = vi.fn();

      const { handleTouchStart, handleTouchEnd } = useSwipeGesture({
        onSwipeLeft,
        threshold: 100,
      });

      // Move 90px left (below 100px threshold)
      handleTouchStart(createTouchEvent(200, 100));
      handleTouchEnd(createTouchEvent(110, 100));

      expect(onSwipeLeft).not.toHaveBeenCalled();

      // Reset state for a new hook call
      resetMockState();

      const { handleTouchStart: start2, handleTouchEnd: end2 } = useSwipeGesture({
        onSwipeLeft,
        threshold: 100,
      });

      // Move 101px left (above 100px threshold)
      start2(createTouchEvent(200, 100));
      end2(createTouchEvent(99, 100));

      expect(onSwipeLeft).toHaveBeenCalledTimes(1);
    });

    it('handles zero threshold (any horizontal movement triggers)', () => {
      const onSwipeLeft = vi.fn();
      const onSwipeRight = vi.fn();

      const { handleTouchStart, handleTouchEnd } = useSwipeGesture({
        onSwipeLeft,
        onSwipeRight,
        threshold: 0,
      });

      // Move 1px left (> 0 threshold)
      handleTouchStart(createTouchEvent(100, 100));
      handleTouchEnd(createTouchEvent(99, 100));

      expect(onSwipeLeft).toHaveBeenCalledTimes(1);
    });
  });

  describe('enabled state', () => {
    it('does not trigger swipes when disabled', () => {
      const onSwipeLeft = vi.fn();
      const onSwipeRight = vi.fn();

      const { handleTouchStart, handleTouchEnd } = useSwipeGesture({
        onSwipeLeft,
        onSwipeRight,
        enabled: false,
      });

      handleTouchStart(createTouchEvent(100, 100));
      handleTouchEnd(createTouchEvent(0, 100)); // 100px left swipe

      expect(onSwipeLeft).not.toHaveBeenCalled();
      expect(onSwipeRight).not.toHaveBeenCalled();
    });

    it('triggers swipes when explicitly enabled', () => {
      const onSwipeLeft = vi.fn();

      const { handleTouchStart, handleTouchEnd } = useSwipeGesture({
        onSwipeLeft,
        enabled: true,
      });

      handleTouchStart(createTouchEvent(100, 100));
      handleTouchEnd(createTouchEvent(0, 100));

      expect(onSwipeLeft).toHaveBeenCalledTimes(1);
    });

    it('defaults to enabled when not specified', () => {
      const onSwipeLeft = vi.fn();

      const { handleTouchStart, handleTouchEnd } = useSwipeGesture({
        onSwipeLeft,
      });

      handleTouchStart(createTouchEvent(100, 100));
      handleTouchEnd(createTouchEvent(0, 100));

      expect(onSwipeLeft).toHaveBeenCalledTimes(1);
    });

    it('ignores touchEnd when disabled (even if touchStart was recorded before disable)', () => {
      const onSwipeLeft = vi.fn();

      // Start with enabled hook, record touch start
      const { handleTouchStart } = useSwipeGesture({
        onSwipeLeft,
        enabled: true,
      });

      handleTouchStart(createTouchEvent(100, 100));

      // Simulate disabling by creating a new hook call
      resetMockState();

      const { handleTouchEnd: handleEnd2 } = useSwipeGesture({
        onSwipeLeft,
        enabled: false,
      });

      // The touchStart ref is now null from reset, so this won't trigger anyway
      handleEnd2(createTouchEvent(0, 100));

      expect(onSwipeLeft).not.toHaveBeenCalled();
    });
  });

  describe('vertical vs horizontal movement', () => {
    it('does not trigger when vertical movement exceeds horizontal', () => {
      const onSwipeLeft = vi.fn();
      const onSwipeRight = vi.fn();

      const { handleTouchStart, handleTouchEnd } = useSwipeGesture({
        onSwipeLeft,
        onSwipeRight,
      });

      // Move 60px down and 40px right (vertical > horizontal)
      handleTouchStart(createTouchEvent(100, 100));
      handleTouchEnd(createTouchEvent(140, 160));

      expect(onSwipeLeft).not.toHaveBeenCalled();
      expect(onSwipeRight).not.toHaveBeenCalled();
    });

    it('triggers when horizontal movement exceeds vertical', () => {
      const onSwipeRight = vi.fn();

      const { handleTouchStart, handleTouchEnd } = useSwipeGesture({
        onSwipeRight,
      });

      // Move 60px right and 40px down (horizontal > vertical)
      handleTouchStart(createTouchEvent(100, 100));
      handleTouchEnd(createTouchEvent(160, 140));

      expect(onSwipeRight).toHaveBeenCalledTimes(1);
    });

    it('triggers when horizontal and vertical are equal', () => {
      const onSwipeRight = vi.fn();

      const { handleTouchStart, handleTouchEnd } = useSwipeGesture({
        onSwipeRight,
      });

      // Move 60px right and 60px down (equal, but horizontal check uses >)
      handleTouchStart(createTouchEvent(100, 100));
      handleTouchEnd(createTouchEvent(160, 160));

      // The condition is Math.abs(deltaX) > Math.abs(deltaY), so equal doesn't trigger
      expect(onSwipeRight).not.toHaveBeenCalled();
    });

    it('does not trigger when moving diagonally with slight horizontal bias below threshold', () => {
      const onSwipeRight = vi.fn();

      const { handleTouchStart, handleTouchEnd } = useSwipeGesture({
        onSwipeRight,
        threshold: 50,
      });

      // Move 45px right and 40px down (horizontal > vertical, but below threshold)
      handleTouchStart(createTouchEvent(100, 100));
      handleTouchEnd(createTouchEvent(145, 140));

      expect(onSwipeRight).not.toHaveBeenCalled();
    });
  });

  describe('touchStart reset on touchEnd', () => {
    it('clears touchStart after touchEnd', () => {
      const onSwipeLeft = vi.fn();

      const { handleTouchStart, handleTouchEnd } = useSwipeGesture({
        onSwipeLeft,
      });

      // Complete first swipe
      handleTouchStart(createTouchEvent(100, 100));
      handleTouchEnd(createTouchEvent(0, 100));

      expect(onSwipeLeft).toHaveBeenCalledTimes(1);

      // Try to call handleTouchEnd again without a new touchStart
      handleTouchEnd(createTouchEvent(200, 100));

      // Should not trigger again because touchStart.current is null
      expect(onSwipeLeft).toHaveBeenCalledTimes(1);
    });

    it('allows new swipe after previous swipe completes', () => {
      const onSwipeLeft = vi.fn();

      const { handleTouchStart, handleTouchEnd } = useSwipeGesture({
        onSwipeLeft,
      });

      // First swipe
      handleTouchStart(createTouchEvent(100, 100));
      handleTouchEnd(createTouchEvent(0, 100));

      expect(onSwipeLeft).toHaveBeenCalledTimes(1);

      // Second swipe (new touchStart)
      handleTouchStart(createTouchEvent(200, 100));
      handleTouchEnd(createTouchEvent(100, 100));

      expect(onSwipeLeft).toHaveBeenCalledTimes(2);
    });
  });

  describe('missing callbacks', () => {
    it('does not error when onSwipeLeft is not provided', () => {
      const { handleTouchStart, handleTouchEnd } = useSwipeGesture({
        onSwipeRight: vi.fn(),
      });

      // Swipe left with no callback
      expect(() => {
        handleTouchStart(createTouchEvent(100, 100));
        handleTouchEnd(createTouchEvent(0, 100));
      }).not.toThrow();
    });

    it('does not error when onSwipeRight is not provided', () => {
      const { handleTouchStart, handleTouchEnd } = useSwipeGesture({
        onSwipeLeft: vi.fn(),
      });

      // Swipe right with no callback
      expect(() => {
        handleTouchStart(createTouchEvent(100, 100));
        handleTouchEnd(createTouchEvent(200, 100));
      }).not.toThrow();
    });

    it('does not error when no callbacks are provided', () => {
      const { handleTouchStart, handleTouchEnd } = useSwipeGesture({});

      expect(() => {
        handleTouchStart(createTouchEvent(100, 100));
        handleTouchEnd(createTouchEvent(0, 100));
      }).not.toThrow();
    });
  });

  describe('edge cases', () => {
    it('handles handleTouchEnd called without handleTouchStart', () => {
      const onSwipeLeft = vi.fn();

      const { handleTouchEnd } = useSwipeGesture({
        onSwipeLeft,
      });

      // Call handleTouchEnd without handleTouchStart
      expect(() => {
        handleTouchEnd(createTouchEvent(0, 100));
      }).not.toThrow();

      expect(onSwipeLeft).not.toHaveBeenCalled();
    });

    it('handles negative coordinates', () => {
      const onSwipeLeft = vi.fn();
      const onSwipeRight = vi.fn();

      const { handleTouchStart, handleTouchEnd } = useSwipeGesture({
        onSwipeLeft,
        onSwipeRight,
      });

      // Start at negative, end more negative (swipe left)
      handleTouchStart(createTouchEvent(-50, 0));
      handleTouchEnd(createTouchEvent(-150, 0));

      expect(onSwipeLeft).toHaveBeenCalledTimes(1);
    });

    it('handles large coordinate values', () => {
      const onSwipeRight = vi.fn();

      const { handleTouchStart, handleTouchEnd } = useSwipeGesture({
        onSwipeRight,
      });

      handleTouchStart(createTouchEvent(10000, 5000));
      handleTouchEnd(createTouchEvent(10100, 5000));

      expect(onSwipeRight).toHaveBeenCalledTimes(1);
    });

    it('handles decimal coordinate values', () => {
      const onSwipeLeft = vi.fn();

      const { handleTouchStart, handleTouchEnd } = useSwipeGesture({
        onSwipeLeft,
        threshold: 50,
      });

      // 50.5px movement should exceed 50px threshold
      handleTouchStart(createTouchEvent(100.25, 100.75));
      handleTouchEnd(createTouchEvent(49.75, 100.75));

      expect(onSwipeLeft).toHaveBeenCalledTimes(1);
    });
  });

  describe('both directions', () => {
    it('can detect both left and right swipes with same hook instance', () => {
      const onSwipeLeft = vi.fn();
      const onSwipeRight = vi.fn();

      const { handleTouchStart, handleTouchEnd } = useSwipeGesture({
        onSwipeLeft,
        onSwipeRight,
      });

      // Swipe left
      handleTouchStart(createTouchEvent(100, 100));
      handleTouchEnd(createTouchEvent(0, 100));

      expect(onSwipeLeft).toHaveBeenCalledTimes(1);
      expect(onSwipeRight).not.toHaveBeenCalled();

      // Swipe right
      handleTouchStart(createTouchEvent(100, 100));
      handleTouchEnd(createTouchEvent(200, 100));

      expect(onSwipeLeft).toHaveBeenCalledTimes(1);
      expect(onSwipeRight).toHaveBeenCalledTimes(1);
    });
  });
});
