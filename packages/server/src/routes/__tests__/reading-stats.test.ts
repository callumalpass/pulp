import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { readingStatsRoutes } from '../reading-stats.js';
import type { LibraryScanner } from '../../services/library-scanner.js';
import type { ReadingGoalsService } from '../../services/reading-goals.js';
import type { Config } from '../../config/schema.js';
import type { LiteratureNote, ReadingStats } from '@pulp/shared';

// Mock fs module
vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

import { readFileSync, writeFileSync } from 'node:fs';

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

// Create mock goals service
function createMockGoalsService(): ReadingGoalsService {
  return {
    updateStreak: vi.fn().mockReturnValue({
      currentStreak: 1,
      longestStreak: 5,
      lastReadDate: '2024-01-15',
      streakStartDate: '2024-01-15',
      graceDaysUsed: 0,
    }),
    getGoals: vi.fn(),
    getStreak: vi.fn(),
    getTodayProgress: vi.fn(),
    getWeekHistory: vi.fn(),
    recalculateStreak: vi.fn(),
    updateGoals: vi.fn(),
    reload: vi.fn(),
  } as unknown as ReadingGoalsService;
}

describe('reading-stats routes', () => {
  let fastify: FastifyInstance;
  let mockScanner: LibraryScanner;
  let mockGoalsService: ReadingGoalsService;
  let testNotes: Map<string, LiteratureNote>;

  beforeEach(async () => {
    vi.clearAllMocks();

    testNotes = new Map();
    const testNote = createTestNote();
    testNotes.set('test-note', testNote);

    mockScanner = createMockScanner(testNotes);
    mockGoalsService = createMockGoalsService();

    fastify = Fastify({ logger: false });
    await fastify.register(readingStatsRoutes, {
      scanner: mockScanner,
      config: testConfig,
      goalsService: mockGoalsService,
    });

    await fastify.ready();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fastify.close();
  });

  describe('GET /api/library/:id/reading-stats', () => {
    it('returns reading stats for a note', async () => {
      const stats: ReadingStats = {
        totalReadingTimeMs: 3600000,
        totalSessions: 5,
        averageSessionMs: 720000,
        firstReadDate: '2024-01-10T10:00:00Z',
        pagesPerHour: 30,
        totalPagesRead: 50,
        longestSessionMs: 1800000,
      };

      testNotes.get('test-note')!.readingStats = stats;

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library/test-note/reading-stats',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.readingStats).toEqual(stats);
    });

    it('returns null stats for note without reading stats', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library/test-note/reading-stats',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.readingStats).toBeNull();
    });

    it('returns 404 for non-existent note', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library/nonexistent/reading-stats',
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Note not found');
    });
  });

  describe('PATCH /api/library/:id/reading-stats', () => {
    beforeEach(() => {
      // Setup file mock with existing frontmatter
      mockReadFileSync.mockReturnValue(`---
title: Test Book
reading_progress: 50
---

# Notes
`);
    });

    it('updates reading stats with session data', async () => {
      const response = await fastify.inject({
        method: 'PATCH',
        url: '/api/library/test-note/reading-stats',
        payload: {
          sessionDurationMs: 1800000, // 30 minutes
          pagesRead: 10,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      expect(body.success).toBe(true);
      expect(body.readingStats).toBeDefined();
      expect(body.readingStats.totalReadingTimeMs).toBe(1800000);
      expect(body.readingStats.totalSessions).toBe(1);
      expect(body.readingStats.totalPagesRead).toBe(10);
      expect(body.lastRead).toBeDefined();

      // Should have written to file
      expect(mockWriteFileSync).toHaveBeenCalled();
    });

    it('accumulates stats on subsequent sessions', async () => {
      // First session
      mockReadFileSync.mockReturnValue(`---
title: Test Book
reading_stats:
  total_time_ms: 1800000
  total_sessions: 1
  first_read: "2024-01-10T10:00:00Z"
  pages_per_hour: 20
  total_pages: 10
  longest_session_ms: 1800000
---

# Notes
`);

      const response = await fastify.inject({
        method: 'PATCH',
        url: '/api/library/test-note/reading-stats',
        payload: {
          sessionDurationMs: 3600000, // 1 hour
          pagesRead: 20,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      expect(body.readingStats.totalReadingTimeMs).toBe(5400000); // 1.5 hours total
      expect(body.readingStats.totalSessions).toBe(2);
      expect(body.readingStats.totalPagesRead).toBe(30);
      expect(body.readingStats.longestSessionMs).toBe(3600000); // New longest
    });

    it('skips update when session duration is zero', async () => {
      const response = await fastify.inject({
        method: 'PATCH',
        url: '/api/library/test-note/reading-stats',
        payload: {
          sessionDurationMs: 0,
          pagesRead: 0,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      expect(body.success).toBe(true);
      expect(body.message).toContain('zero');
      expect(mockWriteFileSync).not.toHaveBeenCalled();
    });

    it('returns 404 for non-existent note', async () => {
      const response = await fastify.inject({
        method: 'PATCH',
        url: '/api/library/nonexistent/reading-stats',
        payload: {
          sessionDurationMs: 1800000,
          pagesRead: 10,
        },
      });

      expect(response.statusCode).toBe(404);
    });

    it('rejects negative session duration', async () => {
      const response = await fastify.inject({
        method: 'PATCH',
        url: '/api/library/test-note/reading-stats',
        payload: {
          sessionDurationMs: -1000,
          pagesRead: 10,
        },
      });

      // Schema validation rejects negative values with 400
      expect(response.statusCode).toBe(400);
    });

    it('calculates reading speed (pages per hour)', async () => {
      // Reset mock to get fresh frontmatter without accumulated stats
      mockReadFileSync.mockReturnValue(`---
title: Test Book
reading_progress: 0
---

# Notes
`);

      const response = await fastify.inject({
        method: 'PATCH',
        url: '/api/library/test-note/reading-stats',
        payload: {
          sessionDurationMs: 3600000, // 1 hour
          pagesRead: 30,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      // 30 pages in 1 hour = 30.0 pages per hour
      expect(body.readingStats.pagesPerHour).toBe(30);
    });

    it('updates streak via goals service', async () => {
      const response = await fastify.inject({
        method: 'PATCH',
        url: '/api/library/test-note/reading-stats',
        payload: {
          sessionDurationMs: 1800000,
          pagesRead: 10,
        },
      });

      expect(response.statusCode).toBe(200);
      expect(mockGoalsService.updateStreak).toHaveBeenCalled();

      const body = JSON.parse(response.body);
      expect(body.streak).toBeDefined();
    });

    it('requires sessionDurationMs in body', async () => {
      const response = await fastify.inject({
        method: 'PATCH',
        url: '/api/library/test-note/reading-stats',
        payload: {
          pagesRead: 10,
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('updates daily reading history', async () => {
      const response = await fastify.inject({
        method: 'PATCH',
        url: '/api/library/test-note/reading-stats',
        payload: {
          sessionDurationMs: 1800000,
          pagesRead: 10,
        },
      });

      expect(response.statusCode).toBe(200);

      // Check that file was written with reading history
      expect(mockWriteFileSync).toHaveBeenCalled();
      const writtenContent = mockWriteFileSync.mock.calls[0][1] as string;
      expect(writtenContent).toContain('reading_history');
    });

    it('sets first read date on first session', async () => {
      const response = await fastify.inject({
        method: 'PATCH',
        url: '/api/library/test-note/reading-stats',
        payload: {
          sessionDurationMs: 1800000,
          pagesRead: 10,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      expect(body.readingStats.firstReadDate).toBeDefined();
    });

    it('preserves first read date on subsequent sessions', async () => {
      const originalFirstRead = '2024-01-01T10:00:00Z';
      mockReadFileSync.mockReturnValue(`---
title: Test Book
reading_stats:
  total_time_ms: 1800000
  total_sessions: 1
  first_read: "${originalFirstRead}"
---

# Notes
`);

      const response = await fastify.inject({
        method: 'PATCH',
        url: '/api/library/test-note/reading-stats',
        payload: {
          sessionDurationMs: 1800000,
          pagesRead: 10,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      // First read date should be preserved
      expect(body.readingStats.firstReadDate).toContain('2024-01-01');
    });
  });
});
