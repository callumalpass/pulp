import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { pinRoutes } from '../pin.js';
import { ratingRoutes } from '../rating.js';
import { pausedRoutes } from '../paused.js';
import type { LibraryScanner } from '../../services/library-scanner.js';
import type { Config } from '../../config/schema.js';
import type { LiteratureNote } from '@pulp/shared';

// Mock file-lock module
vi.mock('../../services/file-lock.js', () => ({
  atomicFrontmatterUpdate: vi.fn(async (filePath: string, modifier: Function) => {
    const parsed = { frontmatter: {}, content: '' };
    return modifier(parsed);
  }),
}));

import { atomicFrontmatterUpdate } from '../../services/file-lock.js';

const mockAtomicFrontmatterUpdate = vi.mocked(atomicFrontmatterUpdate);

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
  paused_key: 'paused',
  paused_at_key: 'paused_at',
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
};

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
    paused: false,
    pausedAt: null,
    rating: null,
    readingStats: null,
    totalPages: 100,
    readerPreferences: null,
    currentChapter: null,
    bookNotes: null,
    frontmatter: {},
    ...overrides,
  };
}

// Create mock scanner
function createMockScanner(notes: Map<string, LiteratureNote> = new Map()): LibraryScanner {
  return {
    getById: (id: string) => notes.get(id),
    getAll: () => Array.from(notes.values()),
    updateNote: vi.fn((id: string, updates: Partial<LiteratureNote>) => {
      const note = notes.get(id);
      if (note) {
        Object.assign(note, updates);
      }
    }),
    scan: vi.fn(),
    refresh: vi.fn(),
    getSummaries: vi.fn(),
  } as unknown as LibraryScanner;
}

describe('Pin Route', () => {
  let fastify: FastifyInstance;
  let mockScanner: LibraryScanner;
  let testNote: LiteratureNote;

  beforeEach(async () => {
    testNote = createTestNote();
    const notes = new Map([['test-note', testNote]]);
    mockScanner = createMockScanner(notes);

    fastify = Fastify();
    await fastify.register(pinRoutes, { scanner: mockScanner, config: testConfig });

    mockAtomicFrontmatterUpdate.mockClear();
  });

  afterEach(async () => {
    await fastify.close();
  });

  describe('PATCH /api/library/:id/pin', () => {
    it('should pin a note', async () => {
      const response = await fastify.inject({
        method: 'PATCH',
        url: '/api/library/test-note/pin',
        payload: { pinned: true },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.pinned).toBe(true);
      expect(mockAtomicFrontmatterUpdate).toHaveBeenCalled();
    });

    it('should unpin a note', async () => {
      testNote.pinned = true;

      const response = await fastify.inject({
        method: 'PATCH',
        url: '/api/library/test-note/pin',
        payload: { pinned: false },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.pinned).toBe(false);
    });

    it('should return 404 for non-existent note', async () => {
      const response = await fastify.inject({
        method: 'PATCH',
        url: '/api/library/non-existent/pin',
        payload: { pinned: true },
      });

      expect(response.statusCode).toBe(404);
    });

    it('should return 400 for invalid body', async () => {
      const response = await fastify.inject({
        method: 'PATCH',
        url: '/api/library/test-note/pin',
        payload: { pinned: 'invalid' },
      });

      expect(response.statusCode).toBe(400);
    });
  });
});

describe('Rating Route', () => {
  let fastify: FastifyInstance;
  let mockScanner: LibraryScanner;
  let testNote: LiteratureNote;

  beforeEach(async () => {
    testNote = createTestNote();
    const notes = new Map([['test-note', testNote]]);
    mockScanner = createMockScanner(notes);

    fastify = Fastify();
    await fastify.register(ratingRoutes, { scanner: mockScanner, config: testConfig });

    mockAtomicFrontmatterUpdate.mockClear();
  });

  afterEach(async () => {
    await fastify.close();
  });

  describe('PATCH /api/library/:id/rating', () => {
    it('should set a rating', async () => {
      const response = await fastify.inject({
        method: 'PATCH',
        url: '/api/library/test-note/rating',
        payload: { rating: 4 },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.rating).toBe(4);
      expect(mockAtomicFrontmatterUpdate).toHaveBeenCalled();
    });

    it('should clear a rating with null', async () => {
      testNote.rating = 5;

      const response = await fastify.inject({
        method: 'PATCH',
        url: '/api/library/test-note/rating',
        payload: { rating: null },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.rating).toBe(null);
    });

    it('should return 404 for non-existent note', async () => {
      const response = await fastify.inject({
        method: 'PATCH',
        url: '/api/library/non-existent/rating',
        payload: { rating: 5 },
      });

      expect(response.statusCode).toBe(404);
    });

    it('should reject invalid rating (out of range)', async () => {
      const response = await fastify.inject({
        method: 'PATCH',
        url: '/api/library/test-note/rating',
        payload: { rating: 6 },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should reject invalid rating (non-integer)', async () => {
      const response = await fastify.inject({
        method: 'PATCH',
        url: '/api/library/test-note/rating',
        payload: { rating: 3.5 },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should accept all valid ratings (1-5)', async () => {
      for (const rating of [1, 2, 3, 4, 5]) {
        const response = await fastify.inject({
          method: 'PATCH',
          url: '/api/library/test-note/rating',
          payload: { rating },
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.rating).toBe(rating);
      }
    });
  });
});

describe('Paused Route', () => {
  let fastify: FastifyInstance;
  let mockScanner: LibraryScanner;
  let testNote: LiteratureNote;

  beforeEach(async () => {
    testNote = createTestNote();
    const notes = new Map([['test-note', testNote]]);
    mockScanner = createMockScanner(notes);

    fastify = Fastify();
    await fastify.register(pausedRoutes, { scanner: mockScanner, config: testConfig });

    mockAtomicFrontmatterUpdate.mockClear();
  });

  afterEach(async () => {
    await fastify.close();
  });

  describe('PATCH /api/library/:id/paused', () => {
    it('should pause a note', async () => {
      const response = await fastify.inject({
        method: 'PATCH',
        url: '/api/library/test-note/paused',
        payload: { paused: true },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.paused).toBe(true);
      expect(body.pausedAt).toBeDefined();
      expect(mockAtomicFrontmatterUpdate).toHaveBeenCalled();
    });

    it('should unpause a note', async () => {
      testNote.paused = true;
      testNote.pausedAt = '2024-01-15T10:00:00Z';

      const response = await fastify.inject({
        method: 'PATCH',
        url: '/api/library/test-note/paused',
        payload: { paused: false },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.paused).toBe(false);
      expect(body.pausedAt).toBe(null);
    });

    it('should return 404 for non-existent note', async () => {
      const response = await fastify.inject({
        method: 'PATCH',
        url: '/api/library/non-existent/paused',
        payload: { paused: true },
      });

      expect(response.statusCode).toBe(404);
    });

    it('should return 400 for invalid body', async () => {
      const response = await fastify.inject({
        method: 'PATCH',
        url: '/api/library/test-note/paused',
        payload: { paused: 'invalid' },
      });

      expect(response.statusCode).toBe(400);
    });
  });
});
