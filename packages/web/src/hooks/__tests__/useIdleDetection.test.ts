import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Document mock ──────────────────────────────────────────────────────

const documentListeners: Record<string, Array<{ handler: EventListener; options?: AddEventListenerOptions }>> = {};

function addDocumentListener(event: string, handler: EventListener, options?: AddEventListenerOptions) {
  if (!documentListeners[event]) documentListeners[event] = [];
  documentListeners[event].push({ handler, options });
}

function removeDocumentListener(event: string, handler: EventListener) {
  if (!documentListeners[event]) return;
  documentListeners[event] = documentListeners[event].filter((e) => e.handler !== handler);
}

function fireDocumentEvent(event: string) {
  for (const entry of documentListeners[event] ?? []) {
    entry.handler(new Event(event));
  }
}

Object.defineProperty(globalThis, 'document', {
  value: {
    addEventListener: vi.fn(addDocumentListener),
    removeEventListener: vi.fn(removeDocumentListener),
  },
  writable: true,
});

// ── React mocks ─────────────────────────────────────────────────────────

type CleanupFn = () => void;
let effectCallbacks: Array<{ callback: () => void | CleanupFn; deps: unknown[] }> = [];
let cleanupFns: CleanupFn[] = [];

vi.mock('react', () => ({
  useCallback: (fn: Function, _deps: unknown[]) => fn,
  useEffect: (callback: () => void | CleanupFn, deps: unknown[]) => {
    effectCallbacks.push({ callback, deps });
  },
}));

// ── Store mock ──────────────────────────────────────────────────────────

const mockRecordActivity = vi.fn();
const mockCheckIdleStatus = vi.fn();
const mockIsIdlePaused = vi.fn(() => false);

vi.mock('../../stores/readingStats', () => ({
  useReadingStatsStore: () => ({
    recordActivity: mockRecordActivity,
    checkIdleStatus: mockCheckIdleStatus,
    isIdlePaused: mockIsIdlePaused,
  }),
}));

import { useIdleDetection } from '../useIdleDetection';

// ── Helpers ─────────────────────────────────────────────────────────────

function resetMockState() {
  effectCallbacks = [];
  cleanupFns = [];
  Object.keys(documentListeners).forEach((k) => delete documentListeners[k]);
  (document.addEventListener as ReturnType<typeof vi.fn>).mockClear();
  (document.removeEventListener as ReturnType<typeof vi.fn>).mockClear();
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

function mount() {
  const result = useIdleDetection();
  runEffects();
  return result;
}

// ── Tests ───────────────────────────────────────────────────────────────

describe('useIdleDetection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    resetMockState();
  });

  afterEach(() => {
    runCleanups();
    vi.useRealTimers();
  });

  describe('return value', () => {
    it('returns isIdlePaused from the store', () => {
      mockIsIdlePaused.mockReturnValue(false);

      const result = useIdleDetection();

      expect(result).toEqual({ isIdlePaused: false });
    });

    it('returns true when the store reports idle paused', () => {
      mockIsIdlePaused.mockReturnValue(true);

      const result = useIdleDetection();

      expect(result).toEqual({ isIdlePaused: true });
    });
  });

  describe('idle check interval', () => {
    it('calls checkIdleStatus periodically', () => {
      mount();

      expect(mockCheckIdleStatus).not.toHaveBeenCalled();

      vi.advanceTimersByTime(30000);
      expect(mockCheckIdleStatus).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(30000);
      expect(mockCheckIdleStatus).toHaveBeenCalledTimes(2);
    });

    it('does not call checkIdleStatus before the interval elapses', () => {
      mount();

      vi.advanceTimersByTime(29999);

      expect(mockCheckIdleStatus).not.toHaveBeenCalled();
    });

    it('calls checkIdleStatus at regular 30-second intervals', () => {
      mount();

      vi.advanceTimersByTime(90000); // 3 intervals

      expect(mockCheckIdleStatus).toHaveBeenCalledTimes(3);
    });

    it('clears the interval on cleanup', () => {
      mount();

      runCleanups();

      vi.advanceTimersByTime(60000);

      expect(mockCheckIdleStatus).not.toHaveBeenCalled();
    });
  });

  describe('activity event listeners', () => {
    const ACTIVITY_EVENTS = ['mousedown', 'keydown', 'scroll', 'touchstart', 'wheel'];

    it('registers listeners for all activity events', () => {
      mount();

      for (const event of ACTIVITY_EVENTS) {
        expect(documentListeners[event]).toBeDefined();
        expect(documentListeners[event].length).toBe(1);
      }
    });

    it('registers listeners with passive option', () => {
      mount();

      for (const event of ACTIVITY_EVENTS) {
        expect(documentListeners[event][0].options).toEqual({ passive: true });
      }
    });

    it.each(ACTIVITY_EVENTS)('calls recordActivity on %s event', (event) => {
      mount();

      fireDocumentEvent(event);

      expect(mockRecordActivity).toHaveBeenCalledTimes(1);
    });

    it('calls recordActivity for each event independently', () => {
      mount();

      for (const event of ACTIVITY_EVENTS) {
        fireDocumentEvent(event);
      }

      expect(mockRecordActivity).toHaveBeenCalledTimes(ACTIVITY_EVENTS.length);
    });

    it('removes all event listeners on cleanup', () => {
      mount();

      // All events should have listeners
      for (const event of ACTIVITY_EVENTS) {
        expect(documentListeners[event].length).toBe(1);
      }

      runCleanups();

      // All events should have their listeners removed
      for (const event of ACTIVITY_EVENTS) {
        expect(documentListeners[event].length).toBe(0);
      }
    });

    it('does not call recordActivity after cleanup', () => {
      mount();

      runCleanups();

      for (const event of ACTIVITY_EVENTS) {
        fireDocumentEvent(event);
      }

      expect(mockRecordActivity).not.toHaveBeenCalled();
    });
  });

  describe('full lifecycle', () => {
    it('tracks activity and checks idle status concurrently', () => {
      mount();

      // Simulate some user activity
      fireDocumentEvent('mousedown');
      expect(mockRecordActivity).toHaveBeenCalledTimes(1);

      // Advance past one idle check interval
      vi.advanceTimersByTime(30000);
      expect(mockCheckIdleStatus).toHaveBeenCalledTimes(1);

      // More activity
      fireDocumentEvent('keydown');
      expect(mockRecordActivity).toHaveBeenCalledTimes(2);

      // Another interval
      vi.advanceTimersByTime(30000);
      expect(mockCheckIdleStatus).toHaveBeenCalledTimes(2);
    });

    it('cleans up both interval and event listeners on unmount', () => {
      mount();

      // Verify everything is set up
      fireDocumentEvent('mousedown');
      expect(mockRecordActivity).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(30000);
      expect(mockCheckIdleStatus).toHaveBeenCalledTimes(1);

      // Unmount
      vi.clearAllMocks();
      runCleanups();

      // Nothing should fire after cleanup
      fireDocumentEvent('mousedown');
      vi.advanceTimersByTime(60000);

      expect(mockRecordActivity).not.toHaveBeenCalled();
      expect(mockCheckIdleStatus).not.toHaveBeenCalled();
    });
  });
});
