import type { FastifyPluginAsync } from 'fastify';
import type { LibraryScanner } from '../services/library-scanner.js';
import type { Config } from '../config/schema.js';
import { CoverExtractor } from '../services/cover-extractor.js';

interface CoversRouteOptions {
  scanner: LibraryScanner;
  config: Config;
}

export const coversRoutes: FastifyPluginAsync<CoversRouteOptions> = async (fastify, opts) => {
  const { scanner, config } = opts;
  const coverExtractor = new CoverExtractor(config);

  // GET /api/covers/:id - Get cover image for a note
  fastify.get<{
    Params: { id: string };
  }>('/api/covers/:id', async (request, reply) => {
    const note = scanner.getById(request.params.id);

    if (!note) {
      return reply.code(404).send({ error: 'Note not found' });
    }

    try {
      const cover = await coverExtractor.getCover(
        note.id,
        note.filePath,
        note.sourceType
      );

      if (!cover) {
        // Return a 204 No Content to indicate no cover available
        return reply.code(204).send();
      }

      reply.headers({
        'Content-Type': 'image/webp',
        'Cache-Control': 'public, max-age=86400', // Cache for 24 hours
      });

      return reply.send(cover);
    } catch (error) {
      fastify.log.error(error, 'Failed to get cover');
      return reply.code(500).send({ error: 'Failed to get cover' });
    }
  });
};
