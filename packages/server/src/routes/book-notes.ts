import type { FastifyPluginAsync } from 'fastify';
import type { BookNotesUpdate } from '@pulp/shared';
import type { LibraryScanner } from '../services/library-scanner.js';
import type { Config } from '../config/schema.js';
import { NoteNotFoundError, updateNoteMetadata } from '../services/note-metadata.js';

interface BookNotesRouteOptions {
  scanner: LibraryScanner;
  config: Config;
}

/** Maximum allowed notes length */
const MAX_NOTES_LENGTH = 50000;

export const bookNotesRoutes: FastifyPluginAsync<BookNotesRouteOptions> = async (fastify, opts) => {
  const { scanner, config } = opts;

  // GET /api/library/:id/notes - Get book notes
  fastify.get<{
    Params: { id: string };
  }>('/api/library/:id/notes', {
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    if (!scanner.getById(request.params.id)) {
      return reply.code(404).send({ error: 'Note not found' });
    }

    return { notes: scanner.getById(request.params.id)?.bookNotes ?? null };
  });

  // PATCH /api/library/:id/notes - Update book notes
  fastify.patch<{
    Params: { id: string };
    Body: BookNotesUpdate;
  }>('/api/library/:id/notes', {
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
        required: ['notes'],
        properties: {
          notes: { type: ['string', 'null'], maxLength: MAX_NOTES_LENGTH },
        },
      },
    },
  }, async (request, reply) => {
    const { notes } = request.body;

    // Trim notes if provided
    const trimmedNotes = notes?.trim() || null;

    try {
      const { derived } = await updateNoteMetadata({
        scanner,
        noteId: request.params.id,
        mutateFrontmatter: ({ frontmatter }) => {
          if (trimmedNotes) {
            frontmatter[config.book_notes_key] = trimmedNotes;
          } else {
            delete frontmatter[config.book_notes_key];
          }
          return trimmedNotes;
        },
        mapUpdates: (bookNotes) => ({ bookNotes }),
      });

      return { success: true, notes: derived };
    } catch (error) {
      if (error instanceof NoteNotFoundError) {
        return reply.code(404).send({ error: 'Note not found' });
      }
      fastify.log.error(error, 'Failed to update book notes');
      return reply.code(500).send({ error: 'Failed to update book notes' });
    }
  });
};
