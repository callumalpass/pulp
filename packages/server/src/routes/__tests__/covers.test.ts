import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { coversRoutes } from '../covers.js';
import type { LibraryScanner } from '../../services/library-scanner.js';
import type { Config } from '../../config/schema.js';
import type { LiteratureNote } from '@pulp/shared';

// Mock the CoverExtractor
const mockGetCover = vi.fn();
vi.mock('../../services/cover-extractor.js', () => ({
  CoverExtractor: class {
    getCover = mockGetCover;
  },
}));

// Test configuration
const testConfig: Config = {
  library_path: '/test/library',
  literature_note_tag: 'literature-note',
  source_key: 'source',
  progress_key: 'reading_progress',
  last_read_key: 'last_read',
  last_opened_cfi_key: 'last_opened_cfi',
  date_created_key: 'dateCreated',
  author_key: 'author',
  rating_key: 'rating',
  total_pages_key: 'total_pages',
  bookmarks_key: 'bookmarks',
  pinned_key: 'pinned',
  reading_stats_key: 'reading_stats',
  reading_history_key: 'reading_history',
  reading_sessions_key: 'reading_sessions',
  date_finished_key: 'date_finished',
  collections_key: 'collections',
  reader_preferences_key: 'reader_preferences',
  current_chapter_key: 'current_chapter',
  book_notes_key: 'book_notes',
  highlight_template: '> {{text}}\n- [[{{source}}#page={{page}}&selection={{selection}}|p. {{pageLabel}}]]',
  highlight_template_epub: '> {{text}}\n- [[{{source}}#cfi={{cfi}}|loc]]',
  progress_debounce_ms: 5000,
  exclude_folders: ['.obsidian', '.trash'],
  search_context_chars: 80,
  search_max_matches_per_doc: 50,
  search_results_per_doc: 10,
  reading_history_max_days: 90,
  cover_width: 300,
  cover_height: 450,
  cover_quality: 80,
  default_daily_goal_minutes: 30,
  default_grace_period_days: 1,
  paused_key: 'paused',
  paused_at_key: 'paused_at',
};

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
    bookNotes: null,
    paused: false,
    pausedAt: null,
    frontmatter: {},
    ...overrides,
  };
}

function createMockScanner(notes: Map<string, LiteratureNote> = new Map()): LibraryScanner {
  return {
    getById: (id: string) => notes.get(id),
    getAll: () => Array.from(notes.values()),
    updateNote: vi.fn(),
    scan: vi.fn(),
    refresh: vi.fn(),
    getSummaries: vi.fn(),
  } as unknown as LibraryScanner;
}

describe('coversRoutes', () => {
  let app: FastifyInstance;
  let notes: Map<string, LiteratureNote>;
  let mockScanner: LibraryScanner;

  beforeEach(async () => {
    notes = new Map();
    mockScanner = createMockScanner(notes);
    app = Fastify();
    await app.register(coversRoutes, { scanner: mockScanner, config: testConfig });
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('GET /api/covers/:id', () => {
    describe('happy path', () => {
      it('returns cover image with correct headers for a PDF note', async () => {
        const testNote = createTestNote();
        notes.set('test-note', testNote);

        const coverBuffer = Buffer.from('fake-webp-image-data');
        mockGetCover.mockResolvedValue(coverBuffer);

        const response = await app.inject({
          method: 'GET',
          url: '/api/covers/test-note',
        });

        expect(response.statusCode).toBe(200);
        expect(response.headers['content-type']).toBe('image/webp');
        expect(response.headers['cache-control']).toBe('public, max-age=86400');
        expect(response.rawPayload).toEqual(coverBuffer);
      });

      it('returns cover image for an EPUB note', async () => {
        const testNote = createTestNote({
          id: 'epub-note',
          sourceType: 'epub',
          filePath: '/test/library/books/test.epub',
        });
        notes.set('epub-note', testNote);

        const coverBuffer = Buffer.from('fake-epub-cover');
        mockGetCover.mockResolvedValue(coverBuffer);

        const response = await app.inject({
          method: 'GET',
          url: '/api/covers/epub-note',
        });

        expect(response.statusCode).toBe(200);
        expect(response.rawPayload).toEqual(coverBuffer);
      });

      it('passes correct arguments to getCover', async () => {
        const testNote = createTestNote({
          id: 'my-book',
          filePath: '/test/library/books/my-book.pdf',
          sourceType: 'pdf',
        });
        notes.set('my-book', testNote);

        mockGetCover.mockResolvedValue(Buffer.from('data'));

        await app.inject({
          method: 'GET',
          url: '/api/covers/my-book',
        });

        expect(mockGetCover).toHaveBeenCalledWith(
          'my-book',
          '/test/library/books/my-book.pdf',
          'pdf'
        );
      });
    });

    describe('note not found', () => {
      it('returns 404 when note does not exist', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/api/covers/nonexistent',
        });

        expect(response.statusCode).toBe(404);
        const body = response.json();
        expect(body.error).toBe('Note not found');
      });

      it('does not call getCover when note is not found', async () => {
        await app.inject({
          method: 'GET',
          url: '/api/covers/nonexistent',
        });

        expect(mockGetCover).not.toHaveBeenCalled();
      });
    });

    describe('no cover available', () => {
      it('returns 204 when getCover returns null', async () => {
        const testNote = createTestNote();
        notes.set('test-note', testNote);

        mockGetCover.mockResolvedValue(null);

        const response = await app.inject({
          method: 'GET',
          url: '/api/covers/test-note',
        });

        expect(response.statusCode).toBe(204);
        expect(response.body).toBe('');
      });
    });

    describe('error handling', () => {
      it('returns 500 when getCover throws an error', async () => {
        const testNote = createTestNote();
        notes.set('test-note', testNote);

        mockGetCover.mockRejectedValue(new Error('PDF parsing failed'));

        const response = await app.inject({
          method: 'GET',
          url: '/api/covers/test-note',
        });

        expect(response.statusCode).toBe(500);
        const body = response.json();
        expect(body.error).toBe('Failed to get cover');
      });
    });

    describe('edge cases', () => {
      it('handles URL-encoded note IDs', async () => {
        const testNote = createTestNote({ id: 'note-with-spaces' });
        notes.set('note-with-spaces', testNote);

        mockGetCover.mockResolvedValue(Buffer.from('data'));

        const response = await app.inject({
          method: 'GET',
          url: '/api/covers/note-with-spaces',
        });

        expect(response.statusCode).toBe(200);
      });

      it('sets 24-hour cache header on successful response', async () => {
        const testNote = createTestNote();
        notes.set('test-note', testNote);

        mockGetCover.mockResolvedValue(Buffer.from('data'));

        const response = await app.inject({
          method: 'GET',
          url: '/api/covers/test-note',
        });

        // 86400 seconds = 24 hours
        expect(response.headers['cache-control']).toBe('public, max-age=86400');
      });
    });
  });
});
