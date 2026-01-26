import type { FastifyPluginAsync } from 'fastify';
import type { CollectionsUpdate } from '@pulp/shared';
import type { LibraryScanner } from '../services/library-scanner.js';
import type { Config } from '../config/schema.js';
import { atomicFrontmatterUpdate } from '../services/file-lock.js';

interface CollectionsRouteOptions {
  scanner: LibraryScanner;
  config: Config;
}

export const collectionsRoutes: FastifyPluginAsync<CollectionsRouteOptions> = async (fastify, opts) => {
  const { scanner, config } = opts;

  // PATCH /api/library/:id/collections - Update collections for a note
  fastify.patch<{
    Params: { id: string };
    Body: CollectionsUpdate;
  }>('/api/library/:id/collections', {
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
        required: ['collections'],
        properties: {
          collections: {
            type: 'array',
            items: { type: 'string' },
          },
        },
      },
    },
  }, async (request, reply) => {
    const note = scanner.getById(request.params.id);

    if (!note) {
      return reply.code(404).send({ error: 'Note not found' });
    }

    // Sanitize collections: trim whitespace and remove empty entries
    const collections = request.body.collections
      .map(c => c.trim())
      .filter(c => c.length > 0);

    try {
      // Use atomic update to prevent race conditions
      await atomicFrontmatterUpdate(note.notePath, ({ frontmatter }) => {
        // Update the collections key
        if (collections.length > 0) {
          frontmatter[config.collections_key] = collections;
        } else {
          delete frontmatter[config.collections_key];
        }
        return frontmatter;
      });

      // Update in-memory cache
      scanner.updateNote(request.params.id, { collections });

      return { success: true, collections };
    } catch (error) {
      fastify.log.error(error, 'Failed to update collections');
      return reply.code(500).send({ error: 'Failed to update collections' });
    }
  });

  // GET /api/collections - Get all unique collections across the library
  fastify.get('/api/collections', async () => {
    const notes = scanner.getAll();
    const collectionsSet = new Set<string>();

    for (const note of notes) {
      for (const collection of note.collections) {
        collectionsSet.add(collection);
      }
    }

    return {
      collections: Array.from(collectionsSet).sort((a, b) => a.localeCompare(b)),
    };
  });
};
