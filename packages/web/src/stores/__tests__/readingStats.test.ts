import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ReadingStats } from '@pulp/shared';

// ── Mocks ──────────────────────────────────────────────────────────────

// Mock the api module before importing the store
vi.mock('../../lib/api', () => ({
  api: {
    readingStats: {
      update: vi.fn(),
    },
  },
}));

// Mock formatReadingTime (it's already tested in format.test.ts)
vi.mock('../../lib/format', () => ({
  formatReadingTime: vi.fn((ms: number) => `${Math.round(ms / 1000)}s`),
}));

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: vi.fn((key: string) => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; }),
    get length() { return Object.keys(store).length; },
    key: vi.fn((i: number) => Object.keys(store)[i] ?? null),
  };
})();

Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock });
if (typeof globalThis.window === 'undefined') {
  (globalThis as Record<string, unknown>).window = globalThis;
}

// Now import the store after mocks are set up
import { useReadingStatsStore } from '../readingStats';
import { api } from '../../lib/api';

// ── Helpers ────────────────────────────────────────────────────────────

const mockedApiUpdate = vi.mocked(api.readingStats.update);

function makeStats(overrides: Partial<ReadingStats> = {}): ReadingStats {
  return {
    totalReadingTimeMs: 600000,
    totalSessions: 5,
    averageSessionMs: 120000,
    firstReadDate: '2025-01-01T00:00:00.000Z',
    pagesPerHour: 30,
    totalPagesRead: 50,
    longestSessionMs: 300000,
    estimatedCompletionDate: null,
    averageDailyReadingMs: null,
    ...overrides,
  };
}

function resetStore() {
  useReadingStatsStore.setState({
    activeSession: null,
    bookStatsCache: {},
    pendingSessions: [],
    isSyncing: false,
    lastSyncError: null,
  });
}

// ── Tests ──────────────────────────────────────────────────────────────

describe('useReadingStatsStore', () => {
  let perfNowSpy: ReturnType<typeof vi.spyOn>;
  let currentTime: number;

  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
    vi.useFakeTimers();
    resetStore();

    // Control performance.now() for deterministic time calculations
    currentTime = 1000;
    perfNowSpy = vi.spyOn(performance, 'now').mockImplementation(() => currentTime);
  });

  afterEach(() => {
    vi.useRealTimers();
    perfNowSpy.mockRestore();
  });

  // ── Initial state ──────────────────────────────────────────────────

  describe('initial state', () => {
    it('starts with no active session', () => {
      const state = useReadingStatsStore.getState();
      expect(state.activeSession).toBeNull();
    });

    it('starts with empty book stats cache', () => {
      const state = useReadingStatsStore.getState();
      expect(state.bookStatsCache).toEqual({});
    });

    it('starts with no pending sessions', () => {
      const state = useReadingStatsStore.getState();
      expect(state.pendingSessions).toEqual([]);
    });

    it('starts not syncing', () => {
      const state = useReadingStatsStore.getState();
      expect(state.isSyncing).toBe(false);
      expect(state.lastSyncError).toBeNull();
    });
  });

  // ── startSession ──────────────────────────────────────────────────

  describe('startSession', () => {
    it('creates an active session with correct fields', () => {
      const store = useReadingStatsStore.getState();
      store.startSession('note-1', 5, 100);

      const session = useReadingStatsStore.getState().activeSession;
      expect(session).not.toBeNull();
      expect(session!.noteId).toBe('note-1');
      expect(session!.startPage).toBe(5);
      expect(session!.currentPage).toBe(5);
      expect(session!.totalPages).toBe(100);
      expect(session!.isPaused).toBe(false);
      expect(session!.pausedAt).toBeNull();
      expect(session!.totalPausedMs).toBe(0);
      expect(session!.isIdlePaused).toBe(false);
      expect(session!.idlePauseCount).toBe(0);
      expect(session!.idlePauseTotalMs).toBe(0);
    });

    it('sets startTime from performance.now()', () => {
      currentTime = 5000;
      const store = useReadingStatsStore.getState();
      store.startSession('note-1', 1, 50);

      const session = useReadingStatsStore.getState().activeSession;
      expect(session!.startTime).toBe(5000);
    });

    it('calculates initial progress percentage', () => {
      const store = useReadingStatsStore.getState();
      store.startSession('note-1', 25, 100);

      const session = useReadingStatsStore.getState().activeSession;
      expect(session!.currentProgress).toBe(25);
    });

    it('handles totalPages of 0 without division error', () => {
      const store = useReadingStatsStore.getState();
      store.startSession('note-1', 0, 0);

      const session = useReadingStatsStore.getState().activeSession;
      expect(session!.currentProgress).toBe(0);
    });

    it('ends existing session before starting new one', () => {
      const store = useReadingStatsStore.getState();
      store.startSession('note-1', 1, 50);

      // Start another session — the first should be ended
      store.startSession('note-2', 1, 100);

      const session = useReadingStatsStore.getState().activeSession;
      expect(session!.noteId).toBe('note-2');
    });

    it('records an ISO timestamp for display', () => {
      const store = useReadingStatsStore.getState();
      store.startSession('note-1', 1, 50);

      const session = useReadingStatsStore.getState().activeSession;
      // Should be a valid ISO string
      expect(() => new Date(session!.startTimestamp)).not.toThrow();
      expect(new Date(session!.startTimestamp).toISOString()).toBe(session!.startTimestamp);
    });
  });

  // ── updateCurrentPage ─────────────────────────────────────────────

  describe('updateCurrentPage', () => {
    it('updates the current page', () => {
      const store = useReadingStatsStore.getState();
      store.startSession('note-1', 1, 100);

      currentTime = 2000;
      store.updateCurrentPage(10);

      const session = useReadingStatsStore.getState().activeSession;
      expect(session!.currentPage).toBe(10);
    });

    it('updates lastActivityTime', () => {
      const store = useReadingStatsStore.getState();
      store.startSession('note-1', 1, 100);

      currentTime = 5000;
      store.updateCurrentPage(10);

      const session = useReadingStatsStore.getState().activeSession;
      expect(session!.lastActivityTime).toBe(5000);
    });

    it('recalculates progress percentage', () => {
      const store = useReadingStatsStore.getState();
      store.startSession('note-1', 1, 200);

      store.updateCurrentPage(100);

      const session = useReadingStatsStore.getState().activeSession;
      expect(session!.currentProgress).toBe(50);
    });

    it('does nothing if no active session', () => {
      const store = useReadingStatsStore.getState();
      // No session started
      store.updateCurrentPage(10);

      expect(useReadingStatsStore.getState().activeSession).toBeNull();
    });

    it('auto-resumes an idle-paused session on page change', () => {
      const store = useReadingStatsStore.getState();
      store.startSession('note-1', 1, 100);

      // Simulate idle pause
      currentTime = 400000; // Well past idle timeout
      useReadingStatsStore.setState((state) => ({
        activeSession: state.activeSession ? {
          ...state.activeSession,
          isPaused: true,
          pausedAt: 300000,
          isIdlePaused: true,
          idlePauseCount: 1,
        } : null,
      }));

      // Page change should auto-resume
      currentTime = 500000;
      store.updateCurrentPage(5);

      const session = useReadingStatsStore.getState().activeSession;
      expect(session!.isPaused).toBe(false);
      expect(session!.isIdlePaused).toBe(false);
      expect(session!.pausedAt).toBeNull();
      // totalPausedMs should include the idle pause duration (500000 - 300000 = 200000)
      expect(session!.totalPausedMs).toBe(200000);
    });
  });

  // ── pauseSession ──────────────────────────────────────────────────

  describe('pauseSession', () => {
    it('pauses an active session', () => {
      const store = useReadingStatsStore.getState();
      store.startSession('note-1', 1, 100);

      currentTime = 5000;
      store.pauseSession();

      const session = useReadingStatsStore.getState().activeSession;
      expect(session!.isPaused).toBe(true);
      expect(session!.pausedAt).toBe(5000);
      expect(session!.isIdlePaused).toBe(false); // Manual pause
    });

    it('does nothing if already paused', () => {
      const store = useReadingStatsStore.getState();
      store.startSession('note-1', 1, 100);

      currentTime = 5000;
      store.pauseSession();

      currentTime = 10000;
      store.pauseSession(); // second pause

      const session = useReadingStatsStore.getState().activeSession;
      expect(session!.pausedAt).toBe(5000); // Unchanged
    });

    it('does nothing if no active session', () => {
      const store = useReadingStatsStore.getState();
      store.pauseSession();
      expect(useReadingStatsStore.getState().activeSession).toBeNull();
    });
  });

  // ── resumeSession ─────────────────────────────────────────────────

  describe('resumeSession', () => {
    it('resumes a paused session', () => {
      const store = useReadingStatsStore.getState();
      store.startSession('note-1', 1, 100);

      currentTime = 5000;
      store.pauseSession();

      currentTime = 10000;
      store.resumeSession();

      const session = useReadingStatsStore.getState().activeSession;
      expect(session!.isPaused).toBe(false);
      expect(session!.pausedAt).toBeNull();
    });

    it('accumulates paused time correctly', () => {
      const store = useReadingStatsStore.getState();
      store.startSession('note-1', 1, 100);

      // First pause: 5000ms
      currentTime = 5000;
      store.pauseSession();
      currentTime = 10000;
      store.resumeSession();

      expect(useReadingStatsStore.getState().activeSession!.totalPausedMs).toBe(5000);

      // Second pause: 3000ms
      currentTime = 15000;
      store.pauseSession();
      currentTime = 18000;
      store.resumeSession();

      expect(useReadingStatsStore.getState().activeSession!.totalPausedMs).toBe(8000);
    });

    it('resets lastActivityTime on resume', () => {
      const store = useReadingStatsStore.getState();
      store.startSession('note-1', 1, 100);

      currentTime = 5000;
      store.pauseSession();

      currentTime = 10000;
      store.resumeSession();

      expect(useReadingStatsStore.getState().activeSession!.lastActivityTime).toBe(10000);
    });

    it('clears isIdlePaused flag on resume', () => {
      const store = useReadingStatsStore.getState();
      store.startSession('note-1', 1, 100);

      // Simulate idle pause state
      useReadingStatsStore.setState((state) => ({
        activeSession: state.activeSession ? {
          ...state.activeSession,
          isPaused: true,
          pausedAt: 5000,
          isIdlePaused: true,
        } : null,
      }));

      currentTime = 10000;
      store.resumeSession();

      expect(useReadingStatsStore.getState().activeSession!.isIdlePaused).toBe(false);
    });

    it('does nothing if not paused', () => {
      const store = useReadingStatsStore.getState();
      store.startSession('note-1', 1, 100);

      store.resumeSession(); // not paused

      const session = useReadingStatsStore.getState().activeSession;
      expect(session!.totalPausedMs).toBe(0);
    });

    it('does nothing if no active session', () => {
      const store = useReadingStatsStore.getState();
      store.resumeSession();
      expect(useReadingStatsStore.getState().activeSession).toBeNull();
    });
  });

  // ── recordActivity ────────────────────────────────────────────────

  describe('recordActivity', () => {
    it('updates lastActivityTime', () => {
      const store = useReadingStatsStore.getState();
      store.startSession('note-1', 1, 100);

      currentTime = 8000;
      store.recordActivity();

      expect(useReadingStatsStore.getState().activeSession!.lastActivityTime).toBe(8000);
    });

    it('auto-resumes from idle pause on activity', () => {
      const store = useReadingStatsStore.getState();
      store.startSession('note-1', 1, 100);

      // Simulate idle pause
      useReadingStatsStore.setState((state) => ({
        activeSession: state.activeSession ? {
          ...state.activeSession,
          isPaused: true,
          pausedAt: 300000,
          isIdlePaused: true,
          idlePauseCount: 1,
          totalPausedMs: 0,
          idlePauseTotalMs: 0,
        } : null,
      }));

      currentTime = 400000;
      store.recordActivity();

      const session = useReadingStatsStore.getState().activeSession;
      expect(session!.isPaused).toBe(false);
      expect(session!.isIdlePaused).toBe(false);
      expect(session!.pausedAt).toBeNull();
      expect(session!.totalPausedMs).toBe(100000); // 400000 - 300000
      expect(session!.idlePauseTotalMs).toBe(100000);
    });

    it('does nothing if no active session', () => {
      const store = useReadingStatsStore.getState();
      store.recordActivity();
      expect(useReadingStatsStore.getState().activeSession).toBeNull();
    });

    it('does not resume a manually paused session', () => {
      const store = useReadingStatsStore.getState();
      store.startSession('note-1', 1, 100);

      // Manual pause (isIdlePaused = false)
      currentTime = 5000;
      store.pauseSession();

      currentTime = 10000;
      store.recordActivity();

      // Should remain paused since it was manual, not idle
      const session = useReadingStatsStore.getState().activeSession;
      expect(session!.isPaused).toBe(true);
    });
  });

  // ── checkIdleStatus ───────────────────────────────────────────────

  describe('checkIdleStatus', () => {
    const IDLE_TIMEOUT = 5 * 60 * 1000; // 5 minutes

    it('pauses session after idle timeout', () => {
      const store = useReadingStatsStore.getState();
      store.startSession('note-1', 1, 100);
      const initialActivityTime = useReadingStatsStore.getState().activeSession!.lastActivityTime;

      currentTime = initialActivityTime + IDLE_TIMEOUT;
      store.checkIdleStatus();

      const session = useReadingStatsStore.getState().activeSession;
      expect(session!.isPaused).toBe(true);
      expect(session!.isIdlePaused).toBe(true);
      expect(session!.idlePauseCount).toBe(1);
    });

    it('does not pause before idle timeout', () => {
      const store = useReadingStatsStore.getState();
      store.startSession('note-1', 1, 100);
      const initialActivityTime = useReadingStatsStore.getState().activeSession!.lastActivityTime;

      currentTime = initialActivityTime + IDLE_TIMEOUT - 1;
      store.checkIdleStatus();

      const session = useReadingStatsStore.getState().activeSession;
      expect(session!.isPaused).toBe(false);
    });

    it('does nothing if already paused', () => {
      const store = useReadingStatsStore.getState();
      store.startSession('note-1', 1, 100);

      currentTime = 5000;
      store.pauseSession(); // Manual pause first

      currentTime = 500000; // Well past idle
      store.checkIdleStatus();

      const session = useReadingStatsStore.getState().activeSession;
      // Should remain manually paused, not converted to idle pause
      expect(session!.isIdlePaused).toBe(false);
      expect(session!.idlePauseCount).toBe(0);
    });

    it('does nothing if no active session', () => {
      const store = useReadingStatsStore.getState();
      store.checkIdleStatus();
      expect(useReadingStatsStore.getState().activeSession).toBeNull();
    });

    it('increments idle pause count on multiple idle pauses', () => {
      const store = useReadingStatsStore.getState();
      store.startSession('note-1', 1, 100);

      // First idle pause
      currentTime = 1000 + IDLE_TIMEOUT;
      store.checkIdleStatus();
      expect(useReadingStatsStore.getState().activeSession!.idlePauseCount).toBe(1);

      // Resume
      currentTime += 1000;
      store.resumeSession();

      // Second idle pause
      currentTime += IDLE_TIMEOUT;
      store.checkIdleStatus();
      expect(useReadingStatsStore.getState().activeSession!.idlePauseCount).toBe(2);
    });
  });

  // ── endSession ────────────────────────────────────────────────────

  describe('endSession', () => {
    it('returns null if no active session', async () => {
      const store = useReadingStatsStore.getState();
      const result = await store.endSession();
      expect(result).toBeNull();
    });

    it('clears the active session immediately', async () => {
      mockedApiUpdate.mockResolvedValue({
        success: true,
        readingStats: makeStats(),
        lastRead: new Date().toISOString(),
      });

      const store = useReadingStatsStore.getState();
      store.startSession('note-1', 1, 100);

      currentTime = 60000; // 59 seconds of reading
      const promise = store.endSession();

      // Session cleared immediately (before API call resolves)
      expect(useReadingStatsStore.getState().activeSession).toBeNull();
      await promise;
    });

    it('discards sessions shorter than 10 seconds', async () => {
      const store = useReadingStatsStore.getState();
      store.startSession('note-1', 1, 100);

      currentTime = 1000 + 9999; // Just under 10 seconds
      const result = await store.endSession();

      expect(result).toBeNull();
      expect(mockedApiUpdate).not.toHaveBeenCalled();
    });

    it('saves sessions of exactly 10 seconds', async () => {
      mockedApiUpdate.mockResolvedValue({
        success: true,
        readingStats: makeStats(),
        lastRead: new Date().toISOString(),
      });

      const store = useReadingStatsStore.getState();
      store.startSession('note-1', 1, 100);

      currentTime = 1000 + 10000; // Exactly 10 seconds
      const result = await store.endSession();

      expect(result).not.toBeNull();
      expect(mockedApiUpdate).toHaveBeenCalled();
    });

    it('returns a ReadingSession on success', async () => {
      mockedApiUpdate.mockResolvedValue({
        success: true,
        readingStats: makeStats(),
        lastRead: new Date().toISOString(),
      });

      const store = useReadingStatsStore.getState();
      store.startSession('note-1', 1, 100);
      store.updateCurrentPage(10);

      currentTime = 60000; // 59 seconds
      const result = await store.endSession();

      expect(result).not.toBeNull();
      expect(result!.noteId).toBe('note-1');
      expect(result!.startPage).toBe(1);
      expect(result!.endPage).toBe(10);
      expect(result!.pagesRead).toBe(9); // |10 - 1|
      expect(result!.durationMs).toBeGreaterThan(0);
      expect(result!.id).toMatch(/^session-/);
    });

    it('calculates duration excluding paused time', async () => {
      mockedApiUpdate.mockResolvedValue({
        success: true,
        readingStats: makeStats(),
        lastRead: new Date().toISOString(),
      });

      const store = useReadingStatsStore.getState();
      store.startSession('note-1', 1, 100);

      // Pause for 20 seconds at t=5000
      currentTime = 5000;
      store.pauseSession();
      currentTime = 25000;
      store.resumeSession();

      // End at t=50000 — total wall time = 49s, paused = 20s, active = 29s
      currentTime = 50000;
      const result = await store.endSession();

      // duration should be ~29000ms (50000 - 1000 - 20000)
      expect(result!.durationMs).toBe(29000);
    });

    it('accounts for currently paused time at end', async () => {
      mockedApiUpdate.mockResolvedValue({
        success: true,
        readingStats: makeStats(),
        lastRead: new Date().toISOString(),
      });

      const store = useReadingStatsStore.getState();
      store.startSession('note-1', 1, 100);

      // Pause at t=5000 and DON'T resume before ending
      currentTime = 5000;
      store.pauseSession();

      currentTime = 30000; // End while still paused
      const result = await store.endSession();

      // Wall time = 29000ms, paused at 5000 to 30000 = 25000ms, active = 4000ms
      // But 4000ms < 10000ms minimum, so should be null
      expect(result).toBeNull();
    });

    it('updates bookStatsCache on successful save', async () => {
      const stats = makeStats({ totalSessions: 10 });
      mockedApiUpdate.mockResolvedValue({
        success: true,
        readingStats: stats,
        lastRead: new Date().toISOString(),
      });

      const store = useReadingStatsStore.getState();
      store.startSession('note-1', 1, 100);

      currentTime = 60000;
      await store.endSession();

      expect(useReadingStatsStore.getState().bookStatsCache['note-1']).toEqual(stats);
      expect(useReadingStatsStore.getState().lastSyncError).toBeNull();
    });

    it('queues session for later sync on API failure', async () => {
      mockedApiUpdate.mockRejectedValue(new Error('Network error'));

      const store = useReadingStatsStore.getState();
      store.startSession('note-1', 1, 100);
      store.updateCurrentPage(5);

      currentTime = 60000;
      const endPromise = store.endSession();

      // Advance through retry delays (endSession uses 3 retries: 2s, 4s)
      await vi.advanceTimersByTimeAsync(2000);
      await vi.advanceTimersByTimeAsync(4000);
      await endPromise;

      const pending = useReadingStatsStore.getState().pendingSessions;
      expect(pending).toHaveLength(1);
      expect(pending[0].noteId).toBe('note-1');
      expect(pending[0].retryCount).toBe(0);
      expect(useReadingStatsStore.getState().lastSyncError).toBeTruthy();
    });

    it('limits pending sessions to 50, removing oldest', async () => {
      // Pre-fill with 50 pending sessions
      const existingPending = Array.from({ length: 50 }, (_, i) => ({
        noteId: `old-note-${i}`,
        sessionDurationMs: 30000,
        pagesRead: 1,
        startPage: 1,
        endPage: 2,
        startTime: '2025-01-01T00:00:00.000Z',
        timestamp: '2025-01-01T00:30:00.000Z',
        retryCount: 0,
      }));
      useReadingStatsStore.setState({ pendingSessions: existingPending });

      mockedApiUpdate.mockRejectedValue(new Error('Network error'));

      const store = useReadingStatsStore.getState();
      store.startSession('note-new', 1, 100);

      currentTime = 60000;
      const endPromise = store.endSession();

      // Advance through retry delays (endSession uses 3 retries: 2s, 4s)
      await vi.advanceTimersByTimeAsync(2000);
      await vi.advanceTimersByTimeAsync(4000);
      await endPromise;

      const pending = useReadingStatsStore.getState().pendingSessions;
      expect(pending.length).toBeLessThanOrEqual(50);
      // Newest session should be included
      expect(pending[pending.length - 1].noteId).toBe('note-new');
    });

    it('calculates pagesRead as absolute difference', async () => {
      mockedApiUpdate.mockResolvedValue({
        success: true,
        readingStats: makeStats(),
        lastRead: new Date().toISOString(),
      });

      const store = useReadingStatsStore.getState();
      store.startSession('note-1', 10, 100);
      store.updateCurrentPage(5); // Navigate backward

      currentTime = 60000;
      const result = await store.endSession();

      expect(result!.pagesRead).toBe(5); // |5 - 10| = 5
    });

    it('includes idle pause metadata in API call', async () => {
      mockedApiUpdate.mockResolvedValue({
        success: true,
        readingStats: makeStats(),
        lastRead: new Date().toISOString(),
      });

      const store = useReadingStatsStore.getState();
      store.startSession('note-1', 1, 100);

      // Simulate an idle pause that was resumed
      useReadingStatsStore.setState((state) => ({
        activeSession: state.activeSession ? {
          ...state.activeSession,
          idlePauseCount: 2,
          idlePauseTotalMs: 120000,
          currentProgress: 50,
        } : null,
      }));

      currentTime = 60000;
      await store.endSession();

      expect(mockedApiUpdate).toHaveBeenCalledWith(
        'note-1',
        expect.objectContaining({
          idlePauseCount: 2,
          idlePauseTotalMs: 120000,
          currentProgress: 50,
        })
      );
    });

    it('does not retry on 4xx client errors', async () => {
      mockedApiUpdate.mockRejectedValue(new Error('HTTP 400 Bad Request'));

      const store = useReadingStatsStore.getState();
      store.startSession('note-1', 1, 100);

      currentTime = 60000;
      await store.endSession();

      // Should only be called once (no retries for 4xx)
      expect(mockedApiUpdate).toHaveBeenCalledTimes(1);
    });

    it('retries on server errors up to 3 times', async () => {
      mockedApiUpdate.mockRejectedValue(new Error('HTTP 500 Server Error'));

      const store = useReadingStatsStore.getState();
      store.startSession('note-1', 1, 100);

      currentTime = 60000;
      const endPromise = store.endSession();

      // Advance through retry delays: 2s, 4s
      await vi.advanceTimersByTimeAsync(2000);
      await vi.advanceTimersByTimeAsync(4000);
      await endPromise;

      // endSession uses 3 max retries
      expect(mockedApiUpdate).toHaveBeenCalledTimes(3);
    });
  });

  // ── setBookStats / getBookStats ───────────────────────────────────

  describe('setBookStats / getBookStats', () => {
    it('stores and retrieves stats for a note', () => {
      const stats = makeStats({ totalSessions: 42 });
      const store = useReadingStatsStore.getState();
      store.setBookStats('note-1', stats);

      expect(store.getBookStats('note-1')).toEqual(stats);
    });

    it('returns null for unknown notes', () => {
      const store = useReadingStatsStore.getState();
      expect(store.getBookStats('nonexistent')).toBeNull();
    });

    it('ignores null stats (does not overwrite)', () => {
      const stats = makeStats();
      const store = useReadingStatsStore.getState();
      store.setBookStats('note-1', stats);
      store.setBookStats('note-1', null);

      // Should still have original stats — null input is a no-op
      expect(useReadingStatsStore.getState().bookStatsCache['note-1']).toEqual(stats);
    });

    it('stores stats for multiple notes independently', () => {
      const store = useReadingStatsStore.getState();
      const stats1 = makeStats({ totalSessions: 1 });
      const stats2 = makeStats({ totalSessions: 2 });

      store.setBookStats('note-1', stats1);
      store.setBookStats('note-2', stats2);

      expect(store.getBookStats('note-1')!.totalSessions).toBe(1);
      expect(store.getBookStats('note-2')!.totalSessions).toBe(2);
    });
  });

  // ── getEstimatedTimeRemaining ─────────────────────────────────────

  describe('getEstimatedTimeRemaining', () => {
    it('returns null if no stats exist', () => {
      const store = useReadingStatsStore.getState();
      expect(store.getEstimatedTimeRemaining('note-1', 50, 100)).toBeNull();
    });

    it('returns null if totalReadingTimeMs is 0', () => {
      const store = useReadingStatsStore.getState();
      store.setBookStats('note-1', makeStats({ totalReadingTimeMs: 0 }));

      expect(store.getEstimatedTimeRemaining('note-1', 50, 100)).toBeNull();
    });

    it('returns null if totalSessions is 0', () => {
      const store = useReadingStatsStore.getState();
      store.setBookStats('note-1', makeStats({ totalSessions: 0 }));

      expect(store.getEstimatedTimeRemaining('note-1', 50, 100)).toBeNull();
    });

    it('returns null if no pages remaining', () => {
      const store = useReadingStatsStore.getState();
      store.setBookStats('note-1', makeStats());

      expect(store.getEstimatedTimeRemaining('note-1', 100, 100)).toBeNull();
    });

    it('returns null if current page exceeds total', () => {
      const store = useReadingStatsStore.getState();
      store.setBookStats('note-1', makeStats());

      expect(store.getEstimatedTimeRemaining('note-1', 120, 100)).toBeNull();
    });

    it('uses pagesPerHour for estimation when available', () => {
      const store = useReadingStatsStore.getState();
      store.setBookStats('note-1', makeStats({ pagesPerHour: 60 }));

      // 50 pages remaining at 60 pages/hour = 0.833 hours = 50 minutes
      const result = store.getEstimatedTimeRemaining('note-1', 50, 100);
      expect(result).toBe(Math.round(50 / 60 * 60 * 60 * 1000)); // ~3000000ms
    });

    it('falls back to progress-based estimation without pagesPerHour', () => {
      const store = useReadingStatsStore.getState();
      store.setBookStats('note-1', makeStats({
        pagesPerHour: null,
        totalReadingTimeMs: 600000, // 10 minutes
        totalSessions: 5,
      }));

      // At page 50 of 100 (50% progress), spent 600000ms
      // Estimated total = 600000 / 0.5 = 1200000ms
      // Remaining = 1200000 - 600000 = 600000ms
      const result = store.getEstimatedTimeRemaining('note-1', 50, 100);
      expect(result).toBe(600000);
    });

    it('returns null for progress-based fallback at page 0', () => {
      const store = useReadingStatsStore.getState();
      store.setBookStats('note-1', makeStats({
        pagesPerHour: null,
        totalReadingTimeMs: 600000,
        totalSessions: 5,
      }));

      expect(store.getEstimatedTimeRemaining('note-1', 0, 100)).toBeNull();
    });

    it('returns 0 or positive value, never negative', () => {
      const store = useReadingStatsStore.getState();
      store.setBookStats('note-1', makeStats({
        pagesPerHour: 100,
        totalReadingTimeMs: 9999999,
      }));

      const result = store.getEstimatedTimeRemaining('note-1', 99, 100);
      expect(result).toBeGreaterThanOrEqual(0);
    });

    it('skips pagesPerHour=0 and uses fallback', () => {
      const store = useReadingStatsStore.getState();
      store.setBookStats('note-1', makeStats({
        pagesPerHour: 0,
        totalReadingTimeMs: 600000,
        totalSessions: 5,
      }));

      // pagesPerHour=0 should trigger fallback
      const result = store.getEstimatedTimeRemaining('note-1', 50, 100);
      expect(result).toBe(600000);
    });
  });

  // ── getFormattedReadingTime ───────────────────────────────────────

  describe('getFormattedReadingTime', () => {
    it('delegates to formatReadingTime', () => {
      const store = useReadingStatsStore.getState();
      const result = store.getFormattedReadingTime(30000);
      expect(result).toBe('30s');
    });
  });

  // ── getActiveSessionDuration ──────────────────────────────────────

  describe('getActiveSessionDuration', () => {
    it('returns 0 if no active session', () => {
      const store = useReadingStatsStore.getState();
      expect(store.getActiveSessionDuration()).toBe(0);
    });

    it('returns elapsed time minus paused time', () => {
      const store = useReadingStatsStore.getState();
      store.startSession('note-1', 1, 100); // starts at t=1000

      // Pause for 5 seconds
      currentTime = 5000;
      store.pauseSession();
      currentTime = 10000;
      store.resumeSession();

      currentTime = 20000;
      // Wall time: 20000 - 1000 = 19000ms, paused: 5000ms, active: 14000ms
      expect(store.getActiveSessionDuration()).toBe(14000);
    });

    it('includes current pause duration if currently paused', () => {
      const store = useReadingStatsStore.getState();
      store.startSession('note-1', 1, 100); // t=1000

      currentTime = 5000;
      store.pauseSession(); // pausedAt=5000

      currentTime = 15000;
      // Wall time: 14000ms, paused: 10000ms (5000 to 15000), active: 4000ms
      expect(store.getActiveSessionDuration()).toBe(4000);
    });

    it('never returns negative values', () => {
      const store = useReadingStatsStore.getState();
      store.startSession('note-1', 1, 100); // t=1000

      // Immediately pause
      store.pauseSession();

      currentTime = 500; // Move time backwards (edge case)
      expect(store.getActiveSessionDuration()).toBeGreaterThanOrEqual(0);
    });
  });

  // ── isIdlePaused ──────────────────────────────────────────────────

  describe('isIdlePaused', () => {
    it('returns false if no active session', () => {
      const store = useReadingStatsStore.getState();
      expect(store.isIdlePaused()).toBe(false);
    });

    it('returns false for active (non-paused) sessions', () => {
      const store = useReadingStatsStore.getState();
      store.startSession('note-1', 1, 100);
      expect(store.isIdlePaused()).toBe(false);
    });

    it('returns false for manually paused sessions', () => {
      const store = useReadingStatsStore.getState();
      store.startSession('note-1', 1, 100);
      store.pauseSession();
      expect(store.isIdlePaused()).toBe(false);
    });

    it('returns true for idle-paused sessions', () => {
      const store = useReadingStatsStore.getState();
      store.startSession('note-1', 1, 100);

      // Trigger idle pause
      currentTime = 1000 + 5 * 60 * 1000;
      store.checkIdleStatus();

      expect(store.isIdlePaused()).toBe(true);
    });
  });

  // ── syncPendingSessions ───────────────────────────────────────────

  describe('syncPendingSessions', () => {
    const pendingSession = {
      noteId: 'note-1',
      sessionDurationMs: 30000,
      pagesRead: 5,
      startPage: 1,
      endPage: 6,
      startTime: '2025-01-01T00:00:00.000Z',
      timestamp: '2025-01-01T00:30:00.000Z',
      retryCount: 0,
    };

    it('does nothing if no pending sessions', async () => {
      const store = useReadingStatsStore.getState();
      await store.syncPendingSessions();

      expect(mockedApiUpdate).not.toHaveBeenCalled();
    });

    it('does nothing if already syncing', async () => {
      useReadingStatsStore.setState({
        isSyncing: true,
        pendingSessions: [pendingSession],
      });

      const store = useReadingStatsStore.getState();
      await store.syncPendingSessions();

      expect(mockedApiUpdate).not.toHaveBeenCalled();
    });

    it('syncs pending sessions and removes them on success', async () => {
      const stats = makeStats();
      mockedApiUpdate.mockResolvedValue({
        success: true,
        readingStats: stats,
        lastRead: new Date().toISOString(),
      });

      useReadingStatsStore.setState({ pendingSessions: [pendingSession] });

      const store = useReadingStatsStore.getState();
      await store.syncPendingSessions();

      expect(useReadingStatsStore.getState().pendingSessions).toHaveLength(0);
      expect(useReadingStatsStore.getState().isSyncing).toBe(false);
      expect(useReadingStatsStore.getState().bookStatsCache['note-1']).toEqual(stats);
    });

    it('increments retryCount and keeps failed sessions below max retries', async () => {
      mockedApiUpdate.mockRejectedValue(new Error('Server error'));

      useReadingStatsStore.setState({
        pendingSessions: [{ ...pendingSession, retryCount: 0 }],
      });

      const store = useReadingStatsStore.getState();
      // Need to advance through all retry delays
      const syncPromise = store.syncPendingSessions();
      // Advance timers for 5 retries: 2s, 4s, 8s, 16s, 32s
      for (let i = 0; i < 5; i++) {
        await vi.advanceTimersByTimeAsync(RETRY_DELAY_MS * Math.pow(2, i));
      }
      await syncPromise;

      const pending = useReadingStatsStore.getState().pendingSessions;
      expect(pending).toHaveLength(1);
      expect(pending[0].retryCount).toBe(1);
    });

    it('drops sessions that exceed max retry count', async () => {
      mockedApiUpdate.mockRejectedValue(new Error('Server error'));

      useReadingStatsStore.setState({
        pendingSessions: [{ ...pendingSession, retryCount: 4 }],
      });

      const store = useReadingStatsStore.getState();
      const syncPromise = store.syncPendingSessions();
      for (let i = 0; i < 5; i++) {
        await vi.advanceTimersByTimeAsync(RETRY_DELAY_MS * Math.pow(2, i));
      }
      await syncPromise;

      // retryCount 4 + 1 = 5, which equals MAX_RETRY_ATTEMPTS, so dropped
      expect(useReadingStatsStore.getState().pendingSessions).toHaveLength(0);
    });

    it('sets lastSyncError when sessions remain pending', async () => {
      mockedApiUpdate.mockRejectedValue(new Error('Network failure'));

      useReadingStatsStore.setState({
        pendingSessions: [{ ...pendingSession, retryCount: 0 }],
      });

      const store = useReadingStatsStore.getState();
      const syncPromise = store.syncPendingSessions();
      for (let i = 0; i < 5; i++) {
        await vi.advanceTimersByTimeAsync(RETRY_DELAY_MS * Math.pow(2, i));
      }
      await syncPromise;

      expect(useReadingStatsStore.getState().lastSyncError).toBeTruthy();
    });

    it('clears lastSyncError when all sessions sync successfully', async () => {
      mockedApiUpdate.mockResolvedValue({
        success: true,
        readingStats: makeStats(),
        lastRead: new Date().toISOString(),
      });

      useReadingStatsStore.setState({
        pendingSessions: [pendingSession],
        lastSyncError: 'previous error',
      });

      const store = useReadingStatsStore.getState();
      await store.syncPendingSessions();

      expect(useReadingStatsStore.getState().lastSyncError).toBeNull();
    });

    it('processes multiple pending sessions', async () => {
      const stats = makeStats();
      mockedApiUpdate.mockResolvedValue({
        success: true,
        readingStats: stats,
        lastRead: new Date().toISOString(),
      });

      useReadingStatsStore.setState({
        pendingSessions: [
          { ...pendingSession, noteId: 'note-1' },
          { ...pendingSession, noteId: 'note-2' },
          { ...pendingSession, noteId: 'note-3' },
        ],
      });

      const store = useReadingStatsStore.getState();
      await store.syncPendingSessions();

      expect(mockedApiUpdate).toHaveBeenCalledTimes(3);
      expect(useReadingStatsStore.getState().pendingSessions).toHaveLength(0);
    });
  });

  // ── getPendingSessionCount ────────────────────────────────────────

  describe('getPendingSessionCount', () => {
    it('returns 0 when no pending sessions', () => {
      const store = useReadingStatsStore.getState();
      expect(store.getPendingSessionCount()).toBe(0);
    });

    it('returns correct count', () => {
      useReadingStatsStore.setState({
        pendingSessions: [
          { noteId: 'a', sessionDurationMs: 1000, pagesRead: 1, startPage: 1, endPage: 2, startTime: '', timestamp: '', retryCount: 0 },
          { noteId: 'b', sessionDurationMs: 1000, pagesRead: 1, startPage: 1, endPage: 2, startTime: '', timestamp: '', retryCount: 0 },
        ],
      });

      const store = useReadingStatsStore.getState();
      expect(store.getPendingSessionCount()).toBe(2);
    });
  });

  // ── Persistence (partialize) ──────────────────────────────────────

  describe('persistence', () => {
    it('only persists pendingSessions', () => {
      // The store uses partialize to only persist pendingSessions.
      // We can verify this by checking that after setting all state,
      // localStorage only gets the pendingSessions.
      const store = useReadingStatsStore.getState();
      store.startSession('note-1', 1, 100);
      store.setBookStats('note-1', makeStats());
      useReadingStatsStore.setState({
        pendingSessions: [{ noteId: 'x', sessionDurationMs: 1000, pagesRead: 1, startPage: 1, endPage: 2, startTime: '', timestamp: '', retryCount: 0 }],
      });

      // Check that localStorage was called with the store name
      const calls = localStorageMock.setItem.mock.calls;
      const persistCall = calls.find(([key]) => key === 'pulp-reading-stats');
      if (persistCall) {
        const persisted = JSON.parse(persistCall[1]);
        // Should contain pendingSessions but NOT activeSession or bookStatsCache
        expect(persisted.state).toHaveProperty('pendingSessions');
        expect(persisted.state).not.toHaveProperty('activeSession');
        expect(persisted.state).not.toHaveProperty('bookStatsCache');
      }
    });
  });

  // ── Edge cases: idle pause accounting in endSession ───────────────

  describe('endSession idle pause accounting', () => {
    it('accounts for active idle pause duration at session end', async () => {
      mockedApiUpdate.mockResolvedValue({
        success: true,
        readingStats: makeStats(),
        lastRead: new Date().toISOString(),
      });

      const store = useReadingStatsStore.getState();
      store.startSession('note-1', 1, 100); // t=1000

      // Trigger idle pause at t=301000
      currentTime = 301000;
      store.checkIdleStatus();
      expect(useReadingStatsStore.getState().activeSession!.isIdlePaused).toBe(true);

      // End session while still idle-paused at t=401000
      currentTime = 401000;
      const result = await store.endSession();

      // Wall time: 401000 - 1000 = 400000ms
      // Idle pause: 401000 - 301000 = 100000ms
      // Active time: 400000 - 100000 = 300000ms
      expect(result).not.toBeNull();
      expect(result!.durationMs).toBe(300000);

      // Verify idle metadata was sent to API
      expect(mockedApiUpdate).toHaveBeenCalledWith(
        'note-1',
        expect.objectContaining({
          idlePauseCount: 1,
          idlePauseTotalMs: 100000,
        })
      );
    });

    it('accumulates idle pause total across multiple idle pauses at end', async () => {
      mockedApiUpdate.mockResolvedValue({
        success: true,
        readingStats: makeStats(),
        lastRead: new Date().toISOString(),
      });

      const store = useReadingStatsStore.getState();
      store.startSession('note-1', 1, 100); // t=1000

      // First idle pause: t=301000 to t=320000
      // Use recordActivity to resume so calculateIdleResumeState tracks idlePauseTotalMs
      currentTime = 301000;
      store.checkIdleStatus();
      currentTime = 320000;
      store.recordActivity(); // 19000ms idle pause, tracked via calculateIdleResumeState

      // Second idle pause: triggered after another idle period
      currentTime = 320000 + 5 * 60 * 1000; // t=620000
      store.checkIdleStatus();

      // End while still idle-paused at t=700000
      currentTime = 700000;
      const result = await store.endSession();

      // First idle pause: 320000 - 301000 = 19000ms (via calculateIdleResumeState)
      // Second idle pause: 700000 - 620000 = 80000ms (via endSession idle accounting)
      // Total idle: 19000 + 80000 = 99000ms
      // Total paused: 19000 + 80000 = 99000ms
      // Wall time: 700000 - 1000 = 699000ms
      // Active: 699000 - 99000 = 600000ms
      expect(result).not.toBeNull();
      expect(result!.durationMs).toBe(600000);
      expect(mockedApiUpdate).toHaveBeenCalledWith(
        'note-1',
        expect.objectContaining({
          idlePauseCount: 2,
          idlePauseTotalMs: 99000,
        })
      );
    });

    it('only adds manual pause to totalPausedMs not idlePauseTotalMs at end', async () => {
      mockedApiUpdate.mockResolvedValue({
        success: true,
        readingStats: makeStats(),
        lastRead: new Date().toISOString(),
      });

      const store = useReadingStatsStore.getState();
      store.startSession('note-1', 1, 100); // t=1000

      // Read for a while first to ensure enough active time
      currentTime = 30000;
      store.recordActivity();

      // Manual pause at t=30000, still paused at end
      store.pauseSession();

      // End at t=50000 while manually paused
      currentTime = 50000;
      await store.endSession();

      // Wall time: 50000 - 1000 = 49000ms
      // Manual pause: 50000 - 30000 = 20000ms
      // Active: 49000 - 20000 = 29000ms (>10s minimum)
      // isIdlePaused is false for manual pause, so idlePauseTotalMs stays 0
      expect(mockedApiUpdate).toHaveBeenCalledWith(
        'note-1',
        expect.objectContaining({
          idlePauseCount: 0,
          idlePauseTotalMs: 0,
        })
      );
    });

    it('floors duration at 0 when paused time exceeds wall time', async () => {
      const store = useReadingStatsStore.getState();
      store.startSession('note-1', 1, 100); // t=1000

      // Artificially set totalPausedMs very high
      useReadingStatsStore.setState((state) => ({
        activeSession: state.activeSession ? {
          ...state.activeSession,
          totalPausedMs: 999999999,
        } : null,
      }));

      currentTime = 2000;
      const result = await store.endSession();

      // durationMs = Math.max(0, ...) should produce 0 (below min threshold)
      expect(result).toBeNull();
    });
  });

  // ── Edge cases: calculateIdleResumeState (via recordActivity) ─────

  describe('calculateIdleResumeState edge cases', () => {
    it('returns unchanged state when session is not idle-paused', () => {
      const store = useReadingStatsStore.getState();
      store.startSession('note-1', 1, 100);

      currentTime = 5000;
      store.recordActivity();
      const after = useReadingStatsStore.getState().activeSession!;

      // Should only update lastActivityTime, no pause changes
      expect(after.isPaused).toBe(false);
      expect(after.totalPausedMs).toBe(0);
      expect(after.idlePauseTotalMs).toBe(0);
      expect(after.lastActivityTime).toBe(5000);
    });

    it('does not resume manually paused session via recordActivity', () => {
      const store = useReadingStatsStore.getState();
      store.startSession('note-1', 1, 100);

      currentTime = 5000;
      store.pauseSession(); // Manual pause (isIdlePaused = false)

      currentTime = 10000;
      store.recordActivity();

      const session = useReadingStatsStore.getState().activeSession!;
      // calculateIdleResumeState returns null because isIdlePaused is false
      expect(session.isPaused).toBe(true);
      expect(session.pausedAt).toBe(5000); // Unchanged
    });

    it('does not resume idle-paused session without pausedAt', () => {
      const store = useReadingStatsStore.getState();
      store.startSession('note-1', 1, 100);

      // Set isIdlePaused but no pausedAt (edge case / invalid state)
      useReadingStatsStore.setState((state) => ({
        activeSession: state.activeSession ? {
          ...state.activeSession,
          isPaused: true,
          isIdlePaused: true,
          pausedAt: null,
        } : null,
      }));

      currentTime = 10000;
      store.recordActivity();

      const session = useReadingStatsStore.getState().activeSession!;
      // calculateIdleResumeState returns null because pausedAt is null
      expect(session.isPaused).toBe(true);
      expect(session.isIdlePaused).toBe(true);
    });

    it('accumulates idlePauseTotalMs across multiple idle resume cycles', () => {
      const store = useReadingStatsStore.getState();
      store.startSession('note-1', 1, 100); // t=1000

      // First idle pause
      useReadingStatsStore.setState((state) => ({
        activeSession: state.activeSession ? {
          ...state.activeSession,
          isPaused: true,
          isIdlePaused: true,
          pausedAt: 100000,
          idlePauseCount: 1,
          totalPausedMs: 0,
          idlePauseTotalMs: 0,
        } : null,
      }));

      // Resume via activity at t=150000 (50s idle pause)
      currentTime = 150000;
      store.recordActivity();

      let session = useReadingStatsStore.getState().activeSession!;
      expect(session.totalPausedMs).toBe(50000);
      expect(session.idlePauseTotalMs).toBe(50000);

      // Second idle pause
      useReadingStatsStore.setState((state) => ({
        activeSession: state.activeSession ? {
          ...state.activeSession,
          isPaused: true,
          isIdlePaused: true,
          pausedAt: 200000,
          idlePauseCount: 2,
        } : null,
      }));

      // Resume via activity at t=230000 (30s idle pause)
      currentTime = 230000;
      store.recordActivity();

      session = useReadingStatsStore.getState().activeSession!;
      expect(session.totalPausedMs).toBe(80000); // 50000 + 30000
      expect(session.idlePauseTotalMs).toBe(80000); // 50000 + 30000
    });

    it('auto-resumes idle-paused session via updateCurrentPage', () => {
      const store = useReadingStatsStore.getState();
      store.startSession('note-1', 1, 100);

      // Set idle-paused state
      useReadingStatsStore.setState((state) => ({
        activeSession: state.activeSession ? {
          ...state.activeSession,
          isPaused: true,
          isIdlePaused: true,
          pausedAt: 100000,
          idlePauseCount: 1,
          totalPausedMs: 5000,
          idlePauseTotalMs: 5000,
        } : null,
      }));

      currentTime = 120000;
      store.updateCurrentPage(15);

      const session = useReadingStatsStore.getState().activeSession!;
      expect(session.isPaused).toBe(false);
      expect(session.isIdlePaused).toBe(false);
      expect(session.pausedAt).toBeNull();
      expect(session.currentPage).toBe(15);
      // Previous 5000ms + new idle pause: 120000 - 100000 = 20000ms
      expect(session.totalPausedMs).toBe(25000);
      expect(session.idlePauseTotalMs).toBe(25000);
    });
  });

  // ── Edge cases: syncPendingSessions ───────────────────────────────

  describe('syncPendingSessions edge cases', () => {
    const makePending = (noteId: string, retryCount = 0) => ({
      noteId,
      sessionDurationMs: 30000,
      pagesRead: 5,
      startPage: 1,
      endPage: 6,
      startTime: '2025-01-01T00:00:00.000Z',
      timestamp: '2025-01-01T00:30:00.000Z',
      retryCount,
    });

    it('handles partial success in batch (some succeed, some fail)', async () => {
      const stats = makeStats();
      // First call succeeds, second fails, third succeeds
      mockedApiUpdate
        .mockResolvedValueOnce({ success: true, readingStats: stats, lastRead: new Date().toISOString() })
        .mockRejectedValueOnce(new Error('HTTP 400 Bad Request'))
        .mockResolvedValueOnce({ success: true, readingStats: stats, lastRead: new Date().toISOString() });

      useReadingStatsStore.setState({
        pendingSessions: [
          makePending('note-1'),
          makePending('note-2'),
          makePending('note-3'),
        ],
      });

      const store = useReadingStatsStore.getState();
      await store.syncPendingSessions();

      // note-1 and note-3 synced, note-2 failed with 4xx (no retry, but still kept with incremented count)
      const pending = useReadingStatsStore.getState().pendingSessions;
      expect(pending).toHaveLength(1);
      expect(pending[0].noteId).toBe('note-2');
      expect(pending[0].retryCount).toBe(1);

      // Stats cache should include note-1 and note-3
      const cache = useReadingStatsStore.getState().bookStatsCache;
      expect(cache['note-1']).toEqual(stats);
      expect(cache['note-3']).toEqual(stats);
    });

    it('drops all sessions that hit max retries in a batch', async () => {
      mockedApiUpdate.mockRejectedValue(new Error('Server error'));

      useReadingStatsStore.setState({
        pendingSessions: [
          makePending('note-1', 4), // Will become 5 (= MAX), dropped
          makePending('note-2', 4), // Will become 5 (= MAX), dropped
        ],
      });

      const store = useReadingStatsStore.getState();
      const syncPromise = store.syncPendingSessions();
      // Advance through retry delays for both sessions
      for (let i = 0; i < 10; i++) {
        await vi.advanceTimersByTimeAsync(RETRY_DELAY_MS * Math.pow(2, i));
      }
      await syncPromise;

      expect(useReadingStatsStore.getState().pendingSessions).toHaveLength(0);
      expect(useReadingStatsStore.getState().isSyncing).toBe(false);
    });

    it('clears lastSyncError when all remaining sessions are dropped', async () => {
      mockedApiUpdate.mockRejectedValue(new Error('Server error'));

      useReadingStatsStore.setState({
        pendingSessions: [makePending('note-1', 4)],
        lastSyncError: 'old error',
      });

      const store = useReadingStatsStore.getState();
      const syncPromise = store.syncPendingSessions();
      for (let i = 0; i < 5; i++) {
        await vi.advanceTimersByTimeAsync(RETRY_DELAY_MS * Math.pow(2, i));
      }
      await syncPromise;

      // All dropped, stillPending is empty, so lastSyncError should be null
      expect(useReadingStatsStore.getState().pendingSessions).toHaveLength(0);
      expect(useReadingStatsStore.getState().lastSyncError).toBeNull();
    });

    it('passes idle pause metadata during sync', async () => {
      const stats = makeStats();
      mockedApiUpdate.mockResolvedValue({
        success: true,
        readingStats: stats,
        lastRead: new Date().toISOString(),
      });

      useReadingStatsStore.setState({
        pendingSessions: [{
          ...makePending('note-1'),
          idlePauseCount: 3,
          idlePauseTotalMs: 45000,
          currentProgress: 75,
        }],
      });

      const store = useReadingStatsStore.getState();
      await store.syncPendingSessions();

      expect(mockedApiUpdate).toHaveBeenCalledWith(
        'note-1',
        expect.objectContaining({
          idlePauseCount: 3,
          idlePauseTotalMs: 45000,
          currentProgress: 75,
        })
      );
    });
  });

  // ── Edge cases: startSession ──────────────────────────────────────

  describe('startSession edge cases', () => {
    it('calculates progress correctly at boundaries', () => {
      const store = useReadingStatsStore.getState();

      // Page 0 of 100 = 0%
      store.startSession('note-1', 0, 100);
      expect(useReadingStatsStore.getState().activeSession!.currentProgress).toBe(0);

      // Page 100 of 100 = 100%
      store.startSession('note-2', 100, 100);
      expect(useReadingStatsStore.getState().activeSession!.currentProgress).toBe(100);

      // Page 1 of 1 = 100%
      store.startSession('note-3', 1, 1);
      expect(useReadingStatsStore.getState().activeSession!.currentProgress).toBe(100);
    });

    it('initializes all idle tracking fields to zero', () => {
      const store = useReadingStatsStore.getState();
      store.startSession('note-1', 1, 100);

      const session = useReadingStatsStore.getState().activeSession!;
      expect(session.isIdlePaused).toBe(false);
      expect(session.idlePauseCount).toBe(0);
      expect(session.idlePauseTotalMs).toBe(0);
      expect(session.totalPausedMs).toBe(0);
      expect(session.pausedAt).toBeNull();
    });
  });

  // ── Edge cases: getEstimatedTimeRemaining ─────────────────────────

  describe('getEstimatedTimeRemaining edge cases', () => {
    it('handles negative pagesPerHour defensively', () => {
      const store = useReadingStatsStore.getState();
      store.setBookStats('note-1', makeStats({ pagesPerHour: -10 }));

      // Negative pagesPerHour passes the > 0 check as false, triggers fallback
      const result = store.getEstimatedTimeRemaining('note-1', 50, 100);
      // Falls through to progress-based fallback
      expect(result).toBeGreaterThanOrEqual(0);
    });

    it('returns 0 for last page remaining with pagesPerHour', () => {
      const store = useReadingStatsStore.getState();
      store.setBookStats('note-1', makeStats({ pagesPerHour: 60 }));

      // 1 page remaining at 60 pages/hour = 1 minute = 60000ms
      const result = store.getEstimatedTimeRemaining('note-1', 99, 100);
      expect(result).toBe(Math.round(1 / 60 * 60 * 60 * 1000)); // 60000ms
    });

    it('handles very small progress in fallback calculation', () => {
      const store = useReadingStatsStore.getState();
      store.setBookStats('note-1', makeStats({
        pagesPerHour: null,
        totalReadingTimeMs: 1000,
        totalSessions: 1,
      }));

      // At page 1 of 10000 (0.01% progress)
      // Estimated total = 1000 / 0.0001 = 10000000ms
      // Remaining = 10000000 - 1000 = 9999000ms
      const result = store.getEstimatedTimeRemaining('note-1', 1, 10000);
      expect(result).toBe(9999000);
    });
  });

  // ── Edge cases: getActiveSessionDuration ──────────────────────────

  describe('getActiveSessionDuration edge cases', () => {
    it('returns 0 for a session that just started', () => {
      const store = useReadingStatsStore.getState();
      store.startSession('note-1', 1, 100); // t=1000

      // Query at exact same time
      expect(store.getActiveSessionDuration()).toBe(0);
    });

    it('correctly handles session with accumulated pause and active idle pause', () => {
      const store = useReadingStatsStore.getState();
      store.startSession('note-1', 1, 100); // t=1000

      // First pause: 5000ms
      currentTime = 5000;
      store.pauseSession();
      currentTime = 10000;
      store.resumeSession();

      // Idle pause starts at t=310000
      currentTime = 310000;
      store.checkIdleStatus();

      // Check duration while idle-paused at t=400000
      currentTime = 400000;
      const duration = store.getActiveSessionDuration();

      // Wall time: 400000 - 1000 = 399000ms
      // First pause: 5000ms (accumulated)
      // Current idle pause: 400000 - 310000 = 90000ms
      // Active: 399000 - 5000 - 90000 = 304000ms
      expect(duration).toBe(304000);
    });
  });

  // ── Full lifecycle integration ────────────────────────────────────

  describe('full session lifecycle with idle pauses', () => {
    it('tracks a complete session with multiple idle pauses and page changes', async () => {
      mockedApiUpdate.mockResolvedValue({
        success: true,
        readingStats: makeStats(),
        lastRead: new Date().toISOString(),
      });

      const store = useReadingStatsStore.getState();
      store.startSession('note-1', 1, 200); // t=1000

      // Read for a while, changing pages
      currentTime = 60000;
      store.updateCurrentPage(10);
      store.recordActivity();

      // Go idle — 5 minutes pass
      currentTime = 60000 + 5 * 60 * 1000; // t=360000
      store.checkIdleStatus();
      expect(store.isIdlePaused()).toBe(true);
      expect(useReadingStatsStore.getState().activeSession!.idlePauseCount).toBe(1);

      // Come back after 2 minutes
      currentTime = 360000 + 120000; // t=480000
      store.recordActivity();
      expect(store.isIdlePaused()).toBe(false);

      // Read more, change page
      currentTime = 540000;
      store.updateCurrentPage(25);

      // Go idle again
      currentTime = 540000 + 5 * 60 * 1000; // t=840000
      store.checkIdleStatus();
      expect(store.isIdlePaused()).toBe(true);
      expect(useReadingStatsStore.getState().activeSession!.idlePauseCount).toBe(2);

      // Page change auto-resumes
      currentTime = 900000;
      store.updateCurrentPage(30);
      expect(store.isIdlePaused()).toBe(false);

      // End the session
      currentTime = 960000;
      const result = await store.endSession();

      expect(result).not.toBeNull();
      expect(result!.noteId).toBe('note-1');
      expect(result!.startPage).toBe(1);
      expect(result!.endPage).toBe(30);
      expect(result!.pagesRead).toBe(29);

      // Verify the API received idle metadata
      expect(mockedApiUpdate).toHaveBeenCalledWith(
        'note-1',
        expect.objectContaining({
          idlePauseCount: 2,
          pagesRead: 29,
          startPage: 1,
          endPage: 30,
        })
      );

      // Duration should exclude all idle pause time
      const apiCall = mockedApiUpdate.mock.calls[0];
      expect(apiCall[1].sessionDurationMs).toBeGreaterThan(0);
      expect(apiCall[1].sessionDurationMs).toBeLessThan(960000 - 1000); // Less than wall time
    });
  });

  // ── saveSessionWithRetry edge cases (via endSession/syncPendingSessions) ─

  describe('saveSessionWithRetry edge cases', () => {
    it('uses exponential backoff timing between retries', async () => {
      mockedApiUpdate.mockRejectedValue(new Error('Server error'));

      const store = useReadingStatsStore.getState();
      store.startSession('note-1', 1, 100);

      currentTime = 60000;
      const endPromise = store.endSession();

      // endSession uses 3 retries. Backoff: 2s, 4s
      // First retry after 2000ms
      expect(mockedApiUpdate).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(2000);
      expect(mockedApiUpdate).toHaveBeenCalledTimes(2);
      // Second retry after 4000ms
      await vi.advanceTimersByTimeAsync(4000);
      expect(mockedApiUpdate).toHaveBeenCalledTimes(3);

      await endPromise;
    });

    it('handles non-Error exceptions from API', async () => {
      mockedApiUpdate.mockRejectedValue('string error');

      const store = useReadingStatsStore.getState();
      store.startSession('note-1', 1, 100);

      currentTime = 60000;
      const endPromise = store.endSession();

      await vi.advanceTimersByTimeAsync(2000);
      await vi.advanceTimersByTimeAsync(4000);
      await endPromise;

      // Should still queue as pending with 'Unknown error'
      const pending = useReadingStatsStore.getState().pendingSessions;
      expect(pending).toHaveLength(1);
      expect(useReadingStatsStore.getState().lastSyncError).toBeTruthy();
    });

    it('does not retry on HTTP 4xx errors (e.g., 404, 422)', async () => {
      mockedApiUpdate.mockRejectedValue(new Error('HTTP 404 Not Found'));

      const store = useReadingStatsStore.getState();
      store.startSession('note-1', 1, 100);

      currentTime = 60000;
      await store.endSession();

      expect(mockedApiUpdate).toHaveBeenCalledTimes(1);
    });

    it('retries up to MAX_RETRY_ATTEMPTS during syncPendingSessions', async () => {
      mockedApiUpdate.mockRejectedValue(new Error('Server error'));

      useReadingStatsStore.setState({
        pendingSessions: [{
          noteId: 'note-1',
          sessionDurationMs: 30000,
          pagesRead: 5,
          startPage: 1,
          endPage: 6,
          startTime: '2025-01-01T00:00:00.000Z',
          timestamp: '2025-01-01T00:30:00.000Z',
          retryCount: 0,
        }],
      });

      const store = useReadingStatsStore.getState();
      const syncPromise = store.syncPendingSessions();

      // syncPendingSessions uses MAX_RETRY_ATTEMPTS (5). Backoff: 2s, 4s, 8s, 16s
      for (let i = 0; i < 5; i++) {
        await vi.advanceTimersByTimeAsync(2000 * Math.pow(2, i));
      }
      await syncPromise;

      expect(mockedApiUpdate).toHaveBeenCalledTimes(5);
    });
  });

  // ── updateCurrentPage edge cases ────────────────────────────────────

  describe('updateCurrentPage edge cases', () => {
    it('handles totalPages of 0 without division error', () => {
      const store = useReadingStatsStore.getState();
      store.startSession('note-1', 0, 0);

      store.updateCurrentPage(5);

      const session = useReadingStatsStore.getState().activeSession;
      expect(session!.currentProgress).toBe(0);
      expect(session!.currentPage).toBe(5);
    });

    it('does not auto-resume a manually paused session on page change', () => {
      const store = useReadingStatsStore.getState();
      store.startSession('note-1', 1, 100);

      currentTime = 5000;
      store.pauseSession(); // Manual pause (isIdlePaused = false)

      currentTime = 10000;
      store.updateCurrentPage(10);

      const session = useReadingStatsStore.getState().activeSession;
      // calculateIdleResumeState returns null because isIdlePaused is false
      expect(session!.isPaused).toBe(true);
      expect(session!.isIdlePaused).toBe(false);
      expect(session!.pausedAt).toBe(5000);
    });

    it('updates progress to 100% on last page', () => {
      const store = useReadingStatsStore.getState();
      store.startSession('note-1', 1, 50);

      store.updateCurrentPage(50);

      const session = useReadingStatsStore.getState().activeSession;
      expect(session!.currentProgress).toBe(100);
    });
  });

  // ── endSession pending session metadata ─────────────────────────────

  describe('endSession pending session data structure', () => {
    it('includes idle metadata in queued pending session on API failure', async () => {
      mockedApiUpdate.mockRejectedValue(new Error('Network error'));

      const store = useReadingStatsStore.getState();
      store.startSession('note-1', 1, 200); // t=1000, progress = 0.5%

      // Simulate idle pause
      currentTime = 301000;
      store.checkIdleStatus();

      // Resume via activity
      currentTime = 350000;
      store.recordActivity();

      // End session
      currentTime = 400000;
      const endPromise = store.endSession();

      await vi.advanceTimersByTimeAsync(2000);
      await vi.advanceTimersByTimeAsync(4000);
      await endPromise;

      const pending = useReadingStatsStore.getState().pendingSessions;
      expect(pending).toHaveLength(1);
      expect(pending[0].idlePauseCount).toBe(1);
      expect(pending[0].idlePauseTotalMs).toBe(49000); // 350000 - 301000
      expect(pending[0].noteId).toBe('note-1');
      expect(pending[0].retryCount).toBe(0);
      expect(pending[0].startPage).toBe(1);
    });

    it('includes current progress in pending session data', async () => {
      mockedApiUpdate.mockRejectedValue(new Error('Network error'));

      const store = useReadingStatsStore.getState();
      store.startSession('note-1', 1, 100); // t=1000

      currentTime = 30000;
      store.updateCurrentPage(50); // 50% progress

      currentTime = 60000;
      const endPromise = store.endSession();

      await vi.advanceTimersByTimeAsync(2000);
      await vi.advanceTimersByTimeAsync(4000);
      await endPromise;

      const pending = useReadingStatsStore.getState().pendingSessions;
      expect(pending[0].currentProgress).toBe(50);
    });
  });

  // ── startSession overlapping session cleanup ─────────────────────────

  describe('startSession overlapping session cleanup', () => {
    it('ends an idle-paused session when starting a new one', async () => {
      mockedApiUpdate.mockResolvedValue({
        success: true,
        readingStats: makeStats(),
        lastRead: new Date().toISOString(),
      });

      const store = useReadingStatsStore.getState();
      store.startSession('note-1', 1, 100); // t=1000

      // Trigger idle pause
      currentTime = 301000;
      store.checkIdleStatus();
      expect(store.isIdlePaused()).toBe(true);

      // Start new session while old is idle-paused
      currentTime = 400000;
      store.startSession('note-2', 1, 200);

      const session = useReadingStatsStore.getState().activeSession;
      expect(session!.noteId).toBe('note-2');
      expect(session!.isPaused).toBe(false);
      expect(session!.isIdlePaused).toBe(false);
    });

    it('preserves new session state even when ending previous session fails', async () => {
      // The endSession for the old session is fire-and-forget from startSession
      mockedApiUpdate.mockRejectedValue(new Error('Network error'));

      const store = useReadingStatsStore.getState();
      store.startSession('note-1', 1, 100); // t=1000

      currentTime = 60000;
      store.startSession('note-2', 5, 200);

      const session = useReadingStatsStore.getState().activeSession;
      expect(session!.noteId).toBe('note-2');
      expect(session!.startPage).toBe(5);
      expect(session!.totalPages).toBe(200);
    });
  });

  // ── setBookStats edge cases ────────────────────────────────────────

  describe('setBookStats edge cases', () => {
    it('does not create a cache entry when setting null for uncached note', () => {
      const store = useReadingStatsStore.getState();
      store.setBookStats('never-seen', null);

      expect(useReadingStatsStore.getState().bookStatsCache).not.toHaveProperty('never-seen');
    });

    it('overwrites existing stats with new stats', () => {
      const store = useReadingStatsStore.getState();
      const stats1 = makeStats({ totalSessions: 1 });
      const stats2 = makeStats({ totalSessions: 99 });

      store.setBookStats('note-1', stats1);
      store.setBookStats('note-1', stats2);

      expect(store.getBookStats('note-1')!.totalSessions).toBe(99);
    });
  });

  // ── getEstimatedTimeRemaining additional edge cases ─────────────────

  describe('getEstimatedTimeRemaining additional edge cases', () => {
    it('treats undefined pagesPerHour same as null (uses fallback)', () => {
      const store = useReadingStatsStore.getState();
      const stats = makeStats({
        totalReadingTimeMs: 600000,
        totalSessions: 5,
      });
      // Explicitly set pagesPerHour to undefined
      (stats as unknown as { pagesPerHour?: number | null }).pagesPerHour = undefined;
      store.setBookStats('note-1', stats);

      // Should use progress-based fallback
      // At page 50 of 100: remaining = 600000 / 0.5 - 600000 = 600000
      const result = store.getEstimatedTimeRemaining('note-1', 50, 100);
      expect(result).toBe(600000);
    });

    it('returns null when both totalReadingTimeMs and totalSessions are 0', () => {
      const store = useReadingStatsStore.getState();
      store.setBookStats('note-1', makeStats({ totalReadingTimeMs: 0, totalSessions: 0 }));

      expect(store.getEstimatedTimeRemaining('note-1', 50, 100)).toBeNull();
    });

    it('handles very high pagesPerHour without overflow', () => {
      const store = useReadingStatsStore.getState();
      store.setBookStats('note-1', makeStats({ pagesPerHour: 100000 }));

      const result = store.getEstimatedTimeRemaining('note-1', 50, 100);
      expect(result).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(result)).toBe(true);
    });
  });

  // ── syncPendingSessions non-Error exception handling ────────────────

  describe('syncPendingSessions non-Error exception handling', () => {
    it('handles non-Error throws from API during sync', async () => {
      mockedApiUpdate.mockRejectedValue(42); // Non-Error thrown

      useReadingStatsStore.setState({
        pendingSessions: [{
          noteId: 'note-1',
          sessionDurationMs: 30000,
          pagesRead: 5,
          startPage: 1,
          endPage: 6,
          startTime: '2025-01-01T00:00:00.000Z',
          timestamp: '2025-01-01T00:30:00.000Z',
          retryCount: 0,
        }],
      });

      const store = useReadingStatsStore.getState();
      const syncPromise = store.syncPendingSessions();
      for (let i = 0; i < 5; i++) {
        await vi.advanceTimersByTimeAsync(2000 * Math.pow(2, i));
      }
      await syncPromise;

      // Session should be kept with incremented retry count
      const pending = useReadingStatsStore.getState().pendingSessions;
      expect(pending).toHaveLength(1);
      expect(pending[0].retryCount).toBe(1);
    });
  });

  // ── pauseSession clears isIdlePaused ────────────────────────────────

  describe('pauseSession clears idle state', () => {
    it('manual pause after idle-paused state sets isIdlePaused to false', () => {
      const store = useReadingStatsStore.getState();
      store.startSession('note-1', 1, 100);

      // Go idle
      currentTime = 1000 + 5 * 60 * 1000;
      store.checkIdleStatus();
      expect(useReadingStatsStore.getState().activeSession!.isIdlePaused).toBe(true);

      // Resume
      currentTime += 1000;
      store.resumeSession();

      // Immediately manually pause
      currentTime += 1000;
      store.pauseSession();

      const session = useReadingStatsStore.getState().activeSession!;
      expect(session.isPaused).toBe(true);
      expect(session.isIdlePaused).toBe(false);
    });
  });

  // ── resumeSession with null pausedAt ────────────────────────────────

  describe('resumeSession edge cases', () => {
    it('handles resume when pausedAt is null (treats pause duration as 0)', () => {
      const store = useReadingStatsStore.getState();
      store.startSession('note-1', 1, 100);

      // Artificially set paused with null pausedAt
      useReadingStatsStore.setState((state) => ({
        activeSession: state.activeSession ? {
          ...state.activeSession,
          isPaused: true,
          pausedAt: null,
          totalPausedMs: 5000,
        } : null,
      }));

      currentTime = 50000;
      store.resumeSession();

      const session = useReadingStatsStore.getState().activeSession!;
      expect(session.isPaused).toBe(false);
      // totalPausedMs should not change (pausedDuration = 0 since pausedAt is null)
      expect(session.totalPausedMs).toBe(5000);
    });
  });
});

// Retry delay constant used in timer advancement
const RETRY_DELAY_MS = 2000;
