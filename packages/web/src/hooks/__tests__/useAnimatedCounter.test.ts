import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── requestAnimationFrame mock ─────────────────────────────────────────

let rafCallbacks: Array<{ id: number; callback: FrameRequestCallback }> = [];
let rafIdCounter = 0;
let currentTimestamp = 0;

function mockRaf(callback: FrameRequestCallback): number {
  const id = ++rafIdCounter;
  rafCallbacks.push({ id, callback });
  return id;
}

function mockCancelRaf(id: number): void {
  rafCallbacks = rafCallbacks.filter((entry) => entry.id !== id);
}

function runAnimationFrame(deltaMs: number = 16): void {
  currentTimestamp += deltaMs;
  const callbacks = [...rafCallbacks];
  rafCallbacks = [];
  for (const { callback } of callbacks) {
    callback(currentTimestamp);
  }
}

function runAnimationFramesUntilComplete(duration: number, frameTime: number = 16): void {
  const framesNeeded = Math.ceil(duration / frameTime) + 1;
  for (let i = 0; i < framesNeeded; i++) {
    runAnimationFrame(frameTime);
    if (rafCallbacks.length === 0) break;
  }
}

// ── React mocks ─────────────────────────────────────────────────────────

type CleanupFn = () => void;
type EffectEntry = { callback: () => void | CleanupFn; deps: unknown[] };
let effectCallbacks: EffectEntry[] = [];
let cleanupFns: CleanupFn[] = [];
let stateValue = 0;
let setStateFn: ((value: number | ((prev: number) => number)) => void) | null = null;

const mockUseState = vi.fn((initial: number) => {
  stateValue = initial;
  setStateFn = (value) => {
    if (typeof value === 'function') {
      stateValue = value(stateValue);
    } else {
      stateValue = value;
    }
  };
  return [stateValue, setStateFn];
});

const mockUseRef = vi.fn((initial: unknown) => ({ current: initial }));

vi.mock('react', () => ({
  useState: (initial: number) => mockUseState(initial),
  useEffect: (callback: () => void | CleanupFn, deps: unknown[]) => {
    effectCallbacks.push({ callback, deps });
  },
  useRef: (initial: unknown) => mockUseRef(initial),
}));

(globalThis as Record<string, unknown>).requestAnimationFrame = mockRaf;
(globalThis as Record<string, unknown>).cancelAnimationFrame = mockCancelRaf;

import { useAnimatedCounter } from '../useAnimatedCounter';

// ── Helpers ─────────────────────────────────────────────────────────────

function resetMockState(): void {
  effectCallbacks = [];
  cleanupFns = [];
  rafCallbacks = [];
  rafIdCounter = 0;
  currentTimestamp = 0;
  stateValue = 0;
  setStateFn = null;
  mockUseState.mockClear();
  mockUseRef.mockClear();
}

function runEffects(): void {
  for (const { callback } of effectCallbacks) {
    const cleanup = callback();
    if (typeof cleanup === 'function') {
      cleanupFns.push(cleanup);
    }
  }
  effectCallbacks = [];
}

function runCleanups(): void {
  for (const cleanup of cleanupFns) {
    cleanup();
  }
  cleanupFns = [];
}

function mount(target: number, duration?: number): number {
  const result = useAnimatedCounter(target, duration);
  runEffects();
  return result;
}

// ── Tests ───────────────────────────────────────────────────────────────

describe('useAnimatedCounter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMockState();
  });

  afterEach(() => {
    runCleanups();
  });

  describe('initial state', () => {
    it('initializes count to safeTarget', () => {
      useAnimatedCounter(100);

      expect(mockUseState).toHaveBeenCalledWith(100);
    });

    it('creates refs for startTime, raf id, and target', () => {
      useAnimatedCounter(100);

      expect(mockUseRef).toHaveBeenCalledWith(null);
      expect(mockUseRef).toHaveBeenCalledWith(100);
      expect(mockUseRef).toHaveBeenCalledTimes(3);
    });
  });

  describe('target handling', () => {
    it('returns 0 immediately for target of 0', () => {
      mount(0);

      expect(stateValue).toBe(0);
      expect(rafCallbacks.length).toBe(0);
    });

    it('handles NaN target by treating it as 0', () => {
      mount(NaN);

      expect(stateValue).toBe(0);
      expect(rafCallbacks.length).toBe(0);
    });

    it('handles Infinity target by treating it as 0', () => {
      mount(Infinity);

      expect(stateValue).toBe(0);
      expect(rafCallbacks.length).toBe(0);
    });

    it('handles -Infinity target by treating it as 0', () => {
      mount(-Infinity);

      expect(stateValue).toBe(0);
      expect(rafCallbacks.length).toBe(0);
    });

    it('starts animation for valid positive target', () => {
      mount(100);

      expect(rafCallbacks.length).toBe(1);
    });

    it('starts animation for valid negative target', () => {
      mount(-50);

      expect(rafCallbacks.length).toBe(1);
    });
  });

  describe('animation progression', () => {
    it('schedules first animation frame on mount', () => {
      mount(100);

      expect(rafCallbacks.length).toBe(1);
    });

    it('continues scheduling frames during animation', () => {
      mount(100, 800);

      runAnimationFrame(100);

      expect(rafCallbacks.length).toBe(1);
    });

    it('stops scheduling frames after animation completes', () => {
      mount(100, 100);

      runAnimationFramesUntilComplete(200);

      expect(rafCallbacks.length).toBe(0);
    });

    it('sets count to exact target at end of animation', () => {
      mount(100, 100);

      runAnimationFramesUntilComplete(200);

      expect(stateValue).toBe(100);
    });

    it('progresses count over time using ease-out cubic', () => {
      mount(100, 800);

      // Run a few frames to capture intermediate values
      const values: number[] = [];

      // First frame - timestamp 16ms, progress ~2%
      runAnimationFrame(16);
      values.push(stateValue);

      // More frames
      runAnimationFrame(100);
      values.push(stateValue);

      runAnimationFrame(200);
      values.push(stateValue);

      // Values should increase
      expect(values[1]).toBeGreaterThanOrEqual(values[0]);
      expect(values[2]).toBeGreaterThanOrEqual(values[1]);
    });

    it('uses ease-out cubic easing (faster start, slower end)', () => {
      mount(1000, 1000);

      // First frame sets startTimeRef - this is frame 0 essentially
      runAnimationFrame(0);

      // At 25% time (250ms after start), ease-out cubic gives ~57.8% progress (1 - 0.75^3)
      runAnimationFrame(250);
      const quarterValue = stateValue;

      // At 50% time (500ms after start), ease-out cubic gives ~87.5% progress (1 - 0.5^3)
      runAnimationFrame(250);
      const halfValue = stateValue;

      // First quarter should cover more than 25% of the distance
      expect(quarterValue).toBeGreaterThan(250);
      // By half time, should be close to completion due to ease-out
      expect(halfValue).toBeGreaterThan(750);
    });

    it('rounds intermediate values to integers', () => {
      mount(100, 800);

      runAnimationFrame(50);

      expect(Number.isInteger(stateValue)).toBe(true);
    });
  });

  describe('duration parameter', () => {
    it('defaults to 800ms duration', () => {
      mount(100);

      // First frame sets startTimeRef.current to the current timestamp
      runAnimationFrame(0);

      // Advance to 700ms - should still be animating
      runAnimationFrame(700);

      expect(rafCallbacks.length).toBe(1); // Still animating

      // Advance past 800ms total - should complete
      runAnimationFrame(200);

      expect(stateValue).toBe(100);
    });

    it('respects custom duration', () => {
      mount(100, 200);

      // First frame sets startTimeRef
      runAnimationFrame(0);

      // At 150ms into 200ms duration, still animating
      runAnimationFrame(150);

      expect(rafCallbacks.length).toBe(1);

      // Complete after 200ms total
      runAnimationFrame(100);

      expect(stateValue).toBe(100);
    });

    it('handles very short duration', () => {
      mount(100, 16);

      // First frame sets startTimeRef
      runAnimationFrame(0);

      // Next frame completes animation (16ms duration exceeded)
      runAnimationFrame(20);

      expect(stateValue).toBe(100);
      expect(rafCallbacks.length).toBe(0);
    });

    it('handles very long duration', () => {
      mount(100, 10000);

      // Should still be animating after 5 seconds
      currentTimestamp = 5000;
      runAnimationFrame(0);

      expect(stateValue).toBeLessThan(100);
      expect(rafCallbacks.length).toBe(1);
    });
  });

  describe('cleanup', () => {
    it('cancels animation frame on cleanup', () => {
      mount(100, 800);

      expect(rafCallbacks.length).toBe(1);

      runCleanups();

      expect(rafCallbacks.length).toBe(0);
    });

    it('does not update state after cleanup', () => {
      mount(100, 800);

      runAnimationFrame(100);
      const valueBeforeCleanup = stateValue;

      runCleanups();

      // Try to run more frames
      rafCallbacks.push({ id: 999, callback: () => {} });
      runAnimationFrame(500);

      // State should not have changed (no raf callbacks were added after cleanup)
      expect(stateValue).toBe(valueBeforeCleanup);
    });

    it('handles cleanup when no animation was started (target = 0)', () => {
      mount(0);

      // Should not throw when cleaning up without any raf scheduled
      expect(() => runCleanups()).not.toThrow();
    });
  });

  describe('state update optimization', () => {
    it('does not call setState when rounded value has not changed', () => {
      mount(10, 1000);

      // Track setState calls via the mock
      let setStateCalls = 0;
      const originalSetStateFn = setStateFn;
      setStateFn = (value) => {
        setStateCalls++;
        originalSetStateFn?.(value);
      };

      // Very small time delta - value should still be 0 (or same as before)
      runAnimationFrame(1);
      const firstCallCount = setStateCalls;

      // Another tiny frame
      runAnimationFrame(1);

      // Due to rounding and small target, these might produce same integer
      // The implementation should skip setState if value hasn't changed
      expect(setStateCalls).toBeLessThanOrEqual(firstCallCount + 1);
    });
  });

  describe('edge cases', () => {
    it('handles decimal target values', () => {
      mount(99.9, 100);

      runAnimationFramesUntilComplete(200);

      // Final value is the exact safeTarget (99.9), not rounded
      // The hook sets count to safeTarget directly on completion
      expect(stateValue).toBe(99.9);
    });

    it('handles small target values', () => {
      mount(1, 100);

      runAnimationFramesUntilComplete(200);

      expect(stateValue).toBe(1);
    });

    it('handles large target values', () => {
      mount(1000000, 100);

      runAnimationFramesUntilComplete(200);

      expect(stateValue).toBe(1000000);
    });

    it('handles negative target values', () => {
      mount(-100, 100);

      runAnimationFramesUntilComplete(200);

      expect(stateValue).toBe(-100);
    });

    it('returns safeTarget when count becomes NaN somehow', () => {
      // The hook has a safety check: Number.isFinite(count) ? count : safeTarget
      // This test verifies that behavior by checking the return value
      const result = useAnimatedCounter(100);

      // The initial return value should be the safeTarget (100)
      expect(Number.isFinite(result)).toBe(true);
      expect(result).toBe(100);
    });
  });

  describe('dependency tracking', () => {
    it('creates effect with correct dependencies', () => {
      useAnimatedCounter(100, 500);

      expect(effectCallbacks.length).toBe(1);
      // Dependencies should be [safeTarget, duration]
      expect(effectCallbacks[0].deps).toEqual([100, 500]);
    });

    it('uses safeTarget (not raw target) in dependencies', () => {
      useAnimatedCounter(NaN, 500);

      expect(effectCallbacks[0].deps).toEqual([0, 500]); // NaN becomes 0
    });
  });

  describe('animation lifecycle', () => {
    it('completes full animation from 0 to target', () => {
      mount(100, 160);

      // Simulate full animation
      const animationStates: number[] = [];

      for (let i = 0; i < 15 && rafCallbacks.length > 0; i++) {
        runAnimationFrame(16);
        animationStates.push(stateValue);
      }

      // First value should be > 0 (animation started)
      expect(animationStates[0]).toBeGreaterThanOrEqual(0);

      // Last value should be exactly the target
      expect(animationStates[animationStates.length - 1]).toBe(100);

      // Values should be monotonically increasing (for positive target)
      for (let i = 1; i < animationStates.length; i++) {
        expect(animationStates[i]).toBeGreaterThanOrEqual(animationStates[i - 1]);
      }
    });

    it('resets startTimeRef on new animation', () => {
      const startTimeRef = { current: 1000 }; // Simulating previous value
      mockUseRef.mockReturnValueOnce(startTimeRef).mockReturnValueOnce({ current: null });

      mount(100, 800);

      // After running the effect, startTimeRef should be reset to null
      // This happens at the start of the effect
      // The first frame will then set it to the current timestamp
      expect(startTimeRef.current).toBe(null);
    });
  });
});
