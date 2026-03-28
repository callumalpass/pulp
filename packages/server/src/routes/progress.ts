import type { FastifyPluginAsync } from 'fastify';
import type { ProgressUpdate } from '@pulp/shared';
import type { LibraryScanner } from '../services/library-scanner.js';
import type { Config } from '../config/schema.js';
import { NoteNotFoundError, updateNoteMetadata } from '../services/note-metadata.js';

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
    // Clamp progress to valid range (defensive - schema should already enforce this)
    const progress = Math.max(0, Math.min(100, request.body.progress));
    const lastOpenedCfi = request.body.lastOpenedCfi;
    const now = new Date().toISOString();

    try {
      const { derived } = await updateNoteMetadata({
        scanner,
        noteId: request.params.id,
        mutateFrontmatter: ({ frontmatter, note }) => {
          let dateFinished = note.dateFinished;
          frontmatter[config.progress_key] = progress;
          frontmatter[config.last_read_key] = now;

          if (lastOpenedCfi && note.sourceType === 'epub') {
            frontmatter[config.last_opened_cfi_key] = lastOpenedCfi;
          }

          if (progress === 100 && !note.dateFinished) {
            frontmatter[config.date_finished_key] = now;
            dateFinished = now;
          }

          return { progress, lastRead: now, lastOpenedCfi, dateFinished };
        },
        mapUpdates: ({ progress: nextProgress, lastRead, lastOpenedCfi: nextLastOpenedCfi, dateFinished }, note) => ({
          progress: nextProgress,
          lastRead,
          ...(nextLastOpenedCfi && note.sourceType === 'epub' ? { lastOpenedCfi: nextLastOpenedCfi } : {}),
          ...(dateFinished ? { dateFinished } : {}),
        }),
      });

      return { success: true, ...derived };
    } catch (error) {
      if (error instanceof NoteNotFoundError) {
        return reply.code(404).send({ error: 'Note not found' });
      }
      fastify.log.error(error, 'Failed to update progress');
      return reply.code(500).send({ error: 'Failed to update progress' });
    }
  });
};
