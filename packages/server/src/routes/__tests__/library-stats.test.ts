import { describe, it, expect, afterEach } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { libraryStatsRoutes } from '../library-stats.js';
import type { LibraryScanner } from '../../services/library-scanner.js';
import type { LiteratureNote, PDFHighlight } from '@pulp/shared';

// Helper to create a test literature note
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
    frontmatter: {},
    ...overrides,
  };
}

// Create mock scanner
function createMockScanner(notes: LiteratureNote[]): LibraryScanner {
  return {
    getById: (id: string) => notes.find(n => n.id === id),
    getAll: () => notes,
    updateNote: () => {},
    scan: () => {},
    refresh: () => {},
    getSummaries: () => [],
  } as unknown as LibraryScanner;
}

describe('library-stats routes', () => {
  let fastify: FastifyInstance;

  afterEach(async () => {
    await fastify.close();
  });

  describe('GET /api/library-stats', () => {
    it('returns basic statistics for empty library', async () => {
      fastify = Fastify({ logger: false });
      await fastify.register(libraryStatsRoutes, {
        scanner: createMockScanner([]),
      });
      await fastify.ready();

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library-stats',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      expect(body.totalBooks).toBe(0);
      expect(body.totalPdfBooks).toBe(0);
      expect(body.totalEpubBooks).toBe(0);
      expect(body.totalHighlights).toBe(0);
      expect(body.booksCompleted).toBe(0);
      expect(body.booksInProgress).toBe(0);
      expect(body.booksUnread).toBe(0);
    });

    it('counts books by type correctly', async () => {
      const notes = [
        createTestNote({ id: 'pdf1', sourceType: 'pdf' }),
        createTestNote({ id: 'pdf2', sourceType: 'pdf' }),
        createTestNote({ id: 'epub1', sourceType: 'epub' }),
      ];

      fastify = Fastify({ logger: false });
      await fastify.register(libraryStatsRoutes, {
        scanner: createMockScanner(notes),
      });
      await fastify.ready();

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library-stats',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      expect(body.totalBooks).toBe(3);
      expect(body.totalPdfBooks).toBe(2);
      expect(body.totalEpubBooks).toBe(1);
    });

    it('counts progress status correctly', async () => {
      const notes = [
        createTestNote({ id: 'completed', progress: 100 }),
        createTestNote({ id: 'in-progress-1', progress: 50 }),
        createTestNote({ id: 'in-progress-2', progress: 25 }),
        createTestNote({ id: 'unread', progress: 0 }),
      ];

      fastify = Fastify({ logger: false });
      await fastify.register(libraryStatsRoutes, {
        scanner: createMockScanner(notes),
      });
      await fastify.ready();

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library-stats',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      expect(body.booksCompleted).toBe(1);
      expect(body.booksInProgress).toBe(2);
      expect(body.booksUnread).toBe(1);
    });

    it('aggregates reading time and pages', async () => {
      const notes = [
        createTestNote({
          id: 'book1',
          readingStats: {
            totalReadingTimeMs: 3600000,
            totalSessions: 5,
            averageSessionMs: 720000,
            firstReadDate: '2024-01-01T10:00:00Z',
            pagesPerHour: 30,
            totalPagesRead: 50,
            longestSessionMs: 1800000,
            estimatedCompletionDate: null,
            averageDailyReadingMs: null,
          },
        }),
        createTestNote({
          id: 'book2',
          readingStats: {
            totalReadingTimeMs: 1800000,
            totalSessions: 3,
            averageSessionMs: 600000,
            firstReadDate: '2024-01-05T10:00:00Z',
            pagesPerHour: 25,
            totalPagesRead: 30,
            longestSessionMs: 3600000,
            estimatedCompletionDate: null,
            averageDailyReadingMs: null,
          },
        }),
      ];

      fastify = Fastify({ logger: false });
      await fastify.register(libraryStatsRoutes, {
        scanner: createMockScanner(notes),
      });
      await fastify.ready();

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library-stats',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      expect(body.totalReadingTimeMs).toBe(5400000); // 1.5 hours total
      expect(body.totalPagesRead).toBe(80); // 50 + 30
      expect(body.totalSessions).toBe(8); // 5 + 3
      expect(body.longestSessionMs).toBe(3600000); // Max of both
      expect(body.averageReadingSpeedPagesPerHour).toBe(27.5); // Average of 30 and 25
      expect(body.averageSessionDurationMs).toBe(675000); // 5400000 / 8
    });

    it('counts highlights by category', async () => {
      const highlights: PDFHighlight[] = [
        { id: '1', type: 'pdf', page: 1, text: 'text1', selection: { beginIndex: 0, beginOffset: 0, endIndex: 0, endOffset: 5 }, createdAt: '2024-01-01T00:00:00Z', category: 'highlight' },
        { id: '2', type: 'pdf', page: 2, text: 'text2', selection: { beginIndex: 0, beginOffset: 0, endIndex: 0, endOffset: 5 }, createdAt: '2024-01-01T00:00:00Z', category: 'highlight' },
        { id: '3', type: 'pdf', page: 3, text: 'text3', selection: { beginIndex: 0, beginOffset: 0, endIndex: 0, endOffset: 5 }, createdAt: '2024-01-01T00:00:00Z', category: 'important' },
        { id: '4', type: 'pdf', page: 4, text: 'text4', selection: { beginIndex: 0, beginOffset: 0, endIndex: 0, endOffset: 5 }, createdAt: '2024-01-01T00:00:00Z', category: 'question' },
        { id: '5', type: 'pdf', page: 5, text: 'text5', selection: { beginIndex: 0, beginOffset: 0, endIndex: 0, endOffset: 5 }, createdAt: '2024-01-01T00:00:00Z', category: 'todo' },
        { id: '6', type: 'pdf', page: 6, text: 'text6', selection: { beginIndex: 0, beginOffset: 0, endIndex: 0, endOffset: 5 }, createdAt: '2024-01-01T00:00:00Z', category: 'definition' },
      ];

      const notes = [createTestNote({ highlights })];

      fastify = Fastify({ logger: false });
      await fastify.register(libraryStatsRoutes, {
        scanner: createMockScanner(notes),
      });
      await fastify.ready();

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library-stats',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      expect(body.totalHighlights).toBe(6);
      expect(body.highlightsByCategory.highlight).toBe(2);
      expect(body.highlightsByCategory.important).toBe(1);
      expect(body.highlightsByCategory.question).toBe(1);
      expect(body.highlightsByCategory.todo).toBe(1);
      expect(body.highlightsByCategory.definition).toBe(1);
    });

    it('counts books by rating', async () => {
      const notes = [
        createTestNote({ id: 'rated5', rating: 5 }),
        createTestNote({ id: 'rated4a', rating: 4 }),
        createTestNote({ id: 'rated4b', rating: 4 }),
        createTestNote({ id: 'rated3', rating: 3 }),
        createTestNote({ id: 'rated2', rating: 2 }),
        createTestNote({ id: 'rated1', rating: 1 }),
        createTestNote({ id: 'unrated1', rating: null }),
        createTestNote({ id: 'unrated2', rating: null }),
      ];

      fastify = Fastify({ logger: false });
      await fastify.register(libraryStatsRoutes, {
        scanner: createMockScanner(notes),
      });
      await fastify.ready();

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library-stats',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      expect(body.booksByRating.rated5).toBe(1);
      expect(body.booksByRating.rated4).toBe(2);
      expect(body.booksByRating.rated3).toBe(1);
      expect(body.booksByRating.rated2).toBe(1);
      expect(body.booksByRating.rated1).toBe(1);
      expect(body.booksByRating.unrated).toBe(2);
    });

    it('calculates average days to complete', async () => {
      const notes = [
        createTestNote({
          id: 'completed1',
          progress: 100,
          dateFinished: '2024-01-15T00:00:00Z',
          readingStats: {
            totalReadingTimeMs: 3600000,
            totalSessions: 5,
            averageSessionMs: 720000,
            firstReadDate: '2024-01-10T00:00:00Z', // 5 days to complete
            pagesPerHour: 30,
            totalPagesRead: 50,
            longestSessionMs: 1800000,
            estimatedCompletionDate: null,
            averageDailyReadingMs: null,
          },
        }),
        createTestNote({
          id: 'completed2',
          progress: 100,
          dateFinished: '2024-01-20T00:00:00Z',
          readingStats: {
            totalReadingTimeMs: 1800000,
            totalSessions: 3,
            averageSessionMs: 600000,
            firstReadDate: '2024-01-10T00:00:00Z', // 10 days to complete
            pagesPerHour: 25,
            totalPagesRead: 30,
            longestSessionMs: 3600000,
            estimatedCompletionDate: null,
            averageDailyReadingMs: null,
          },
        }),
      ];

      fastify = Fastify({ logger: false });
      await fastify.register(libraryStatsRoutes, {
        scanner: createMockScanner(notes),
      });
      await fastify.ready();

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library-stats',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      // Average of 5 and 10 days = 8 days (rounded)
      expect(body.averageDaysToComplete).toBe(8);
    });

    it('counts books with estimated completion', async () => {
      const notes = [
        createTestNote({
          id: 'book1',
          progress: 50,
          readingStats: {
            totalReadingTimeMs: 3600000,
            totalSessions: 5,
            averageSessionMs: 720000,
            firstReadDate: '2024-01-01T10:00:00Z',
            pagesPerHour: 30,
            totalPagesRead: 50,
            longestSessionMs: 1800000,
            estimatedCompletionDate: '2024-02-01', // Has estimate
            averageDailyReadingMs: 1800000,
          },
        }),
        createTestNote({
          id: 'book2',
          progress: 25,
          readingStats: {
            totalReadingTimeMs: 1800000,
            totalSessions: 3,
            averageSessionMs: 600000,
            firstReadDate: '2024-01-05T10:00:00Z',
            pagesPerHour: null, // No estimate - missing data
            totalPagesRead: 30,
            longestSessionMs: 3600000,
            estimatedCompletionDate: null,
            averageDailyReadingMs: null,
          },
        }),
      ];

      fastify = Fastify({ logger: false });
      await fastify.register(libraryStatsRoutes, {
        scanner: createMockScanner(notes),
      });
      await fastify.ready();

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library-stats',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      expect(body.booksWithEstimatedCompletion).toBe(1);
    });

    it('counts unique collections', async () => {
      const notes = [
        createTestNote({ id: 'book1', collections: ['Fiction', 'Favorites'] }),
        createTestNote({ id: 'book2', collections: ['Fiction', 'To Read'] }),
        createTestNote({ id: 'book3', collections: ['Non-Fiction'] }),
      ];

      fastify = Fastify({ logger: false });
      await fastify.register(libraryStatsRoutes, {
        scanner: createMockScanner(notes),
      });
      await fastify.ready();

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library-stats',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      // Fiction, Favorites, To Read, Non-Fiction = 4 unique collections
      expect(body.collectionsCount).toBe(4);
    });
  });
});
