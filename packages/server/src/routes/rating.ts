import type { FastifyPluginAsync } from 'fastify';
import { readFileSync, writeFileSync } from 'node:fs';
import matter from 'gray-matter';
import type { RatingUpdate } from '@pulp/shared';
import type { LibraryScanner } from '../services/library-scanner.js';
import type { Config } from '../config/schema.js';

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
    const note = scanner.getById(request.params.id);

    if (!note) {
      return reply.code(404).send({ error: 'Note not found' });
    }

    const { rating } = request.body;

    // Validate rating
    if (rating !== null && (rating < 1 || rating > 5 || !Number.isInteger(rating))) {
      return reply.code(400).send({ error: 'Rating must be an integer between 1 and 5, or null' });
    }

    try {
      // Read and parse the note file
      const fileContent = readFileSync(note.notePath, 'utf-8');
      const { data: frontmatter, content } = matter(fileContent);

      // Update or remove the rating key
      if (rating !== null) {
        frontmatter[config.rating_key] = rating;
      } else {
        delete frontmatter[config.rating_key];
      }

      // Write back
      const updated = matter.stringify(content, frontmatter);
      writeFileSync(note.notePath, updated, 'utf-8');

      // Update in-memory cache
      scanner.updateNote(request.params.id, { rating });

      return { success: true, rating };
    } catch (error) {
      fastify.log.error(error, 'Failed to update rating');
      return reply.code(500).send({ error: 'Failed to update rating' });
    }
  });
};
