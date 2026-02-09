import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { searchRoutes } from '../search.js';
import type { SearchIndex, SearchResult } from '../../services/search-index.js';
import type { LibraryScanner } from '../../services/library-scanner.js';
import type { LiteratureNote } from '@pulp/shared';

// Test fixtures
function createTestNote(overrides: Partial<LiteratureNote> = {}): LiteratureNote {
  return {
    id: 'test-note',
    title: 'Test Book',
    author: 'Test Author',
    source: '/test/library/books/test.pdf',
    sourceRelative: 'books/test.pdf',
    sourceType: 'pdf',
    filePath: '/test/library/books/test.pdf',
    notePath: '/test/library/notes/test.md',
    progress: 50,
    lastRead: '2024-01-15T10:00:00Z',
    lastOpenedCfi: null,
    dateCreated: '2024-01-01T00:00:00Z',
    dateFinished: null,
    collections: [],
    tags: ['literature-note'],
    cover: null,
    highlights: [],
    bookmarks: [],
    pinned: false,
    rating: null,
    readingStats: null,
    totalPages: 100,
    readerPreferences: null,
    currentChapter: null,
    paused: false,
    pausedAt: null,
    bookNotes: null,
    frontmatter: {},
    ...overrides,
  };
}

function createSearchResult(overrides: Partial<SearchResult> = {}): SearchResult {
  return {
    noteId: 'test-note',
    title: 'Test Book',
    sourceType: 'pdf',
    matches: [
      {
        text: 'This is a match with the search query in context.',
        page: 42,
        position: 0,
      },
    ],
    totalMatches: 1,
    ...overrides,
  };
}

// Create mock search index
function createMockSearchIndex(
  searchResults: SearchResult[] = [],
  indexedCount: number = 0
): SearchIndex {
  return {
    search: vi.fn().mockReturnValue(searchResults),
    getIndexedCount: vi.fn().mockReturnValue(indexedCount),
    clearIndex: vi.fn(),
    indexAllNotes: vi.fn().mockResolvedValue(undefined),
    indexNote: vi.fn().mockResolvedValue(undefined),
    removeFromIndex: vi.fn(),
    saveCache: vi.fn(),
  } as unknown as SearchIndex;
}

// Create mock scanner
function createMockScanner(notes: LiteratureNote[] = []): LibraryScanner {
  const notesMap = new Map(notes.map(n => [n.id, n]));
  return {
    getById: (id: string) => notesMap.get(id),
    getAll: () => notes,
    updateNote: vi.fn(),
    scan: vi.fn(),
    refresh: vi.fn(),
    getSummaries: vi.fn(),
  } as unknown as LibraryScanner;
}

describe('search routes', () => {
  let fastify: FastifyInstance;
  let mockSearchIndex: SearchIndex;
  let mockScanner: LibraryScanner;

  afterEach(async () => {
    vi.restoreAllMocks();
    await fastify.close();
  });

  describe('GET /api/search', () => {
    beforeEach(async () => {
      vi.clearAllMocks();

      const searchResults = [
        createSearchResult({
          noteId: 'note-1',
          title: 'Book One',
          matches: [
            { text: 'Found the query here', page: 10, position: 10 },
            { text: 'Also found query here', page: 20, position: 20 },
          ],
          totalMatches: 2,
        }),
        createSearchResult({
          noteId: 'note-2',
          title: 'Book Two',
          matches: [
            { text: 'Another query match', page: 5, position: 5 },
          ],
          totalMatches: 1,
        }),
      ];

      mockSearchIndex = createMockSearchIndex(searchResults, 2);
      mockScanner = createMockScanner([
        createTestNote({ id: 'note-1', title: 'Book One' }),
        createTestNote({ id: 'note-2', title: 'Book Two' }),
      ]);

      fastify = Fastify({ logger: false });
      await fastify.register(searchRoutes, {
        searchIndex: mockSearchIndex,
        scanner: mockScanner,
      });
      await fastify.ready();
    });

    it('searches with a query and returns results', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/search?q=test+query',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.query).toBe('test query');
      expect(body.results).toHaveLength(2);
      expect(body.totalResults).toBe(2);
      expect(mockSearchIndex.search).toHaveBeenCalledWith('test query', undefined);
    });

    it('filters by noteId when provided', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/search?q=test+query&noteId=note-1',
      });

      expect(response.statusCode).toBe(200);
      expect(mockSearchIndex.search).toHaveBeenCalledWith('test query', ['note-1']);
    });

    it('respects the limit parameter', async () => {
      // Create many results to test limiting
      const manyResults = Array.from({ length: 30 }, (_, i) =>
        createSearchResult({ noteId: `note-${i}`, title: `Book ${i}` })
      );
      vi.mocked(mockSearchIndex.search).mockReturnValue(manyResults);

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/search?q=test&limit=5',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.results).toHaveLength(5);
      expect(body.totalResults).toBe(30);
    });

    it('uses default limit of 20', async () => {
      const manyResults = Array.from({ length: 50 }, (_, i) =>
        createSearchResult({ noteId: `note-${i}`, title: `Book ${i}` })
      );
      vi.mocked(mockSearchIndex.search).mockReturnValue(manyResults);

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/search?q=test',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.results).toHaveLength(20);
      expect(body.totalResults).toBe(50);
    });

    it('returns empty results when no matches', async () => {
      vi.mocked(mockSearchIndex.search).mockReturnValue([]);

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/search?q=nonexistent',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.query).toBe('nonexistent');
      expect(body.results).toHaveLength(0);
      expect(body.totalResults).toBe(0);
    });

    it('requires a query parameter', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/search',
      });

      expect(response.statusCode).toBe(400);
    });

    it('rejects empty query', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/search?q=',
      });

      expect(response.statusCode).toBe(400);
    });

    it('handles limit at boundary values', async () => {
      const results = Array.from({ length: 5 }, (_, i) =>
        createSearchResult({ noteId: `note-${i}`, title: `Book ${i}` })
      );
      vi.mocked(mockSearchIndex.search).mockReturnValue(results);

      // Test minimum limit
      const minResponse = await fastify.inject({
        method: 'GET',
        url: '/api/search?q=test&limit=1',
      });
      expect(minResponse.statusCode).toBe(200);
      expect(JSON.parse(minResponse.body).results).toHaveLength(1);

      // Test maximum limit
      const maxResponse = await fastify.inject({
        method: 'GET',
        url: '/api/search?q=test&limit=100',
      });
      expect(maxResponse.statusCode).toBe(200);
      expect(JSON.parse(maxResponse.body).results).toHaveLength(5);
    });

    it('rejects limit below minimum', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/search?q=test&limit=0',
      });

      expect(response.statusCode).toBe(400);
    });

    it('rejects limit above maximum', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/search?q=test&limit=101',
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('GET /api/search/status', () => {
    it('returns indexing status when partially indexed', async () => {
      mockSearchIndex = createMockSearchIndex([], 5);
      mockScanner = createMockScanner([
        createTestNote({ id: 'note-1' }),
        createTestNote({ id: 'note-2' }),
        createTestNote({ id: 'note-3' }),
        createTestNote({ id: 'note-4' }),
        createTestNote({ id: 'note-5' }),
        createTestNote({ id: 'note-6' }),
        createTestNote({ id: 'note-7' }),
        createTestNote({ id: 'note-8' }),
        createTestNote({ id: 'note-9' }),
        createTestNote({ id: 'note-10' }),
      ]);

      fastify = Fastify({ logger: false });
      await fastify.register(searchRoutes, {
        searchIndex: mockSearchIndex,
        scanner: mockScanner,
      });
      await fastify.ready();

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/search/status',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.totalDocuments).toBe(10);
      expect(body.indexedDocuments).toBe(5);
      expect(body.isComplete).toBe(false);
      expect(body.percentComplete).toBe(50);
    });

    it('returns complete status when all documents indexed', async () => {
      mockSearchIndex = createMockSearchIndex([], 3);
      mockScanner = createMockScanner([
        createTestNote({ id: 'note-1' }),
        createTestNote({ id: 'note-2' }),
        createTestNote({ id: 'note-3' }),
      ]);

      fastify = Fastify({ logger: false });
      await fastify.register(searchRoutes, {
        searchIndex: mockSearchIndex,
        scanner: mockScanner,
      });
      await fastify.ready();

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/search/status',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.totalDocuments).toBe(3);
      expect(body.indexedDocuments).toBe(3);
      expect(body.isComplete).toBe(true);
      expect(body.percentComplete).toBe(100);
    });

    it('handles empty library', async () => {
      mockSearchIndex = createMockSearchIndex([], 0);
      mockScanner = createMockScanner([]);

      fastify = Fastify({ logger: false });
      await fastify.register(searchRoutes, {
        searchIndex: mockSearchIndex,
        scanner: mockScanner,
      });
      await fastify.ready();

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/search/status',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.totalDocuments).toBe(0);
      expect(body.indexedDocuments).toBe(0);
      expect(body.isComplete).toBe(true);
      expect(body.percentComplete).toBe(100);
    });

    it('rounds percent complete correctly', async () => {
      mockSearchIndex = createMockSearchIndex([], 1);
      mockScanner = createMockScanner([
        createTestNote({ id: 'note-1' }),
        createTestNote({ id: 'note-2' }),
        createTestNote({ id: 'note-3' }),
      ]);

      fastify = Fastify({ logger: false });
      await fastify.register(searchRoutes, {
        searchIndex: mockSearchIndex,
        scanner: mockScanner,
      });
      await fastify.ready();

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/search/status',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      // 1/3 = 0.333... should round to 33
      expect(body.percentComplete).toBe(33);
    });
  });

  describe('POST /api/search/reindex', () => {
    beforeEach(async () => {
      vi.clearAllMocks();

      mockSearchIndex = createMockSearchIndex([], 0);
      mockScanner = createMockScanner([
        createTestNote({ id: 'note-1', title: 'Book One' }),
        createTestNote({ id: 'note-2', title: 'Book Two' }),
        createTestNote({ id: 'note-3', title: 'Book Three' }),
      ]);

      fastify = Fastify({ logger: false });
      await fastify.register(searchRoutes, {
        searchIndex: mockSearchIndex,
        scanner: mockScanner,
      });
      await fastify.ready();
    });

    it('clears the index and starts reindexing', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/api/search/reindex',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.message).toBe('Reindexing started');
      expect(body.totalDocuments).toBe(3);
      expect(mockSearchIndex.clearIndex).toHaveBeenCalled();
      expect(mockSearchIndex.indexAllNotes).toHaveBeenCalled();
    });

    it('passes all notes to indexAllNotes', async () => {
      await fastify.inject({
        method: 'POST',
        url: '/api/search/reindex',
      });

      expect(mockSearchIndex.indexAllNotes).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ id: 'note-1' }),
          expect.objectContaining({ id: 'note-2' }),
          expect.objectContaining({ id: 'note-3' }),
        ])
      );
    });

    it('handles reindex with empty library', async () => {
      mockScanner = createMockScanner([]);

      fastify = Fastify({ logger: false });
      await fastify.register(searchRoutes, {
        searchIndex: mockSearchIndex,
        scanner: mockScanner,
      });
      await fastify.ready();

      const response = await fastify.inject({
        method: 'POST',
        url: '/api/search/reindex',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.totalDocuments).toBe(0);
      expect(mockSearchIndex.clearIndex).toHaveBeenCalled();
      expect(mockSearchIndex.indexAllNotes).toHaveBeenCalledWith([]);
    });

    it('handles indexing errors gracefully', async () => {
      // Mock indexAllNotes to reject
      vi.mocked(mockSearchIndex.indexAllNotes).mockRejectedValue(new Error('Indexing failed'));

      // The endpoint should still return success as indexing runs in background
      const response = await fastify.inject({
        method: 'POST',
        url: '/api/search/reindex',
      });

      expect(response.statusCode).toBe(200);
      expect(mockSearchIndex.clearIndex).toHaveBeenCalled();
    });
  });
});
