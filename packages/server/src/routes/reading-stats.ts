import type { FastifyPluginAsync } from 'fastify';
import type { ReadingStatsUpdate, ReadingStats, SessionQuality } from '@pulp/shared';
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
  calculateSessionQuality,
  checkMilestones,
  createMilestoneRecord,
  calculateMomentum,
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
          idlePauseCount: { type: 'number', minimum: 0 },
          idlePauseTotalMs: { type: 'number', minimum: 0 },
          currentProgress: { type: 'number', minimum: 0, maximum: 100 },
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
    const idlePauseCount = request.body.idlePauseCount;
    const idlePauseTotalMs = request.body.idlePauseTotalMs;
    const currentProgress = request.body.currentProgress;

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

        // Calculate reading momentum from updated history
        const { momentum, score: momentumScore } = calculateMomentum(updatedHistory);

        // Calculate session quality
        const sessionQuality = calculateSessionQuality(sessionDurationMs, idlePauseCount, idlePauseTotalMs);

        // Check for milestone achievements
        const existingMilestones = existingStats?.milestones || [];
        const milestones = [...existingMilestones];

        if (currentProgress !== undefined) {
          const previousProgress = note.progress;
          const newMilestone = checkMilestones(previousProgress, currentProgress, existingMilestones);
          if (newMilestone !== null) {
            const milestoneRecord = createMilestoneRecord(
              newMilestone,
              existingStats?.firstReadDate || now,
              totalReadingTimeMs
            );
            milestones.push(milestoneRecord);
            // Sort milestones by milestone value
            milestones.sort((a, b) => a.milestone - b.milestone);
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
          ...(milestones.length > 0 ? { milestones } : {}),
          ...(momentum ? { momentum } : {}),
          ...(momentumScore !== undefined ? { momentumScore } : {}),
        };

        // Add individual session record with hour of day for time-of-day analysis
        const existingSessions = getReadingSessions(frontmatter, config.reading_sessions_key);
        const startDate = new Date(startTime);
        const newSession = {
          startTime,
          endTime: now,
          durationMs: sessionDurationMs,
          pagesRead,
          startPage,
          endPage,
          hourOfDay: startDate.getHours(),
          quality: sessionQuality,
          idlePauseCount,
          idlePauseTotalMs,
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

    // Calculate time-of-day patterns from all sessions
    const timeOfDayPatterns = calculateTimeOfDayPatterns(sessions);
    const preferredReadingTime = calculatePreferredReadingTime(timeOfDayPatterns);

    // Get reading history for momentum calculation
    const readingHistory = getDailyReadingHistory(note.frontmatter, config.reading_history_key);
    const { momentum, score: momentumScore } = calculateMomentum(readingHistory);

    // Calculate average session quality and focus score
    const sessionsWithQuality = sessions.filter(s => s.quality !== undefined);
    let averageSessionQuality: SessionQuality | null = null;
    let focusScore: number | null = null;

    if (sessionsWithQuality.length > 0) {
      // Calculate quality distribution
      const qualityCounts = {
        deep: sessionsWithQuality.filter(s => s.quality === 'deep').length,
        focused: sessionsWithQuality.filter(s => s.quality === 'focused').length,
        normal: sessionsWithQuality.filter(s => s.quality === 'normal').length,
        distracted: sessionsWithQuality.filter(s => s.quality === 'distracted').length,
      };

      // Determine average quality (most common)
      const maxCount = Math.max(...Object.values(qualityCounts));
      if (qualityCounts.deep === maxCount) averageSessionQuality = 'deep';
      else if (qualityCounts.focused === maxCount) averageSessionQuality = 'focused';
      else if (qualityCounts.normal === maxCount) averageSessionQuality = 'normal';
      else averageSessionQuality = 'distracted';

      // Calculate focus score (0-100)
      // deep: 100, focused: 75, normal: 50, distracted: 25
      const qualityScores: Record<SessionQuality, number> = { deep: 100, focused: 75, normal: 50, distracted: 25 };
      const totalScore = sessionsWithQuality.reduce((sum, s) => sum + qualityScores[s.quality!], 0);
      focusScore = Math.round(totalScore / sessionsWithQuality.length);
    }

    return {
      paceData: paceData.reverse(), // Return chronologically (oldest first)
      trend,
      currentPace,
      overallAverage,
      totalSessions: sessions.length,
      timeOfDayPatterns,
      preferredReadingTime,
      momentum,
      momentumScore,
      averageSessionQuality,
      focusScore,
    };
  });
};

/**
 * Calculate reading patterns by hour of day.
 */
function calculateTimeOfDayPatterns(
  sessions: Array<{ hourOfDay?: number; durationMs: number }>
): Array<{ hour: number; totalSessions: number; totalDurationMs: number; averageDurationMs: number }> {
  // Initialize all 24 hours
  const hourlyStats = new Map<number, { sessions: number; durationMs: number }>();
  for (let h = 0; h < 24; h++) {
    hourlyStats.set(h, { sessions: 0, durationMs: 0 });
  }

  // Accumulate sessions by hour
  for (const session of sessions) {
    const hour = session.hourOfDay;
    if (hour !== undefined && hour >= 0 && hour < 24) {
      const stats = hourlyStats.get(hour)!;
      stats.sessions++;
      stats.durationMs += session.durationMs;
    }
  }

  // Convert to array format
  const patterns: Array<{ hour: number; totalSessions: number; totalDurationMs: number; averageDurationMs: number }> = [];
  for (let h = 0; h < 24; h++) {
    const stats = hourlyStats.get(h)!;
    patterns.push({
      hour: h,
      totalSessions: stats.sessions,
      totalDurationMs: stats.durationMs,
      averageDurationMs: stats.sessions > 0 ? Math.round(stats.durationMs / stats.sessions) : 0,
    });
  }

  return patterns;
}

/**
 * Analyze preferred reading time based on patterns.
 */
function calculatePreferredReadingTime(
  patterns: Array<{ hour: number; totalSessions: number; totalDurationMs: number }>
): { peakHour: number; peakPeriod: 'morning' | 'afternoon' | 'evening' | 'night'; sessionsInPeakPeriod: number; percentageInPeakPeriod: number } | null {
  const totalSessions = patterns.reduce((sum, p) => sum + p.totalSessions, 0);
  if (totalSessions === 0) return null;

  // Find peak hour
  let peakHour = 0;
  let maxSessions = 0;
  for (const p of patterns) {
    if (p.totalSessions > maxSessions) {
      maxSessions = p.totalSessions;
      peakHour = p.hour;
    }
  }

  // Classify into periods
  // Morning: 5-11, Afternoon: 12-16, Evening: 17-20, Night: 21-4
  const getPeriod = (hour: number): 'morning' | 'afternoon' | 'evening' | 'night' => {
    if (hour >= 5 && hour <= 11) return 'morning';
    if (hour >= 12 && hour <= 16) return 'afternoon';
    if (hour >= 17 && hour <= 20) return 'evening';
    return 'night';
  };

  const peakPeriod = getPeriod(peakHour);

  // Count sessions in peak period
  const sessionsInPeakPeriod = patterns.filter(p => getPeriod(p.hour) === peakPeriod)
    .reduce((sum, p) => sum + p.totalSessions, 0);

  const percentageInPeakPeriod = Math.round((sessionsInPeakPeriod / totalSessions) * 100);

  return {
    peakHour,
    peakPeriod,
    sessionsInPeakPeriod,
    percentageInPeakPeriod,
  };
}
