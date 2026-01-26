import type { FastifyPluginAsync } from 'fastify';
import type { ProgressUpdate } from '@pulp/shared';
import type { LibraryScanner } from '../services/library-scanner.js';
import type { Config } from '../config/schema.js';
import { atomicFrontmatterUpdate } from '../services/file-lock.js';

interface ProgressRouteOptions {
  scanner: LibraryScanner;
  config: Config;
}

export const progressRoutes: FastifyPluginAsync<ProgressRouteOptions> = async (fastify, opts) => {
  const { scanner, config } = opts;

  // PATCH /api/library/:id/progress - Update reading progress
  fastify.patch<{
    Params: { id: string };
    Body: ProgressUpdate;
  }>('/api/library/:id/progress', {
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
        required: ['progress'],
        properties: {
          progress: { type: 'number', minimum: 0, maximum: 100 },
          lastOpenedCfi: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const note = scanner.getById(request.params.id);

    if (!note) {
      return reply.code(404).send({ error: 'Note not found' });
    }

    // Clamp progress to valid range (defensive - schema should already enforce this)
    const progress = Math.max(0, Math.min(100, request.body.progress));
    const lastOpenedCfi = request.body.lastOpenedCfi;
    const now = new Date().toISOString();

    try {
      let dateFinished = note.dateFinished;

      // Use atomic update to prevent race conditions
      await atomicFrontmatterUpdate(note.notePath, ({ frontmatter }) => {
        // Update frontmatter
        frontmatter[config.progress_key] = progress;
        frontmatter[config.last_read_key] = now;

        // Update lastOpenedCfi for EPUBs
        if (lastOpenedCfi && note.sourceType === 'epub') {
          frontmatter[config.last_opened_cfi_key] = lastOpenedCfi;
        }

        // Set date_finished when book is completed (reaches 100% for the first time)
        if (progress === 100 && !note.dateFinished) {
          frontmatter[config.date_finished_key] = now;
          dateFinished = now;
        }

        return frontmatter;
      });

      // Update in-memory cache
      scanner.updateNote(request.params.id, {
        progress,
        lastRead: now,
        ...(lastOpenedCfi && note.sourceType === 'epub' ? { lastOpenedCfi } : {}),
        ...(dateFinished ? { dateFinished } : {}),
      });

      return { success: true, progress, lastRead: now, lastOpenedCfi, dateFinished };
    } catch (error) {
      fastify.log.error(error, 'Failed to update progress');
      return reply.code(500).send({ error: 'Failed to update progress' });
    }
  });
};
