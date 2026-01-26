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

    const { sessionDurationMs, pagesRead = 0 } = request.body;
    const now = new Date().toISOString();
    const today = now.split('T')[0]; // YYYY-MM-DD

    try {
      // Read and parse the note file
      const fileContent = readFileSync(note.notePath, 'utf-8');
      const { data: frontmatter, content } = matter(fileContent);

      // Get existing stats or create new
      const existingStats = getReadingStats(frontmatter, config.reading_stats_key);

      const newStats = {
        totalReadingTimeMs: (existingStats?.totalReadingTimeMs || 0) + sessionDurationMs,
        totalSessions: (existingStats?.totalSessions || 0) + 1,
        averageSessionMs: 0, // Will be calculated
        firstReadDate: existingStats?.firstReadDate || now,
      };

      // Calculate average
      newStats.averageSessionMs = newStats.totalReadingTimeMs / newStats.totalSessions;

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
};
