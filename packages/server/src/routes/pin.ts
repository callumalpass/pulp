import type { FastifyPluginAsync } from 'fastify';
import type { PinUpdate } from '@pulp/shared';
import type { LibraryScanner } from '../services/library-scanner.js';
import type { Config } from '../config/schema.js';
import { NoteNotFoundError, updateNoteMetadata } from '../services/note-metadata.js';

interface PinRouteOptions {
  scanner: LibraryScanner;
  config: Config;
}

export const pinRoutes: FastifyPluginAsync<PinRouteOptions> = async (fastify, opts) => {
  const { scanner, config } = opts;

  // PATCH /api/library/:id/pin - Update pin status
  fastify.patch<{
    Params: { id: string };
    Body: PinUpdate;
  }>('/api/library/:id/pin', {
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
        required: ['pinned'],
        properties: {
          pinned: { type: 'boolean' },
        },
      },
    },
  }, async (request, reply) => {
    const { pinned } = request.body;

    try {
      const { derived } = await updateNoteMetadata({
        scanner,
        noteId: request.params.id,
        mutateFrontmatter: ({ frontmatter }) => {
          if (pinned) {
            frontmatter[config.pinned_key] = true;
          } else {
            delete frontmatter[config.pinned_key];
          }
          return pinned;
        },
        mapUpdates: (nextPinned) => ({ pinned: nextPinned }),
      });

      return { success: true, pinned: derived };
    } catch (error) {
      if (error instanceof NoteNotFoundError) {
        return reply.code(404).send({ error: 'Note not found' });
      }
      fastify.log.error(error, 'Failed to update pin status');
      return reply.code(500).send({ error: 'Failed to update pin status' });
    }
  });
};
