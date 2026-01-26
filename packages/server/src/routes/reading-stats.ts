import type { FastifyPluginAsync } from 'fastify';
import type { ReadingStatsUpdate, ReadingStats } from '@pulp/shared';
import type { LibraryScanner } from '../services/library-scanner.js';
import type { Config } from '../config/schema.js';
import type { ReadingGoalsService } from '../services/reading-goals.js';
import {
  getReadingStats,
  createReadingStatsForFrontmatter,
  getDailyReadingHistory,
  updateDailyReadingHistory,
  createDailyReadingEntryForFrontmatter,
  getReadingSessions,
  addReadingSession,
  createReadingSessionForFrontmatter,
} from '../services/frontmatter-parser.js';
import { atomicFrontmatterUpdate } from '../services/file-lock.js';

interface ReadingStatsRouteOptions {
  scanner: LibraryScanner;
  config: Config;
  goalsService: ReadingGoalsService;
}

export const readingStatsRoutes: FastifyPluginAsync<ReadingStatsRouteOptions> = async (fastify, opts) => {
  const { scanner, config, goalsService } = opts;

  // PATCH /api/library/:id/reading-stats - Update reading statistics after a session ends
  fastify.patch<{
    Params: { id: string };
    Body: ReadingStatsUpdate;
  }>('/api/library/:id/reading-stats', {
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string' },
        },
      },
      body: {
        type: 'object',
        required: ['sessionDurationMs'],
        properties: {
          sessionDurationMs: { type: 'number', minimum: 0 },
          pagesRead: { type: 'number', minimum: 0 },
          startPage: { type: 'number', minimum: 0 },
          endPage: { type: 'number', minimum: 0 },
          startTime: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const note = scanner.getById(request.params.id);

    if (!note) {
      return reply.code(404).send({ error: 'Note not found' });
    }

    // Ensure non-negative values (defensive - schema should already enforce this)
    const sessionDurationMs = Math.max(0, request.body.sessionDurationMs || 0);
    const pagesRead = Math.max(0, request.body.pagesRead || 0);
    const startPage = Math.max(0, request.body.startPage || 0);
    const endPage = Math.max(0, request.body.endPage || 0);
    const startTime = request.body.startTime || new Date(Date.now() - sessionDurationMs).toISOString();

    // Skip if no meaningful session data
    if (sessionDurationMs === 0) {
      return { success: true, message: 'Session duration is zero, no stats updated' };
    }

    const now = new Date().toISOString();
    const today = now.split('T')[0]; // YYYY-MM-DD

    try {
      let newStats: ReadingStats | null = null;
      let updatedFrontmatter: Record<string, unknown> = {};

      // Use atomic update to prevent race conditions
      await atomicFrontmatterUpdate(note.notePath, ({ frontmatter }) => {
        // Get existing stats or create new
        const existingStats = getReadingStats(frontmatter, config.reading_stats_key);

        // Calculate new totals
        const totalReadingTimeMs = (existingStats?.totalReadingTimeMs || 0) + sessionDurationMs;
        const totalSessions = (existingStats?.totalSessions || 0) + 1;
        const totalPagesRead = (existingStats?.totalPagesRead || 0) + pagesRead;

        // Calculate average session
        const averageSessionMs = totalReadingTimeMs / totalSessions;

        // Calculate reading speed (pages per hour) using weighted recent sessions
        // Recent sessions are weighted more heavily for better accuracy
        let pagesPerHour: number | null = existingStats?.pagesPerHour || null;

        // Get existing sessions for weighted calculation
        const existingSessionsForSpeed = getReadingSessions(frontmatter, config.reading_sessions_key);

        // Create array with current session for calculation
        const sessionsForSpeed = [
          { durationMs: sessionDurationMs, pagesRead, startTime },
          ...existingSessionsForSpeed.slice(0, 19), // Last 20 sessions including current
        ].filter(s => s.durationMs >= 60000 && s.pagesRead > 0); // At least 1 min and 1 page

        if (sessionsForSpeed.length > 0) {
          // Weight more recent sessions more heavily (exponential decay)
          // Most recent session gets weight 1.0, each older session decays by 0.85
          const DECAY_FACTOR = 0.85;
          let weightedPagesPerHour = 0;
          let totalWeight = 0;

          for (let i = 0; i < sessionsForSpeed.length; i++) {
            const session = sessionsForSpeed[i];
            const hours = session.durationMs / (1000 * 60 * 60);
            const sessionPPH = session.pagesRead / hours;
            const weight = Math.pow(DECAY_FACTOR, i);

            weightedPagesPerHour += sessionPPH * weight;
            totalWeight += weight;
          }

          if (totalWeight > 0) {
            pagesPerHour = Math.round((weightedPagesPerHour / totalWeight) * 10) / 10;
          }
        } else if (totalPagesRead > 0 && totalReadingTimeMs >= 60000) {
          // Fallback to overall average if no valid sessions
          const hoursRead = totalReadingTimeMs / (1000 * 60 * 60);
          if (hoursRead > 0) {
            pagesPerHour = Math.round((totalPagesRead / hoursRead) * 10) / 10;
          }
        }

        // Track longest session
        const longestSessionMs = Math.max(
          existingStats?.longestSessionMs || 0,
          sessionDurationMs
        );

        // Update daily reading history
        const existingHistory = getDailyReadingHistory(frontmatter, config.reading_history_key);
        const updatedHistory = updateDailyReadingHistory(
          existingHistory,
          today,
          sessionDurationMs,
          pagesRead
        );

        // Calculate average daily reading time from recent history (last 14 days with activity)
        // Use weighted average - more recent days count more
        const recentHistory = updatedHistory.filter(h => h.durationMs > 0).slice(0, 14);
        let averageDailyReadingMs: number | null = null;
        if (recentHistory.length >= 2) {
          // Weight more recent days more heavily
          const DAILY_DECAY = 0.9;
          let weightedDailyMs = 0;
          let totalDailyWeight = 0;

          for (let i = 0; i < recentHistory.length; i++) {
            const weight = Math.pow(DAILY_DECAY, i);
            weightedDailyMs += recentHistory[i].durationMs * weight;
            totalDailyWeight += weight;
          }

          if (totalDailyWeight > 0) {
            averageDailyReadingMs = Math.round(weightedDailyMs / totalDailyWeight);
          }
        }

        // Calculate estimated completion date with improved accuracy
        let estimatedCompletionDate: string | null = null;
        if (
          pagesPerHour !== null &&
          pagesPerHour > 0 &&
          note.totalPages !== null &&
          note.progress < 100
        ) {
          // Calculate remaining pages
          const currentPage = Math.round((note.progress / 100) * note.totalPages);
          const remainingPages = note.totalPages - currentPage;

          if (remainingPages > 0) {
            // Use weighted daily average if available, otherwise estimate from sessions
            let hoursPerDay: number;

            if (averageDailyReadingMs !== null && averageDailyReadingMs > 0) {
              hoursPerDay = averageDailyReadingMs / (1000 * 60 * 60);
            } else if (sessionsForSpeed.length > 0) {
              // Estimate from recent session frequency
              // If user has been reading recently, assume they'll continue at similar rate
              const recentDays = Math.min(7, sessionsForSpeed.length);
              const recentTotalMs = sessionsForSpeed.slice(0, recentDays).reduce((s, x) => s + x.durationMs, 0);
              hoursPerDay = (recentTotalMs / recentDays) / (1000 * 60 * 60);
            } else {
              // No good data - skip estimation
              hoursPerDay = 0;
            }

            if (hoursPerDay > 0) {
              const pagesPerDay = pagesPerHour * hoursPerDay;

              if (pagesPerDay > 0) {
                // Calculate days to complete
                // Add a small buffer (5%) for more realistic estimates
                const daysToComplete = Math.ceil((remainingPages / pagesPerDay) * 1.05);

                // Calculate the target date
                const targetDate = new Date();
                targetDate.setDate(targetDate.getDate() + daysToComplete);
                estimatedCompletionDate = targetDate.toISOString().split('T')[0];
              }
            }
          }
        }

        newStats = {
          totalReadingTimeMs,
          totalSessions,
          averageSessionMs,
          firstReadDate: existingStats?.firstReadDate || now,
          pagesPerHour,
          totalPagesRead,
          longestSessionMs,
          estimatedCompletionDate,
          averageDailyReadingMs,
        };

        // Add individual session record
        const existingSessions = getReadingSessions(frontmatter, config.reading_sessions_key);
        const newSession = {
          startTime,
          endTime: now,
          durationMs: sessionDurationMs,
          pagesRead,
          startPage,
          endPage,
        };
        const updatedSessions = addReadingSession(existingSessions, newSession);

        // Update frontmatter
        frontmatter[config.reading_stats_key] = createReadingStatsForFrontmatter(newStats);
        frontmatter[config.reading_history_key] = updatedHistory.map(createDailyReadingEntryForFrontmatter);
        frontmatter[config.reading_sessions_key] = updatedSessions.map(createReadingSessionForFrontmatter);
        frontmatter[config.last_read_key] = now;

        updatedFrontmatter = frontmatter;
        return frontmatter;
      });

      // Update in-memory cache
      scanner.updateNote(request.params.id, {
        readingStats: newStats,
        lastRead: now,
        frontmatter: updatedFrontmatter, // Update frontmatter cache for goals service
      });

      // Update global streak after recording the session
      const streak = goalsService.updateStreak();

      return {
        success: true,
        readingStats: newStats,
        lastRead: now,
        streak,
      };
    } catch (error) {
      fastify.log.error(error, 'Failed to update reading stats');
      return reply.code(500).send({ error: 'Failed to update reading stats' });
    }
  });

  // GET /api/library/:id/reading-stats - Get reading statistics
  fastify.get<{
    Params: { id: string };
  }>('/api/library/:id/reading-stats', {
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const note = scanner.getById(request.params.id);

    if (!note) {
      return reply.code(404).send({ error: 'Note not found' });
    }

    return {
      readingStats: note.readingStats,
    };
  });

  // GET /api/library/:id/reading-history - Get per-book reading history
  fastify.get<{
    Params: { id: string };
    Querystring: { days?: string };
  }>('/api/library/:id/reading-history', {
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string' },
        },
      },
      querystring: {
        type: 'object',
        properties: {
          days: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const note = scanner.getById(request.params.id);

    if (!note) {
      return reply.code(404).send({ error: 'Note not found' });
    }

    // Parse days limit from query (default 14 days for the chart)
    const daysLimit = Math.min(
      config.reading_history_max_days,
      parseInt(request.query.days || '14', 10) || 14
    );

    // Get reading history from frontmatter
    const history = getDailyReadingHistory(note.frontmatter, config.reading_history_key);

    // Filter to last N days and fill in gaps with zero values
    const today = new Date();
    const result: Array<{ date: string; durationMs: number; sessions: number; pagesRead: number }> = [];

    for (let i = daysLimit - 1; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];

      const entry = history.find(h => h.date === dateStr);
      result.push({
        date: dateStr,
        durationMs: entry?.durationMs || 0,
        sessions: entry?.sessions || 0,
        pagesRead: entry?.pagesRead || 0,
      });
    }

    return {
      history: result,
      daysRequested: daysLimit,
    };
  });

  // GET /api/library/:id/reading-sessions - Get individual reading sessions
  fastify.get<{
    Params: { id: string };
    Querystring: { limit?: string };
  }>('/api/library/:id/reading-sessions', {
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string' },
        },
      },
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const note = scanner.getById(request.params.id);

    if (!note) {
      return reply.code(404).send({ error: 'Note not found' });
    }

    // Parse limit from query (default 20 sessions)
    const limit = Math.min(100, parseInt(request.query.limit || '20', 10) || 20);

    // Get reading sessions from frontmatter
    const sessions = getReadingSessions(note.frontmatter, config.reading_sessions_key);

    return {
      sessions: sessions.slice(0, limit),
      totalSessions: sessions.length,
    };
  });

  // GET /api/library/:id/reading-pace - Get reading pace over time (pages per hour by session)
  fastify.get<{
    Params: { id: string };
    Querystring: { limit?: string };
  }>('/api/library/:id/reading-pace', {
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string' },
        },
      },
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const note = scanner.getById(request.params.id);

    if (!note) {
      return reply.code(404).send({ error: 'Note not found' });
    }

    // Parse limit from query (default 20 sessions)
    const limit = Math.min(100, parseInt(request.query.limit || '20', 10) || 20);

    // Get reading sessions from frontmatter
    const sessions = getReadingSessions(note.frontmatter, config.reading_sessions_key);

    // Calculate pages per hour for each session
    const paceData: Array<{
      date: string;
      pagesPerHour: number | null;
      pagesRead: number;
      durationMs: number;
    }> = [];

    for (const session of sessions.slice(0, limit)) {
      const date = session.startTime.split('T')[0];
      const durationHours = session.durationMs / (1000 * 60 * 60);

      let pagesPerHour: number | null = null;
      if (durationHours >= 0.0167 && session.pagesRead > 0) { // At least 1 minute
        pagesPerHour = Math.round((session.pagesRead / durationHours) * 10) / 10;
      }

      paceData.push({
        date,
        pagesPerHour,
        pagesRead: session.pagesRead,
        durationMs: session.durationMs,
      });
    }

    // Calculate trend (is pace improving?)
    const validPaces = paceData.filter(p => p.pagesPerHour !== null).map(p => p.pagesPerHour!);
    let trend: 'improving' | 'declining' | 'stable' | null = null;

    if (validPaces.length >= 3) {
      const recentHalf = validPaces.slice(0, Math.floor(validPaces.length / 2));
      const olderHalf = validPaces.slice(Math.floor(validPaces.length / 2));

      const recentAvg = recentHalf.reduce((a, b) => a + b, 0) / recentHalf.length;
      const olderAvg = olderHalf.reduce((a, b) => a + b, 0) / olderHalf.length;

      const percentChange = ((recentAvg - olderAvg) / olderAvg) * 100;

      if (percentChange > 10) {
        trend = 'improving';
      } else if (percentChange < -10) {
        trend = 'declining';
      } else {
        trend = 'stable';
      }
    }

    // Calculate current reading speed (last 5 sessions average)
    const recentSessions = validPaces.slice(0, 5);
    const currentPace = recentSessions.length > 0
      ? Math.round((recentSessions.reduce((a, b) => a + b, 0) / recentSessions.length) * 10) / 10
      : null;

    // Calculate overall average
    const overallAverage = validPaces.length > 0
      ? Math.round((validPaces.reduce((a, b) => a + b, 0) / validPaces.length) * 10) / 10
      : null;

    return {
      paceData: paceData.reverse(), // Return chronologically (oldest first)
      trend,
      currentPace,
      overallAverage,
      totalSessions: sessions.length,
    };
  });
};
