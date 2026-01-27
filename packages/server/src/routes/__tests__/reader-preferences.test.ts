import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { readerPreferencesRoutes } from '../reader-preferences.js';
import type { LibraryScanner } from '../../services/library-scanner.js';
import type { Config } from '../../config/schema.js';
import type { LiteratureNote, ReaderPreferences } from '@pulp/shared';

// Mock file-lock module
vi.mock('../../services/file-lock.js', () => ({
  atomicFrontmatterUpdate: vi.fn(async (filePath: string, modifier: Function) => {
    const parsed = { frontmatter: {}, content: '' };
    return modifier(parsed);
  }),
}));

// Mock frontmatter-parser module
vi.mock('../../services/frontmatter-parser.js', () => ({
  createReaderPreferencesForFrontmatter: vi.fn((prefs: ReaderPreferences) => {
    const result: Record<string, unknown> = {};
    if (prefs.zoomLevel !== undefined) result.zoom_level = prefs.zoomLevel;
    if (prefs.zoomMode !== undefined) result.zoom_mode = prefs.zoomMode;
    if (prefs.theme !== undefined) result.theme = prefs.theme;
    if (prefs.fontSize !== undefined) result.font_size = prefs.fontSize;
    if (prefs.lineHeight !== undefined) result.line_height = prefs.lineHeight;
    return result;
  }),
}));

import { atomicFrontmatterUpdate } from '../../services/file-lock.js';
import { createReaderPreferencesForFrontmatter } from '../../services/frontmatter-parser.js';

const mockAtomicFrontmatterUpdate = vi.mocked(atomicFrontmatterUpdate);
const mockCreateReaderPreferencesForFrontmatter = vi.mocked(createReaderPreferencesForFrontmatter);

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

describe('Reader Preferences Routes', () => {
  let fastify: FastifyInstance;
  let mockScanner: LibraryScanner;
  let testNote: LiteratureNote;

  beforeEach(async () => {
    testNote = createTestNote();
    const notes = new Map([['test-note', testNote]]);
    mockScanner = createMockScanner(notes);

    fastify = Fastify();
    await fastify.register(readerPreferencesRoutes, { scanner: mockScanner, config: testConfig });

    mockAtomicFrontmatterUpdate.mockClear();
    mockCreateReaderPreferencesForFrontmatter.mockClear();
  });

  afterEach(async () => {
    await fastify.close();
  });

  describe('PATCH /api/library/:id/reader-preferences', () => {
    it('should update zoom level', async () => {
      const response = await fastify.inject({
        method: 'PATCH',
        url: '/api/library/test-note/reader-preferences',
        payload: { zoomLevel: 1.5 },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.readerPreferences.zoomLevel).toBe(1.5);
      expect(mockAtomicFrontmatterUpdate).toHaveBeenCalledWith(
        testNote.notePath,
        expect.any(Function)
      );
    });

    it('should update zoom mode', async () => {
      const response = await fastify.inject({
        method: 'PATCH',
        url: '/api/library/test-note/reader-preferences',
        payload: { zoomMode: 'fit-width' },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.readerPreferences.zoomMode).toBe('fit-width');
    });

    it('should update theme', async () => {
      const response = await fastify.inject({
        method: 'PATCH',
        url: '/api/library/test-note/reader-preferences',
        payload: { theme: 'dark' },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.readerPreferences.theme).toBe('dark');
    });

    it('should update font size', async () => {
      const response = await fastify.inject({
        method: 'PATCH',
        url: '/api/library/test-note/reader-preferences',
        payload: { fontSize: 16 },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.readerPreferences.fontSize).toBe(16);
    });

    it('should update line height', async () => {
      const response = await fastify.inject({
        method: 'PATCH',
        url: '/api/library/test-note/reader-preferences',
        payload: { lineHeight: 1.8 },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.readerPreferences.lineHeight).toBe(1.8);
    });

    it('should update multiple preferences at once', async () => {
      const response = await fastify.inject({
        method: 'PATCH',
        url: '/api/library/test-note/reader-preferences',
        payload: {
          zoomLevel: 2.0,
          theme: 'sepia',
          fontSize: 18,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.readerPreferences.zoomLevel).toBe(2.0);
      expect(body.readerPreferences.theme).toBe('sepia');
      expect(body.readerPreferences.fontSize).toBe(18);
    });

    it('should merge with existing preferences', async () => {
      testNote.readerPreferences = { zoomLevel: 1.0, theme: 'light' };

      const response = await fastify.inject({
        method: 'PATCH',
        url: '/api/library/test-note/reader-preferences',
        payload: { theme: 'dark' },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.readerPreferences.zoomLevel).toBe(1.0);
      expect(body.readerPreferences.theme).toBe('dark');
    });

    it('should return 404 for non-existent note', async () => {
      const response = await fastify.inject({
        method: 'PATCH',
        url: '/api/library/non-existent/reader-preferences',
        payload: { zoomLevel: 1.5 },
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Note not found');
    });

    it('should reject invalid zoom level (too low)', async () => {
      const response = await fastify.inject({
        method: 'PATCH',
        url: '/api/library/test-note/reader-preferences',
        payload: { zoomLevel: 0.1 },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should reject invalid zoom level (too high)', async () => {
      const response = await fastify.inject({
        method: 'PATCH',
        url: '/api/library/test-note/reader-preferences',
        payload: { zoomLevel: 10 },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should reject invalid zoom mode', async () => {
      const response = await fastify.inject({
        method: 'PATCH',
        url: '/api/library/test-note/reader-preferences',
        payload: { zoomMode: 'invalid-mode' },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should reject invalid theme', async () => {
      const response = await fastify.inject({
        method: 'PATCH',
        url: '/api/library/test-note/reader-preferences',
        payload: { theme: 'neon' },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should reject font size too small', async () => {
      const response = await fastify.inject({
        method: 'PATCH',
        url: '/api/library/test-note/reader-preferences',
        payload: { fontSize: 4 },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should reject font size too large', async () => {
      const response = await fastify.inject({
        method: 'PATCH',
        url: '/api/library/test-note/reader-preferences',
        payload: { fontSize: 100 },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should reject line height too small', async () => {
      const response = await fastify.inject({
        method: 'PATCH',
        url: '/api/library/test-note/reader-preferences',
        payload: { lineHeight: 0.5 },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should reject line height too large', async () => {
      const response = await fastify.inject({
        method: 'PATCH',
        url: '/api/library/test-note/reader-preferences',
        payload: { lineHeight: 5 },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should accept all valid themes', async () => {
      for (const theme of ['light', 'dark', 'sepia', 'eink']) {
        const response = await fastify.inject({
          method: 'PATCH',
          url: '/api/library/test-note/reader-preferences',
          payload: { theme },
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.readerPreferences.theme).toBe(theme);
      }
    });

    it('should accept all valid zoom modes', async () => {
      for (const zoomMode of ['fit-width', 'fit-page', 'custom']) {
        const response = await fastify.inject({
          method: 'PATCH',
          url: '/api/library/test-note/reader-preferences',
          payload: { zoomMode },
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.readerPreferences.zoomMode).toBe(zoomMode);
      }
    });

    it('should accept boundary zoom levels', async () => {
      // Minimum valid zoom
      let response = await fastify.inject({
        method: 'PATCH',
        url: '/api/library/test-note/reader-preferences',
        payload: { zoomLevel: 0.25 },
      });
      expect(response.statusCode).toBe(200);

      // Maximum valid zoom
      response = await fastify.inject({
        method: 'PATCH',
        url: '/api/library/test-note/reader-preferences',
        payload: { zoomLevel: 5 },
      });
      expect(response.statusCode).toBe(200);
    });

    it('should accept boundary font sizes', async () => {
      // Minimum valid font size
      let response = await fastify.inject({
        method: 'PATCH',
        url: '/api/library/test-note/reader-preferences',
        payload: { fontSize: 8 },
      });
      expect(response.statusCode).toBe(200);

      // Maximum valid font size
      response = await fastify.inject({
        method: 'PATCH',
        url: '/api/library/test-note/reader-preferences',
        payload: { fontSize: 48 },
      });
      expect(response.statusCode).toBe(200);
    });

    it('should accept boundary line heights', async () => {
      // Minimum valid line height
      let response = await fastify.inject({
        method: 'PATCH',
        url: '/api/library/test-note/reader-preferences',
        payload: { lineHeight: 1 },
      });
      expect(response.statusCode).toBe(200);

      // Maximum valid line height
      response = await fastify.inject({
        method: 'PATCH',
        url: '/api/library/test-note/reader-preferences',
        payload: { lineHeight: 3 },
      });
      expect(response.statusCode).toBe(200);
    });

    it('should update in-memory cache after success', async () => {
      await fastify.inject({
        method: 'PATCH',
        url: '/api/library/test-note/reader-preferences',
        payload: { zoomLevel: 1.5 },
      });

      expect(mockScanner.updateNote).toHaveBeenCalledWith(
        'test-note',
        expect.objectContaining({
          readerPreferences: expect.objectContaining({ zoomLevel: 1.5 }),
        })
      );
    });

    it('should handle atomic update errors gracefully', async () => {
      mockAtomicFrontmatterUpdate.mockRejectedValueOnce(new Error('Disk full'));

      const response = await fastify.inject({
        method: 'PATCH',
        url: '/api/library/test-note/reader-preferences',
        payload: { zoomLevel: 1.5 },
      });

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Failed to update reader preferences');
    });
  });

  describe('PATCH /api/library/:id/current-chapter', () => {
    it('should set current chapter', async () => {
      const response = await fastify.inject({
        method: 'PATCH',
        url: '/api/library/test-note/current-chapter',
        payload: { chapter: 'Chapter 5: The Journey' },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.currentChapter).toBe('Chapter 5: The Journey');
      expect(mockAtomicFrontmatterUpdate).toHaveBeenCalledWith(
        testNote.notePath,
        expect.any(Function)
      );
    });

    it('should clear current chapter with null', async () => {
      testNote.currentChapter = 'Chapter 1';

      const response = await fastify.inject({
        method: 'PATCH',
        url: '/api/library/test-note/current-chapter',
        payload: { chapter: null },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.currentChapter).toBe(null);
    });

    it('should return 404 for non-existent note', async () => {
      const response = await fastify.inject({
        method: 'PATCH',
        url: '/api/library/non-existent/current-chapter',
        payload: { chapter: 'Chapter 1' },
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Note not found');
    });

    it('should update in-memory cache after success', async () => {
      await fastify.inject({
        method: 'PATCH',
        url: '/api/library/test-note/current-chapter',
        payload: { chapter: 'Chapter 10' },
      });

      expect(mockScanner.updateNote).toHaveBeenCalledWith(
        'test-note',
        expect.objectContaining({ currentChapter: 'Chapter 10' })
      );
    });

    it('should handle atomic update errors gracefully', async () => {
      mockAtomicFrontmatterUpdate.mockRejectedValueOnce(new Error('Write failed'));

      const response = await fastify.inject({
        method: 'PATCH',
        url: '/api/library/test-note/current-chapter',
        payload: { chapter: 'Chapter 1' },
      });

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Failed to update current chapter');
    });

    it('should handle empty string as chapter name', async () => {
      const response = await fastify.inject({
        method: 'PATCH',
        url: '/api/library/test-note/current-chapter',
        payload: { chapter: '' },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.currentChapter).toBe('');
    });

    it('should handle long chapter names', async () => {
      const longChapter = 'A'.repeat(500);
      const response = await fastify.inject({
        method: 'PATCH',
        url: '/api/library/test-note/current-chapter',
        payload: { chapter: longChapter },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.currentChapter).toBe(longChapter);
    });

    it('should handle special characters in chapter names', async () => {
      const specialChapter = 'Chapter 1: "The Beginning" — An Introduction & Overview';
      const response = await fastify.inject({
        method: 'PATCH',
        url: '/api/library/test-note/current-chapter',
        payload: { chapter: specialChapter },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.currentChapter).toBe(specialChapter);
    });
  });
});
