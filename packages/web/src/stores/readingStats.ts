import { create } from 'zustand';
import type { ReadingStats } from '@pulp/shared';
import { api } from '../lib/api';

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

interface ReadingStatsState {
  // Current active reading session (local only)
  activeSession: ActiveSession | null;

  // Cached book stats from API (keyed by noteId)
  bookStatsCache: Record<string, ReadingStats>;

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

  // Getters
  getBookStats: (noteId: string) => ReadingStats | null;
  getEstimatedTimeRemaining: (noteId: string, currentPage: number, totalPages: number) => number | null;
  getFormattedReadingTime: (ms: number) => string;
  getActiveSessionDuration: () => number;
  isIdlePaused: () => boolean;
}

export const useReadingStatsStore = create<ReadingStatsState>()((set, get) => ({
  activeSession: null,
  bookStatsCache: {},

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
    const { activeSession } = get();
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

    // Save to API (fire and forget, but update cache on success)
    try {
      const result = await api.readingStats.update(activeSession.noteId, {
        sessionDurationMs: durationMs,
        pagesRead,
      });

      // Update local cache with new stats from server
      if (result.readingStats) {
        set((state) => ({
          bookStatsCache: {
            ...state.bookStatsCache,
            [activeSession.noteId]: result.readingStats,
          },
        }));
      }
    } catch (error) {
      console.error('Failed to save reading stats:', error);
      // Stats will be lost if API fails, but that's acceptable
      // The session was still tracked locally for the UI
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

  getBookStats: (noteId) => {
    return get().bookStatsCache[noteId] || null;
  },

  getEstimatedTimeRemaining: (noteId, currentPage, totalPages) => {
    const stats = get().bookStatsCache[noteId];
    if (!stats || stats.totalReadingTimeMs === 0 || stats.totalSessions === 0) return null;

    // Estimate remaining time based on current progress
    const progress = currentPage / totalPages;
    if (progress <= 0) return null;

    const estimatedTotalTime = stats.totalReadingTimeMs / progress;
    const remaining = estimatedTotalTime - stats.totalReadingTimeMs;

    return Math.max(0, Math.round(remaining));
  },

  getFormattedReadingTime: (ms) => {
    if (ms < 60000) {
      return `${Math.round(ms / 1000)}s`;
    }
    if (ms < 3600000) {
      const mins = Math.round(ms / 60000);
      return `${mins}m`;
    }
    const hours = Math.floor(ms / 3600000);
    const mins = Math.round((ms % 3600000) / 60000);
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  },

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
}));
