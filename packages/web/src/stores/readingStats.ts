import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ReadingStats } from '@pulp/shared';
import { api } from '../lib/api';
import { formatReadingTime } from '../lib/format';

// Reading session represents a single reading period
export interface ReadingSession {
  id: string;
  noteId: string;
  startTime: string;          // ISO timestamp
  endTime: string;            // ISO timestamp
  durationMs: number;         // Duration in milliseconds
  startPage: number;
  endPage: number;
  pagesRead: number;
}

// Pending session data for offline persistence
interface PendingSessionData {
  noteId: string;
  sessionDurationMs: number;
  pagesRead: number;
  timestamp: string;  // When the session ended (for deduplication)
  retryCount: number;
}

// Active session tracking (local only, for real-time UI)
interface ActiveSession {
  noteId: string;
  startTime: number;           // Performance.now() for accuracy
  startTimestamp: string;      // ISO timestamp for display
  startPage: number;
  currentPage: number;
  totalPages: number;
  isPaused: boolean;
  pausedAt: number | null;
  totalPausedMs: number;
  lastActivityTime: number;    // Performance.now() of last user interaction
  isIdlePaused: boolean;       // True if paused due to inactivity (not manual pause)
}

const MIN_SESSION_DURATION_MS = 10000;  // 10 seconds minimum to count
const IDLE_TIMEOUT_MS = 5 * 60 * 1000;  // 5 minutes of inactivity triggers pause
const MAX_RETRY_ATTEMPTS = 5;
const RETRY_DELAY_MS = 2000;
const MAX_PENDING_SESSIONS = 50;  // Limit stored pending sessions

interface ReadingStatsState {
  // Current active reading session (local only)
  activeSession: ActiveSession | null;

  // Cached book stats from API (keyed by noteId)
  bookStatsCache: Record<string, ReadingStats>;

  // Pending sessions waiting to be synced (persisted)
  pendingSessions: PendingSessionData[];

  // Sync status
  isSyncing: boolean;
  lastSyncError: string | null;

  // Actions
  startSession: (noteId: string, currentPage: number, totalPages: number) => void;
  updateCurrentPage: (page: number) => void;
  pauseSession: () => void;
  resumeSession: () => void;
  endSession: () => Promise<ReadingSession | null>;
  recordActivity: () => void;  // Call on user interactions to prevent idle pause
  checkIdleStatus: () => void; // Called periodically to check for idle timeout

  // Cache management
  setBookStats: (noteId: string, stats: ReadingStats | null) => void;

  // Offline sync
  syncPendingSessions: () => Promise<void>;
  getPendingSessionCount: () => number;

  // Getters
  getBookStats: (noteId: string) => ReadingStats | null;
  getEstimatedTimeRemaining: (noteId: string, currentPage: number, totalPages: number) => number | null;
  getFormattedReadingTime: (ms: number) => string;
  getActiveSessionDuration: () => number;
  isIdlePaused: () => boolean;
}

// Helper to save a session with retry logic
async function saveSessionWithRetry(
  noteId: string,
  sessionDurationMs: number,
  pagesRead: number,
  maxRetries: number = MAX_RETRY_ATTEMPTS
): Promise<{ success: boolean; stats?: ReadingStats; error?: string }> {
  let lastError: string | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const result = await api.readingStats.update(noteId, {
        sessionDurationMs,
        pagesRead,
      });

      return { success: true, stats: result.readingStats };
    } catch (error) {
      lastError = error instanceof Error ? error.message : 'Unknown error';

      // Don't retry on client errors (4xx) - they won't succeed on retry
      if (lastError.includes('HTTP 4')) {
        return { success: false, error: lastError };
      }

      // Wait before retrying (with exponential backoff)
      if (attempt < maxRetries - 1) {
        await new Promise(resolve =>
          setTimeout(resolve, RETRY_DELAY_MS * Math.pow(2, attempt))
        );
      }
    }
  }

  return { success: false, error: lastError ?? 'Max retries exceeded' };
}

export const useReadingStatsStore = create<ReadingStatsState>()(
  persist(
    (set, get) => ({
  activeSession: null,
  bookStatsCache: {},
  pendingSessions: [],
  isSyncing: false,
  lastSyncError: null,

  startSession: (noteId, currentPage, totalPages) => {
    const now = performance.now();
    const timestamp = new Date().toISOString();

    // End any existing session first
    const existingSession = get().activeSession;
    if (existingSession) {
      get().endSession();
    }

    set({
      activeSession: {
        noteId,
        startTime: now,
        startTimestamp: timestamp,
        startPage: currentPage,
        currentPage,
        totalPages,
        isPaused: false,
        pausedAt: null,
        totalPausedMs: 0,
        lastActivityTime: now,
        isIdlePaused: false,
      },
    });
  },

  updateCurrentPage: (page) => {
    const now = performance.now();
    set((state) => {
      if (!state.activeSession) return state;

      // Page change counts as activity
      let session = {
        ...state.activeSession,
        currentPage: page,
        lastActivityTime: now,
      };

      // If was idle-paused, auto-resume on page change
      if (state.activeSession.isIdlePaused && state.activeSession.pausedAt) {
        const pausedDuration = now - state.activeSession.pausedAt;
        session = {
          ...session,
          isPaused: false,
          isIdlePaused: false,
          pausedAt: null,
          totalPausedMs: state.activeSession.totalPausedMs + pausedDuration,
        };
      }

      return { activeSession: session };
    });
  },

  pauseSession: () => {
    set((state) => {
      if (!state.activeSession || state.activeSession.isPaused) return state;
      return {
        activeSession: {
          ...state.activeSession,
          isPaused: true,
          pausedAt: performance.now(),
          isIdlePaused: false, // Manual pause, not idle
        },
      };
    });
  },

  resumeSession: () => {
    const now = performance.now();
    set((state) => {
      if (!state.activeSession || !state.activeSession.isPaused) return state;
      const pausedDuration = state.activeSession.pausedAt
        ? now - state.activeSession.pausedAt
        : 0;
      return {
        activeSession: {
          ...state.activeSession,
          isPaused: false,
          pausedAt: null,
          totalPausedMs: state.activeSession.totalPausedMs + pausedDuration,
          lastActivityTime: now, // Reset activity time on resume
          isIdlePaused: false,
        },
      };
    });
  },

  recordActivity: () => {
    const now = performance.now();
    set((state) => {
      if (!state.activeSession) return state;

      // If session was idle-paused, auto-resume on activity
      if (state.activeSession.isIdlePaused && state.activeSession.pausedAt) {
        const pausedDuration = now - state.activeSession.pausedAt;
        return {
          activeSession: {
            ...state.activeSession,
            lastActivityTime: now,
            isPaused: false,
            isIdlePaused: false,
            pausedAt: null,
            totalPausedMs: state.activeSession.totalPausedMs + pausedDuration,
          },
        };
      }

      // Just update activity time
      return {
        activeSession: {
          ...state.activeSession,
          lastActivityTime: now,
        },
      };
    });
  },

  checkIdleStatus: () => {
    const { activeSession } = get();
    if (!activeSession || activeSession.isPaused) return;

    const now = performance.now();
    const idleTime = now - activeSession.lastActivityTime;

    if (idleTime >= IDLE_TIMEOUT_MS) {
      // Pause due to inactivity
      set({
        activeSession: {
          ...activeSession,
          isPaused: true,
          pausedAt: now,
          isIdlePaused: true,
        },
      });
    }
  },

  endSession: async () => {
    const { activeSession, pendingSessions } = get();
    if (!activeSession) return null;

    const now = performance.now();
    const endTimestamp = new Date().toISOString();

    // Calculate actual reading time (excluding paused time)
    let totalPausedMs = activeSession.totalPausedMs;
    if (activeSession.isPaused && activeSession.pausedAt) {
      totalPausedMs += now - activeSession.pausedAt;
    }

    const durationMs = Math.max(0, (now - activeSession.startTime) - totalPausedMs);
    const pagesRead = Math.abs(activeSession.currentPage - activeSession.startPage);

    // Clear active session immediately
    set({ activeSession: null });

    // Only record sessions that meet minimum duration
    if (durationMs < MIN_SESSION_DURATION_MS) {
      return null;
    }

    const session: ReadingSession = {
      id: `session-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      noteId: activeSession.noteId,
      startTime: activeSession.startTimestamp,
      endTime: endTimestamp,
      durationMs,
      startPage: activeSession.startPage,
      endPage: activeSession.currentPage,
      pagesRead,
    };

    // Try to save with retry logic
    const result = await saveSessionWithRetry(
      activeSession.noteId,
      durationMs,
      pagesRead,
      3  // Use fewer retries for immediate saves
    );

    if (result.success && result.stats) {
      // Update local cache with new stats from server
      set((state) => ({
        bookStatsCache: {
          ...state.bookStatsCache,
          [activeSession.noteId]: result.stats!,
        },
        lastSyncError: null,
      }));
    } else {
      // Save failed - persist session for later sync
      console.error('Failed to save reading stats, queueing for later:', result.error);

      const pendingSession: PendingSessionData = {
        noteId: activeSession.noteId,
        sessionDurationMs: durationMs,
        pagesRead,
        timestamp: endTimestamp,
        retryCount: 0,
      };

      // Add to pending queue (with size limit)
      const updatedPending = [...pendingSessions, pendingSession];
      if (updatedPending.length > MAX_PENDING_SESSIONS) {
        // Remove oldest sessions if over limit
        updatedPending.splice(0, updatedPending.length - MAX_PENDING_SESSIONS);
      }

      set({
        pendingSessions: updatedPending,
        lastSyncError: result.error ?? 'Failed to sync',
      });
    }

    return session;
  },

  setBookStats: (noteId, stats) => {
    if (stats) {
      set((state) => ({
        bookStatsCache: {
          ...state.bookStatsCache,
          [noteId]: stats,
        },
      }));
    }
  },

  syncPendingSessions: async () => {
    const { pendingSessions, isSyncing } = get();

    // Don't sync if already syncing or no pending sessions
    if (isSyncing || pendingSessions.length === 0) return;

    set({ isSyncing: true, lastSyncError: null });

    const stillPending: PendingSessionData[] = [];
    let lastError: string | null = null;

    // Process each pending session
    for (const session of pendingSessions) {
      const result = await saveSessionWithRetry(
        session.noteId,
        session.sessionDurationMs,
        session.pagesRead,
        MAX_RETRY_ATTEMPTS
      );

      if (result.success && result.stats) {
        // Success - update cache
        set((state) => ({
          bookStatsCache: {
            ...state.bookStatsCache,
            [session.noteId]: result.stats!,
          },
        }));
      } else {
        // Failed - keep in pending queue with incremented retry count
        lastError = result.error ?? 'Unknown error';
        const updatedSession = {
          ...session,
          retryCount: session.retryCount + 1,
        };

        // Only keep if under max retry count
        if (updatedSession.retryCount < MAX_RETRY_ATTEMPTS) {
          stillPending.push(updatedSession);
        } else {
          console.error('Dropping session after max retries:', session);
        }
      }
    }

    set({
      pendingSessions: stillPending,
      isSyncing: false,
      lastSyncError: stillPending.length > 0 ? lastError : null,
    });
  },

  getPendingSessionCount: () => {
    return get().pendingSessions.length;
  },

  getBookStats: (noteId) => {
    return get().bookStatsCache[noteId] || null;
  },

  getEstimatedTimeRemaining: (noteId, currentPage, totalPages) => {
    const stats = get().bookStatsCache[noteId];
    if (!stats || stats.totalReadingTimeMs === 0 || stats.totalSessions === 0) return null;

    const pagesRemaining = totalPages - currentPage;
    if (pagesRemaining <= 0) return null;

    // If we have reading speed data, use it for more accurate estimate
    if (stats.pagesPerHour && stats.pagesPerHour > 0) {
      const hoursRemaining = pagesRemaining / stats.pagesPerHour;
      return Math.max(0, Math.round(hoursRemaining * 60 * 60 * 1000)); // Convert hours to ms
    }

    // Fallback: estimate remaining time based on progress
    const progress = currentPage / totalPages;
    if (progress <= 0) return null;

    const estimatedTotalTime = stats.totalReadingTimeMs / progress;
    const remaining = estimatedTotalTime - stats.totalReadingTimeMs;

    return Math.max(0, Math.round(remaining));
  },

  getFormattedReadingTime: (ms) => formatReadingTime(ms),

  getActiveSessionDuration: () => {
    const { activeSession } = get();
    if (!activeSession) return 0;

    const now = performance.now();
    let totalPausedMs = activeSession.totalPausedMs;

    if (activeSession.isPaused && activeSession.pausedAt) {
      totalPausedMs += now - activeSession.pausedAt;
    }

    return Math.max(0, (now - activeSession.startTime) - totalPausedMs);
  },

  isIdlePaused: () => {
    const { activeSession } = get();
    return activeSession?.isIdlePaused ?? false;
  },
}),
    {
      name: 'pulp-reading-stats',
      // Only persist pending sessions, not active session or cache
      partialize: (state) => ({
        pendingSessions: state.pendingSessions,
      }),
    }
  )
);
