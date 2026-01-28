import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Window mock ────────────────────────────────────────────────────────

interface WindowMock {
  innerWidth: number;
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
}

let windowMock: WindowMock;
let resizeListeners: EventListener[] = [];

function createWindowMock(initialWidth: number): WindowMock {
  return {
    innerWidth: initialWidth,
    addEventListener: vi.fn((event: string, handler: EventListener) => {
      if (event === 'resize') {
        resizeListeners.push(handler);
      }
    }),
    removeEventListener: vi.fn((event: string, handler: EventListener) => {
      if (event === 'resize') {
        resizeListeners = resizeListeners.filter((h) => h !== handler);
      }
    }),
  };
}

function setWindowWidth(width: number) {
  windowMock.innerWidth = width;
}

function fireResizeEvent() {
  for (const handler of resizeListeners) {
    handler(new Event('resize'));
  }
}

// ── React mocks ────────────────────────────────────────────────────────

type CleanupFn = () => void;
type SetState<T> = (value: T | ((prev: T) => T)) => void;

let stateValues: unknown[] = [];
let stateSetters: SetState<unknown>[] = [];
let stateIndex = 0;
let effectCallbacks: Array<{ callback: () => void | CleanupFn; deps: unknown[] }> = [];
let cleanupFns: CleanupFn[] = [];

vi.mock('react', () => ({
  useState: <T>(initial: T | (() => T)): [T, SetState<T>] => {
    const idx = stateIndex++;
    if (stateValues[idx] === undefined) {
      stateValues[idx] = typeof initial === 'function' ? (initial as () => T)() : initial;
    }
    const setter: SetState<T> = (value) => {
      const prev = stateValues[idx] as T;
      stateValues[idx] = typeof value === 'function' ? (value as (prev: T) => T)(prev) : value;
    };
    stateSetters[idx] = setter as SetState<unknown>;
    return [stateValues[idx] as T, setter];
  },
  useEffect: (callback: () => void | CleanupFn, deps: unknown[]) => {
    effectCallbacks.push({ callback, deps });
  },
}));

// ── Setup and import ───────────────────────────────────────────────────

// Must be defined before importing the hook
Object.defineProperty(globalThis, 'window', {
  value: undefined,
  writable: true,
});

import { useMobile } from '../useMobile';

// ── Helpers ────────────────────────────────────────────────────────────

function resetMockState() {
  stateValues = [];
  stateSetters = [];
  stateIndex = 0;
  effectCallbacks = [];
  cleanupFns = [];
  resizeListeners = [];
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

// ── Tests ──────────────────────────────────────────────────────────────

describe('useMobile', () => {
  const MOBILE_BREAKPOINT = 768;

  beforeEach(() => {
    vi.clearAllMocks();
    resetMockState();
  });

  afterEach(() => {
    runCleanups();
  });

  describe('initial state', () => {
    it('returns true when window width is below mobile breakpoint', () => {
      windowMock = createWindowMock(MOBILE_BREAKPOINT - 1);
      (globalThis as unknown as { window: WindowMock }).window = windowMock;

      const result = useMobile();
      expect(result).toBe(true);
    });

    it('returns false when window width is at mobile breakpoint', () => {
      windowMock = createWindowMock(MOBILE_BREAKPOINT);
      (globalThis as unknown as { window: WindowMock }).window = windowMock;

      const result = useMobile();
      expect(result).toBe(false);
    });

    it('returns false when window width is above mobile breakpoint', () => {
      windowMock = createWindowMock(MOBILE_BREAKPOINT + 1);
      (globalThis as unknown as { window: WindowMock }).window = windowMock;

      const result = useMobile();
      expect(result).toBe(false);
    });

    it('returns false when window is undefined (SSR)', () => {
      (globalThis as unknown as { window: undefined }).window = undefined;

      const result = useMobile();
      expect(result).toBe(false);
    });
  });

  describe('breakpoint boundary', () => {
    it('returns true for width 767 (one below breakpoint)', () => {
      windowMock = createWindowMock(767);
      (globalThis as unknown as { window: WindowMock }).window = windowMock;

      const result = useMobile();
      expect(result).toBe(true);
    });

    it('returns false for width 768 (at breakpoint)', () => {
      windowMock = createWindowMock(768);
      (globalThis as unknown as { window: WindowMock }).window = windowMock;

      const result = useMobile();
      expect(result).toBe(false);
    });

    it('returns false for width 769 (one above breakpoint)', () => {
      windowMock = createWindowMock(769);
      (globalThis as unknown as { window: WindowMock }).window = windowMock;

      const result = useMobile();
      expect(result).toBe(false);
    });
  });

  describe('event listener registration', () => {
    it('registers a resize event listener on mount', () => {
      windowMock = createWindowMock(1024);
      (globalThis as unknown as { window: WindowMock }).window = windowMock;

      useMobile();
      runEffects();

      expect(windowMock.addEventListener).toHaveBeenCalledWith('resize', expect.any(Function));
      expect(resizeListeners.length).toBe(1);
    });

    it('removes the resize event listener on cleanup', () => {
      windowMock = createWindowMock(1024);
      (globalThis as unknown as { window: WindowMock }).window = windowMock;

      useMobile();
      runEffects();

      expect(resizeListeners.length).toBe(1);

      runCleanups();

      expect(windowMock.removeEventListener).toHaveBeenCalledWith('resize', expect.any(Function));
      expect(resizeListeners.length).toBe(0);
    });
  });

  describe('resize handling', () => {
    it('updates to true when window is resized below breakpoint', () => {
      windowMock = createWindowMock(1024);
      (globalThis as unknown as { window: WindowMock }).window = windowMock;

      useMobile();
      runEffects();

      // Resize to mobile width
      setWindowWidth(MOBILE_BREAKPOINT - 1);
      fireResizeEvent();

      // Check state was updated
      expect(stateValues[0]).toBe(true);
    });

    it('updates to false when window is resized above breakpoint', () => {
      windowMock = createWindowMock(500);
      (globalThis as unknown as { window: WindowMock }).window = windowMock;

      useMobile();
      runEffects();

      // Resize to desktop width
      setWindowWidth(MOBILE_BREAKPOINT + 100);
      fireResizeEvent();

      // Check state was updated
      expect(stateValues[0]).toBe(false);
    });

    it('handles multiple resize events', () => {
      windowMock = createWindowMock(1024);
      (globalThis as unknown as { window: WindowMock }).window = windowMock;

      useMobile();
      runEffects();

      // Start: desktop (1024)
      expect(stateValues[0]).toBe(false);

      // Resize to mobile
      setWindowWidth(500);
      fireResizeEvent();
      expect(stateValues[0]).toBe(true);

      // Resize back to desktop
      setWindowWidth(900);
      fireResizeEvent();
      expect(stateValues[0]).toBe(false);

      // Resize to exactly the breakpoint
      setWindowWidth(MOBILE_BREAKPOINT);
      fireResizeEvent();
      expect(stateValues[0]).toBe(false);

      // Resize to just below breakpoint
      setWindowWidth(MOBILE_BREAKPOINT - 1);
      fireResizeEvent();
      expect(stateValues[0]).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('handles width of 0', () => {
      windowMock = createWindowMock(0);
      (globalThis as unknown as { window: WindowMock }).window = windowMock;

      const result = useMobile();
      expect(result).toBe(true);
    });

    it('handles width of 1', () => {
      windowMock = createWindowMock(1);
      (globalThis as unknown as { window: WindowMock }).window = windowMock;

      const result = useMobile();
      expect(result).toBe(true);
    });

    it('handles very large width', () => {
      windowMock = createWindowMock(10000);
      (globalThis as unknown as { window: WindowMock }).window = windowMock;

      const result = useMobile();
      expect(result).toBe(false);
    });

    it('handles resize to exactly breakpoint', () => {
      windowMock = createWindowMock(500);
      (globalThis as unknown as { window: WindowMock }).window = windowMock;

      useMobile();
      runEffects();

      // Mobile initially
      expect(stateValues[0]).toBe(true);

      // Resize to exactly 768
      setWindowWidth(MOBILE_BREAKPOINT);
      fireResizeEvent();

      // Should be false at exactly 768 (< 768 is mobile, >= 768 is desktop)
      expect(stateValues[0]).toBe(false);
    });
  });

  describe('typical device widths', () => {
    it('returns true for iPhone SE width (375px)', () => {
      windowMock = createWindowMock(375);
      (globalThis as unknown as { window: WindowMock }).window = windowMock;

      const result = useMobile();
      expect(result).toBe(true);
    });

    it('returns true for iPhone 12 Pro width (390px)', () => {
      windowMock = createWindowMock(390);
      (globalThis as unknown as { window: WindowMock }).window = windowMock;

      const result = useMobile();
      expect(result).toBe(true);
    });

    it('returns true for Samsung Galaxy width (360px)', () => {
      windowMock = createWindowMock(360);
      (globalThis as unknown as { window: WindowMock }).window = windowMock;

      const result = useMobile();
      expect(result).toBe(true);
    });

    it('returns false for iPad portrait width (768px)', () => {
      windowMock = createWindowMock(768);
      (globalThis as unknown as { window: WindowMock }).window = windowMock;

      const result = useMobile();
      expect(result).toBe(false);
    });

    it('returns false for iPad landscape width (1024px)', () => {
      windowMock = createWindowMock(1024);
      (globalThis as unknown as { window: WindowMock }).window = windowMock;

      const result = useMobile();
      expect(result).toBe(false);
    });

    it('returns false for common laptop width (1366px)', () => {
      windowMock = createWindowMock(1366);
      (globalThis as unknown as { window: WindowMock }).window = windowMock;

      const result = useMobile();
      expect(result).toBe(false);
    });

    it('returns false for full HD width (1920px)', () => {
      windowMock = createWindowMock(1920);
      (globalThis as unknown as { window: WindowMock }).window = windowMock;

      const result = useMobile();
      expect(result).toBe(false);
    });
  });

  describe('state consistency', () => {
    it('state matches current window width after resize', () => {
      windowMock = createWindowMock(1024);
      (globalThis as unknown as { window: WindowMock }).window = windowMock;

      useMobile();
      runEffects();

      // Perform several resizes
      const widths = [500, 800, 767, 768, 769, 320, 1200];

      for (const width of widths) {
        setWindowWidth(width);
        fireResizeEvent();

        const expectedIsMobile = width < MOBILE_BREAKPOINT;
        expect(stateValues[0]).toBe(expectedIsMobile);
      }
    });
  });
});
