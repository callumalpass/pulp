import type { FastifyPluginAsync } from 'fastify';
import type { OpenNoteCommand } from '@pulp/shared';
import type { LibraryScanner } from '../services/library-scanner.js';

interface CommandRoutesOptions {
  scanner: LibraryScanner;
}

export const commandRoutes: FastifyPluginAsync<CommandRoutesOptions> = async (fastify, opts) => {
  const { scanner } = opts;

  fastify.post<{
    Body: OpenNoteCommand;
  }>('/api/commands/open-note', {
    schema: {
      body: {
        type: 'object',
        required: ['noteId'],
        additionalProperties: false,
        properties: {
          noteId: { type: 'string', minLength: 1 },
          page: { type: 'integer', minimum: 1 },
          cfi: { type: 'string', minLength: 1 },
        },
      },
    },
  }, async (request, reply) => {
    const { noteId, page, cfi } = request.body as OpenNoteCommand;
    const note = scanner.getById(noteId);

    if (!note) {
      return reply.code(404).send({ error: 'Note not found' });
    }

    const deliveredToClients = fastify.openNoteOnClients({ noteId, page, cfi });

    return {
      ok: true,
      noteId,
      deliveredToClients,
    };
  });
};
