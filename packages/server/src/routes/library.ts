import type { FastifyPluginAsync } from 'fastify';
import type { LibraryQuery } from '@pulp/shared';
import type { LibraryScanner } from '../services/library-scanner.js';

interface LibraryRouteOptions {
  scanner: LibraryScanner;
}

export const libraryRoutes: FastifyPluginAsync<LibraryRouteOptions> = async (fastify, opts) => {
  const { scanner } = opts;

  // GET /api/library - List all literature notes
  fastify.get<{
    Querystring: LibraryQuery;
  }>('/api/library', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          sort: { type: 'string', enum: ['lastRead', 'title', 'progress', 'dateCreated', 'author', 'rating'] },
          order: { type: 'string', enum: ['asc', 'desc'] },
        },
      },
    },
  }, async (request) => {
    const { sort = 'lastRead', order = 'desc' } = request.query;
    return scanner.getSummaries(sort, order);
  });

  // GET /api/library/:id - Get single note with full details
  fastify.get<{
    Params: { id: string };
  }>('/api/library/:id', async (request, reply) => {
    const note = scanner.getById(request.params.id);

    if (!note) {
      return reply.code(404).send({ error: 'Note not found' });
    }

    return note;
  });

  // GET /api/library/:id/highlights - Get highlights for a note
  fastify.get<{
    Params: { id: string };
  }>('/api/library/:id/highlights', async (request, reply) => {
    const note = scanner.getById(request.params.id);

    if (!note) {
      return reply.code(404).send({ error: 'Note not found' });
    }

    return note.highlights;
  });

};
