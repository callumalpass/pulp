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

import { readFileSync, writeFileSync } from 'node:fs';
import matter from 'gray-matter';

const mockReadFileSync = vi.mocked(readFileSync);
const mockWriteFileSync = vi.mocked(writeFileSync);

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
    bookNotes: null,
    paused: false,
    pausedAt: null,
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
    vi.resetAllMocks();
    // Clear gray-matter's internal cache to prevent cross-test data leakage.
    // gray-matter caches parsed results keyed by content string, and uses
    // shallow copies - so mutations to frontmatter objects in one test
    // can leak into subsequent tests that parse the same content string.
    (matter as unknown as { clearCache?: () => void }).clearCache?.();
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

    it('can add notes to a bookmark', async () => {
      const existingBookmark: Bookmark = {
        id: 'bm-test123',
        label: 'Chapter 3',
        page: 5,
        createdAt: '2024-01-01T00:00:00Z',
      };
      const testNote = createTestNote({ bookmarks: [existingBookmark] });
      notes.set('test-note', testNote);

      mockReadFileSync.mockReturnValue(`---
title: Test
bookmarks:
  - "[[books/test.pdf#page=5|Chapter 3|2024-01-01T00:00:00Z]]"
---
Content`);

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/library/test-note/bookmarks/bm-test123',
        payload: {
          notes: 'This is where the protagonist is introduced.',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.notes).toBe('This is where the protagonist is introduced.');
    });

    it('can update both label and notes together', async () => {
      const existingBookmark: Bookmark = {
        id: 'bm-test123',
        label: 'Original',
        notes: 'Old notes',
        page: 5,
        createdAt: '2024-01-01T00:00:00Z',
      };
      const testNote = createTestNote({ bookmarks: [existingBookmark] });
      notes.set('test-note', testNote);

      mockReadFileSync.mockReturnValue(`---
title: Test
bookmarks:
  - link: "[[books/test.pdf#page=5|Original|2024-01-01T00:00:00Z]]"
    notes: Old notes
---
Content`);

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/library/test-note/bookmarks/bm-test123',
        payload: {
          label: 'New Label',
          notes: 'New notes',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.label).toBe('New Label');
      expect(body.notes).toBe('New notes');
    });

    it('can clear notes by setting empty string', async () => {
      const existingBookmark: Bookmark = {
        id: 'bm-test123',
        label: 'Chapter 3',
        notes: 'Some notes',
        page: 5,
        createdAt: '2024-01-01T00:00:00Z',
      };
      const testNote = createTestNote({ bookmarks: [existingBookmark] });
      notes.set('test-note', testNote);

      mockReadFileSync.mockReturnValue(`---
title: Test
bookmarks:
  - link: "[[books/test.pdf#page=5|Chapter 3|2024-01-01T00:00:00Z]]"
    notes: Some notes
---
Content`);

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/library/test-note/bookmarks/bm-test123',
        payload: {
          notes: '',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.notes).toBeUndefined();
    });
  });

  describe('POST /api/library/:id/bookmarks (with notes)', () => {
    it('can create bookmark with notes', async () => {
      const testNote = createTestNote();
      notes.set('test-note', testNote);

      mockReadFileSync.mockReturnValue(`---
title: Test
---
Content`);

      const response = await app.inject({
        method: 'POST',
        url: '/api/library/test-note/bookmarks',
        payload: {
          label: 'Important Page',
          notes: 'Remember to revisit this section.',
          page: 42,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.label).toBe('Important Page');
      expect(body.notes).toBe('Remember to revisit this section.');
      expect(body.page).toBe(42);
    });
  });

  describe('GET /api/library/:id/bookmarks', () => {
    it('returns bookmarks for a note', async () => {
      const bookmarks: Bookmark[] = [
        { id: 'bm-1', label: 'Chapter 1', page: 1, createdAt: '2024-01-01T00:00:00Z' },
        { id: 'bm-2', label: 'Chapter 5', page: 42, createdAt: '2024-01-02T00:00:00Z' },
      ];
      const testNote = createTestNote({ bookmarks });
      notes.set('test-note', testNote);

      const response = await app.inject({
        method: 'GET',
        url: '/api/library/test-note/bookmarks',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body).toHaveLength(2);
      expect(body[0].id).toBe('bm-1');
      expect(body[0].label).toBe('Chapter 1');
      expect(body[1].id).toBe('bm-2');
      expect(body[1].label).toBe('Chapter 5');
    });

    it('returns empty array for note with no bookmarks', async () => {
      const testNote = createTestNote({ bookmarks: [] });
      notes.set('test-note', testNote);

      const response = await app.inject({
        method: 'GET',
        url: '/api/library/test-note/bookmarks',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body).toEqual([]);
    });

    it('returns 404 for non-existent note', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/library/nonexistent/bookmarks',
      });

      expect(response.statusCode).toBe(404);
      const body = response.json();
      expect(body.error).toBe('Note not found');
    });

    it('returns bookmarks with notes and cfi fields', async () => {
      const bookmarks: Bookmark[] = [
        {
          id: 'bm-epub',
          label: 'EPUB Spot',
          cfi: 'epubcfi(/6/4!/4/2)',
          notes: 'Great passage',
          createdAt: '2024-01-05T00:00:00Z',
        },
      ];
      const testNote = createTestNote({ bookmarks, sourceType: 'epub' });
      notes.set('test-note', testNote);

      const response = await app.inject({
        method: 'GET',
        url: '/api/library/test-note/bookmarks',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body).toHaveLength(1);
      expect(body[0].cfi).toBe('epubcfi(/6/4!/4/2)');
      expect(body[0].notes).toBe('Great passage');
    });
  });

  describe('DELETE /api/library/:id/bookmarks/:bookmarkId', () => {
    it('deletes an existing bookmark', async () => {
      const existingBookmark: Bookmark = {
        id: 'bm-del123',
        label: 'Chapter 3',
        page: 30,
        createdAt: '2024-01-01T00:00:00Z',
      };
      const testNote = createTestNote({ bookmarks: [existingBookmark] });
      notes.set('test-note', testNote);

      mockReadFileSync.mockReturnValue(`---
title: Test
bookmarks:
  - "[[books/test.pdf#page=30|Chapter 3|2024-01-01T00:00:00Z]]"
---
Content`);

      const response = await app.inject({
        method: 'DELETE',
        url: '/api/library/test-note/bookmarks/bm-del123',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
    });

    it('updates in-memory cache after deletion', async () => {
      const existingBookmark: Bookmark = {
        id: 'bm-del123',
        label: 'Chapter 3',
        page: 30,
        createdAt: '2024-01-01T00:00:00Z',
      };
      const testNote = createTestNote({ bookmarks: [existingBookmark] });
      notes.set('test-note', testNote);

      mockReadFileSync.mockReturnValue(`---
title: Test
bookmarks:
  - "[[books/test.pdf#page=30|Chapter 3|2024-01-01T00:00:00Z]]"
---
Content`);

      await app.inject({
        method: 'DELETE',
        url: '/api/library/test-note/bookmarks/bm-del123',
      });

      expect(mockScanner.updateNote).toHaveBeenCalledWith(
        'test-note',
        expect.objectContaining({
          bookmarks: expect.any(Array),
        }),
      );
    });

    it('returns 404 for non-existent note', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: '/api/library/nonexistent/bookmarks/bm-123',
      });

      expect(response.statusCode).toBe(404);
      const body = response.json();
      expect(body.error).toBe('Note not found');
    });

    it('returns 404 for non-existent bookmark', async () => {
      const testNote = createTestNote({ bookmarks: [] });
      notes.set('test-note', testNote);

      const response = await app.inject({
        method: 'DELETE',
        url: '/api/library/test-note/bookmarks/nonexistent',
      });

      expect(response.statusCode).toBe(404);
      const body = response.json();
      expect(body.error).toBe('Bookmark not found');
    });

    it('returns 500 when bookmarks array is missing from frontmatter', async () => {
      const existingBookmark: Bookmark = {
        id: 'bm-del123',
        label: 'Chapter 3',
        page: 30,
        createdAt: '2024-01-01T00:00:00Z',
      };
      const testNote = createTestNote({ bookmarks: [existingBookmark] });
      notes.set('test-note', testNote);

      // Frontmatter without bookmarks key
      mockReadFileSync.mockReturnValue('---\ntitle: Test\n---\nContent');

      const response = await app.inject({
        method: 'DELETE',
        url: '/api/library/test-note/bookmarks/bm-del123',
      });

      expect(response.statusCode).toBe(500);
      const body = response.json();
      expect(body.error).toContain('Bookmarks not found');
    });

    it('returns 500 when file read fails', async () => {
      const existingBookmark: Bookmark = {
        id: 'bm-del123',
        label: 'Chapter 3',
        page: 30,
        createdAt: '2024-01-01T00:00:00Z',
      };
      const testNote = createTestNote({ bookmarks: [existingBookmark] });
      notes.set('test-note', testNote);

      mockReadFileSync.mockImplementation(() => {
        throw new Error('EACCES: permission denied');
      });

      const response = await app.inject({
        method: 'DELETE',
        url: '/api/library/test-note/bookmarks/bm-del123',
      });

      expect(response.statusCode).toBe(500);
      const body = response.json();
      expect(body.error).toBe('Failed to delete bookmark');
    });

    it('deletes bookmark with notes (object format)', async () => {
      const existingBookmark: Bookmark = {
        id: 'bm-withnotes',
        label: 'Important Section',
        notes: 'Key insight here',
        page: 15,
        createdAt: '2024-01-01T00:00:00Z',
      };
      const testNote = createTestNote({ bookmarks: [existingBookmark] });
      notes.set('test-note', testNote);

      mockReadFileSync.mockReturnValue(`---
title: Test
bookmarks:
  - link: "[[books/test.pdf#page=15|Important Section|2024-01-01T00:00:00Z]]"
    notes: Key insight here
---
Content`);

      const response = await app.inject({
        method: 'DELETE',
        url: '/api/library/test-note/bookmarks/bm-withnotes',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
    });
  });

  describe('PATCH /api/library/:id/bookmarks/:bookmarkId - additional cases', () => {
    it('returns 404 for non-existent note', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: '/api/library/nonexistent/bookmarks/bm-123',
        payload: {
          label: 'Updated',
        },
      });

      expect(response.statusCode).toBe(404);
      const body = response.json();
      expect(body.error).toBe('Note not found');
    });

    it('returns 404 for non-existent bookmark', async () => {
      const testNote = createTestNote({ bookmarks: [] });
      notes.set('test-note', testNote);

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/library/test-note/bookmarks/nonexistent',
        payload: {
          label: 'Updated',
        },
      });

      expect(response.statusCode).toBe(404);
      const body = response.json();
      expect(body.error).toBe('Bookmark not found');
    });

    it('returns 500 when bookmarks array is missing from frontmatter', async () => {
      const existingBookmark: Bookmark = {
        id: 'bm-test123',
        label: 'Original',
        page: 5,
        createdAt: '2024-01-01T00:00:00Z',
      };
      const testNote = createTestNote({ bookmarks: [existingBookmark] });
      notes.set('test-note', testNote);

      // Frontmatter without bookmarks key
      mockReadFileSync.mockReturnValue(`---
title: Test
---
Content`);

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/library/test-note/bookmarks/bm-test123',
        payload: {
          label: 'Updated',
        },
      });

      expect(response.statusCode).toBe(500);
      const body = response.json();
      expect(body.error).toContain('Bookmarks not found');
    });

    it('returns 500 when file read fails', async () => {
      const existingBookmark: Bookmark = {
        id: 'bm-test123',
        label: 'Original',
        page: 5,
        createdAt: '2024-01-01T00:00:00Z',
      };
      const testNote = createTestNote({ bookmarks: [existingBookmark] });
      notes.set('test-note', testNote);

      mockReadFileSync.mockImplementation(() => {
        throw new Error('EACCES: permission denied');
      });

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/library/test-note/bookmarks/bm-test123',
        payload: {
          label: 'Updated',
        },
      });

      expect(response.statusCode).toBe(500);
      const body = response.json();
      expect(body.error).toBe('Failed to update bookmark');
    });

    it('preserves existing notes when only label is updated', async () => {
      const existingBookmark: Bookmark = {
        id: 'bm-test123',
        label: 'Original',
        notes: 'Preserve me',
        page: 5,
        createdAt: '2024-01-01T00:00:00Z',
      };
      const testNote = createTestNote({ bookmarks: [existingBookmark] });
      notes.set('test-note', testNote);

      mockReadFileSync.mockReturnValue(`---
title: Test
bookmarks:
  - link: "[[books/test.pdf#page=5|Original|2024-01-01T00:00:00Z]]"
    notes: Preserve me
---
Content`);

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/library/test-note/bookmarks/bm-test123',
        payload: {
          label: 'New Label',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.label).toBe('New Label');
      expect(body.notes).toBe('Preserve me');
    });

    it('updates in-memory cache after successful update', async () => {
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

      await app.inject({
        method: 'PATCH',
        url: '/api/library/test-note/bookmarks/bm-test123',
        payload: {
          label: 'Updated',
        },
      });

      expect(mockScanner.updateNote).toHaveBeenCalledWith(
        'test-note',
        expect.objectContaining({
          bookmarks: expect.any(Array),
        }),
      );
    });

    it('trims whitespace from notes', async () => {
      const existingBookmark: Bookmark = {
        id: 'bm-test123',
        label: 'Chapter 3',
        page: 5,
        createdAt: '2024-01-01T00:00:00Z',
      };
      const testNote = createTestNote({ bookmarks: [existingBookmark] });
      notes.set('test-note', testNote);

      mockReadFileSync.mockReturnValue(`---
title: Test
bookmarks:
  - "[[books/test.pdf#page=5|Chapter 3|2024-01-01T00:00:00Z]]"
---
Content`);

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/library/test-note/bookmarks/bm-test123',
        payload: {
          notes: '   Some note with spaces   ',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.notes).toBe('Some note with spaces');
    });
  });

  describe('POST /api/library/:id/bookmarks - additional cases', () => {
    it('returns 404 for non-existent note', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/library/nonexistent/bookmarks',
        payload: {
          label: 'Test',
          page: 5,
        },
      });

      expect(response.statusCode).toBe(404);
      const body = response.json();
      expect(body.error).toBe('Note not found');
    });

    it('generates a deterministic bookmark ID from page location', async () => {
      const testNote = createTestNote();
      notes.set('test-note', testNote);

      mockReadFileSync.mockReturnValue('---\ntitle: Test\n---\nContent');

      const response = await app.inject({
        method: 'POST',
        url: '/api/library/test-note/bookmarks',
        payload: {
          label: 'Test Bookmark',
          page: 42,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();

      // ID should be based on "page-42" -> base64 prefix
      expect(body.id).toMatch(/^bm-/);
      expect(body.id.length).toBeGreaterThan(3);
    });

    it('generates a deterministic bookmark ID from cfi location', async () => {
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

      // ID should be based on "cfi-..." -> base64 prefix
      expect(body.id).toMatch(/^bm-/);
    });

    it('trims whitespace from notes on creation', async () => {
      const testNote = createTestNote();
      notes.set('test-note', testNote);

      mockReadFileSync.mockReturnValue('---\ntitle: Test\n---\nContent');

      const response = await app.inject({
        method: 'POST',
        url: '/api/library/test-note/bookmarks',
        payload: {
          label: 'Test',
          page: 5,
          notes: '  trimmed notes  ',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.notes).toBe('trimmed notes');
    });

    it('sets notes to undefined when only whitespace', async () => {
      const testNote = createTestNote();
      notes.set('test-note', testNote);

      mockReadFileSync.mockReturnValue('---\ntitle: Test\n---\nContent');

      const response = await app.inject({
        method: 'POST',
        url: '/api/library/test-note/bookmarks',
        payload: {
          label: 'Test',
          page: 5,
          notes: '   ',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.notes).toBeUndefined();
    });

    it('returns 500 when file read fails', async () => {
      const testNote = createTestNote();
      notes.set('test-note', testNote);

      mockReadFileSync.mockImplementation(() => {
        throw new Error('EACCES: permission denied');
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/library/test-note/bookmarks',
        payload: {
          label: 'Test',
          page: 5,
        },
      });

      expect(response.statusCode).toBe(500);
      const body = response.json();
      expect(body.error).toBe('Failed to add bookmark');
    });

    it('appends to existing bookmarks', async () => {
      const testNote = createTestNote();
      notes.set('test-note', testNote);

      mockReadFileSync.mockReturnValue(`---
title: Test
bookmarks:
  - "[[books/test.pdf#page=1|First Bookmark]]"
---
Content`);

      const response = await app.inject({
        method: 'POST',
        url: '/api/library/test-note/bookmarks',
        payload: {
          label: 'Second Bookmark',
          page: 20,
        },
      });

      expect(response.statusCode).toBe(200);

      // Verify the file was written with both bookmarks
      expect(mockWriteFileSync).toHaveBeenCalled();
      const writtenContent = mockWriteFileSync.mock.calls[0][1] as string;
      expect(writtenContent).toContain('bookmarks');
    });

    it('updates in-memory cache after creation', async () => {
      const testNote = createTestNote();
      notes.set('test-note', testNote);

      mockReadFileSync.mockReturnValue('---\ntitle: Test\n---\nContent');

      await app.inject({
        method: 'POST',
        url: '/api/library/test-note/bookmarks',
        payload: {
          label: 'New Bookmark',
          page: 10,
        },
      });

      expect(mockScanner.updateNote).toHaveBeenCalledWith(
        'test-note',
        expect.objectContaining({
          bookmarks: expect.any(Array),
        }),
      );
    });

    it('includes createdAt timestamp in response', async () => {
      const testNote = createTestNote();
      notes.set('test-note', testNote);

      mockReadFileSync.mockReturnValue('---\ntitle: Test\n---\nContent');

      const beforeTime = new Date().toISOString();

      const response = await app.inject({
        method: 'POST',
        url: '/api/library/test-note/bookmarks',
        payload: {
          label: 'Timestamped',
          page: 5,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.createdAt).toBeDefined();
      // createdAt should be a valid ISO timestamp
      expect(new Date(body.createdAt).toISOString()).toBe(body.createdAt);
      // Should be close to now
      expect(new Date(body.createdAt).getTime()).toBeGreaterThanOrEqual(new Date(beforeTime).getTime());
    });
  });

  // ===========================================================================
  // Deeper edge case & branch coverage
  // ===========================================================================

  describe('POST /api/library/:id/bookmarks - edge cases', () => {
    it('rejects non-integer page value', async () => {
      const testNote = createTestNote();
      notes.set('test-note', testNote);

      const response = await app.inject({
        method: 'POST',
        url: '/api/library/test-note/bookmarks',
        payload: {
          label: 'Fractional Page',
          page: 3.5,
        },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.error).toContain('integer');
    });

    it('accepts bookmark with both page and cfi provided', async () => {
      const testNote = createTestNote();
      notes.set('test-note', testNote);

      mockReadFileSync.mockReturnValue('---\ntitle: Test\n---\nContent');

      const response = await app.inject({
        method: 'POST',
        url: '/api/library/test-note/bookmarks',
        payload: {
          label: 'Dual Location',
          page: 10,
          cfi: 'epubcfi(/6/4!/4/2)',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.page).toBe(10);
      expect(body.cfi).toBe('epubcfi(/6/4!/4/2)');
    });

    it('generates deterministic IDs — same page produces same ID', async () => {
      const testNote = createTestNote();
      notes.set('test-note', testNote);

      mockReadFileSync.mockReturnValue('---\ntitle: Test\n---\nContent');

      const response1 = await app.inject({
        method: 'POST',
        url: '/api/library/test-note/bookmarks',
        payload: { label: 'First', page: 42 },
      });

      mockReadFileSync.mockReturnValue('---\ntitle: Test\n---\nContent');

      const response2 = await app.inject({
        method: 'POST',
        url: '/api/library/test-note/bookmarks',
        payload: { label: 'Second', page: 42 },
      });

      const body1 = response1.json();
      const body2 = response2.json();
      // Same page → same location key → same ID
      expect(body1.id).toBe(body2.id);
    });

    it('generates different IDs for different pages', async () => {
      const testNote = createTestNote();
      notes.set('test-note', testNote);

      mockReadFileSync.mockReturnValue('---\ntitle: Test\n---\nContent');

      const response1 = await app.inject({
        method: 'POST',
        url: '/api/library/test-note/bookmarks',
        payload: { label: 'Page 1', page: 1 },
      });

      mockReadFileSync.mockReturnValue('---\ntitle: Test\n---\nContent');

      const response2 = await app.inject({
        method: 'POST',
        url: '/api/library/test-note/bookmarks',
        payload: { label: 'Page 2', page: 2 },
      });

      expect(response1.json().id).not.toBe(response2.json().id);
    });

    it('handles creating bookmark when bookmarks key exists but is not an array', async () => {
      const testNote = createTestNote();
      notes.set('test-note', testNote);

      // bookmarks key exists but as a string, not an array
      mockReadFileSync.mockReturnValue('---\ntitle: Test\nbookmarks: "not-an-array"\n---\nContent');

      const response = await app.inject({
        method: 'POST',
        url: '/api/library/test-note/bookmarks',
        payload: { label: 'New BM', page: 5 },
      });

      // Should succeed — the code handles non-array by starting with empty array
      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.label).toBe('New BM');
    });

    it('returns 500 when writeFileSync fails', async () => {
      const testNote = createTestNote();
      notes.set('test-note', testNote);

      mockReadFileSync.mockReturnValue('---\ntitle: Test\n---\nContent');
      mockWriteFileSync.mockImplementation(() => {
        throw new Error('ENOSPC: no space left on device');
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/library/test-note/bookmarks',
        payload: { label: 'Disk Full', page: 5 },
      });

      expect(response.statusCode).toBe(500);
      expect(response.json().error).toBe('Failed to add bookmark');
    });

    it('handles label with special characters (unicode)', async () => {
      const testNote = createTestNote();
      notes.set('test-note', testNote);

      mockReadFileSync.mockReturnValue('---\ntitle: Test\n---\nContent');

      const response = await app.inject({
        method: 'POST',
        url: '/api/library/test-note/bookmarks',
        payload: {
          label: '第三章 — "Introduction" & Résumé',
          page: 3,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.label).toBe('第三章 — "Introduction" & Résumé');
    });

    it('handles label at exactly minimum length (1 char)', async () => {
      const testNote = createTestNote();
      notes.set('test-note', testNote);

      mockReadFileSync.mockReturnValue('---\ntitle: Test\n---\nContent');

      const response = await app.inject({
        method: 'POST',
        url: '/api/library/test-note/bookmarks',
        payload: { label: 'X', page: 1 },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().label).toBe('X');
    });

    it('handles page at boundary value of 1', async () => {
      const testNote = createTestNote({ totalPages: 100 });
      notes.set('test-note', testNote);

      mockReadFileSync.mockReturnValue('---\ntitle: Test\n---\nContent');

      const response = await app.inject({
        method: 'POST',
        url: '/api/library/test-note/bookmarks',
        payload: { label: 'First Page', page: 1 },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().page).toBe(1);
    });

    it('creates bookmark without notes field when notes not provided', async () => {
      const testNote = createTestNote();
      notes.set('test-note', testNote);

      mockReadFileSync.mockReturnValue('---\ntitle: Test\n---\nContent');

      const response = await app.inject({
        method: 'POST',
        url: '/api/library/test-note/bookmarks',
        payload: { label: 'No Notes', page: 5 },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.notes).toBeUndefined();
    });
  });

  describe('PATCH /api/library/:id/bookmarks/:bookmarkId - edge cases', () => {
    it('rejects whitespace-only label update', async () => {
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
        payload: { label: '   ' },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error).toContain('empty');
    });

    it('preserves page, cfi, and createdAt fields during update', async () => {
      const existingBookmark: Bookmark = {
        id: 'bm-test123',
        label: 'Original',
        notes: 'Original notes',
        page: 42,
        cfi: 'epubcfi(/6/4!/4/2)',
        createdAt: '2024-01-15T10:30:00Z',
      };
      const testNote = createTestNote({ bookmarks: [existingBookmark] });
      notes.set('test-note', testNote);

      mockReadFileSync.mockReturnValue(`---
title: Test
bookmarks:
  - link: "[[books/test.pdf#page=42|Original|2024-01-15T10:30:00Z]]"
    notes: Original notes
---
Content`);

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/library/test-note/bookmarks/bm-test123',
        payload: { label: 'Updated' },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.label).toBe('Updated');
      expect(body.page).toBe(42);
      expect(body.cfi).toBe('epubcfi(/6/4!/4/2)');
      expect(body.createdAt).toBe('2024-01-15T10:30:00Z');
      expect(body.id).toBe('bm-test123');
    });

    it('clears notes when whitespace-only notes are provided', async () => {
      const existingBookmark: Bookmark = {
        id: 'bm-test123',
        label: 'Chapter 3',
        notes: 'Some notes',
        page: 5,
        createdAt: '2024-01-01T00:00:00Z',
      };
      const testNote = createTestNote({ bookmarks: [existingBookmark] });
      notes.set('test-note', testNote);

      mockReadFileSync.mockReturnValue(`---
title: Test
bookmarks:
  - link: "[[books/test.pdf#page=5|Chapter 3|2024-01-01T00:00:00Z]]"
    notes: Some notes
---
Content`);

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/library/test-note/bookmarks/bm-test123',
        payload: { notes: '   ' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().notes).toBeUndefined();
    });

    it('keeps existing label when only notes is updated', async () => {
      const existingBookmark: Bookmark = {
        id: 'bm-test123',
        label: 'Keep This Label',
        page: 5,
        createdAt: '2024-01-01T00:00:00Z',
      };
      const testNote = createTestNote({ bookmarks: [existingBookmark] });
      notes.set('test-note', testNote);

      mockReadFileSync.mockReturnValue(`---
title: Test
bookmarks:
  - "[[books/test.pdf#page=5|Keep This Label|2024-01-01T00:00:00Z]]"
---
Content`);

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/library/test-note/bookmarks/bm-test123',
        payload: { notes: 'New notes only' },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.label).toBe('Keep This Label');
      expect(body.notes).toBe('New notes only');
    });

    it('trims whitespace from label on update', async () => {
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
        payload: { label: '  Trimmed Label  ' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().label).toBe('Trimmed Label');
    });

    it('handles label at maximum length on update', async () => {
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

      const maxLabel = 'b'.repeat(500);
      const response = await app.inject({
        method: 'PATCH',
        url: '/api/library/test-note/bookmarks/bm-test123',
        payload: { label: maxLabel },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().label).toBe(maxLabel);
    });

    it('returns 500 when writeFileSync fails during update', async () => {
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
      mockWriteFileSync.mockImplementation(() => {
        throw new Error('ENOSPC: no space left on device');
      });

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/library/test-note/bookmarks/bm-test123',
        payload: { label: 'Updated' },
      });

      expect(response.statusCode).toBe(500);
      expect(response.json().error).toBe('Failed to update bookmark');
    });

    it('handles update with empty body (no label or notes fields)', async () => {
      const existingBookmark: Bookmark = {
        id: 'bm-test123',
        label: 'Original',
        notes: 'Keep me',
        page: 5,
        createdAt: '2024-01-01T00:00:00Z',
      };
      const testNote = createTestNote({ bookmarks: [existingBookmark] });
      notes.set('test-note', testNote);

      mockReadFileSync.mockReturnValue(`---
title: Test
bookmarks:
  - link: "[[books/test.pdf#page=5|Original|2024-01-01T00:00:00Z]]"
    notes: Keep me
---
Content`);

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/library/test-note/bookmarks/bm-test123',
        payload: {},
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      // Both label and notes should be preserved
      expect(body.label).toBe('Original');
      expect(body.notes).toBe('Keep me');
    });
  });

  describe('DELETE /api/library/:id/bookmarks/:bookmarkId - edge cases', () => {
    it('removes bookmarks key from frontmatter when last bookmark is deleted', async () => {
      const existingBookmark: Bookmark = {
        id: 'bm-last',
        label: 'Last One',
        page: 10,
        createdAt: '2024-01-01T00:00:00Z',
      };
      const testNote = createTestNote({ bookmarks: [existingBookmark] });
      notes.set('test-note', testNote);

      mockReadFileSync.mockReturnValue(`---
title: Test
bookmarks:
  - "[[books/test.pdf#page=10|Last One|2024-01-01T00:00:00Z]]"
---
Content`);

      const response = await app.inject({
        method: 'DELETE',
        url: '/api/library/test-note/bookmarks/bm-last',
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().success).toBe(true);

      // Verify the written frontmatter does not contain the bookmarks key
      expect(mockWriteFileSync).toHaveBeenCalled();
      const writtenContent = mockWriteFileSync.mock.calls[0][1] as string;
      // Parse the written YAML to check that bookmarks key is removed
      const parsed = matter(writtenContent);
      expect(parsed.data.bookmarks).toBeUndefined();
    });

    it('preserves other bookmarks when one is deleted from multiple', async () => {
      const bookmark1: Bookmark = {
        id: 'bm-keep',
        label: 'Keep Me',
        page: 5,
        createdAt: '2024-01-01T00:00:00Z',
      };
      const bookmark2: Bookmark = {
        id: 'bm-delete',
        label: 'Delete Me',
        page: 20,
        createdAt: '2024-01-02T00:00:00Z',
      };
      const testNote = createTestNote({ bookmarks: [bookmark1, bookmark2] });
      notes.set('test-note', testNote);

      mockReadFileSync.mockReturnValue(`---
title: Test
bookmarks:
  - "[[books/test.pdf#page=5|Keep Me|2024-01-01T00:00:00Z]]"
  - "[[books/test.pdf#page=20|Delete Me|2024-01-02T00:00:00Z]]"
---
Content`);

      const response = await app.inject({
        method: 'DELETE',
        url: '/api/library/test-note/bookmarks/bm-delete',
      });

      expect(response.statusCode).toBe(200);

      // Verify the written frontmatter still contains the kept bookmark
      expect(mockWriteFileSync).toHaveBeenCalled();
      const writtenContent = mockWriteFileSync.mock.calls[0][1] as string;
      expect(writtenContent).toContain('Keep Me');
      expect(writtenContent).not.toContain('Delete Me');
    });

    it('returns 500 when writeFileSync fails during deletion', async () => {
      const existingBookmark: Bookmark = {
        id: 'bm-del123',
        label: 'To Delete',
        page: 30,
        createdAt: '2024-01-01T00:00:00Z',
      };
      const testNote = createTestNote({ bookmarks: [existingBookmark] });
      notes.set('test-note', testNote);

      mockReadFileSync.mockReturnValue(`---
title: Test
bookmarks:
  - "[[books/test.pdf#page=30|To Delete|2024-01-01T00:00:00Z]]"
---
Content`);
      mockWriteFileSync.mockImplementation(() => {
        throw new Error('EROFS: read-only file system');
      });

      const response = await app.inject({
        method: 'DELETE',
        url: '/api/library/test-note/bookmarks/bm-del123',
      });

      expect(response.statusCode).toBe(500);
      expect(response.json().error).toBe('Failed to delete bookmark');
    });

    it('deletes bookmark with cfi (epub) correctly', async () => {
      const existingBookmark: Bookmark = {
        id: 'bm-epub',
        label: 'EPUB Spot',
        cfi: 'epubcfi(/6/4!/4/2)',
        createdAt: '2024-01-01T00:00:00Z',
      };
      const testNote = createTestNote({
        bookmarks: [existingBookmark],
        sourceType: 'epub',
        sourceRelative: 'books/test.epub',
      });
      notes.set('test-note', testNote);

      mockReadFileSync.mockReturnValue(`---
title: Test
bookmarks:
  - "[[books/test.epub#cfi=epubcfi(/6/4!/4/2)|EPUB Spot|2024-01-01T00:00:00Z]]"
---
Content`);

      const response = await app.inject({
        method: 'DELETE',
        url: '/api/library/test-note/bookmarks/bm-epub',
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().success).toBe(true);
    });

    it('updates in-memory cache with empty bookmarks after deleting last bookmark', async () => {
      const existingBookmark: Bookmark = {
        id: 'bm-last',
        label: 'Last One',
        page: 10,
        createdAt: '2024-01-01T00:00:00Z',
      };
      const testNote = createTestNote({ bookmarks: [existingBookmark] });
      notes.set('test-note', testNote);

      mockReadFileSync.mockReturnValue(`---
title: Test
bookmarks:
  - "[[books/test.pdf#page=10|Last One|2024-01-01T00:00:00Z]]"
---
Content`);

      await app.inject({
        method: 'DELETE',
        url: '/api/library/test-note/bookmarks/bm-last',
      });

      expect(mockScanner.updateNote).toHaveBeenCalledWith(
        'test-note',
        expect.objectContaining({
          bookmarks: [],
        }),
      );
    });

    it('handles deletion of bookmark in object format with notes', async () => {
      const existingBookmark: Bookmark = {
        id: 'bm-withnotes',
        label: 'Annotated',
        notes: 'My annotation',
        page: 15,
        createdAt: '2024-01-01T00:00:00Z',
      };
      const testNote = createTestNote({ bookmarks: [existingBookmark] });
      notes.set('test-note', testNote);

      mockReadFileSync.mockReturnValue(`---
title: Test
bookmarks:
  - link: "[[books/test.pdf#page=15|Annotated|2024-01-01T00:00:00Z]]"
    notes: My annotation
---
Content`);

      const response = await app.inject({
        method: 'DELETE',
        url: '/api/library/test-note/bookmarks/bm-withnotes',
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().success).toBe(true);

      // Verify bookmarks key is removed since it was the only bookmark
      expect(mockWriteFileSync).toHaveBeenCalled();
      const writtenContent = mockWriteFileSync.mock.calls[0][1] as string;
      const parsed = matter(writtenContent);
      expect(parsed.data.bookmarks).toBeUndefined();
    });

    it('preserves non-matching entries with unknown formats in the bookmarks array', async () => {
      const existingBookmark: Bookmark = {
        id: 'bm-del',
        label: 'Delete Me',
        page: 20,
        createdAt: '2024-01-01T00:00:00Z',
      };
      const testNote = createTestNote({ bookmarks: [existingBookmark] });
      notes.set('test-note', testNote);

      // Bookmarks array contains a numeric entry (unusual format) alongside the real bookmark
      mockReadFileSync.mockReturnValue(`---
title: Test
bookmarks:
  - 42
  - "[[books/test.pdf#page=20|Delete Me|2024-01-01T00:00:00Z]]"
---
Content`);

      const response = await app.inject({
        method: 'DELETE',
        url: '/api/library/test-note/bookmarks/bm-del',
      });

      expect(response.statusCode).toBe(200);

      // The non-matching numeric entry should be preserved
      expect(mockWriteFileSync).toHaveBeenCalled();
      const writtenContent = mockWriteFileSync.mock.calls[0][1] as string;
      const parsed = matter(writtenContent);
      expect(parsed.data.bookmarks).toContain(42);
    });
  });

  describe('POST /api/library/:id/bookmarks - frontmatter persistence', () => {
    it('writes the bookmark entry to frontmatter file', async () => {
      const testNote = createTestNote();
      notes.set('test-note', testNote);

      mockReadFileSync.mockReturnValue('---\ntitle: Test\n---\nContent');

      await app.inject({
        method: 'POST',
        url: '/api/library/test-note/bookmarks',
        payload: { label: 'Chapter 5', page: 50 },
      });

      expect(mockWriteFileSync).toHaveBeenCalledTimes(1);
      const writtenContent = mockWriteFileSync.mock.calls[0][1] as string;
      // Should contain the bookmarks key with wikilink format
      expect(writtenContent).toContain('bookmarks');
      expect(writtenContent).toContain('books/test.pdf');
      expect(writtenContent).toContain('Chapter 5');
      // Markdown body should be preserved
      expect(writtenContent).toContain('Content');
    });

    it('writes bookmark with notes as object format in frontmatter', async () => {
      const testNote = createTestNote();
      notes.set('test-note', testNote);

      mockReadFileSync.mockReturnValue('---\ntitle: Test\n---\nContent');

      await app.inject({
        method: 'POST',
        url: '/api/library/test-note/bookmarks',
        payload: {
          label: 'Annotated Page',
          page: 25,
          notes: 'Important section about X',
        },
      });

      expect(mockWriteFileSync).toHaveBeenCalledTimes(1);
      const writtenContent = mockWriteFileSync.mock.calls[0][1] as string;
      // Object-format bookmarks include "notes:" and "link:" keys
      expect(writtenContent).toContain('notes:');
      expect(writtenContent).toContain('Important section about X');
    });
  });

  describe('PATCH /api/library/:id/bookmarks/:bookmarkId - frontmatter persistence', () => {
    it('writes updated bookmark to frontmatter correctly', async () => {
      const existingBookmark: Bookmark = {
        id: 'bm-test123',
        label: 'Old Label',
        page: 5,
        createdAt: '2024-01-01T00:00:00Z',
      };
      const testNote = createTestNote({ bookmarks: [existingBookmark] });
      notes.set('test-note', testNote);

      mockReadFileSync.mockReturnValue(`---
title: Test
bookmarks:
  - "[[books/test.pdf#page=5|Old Label|2024-01-01T00:00:00Z]]"
---
Content`);

      await app.inject({
        method: 'PATCH',
        url: '/api/library/test-note/bookmarks/bm-test123',
        payload: { label: 'New Label' },
      });

      expect(mockWriteFileSync).toHaveBeenCalledTimes(1);
      const writtenContent = mockWriteFileSync.mock.calls[0][1] as string;
      expect(writtenContent).toContain('New Label');
      expect(writtenContent).not.toContain('Old Label');
    });

    it('converts string format to object format when notes are added', async () => {
      const existingBookmark: Bookmark = {
        id: 'bm-test123',
        label: 'Chapter 3',
        page: 5,
        createdAt: '2024-01-01T00:00:00Z',
      };
      const testNote = createTestNote({ bookmarks: [existingBookmark] });
      notes.set('test-note', testNote);

      mockReadFileSync.mockReturnValue(`---
title: Test
bookmarks:
  - "[[books/test.pdf#page=5|Chapter 3|2024-01-01T00:00:00Z]]"
---
Content`);

      await app.inject({
        method: 'PATCH',
        url: '/api/library/test-note/bookmarks/bm-test123',
        payload: { notes: 'Added notes' },
      });

      expect(mockWriteFileSync).toHaveBeenCalledTimes(1);
      const writtenContent = mockWriteFileSync.mock.calls[0][1] as string;
      // Should now include notes field in the YAML
      expect(writtenContent).toContain('Added notes');
    });
  });

  describe('multiple bookmark operations (integration-style)', () => {
    it('can create, update, and delete bookmarks in sequence', async () => {
      const testNote = createTestNote();
      notes.set('test-note', testNote);

      // 1. Create a bookmark
      mockReadFileSync.mockReturnValue('---\ntitle: Test\n---\nContent');

      const createResponse = await app.inject({
        method: 'POST',
        url: '/api/library/test-note/bookmarks',
        payload: { label: 'Chapter 1', page: 10 },
      });

      expect(createResponse.statusCode).toBe(200);
      const created = createResponse.json();
      expect(created.label).toBe('Chapter 1');
      expect(created.id).toMatch(/^bm-/);

      // 2. Update the bookmark label
      // Set up the in-memory state for the PATCH
      const bookmark: Bookmark = {
        id: created.id,
        label: 'Chapter 1',
        page: 10,
        createdAt: created.createdAt,
      };
      notes.get('test-note')!.bookmarks = [bookmark];

      mockReadFileSync.mockReturnValue(`---
title: Test
bookmarks:
  - "[[books/test.pdf#page=10|Chapter 1|${created.createdAt}]]"
---
Content`);

      const updateResponse = await app.inject({
        method: 'PATCH',
        url: `/api/library/test-note/bookmarks/${created.id}`,
        payload: { label: 'Chapter 1 (Revised)' },
      });

      expect(updateResponse.statusCode).toBe(200);
      expect(updateResponse.json().label).toBe('Chapter 1 (Revised)');

      // 3. Delete the bookmark
      notes.get('test-note')!.bookmarks = [{
        ...bookmark,
        label: 'Chapter 1 (Revised)',
      }];

      mockReadFileSync.mockReturnValue(`---
title: Test
bookmarks:
  - "[[books/test.pdf#page=10|Chapter 1 (Revised)|${created.createdAt}]]"
---
Content`);

      const deleteResponse = await app.inject({
        method: 'DELETE',
        url: `/api/library/test-note/bookmarks/${created.id}`,
      });

      expect(deleteResponse.statusCode).toBe(200);
      expect(deleteResponse.json().success).toBe(true);
    });
  });
});
