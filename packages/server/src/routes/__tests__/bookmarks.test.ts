import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { bookmarkRoutes } from '../bookmarks.js';
import type { LibraryScanner } from '../../services/library-scanner.js';
import type { Config } from '../../config/schema.js';
import type { LiteratureNote, Bookmark } from '@pulp/shared';

// Mock fs module
vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

import { readFileSync } from 'node:fs';

const mockReadFileSync = vi.mocked(readFileSync);

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

describe('bookmarkRoutes', () => {
  let app: FastifyInstance;
  let notes: Map<string, LiteratureNote>;
  let mockScanner: LibraryScanner;

  beforeEach(async () => {
    notes = new Map();
    mockScanner = createMockScanner(notes);
    app = Fastify();
    await app.register(bookmarkRoutes, { scanner: mockScanner, config: testConfig });
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('POST /api/library/:id/bookmarks', () => {
    describe('label validation', () => {
      it('rejects empty label', async () => {
        const testNote = createTestNote();
        notes.set('test-note', testNote);

        const response = await app.inject({
          method: 'POST',
          url: '/api/library/test-note/bookmarks',
          payload: {
            label: '',
            page: 5,
          },
        });

        expect(response.statusCode).toBe(400);
        const body = response.json();
        expect(body.error).toContain('empty');
      });

      it('rejects whitespace-only label', async () => {
        const testNote = createTestNote();
        notes.set('test-note', testNote);

        const response = await app.inject({
          method: 'POST',
          url: '/api/library/test-note/bookmarks',
          payload: {
            label: '   ',
            page: 5,
          },
        });

        expect(response.statusCode).toBe(400);
        const body = response.json();
        expect(body.error).toContain('empty');
      });

      it('rejects label exceeding maximum length', async () => {
        const testNote = createTestNote();
        notes.set('test-note', testNote);

        const longLabel = 'a'.repeat(501);
        const response = await app.inject({
          method: 'POST',
          url: '/api/library/test-note/bookmarks',
          payload: {
            label: longLabel,
            page: 5,
          },
        });

        expect(response.statusCode).toBe(400);
        const body = response.json();
        expect(body.error).toContain('500');
      });

      it('accepts label at maximum length', async () => {
        const testNote = createTestNote();
        notes.set('test-note', testNote);

        mockReadFileSync.mockReturnValue('---\ntitle: Test\n---\nContent');

        const maxLabel = 'a'.repeat(500);
        const response = await app.inject({
          method: 'POST',
          url: '/api/library/test-note/bookmarks',
          payload: {
            label: maxLabel,
            page: 5,
          },
        });

        expect(response.statusCode).toBe(200);
        const body = response.json();
        expect(body.label).toBe(maxLabel);
      });

      it('trims whitespace from label', async () => {
        const testNote = createTestNote();
        notes.set('test-note', testNote);

        mockReadFileSync.mockReturnValue('---\ntitle: Test\n---\nContent');

        const response = await app.inject({
          method: 'POST',
          url: '/api/library/test-note/bookmarks',
          payload: {
            label: '  Chapter 5  ',
            page: 5,
          },
        });

        expect(response.statusCode).toBe(200);
        const body = response.json();
        expect(body.label).toBe('Chapter 5');
      });
    });

    describe('page validation', () => {
      it('rejects page less than 1', async () => {
        const testNote = createTestNote();
        notes.set('test-note', testNote);

        const response = await app.inject({
          method: 'POST',
          url: '/api/library/test-note/bookmarks',
          payload: {
            label: 'Test Bookmark',
            page: 0,
          },
        });

        expect(response.statusCode).toBe(400);
        const body = response.json();
        expect(body.error).toContain('at least 1');
      });

      it('rejects negative page', async () => {
        const testNote = createTestNote();
        notes.set('test-note', testNote);

        const response = await app.inject({
          method: 'POST',
          url: '/api/library/test-note/bookmarks',
          payload: {
            label: 'Test Bookmark',
            page: -5,
          },
        });

        expect(response.statusCode).toBe(400);
        const body = response.json();
        expect(body.error).toContain('at least 1');
      });

      it('rejects page exceeding total pages', async () => {
        const testNote = createTestNote({ totalPages: 50 });
        notes.set('test-note', testNote);

        const response = await app.inject({
          method: 'POST',
          url: '/api/library/test-note/bookmarks',
          payload: {
            label: 'Test Bookmark',
            page: 100,
          },
        });

        expect(response.statusCode).toBe(400);
        const body = response.json();
        expect(body.error).toContain('exceeds');
        expect(body.error).toContain('50');
      });

      it('accepts page at boundary of total pages', async () => {
        const testNote = createTestNote({ totalPages: 50 });
        notes.set('test-note', testNote);

        mockReadFileSync.mockReturnValue('---\ntitle: Test\n---\nContent');

        const response = await app.inject({
          method: 'POST',
          url: '/api/library/test-note/bookmarks',
          payload: {
            label: 'Last Page',
            page: 50,
          },
        });

        expect(response.statusCode).toBe(200);
        const body = response.json();
        expect(body.page).toBe(50);
      });

      it('accepts page when totalPages is null (unknown)', async () => {
        const testNote = createTestNote({ totalPages: null });
        notes.set('test-note', testNote);

        mockReadFileSync.mockReturnValue('---\ntitle: Test\n---\nContent');

        const response = await app.inject({
          method: 'POST',
          url: '/api/library/test-note/bookmarks',
          payload: {
            label: 'Any Page',
            page: 9999,
          },
        });

        expect(response.statusCode).toBe(200);
        const body = response.json();
        expect(body.page).toBe(9999);
      });
    });

    describe('location requirement', () => {
      it('rejects bookmark without page or cfi', async () => {
        const testNote = createTestNote();
        notes.set('test-note', testNote);

        const response = await app.inject({
          method: 'POST',
          url: '/api/library/test-note/bookmarks',
          payload: {
            label: 'Test Bookmark',
          },
        });

        expect(response.statusCode).toBe(400);
        const body = response.json();
        expect(body.error).toContain('page or cfi');
      });

      it('accepts bookmark with only cfi', async () => {
        const testNote = createTestNote({ sourceType: 'epub' });
        notes.set('test-note', testNote);

        mockReadFileSync.mockReturnValue('---\ntitle: Test\n---\nContent');

        const response = await app.inject({
          method: 'POST',
          url: '/api/library/test-note/bookmarks',
          payload: {
            label: 'EPUB Bookmark',
            cfi: 'epubcfi(/6/4!/4/2)',
          },
        });

        expect(response.statusCode).toBe(200);
        const body = response.json();
        expect(body.cfi).toBe('epubcfi(/6/4!/4/2)');
      });
    });
  });

  describe('PATCH /api/library/:id/bookmarks/:bookmarkId', () => {
    it('rejects empty label update', async () => {
      const existingBookmark: Bookmark = {
        id: 'bm-test123',
        label: 'Original',
        page: 5,
        createdAt: '2024-01-01T00:00:00Z',
      };
      const testNote = createTestNote({ bookmarks: [existingBookmark] });
      notes.set('test-note', testNote);

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/library/test-note/bookmarks/bm-test123',
        payload: {
          label: '',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.error).toContain('empty');
    });

    it('rejects label exceeding maximum length on update', async () => {
      const existingBookmark: Bookmark = {
        id: 'bm-test123',
        label: 'Original',
        page: 5,
        createdAt: '2024-01-01T00:00:00Z',
      };
      const testNote = createTestNote({ bookmarks: [existingBookmark] });
      notes.set('test-note', testNote);

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/library/test-note/bookmarks/bm-test123',
        payload: {
          label: 'a'.repeat(501),
        },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.error).toContain('500');
    });

    it('accepts valid label update', async () => {
      const existingBookmark: Bookmark = {
        id: 'bm-test123',
        label: 'Original',
        page: 5,
        createdAt: '2024-01-01T00:00:00Z',
      };
      const testNote = createTestNote({ bookmarks: [existingBookmark] });
      notes.set('test-note', testNote);

      mockReadFileSync.mockReturnValue(`---
title: Test
bookmarks:
  - "[[books/test.pdf#page=5|Original]]"
---
Content`);

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/library/test-note/bookmarks/bm-test123',
        payload: {
          label: 'Updated Label',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.label).toBe('Updated Label');
    });
  });
});
