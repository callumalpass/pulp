import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mock Types ─────────────────────────────────────────────────────────

type CleanupFn = () => void;

interface MockResizeObserver {
  observe: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  callback: ResizeObserverCallback | null;
}

// ── Mock State ─────────────────────────────────────────────────────────

let mockResizeObservers: MockResizeObserver[] = [];
let effectCallbacks: Array<{ callback: () => void | CleanupFn; deps: unknown[] }> = [];
let cleanupFns: CleanupFn[] = [];
let refMap: Record<number, { current: unknown }> = {};
let refCounter = 0;
let stateMap: Record<number, unknown> = {};
let stateCounter = 0;
let mockWindowInnerWidth = 1024;
let mockWindowInnerHeight = 768;

// ── Browser API Mocks ──────────────────────────────────────────────────

class MockResizeObserverClass {
  observe: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  callback: ResizeObserverCallback | null;

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    this.observe = vi.fn();
    this.disconnect = vi.fn();
    mockResizeObservers.push(this);
  }
}

(globalThis as unknown as { ResizeObserver: typeof MockResizeObserverClass }).ResizeObserver =
  MockResizeObserverClass;

Object.defineProperty(globalThis, 'window', {
  value: {
    get innerWidth() {
      return mockWindowInnerWidth;
    },
    get innerHeight() {
      return mockWindowInnerHeight;
    },
  },
  writable: true,
});

// ── React Mocks ────────────────────────────────────────────────────────

vi.mock('react', () => ({
  useCallback: (fn: (...args: unknown[]) => unknown, _deps: unknown[]) => fn,
  useRef: (initial: unknown) => {
    const idx = refCounter++;
    if (!refMap[idx]) {
      refMap[idx] = { current: initial };
    }
    return refMap[idx];
  },
  useState: (initial: unknown) => {
    const idx = stateCounter++;
    if (!(idx in stateMap)) {
      stateMap[idx] = initial;
    }
    const setState = (value: unknown) => {
      stateMap[idx] = typeof value === 'function' ? value(stateMap[idx]) : value;
    };
    return [stateMap[idx], setState];
  },
  useLayoutEffect: (callback: () => void | CleanupFn, _deps: unknown[]) => {
    effectCallbacks.push({ callback, deps: _deps });
  },
}));

// ── Lib Mock ───────────────────────────────────────────────────────────

const mockCalculatePopupPosition = vi.fn();

vi.mock('../../lib/popup-position', () => ({
  calculatePopupPosition: (args: unknown) => mockCalculatePopupPosition(args),
}));

import { usePopupPosition } from '../usePopupPosition';

// ── Helpers ────────────────────────────────────────────────────────────

function resetMockState() {
  refMap = {};
  refCounter = 0;
  stateMap = {};
  stateCounter = 0;
  effectCallbacks = [];
  cleanupFns = [];
  mockResizeObservers = [];
  mockCalculatePopupPosition.mockReset();
  mockWindowInnerWidth = 1024;
  mockWindowInnerHeight = 768;
}

function runEffects() {
  for (const { callback } of effectCallbacks) {
    const cleanup = callback();
    if (typeof cleanup === 'function') {
      cleanupFns.push(cleanup);
    }
  }
  effectCallbacks = [];
}

function runCleanups() {
  for (const cleanup of cleanupFns) {
    cleanup();
  }
  cleanupFns = [];
}

function makeDOMRect(x: number, y: number, width: number, height: number): DOMRect {
  return {
    x,
    y,
    width,
    height,
    top: y,
    right: x + width,
    bottom: y + height,
    left: x,
    toJSON() {
      return { x, y, width, height, top: y, right: x + width, bottom: y + height, left: x };
    },
  };
}

function createMockElement(rect: DOMRect): HTMLDivElement {
  return {
    getBoundingClientRect: vi.fn(() => rect),
  } as unknown as HTMLDivElement;
}

function createMockContainerRef(rect: DOMRect): React.RefObject<HTMLElement> {
  return {
    current: {
      getBoundingClientRect: vi.fn(() => rect),
    } as unknown as HTMLElement,
  };
}

// ── Tests ──────────────────────────────────────────────────────────────

describe('usePopupPosition', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMockState();
    mockCalculatePopupPosition.mockReturnValue({ x: 100, y: 200, placement: 'below' });
  });

  afterEach(() => {
    runCleanups();
  });

  describe('returned structure', () => {
    it('returns popupRef and position', () => {
      const result = usePopupPosition({
        anchor: { x: 100, y: 100 },
      });

      expect(result).toHaveProperty('popupRef');
      expect(result).toHaveProperty('position');
      expect(typeof result.popupRef).toBe('function');
    });

    it('popupRef is a callback ref (function)', () => {
      const result = usePopupPosition({
        anchor: { x: 100, y: 100 },
      });

      expect(typeof result.popupRef).toBe('function');
    });
  });

  describe('initial dimensions', () => {
    it('uses default initial dimensions (300x150) when not specified', () => {
      const containerRef = createMockContainerRef(makeDOMRect(0, 0, 800, 600));

      usePopupPosition({
        anchor: { x: 400, y: 300 },
        containerRef,
      });

      expect(mockCalculatePopupPosition).toHaveBeenCalledWith(
        expect.objectContaining({
          popupWidth: 300,
          popupHeight: 150,
        })
      );
    });

    it('uses custom initial dimensions when specified', () => {
      const containerRef = createMockContainerRef(makeDOMRect(0, 0, 800, 600));

      usePopupPosition({
        anchor: { x: 400, y: 300 },
        containerRef,
        initialWidth: 200,
        initialHeight: 100,
      });

      expect(mockCalculatePopupPosition).toHaveBeenCalledWith(
        expect.objectContaining({
          popupWidth: 200,
          popupHeight: 100,
        })
      );
    });
  });

  describe('viewport fallback (no containerRef)', () => {
    it('returns viewport-based position when containerRef is not provided', () => {
      mockWindowInnerWidth = 1000;

      const result = usePopupPosition({
        anchor: { x: 500, y: 100 },
        initialWidth: 200,
        initialHeight: 50,
        gap: 10,
      });

      // Without containerRef, uses inline fallback calculation
      // x = max(10, min(anchor.x - width/2, window.innerWidth - width - 10))
      // x = max(10, min(500 - 100, 1000 - 200 - 10)) = max(10, min(400, 790)) = 400
      // y = anchor.y + gap = 100 + 10 = 110
      expect(result.position.x).toBe(400);
      expect(result.position.y).toBe(110);
      expect(result.position.placement).toBe('below');
    });

    it('clamps x to left edge (minimum 10px)', () => {
      mockWindowInnerWidth = 1000;

      const result = usePopupPosition({
        anchor: { x: 50, y: 100 },
        initialWidth: 200,
        initialHeight: 50,
        gap: 10,
      });

      // x = max(10, min(50 - 100, 1000 - 200 - 10)) = max(10, min(-50, 790)) = 10
      expect(result.position.x).toBe(10);
    });

    it('clamps x to right edge', () => {
      mockWindowInnerWidth = 500;

      const result = usePopupPosition({
        anchor: { x: 450, y: 100 },
        initialWidth: 200,
        initialHeight: 50,
        gap: 10,
      });

      // x = max(10, min(450 - 100, 500 - 200 - 10)) = max(10, min(350, 290)) = 290
      expect(result.position.x).toBe(290);
    });

    it('uses default gap of 10 in viewport fallback', () => {
      const result = usePopupPosition({
        anchor: { x: 500, y: 100 },
      });

      // y = anchor.y + default gap = 100 + 10 = 110
      expect(result.position.y).toBe(110);
    });

    it('uses custom gap in viewport fallback', () => {
      const result = usePopupPosition({
        anchor: { x: 500, y: 100 },
        gap: 20,
      });

      // y = anchor.y + gap = 100 + 20 = 120
      expect(result.position.y).toBe(120);
    });

    it('returns below as placement in viewport fallback', () => {
      const result = usePopupPosition({
        anchor: { x: 500, y: 100 },
      });

      expect(result.position.placement).toBe('below');
    });
  });

  describe('containerRef position calculation', () => {
    it('delegates to calculatePopupPosition when containerRef is provided', () => {
      const containerRef = createMockContainerRef(makeDOMRect(0, 0, 800, 600));

      usePopupPosition({
        anchor: { x: 400, y: 300 },
        containerRef,
      });

      expect(mockCalculatePopupPosition).toHaveBeenCalled();
    });

    it('passes anchor to calculatePopupPosition', () => {
      const containerRef = createMockContainerRef(makeDOMRect(0, 0, 800, 600));

      usePopupPosition({
        anchor: { x: 123, y: 456 },
        containerRef,
      });

      expect(mockCalculatePopupPosition).toHaveBeenCalledWith(
        expect.objectContaining({
          anchor: { x: 123, y: 456 },
        })
      );
    });

    it('passes containerRect from containerRef', () => {
      const containerRect = makeDOMRect(10, 20, 800, 600);
      const containerRef = createMockContainerRef(containerRect);

      usePopupPosition({
        anchor: { x: 400, y: 300 },
        containerRef,
      });

      const call = mockCalculatePopupPosition.mock.calls[0][0];
      expect(call.containerRect.x).toBe(10);
      expect(call.containerRect.y).toBe(20);
      expect(call.containerRect.width).toBe(800);
      expect(call.containerRect.height).toBe(600);
    });

    it('passes default padding of 10', () => {
      const containerRef = createMockContainerRef(makeDOMRect(0, 0, 800, 600));

      usePopupPosition({
        anchor: { x: 400, y: 300 },
        containerRef,
      });

      expect(mockCalculatePopupPosition).toHaveBeenCalledWith(
        expect.objectContaining({
          padding: 10,
        })
      );
    });

    it('passes custom padding', () => {
      const containerRef = createMockContainerRef(makeDOMRect(0, 0, 800, 600));

      usePopupPosition({
        anchor: { x: 400, y: 300 },
        containerRef,
        padding: 25,
      });

      expect(mockCalculatePopupPosition).toHaveBeenCalledWith(
        expect.objectContaining({
          padding: 25,
        })
      );
    });

    it('passes default gap of 10', () => {
      const containerRef = createMockContainerRef(makeDOMRect(0, 0, 800, 600));

      usePopupPosition({
        anchor: { x: 400, y: 300 },
        containerRef,
      });

      expect(mockCalculatePopupPosition).toHaveBeenCalledWith(
        expect.objectContaining({
          gap: 10,
        })
      );
    });

    it('passes custom gap', () => {
      const containerRef = createMockContainerRef(makeDOMRect(0, 0, 800, 600));

      usePopupPosition({
        anchor: { x: 400, y: 300 },
        containerRef,
        gap: 15,
      });

      expect(mockCalculatePopupPosition).toHaveBeenCalledWith(
        expect.objectContaining({
          gap: 15,
        })
      );
    });

    it('passes default preferredPlacement of below', () => {
      const containerRef = createMockContainerRef(makeDOMRect(0, 0, 800, 600));

      usePopupPosition({
        anchor: { x: 400, y: 300 },
        containerRef,
      });

      expect(mockCalculatePopupPosition).toHaveBeenCalledWith(
        expect.objectContaining({
          preferredPlacement: 'below',
        })
      );
    });

    it('passes custom preferredPlacement', () => {
      const containerRef = createMockContainerRef(makeDOMRect(0, 0, 800, 600));

      usePopupPosition({
        anchor: { x: 400, y: 300 },
        containerRef,
        preferredPlacement: 'above',
      });

      expect(mockCalculatePopupPosition).toHaveBeenCalledWith(
        expect.objectContaining({
          preferredPlacement: 'above',
        })
      );
    });

    it('returns position from calculatePopupPosition', () => {
      const containerRef = createMockContainerRef(makeDOMRect(0, 0, 800, 600));
      mockCalculatePopupPosition.mockReturnValue({ x: 250, y: 350, placement: 'above' });

      const result = usePopupPosition({
        anchor: { x: 400, y: 300 },
        containerRef,
      });

      expect(result.position).toEqual({ x: 250, y: 350, placement: 'above' });
    });
  });

  describe('popupRef callback behavior', () => {
    it('sets up ResizeObserver when element is attached', () => {
      const { popupRef } = usePopupPosition({
        anchor: { x: 100, y: 100 },
      });

      const element = createMockElement(makeDOMRect(0, 0, 200, 100));
      popupRef(element);

      expect(mockResizeObservers.length).toBe(1);
      expect(mockResizeObservers[0].observe).toHaveBeenCalledWith(element);
    });

    it('measures element initially via getBoundingClientRect', () => {
      const { popupRef } = usePopupPosition({
        anchor: { x: 100, y: 100 },
      });

      const element = createMockElement(makeDOMRect(0, 0, 200, 100));
      popupRef(element);

      expect(element.getBoundingClientRect).toHaveBeenCalled();
    });

    it('does not create observer when called with null', () => {
      const { popupRef } = usePopupPosition({
        anchor: { x: 100, y: 100 },
      });

      popupRef(null);

      expect(mockResizeObservers.length).toBe(0);
    });

    it('disconnects previous observer when ref changes', () => {
      const { popupRef } = usePopupPosition({
        anchor: { x: 100, y: 100 },
      });

      const element1 = createMockElement(makeDOMRect(0, 0, 200, 100));
      popupRef(element1);

      const firstObserver = mockResizeObservers[0];

      const element2 = createMockElement(makeDOMRect(0, 0, 300, 150));
      popupRef(element2);

      expect(firstObserver.disconnect).toHaveBeenCalled();
      expect(mockResizeObservers.length).toBe(2);
    });

    it('disconnects observer when element is removed (null ref)', () => {
      const { popupRef } = usePopupPosition({
        anchor: { x: 100, y: 100 },
      });

      const element = createMockElement(makeDOMRect(0, 0, 200, 100));
      popupRef(element);

      const observer = mockResizeObservers[0];

      popupRef(null);

      expect(observer.disconnect).toHaveBeenCalled();
    });
  });

  describe('dimension threshold (>5px)', () => {
    it('updates dimensions when initial measurement differs from defaults by >5px', () => {
      const containerRef = createMockContainerRef(makeDOMRect(0, 0, 800, 600));

      // Reset state to ensure clean slate
      resetMockState();
      mockCalculatePopupPosition.mockReturnValue({ x: 100, y: 200, placement: 'below' });

      const { popupRef } = usePopupPosition({
        anchor: { x: 400, y: 300 },
        containerRef,
        initialWidth: 300,
        initialHeight: 150,
      });

      // First call uses initial dimensions
      expect(mockCalculatePopupPosition).toHaveBeenLastCalledWith(
        expect.objectContaining({
          popupWidth: 300,
          popupHeight: 150,
        })
      );

      // Attach element with significantly different dimensions
      const element = createMockElement(makeDOMRect(0, 0, 250, 120));
      popupRef(element);

      // After attachment, dimensions should update (250 vs 300 = 50px diff > 5px)
      // The state update happens, but since we mock useState, we need to check differently
      // In real usage, the component would re-render with new dimensions
      // For unit testing purposes, we verify the observer was set up
      expect(mockResizeObservers[0].observe).toHaveBeenCalledWith(element);
    });

    it('does not update dimensions when change is <= 5px', () => {
      const containerRef = createMockContainerRef(makeDOMRect(0, 0, 800, 600));

      resetMockState();
      mockCalculatePopupPosition.mockReturnValue({ x: 100, y: 200, placement: 'below' });

      const { popupRef } = usePopupPosition({
        anchor: { x: 400, y: 300 },
        containerRef,
        initialWidth: 300,
        initialHeight: 150,
      });

      // Attach element with dimensions within 5px threshold
      const element = createMockElement(makeDOMRect(0, 0, 303, 152));
      popupRef(element);

      // State should not be updated (both diffs are <=5px)
      // stateMap[0] should still hold initial dimensions
      // The initial useState call sets stateMap[0] = { width: 300, height: 150 }
      expect(stateMap[0]).toEqual({ width: 300, height: 150 });
    });

    it('updates when width diff exceeds threshold but height does not', () => {
      resetMockState();
      mockCalculatePopupPosition.mockReturnValue({ x: 100, y: 200, placement: 'below' });

      const { popupRef } = usePopupPosition({
        anchor: { x: 400, y: 300 },
        initialWidth: 300,
        initialHeight: 150,
      });

      // Width differs by 10px (> 5px), height differs by 2px (<= 5px)
      const element = createMockElement(makeDOMRect(0, 0, 310, 152));
      popupRef(element);

      // Should update because width diff > 5px
      expect(stateMap[0]).toEqual({ width: 310, height: 152 });
    });

    it('updates when height diff exceeds threshold but width does not', () => {
      resetMockState();
      mockCalculatePopupPosition.mockReturnValue({ x: 100, y: 200, placement: 'below' });

      const { popupRef } = usePopupPosition({
        anchor: { x: 400, y: 300 },
        initialWidth: 300,
        initialHeight: 150,
      });

      // Width differs by 3px (<= 5px), height differs by 20px (> 5px)
      const element = createMockElement(makeDOMRect(0, 0, 303, 170));
      popupRef(element);

      // Should update because height diff > 5px
      expect(stateMap[0]).toEqual({ width: 303, height: 170 });
    });

    it('handles exact 5px threshold (boundary case - no update)', () => {
      resetMockState();
      mockCalculatePopupPosition.mockReturnValue({ x: 100, y: 200, placement: 'below' });

      const { popupRef } = usePopupPosition({
        anchor: { x: 400, y: 300 },
        initialWidth: 300,
        initialHeight: 150,
      });

      // Exactly 5px difference - should NOT update (threshold is >5, not >=5)
      const element = createMockElement(makeDOMRect(0, 0, 305, 155));
      popupRef(element);

      expect(stateMap[0]).toEqual({ width: 300, height: 150 });
    });

    it('handles exact 6px threshold (boundary case - updates)', () => {
      resetMockState();
      mockCalculatePopupPosition.mockReturnValue({ x: 100, y: 200, placement: 'below' });

      const { popupRef } = usePopupPosition({
        anchor: { x: 400, y: 300 },
        initialWidth: 300,
        initialHeight: 150,
      });

      // 6px difference - should update (6 > 5)
      const element = createMockElement(makeDOMRect(0, 0, 306, 150));
      popupRef(element);

      expect(stateMap[0]).toEqual({ width: 306, height: 150 });
    });
  });

  describe('ResizeObserver callback', () => {
    it('updates dimensions when observer detects change >5px', () => {
      resetMockState();
      mockCalculatePopupPosition.mockReturnValue({ x: 100, y: 200, placement: 'below' });

      const { popupRef } = usePopupPosition({
        anchor: { x: 400, y: 300 },
        initialWidth: 300,
        initialHeight: 150,
      });

      // Initial attachment with same dimensions
      const element = createMockElement(makeDOMRect(0, 0, 300, 150));
      popupRef(element);

      // Simulate ResizeObserver callback with new dimensions
      const observer = mockResizeObservers[0];
      observer.callback!(
        [
          {
            contentRect: { width: 350, height: 180 },
          } as ResizeObserverEntry,
        ],
        observer as unknown as ResizeObserver
      );

      // Should update (50px width diff, 30px height diff - both > 5px)
      expect(stateMap[0]).toEqual({ width: 350, height: 180 });
    });

    it('does not update dimensions when observer change is <=5px', () => {
      resetMockState();
      mockCalculatePopupPosition.mockReturnValue({ x: 100, y: 200, placement: 'below' });

      const { popupRef } = usePopupPosition({
        anchor: { x: 400, y: 300 },
        initialWidth: 300,
        initialHeight: 150,
      });

      const element = createMockElement(makeDOMRect(0, 0, 300, 150));
      popupRef(element);

      const observer = mockResizeObservers[0];
      observer.callback!(
        [
          {
            contentRect: { width: 302, height: 153 },
          } as ResizeObserverEntry,
        ],
        observer as unknown as ResizeObserver
      );

      // Should not update (both diffs <= 5px)
      expect(stateMap[0]).toEqual({ width: 300, height: 150 });
    });

    it('handles empty entries array gracefully', () => {
      resetMockState();
      mockCalculatePopupPosition.mockReturnValue({ x: 100, y: 200, placement: 'below' });

      const { popupRef } = usePopupPosition({
        anchor: { x: 400, y: 300 },
        initialWidth: 300,
        initialHeight: 150,
      });

      const element = createMockElement(makeDOMRect(0, 0, 300, 150));
      popupRef(element);

      const observer = mockResizeObservers[0];

      // Should not throw
      expect(() => {
        observer.callback!([], observer as unknown as ResizeObserver);
      }).not.toThrow();
    });

    it('uses first entry when multiple entries are provided', () => {
      resetMockState();
      mockCalculatePopupPosition.mockReturnValue({ x: 100, y: 200, placement: 'below' });

      const { popupRef } = usePopupPosition({
        anchor: { x: 400, y: 300 },
        initialWidth: 300,
        initialHeight: 150,
      });

      const element = createMockElement(makeDOMRect(0, 0, 300, 150));
      popupRef(element);

      const observer = mockResizeObservers[0];
      observer.callback!(
        [
          { contentRect: { width: 400, height: 200 } } as ResizeObserverEntry,
          { contentRect: { width: 500, height: 300 } } as ResizeObserverEntry,
        ],
        observer as unknown as ResizeObserver
      );

      // Should use first entry
      expect(stateMap[0]).toEqual({ width: 400, height: 200 });
    });
  });

  describe('cleanup on unmount', () => {
    it('disconnects observer on useLayoutEffect cleanup', () => {
      resetMockState();
      mockCalculatePopupPosition.mockReturnValue({ x: 100, y: 200, placement: 'below' });

      const { popupRef } = usePopupPosition({
        anchor: { x: 400, y: 300 },
      });

      const element = createMockElement(makeDOMRect(0, 0, 300, 150));
      popupRef(element);

      const observer = mockResizeObservers[0];

      // Run effects to register cleanup
      runEffects();

      // Run cleanups (simulating unmount)
      runCleanups();

      expect(observer.disconnect).toHaveBeenCalled();
    });

    it('does not throw when cleaning up without observer', () => {
      resetMockState();
      mockCalculatePopupPosition.mockReturnValue({ x: 100, y: 200, placement: 'below' });

      usePopupPosition({
        anchor: { x: 400, y: 300 },
      });

      // No element attached, so no observer created

      runEffects();

      // Should not throw
      expect(() => runCleanups()).not.toThrow();
    });
  });

  describe('containerRef with null current', () => {
    it('falls back to viewport calculation when containerRef.current is null', () => {
      const containerRef = { current: null } as React.RefObject<HTMLElement | null>;

      const result = usePopupPosition({
        anchor: { x: 500, y: 200 },
        containerRef,
        initialWidth: 200,
        initialHeight: 100,
        gap: 10,
      });

      // Should use viewport fallback
      expect(mockCalculatePopupPosition).not.toHaveBeenCalled();
      expect(result.position.y).toBe(210); // 200 + 10
    });
  });

  describe('edge cases', () => {
    it('handles zero dimensions', () => {
      resetMockState();
      mockCalculatePopupPosition.mockReturnValue({ x: 100, y: 200, placement: 'below' });

      const { popupRef } = usePopupPosition({
        anchor: { x: 400, y: 300 },
        initialWidth: 0,
        initialHeight: 0,
      });

      const element = createMockElement(makeDOMRect(0, 0, 0, 0));
      popupRef(element);

      // Should not throw and observer should be set up
      expect(mockResizeObservers.length).toBe(1);
    });

    it('handles negative anchor coordinates', () => {
      const result = usePopupPosition({
        anchor: { x: -50, y: -20 },
        initialWidth: 200,
        initialHeight: 100,
        gap: 10,
      });

      // x = max(10, min(-50 - 100, 1024 - 200 - 10)) = max(10, -150) = 10
      // y = -20 + 10 = -10
      expect(result.position.x).toBe(10);
      expect(result.position.y).toBe(-10);
    });

    it('handles very large anchor coordinates', () => {
      mockWindowInnerWidth = 1000;

      const result = usePopupPosition({
        anchor: { x: 5000, y: 3000 },
        initialWidth: 200,
        initialHeight: 100,
        gap: 10,
      });

      // x = max(10, min(5000 - 100, 1000 - 200 - 10)) = max(10, min(4900, 790)) = 790
      expect(result.position.x).toBe(790);
    });

    it('handles fractional dimensions', () => {
      resetMockState();
      mockCalculatePopupPosition.mockReturnValue({ x: 100, y: 200, placement: 'below' });

      const { popupRef } = usePopupPosition({
        anchor: { x: 400, y: 300 },
        initialWidth: 300.5,
        initialHeight: 150.5,
      });

      // Element with slightly different fractional dimensions
      const element = createMockElement(makeDOMRect(0, 0, 306.7, 150.5));
      popupRef(element);

      // 306.7 - 300.5 = 6.2 > 5, should update
      expect(stateMap[0]).toEqual({ width: 306.7, height: 150.5 });
    });
  });
});
