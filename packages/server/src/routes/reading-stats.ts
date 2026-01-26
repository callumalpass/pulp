import type { FastifyPluginAsync } from 'fastify';
import { readFileSync, writeFileSync } from 'node:fs';
import matter from 'gray-matter';
import type { ReadingStatsUpdate } from '@pulp/shared';
import type { LibraryScanner } from '../services/library-scanner.js';
import type { Config } from '../config/schema.js';
import type { ReadingGoalsService } from '../services/reading-goals.js';
import {
  getReadingStats,
  createReadingStatsForFrontmatter,
  getDailyReadingHistory,
  updateDailyReadingHistory,
  createDailyReadingEntryForFrontmatter,
} from '../services/frontmatter-parser.js';

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

    // Skip if no meaningful session data
    if (sessionDurationMs === 0) {
      return { success: true, message: 'Session duration is zero, no stats updated' };
    }

    const now = new Date().toISOString();
    const today = now.split('T')[0]; // YYYY-MM-DD

    try {
      // Read and parse the note file
      const fileContent = readFileSync(note.notePath, 'utf-8');
      const { data: frontmatter, content } = matter(fileContent);

      // Get existing stats or create new
      const existingStats = getReadingStats(frontmatter, config.reading_stats_key);

      // Calculate new totals
      const totalReadingTimeMs = (existingStats?.totalReadingTimeMs || 0) + sessionDurationMs;
      const totalSessions = (existingStats?.totalSessions || 0) + 1;
      const totalPagesRead = (existingStats?.totalPagesRead || 0) + pagesRead;

      // Calculate average session
      const averageSessionMs = totalReadingTimeMs / totalSessions;

      // Calculate reading speed (pages per hour)
      // Only calculate if we have meaningful data (at least 1 page and 1 minute of reading)
      let pagesPerHour: number | null = existingStats?.pagesPerHour || null;
      if (totalPagesRead > 0 && totalReadingTimeMs >= 60000) {
        const hoursRead = totalReadingTimeMs / (1000 * 60 * 60);
        // Guard against division by zero (should not happen with the check above, but defensive)
        if (hoursRead > 0) {
          pagesPerHour = Math.round((totalPagesRead / hoursRead) * 10) / 10; // Round to 1 decimal
        }
      }

      // Track longest session
      const longestSessionMs = Math.max(
        existingStats?.longestSessionMs || 0,
        sessionDurationMs
      );

      const newStats = {
        totalReadingTimeMs,
        totalSessions,
        averageSessionMs,
        firstReadDate: existingStats?.firstReadDate || now,
        pagesPerHour,
        totalPagesRead,
        longestSessionMs,
      };

      // Update daily reading history
      const existingHistory = getDailyReadingHistory(frontmatter, config.reading_history_key);
      const updatedHistory = updateDailyReadingHistory(
        existingHistory,
        today,
        sessionDurationMs,
        pagesRead
      );

      // Update frontmatter
      frontmatter[config.reading_stats_key] = createReadingStatsForFrontmatter(newStats);
      frontmatter[config.reading_history_key] = updatedHistory.map(createDailyReadingEntryForFrontmatter);
      frontmatter[config.last_read_key] = now;

      // Write back
      const updated = matter.stringify(content, frontmatter);
      writeFileSync(note.notePath, updated, 'utf-8');

      // Update in-memory cache
      scanner.updateNote(request.params.id, {
        readingStats: newStats,
        lastRead: now,
        frontmatter, // Update frontmatter cache for goals service
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
};
