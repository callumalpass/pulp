import type { FastifyPluginAsync } from 'fastify';
import type { PausedUpdate } from '@pulp/shared';
import type { LibraryScanner } from '../services/library-scanner.js';
import type { Config } from '../config/schema.js';
import { atomicFrontmatterUpdate } from '../services/file-lock.js';

interface PausedRouteOptions {
  scanner: LibraryScanner;
  config: Config;
}

export const pausedRoutes: FastifyPluginAsync<PausedRouteOptions> = async (fastify, opts) => {
  const { scanner, config } = opts;

  // PATCH /api/library/:id/paused - Update paused status
  fastify.patch<{
    Params: { id: string };
    Body: PausedUpdate;
  }>('/api/library/:id/paused', {
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
        required: ['paused'],
        properties: {
          paused: { type: 'boolean' },
        },
      },
    },
  }, async (request, reply) => {
    const note = scanner.getById(request.params.id);

    if (!note) {
      return reply.code(404).send({ error: 'Note not found' });
    }

    const { paused } = request.body;
    const now = new Date().toISOString();

    try {
      // Use atomic update to prevent race conditions
      await atomicFrontmatterUpdate(note.notePath, ({ frontmatter }) => {
        // Update or remove the paused key
        if (paused) {
          frontmatter[config.paused_key] = true;
          frontmatter[config.paused_at_key] = now;
        } else {
          delete frontmatter[config.paused_key];
          delete frontmatter[config.paused_at_key];
        }
        return frontmatter;
      });

      // Update in-memory cache
      scanner.updateNote(request.params.id, {
        paused,
        pausedAt: paused ? now : null,
      });

      return { success: true, paused, pausedAt: paused ? now : null };
    } catch (error) {
      fastify.log.error(error, 'Failed to update paused status');
      return reply.code(500).send({ error: 'Failed to update paused status' });
    }
  });
};
