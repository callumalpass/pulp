import { describe, it, expect, afterEach } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { libraryStatsRoutes } from '../library-stats.js';
import type { LibraryScanner } from '../../services/library-scanner.js';
import type { LiteratureNote, PDFHighlight, EPUBHighlight, Bookmark } from '@pulp/shared';

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
    paused: false,
    pausedAt: null,
    bookNotes: null,
    frontmatter: {},
    ...overrides,
  };
}

function createPDFHighlight(overrides: Partial<PDFHighlight> = {}): PDFHighlight {
  return {
    id: 'h1',
    type: 'pdf',
    page: 1,
    text: 'highlighted text',
    selection: { beginIndex: 0, beginOffset: 0, endIndex: 0, endOffset: 5 },
    createdAt: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

function createEPUBHighlight(overrides: Partial<EPUBHighlight> = {}): EPUBHighlight {
  return {
    id: 'eh1',
    type: 'epub',
    cfi: 'epubcfi(/6/4)',
    text: 'epub highlighted text',
    createdAt: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

function createBookmark(overrides: Partial<Bookmark> = {}): Bookmark {
  return {
    id: 'b1',
    label: 'Bookmark',
    page: 1,
    createdAt: '2024-01-01T00:00:00Z',
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

// Helper to register and query stats
async function getStats(fastify: FastifyInstance) {
  const response = await fastify.inject({
    method: 'GET',
    url: '/api/library-stats',
  });
  expect(response.statusCode).toBe(200);
  return JSON.parse(response.body);
}

async function setupFastify(notes: LiteratureNote[]): Promise<FastifyInstance> {
  const fastify = Fastify({ logger: false });
  await fastify.register(libraryStatsRoutes, {
    scanner: createMockScanner(notes),
  });
  await fastify.ready();
  return fastify;
}

describe('library-stats routes', () => {
  let fastify: FastifyInstance;

  afterEach(async () => {
    await fastify.close();
  });

  describe('GET /api/library-stats', () => {
    describe('empty library', () => {
      it('returns zeroed statistics', async () => {
        fastify = await setupFastify([]);
        const body = await getStats(fastify);

        expect(body.totalBooks).toBe(0);
        expect(body.totalPdfBooks).toBe(0);
        expect(body.totalEpubBooks).toBe(0);
        expect(body.totalHighlights).toBe(0);
        expect(body.totalBookmarks).toBe(0);
        expect(body.booksCompleted).toBe(0);
        expect(body.booksInProgress).toBe(0);
        expect(body.booksUnread).toBe(0);
        expect(body.averageProgress).toBe(0);
        expect(body.collectionsCount).toBe(0);
      });

      it('returns null for aggregate calculations', async () => {
        fastify = await setupFastify([]);
        const body = await getStats(fastify);

        expect(body.totalReadingTimeMs).toBe(0);
        expect(body.totalPagesRead).toBe(0);
        expect(body.totalSessions).toBe(0);
        expect(body.averageReadingSpeedPagesPerHour).toBeNull();
        expect(body.averageSessionDurationMs).toBeNull();
        expect(body.longestSessionMs).toBeNull();
        expect(body.averageDaysToComplete).toBeNull();
        expect(body.booksWithEstimatedCompletion).toBe(0);
      });

      it('returns zero highlight and rating breakdowns', async () => {
        fastify = await setupFastify([]);
        const body = await getStats(fastify);

        expect(body.highlightsByCategory).toEqual({
          highlight: 0,
          important: 0,
          question: 0,
          todo: 0,
          definition: 0,
        });
        expect(body.booksByRating).toEqual({
          rated5: 0,
          rated4: 0,
          rated3: 0,
          rated2: 0,
          rated1: 0,
          unrated: 0,
        });
      });

      it('returns empty yearly completion data with current year', async () => {
        fastify = await setupFastify([]);
        const body = await getStats(fastify);

        expect(body.booksCompletedByYear).toEqual({});
        expect(body.booksCompletedThisYear).toBe(0);
        expect(body.currentYear).toBe(new Date().getFullYear());
      });
    });

    describe('book type counting', () => {
      it('counts PDFs and EPUBs correctly', async () => {
        const notes = [
          createTestNote({ id: 'pdf1', sourceType: 'pdf' }),
          createTestNote({ id: 'pdf2', sourceType: 'pdf' }),
          createTestNote({ id: 'epub1', sourceType: 'epub' }),
        ];

        fastify = await setupFastify(notes);
        const body = await getStats(fastify);

        expect(body.totalBooks).toBe(3);
        expect(body.totalPdfBooks).toBe(2);
        expect(body.totalEpubBooks).toBe(1);
      });

      it('counts all EPUBs when no PDFs exist', async () => {
        const notes = [
          createTestNote({ id: 'epub1', sourceType: 'epub' }),
          createTestNote({ id: 'epub2', sourceType: 'epub' }),
        ];

        fastify = await setupFastify(notes);
        const body = await getStats(fastify);

        expect(body.totalBooks).toBe(2);
        expect(body.totalPdfBooks).toBe(0);
        expect(body.totalEpubBooks).toBe(2);
      });

      it('counts a single book', async () => {
        fastify = await setupFastify([createTestNote()]);
        const body = await getStats(fastify);

        expect(body.totalBooks).toBe(1);
        expect(body.totalPdfBooks).toBe(1);
        expect(body.totalEpubBooks).toBe(0);
      });
    });

    describe('progress status counting', () => {
      it('counts completed, in-progress, and unread correctly', async () => {
        const notes = [
          createTestNote({ id: 'completed', progress: 100 }),
          createTestNote({ id: 'in-progress-1', progress: 50 }),
          createTestNote({ id: 'in-progress-2', progress: 25 }),
          createTestNote({ id: 'unread', progress: 0 }),
        ];

        fastify = await setupFastify(notes);
        const body = await getStats(fastify);

        expect(body.booksCompleted).toBe(1);
        expect(body.booksInProgress).toBe(2);
        expect(body.booksUnread).toBe(1);
      });

      it('treats progress=1 as in-progress, not unread', async () => {
        fastify = await setupFastify([createTestNote({ progress: 1 })]);
        const body = await getStats(fastify);

        expect(body.booksInProgress).toBe(1);
        expect(body.booksUnread).toBe(0);
      });

      it('treats progress=99 as in-progress, not completed', async () => {
        fastify = await setupFastify([createTestNote({ progress: 99 })]);
        const body = await getStats(fastify);

        expect(body.booksInProgress).toBe(1);
        expect(body.booksCompleted).toBe(0);
      });
    });

    describe('average progress', () => {
      it('calculates average progress across books', async () => {
        const notes = [
          createTestNote({ id: 'a', progress: 0 }),
          createTestNote({ id: 'b', progress: 50 }),
          createTestNote({ id: 'c', progress: 100 }),
        ];

        fastify = await setupFastify(notes);
        const body = await getStats(fastify);

        expect(body.averageProgress).toBe(50);
      });

      it('rounds average progress to nearest integer', async () => {
        const notes = [
          createTestNote({ id: 'a', progress: 33 }),
          createTestNote({ id: 'b', progress: 33 }),
          createTestNote({ id: 'c', progress: 34 }),
        ];

        fastify = await setupFastify(notes);
        const body = await getStats(fastify);

        // (33 + 33 + 34) / 3 = 33.33... -> 33
        expect(body.averageProgress).toBe(33);
      });

      it('returns 0 for empty library', async () => {
        fastify = await setupFastify([]);
        const body = await getStats(fastify);

        expect(body.averageProgress).toBe(0);
      });
    });

    describe('reading time and session aggregation', () => {
      it('aggregates reading time and pages from multiple books', async () => {
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

        fastify = await setupFastify(notes);
        const body = await getStats(fastify);

        expect(body.totalReadingTimeMs).toBe(5400000);
        expect(body.totalPagesRead).toBe(80);
        expect(body.totalSessions).toBe(8);
        expect(body.longestSessionMs).toBe(3600000);
        expect(body.averageReadingSpeedPagesPerHour).toBe(27.5);
        expect(body.averageSessionDurationMs).toBe(675000);
      });

      it('skips notes without readingStats', async () => {
        const notes = [
          createTestNote({
            id: 'with-stats',
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
          createTestNote({ id: 'without-stats', readingStats: null }),
        ];

        fastify = await setupFastify(notes);
        const body = await getStats(fastify);

        expect(body.totalReadingTimeMs).toBe(3600000);
        expect(body.totalSessions).toBe(5);
        expect(body.totalPagesRead).toBe(50);
      });

      it('handles notes with zero totalReadingTimeMs', async () => {
        fastify = await setupFastify([
          createTestNote({
            readingStats: {
              totalReadingTimeMs: 0,
              totalSessions: 0,
              averageSessionMs: 0,
              firstReadDate: null,
              pagesPerHour: null,
              totalPagesRead: 0,
              longestSessionMs: null,
              estimatedCompletionDate: null,
              averageDailyReadingMs: null,
            },
          }),
        ]);
        const body = await getStats(fastify);

        expect(body.totalReadingTimeMs).toBe(0);
        expect(body.averageSessionDurationMs).toBeNull();
      });
    });

    describe('longest session tracking', () => {
      it('picks the longest session across all books', async () => {
        const notes = [
          createTestNote({
            id: 'a',
            readingStats: {
              totalReadingTimeMs: 1000, totalSessions: 1, averageSessionMs: 1000,
              firstReadDate: null, pagesPerHour: null, totalPagesRead: 0,
              longestSessionMs: 5000, estimatedCompletionDate: null, averageDailyReadingMs: null,
            },
          }),
          createTestNote({
            id: 'b',
            readingStats: {
              totalReadingTimeMs: 1000, totalSessions: 1, averageSessionMs: 1000,
              firstReadDate: null, pagesPerHour: null, totalPagesRead: 0,
              longestSessionMs: 10000, estimatedCompletionDate: null, averageDailyReadingMs: null,
            },
          }),
          createTestNote({
            id: 'c',
            readingStats: {
              totalReadingTimeMs: 1000, totalSessions: 1, averageSessionMs: 1000,
              firstReadDate: null, pagesPerHour: null, totalPagesRead: 0,
              longestSessionMs: 3000, estimatedCompletionDate: null, averageDailyReadingMs: null,
            },
          }),
        ];

        fastify = await setupFastify(notes);
        const body = await getStats(fastify);

        expect(body.longestSessionMs).toBe(10000);
      });

      it('returns null when all longestSessionMs are null', async () => {
        fastify = await setupFastify([
          createTestNote({
            readingStats: {
              totalReadingTimeMs: 1000, totalSessions: 1, averageSessionMs: 1000,
              firstReadDate: null, pagesPerHour: null, totalPagesRead: 0,
              longestSessionMs: null, estimatedCompletionDate: null, averageDailyReadingMs: null,
            },
          }),
        ]);
        const body = await getStats(fastify);

        expect(body.longestSessionMs).toBeNull();
      });

      it('ignores null longestSessionMs when finding max', async () => {
        const notes = [
          createTestNote({
            id: 'a',
            readingStats: {
              totalReadingTimeMs: 1000, totalSessions: 1, averageSessionMs: 1000,
              firstReadDate: null, pagesPerHour: null, totalPagesRead: 0,
              longestSessionMs: null, estimatedCompletionDate: null, averageDailyReadingMs: null,
            },
          }),
          createTestNote({
            id: 'b',
            readingStats: {
              totalReadingTimeMs: 1000, totalSessions: 1, averageSessionMs: 1000,
              firstReadDate: null, pagesPerHour: null, totalPagesRead: 0,
              longestSessionMs: 7000, estimatedCompletionDate: null, averageDailyReadingMs: null,
            },
          }),
        ];

        fastify = await setupFastify(notes);
        const body = await getStats(fastify);

        expect(body.longestSessionMs).toBe(7000);
      });
    });

    describe('reading speed averaging', () => {
      it('averages pagesPerHour across books with valid data', async () => {
        const notes = [
          createTestNote({
            id: 'a',
            readingStats: {
              totalReadingTimeMs: 1000, totalSessions: 1, averageSessionMs: 1000,
              firstReadDate: null, pagesPerHour: 20, totalPagesRead: 10,
              longestSessionMs: null, estimatedCompletionDate: null, averageDailyReadingMs: null,
            },
          }),
          createTestNote({
            id: 'b',
            readingStats: {
              totalReadingTimeMs: 1000, totalSessions: 1, averageSessionMs: 1000,
              firstReadDate: null, pagesPerHour: 40, totalPagesRead: 20,
              longestSessionMs: null, estimatedCompletionDate: null, averageDailyReadingMs: null,
            },
          }),
        ];

        fastify = await setupFastify(notes);
        const body = await getStats(fastify);

        expect(body.averageReadingSpeedPagesPerHour).toBe(30);
      });

      it('excludes books with null pagesPerHour from average', async () => {
        const notes = [
          createTestNote({
            id: 'a',
            readingStats: {
              totalReadingTimeMs: 1000, totalSessions: 1, averageSessionMs: 1000,
              firstReadDate: null, pagesPerHour: 20, totalPagesRead: 10,
              longestSessionMs: null, estimatedCompletionDate: null, averageDailyReadingMs: null,
            },
          }),
          createTestNote({
            id: 'b',
            readingStats: {
              totalReadingTimeMs: 1000, totalSessions: 1, averageSessionMs: 1000,
              firstReadDate: null, pagesPerHour: null, totalPagesRead: 0,
              longestSessionMs: null, estimatedCompletionDate: null, averageDailyReadingMs: null,
            },
          }),
        ];

        fastify = await setupFastify(notes);
        const body = await getStats(fastify);

        // Only book 'a' contributes: 20
        expect(body.averageReadingSpeedPagesPerHour).toBe(20);
      });

      it('excludes books with zero pagesPerHour from average', async () => {
        const notes = [
          createTestNote({
            id: 'a',
            readingStats: {
              totalReadingTimeMs: 1000, totalSessions: 1, averageSessionMs: 1000,
              firstReadDate: null, pagesPerHour: 30, totalPagesRead: 10,
              longestSessionMs: null, estimatedCompletionDate: null, averageDailyReadingMs: null,
            },
          }),
          createTestNote({
            id: 'b',
            readingStats: {
              totalReadingTimeMs: 1000, totalSessions: 1, averageSessionMs: 1000,
              firstReadDate: null, pagesPerHour: 0, totalPagesRead: 0,
              longestSessionMs: null, estimatedCompletionDate: null, averageDailyReadingMs: null,
            },
          }),
        ];

        fastify = await setupFastify(notes);
        const body = await getStats(fastify);

        expect(body.averageReadingSpeedPagesPerHour).toBe(30);
      });

      it('returns null when no books have valid reading speed', async () => {
        fastify = await setupFastify([
          createTestNote({
            readingStats: {
              totalReadingTimeMs: 1000, totalSessions: 1, averageSessionMs: 1000,
              firstReadDate: null, pagesPerHour: null, totalPagesRead: 0,
              longestSessionMs: null, estimatedCompletionDate: null, averageDailyReadingMs: null,
            },
          }),
        ]);
        const body = await getStats(fastify);

        expect(body.averageReadingSpeedPagesPerHour).toBeNull();
      });

      it('rounds reading speed to one decimal place', async () => {
        const notes = [
          createTestNote({
            id: 'a',
            readingStats: {
              totalReadingTimeMs: 1000, totalSessions: 1, averageSessionMs: 1000,
              firstReadDate: null, pagesPerHour: 10, totalPagesRead: 10,
              longestSessionMs: null, estimatedCompletionDate: null, averageDailyReadingMs: null,
            },
          }),
          createTestNote({
            id: 'b',
            readingStats: {
              totalReadingTimeMs: 1000, totalSessions: 1, averageSessionMs: 1000,
              firstReadDate: null, pagesPerHour: 11, totalPagesRead: 10,
              longestSessionMs: null, estimatedCompletionDate: null, averageDailyReadingMs: null,
            },
          }),
          createTestNote({
            id: 'c',
            readingStats: {
              totalReadingTimeMs: 1000, totalSessions: 1, averageSessionMs: 1000,
              firstReadDate: null, pagesPerHour: 12, totalPagesRead: 10,
              longestSessionMs: null, estimatedCompletionDate: null, averageDailyReadingMs: null,
            },
          }),
        ];

        fastify = await setupFastify(notes);
        const body = await getStats(fastify);

        // (10 + 11 + 12) / 3 = 11.0
        expect(body.averageReadingSpeedPagesPerHour).toBe(11);
      });
    });

    describe('highlights', () => {
      it('counts highlights by category', async () => {
        const highlights: PDFHighlight[] = [
          createPDFHighlight({ id: '1', category: 'highlight' }),
          createPDFHighlight({ id: '2', category: 'highlight' }),
          createPDFHighlight({ id: '3', category: 'important' }),
          createPDFHighlight({ id: '4', category: 'question' }),
          createPDFHighlight({ id: '5', category: 'todo' }),
          createPDFHighlight({ id: '6', category: 'definition' }),
        ];

        fastify = await setupFastify([createTestNote({ highlights })]);
        const body = await getStats(fastify);

        expect(body.totalHighlights).toBe(6);
        expect(body.highlightsByCategory.highlight).toBe(2);
        expect(body.highlightsByCategory.important).toBe(1);
        expect(body.highlightsByCategory.question).toBe(1);
        expect(body.highlightsByCategory.todo).toBe(1);
        expect(body.highlightsByCategory.definition).toBe(1);
      });

      it('defaults highlights without category to "highlight"', async () => {
        const highlights: PDFHighlight[] = [
          createPDFHighlight({ id: '1' }), // no category set
          createPDFHighlight({ id: '2' }), // no category set
        ];

        fastify = await setupFastify([createTestNote({ highlights })]);
        const body = await getStats(fastify);

        expect(body.totalHighlights).toBe(2);
        expect(body.highlightsByCategory.highlight).toBe(2);
      });

      it('aggregates highlights across multiple notes', async () => {
        const notes = [
          createTestNote({
            id: 'a',
            highlights: [
              createPDFHighlight({ id: '1', category: 'important' }),
              createPDFHighlight({ id: '2', category: 'question' }),
            ],
          }),
          createTestNote({
            id: 'b',
            highlights: [
              createPDFHighlight({ id: '3', category: 'important' }),
              createPDFHighlight({ id: '4', category: 'todo' }),
              createPDFHighlight({ id: '5', category: 'todo' }),
            ],
          }),
        ];

        fastify = await setupFastify(notes);
        const body = await getStats(fastify);

        expect(body.totalHighlights).toBe(5);
        expect(body.highlightsByCategory.important).toBe(2);
        expect(body.highlightsByCategory.question).toBe(1);
        expect(body.highlightsByCategory.todo).toBe(2);
      });

      it('counts EPUB highlights the same as PDF highlights', async () => {
        const notes = [
          createTestNote({
            id: 'epub-book',
            sourceType: 'epub',
            highlights: [
              createEPUBHighlight({ id: 'e1', category: 'highlight' }),
              createEPUBHighlight({ id: 'e2', category: 'definition' }),
            ],
          }),
        ];

        fastify = await setupFastify(notes);
        const body = await getStats(fastify);

        expect(body.totalHighlights).toBe(2);
        expect(body.highlightsByCategory.highlight).toBe(1);
        expect(body.highlightsByCategory.definition).toBe(1);
      });
    });

    describe('bookmarks', () => {
      it('counts total bookmarks across notes', async () => {
        const notes = [
          createTestNote({
            id: 'a',
            bookmarks: [
              createBookmark({ id: 'b1' }),
              createBookmark({ id: 'b2' }),
            ],
          }),
          createTestNote({
            id: 'b',
            bookmarks: [
              createBookmark({ id: 'b3' }),
            ],
          }),
          createTestNote({ id: 'c', bookmarks: [] }),
        ];

        fastify = await setupFastify(notes);
        const body = await getStats(fastify);

        expect(body.totalBookmarks).toBe(3);
      });

      it('returns zero bookmarks when none exist', async () => {
        fastify = await setupFastify([createTestNote({ bookmarks: [] })]);
        const body = await getStats(fastify);

        expect(body.totalBookmarks).toBe(0);
      });
    });

    describe('rating breakdown', () => {
      it('counts books by each rating level', async () => {
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

        fastify = await setupFastify(notes);
        const body = await getStats(fastify);

        expect(body.booksByRating.rated5).toBe(1);
        expect(body.booksByRating.rated4).toBe(2);
        expect(body.booksByRating.rated3).toBe(1);
        expect(body.booksByRating.rated2).toBe(1);
        expect(body.booksByRating.rated1).toBe(1);
        expect(body.booksByRating.unrated).toBe(2);
      });

      it('counts all unrated books correctly', async () => {
        const notes = [
          createTestNote({ id: 'a', rating: null }),
          createTestNote({ id: 'b', rating: null }),
          createTestNote({ id: 'c', rating: null }),
        ];

        fastify = await setupFastify(notes);
        const body = await getStats(fastify);

        expect(body.booksByRating.unrated).toBe(3);
        expect(body.booksByRating.rated5).toBe(0);
        expect(body.booksByRating.rated4).toBe(0);
        expect(body.booksByRating.rated3).toBe(0);
        expect(body.booksByRating.rated2).toBe(0);
        expect(body.booksByRating.rated1).toBe(0);
      });
    });

    describe('days to complete calculation', () => {
      it('calculates average days to complete', async () => {
        const notes = [
          createTestNote({
            id: 'completed1',
            progress: 100,
            dateFinished: '2024-01-15T00:00:00Z',
            readingStats: {
              totalReadingTimeMs: 3600000, totalSessions: 5, averageSessionMs: 720000,
              firstReadDate: '2024-01-10T00:00:00Z', // 5 days
              pagesPerHour: 30, totalPagesRead: 50, longestSessionMs: 1800000,
              estimatedCompletionDate: null, averageDailyReadingMs: null,
            },
          }),
          createTestNote({
            id: 'completed2',
            progress: 100,
            dateFinished: '2024-01-20T00:00:00Z',
            readingStats: {
              totalReadingTimeMs: 1800000, totalSessions: 3, averageSessionMs: 600000,
              firstReadDate: '2024-01-10T00:00:00Z', // 10 days
              pagesPerHour: 25, totalPagesRead: 30, longestSessionMs: 3600000,
              estimatedCompletionDate: null, averageDailyReadingMs: null,
            },
          }),
        ];

        fastify = await setupFastify(notes);
        const body = await getStats(fastify);

        // Average of 5 and 10 days = 8 (rounded)
        expect(body.averageDaysToComplete).toBe(8);
      });

      it('returns null when no books have completion data', async () => {
        const notes = [
          createTestNote({ id: 'a', progress: 50, dateFinished: null }),
          createTestNote({ id: 'b', progress: 25, dateFinished: null }),
        ];

        fastify = await setupFastify(notes);
        const body = await getStats(fastify);

        expect(body.averageDaysToComplete).toBeNull();
      });

      it('excludes books without firstReadDate from average', async () => {
        const notes = [
          createTestNote({
            id: 'with-dates',
            progress: 100,
            dateFinished: '2024-01-20T00:00:00Z',
            readingStats: {
              totalReadingTimeMs: 1000, totalSessions: 1, averageSessionMs: 1000,
              firstReadDate: '2024-01-10T00:00:00Z', // 10 days
              pagesPerHour: null, totalPagesRead: 0, longestSessionMs: null,
              estimatedCompletionDate: null, averageDailyReadingMs: null,
            },
          }),
          createTestNote({
            id: 'no-first-read',
            progress: 100,
            dateFinished: '2024-02-01T00:00:00Z',
            readingStats: null, // no reading stats
          }),
        ];

        fastify = await setupFastify(notes);
        const body = await getStats(fastify);

        expect(body.averageDaysToComplete).toBe(10);
      });

      it('includes same-day completions as 1 day (Math.ceil)', async () => {
        const notes = [
          createTestNote({
            id: 'same-day',
            progress: 100,
            dateFinished: '2024-01-10T23:00:00Z',
            readingStats: {
              totalReadingTimeMs: 1000, totalSessions: 1, averageSessionMs: 1000,
              firstReadDate: '2024-01-10T08:00:00Z', // same day -> ceil(0.625) = 1
              pagesPerHour: null, totalPagesRead: 0, longestSessionMs: null,
              estimatedCompletionDate: null, averageDailyReadingMs: null,
            },
          }),
          createTestNote({
            id: 'multi-day',
            progress: 100,
            dateFinished: '2024-01-20T00:00:00Z',
            readingStats: {
              totalReadingTimeMs: 1000, totalSessions: 1, averageSessionMs: 1000,
              firstReadDate: '2024-01-10T00:00:00Z', // 10 days
              pagesPerHour: null, totalPagesRead: 0, longestSessionMs: null,
              estimatedCompletionDate: null, averageDailyReadingMs: null,
            },
          }),
        ];

        fastify = await setupFastify(notes);
        const body = await getStats(fastify);

        // Math.ceil rounds same-day to 1, average of (1 + 10) / 2 = 6 (rounded)
        expect(body.averageDaysToComplete).toBe(6);
      });
    });

    describe('estimated completion tracking', () => {
      it('counts books with estimated completion date', async () => {
        const notes = [
          createTestNote({
            id: 'book1',
            readingStats: {
              totalReadingTimeMs: 3600000, totalSessions: 5, averageSessionMs: 720000,
              firstReadDate: '2024-01-01T10:00:00Z', pagesPerHour: 30, totalPagesRead: 50,
              longestSessionMs: 1800000, estimatedCompletionDate: '2024-02-01',
              averageDailyReadingMs: 1800000,
            },
          }),
          createTestNote({
            id: 'book2',
            readingStats: {
              totalReadingTimeMs: 1800000, totalSessions: 3, averageSessionMs: 600000,
              firstReadDate: '2024-01-05T10:00:00Z', pagesPerHour: null, totalPagesRead: 30,
              longestSessionMs: 3600000, estimatedCompletionDate: null,
              averageDailyReadingMs: null,
            },
          }),
        ];

        fastify = await setupFastify(notes);
        const body = await getStats(fastify);

        expect(body.booksWithEstimatedCompletion).toBe(1);
      });

      it('returns zero when no books have estimates', async () => {
        fastify = await setupFastify([
          createTestNote({ readingStats: null }),
        ]);
        const body = await getStats(fastify);

        expect(body.booksWithEstimatedCompletion).toBe(0);
      });
    });

    describe('yearly completion breakdown', () => {
      it('uses lastRead as fallback when completed book has no dateFinished', async () => {
        const notes = [
          createTestNote({
            id: 'completed-no-date',
            progress: 100,
            dateFinished: null,
            lastRead: '2024-06-15T10:00:00Z',
          }),
          createTestNote({
            id: 'completed-with-date',
            progress: 100,
            dateFinished: '2024-03-10T10:00:00Z',
            lastRead: '2024-03-10T10:00:00Z',
          }),
        ];

        fastify = await setupFastify(notes);
        const body = await getStats(fastify);

        expect(body.booksCompleted).toBe(2);
        expect(body.booksCompletedByYear[2024]).toBe(2);
      });

      it('groups completions by year', async () => {
        const notes = [
          createTestNote({
            id: 'a', progress: 100,
            dateFinished: '2022-06-01T00:00:00Z',
          }),
          createTestNote({
            id: 'b', progress: 100,
            dateFinished: '2023-03-15T00:00:00Z',
          }),
          createTestNote({
            id: 'c', progress: 100,
            dateFinished: '2023-11-20T00:00:00Z',
          }),
          createTestNote({
            id: 'd', progress: 100,
            dateFinished: '2024-01-05T00:00:00Z',
          }),
        ];

        fastify = await setupFastify(notes);
        const body = await getStats(fastify);

        expect(body.booksCompletedByYear[2022]).toBe(1);
        expect(body.booksCompletedByYear[2023]).toBe(2);
        expect(body.booksCompletedByYear[2024]).toBe(1);
      });

      it('does not count completed books without any date in yearly breakdown', async () => {
        const notes = [
          createTestNote({
            id: 'no-dates',
            progress: 100,
            dateFinished: null,
            lastRead: null,
          }),
        ];

        fastify = await setupFastify(notes);
        const body = await getStats(fastify);

        expect(body.booksCompleted).toBe(1);
        expect(body.booksCompletedByYear).toEqual({});
      });

      it('counts books completed this year based on current year', async () => {
        const currentYear = new Date().getFullYear();
        const notes = [
          createTestNote({
            id: 'this-year',
            progress: 100,
            dateFinished: `${currentYear}-06-15T00:00:00Z`,
          }),
          createTestNote({
            id: 'last-year',
            progress: 100,
            dateFinished: `${currentYear - 1}-12-25T00:00:00Z`,
          }),
        ];

        fastify = await setupFastify(notes);
        const body = await getStats(fastify);

        expect(body.booksCompletedThisYear).toBe(1);
        expect(body.currentYear).toBe(currentYear);
      });

      it('does not count in-progress books in yearly breakdown', async () => {
        const notes = [
          createTestNote({
            id: 'in-progress',
            progress: 75,
            dateFinished: null,
            lastRead: '2024-01-15T10:00:00Z',
          }),
        ];

        fastify = await setupFastify(notes);
        const body = await getStats(fastify);

        expect(body.booksCompletedByYear).toEqual({});
        expect(body.booksCompletedThisYear).toBe(0);
      });
    });

    describe('collections', () => {
      it('counts unique collections across books', async () => {
        const notes = [
          createTestNote({ id: 'book1', collections: ['Fiction', 'Favorites'] }),
          createTestNote({ id: 'book2', collections: ['Fiction', 'To Read'] }),
          createTestNote({ id: 'book3', collections: ['Non-Fiction'] }),
        ];

        fastify = await setupFastify(notes);
        const body = await getStats(fastify);

        expect(body.collectionsCount).toBe(4);
      });

      it('returns zero when no books have collections', async () => {
        fastify = await setupFastify([
          createTestNote({ id: 'a', collections: [] }),
          createTestNote({ id: 'b', collections: [] }),
        ]);
        const body = await getStats(fastify);

        expect(body.collectionsCount).toBe(0);
      });

      it('handles single book with multiple collections', async () => {
        fastify = await setupFastify([
          createTestNote({ collections: ['A', 'B', 'C', 'D'] }),
        ]);
        const body = await getStats(fastify);

        expect(body.collectionsCount).toBe(4);
      });
    });

    describe('mixed data scenarios', () => {
      it('handles a library with all book states represented', async () => {
        const notes = [
          createTestNote({
            id: 'completed-rated',
            sourceType: 'pdf',
            progress: 100,
            rating: 5,
            dateFinished: '2024-06-01T00:00:00Z',
            collections: ['Favorites'],
            bookmarks: [createBookmark({ id: 'b1' })],
            highlights: [createPDFHighlight({ id: 'h1', category: 'important' })],
            readingStats: {
              totalReadingTimeMs: 7200000, totalSessions: 10, averageSessionMs: 720000,
              firstReadDate: '2024-05-01T00:00:00Z', pagesPerHour: 25, totalPagesRead: 200,
              longestSessionMs: 3600000, estimatedCompletionDate: null, averageDailyReadingMs: null,
            },
          }),
          createTestNote({
            id: 'in-progress-epub',
            sourceType: 'epub',
            progress: 45,
            rating: 3,
            collections: ['Reading Now'],
            highlights: [
              createEPUBHighlight({ id: 'e1', category: 'highlight' }),
              createEPUBHighlight({ id: 'e2', category: 'question' }),
            ],
            readingStats: {
              totalReadingTimeMs: 1800000, totalSessions: 3, averageSessionMs: 600000,
              firstReadDate: '2024-07-01T00:00:00Z', pagesPerHour: 35, totalPagesRead: 50,
              longestSessionMs: 900000, estimatedCompletionDate: '2024-09-01',
              averageDailyReadingMs: 600000,
            },
          }),
          createTestNote({
            id: 'unread-book',
            sourceType: 'pdf',
            progress: 0,
            rating: null,
            readingStats: null,
          }),
        ];

        fastify = await setupFastify(notes);
        const body = await getStats(fastify);

        expect(body.totalBooks).toBe(3);
        expect(body.totalPdfBooks).toBe(2);
        expect(body.totalEpubBooks).toBe(1);
        expect(body.booksCompleted).toBe(1);
        expect(body.booksInProgress).toBe(1);
        expect(body.booksUnread).toBe(1);
        expect(body.totalHighlights).toBe(3);
        expect(body.totalBookmarks).toBe(1);
        expect(body.totalReadingTimeMs).toBe(9000000);
        expect(body.totalSessions).toBe(13);
        expect(body.totalPagesRead).toBe(250);
        expect(body.longestSessionMs).toBe(3600000);
        expect(body.booksWithEstimatedCompletion).toBe(1);
        expect(body.collectionsCount).toBe(2);
        expect(body.averageReadingSpeedPagesPerHour).toBe(30); // (25+35)/2
        expect(body.booksByRating.rated5).toBe(1);
        expect(body.booksByRating.rated3).toBe(1);
        expect(body.booksByRating.unrated).toBe(1);
      });

      it('handles a large single-book library', async () => {
        const manyHighlights: PDFHighlight[] = Array.from({ length: 50 }, (_, i) =>
          createPDFHighlight({ id: `h${i}`, category: i % 2 === 0 ? 'highlight' : 'important' })
        );
        const manyBookmarks: Bookmark[] = Array.from({ length: 20 }, (_, i) =>
          createBookmark({ id: `b${i}`, label: `Bookmark ${i}` })
        );

        fastify = await setupFastify([
          createTestNote({
            highlights: manyHighlights,
            bookmarks: manyBookmarks,
          }),
        ]);
        const body = await getStats(fastify);

        expect(body.totalHighlights).toBe(50);
        expect(body.highlightsByCategory.highlight).toBe(25);
        expect(body.highlightsByCategory.important).toBe(25);
        expect(body.totalBookmarks).toBe(20);
      });
    });
  });
});
