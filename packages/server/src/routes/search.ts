import type { FastifyPluginAsync } from 'fastify';
import type { SearchIndex } from '../services/search-index.js';
import type { LibraryScanner } from '../services/library-scanner.js';

interface SearchRouteOptions {
  searchIndex: SearchIndex;
  scanner: LibraryScanner;
}

export const searchRoutes: FastifyPluginAsync<SearchRouteOptions> = async (fastify, opts) => {
  const { searchIndex, scanner } = opts;

  // GET /api/search - Full-text search across all documents
  fastify.get<{
    Querystring: {
      q: string;
      noteId?: string;
      limit?: number;
    };
  }>('/api/search', {
    schema: {
      querystring: {
        type: 'object',
        required: ['q'],
        properties: {
          q: { type: 'string', minLength: 1 },
          noteId: { type: 'string' },
          limit: { type: 'number', minimum: 1, maximum: 100 },
        },
      },
    },
  }, async (request) => {
    const { q, noteId, limit = 20 } = request.query;

    // Filter by specific note if provided
    const noteIds = noteId ? [noteId] : undefined;

    const results = searchIndex.search(q, noteIds);

    // Limit total results
    return {
      query: q,
      results: results.slice(0, limit),
      totalResults: results.length,
    };
  });

  // GET /api/search/status - Get indexing status
  fastify.get('/api/search/status', async () => {
    const allNotes = scanner.getAll();
    const indexedCount = searchIndex.getIndexedCount();

    return {
      totalDocuments: allNotes.length,
      indexedDocuments: indexedCount,
      isComplete: indexedCount >= allNotes.length,
      percentComplete: allNotes.length > 0
        ? Math.round((indexedCount / allNotes.length) * 100)
        : 100,
    };
  });

  // POST /api/search/reindex - Trigger re-indexing
  fastify.post('/api/search/reindex', async () => {
    // Clear existing index
    searchIndex.clearIndex();

    // Start background indexing
    const notes = scanner.getAll();
    searchIndex.indexAllNotes(notes).catch(error => {
      console.error('Background indexing error:', error);
    });

    return { message: 'Reindexing started', totalDocuments: notes.length };
  });
};
