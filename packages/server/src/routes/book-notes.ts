import type { FastifyPluginAsync } from 'fastify';
import type { BookNotesUpdate } from '@pulp/shared';
import type { LibraryScanner } from '../services/library-scanner.js';
import type { Config } from '../config/schema.js';
import { atomicFrontmatterUpdate } from '../services/file-lock.js';

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
    const note = scanner.getById(request.params.id);

    if (!note) {
      return reply.code(404).send({ error: 'Note not found' });
    }

    return { notes: note.bookNotes };
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
    const note = scanner.getById(request.params.id);

    if (!note) {
      return reply.code(404).send({ error: 'Note not found' });
    }

    const { notes } = request.body;

    // Trim notes if provided
    const trimmedNotes = notes?.trim() || null;

    try {
      // Use atomic update to prevent race conditions
      await atomicFrontmatterUpdate(note.notePath, ({ frontmatter }) => {
        // Update or remove the notes key
        if (trimmedNotes) {
          frontmatter[config.book_notes_key] = trimmedNotes;
        } else {
          delete frontmatter[config.book_notes_key];
        }
        return frontmatter;
      });

      // Update in-memory cache
      scanner.updateNote(request.params.id, { bookNotes: trimmedNotes });

      return { success: true, notes: trimmedNotes };
    } catch (error) {
      fastify.log.error(error, 'Failed to update book notes');
      return reply.code(500).send({ error: 'Failed to update book notes' });
    }
  });
};
