import type { FastifyPluginAsync } from 'fastify';
import type { RatingUpdate } from '@pulp/shared';
import type { LibraryScanner } from '../services/library-scanner.js';
import type { Config } from '../config/schema.js';
import { NoteNotFoundError, updateNoteMetadata } from '../services/note-metadata.js';

interface RatingRouteOptions {
  scanner: LibraryScanner;
  config: Config;
}

export const ratingRoutes: FastifyPluginAsync<RatingRouteOptions> = async (fastify, opts) => {
  const { scanner, config } = opts;

  // PATCH /api/library/:id/rating - Update rating
  fastify.patch<{
    Params: { id: string };
    Body: RatingUpdate;
  }>('/api/library/:id/rating', {
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
        required: ['rating'],
        properties: {
          rating: { type: ['number', 'null'], minimum: 1, maximum: 5 },
        },
      },
    },
  }, async (request, reply) => {
    const { rating } = request.body;

    // Validate rating
    if (rating !== null && (rating < 1 || rating > 5 || !Number.isInteger(rating))) {
      return reply.code(400).send({ error: 'Rating must be an integer between 1 and 5, or null' });
    }

    try {
      const { derived } = await updateNoteMetadata({
        scanner,
        noteId: request.params.id,
        mutateFrontmatter: ({ frontmatter }) => {
          if (rating !== null) {
            frontmatter[config.rating_key] = rating;
          } else {
            delete frontmatter[config.rating_key];
          }
          return rating;
        },
        mapUpdates: (nextRating) => ({ rating: nextRating }),
      });

      return { success: true, rating: derived };
    } catch (error) {
      if (error instanceof NoteNotFoundError) {
        return reply.code(404).send({ error: 'Note not found' });
      }
      fastify.log.error(error, 'Failed to update rating');
      return reply.code(500).send({ error: 'Failed to update rating' });
    }
  });
};
