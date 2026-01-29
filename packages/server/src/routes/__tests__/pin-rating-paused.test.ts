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
    describe('happy path', () => {
      it('pins a note', async () => {
        const response = await fastify.inject({
          method: 'PATCH',
          url: '/api/library/test-note/pin',
          payload: { pinned: true },
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.success).toBe(true);
        expect(body.pinned).toBe(true);
      });

      it('unpins a note', async () => {
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

      it('pinning an already-pinned note succeeds', async () => {
        testNote.pinned = true;

        const response = await fastify.inject({
          method: 'PATCH',
          url: '/api/library/test-note/pin',
          payload: { pinned: true },
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.pinned).toBe(true);
      });

      it('unpinning an already-unpinned note succeeds', async () => {
        const response = await fastify.inject({
          method: 'PATCH',
          url: '/api/library/test-note/pin',
          payload: { pinned: false },
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.pinned).toBe(false);
      });
    });

    describe('frontmatter updates', () => {
      it('calls atomicFrontmatterUpdate with the note file path', async () => {
        await fastify.inject({
          method: 'PATCH',
          url: '/api/library/test-note/pin',
          payload: { pinned: true },
        });

        expect(mockAtomicFrontmatterUpdate).toHaveBeenCalledWith(
          '/test/library/notes/test.md',
          expect.any(Function)
        );
      });

      it('sets the configured pinned_key in frontmatter when pinning', async () => {
        await fastify.inject({
          method: 'PATCH',
          url: '/api/library/test-note/pin',
          payload: { pinned: true },
        });

        const modifier = mockAtomicFrontmatterUpdate.mock.calls[0][1];
        const frontmatter: Record<string, unknown> = {};
        modifier({ frontmatter, content: '' });

        expect(frontmatter[testConfig.pinned_key]).toBe(true);
      });

      it('deletes the pinned_key from frontmatter when unpinning', async () => {
        await fastify.inject({
          method: 'PATCH',
          url: '/api/library/test-note/pin',
          payload: { pinned: false },
        });

        const modifier = mockAtomicFrontmatterUpdate.mock.calls[0][1];
        const frontmatter: Record<string, unknown> = { pinned: true };
        modifier({ frontmatter, content: '' });

        expect(frontmatter[testConfig.pinned_key]).toBeUndefined();
      });
    });

    describe('in-memory cache updates', () => {
      it('updates scanner cache with pinned=true', async () => {
        await fastify.inject({
          method: 'PATCH',
          url: '/api/library/test-note/pin',
          payload: { pinned: true },
        });

        expect(mockScanner.updateNote).toHaveBeenCalledWith('test-note', { pinned: true });
      });

      it('updates scanner cache with pinned=false', async () => {
        await fastify.inject({
          method: 'PATCH',
          url: '/api/library/test-note/pin',
          payload: { pinned: false },
        });

        expect(mockScanner.updateNote).toHaveBeenCalledWith('test-note', { pinned: false });
      });
    });

    describe('error handling', () => {
      it('returns 404 for non-existent note', async () => {
        const response = await fastify.inject({
          method: 'PATCH',
          url: '/api/library/non-existent/pin',
          payload: { pinned: true },
        });

        expect(response.statusCode).toBe(404);
        const body = JSON.parse(response.body);
        expect(body.error).toBe('Note not found');
      });

      it('does not call atomicFrontmatterUpdate for non-existent note', async () => {
        await fastify.inject({
          method: 'PATCH',
          url: '/api/library/non-existent/pin',
          payload: { pinned: true },
        });

        expect(mockAtomicFrontmatterUpdate).not.toHaveBeenCalled();
      });

      it('returns 500 when atomicFrontmatterUpdate throws', async () => {
        mockAtomicFrontmatterUpdate.mockRejectedValueOnce(new Error('Write failed'));

        const response = await fastify.inject({
          method: 'PATCH',
          url: '/api/library/test-note/pin',
          payload: { pinned: true },
        });

        expect(response.statusCode).toBe(500);
        const body = JSON.parse(response.body);
        expect(body.error).toBe('Failed to update pin status');
      });

      it('does not update cache when atomicFrontmatterUpdate throws', async () => {
        mockAtomicFrontmatterUpdate.mockRejectedValueOnce(new Error('Write failed'));

        await fastify.inject({
          method: 'PATCH',
          url: '/api/library/test-note/pin',
          payload: { pinned: true },
        });

        expect(mockScanner.updateNote).not.toHaveBeenCalled();
      });
    });

    describe('schema validation', () => {
      it('rejects non-boolean pinned value', async () => {
        const response = await fastify.inject({
          method: 'PATCH',
          url: '/api/library/test-note/pin',
          payload: { pinned: 'invalid' },
        });

        expect(response.statusCode).toBe(400);
      });

      it('coerces numeric 1 to true', async () => {
        const response = await fastify.inject({
          method: 'PATCH',
          url: '/api/library/test-note/pin',
          payload: { pinned: 1 },
        });

        // Fastify JSON schema coerces 1 to true for boolean types
        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.pinned).toBe(true);
      });

      it('rejects missing pinned field', async () => {
        const response = await fastify.inject({
          method: 'PATCH',
          url: '/api/library/test-note/pin',
          payload: {},
        });

        expect(response.statusCode).toBe(400);
      });

      it('coerces null to false', async () => {
        const response = await fastify.inject({
          method: 'PATCH',
          url: '/api/library/test-note/pin',
          payload: { pinned: null },
        });

        // Fastify JSON schema coerces null to false for boolean types
        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.pinned).toBe(false);
      });
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
    describe('happy path', () => {
      it('sets a rating', async () => {
        const response = await fastify.inject({
          method: 'PATCH',
          url: '/api/library/test-note/rating',
          payload: { rating: 4 },
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.success).toBe(true);
        expect(body.rating).toBe(4);
      });

      it('clears a rating with null', async () => {
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

      it('accepts all valid ratings (1 through 5)', async () => {
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

      it('updates an existing rating to a new value', async () => {
        testNote.rating = 3;

        const response = await fastify.inject({
          method: 'PATCH',
          url: '/api/library/test-note/rating',
          payload: { rating: 5 },
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.rating).toBe(5);
      });
    });

    describe('frontmatter updates', () => {
      it('calls atomicFrontmatterUpdate with the note file path', async () => {
        await fastify.inject({
          method: 'PATCH',
          url: '/api/library/test-note/rating',
          payload: { rating: 4 },
        });

        expect(mockAtomicFrontmatterUpdate).toHaveBeenCalledWith(
          '/test/library/notes/test.md',
          expect.any(Function)
        );
      });

      it('sets the configured rating_key in frontmatter', async () => {
        await fastify.inject({
          method: 'PATCH',
          url: '/api/library/test-note/rating',
          payload: { rating: 3 },
        });

        const modifier = mockAtomicFrontmatterUpdate.mock.calls[0][1];
        const frontmatter: Record<string, unknown> = {};
        modifier({ frontmatter, content: '' });

        expect(frontmatter[testConfig.rating_key]).toBe(3);
      });

      it('deletes the rating_key from frontmatter when clearing', async () => {
        await fastify.inject({
          method: 'PATCH',
          url: '/api/library/test-note/rating',
          payload: { rating: null },
        });

        const modifier = mockAtomicFrontmatterUpdate.mock.calls[0][1];
        const frontmatter: Record<string, unknown> = { rating: 5 };
        modifier({ frontmatter, content: '' });

        expect(frontmatter[testConfig.rating_key]).toBeUndefined();
      });
    });

    describe('in-memory cache updates', () => {
      it('updates scanner cache with new rating', async () => {
        await fastify.inject({
          method: 'PATCH',
          url: '/api/library/test-note/rating',
          payload: { rating: 4 },
        });

        expect(mockScanner.updateNote).toHaveBeenCalledWith('test-note', { rating: 4 });
      });

      it('updates scanner cache when clearing rating', async () => {
        await fastify.inject({
          method: 'PATCH',
          url: '/api/library/test-note/rating',
          payload: { rating: null },
        });

        expect(mockScanner.updateNote).toHaveBeenCalledWith('test-note', { rating: null });
      });
    });

    describe('error handling', () => {
      it('returns 404 for non-existent note', async () => {
        const response = await fastify.inject({
          method: 'PATCH',
          url: '/api/library/non-existent/rating',
          payload: { rating: 5 },
        });

        expect(response.statusCode).toBe(404);
        const body = JSON.parse(response.body);
        expect(body.error).toBe('Note not found');
      });

      it('does not call atomicFrontmatterUpdate for non-existent note', async () => {
        await fastify.inject({
          method: 'PATCH',
          url: '/api/library/non-existent/rating',
          payload: { rating: 5 },
        });

        expect(mockAtomicFrontmatterUpdate).not.toHaveBeenCalled();
      });

      it('returns 500 when atomicFrontmatterUpdate throws', async () => {
        mockAtomicFrontmatterUpdate.mockRejectedValueOnce(new Error('Disk full'));

        const response = await fastify.inject({
          method: 'PATCH',
          url: '/api/library/test-note/rating',
          payload: { rating: 3 },
        });

        expect(response.statusCode).toBe(500);
        const body = JSON.parse(response.body);
        expect(body.error).toBe('Failed to update rating');
      });

      it('does not update cache when atomicFrontmatterUpdate throws', async () => {
        mockAtomicFrontmatterUpdate.mockRejectedValueOnce(new Error('Disk full'));

        await fastify.inject({
          method: 'PATCH',
          url: '/api/library/test-note/rating',
          payload: { rating: 3 },
        });

        expect(mockScanner.updateNote).not.toHaveBeenCalled();
      });
    });

    describe('schema validation', () => {
      it('rejects rating above maximum (6)', async () => {
        const response = await fastify.inject({
          method: 'PATCH',
          url: '/api/library/test-note/rating',
          payload: { rating: 6 },
        });

        expect(response.statusCode).toBe(400);
      });

      it('rejects rating below minimum (0)', async () => {
        const response = await fastify.inject({
          method: 'PATCH',
          url: '/api/library/test-note/rating',
          payload: { rating: 0 },
        });

        expect(response.statusCode).toBe(400);
      });

      it('rejects negative rating', async () => {
        const response = await fastify.inject({
          method: 'PATCH',
          url: '/api/library/test-note/rating',
          payload: { rating: -1 },
        });

        expect(response.statusCode).toBe(400);
      });

      it('rejects non-integer rating', async () => {
        const response = await fastify.inject({
          method: 'PATCH',
          url: '/api/library/test-note/rating',
          payload: { rating: 3.5 },
        });

        expect(response.statusCode).toBe(400);
      });

      it('rejects string rating value', async () => {
        const response = await fastify.inject({
          method: 'PATCH',
          url: '/api/library/test-note/rating',
          payload: { rating: 'five' },
        });

        expect(response.statusCode).toBe(400);
      });

      it('rejects missing rating field', async () => {
        const response = await fastify.inject({
          method: 'PATCH',
          url: '/api/library/test-note/rating',
          payload: {},
        });

        expect(response.statusCode).toBe(400);
      });

      it('coerces boolean true to 1 (valid rating)', async () => {
        const response = await fastify.inject({
          method: 'PATCH',
          url: '/api/library/test-note/rating',
          payload: { rating: true },
        });

        // Fastify JSON schema coerces boolean true to number 1
        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.rating).toBe(1);
      });
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
    describe('happy path', () => {
      it('pauses a note', async () => {
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
      });

      it('unpauses a note', async () => {
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

      it('returns an ISO timestamp when pausing', async () => {
        const response = await fastify.inject({
          method: 'PATCH',
          url: '/api/library/test-note/paused',
          payload: { paused: true },
        });

        const body = JSON.parse(response.body);
        // Verify the timestamp is a valid ISO date string
        const parsed = new Date(body.pausedAt);
        expect(parsed.toISOString()).toBe(body.pausedAt);
      });

      it('pausing an already-paused note succeeds with new timestamp', async () => {
        testNote.paused = true;
        testNote.pausedAt = '2024-01-15T10:00:00Z';

        const response = await fastify.inject({
          method: 'PATCH',
          url: '/api/library/test-note/paused',
          payload: { paused: true },
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.paused).toBe(true);
        expect(body.pausedAt).toBeDefined();
      });

      it('unpausing an already-unpaused note succeeds', async () => {
        const response = await fastify.inject({
          method: 'PATCH',
          url: '/api/library/test-note/paused',
          payload: { paused: false },
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.paused).toBe(false);
        expect(body.pausedAt).toBe(null);
      });
    });

    describe('frontmatter updates', () => {
      it('calls atomicFrontmatterUpdate with the note file path', async () => {
        await fastify.inject({
          method: 'PATCH',
          url: '/api/library/test-note/paused',
          payload: { paused: true },
        });

        expect(mockAtomicFrontmatterUpdate).toHaveBeenCalledWith(
          '/test/library/notes/test.md',
          expect.any(Function)
        );
      });

      it('sets both paused_key and paused_at_key in frontmatter when pausing', async () => {
        await fastify.inject({
          method: 'PATCH',
          url: '/api/library/test-note/paused',
          payload: { paused: true },
        });

        const modifier = mockAtomicFrontmatterUpdate.mock.calls[0][1];
        const frontmatter: Record<string, unknown> = {};
        modifier({ frontmatter, content: '' });

        expect(frontmatter[testConfig.paused_key]).toBe(true);
        expect(frontmatter[testConfig.paused_at_key]).toBeDefined();
        // Verify paused_at is an ISO timestamp
        const parsed = new Date(frontmatter[testConfig.paused_at_key] as string);
        expect(parsed.toISOString()).toBe(frontmatter[testConfig.paused_at_key]);
      });

      it('deletes both paused_key and paused_at_key from frontmatter when unpausing', async () => {
        await fastify.inject({
          method: 'PATCH',
          url: '/api/library/test-note/paused',
          payload: { paused: false },
        });

        const modifier = mockAtomicFrontmatterUpdate.mock.calls[0][1];
        const frontmatter: Record<string, unknown> = {
          paused: true,
          paused_at: '2024-01-15T10:00:00Z',
        };
        modifier({ frontmatter, content: '' });

        expect(frontmatter[testConfig.paused_key]).toBeUndefined();
        expect(frontmatter[testConfig.paused_at_key]).toBeUndefined();
      });
    });

    describe('in-memory cache updates', () => {
      it('updates scanner cache with paused=true and a pausedAt timestamp', async () => {
        await fastify.inject({
          method: 'PATCH',
          url: '/api/library/test-note/paused',
          payload: { paused: true },
        });

        expect(mockScanner.updateNote).toHaveBeenCalledWith('test-note', {
          paused: true,
          pausedAt: expect.any(String),
        });
      });

      it('updates scanner cache with paused=false and pausedAt=null', async () => {
        await fastify.inject({
          method: 'PATCH',
          url: '/api/library/test-note/paused',
          payload: { paused: false },
        });

        expect(mockScanner.updateNote).toHaveBeenCalledWith('test-note', {
          paused: false,
          pausedAt: null,
        });
      });
    });

    describe('error handling', () => {
      it('returns 404 for non-existent note', async () => {
        const response = await fastify.inject({
          method: 'PATCH',
          url: '/api/library/non-existent/paused',
          payload: { paused: true },
        });

        expect(response.statusCode).toBe(404);
        const body = JSON.parse(response.body);
        expect(body.error).toBe('Note not found');
      });

      it('does not call atomicFrontmatterUpdate for non-existent note', async () => {
        await fastify.inject({
          method: 'PATCH',
          url: '/api/library/non-existent/paused',
          payload: { paused: true },
        });

        expect(mockAtomicFrontmatterUpdate).not.toHaveBeenCalled();
      });

      it('returns 500 when atomicFrontmatterUpdate throws', async () => {
        mockAtomicFrontmatterUpdate.mockRejectedValueOnce(new Error('Permission denied'));

        const response = await fastify.inject({
          method: 'PATCH',
          url: '/api/library/test-note/paused',
          payload: { paused: true },
        });

        expect(response.statusCode).toBe(500);
        const body = JSON.parse(response.body);
        expect(body.error).toBe('Failed to update paused status');
      });

      it('does not update cache when atomicFrontmatterUpdate throws', async () => {
        mockAtomicFrontmatterUpdate.mockRejectedValueOnce(new Error('Permission denied'));

        await fastify.inject({
          method: 'PATCH',
          url: '/api/library/test-note/paused',
          payload: { paused: true },
        });

        expect(mockScanner.updateNote).not.toHaveBeenCalled();
      });
    });

    describe('schema validation', () => {
      it('rejects non-boolean paused value', async () => {
        const response = await fastify.inject({
          method: 'PATCH',
          url: '/api/library/test-note/paused',
          payload: { paused: 'invalid' },
        });

        expect(response.statusCode).toBe(400);
      });

      it('coerces numeric 1 to true', async () => {
        const response = await fastify.inject({
          method: 'PATCH',
          url: '/api/library/test-note/paused',
          payload: { paused: 1 },
        });

        // Fastify JSON schema coerces 1 to true for boolean types
        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.paused).toBe(true);
      });

      it('rejects missing paused field', async () => {
        const response = await fastify.inject({
          method: 'PATCH',
          url: '/api/library/test-note/paused',
          payload: {},
        });

        expect(response.statusCode).toBe(400);
      });

      it('coerces null to false', async () => {
        const response = await fastify.inject({
          method: 'PATCH',
          url: '/api/library/test-note/paused',
          payload: { paused: null },
        });

        // Fastify JSON schema coerces null to false for boolean types
        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.paused).toBe(false);
      });
    });
  });
});
