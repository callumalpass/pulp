import type { FastifyPluginAsync } from 'fastify';
import type { CreateHighlightRequest, UpdateHighlightRequest } from '@pulp/shared';
import type { LibraryScanner } from '../services/library-scanner.js';
import type { HighlightWriter } from '../services/highlight-writer.js';

interface HighlightsRouteOptions {
  scanner: LibraryScanner;
  highlightWriter: HighlightWriter;
}

export const highlightsRoutes: FastifyPluginAsync<HighlightsRouteOptions> = async (fastify, opts) => {
  const { scanner, highlightWriter } = opts;

  // POST /api/library/:id/highlights - Add a new highlight
  fastify.post<{
    Params: { id: string };
    Body: CreateHighlightRequest;
  }>('/api/library/:id/highlights', {
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
        required: ['type', 'text'],
        properties: {
          type: { type: 'string', enum: ['pdf', 'epub'] },
          page: { type: 'number' },
          selection: {
            type: 'object',
            properties: {
              beginIndex: { type: 'number' },
              beginOffset: { type: 'number' },
              endIndex: { type: 'number' },
              endOffset: { type: 'number' },
            },
          },
          cfi: { type: 'string' },
          text: { type: 'string' },
          note: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const note = scanner.getById(request.params.id);

    if (!note) {
      return reply.code(404).send({ error: 'Note not found' });
    }

    const body = request.body;

    // Validate type-specific requirements
    if (body.type === 'pdf' && (body.page === undefined || !body.selection)) {
      return reply.code(400).send({ error: 'PDF highlights require page and selection' });
    }

    if (body.type === 'epub' && !body.cfi) {
      return reply.code(400).send({ error: 'EPUB highlights require cfi' });
    }

    try {
      const highlight = await highlightWriter.write(note, body);

      // Update in-memory cache
      note.highlights.push(highlight);

      return { success: true, highlight };
    } catch (error) {
      fastify.log.error(error, 'Failed to write highlight');
      return reply.code(500).send({ error: 'Failed to save highlight' });
    }
  });

  // PATCH /api/library/:id/highlights/:highlightId - Update a highlight's note
  fastify.patch<{
    Params: { id: string; highlightId: string };
    Body: UpdateHighlightRequest;
  }>('/api/library/:id/highlights/:highlightId', {
    schema: {
      params: {
        type: 'object',
        required: ['id', 'highlightId'],
        properties: {
          id: { type: 'string' },
          highlightId: { type: 'string' },
        },
      },
      body: {
        type: 'object',
        properties: {
          note: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const note = scanner.getById(request.params.id);

    if (!note) {
      return reply.code(404).send({ error: 'Note not found' });
    }

    try {
      const updatedHighlight = await highlightWriter.update(note, request.params.highlightId, request.body);

      if (!updatedHighlight) {
        return reply.code(404).send({ error: 'Highlight not found' });
      }

      // Update in-memory cache
      const index = note.highlights.findIndex((h) => h.id === request.params.highlightId);
      if (index !== -1) {
        note.highlights[index] = updatedHighlight;
      }

      return { success: true, highlight: updatedHighlight };
    } catch (error) {
      fastify.log.error(error, 'Failed to update highlight');
      return reply.code(500).send({ error: 'Failed to update highlight' });
    }
  });

  // DELETE /api/library/:id/highlights/:highlightId
  fastify.delete<{
    Params: { id: string; highlightId: string };
  }>('/api/library/:id/highlights/:highlightId', async (request, reply) => {
    const note = scanner.getById(request.params.id);

    if (!note) {
      return reply.code(404).send({ error: 'Note not found' });
    }

    const highlightIndex = note.highlights.findIndex((h) => h.id === request.params.highlightId);

    if (highlightIndex === -1) {
      return reply.code(404).send({ error: 'Highlight not found' });
    }

    // Remove from in-memory cache
    note.highlights.splice(highlightIndex, 1);

    return { success: true };
  });
};
