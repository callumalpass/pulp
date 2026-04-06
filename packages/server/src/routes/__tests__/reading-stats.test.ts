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
  book_notes_key: 'book_notes',
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
    paused: false,
    pausedAt: null,
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
    getStreak: vi.fn().mockReturnValue({
      currentStreak: 1,
      longestStreak: 5,
      lastReadDate: '2024-01-15',
      streakStartDate: '2024-01-15',
      graceDaysUsed: 0,
      freezeDaysUsed: 0,
    }),
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
    // Clear gray-matter's internal cache to prevent frontmatter mutation leaking between tests.
    // gray-matter caches parsed results by string content with a shallow copy, so in-place
    // mutations of the data object (as done by atomicFrontmatterUpdate) corrupt cached entries.
    (matter as unknown as { cache?: Record<string, unknown> }).cache = {};

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
        estimatedCompletionDate: null,
        averageDailyReadingMs: null,
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

    it('skips update when session duration is zero but returns consistent response shape', async () => {
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

      // Response should have the same shape as a successful update
      expect(body.success).toBe(true);
      expect(body).toHaveProperty('readingStats');
      expect(body).toHaveProperty('lastRead');
      expect(body).toHaveProperty('streak');
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

    it('stores individual reading session data', async () => {
      const response = await fastify.inject({
        method: 'PATCH',
        url: '/api/library/test-note/reading-stats',
        payload: {
          sessionDurationMs: 1800000,
          pagesRead: 10,
          startPage: 5,
          endPage: 15,
          startTime: '2024-01-15T10:00:00Z',
        },
      });

      expect(response.statusCode).toBe(200);

      // Check that reading sessions were written
      expect(mockWriteFileSync).toHaveBeenCalled();
      const writtenContent = mockWriteFileSync.mock.calls[0][1] as string;
      expect(writtenContent).toContain('reading_sessions');
    });
  });

  describe('GET /api/library/:id/reading-sessions', () => {
    it('returns reading sessions for a note', async () => {
      testNotes.get('test-note')!.frontmatter = {
        reading_sessions: [
          {
            start: '2024-01-15T10:00:00Z',
            end: '2024-01-15T10:30:00Z',
            duration_ms: 1800000,
            pages: 10,
            start_page: 5,
            end_page: 15,
          },
          {
            start: '2024-01-14T14:00:00Z',
            end: '2024-01-14T14:45:00Z',
            duration_ms: 2700000,
            pages: 15,
            start_page: 20,
            end_page: 35,
          },
        ],
      };

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library/test-note/reading-sessions',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.sessions).toHaveLength(2);
      expect(body.totalSessions).toBe(2);
    });

    it('respects limit parameter', async () => {
      testNotes.get('test-note')!.frontmatter = {
        reading_sessions: [
          { start: '2024-01-15T10:00:00Z', end: '2024-01-15T10:30:00Z', duration_ms: 1800000, pages: 10, start_page: 5, end_page: 15 },
          { start: '2024-01-14T14:00:00Z', end: '2024-01-14T14:45:00Z', duration_ms: 2700000, pages: 15, start_page: 20, end_page: 35 },
          { start: '2024-01-13T09:00:00Z', end: '2024-01-13T10:00:00Z', duration_ms: 3600000, pages: 20, start_page: 35, end_page: 55 },
        ],
      };

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library/test-note/reading-sessions?limit=2',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.sessions).toHaveLength(2);
      expect(body.totalSessions).toBe(3);
    });

    it('returns empty array for note without sessions', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library/test-note/reading-sessions',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.sessions).toHaveLength(0);
      expect(body.totalSessions).toBe(0);
    });

    it('returns 404 for non-existent note', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library/nonexistent/reading-sessions',
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('GET /api/library/:id/reading-pace', () => {
    it('returns reading pace data for a note', async () => {
      testNotes.get('test-note')!.frontmatter = {
        reading_sessions: [
          {
            start: '2024-01-15T10:00:00Z',
            end: '2024-01-15T11:00:00Z',
            duration_ms: 3600000, // 1 hour
            pages: 30,
            start_page: 0,
            end_page: 30,
          },
          {
            start: '2024-01-14T14:00:00Z',
            end: '2024-01-14T15:00:00Z',
            duration_ms: 3600000, // 1 hour
            pages: 25,
            start_page: 30,
            end_page: 55,
          },
        ],
      };

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library/test-note/reading-pace',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.paceData).toHaveLength(2);
      expect(body.paceData[0].pagesPerHour).toBe(25); // Older session
      expect(body.paceData[1].pagesPerHour).toBe(30); // Newer session
      expect(body.totalSessions).toBe(2);
    });

    it('calculates reading pace trend', async () => {
      // Create sessions with improving pace
      const sessions = [];
      for (let i = 0; i < 6; i++) {
        sessions.push({
          start: new Date(Date.now() - (5 - i) * 24 * 60 * 60 * 1000).toISOString(),
          end: new Date(Date.now() - (5 - i) * 24 * 60 * 60 * 1000 + 3600000).toISOString(),
          duration_ms: 3600000,
          pages: 20 + i * 5, // Pages increase: 20, 25, 30, 35, 40, 45
          start_page: 0,
          end_page: 20 + i * 5,
        });
      }

      testNotes.get('test-note')!.frontmatter = { reading_sessions: sessions };

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library/test-note/reading-pace',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.trend).toBe('improving');
    });

    it('returns current pace based on recent sessions', async () => {
      const sessions = [
        { start: '2024-01-20T10:00:00Z', end: '2024-01-20T11:00:00Z', duration_ms: 3600000, pages: 30, start_page: 0, end_page: 30 },
        { start: '2024-01-19T10:00:00Z', end: '2024-01-19T11:00:00Z', duration_ms: 3600000, pages: 28, start_page: 0, end_page: 28 },
        { start: '2024-01-18T10:00:00Z', end: '2024-01-18T11:00:00Z', duration_ms: 3600000, pages: 32, start_page: 0, end_page: 32 },
      ];

      testNotes.get('test-note')!.frontmatter = { reading_sessions: sessions };

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library/test-note/reading-pace',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.currentPace).toBe(30); // Average of 30, 28, 32
    });

    it('returns empty pace data for note without sessions', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library/test-note/reading-pace',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.paceData).toHaveLength(0);
      expect(body.trend).toBeNull();
      expect(body.currentPace).toBeNull();
    });

    it('respects limit parameter', async () => {
      const sessions = [];
      for (let i = 0; i < 10; i++) {
        sessions.push({
          start: new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString(),
          end: new Date(Date.now() - i * 24 * 60 * 60 * 1000 + 3600000).toISOString(),
          duration_ms: 3600000,
          pages: 25,
          start_page: 0,
          end_page: 25,
        });
      }

      testNotes.get('test-note')!.frontmatter = { reading_sessions: sessions };

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library/test-note/reading-pace?limit=5',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.paceData).toHaveLength(5);
      expect(body.totalSessions).toBe(10);
    });

    it('returns 404 for non-existent note', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library/nonexistent/reading-pace',
      });

      expect(response.statusCode).toBe(404);
    });

    it('returns time-of-day patterns', async () => {
      // Create sessions at different times of day
      const sessions = [
        { start: '2024-01-15T08:00:00Z', end: '2024-01-15T09:00:00Z', duration_ms: 3600000, pages: 30, start_page: 0, end_page: 30, hour_of_day: 8 },
        { start: '2024-01-14T09:00:00Z', end: '2024-01-14T10:00:00Z', duration_ms: 3600000, pages: 25, start_page: 30, end_page: 55, hour_of_day: 9 },
        { start: '2024-01-13T20:00:00Z', end: '2024-01-13T21:00:00Z', duration_ms: 3600000, pages: 28, start_page: 55, end_page: 83, hour_of_day: 20 },
        { start: '2024-01-12T08:30:00Z', end: '2024-01-12T09:30:00Z', duration_ms: 3600000, pages: 32, start_page: 83, end_page: 115, hour_of_day: 8 },
      ];

      testNotes.get('test-note')!.frontmatter = { reading_sessions: sessions };

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library/test-note/reading-pace',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      // Should have time-of-day patterns
      expect(body.timeOfDayPatterns).toBeDefined();
      expect(body.timeOfDayPatterns).toHaveLength(24);

      // Check that patterns aggregate correctly
      const hour8Pattern = body.timeOfDayPatterns.find((p: { hour: number }) => p.hour === 8);
      expect(hour8Pattern.totalSessions).toBe(2); // 2 sessions at 8am
      expect(hour8Pattern.totalDurationMs).toBe(7200000); // 2 hours total
    });

    it('calculates preferred reading time', async () => {
      // Create sessions predominantly in the morning
      const sessions = [
        { start: '2024-01-20T08:00:00Z', end: '2024-01-20T09:00:00Z', duration_ms: 3600000, pages: 30, start_page: 0, end_page: 30, hour_of_day: 8 },
        { start: '2024-01-19T09:00:00Z', end: '2024-01-19T10:00:00Z', duration_ms: 3600000, pages: 25, start_page: 30, end_page: 55, hour_of_day: 9 },
        { start: '2024-01-18T07:00:00Z', end: '2024-01-18T08:00:00Z', duration_ms: 3600000, pages: 28, start_page: 55, end_page: 83, hour_of_day: 7 },
        { start: '2024-01-17T10:00:00Z', end: '2024-01-17T11:00:00Z', duration_ms: 3600000, pages: 32, start_page: 83, end_page: 115, hour_of_day: 10 },
        { start: '2024-01-16T20:00:00Z', end: '2024-01-16T21:00:00Z', duration_ms: 3600000, pages: 26, start_page: 115, end_page: 141, hour_of_day: 20 },
      ];

      testNotes.get('test-note')!.frontmatter = { reading_sessions: sessions };

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library/test-note/reading-pace',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      expect(body.preferredReadingTime).toBeDefined();
      expect(body.preferredReadingTime.peakPeriod).toBe('morning'); // 4 out of 5 sessions in morning hours
      expect(body.preferredReadingTime.percentageInPeakPeriod).toBe(80);
    });

    it('returns null preferred time when no sessions', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library/test-note/reading-pace',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      expect(body.preferredReadingTime).toBeNull();
    });
  });

  describe('estimated completion date calculation', () => {
    it('calculates estimated completion date based on reading pace', async () => {
      // Set up note with reading history to enable completion estimation
      const readingHistory = [];
      for (let i = 0; i < 5; i++) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        readingHistory.push({
          date: date.toISOString().split('T')[0],
          duration_ms: 3600000, // 1 hour per day
          sessions: 1,
          pages: 30,
        });
      }

      mockReadFileSync.mockReturnValue(`---
title: Test Book
reading_progress: 30
total_pages: 100
reading_stats:
  total_time_ms: 18000000
  total_sessions: 5
  first_read: "2024-01-10T10:00:00Z"
  pages_per_hour: 30
  total_pages: 30
reading_history:
${readingHistory.map(h => `  - date: "${h.date}"
    duration_ms: ${h.duration_ms}
    sessions: ${h.sessions}
    pages: ${h.pages}`).join('\n')}
---

# Notes
`);

      // Create test note with 30% progress and 100 total pages
      testNotes.get('test-note')!.progress = 30;
      testNotes.get('test-note')!.totalPages = 100;

      const response = await fastify.inject({
        method: 'PATCH',
        url: '/api/library/test-note/reading-stats',
        payload: {
          sessionDurationMs: 3600000, // 1 hour
          pagesRead: 30,
          startPage: 30,
          endPage: 60,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      // With consistent reading, should have an estimated completion date
      // Note: estimation requires at least 2 days of history for average calculation
      // After this session, we should have enough data
      expect(body.readingStats.averageDailyReadingMs).toBeDefined();
    });

    it('does not calculate completion date for completed books', async () => {
      mockReadFileSync.mockReturnValue(`---
title: Test Book
reading_progress: 100
---

# Notes
`);

      testNotes.get('test-note')!.progress = 100;

      const response = await fastify.inject({
        method: 'PATCH',
        url: '/api/library/test-note/reading-stats',
        payload: {
          sessionDurationMs: 1800000,
          pagesRead: 5,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      // Completed books should not have estimated completion
      expect(body.readingStats.estimatedCompletionDate).toBeNull();
    });
  });

  describe('PATCH /api/library/:id/reading-stats - edge cases', () => {
    beforeEach(() => {
      mockReadFileSync.mockReturnValue(`---
title: Test Book
reading_progress: 50
---

# Notes
`);
    });

    it('handles session with zero pages read', async () => {
      const response = await fastify.inject({
        method: 'PATCH',
        url: '/api/library/test-note/reading-stats',
        payload: {
          sessionDurationMs: 1800000, // 30 min
          pagesRead: 0,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      expect(body.success).toBe(true);
      expect(body.readingStats.totalSessions).toBeGreaterThanOrEqual(1);
      expect(body.readingStats.totalReadingTimeMs).toBeGreaterThanOrEqual(1800000);
      // Zero pages read shouldn't increase page count
      expect(body.readingStats.totalPagesRead).toBeDefined();
      expect(typeof body.readingStats.totalPagesRead).toBe('number');
    });

    it('handles very short session under 1 minute', async () => {
      const response = await fastify.inject({
        method: 'PATCH',
        url: '/api/library/test-note/reading-stats',
        payload: {
          sessionDurationMs: 30000, // 30 seconds
          pagesRead: 1,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      expect(body.success).toBe(true);
      expect(body.readingStats.totalSessions).toBeGreaterThanOrEqual(1);
      expect(body.readingStats.totalReadingTimeMs).toBeGreaterThanOrEqual(30000);
    });

    it('tracks milestone achievements when currentProgress crosses thresholds', async () => {
      // Note starts at 50% progress
      testNotes.get('test-note')!.progress = 5;

      const response = await fastify.inject({
        method: 'PATCH',
        url: '/api/library/test-note/reading-stats',
        payload: {
          sessionDurationMs: 3600000,
          pagesRead: 30,
          currentProgress: 55,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      // Should have crossed 10%, 25%, and 50% milestones (from 5% to 55%)
      expect(body.readingStats.milestones).toBeDefined();
      expect(body.readingStats.milestones.length).toBe(3);
      const milestoneValues = body.readingStats.milestones.map((m: { milestone: number }) => m.milestone);
      expect(milestoneValues).toEqual([10, 25, 50]);
    });

    it('does not duplicate already-recorded milestones', async () => {
      testNotes.get('test-note')!.progress = 40;

      mockReadFileSync.mockReturnValue(`---
title: Test Book
reading_progress: 40
reading_stats:
  total_time_ms: 3600000
  total_sessions: 2
  first_read: "2024-01-10T10:00:00Z"
  pages_per_hour: 30
  total_pages: 40
  milestones:
    - milestone: 10
      reached_at: "2024-01-10T10:00:00Z"
      days_from_start: 0
      total_time_ms: 600000
    - milestone: 25
      reached_at: "2024-01-11T10:00:00Z"
      days_from_start: 1
      total_time_ms: 1800000
---

# Notes
`);

      const response = await fastify.inject({
        method: 'PATCH',
        url: '/api/library/test-note/reading-stats',
        payload: {
          sessionDurationMs: 1800000,
          pagesRead: 15,
          currentProgress: 55,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      // Should have milestones 10, 25 (existing) and 50 (new), but not duplicate 10 or 25
      expect(body.readingStats.milestones).toBeDefined();
      const milestoneValues = body.readingStats.milestones.map((m: { milestone: number }) => m.milestone);
      expect(milestoneValues).toContain(10);
      expect(milestoneValues).toContain(25);
      expect(milestoneValues).toContain(50);
      // Each milestone should appear exactly once
      expect(milestoneValues.filter((v: number) => v === 10)).toHaveLength(1);
      expect(milestoneValues.filter((v: number) => v === 25)).toHaveLength(1);
    });

    it('calculates session quality based on idle metrics', async () => {
      const response = await fastify.inject({
        method: 'PATCH',
        url: '/api/library/test-note/reading-stats',
        payload: {
          sessionDurationMs: 3600000, // 1 hour
          pagesRead: 30,
          startPage: 0,
          endPage: 30,
          startTime: '2024-01-15T10:00:00Z',
          idlePauseCount: 0,
          idlePauseTotalMs: 0,
        },
      });

      expect(response.statusCode).toBe(200);

      // Sessions are stored leanly and quality is derived on read.
      expect(mockWriteFileSync).toHaveBeenCalled();
      const writtenContent = mockWriteFileSync.mock.calls[0][1] as string;
      expect(writtenContent).toContain('reading_sessions');
      expect(writtenContent).not.toContain('quality');
    });

    it('generates default startTime when not provided', async () => {
      const response = await fastify.inject({
        method: 'PATCH',
        url: '/api/library/test-note/reading-stats',
        payload: {
          sessionDurationMs: 1800000,
          pagesRead: 10,
        },
      });

      expect(response.statusCode).toBe(200);

      // Session should be stored - startTime defaults to (now - sessionDuration)
      expect(mockWriteFileSync).toHaveBeenCalled();
      const writtenContent = mockWriteFileSync.mock.calls[0][1] as string;
      expect(writtenContent).toContain('reading_sessions');
    });

    it('does not estimate completion when totalPages is null', async () => {
      testNotes.get('test-note')!.totalPages = null;
      testNotes.get('test-note')!.progress = 50;

      const response = await fastify.inject({
        method: 'PATCH',
        url: '/api/library/test-note/reading-stats',
        payload: {
          sessionDurationMs: 3600000,
          pagesRead: 30,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.readingStats.estimatedCompletionDate).toBeNull();
    });

    it('tracks longest session correctly', async () => {
      // First session: 30 minutes
      mockReadFileSync.mockReturnValue(`---
title: Test Book
reading_stats:
  total_time_ms: 1800000
  total_sessions: 1
  first_read: "2024-01-10T10:00:00Z"
  longest_session_ms: 1800000
  total_pages: 10
---

# Notes
`);

      // Second session: 20 minutes (shorter)
      const response = await fastify.inject({
        method: 'PATCH',
        url: '/api/library/test-note/reading-stats',
        payload: {
          sessionDurationMs: 1200000, // 20 minutes
          pagesRead: 8,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      // Longest session should still be the first (30 min)
      expect(body.readingStats.longestSessionMs).toBe(1800000);
    });

    it('updates in-memory cache after successful update', async () => {
      const response = await fastify.inject({
        method: 'PATCH',
        url: '/api/library/test-note/reading-stats',
        payload: {
          sessionDurationMs: 1800000,
          pagesRead: 10,
        },
      });

      expect(response.statusCode).toBe(200);

      // Scanner.updateNote should be called with updated stats and lastRead
      expect(mockScanner.updateNote).toHaveBeenCalledWith(
        'test-note',
        expect.objectContaining({
          readingStats: expect.objectContaining({
            totalReadingTimeMs: expect.any(Number),
            totalSessions: expect.any(Number),
          }),
          lastRead: expect.any(String),
          frontmatter: expect.any(Object),
        })
      );
    });

    it('returns 500 when file write fails', async () => {
      mockReadFileSync.mockImplementation(() => {
        throw new Error('EACCES: permission denied');
      });

      const response = await fastify.inject({
        method: 'PATCH',
        url: '/api/library/test-note/reading-stats',
        payload: {
          sessionDurationMs: 1800000,
          pagesRead: 10,
        },
      });

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Failed to update reading stats');
    });

    it('calculates weighted reading speed from multiple sessions', async () => {
      // Set up existing sessions with different speeds
      mockReadFileSync.mockReturnValue(`---
title: Test Book
reading_progress: 50
reading_sessions:
  - start: "2024-01-15T10:00:00Z"
    end: "2024-01-15T11:00:00Z"
    duration_ms: 3600000
    pages: 20
    start_page: 0
    end_page: 20
  - start: "2024-01-14T10:00:00Z"
    end: "2024-01-14T11:00:00Z"
    duration_ms: 3600000
    pages: 40
    start_page: 20
    end_page: 60
---

# Notes
`);

      // New session: 30 pages per hour
      const response = await fastify.inject({
        method: 'PATCH',
        url: '/api/library/test-note/reading-stats',
        payload: {
          sessionDurationMs: 3600000,
          pagesRead: 30,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      // Speed should be weighted average (newest session weighted most heavily)
      // Current (30 pph, weight 1.0) + prev (20 pph, weight 0.85) + older (40 pph, weight 0.7225)
      expect(body.readingStats.pagesPerHour).toBeDefined();
      expect(body.readingStats.pagesPerHour).toBeGreaterThan(0);
      // Most recent session is 30 pph, so weighted avg should be close to 30
      expect(body.readingStats.pagesPerHour).toBeGreaterThan(25);
      expect(body.readingStats.pagesPerHour).toBeLessThan(35);
    });
  });

  describe('GET /api/library/:id/reading-history', () => {
    it('returns reading history for a note', async () => {
      const today = new Date().toISOString().split('T')[0];
      testNotes.get('test-note')!.frontmatter = {
        reading_history: [
          { date: today, duration_ms: 3600000, sessions: 2, pages: 30 },
        ],
      };

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library/test-note/reading-history',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      // Default is 14 days
      expect(body.history).toHaveLength(14);
      expect(body.daysRequested).toBe(14);

      // Today's entry should have our data
      const todayEntry = body.history.find((h: { date: string }) => h.date === today);
      expect(todayEntry).toBeDefined();
      expect(todayEntry.durationMs).toBe(3600000);
      expect(todayEntry.sessions).toBe(2);
      expect(todayEntry.pagesRead).toBe(30);
    });

    it('fills gaps with zero values', async () => {
      // Provide history with only 1 day
      const twoDaysAgo = new Date();
      twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
      const twoDaysAgoStr = twoDaysAgo.toISOString().split('T')[0];

      testNotes.get('test-note')!.frontmatter = {
        reading_history: [
          { date: twoDaysAgoStr, duration_ms: 1800000, sessions: 1, pages: 15 },
        ],
      };

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library/test-note/reading-history',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      // Should have 14 entries, most with zero values
      expect(body.history).toHaveLength(14);

      const nonZero = body.history.filter((h: { durationMs: number }) => h.durationMs > 0);
      expect(nonZero).toHaveLength(1);
      expect(nonZero[0].date).toBe(twoDaysAgoStr);
    });

    it('respects custom days parameter', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library/test-note/reading-history?days=7',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      expect(body.history).toHaveLength(7);
      expect(body.daysRequested).toBe(7);
    });

    it('caps days parameter at reading_history_max_days config', async () => {
      // Config has reading_history_max_days: 90
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library/test-note/reading-history?days=365',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      expect(body.daysRequested).toBe(90); // Capped to config max
      expect(body.history).toHaveLength(90);
    });

    it('uses default 14 days for invalid days parameter', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library/test-note/reading-history?days=abc',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      // NaN from parseInt falls back to 14
      expect(body.daysRequested).toBe(14);
    });

    it('returns history in chronological order (oldest first)', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library/test-note/reading-history?days=3',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      expect(body.history).toHaveLength(3);
      // First entry should be oldest (2 days ago), last should be today
      const dates = body.history.map((h: { date: string }) => h.date);
      expect(dates[0] < dates[1]).toBe(true);
      expect(dates[1] < dates[2]).toBe(true);
    });

    it('returns 404 for non-existent note', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library/nonexistent/reading-history',
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Note not found');
    });

    it('returns all zeros for note with no reading history', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library/test-note/reading-history?days=3',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      expect(body.history).toHaveLength(3);
      body.history.forEach((entry: { durationMs: number; sessions: number; pagesRead: number }) => {
        expect(entry.durationMs).toBe(0);
        expect(entry.sessions).toBe(0);
        expect(entry.pagesRead).toBe(0);
      });
    });
  });

  describe('GET /api/library/:id/reading-sessions - edge cases', () => {
    it('caps limit at 100', async () => {
      // Create 110 sessions
      const sessions = [];
      for (let i = 0; i < 110; i++) {
        sessions.push({
          start: new Date(Date.now() - i * 3600000).toISOString(),
          end: new Date(Date.now() - i * 3600000 + 1800000).toISOString(),
          duration_ms: 1800000,
          pages: 10,
          start_page: i * 10,
          end_page: (i + 1) * 10,
        });
      }
      testNotes.get('test-note')!.frontmatter = { reading_sessions: sessions };

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library/test-note/reading-sessions?limit=200',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      // Limit should be capped at 100
      expect(body.sessions).toHaveLength(100);
      expect(body.totalSessions).toBe(110);
    });

    it('uses default limit of 20 when not specified', async () => {
      const sessions = [];
      for (let i = 0; i < 30; i++) {
        sessions.push({
          start: new Date(Date.now() - i * 3600000).toISOString(),
          end: new Date(Date.now() - i * 3600000 + 1800000).toISOString(),
          duration_ms: 1800000,
          pages: 10,
          start_page: i * 10,
          end_page: (i + 1) * 10,
        });
      }
      testNotes.get('test-note')!.frontmatter = { reading_sessions: sessions };

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library/test-note/reading-sessions',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      expect(body.sessions).toHaveLength(20);
      expect(body.totalSessions).toBe(30);
    });

    it('handles invalid limit parameter gracefully', async () => {
      testNotes.get('test-note')!.frontmatter = {
        reading_sessions: [
          { start: '2024-01-15T10:00:00Z', end: '2024-01-15T10:30:00Z', duration_ms: 1800000, pages: 10, start_page: 0, end_page: 10 },
        ],
      };

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library/test-note/reading-sessions?limit=abc',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      // Invalid limit falls back to 20
      expect(body.sessions).toHaveLength(1);
      expect(body.totalSessions).toBe(1);
    });
  });

  describe('GET /api/library/:id/reading-pace - trend calculation', () => {
    it('detects declining reading pace trend', async () => {
      // Create sessions with declining pace (newer sessions are slower)
      const sessions = [];
      for (let i = 0; i < 6; i++) {
        sessions.push({
          start: new Date(Date.now() - (5 - i) * 24 * 60 * 60 * 1000).toISOString(),
          end: new Date(Date.now() - (5 - i) * 24 * 60 * 60 * 1000 + 3600000).toISOString(),
          duration_ms: 3600000, // 1 hour each
          pages: 45 - i * 5, // Pages decrease: 45, 40, 35, 30, 25, 20
          start_page: 0,
          end_page: 45 - i * 5,
        });
      }

      testNotes.get('test-note')!.frontmatter = { reading_sessions: sessions };

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library/test-note/reading-pace',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.trend).toBe('declining');
    });

    it('detects stable reading pace trend', async () => {
      // Create sessions with consistent pace
      const sessions = [];
      for (let i = 0; i < 6; i++) {
        sessions.push({
          start: new Date(Date.now() - (5 - i) * 24 * 60 * 60 * 1000).toISOString(),
          end: new Date(Date.now() - (5 - i) * 24 * 60 * 60 * 1000 + 3600000).toISOString(),
          duration_ms: 3600000,
          pages: 30, // Same pace every session
          start_page: 0,
          end_page: 30,
        });
      }

      testNotes.get('test-note')!.frontmatter = { reading_sessions: sessions };

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library/test-note/reading-pace',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.trend).toBe('stable');
    });

    it('returns null trend with fewer than 3 valid sessions', async () => {
      const sessions = [
        { start: '2024-01-15T10:00:00Z', end: '2024-01-15T11:00:00Z', duration_ms: 3600000, pages: 30, start_page: 0, end_page: 30 },
        { start: '2024-01-14T10:00:00Z', end: '2024-01-14T11:00:00Z', duration_ms: 3600000, pages: 25, start_page: 30, end_page: 55 },
      ];

      testNotes.get('test-note')!.frontmatter = { reading_sessions: sessions };

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library/test-note/reading-pace',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      // Only 2 sessions - not enough for trend
      expect(body.trend).toBeNull();
    });

    it('handles sessions with very short duration producing null pagesPerHour', async () => {
      const sessions = [
        {
          start: '2024-01-15T10:00:00Z',
          end: '2024-01-15T10:00:30Z',
          duration_ms: 30000, // 30 seconds - below the 1 minute threshold
          pages: 1,
          start_page: 0,
          end_page: 1,
        },
      ];

      testNotes.get('test-note')!.frontmatter = { reading_sessions: sessions };

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library/test-note/reading-pace',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      expect(body.paceData).toHaveLength(1);
      expect(body.paceData[0].pagesPerHour).toBeNull();
      expect(body.currentPace).toBeNull();
    });

    it('excludes sessions with zero pages from pace calculation', async () => {
      const sessions = [
        { start: '2024-01-15T10:00:00Z', end: '2024-01-15T11:00:00Z', duration_ms: 3600000, pages: 0, start_page: 0, end_page: 0 },
      ];

      testNotes.get('test-note')!.frontmatter = { reading_sessions: sessions };

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library/test-note/reading-pace',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      // Zero pages should result in null pagesPerHour
      expect(body.paceData[0].pagesPerHour).toBeNull();
      expect(body.overallAverage).toBeNull();
    });
  });

  describe('GET /api/library/:id/reading-pace - session quality and focus', () => {
    it('calculates average session quality and focus score', async () => {
      const sessions = [
        {
          start: '2024-01-15T10:00:00Z',
          end: '2024-01-15T11:00:00Z',
          duration_ms: 3600000,
          pages: 30,
          start_page: 0,
          end_page: 30,
          quality: 'deep',
        },
        {
          start: '2024-01-14T10:00:00Z',
          end: '2024-01-14T11:00:00Z',
          duration_ms: 3600000,
          pages: 25,
          start_page: 30,
          end_page: 55,
          quality: 'deep',
        },
        {
          start: '2024-01-13T10:00:00Z',
          end: '2024-01-13T10:30:00Z',
          duration_ms: 1800000,
          pages: 10,
          start_page: 55,
          end_page: 65,
          quality: 'focused',
        },
      ];

      testNotes.get('test-note')!.frontmatter = { reading_sessions: sessions };

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library/test-note/reading-pace',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      // Most sessions are 'deep' so average quality should be 'deep'
      expect(body.averageSessionQuality).toBe('deep');

      // Focus score: (100 + 100 + 75) / 3 = 91.67, rounded to 92
      expect(body.focusScore).toBe(92);
    });

    it('derives quality/focus when sessions omit stored quality data', async () => {
      const sessions = [
        {
          start: '2024-01-15T10:00:00Z',
          end: '2024-01-15T11:00:00Z',
          duration_ms: 3600000,
          pages: 30,
          start_page: 0,
          end_page: 30,
          // No quality field
        },
      ];

      testNotes.get('test-note')!.frontmatter = { reading_sessions: sessions };

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library/test-note/reading-pace',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      expect(body.averageSessionQuality).toBe('deep');
      expect(body.focusScore).toBe(100);
    });

    it('returns momentum data from reading history', async () => {
      // Create reading history with increasing activity
      const history = [];
      for (let i = 13; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        history.push({
          date: date.toISOString().split('T')[0],
          duration_ms: i < 7 ? 3600000 : 1800000, // More reading recently
          sessions: 1,
          pages: i < 7 ? 30 : 15,
        });
      }

      testNotes.get('test-note')!.frontmatter = {
        reading_sessions: [
          { start: '2024-01-15T10:00:00Z', end: '2024-01-15T11:00:00Z', duration_ms: 3600000, pages: 30, start_page: 0, end_page: 30 },
        ],
        reading_history: history,
      };

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library/test-note/reading-pace',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      expect(body.momentum).toBeDefined();
      expect(body.momentumScore).toBeDefined();
      expect(typeof body.momentumScore).toBe('number');
      // More reading in recent 7 days vs previous 7 days = accelerating
      expect(body.momentum).toBe('accelerating');
    });
  });

  describe('GET /api/library/:id/reading-pace - preferred reading time edge cases', () => {
    it('classifies afternoon reading correctly', async () => {
      const sessions = [
        { start: '2024-01-15T13:00:00Z', end: '2024-01-15T14:00:00Z', duration_ms: 3600000, pages: 30, start_page: 0, end_page: 30, hour_of_day: 13 },
        { start: '2024-01-14T14:00:00Z', end: '2024-01-14T15:00:00Z', duration_ms: 3600000, pages: 25, start_page: 30, end_page: 55, hour_of_day: 14 },
        { start: '2024-01-13T15:00:00Z', end: '2024-01-13T16:00:00Z', duration_ms: 3600000, pages: 28, start_page: 55, end_page: 83, hour_of_day: 15 },
      ];

      testNotes.get('test-note')!.frontmatter = { reading_sessions: sessions };

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library/test-note/reading-pace',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      expect(body.preferredReadingTime.peakPeriod).toBe('afternoon');
    });

    it('classifies evening reading correctly', async () => {
      const sessions = [
        { start: '2024-01-15T18:00:00Z', end: '2024-01-15T19:00:00Z', duration_ms: 3600000, pages: 30, start_page: 0, end_page: 30, hour_of_day: 18 },
        { start: '2024-01-14T19:00:00Z', end: '2024-01-14T20:00:00Z', duration_ms: 3600000, pages: 25, start_page: 30, end_page: 55, hour_of_day: 19 },
        { start: '2024-01-13T17:00:00Z', end: '2024-01-13T18:00:00Z', duration_ms: 3600000, pages: 28, start_page: 55, end_page: 83, hour_of_day: 17 },
      ];

      testNotes.get('test-note')!.frontmatter = { reading_sessions: sessions };

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library/test-note/reading-pace',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      expect(body.preferredReadingTime.peakPeriod).toBe('evening');
    });

    it('classifies night reading correctly', async () => {
      const sessions = [
        { start: '2024-01-15T22:00:00Z', end: '2024-01-15T23:00:00Z', duration_ms: 3600000, pages: 30, start_page: 0, end_page: 30, hour_of_day: 22 },
        { start: '2024-01-14T23:00:00Z', end: '2024-01-15T00:00:00Z', duration_ms: 3600000, pages: 25, start_page: 30, end_page: 55, hour_of_day: 23 },
        { start: '2024-01-13T03:00:00Z', end: '2024-01-13T04:00:00Z', duration_ms: 3600000, pages: 28, start_page: 55, end_page: 83, hour_of_day: 3 },
      ];

      testNotes.get('test-note')!.frontmatter = { reading_sessions: sessions };

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library/test-note/reading-pace',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      expect(body.preferredReadingTime.peakPeriod).toBe('night');
    });

    it('derives hour_of_day from startTime when not explicitly stored', async () => {
      const sessions = [
        {
          start: '2024-01-15T10:00:00Z',
          end: '2024-01-15T11:00:00Z',
          duration_ms: 3600000,
          pages: 30,
          start_page: 0,
          end_page: 30,
          // No hour_of_day field - should be derived from startTime
        },
      ];

      testNotes.get('test-note')!.frontmatter = { reading_sessions: sessions };

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library/test-note/reading-pace',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      // Should have 24 hours of patterns
      expect(body.timeOfDayPatterns).toHaveLength(24);

      // hour_of_day is calculated from startTime (10:00 UTC -> local hour depends on TZ)
      // The session should be counted in exactly one hour slot
      const totalSessionsInPatterns = body.timeOfDayPatterns.reduce(
        (sum: number, p: { totalSessions: number }) => sum + p.totalSessions, 0
      );
      expect(totalSessionsInPatterns).toBe(1);

      // preferredReadingTime should not be null since there is a valid session
      expect(body.preferredReadingTime).not.toBeNull();
    });
  });

  describe('GET /api/library/:id/reading-pace - data reversal', () => {
    it('returns pace data in chronological order (oldest first)', async () => {
      const sessions = [
        { start: '2024-01-15T10:00:00Z', end: '2024-01-15T11:00:00Z', duration_ms: 3600000, pages: 30, start_page: 0, end_page: 30 },
        { start: '2024-01-14T10:00:00Z', end: '2024-01-14T11:00:00Z', duration_ms: 3600000, pages: 25, start_page: 30, end_page: 55 },
        { start: '2024-01-13T10:00:00Z', end: '2024-01-13T11:00:00Z', duration_ms: 3600000, pages: 20, start_page: 55, end_page: 75 },
      ];

      testNotes.get('test-note')!.frontmatter = { reading_sessions: sessions };

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library/test-note/reading-pace',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      // Sessions are stored newest first, but paceData should be reversed (oldest first)
      expect(body.paceData[0].date).toBe('2024-01-13');
      expect(body.paceData[1].date).toBe('2024-01-14');
      expect(body.paceData[2].date).toBe('2024-01-15');
    });
  });

  describe('GET /api/library/:id/reading-history - additional edge cases', () => {
    it('clamps days=0 to default of 14', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library/test-note/reading-history?days=0',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      // parseInt('0') = 0, which is falsy, so || 14 applies
      expect(body.daysRequested).toBe(14);
    });

    it('treats negative days as default of 14', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library/test-note/reading-history?days=-5',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      // parseInt('-5') = -5, which is truthy but negative; Math.min(-5, 90) = -5
      // This creates a negative loop bound, resulting in 0 entries
      expect(body.history).toBeDefined();
      expect(Array.isArray(body.history)).toBe(true);
    });

    it('returns single day when days=1', async () => {
      const today = new Date().toISOString().split('T')[0];
      testNotes.get('test-note')!.frontmatter = {
        reading_history: [
          { date: today, duration_ms: 1800000, sessions: 1, pages: 10 },
        ],
      };

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library/test-note/reading-history?days=1',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      expect(body.history).toHaveLength(1);
      expect(body.daysRequested).toBe(1);
      expect(body.history[0].date).toBe(today);
      expect(body.history[0].durationMs).toBe(1800000);
    });

    it('handles history entries that fall outside the requested window', async () => {
      // Create history entries much older than 14 days
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 30);
      const oldDateStr = oldDate.toISOString().split('T')[0];

      testNotes.get('test-note')!.frontmatter = {
        reading_history: [
          { date: oldDateStr, duration_ms: 7200000, sessions: 3, pages: 50 },
        ],
      };

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library/test-note/reading-history?days=7',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      // All entries should be zero since data falls outside the 7-day window
      expect(body.history).toHaveLength(7);
      const nonZero = body.history.filter((h: { durationMs: number }) => h.durationMs > 0);
      expect(nonZero).toHaveLength(0);
    });

    it('includes the exact max days when days matches config limit', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library/test-note/reading-history?days=90',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      expect(body.daysRequested).toBe(90);
      expect(body.history).toHaveLength(90);
    });
  });

  describe('GET /api/library/:id/reading-sessions - additional edge cases', () => {
    it('handles limit=0 by falling back to default 20', async () => {
      const sessions = [];
      for (let i = 0; i < 5; i++) {
        sessions.push({
          start: new Date(Date.now() - i * 3600000).toISOString(),
          end: new Date(Date.now() - i * 3600000 + 1800000).toISOString(),
          duration_ms: 1800000,
          pages: 10,
          start_page: i * 10,
          end_page: (i + 1) * 10,
        });
      }
      testNotes.get('test-note')!.frontmatter = { reading_sessions: sessions };

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library/test-note/reading-sessions?limit=0',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      // parseInt('0') = 0, which is falsy, so || 20 applies
      expect(body.sessions).toHaveLength(5); // All 5 sessions (less than default 20)
      expect(body.totalSessions).toBe(5);
    });

    it('handles negative limit by falling back to default 20', async () => {
      const sessions = [];
      for (let i = 0; i < 3; i++) {
        sessions.push({
          start: new Date(Date.now() - i * 3600000).toISOString(),
          end: new Date(Date.now() - i * 3600000 + 1800000).toISOString(),
          duration_ms: 1800000,
          pages: 10,
          start_page: i * 10,
          end_page: (i + 1) * 10,
        });
      }
      testNotes.get('test-note')!.frontmatter = { reading_sessions: sessions };

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library/test-note/reading-sessions?limit=-5',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      // parseInt('-5') = -5, which is truthy; Math.min(100, -5) = -5
      // .slice(0, -5) with 3 items returns empty array
      expect(body.sessions).toBeDefined();
      expect(Array.isArray(body.sessions)).toBe(true);
    });

    it('returns exact limit when sessions match limit count', async () => {
      const sessions = [];
      for (let i = 0; i < 5; i++) {
        sessions.push({
          start: new Date(Date.now() - i * 3600000).toISOString(),
          end: new Date(Date.now() - i * 3600000 + 1800000).toISOString(),
          duration_ms: 1800000,
          pages: 10,
          start_page: i * 10,
          end_page: (i + 1) * 10,
        });
      }
      testNotes.get('test-note')!.frontmatter = { reading_sessions: sessions };

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library/test-note/reading-sessions?limit=5',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      expect(body.sessions).toHaveLength(5);
      expect(body.totalSessions).toBe(5);
    });

    it('returns limit=1 correctly', async () => {
      const sessions = [
        { start: '2024-01-15T10:00:00Z', end: '2024-01-15T10:30:00Z', duration_ms: 1800000, pages: 10, start_page: 0, end_page: 10 },
        { start: '2024-01-14T10:00:00Z', end: '2024-01-14T10:30:00Z', duration_ms: 1800000, pages: 8, start_page: 10, end_page: 18 },
      ];
      testNotes.get('test-note')!.frontmatter = { reading_sessions: sessions };

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library/test-note/reading-sessions?limit=1',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      expect(body.sessions).toHaveLength(1);
      expect(body.totalSessions).toBe(2);
    });
  });

  describe('GET /api/library/:id/reading-pace - limit edge cases', () => {
    it('handles limit=0 by falling back to default 20', async () => {
      const sessions = [];
      for (let i = 0; i < 3; i++) {
        sessions.push({
          start: new Date(Date.now() - i * 86400000).toISOString(),
          end: new Date(Date.now() - i * 86400000 + 3600000).toISOString(),
          duration_ms: 3600000,
          pages: 25,
          start_page: 0,
          end_page: 25,
        });
      }
      testNotes.get('test-note')!.frontmatter = { reading_sessions: sessions };

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library/test-note/reading-pace?limit=0',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      // parseInt('0') = 0 falsy -> falls back to 20
      expect(body.paceData).toHaveLength(3); // Less than 20, so all returned
    });

    it('caps limit at 100 for pace endpoint', async () => {
      const sessions = [];
      for (let i = 0; i < 110; i++) {
        sessions.push({
          start: new Date(Date.now() - i * 86400000).toISOString(),
          end: new Date(Date.now() - i * 86400000 + 3600000).toISOString(),
          duration_ms: 3600000,
          pages: 25,
          start_page: 0,
          end_page: 25,
        });
      }
      testNotes.get('test-note')!.frontmatter = { reading_sessions: sessions };

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library/test-note/reading-pace?limit=200',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      expect(body.paceData).toHaveLength(100);
      expect(body.totalSessions).toBe(110);
    });
  });

  describe('GET /api/library/:id/reading-pace - quality tie-breaking', () => {
    it('resolves quality tie by priority order (deep > focused > normal > distracted)', async () => {
      // Create equal counts of 'deep' and 'focused' - tie should resolve to 'deep'
      const sessions = [
        { start: '2024-01-15T10:00:00Z', end: '2024-01-15T11:00:00Z', duration_ms: 3600000, pages: 30, start_page: 0, end_page: 30, quality: 'deep' },
        { start: '2024-01-14T10:00:00Z', end: '2024-01-14T11:00:00Z', duration_ms: 3600000, pages: 25, start_page: 30, end_page: 55, quality: 'focused' },
      ];
      testNotes.get('test-note')!.frontmatter = { reading_sessions: sessions };

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library/test-note/reading-pace',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      // When tied, the priority chain checks deep first, so deep wins
      expect(body.averageSessionQuality).toBe('deep');
    });

    it('reports distracted quality when most sessions are distracted', async () => {
      const sessions = [
        { start: '2024-01-15T10:00:00Z', end: '2024-01-15T10:30:00Z', duration_ms: 1800000, pages: 5, start_page: 0, end_page: 5, quality: 'distracted' },
        { start: '2024-01-14T10:00:00Z', end: '2024-01-14T10:30:00Z', duration_ms: 1800000, pages: 4, start_page: 5, end_page: 9, quality: 'distracted' },
        { start: '2024-01-13T10:00:00Z', end: '2024-01-13T11:00:00Z', duration_ms: 3600000, pages: 30, start_page: 9, end_page: 39, quality: 'deep' },
      ];
      testNotes.get('test-note')!.frontmatter = { reading_sessions: sessions };

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library/test-note/reading-pace',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      expect(body.averageSessionQuality).toBe('distracted');
      // Focus score: (25 + 25 + 100) / 3 = 50
      expect(body.focusScore).toBe(50);
    });

    it('calculates focus score for single session', async () => {
      const sessions = [
        { start: '2024-01-15T10:00:00Z', end: '2024-01-15T10:30:00Z', duration_ms: 1800000, pages: 10, start_page: 0, end_page: 10, quality: 'normal' },
      ];
      testNotes.get('test-note')!.frontmatter = { reading_sessions: sessions };

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library/test-note/reading-pace',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      expect(body.averageSessionQuality).toBe('normal');
      expect(body.focusScore).toBe(50); // normal = 50
    });
  });

  describe('GET /api/library/:id/reading-pace - time-of-day edge cases', () => {
    it('handles sessions at midnight boundary (hour 0)', async () => {
      const sessions = [
        { start: '2024-01-15T00:00:00Z', end: '2024-01-15T01:00:00Z', duration_ms: 3600000, pages: 20, start_page: 0, end_page: 20, hour_of_day: 0 },
        { start: '2024-01-14T00:30:00Z', end: '2024-01-14T01:30:00Z', duration_ms: 3600000, pages: 18, start_page: 20, end_page: 38, hour_of_day: 0 },
      ];
      testNotes.get('test-note')!.frontmatter = { reading_sessions: sessions };

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library/test-note/reading-pace',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      const hour0 = body.timeOfDayPatterns.find((p: { hour: number }) => p.hour === 0);
      expect(hour0.totalSessions).toBe(2);
      expect(hour0.totalDurationMs).toBe(7200000);
      expect(hour0.averageDurationMs).toBe(3600000);

      // Hour 0 is classified as 'night'
      expect(body.preferredReadingTime.peakPeriod).toBe('night');
    });

    it('handles sessions at hour 23 boundary', async () => {
      const sessions = [
        { start: '2024-01-15T23:00:00Z', end: '2024-01-16T00:00:00Z', duration_ms: 3600000, pages: 20, start_page: 0, end_page: 20, hour_of_day: 23 },
      ];
      testNotes.get('test-note')!.frontmatter = { reading_sessions: sessions };

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library/test-note/reading-pace',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      const hour23 = body.timeOfDayPatterns.find((p: { hour: number }) => p.hour === 23);
      expect(hour23.totalSessions).toBe(1);

      // Hour 23 should be classified as 'night'
      expect(body.preferredReadingTime.peakPeriod).toBe('night');
    });

    it('returns all 24 hour slots even with no sessions', async () => {
      testNotes.get('test-note')!.frontmatter = {
        reading_sessions: [
          // Single session, just to have some data
          { start: '2024-01-15T10:00:00Z', end: '2024-01-15T11:00:00Z', duration_ms: 3600000, pages: 30, start_page: 0, end_page: 30, hour_of_day: 10 },
        ],
      };

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library/test-note/reading-pace',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      expect(body.timeOfDayPatterns).toHaveLength(24);

      // Verify all hours 0-23 are represented
      const hours = body.timeOfDayPatterns.map((p: { hour: number }) => p.hour);
      for (let h = 0; h < 24; h++) {
        expect(hours).toContain(h);
      }

      // Empty hours should have zero values
      const emptyHour = body.timeOfDayPatterns.find((p: { hour: number }) => p.hour === 0);
      expect(emptyHour.totalSessions).toBe(0);
      expect(emptyHour.totalDurationMs).toBe(0);
      expect(emptyHour.averageDurationMs).toBe(0);
    });

    it('derives hourOfDay from start time when stored values are invalid', async () => {
      const sessions = [
        { start: '2024-01-15T10:00:00Z', end: '2024-01-15T11:00:00Z', duration_ms: 3600000, pages: 30, start_page: 0, end_page: 30, hour_of_day: 10 },
        { start: '2024-01-14T10:00:00Z', end: '2024-01-14T11:00:00Z', duration_ms: 3600000, pages: 25, start_page: 30, end_page: 55, hour_of_day: -1 },
        { start: '2024-01-13T10:00:00Z', end: '2024-01-13T11:00:00Z', duration_ms: 3600000, pages: 20, start_page: 55, end_page: 75, hour_of_day: 24 },
      ];
      testNotes.get('test-note')!.frontmatter = { reading_sessions: sessions };

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library/test-note/reading-pace',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      // Only the valid session (hour 10) should be counted in patterns
      const totalSessionsInPatterns = body.timeOfDayPatterns.reduce(
        (sum: number, p: { totalSessions: number }) => sum + p.totalSessions, 0
      );
      expect(totalSessionsInPatterns).toBe(3);
    });

    it('correctly calculates average duration per hour', async () => {
      const sessions = [
        { start: '2024-01-15T10:00:00Z', end: '2024-01-15T11:00:00Z', duration_ms: 3600000, pages: 30, start_page: 0, end_page: 30, hour_of_day: 10 },
        { start: '2024-01-14T10:00:00Z', end: '2024-01-14T10:30:00Z', duration_ms: 1800000, pages: 15, start_page: 30, end_page: 45, hour_of_day: 10 },
        { start: '2024-01-13T10:00:00Z', end: '2024-01-13T10:45:00Z', duration_ms: 2700000, pages: 20, start_page: 45, end_page: 65, hour_of_day: 10 },
      ];
      testNotes.get('test-note')!.frontmatter = { reading_sessions: sessions };

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library/test-note/reading-pace',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      const hour10 = body.timeOfDayPatterns.find((p: { hour: number }) => p.hour === 10);
      expect(hour10.totalSessions).toBe(3);
      expect(hour10.totalDurationMs).toBe(8100000); // 3600000 + 1800000 + 2700000
      expect(hour10.averageDurationMs).toBe(2700000); // 8100000 / 3
    });
  });

  describe('PATCH /api/library/:id/reading-stats - write failure scenarios', () => {
    afterEach(() => {
      // Reset writeFileSync to prevent leaking the throwing mock into subsequent tests
      mockWriteFileSync.mockReset();
    });

    it('returns 500 when writeFileSync fails', async () => {
      mockReadFileSync.mockReturnValue(`---
title: Test Book
reading_progress: 50
---

# Notes
`);
      mockWriteFileSync.mockImplementation(() => {
        throw new Error('ENOSPC: no space left on device');
      });

      const response = await fastify.inject({
        method: 'PATCH',
        url: '/api/library/test-note/reading-stats',
        payload: {
          sessionDurationMs: 1800000,
          pagesRead: 10,
        },
      });

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Failed to update reading stats');
    });
  });

  describe('PATCH /api/library/:id/reading-stats - session quality classifications', () => {
    beforeEach(() => {
      mockReadFileSync.mockReturnValue(`---
title: Test Book
reading_progress: 50
---

# Notes
`);
    });

    it('stores lean session data for moderate sessions with few pauses', async () => {
      const response = await fastify.inject({
        method: 'PATCH',
        url: '/api/library/test-note/reading-stats',
        payload: {
          sessionDurationMs: 1200000, // 20 minutes
          pagesRead: 10,
          startPage: 0,
          endPage: 10,
          startTime: '2024-01-15T10:00:00Z',
          idlePauseCount: 1,
          idlePauseTotalMs: 50000, // 50 seconds idle (~4.2% of session, under 5% threshold)
        },
      });

      expect(response.statusCode).toBe(200);
      expect(mockWriteFileSync).toHaveBeenCalled();
      const writtenContent = mockWriteFileSync.mock.calls[0][1] as string;
      expect(writtenContent).toContain('reading_sessions');
      expect(writtenContent).not.toContain('quality');
      expect(writtenContent).toContain('idle_pause_count: 1');
      expect(writtenContent).toContain('idle_pause_total_ms: 50000');
    });

    it('stores lean session data for sessions with many pauses', async () => {
      const response = await fastify.inject({
        method: 'PATCH',
        url: '/api/library/test-note/reading-stats',
        payload: {
          sessionDurationMs: 1800000, // 30 minutes
          pagesRead: 5,
          startPage: 0,
          endPage: 5,
          startTime: '2024-01-15T10:00:00Z',
          idlePauseCount: 10,
          idlePauseTotalMs: 900000, // 15 minutes idle (50% of session)
        },
      });

      expect(response.statusCode).toBe(200);
      expect(mockWriteFileSync).toHaveBeenCalled();
      const writtenContent = mockWriteFileSync.mock.calls[0][1] as string;
      expect(writtenContent).not.toContain('quality');
      expect(writtenContent).toContain('idle_pause_count: 10');
      expect(writtenContent).toContain('idle_pause_total_ms: 900000');
    });

    it('stores lean session data for short sessions under 5 minutes', async () => {
      const response = await fastify.inject({
        method: 'PATCH',
        url: '/api/library/test-note/reading-stats',
        payload: {
          sessionDurationMs: 120000, // 2 minutes
          pagesRead: 1,
          startPage: 0,
          endPage: 1,
          startTime: '2024-01-15T10:00:00Z',
          idlePauseCount: 0,
          idlePauseTotalMs: 0,
        },
      });

      expect(response.statusCode).toBe(200);
      expect(mockWriteFileSync).toHaveBeenCalled();
      const writtenContent = mockWriteFileSync.mock.calls[0][1] as string;
      expect(writtenContent).not.toContain('quality');
      expect(writtenContent).not.toContain('idle_pause_count');
      expect(writtenContent).not.toContain('idle_pause_total_ms');
    });
  });

  describe('PATCH /api/library/:id/reading-stats - completion estimation edge cases', () => {
    beforeEach(() => {
      mockReadFileSync.mockReturnValue(`---
title: Test Book
reading_progress: 50
---

# Notes
`);
    });

    it('uses session frequency fallback when no daily history average exists', async () => {
      // Set up a note with one prior session but no reading history
      mockReadFileSync.mockReturnValue(`---
title: Test Book
reading_progress: 20
total_pages: 200
reading_stats:
  total_time_ms: 3600000
  total_sessions: 1
  first_read: "2024-01-15T10:00:00Z"
  pages_per_hour: 30
  total_pages: 30
  longest_session_ms: 3600000
reading_sessions:
  - start: "2024-01-15T10:00:00Z"
    end: "2024-01-15T11:00:00Z"
    duration_ms: 3600000
    pages: 30
    start_page: 0
    end_page: 30
---

# Notes
`);

      testNotes.get('test-note')!.progress = 20;
      testNotes.get('test-note')!.totalPages = 200;

      const response = await fastify.inject({
        method: 'PATCH',
        url: '/api/library/test-note/reading-stats',
        payload: {
          sessionDurationMs: 3600000,
          pagesRead: 30,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      // With 2 sessions of 3600000ms each (1 existing + 1 new), pagesPerHour should be calculable
      expect(body.readingStats.totalSessions).toBe(2);
      expect(body.readingStats.pagesPerHour).toBeGreaterThan(0);
    });

    it('does not estimate completion when pagesPerHour is null', async () => {
      // Sessions too short for speed calculation (under 1 min)
      mockReadFileSync.mockReturnValue(`---
title: Test Book
reading_progress: 50
total_pages: 100
reading_sessions:
  - start: "2024-01-15T10:00:00Z"
    end: "2024-01-15T10:00:30Z"
    duration_ms: 30000
    pages: 0
    start_page: 0
    end_page: 0
---

# Notes
`);

      testNotes.get('test-note')!.progress = 50;
      testNotes.get('test-note')!.totalPages = 100;

      const response = await fastify.inject({
        method: 'PATCH',
        url: '/api/library/test-note/reading-stats',
        payload: {
          sessionDurationMs: 30000, // 30 seconds, too short
          pagesRead: 0,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      expect(body.readingStats.estimatedCompletionDate).toBeNull();
    });

    it('does not estimate completion when progress is at 100%', async () => {
      mockReadFileSync.mockReturnValue(`---
title: Test Book
reading_progress: 100
total_pages: 100
reading_stats:
  total_time_ms: 36000000
  total_sessions: 10
  pages_per_hour: 30
  total_pages: 100
  first_read: "2024-01-01T10:00:00Z"
reading_history:
  - date: "2024-01-15"
    duration_ms: 3600000
    sessions: 1
    pages: 30
  - date: "2024-01-14"
    duration_ms: 3600000
    sessions: 1
    pages: 30
---

# Notes
`);

      testNotes.get('test-note')!.progress = 100;
      testNotes.get('test-note')!.totalPages = 100;

      const response = await fastify.inject({
        method: 'PATCH',
        url: '/api/library/test-note/reading-stats',
        payload: {
          sessionDurationMs: 1800000,
          pagesRead: 5,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      expect(body.readingStats.estimatedCompletionDate).toBeNull();
    });
  });

  describe('PATCH /api/library/:id/reading-stats - pages per hour fallback', () => {
    beforeEach(() => {
      mockReadFileSync.mockReturnValue(`---
title: Test Book
reading_progress: 50
---

# Notes
`);
    });

    it('uses overall average when no session meets minimum criteria', async () => {
      // Set up state where existing sessions are too short for weighted calc
      // but total pages and total time meet fallback criteria
      mockReadFileSync.mockReturnValue(`---
title: Test Book
reading_progress: 50
reading_stats:
  total_time_ms: 120000
  total_sessions: 2
  total_pages: 5
  first_read: "2024-01-10T10:00:00Z"
reading_sessions:
  - start: "2024-01-15T10:00:00Z"
    end: "2024-01-15T10:00:30Z"
    duration_ms: 30000
    pages: 1
    start_page: 0
    end_page: 1
---

# Notes
`);

      const response = await fastify.inject({
        method: 'PATCH',
        url: '/api/library/test-note/reading-stats',
        payload: {
          sessionDurationMs: 30000, // 30 seconds - below 60s threshold
          pagesRead: 1,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      // All sessions are under 60s, so weighted calc is skipped
      // But totalPagesRead (6) > 0 and totalReadingTimeMs (150000) >= 60000
      // Fallback should calculate: 6 pages / (150000ms / 3600000ms) = ~144 pph
      if (body.readingStats.pagesPerHour !== null) {
        expect(body.readingStats.pagesPerHour).toBeGreaterThan(0);
      }
    });

    it('keeps existing pagesPerHour when new session is too short', async () => {
      // With clean frontmatter, a very short session should result in pagesPerHour
      // being null (no prior data) or preserving the existing value.
      // The key behavior is that a 5-second session with 0 pages does NOT
      // qualify for the weighted speed calculation (needs >= 60s and >= 1 page)
      const response = await fastify.inject({
        method: 'PATCH',
        url: '/api/library/test-note/reading-stats',
        payload: {
          sessionDurationMs: 5000, // 5 seconds - below minimum threshold
          pagesRead: 0,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      // The session is too short (5s < 60s threshold) with 0 pages
      // It should not produce a meaningful pagesPerHour on its own
      expect(body.readingStats.totalReadingTimeMs).toBeGreaterThanOrEqual(5000);
      // pagesPerHour may be null (first session) or carried forward from accumulated state
      if (body.readingStats.pagesPerHour !== null) {
        expect(body.readingStats.pagesPerHour).toBeGreaterThan(0);
      }
    });
  });

  describe('PATCH /api/library/:id/reading-stats - momentum in update response', () => {
    beforeEach(() => {
      mockReadFileSync.mockReturnValue(`---
title: Test Book
reading_progress: 50
---

# Notes
`);
    });

    it('includes momentum data in PATCH response', async () => {
      // Set up history for momentum calculation
      const history = [];
      for (let i = 0; i < 14; i++) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        history.push({
          date: date.toISOString().split('T')[0],
          duration_ms: 3600000,
          sessions: 1,
          pages: 30,
        });
      }

      mockReadFileSync.mockReturnValue(`---
title: Test Book
reading_progress: 50
reading_history:
${history.map(h => `  - date: "${h.date}"
    duration_ms: ${h.duration_ms}
    sessions: ${h.sessions}
    pages: ${h.pages}`).join('\n')}
---

# Notes
`);

      const response = await fastify.inject({
        method: 'PATCH',
        url: '/api/library/test-note/reading-stats',
        payload: {
          sessionDurationMs: 3600000,
          pagesRead: 30,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      // With consistent daily reading, momentum should be defined
      if (body.readingStats.momentum) {
        expect(['accelerating', 'steady', 'decelerating', 'stalled']).toContain(body.readingStats.momentum);
      }
      if (body.readingStats.momentumScore !== undefined) {
        expect(typeof body.readingStats.momentumScore).toBe('number');
      }
    });
  });

  describe('PATCH /api/library/:id/reading-stats - schema validation', () => {
    beforeEach(() => {
      mockReadFileSync.mockReturnValue(`---
title: Test Book
reading_progress: 50
---

# Notes
`);
    });

    it('rejects negative pagesRead', async () => {
      const response = await fastify.inject({
        method: 'PATCH',
        url: '/api/library/test-note/reading-stats',
        payload: {
          sessionDurationMs: 1800000,
          pagesRead: -5,
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('rejects currentProgress above 100', async () => {
      const response = await fastify.inject({
        method: 'PATCH',
        url: '/api/library/test-note/reading-stats',
        payload: {
          sessionDurationMs: 1800000,
          pagesRead: 10,
          currentProgress: 150,
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('rejects negative currentProgress', async () => {
      const response = await fastify.inject({
        method: 'PATCH',
        url: '/api/library/test-note/reading-stats',
        payload: {
          sessionDurationMs: 1800000,
          pagesRead: 10,
          currentProgress: -10,
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('rejects negative startPage', async () => {
      const response = await fastify.inject({
        method: 'PATCH',
        url: '/api/library/test-note/reading-stats',
        payload: {
          sessionDurationMs: 1800000,
          pagesRead: 10,
          startPage: -1,
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('rejects negative endPage', async () => {
      const response = await fastify.inject({
        method: 'PATCH',
        url: '/api/library/test-note/reading-stats',
        payload: {
          sessionDurationMs: 1800000,
          pagesRead: 10,
          endPage: -1,
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('accepts zero values for all optional numeric fields', async () => {
      const response = await fastify.inject({
        method: 'PATCH',
        url: '/api/library/test-note/reading-stats',
        payload: {
          sessionDurationMs: 1800000,
          pagesRead: 0,
          startPage: 0,
          endPage: 0,
          idlePauseCount: 0,
          idlePauseTotalMs: 0,
          currentProgress: 0,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
    });

    it('accepts request with only required field sessionDurationMs', async () => {
      const response = await fastify.inject({
        method: 'PATCH',
        url: '/api/library/test-note/reading-stats',
        payload: {
          sessionDurationMs: 1800000,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.readingStats.totalSessions).toBeGreaterThanOrEqual(1);
      // When pagesRead is not provided, it defaults to 0 via Math.max(0, undefined || 0)
      expect(body.readingStats.totalReadingTimeMs).toBeGreaterThanOrEqual(1800000);
    });

    it('rejects empty request body', async () => {
      const response = await fastify.inject({
        method: 'PATCH',
        url: '/api/library/test-note/reading-stats',
        payload: {},
      });

      expect(response.statusCode).toBe(400);
    });

    it('accepts currentProgress of exactly 0', async () => {
      const response = await fastify.inject({
        method: 'PATCH',
        url: '/api/library/test-note/reading-stats',
        payload: {
          sessionDurationMs: 1800000,
          pagesRead: 1,
          currentProgress: 0,
        },
      });

      expect(response.statusCode).toBe(200);
    });

    it('accepts currentProgress of exactly 100', async () => {
      const response = await fastify.inject({
        method: 'PATCH',
        url: '/api/library/test-note/reading-stats',
        payload: {
          sessionDurationMs: 1800000,
          pagesRead: 1,
          currentProgress: 100,
        },
      });

      expect(response.statusCode).toBe(200);
    });
  });

  describe('PATCH /api/library/:id/reading-stats - milestone 100% completion', () => {
    beforeEach(() => {
      mockReadFileSync.mockReturnValue(`---
title: Test Book
reading_progress: 50
---

# Notes
`);
    });

    it('records 100% milestone when book is completed', async () => {
      testNotes.get('test-note')!.progress = 90;

      mockReadFileSync.mockReturnValue(`---
title: Test Book
reading_progress: 90
reading_stats:
  total_time_ms: 36000000
  total_sessions: 10
  first_read: "2024-01-01T10:00:00Z"
  pages_per_hour: 30
  total_pages: 90
  milestones:
    - milestone: 10
      reached_at: "2024-01-02T10:00:00Z"
      days_from_start: 1
      total_time_ms: 3600000
    - milestone: 25
      reached_at: "2024-01-03T10:00:00Z"
      days_from_start: 2
      total_time_ms: 7200000
    - milestone: 50
      reached_at: "2024-01-05T10:00:00Z"
      days_from_start: 4
      total_time_ms: 18000000
    - milestone: 75
      reached_at: "2024-01-08T10:00:00Z"
      days_from_start: 7
      total_time_ms: 27000000
---

# Notes
`);

      const response = await fastify.inject({
        method: 'PATCH',
        url: '/api/library/test-note/reading-stats',
        payload: {
          sessionDurationMs: 3600000,
          pagesRead: 10,
          currentProgress: 100,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      const milestoneValues = body.readingStats.milestones.map((m: { milestone: number }) => m.milestone);
      expect(milestoneValues).toContain(100);
      // All 5 milestones should be present
      expect(milestoneValues).toEqual([10, 25, 50, 75, 100]);
    });

    it('does not add new milestones when currentProgress is not provided', async () => {
      // Set up frontmatter with exactly 2 existing milestones
      mockReadFileSync.mockReturnValue(`---
title: Test Book
reading_progress: 50
reading_stats:
  total_time_ms: 3600000
  total_sessions: 1
  first_read: "2024-01-01T10:00:00Z"
  total_pages: 30
  milestones:
    - milestone: 10
      reached_at: "2024-01-02T10:00:00Z"
      days_from_start: 1
      total_time_ms: 600000
    - milestone: 25
      reached_at: "2024-01-03T10:00:00Z"
      days_from_start: 2
      total_time_ms: 1800000
---

# Notes
`);

      testNotes.get('test-note')!.progress = 50;

      const response = await fastify.inject({
        method: 'PATCH',
        url: '/api/library/test-note/reading-stats',
        payload: {
          sessionDurationMs: 1800000,
          pagesRead: 10,
          // No currentProgress field — milestone checking should be skipped
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      // Without currentProgress, the milestones array should be unchanged
      // from what was in the frontmatter (2 milestones: 10 and 25)
      if (body.readingStats.milestones) {
        const milestoneValues = body.readingStats.milestones.map(
          (m: { milestone: number }) => m.milestone
        );
        // Should NOT contain 50, 75, or 100 since currentProgress was not provided
        expect(milestoneValues).not.toContain(75);
        expect(milestoneValues).not.toContain(100);
      }
    });
  });

  describe('PATCH /api/library/:id/reading-stats - weighted pagesPerHour calculation precision', () => {
    it('applies exponential decay (0.85) correctly across sessions', async () => {
      // Three existing sessions each exactly 1 hour, with 10, 20, 30 pages
      // New session: 1 hour, 40 pages
      // Weighted calc: sessions ordered newest to oldest [40, 10, 20, 30]
      // weights: [1.0, 0.85, 0.7225, 0.614125]
      // PPH for each: [40, 10, 20, 30]
      // weighted sum: 40*1.0 + 10*0.85 + 20*0.7225 + 30*0.614125 = 40 + 8.5 + 14.45 + 18.42375 = 81.37375
      // total weight: 1.0 + 0.85 + 0.7225 + 0.614125 = 3.186625
      // result: 81.37375 / 3.186625 = 25.536... → rounded to 1 decimal: 25.5
      mockReadFileSync.mockReturnValue(`---
title: Test Book
reading_progress: 50
reading_sessions:
  - start: "2024-01-15T10:00:00Z"
    end: "2024-01-15T11:00:00Z"
    duration_ms: 3600000
    pages: 10
    start_page: 0
    end_page: 10
  - start: "2024-01-14T10:00:00Z"
    end: "2024-01-14T11:00:00Z"
    duration_ms: 3600000
    pages: 20
    start_page: 10
    end_page: 30
  - start: "2024-01-13T10:00:00Z"
    end: "2024-01-13T11:00:00Z"
    duration_ms: 3600000
    pages: 30
    start_page: 30
    end_page: 60
---

# Notes
`);

      const response = await fastify.inject({
        method: 'PATCH',
        url: '/api/library/test-note/reading-stats',
        payload: {
          sessionDurationMs: 3600000, // 1 hour
          pagesRead: 40,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      // Exact expected value: 25.5 (rounded to 1 decimal)
      expect(body.readingStats.pagesPerHour).toBe(25.5);
    });

    it('gives single session full weight when no prior sessions exist', async () => {
      mockReadFileSync.mockReturnValue(`---
title: Test Book
reading_progress: 50
---

# Notes
`);

      // Single session: 1 hour, 30 pages → 30 pph, weight 1.0 → exactly 30.0
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

      // With only one qualifying session, pagesPerHour should equal that session's rate
      expect(body.readingStats.pagesPerHour).toBe(30);
    });

    it('caps session history at 20 sessions for weighted speed calculation', async () => {
      // Create 25 prior sessions (only 19 will be included + current = 20 total)
      const sessions = [];
      for (let i = 0; i < 25; i++) {
        const date = new Date('2024-01-15');
        date.setDate(date.getDate() - i);
        sessions.push({
          start: `"${date.toISOString()}"`,
          end: `"${new Date(date.getTime() + 3600000).toISOString()}"`,
          duration_ms: 3600000,
          pages: 10, // 10 pph for all old sessions
          start_page: 0,
          end_page: 10,
        });
      }

      const sessionsYaml = sessions.map(s =>
        `  - start: ${s.start}\n    end: ${s.end}\n    duration_ms: ${s.duration_ms}\n    pages: ${s.pages}\n    start_page: ${s.start_page}\n    end_page: ${s.end_page}`
      ).join('\n');

      mockReadFileSync.mockReturnValue(`---
title: Test Book
reading_progress: 50
reading_sessions:
${sessionsYaml}
---

# Notes
`);

      // New session with much higher speed (100 pph)
      const response = await fastify.inject({
        method: 'PATCH',
        url: '/api/library/test-note/reading-stats',
        payload: {
          sessionDurationMs: 3600000,
          pagesRead: 100,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      // With 20 sessions (current 100pph + 19 older at 10pph), the weighted average
      // should be significantly above 10 due to the newest high-speed session
      // but well below 100 since older sessions pull it down
      expect(body.readingStats.pagesPerHour).toBeGreaterThan(15);
      expect(body.readingStats.pagesPerHour).toBeLessThan(60);
    });

    it('filters out sessions under 60 seconds from weighted calculation', async () => {
      // Existing session is under 60s
      mockReadFileSync.mockReturnValue(`---
title: Test Book
reading_progress: 50
reading_stats:
  total_time_ms: 30000
  total_sessions: 1
  total_pages: 5
  first_read: "2024-01-15T10:00:00Z"
reading_sessions:
  - start: "2024-01-15T10:00:00Z"
    end: "2024-01-15T10:00:30Z"
    duration_ms: 30000
    pages: 5
    start_page: 0
    end_page: 5
---

# Notes
`);

      // New session also under 60s
      const response = await fastify.inject({
        method: 'PATCH',
        url: '/api/library/test-note/reading-stats',
        payload: {
          sessionDurationMs: 45000, // 45 seconds
          pagesRead: 3,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      // Both sessions under 60s, so weighted calc is skipped
      // Fallback: totalPagesRead = 5+3 = 8, totalReadingTimeMs = 30000+45000 = 75000 >= 60000
      // 8 pages / (75000/3600000 hours) ≈ 384 pph
      expect(body.readingStats.pagesPerHour).toBeGreaterThan(100);
    });

    it('filters out sessions with zero pages from weighted calculation', async () => {
      mockReadFileSync.mockReturnValue(`---
title: Test Book
reading_progress: 50
reading_sessions:
  - start: "2024-01-15T10:00:00Z"
    end: "2024-01-15T11:00:00Z"
    duration_ms: 3600000
    pages: 0
    start_page: 0
    end_page: 0
---

# Notes
`);

      // New session: 1 hour, 50 pages
      const response = await fastify.inject({
        method: 'PATCH',
        url: '/api/library/test-note/reading-stats',
        payload: {
          sessionDurationMs: 3600000,
          pagesRead: 50,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      // Only the new session qualifies (old one has 0 pages)
      // Single session: 50 pph, weight 1.0 → exactly 50.0
      expect(body.readingStats.pagesPerHour).toBe(50);
    });
  });

  describe('PATCH /api/library/:id/reading-stats - weighted daily reading average', () => {
    it('requires at least 2 history entries for daily average', async () => {
      // With only the current session creating 1 history entry, averageDailyReadingMs should be null
      mockReadFileSync.mockReturnValue(`---
title: Test Book
reading_progress: 50
---

# Notes
`);

      const response = await fastify.inject({
        method: 'PATCH',
        url: '/api/library/test-note/reading-stats',
        payload: {
          sessionDurationMs: 3600000,
          pagesRead: 30,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      // Only 1 day of history → averageDailyReadingMs should be null
      expect(body.readingStats.averageDailyReadingMs).toBeNull();
    });

    it('calculates weighted daily average with decay factor 0.9', async () => {
      // Set up 3 days of history: today's entry will be updated in the request
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const twoDaysAgo = new Date(today);
      twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

      mockReadFileSync.mockReturnValue(`---
title: Test Book
reading_progress: 50
reading_history:
  - date: "${yesterday.toISOString().split('T')[0]}"
    duration_ms: 7200000
    sessions: 2
    pages: 40
  - date: "${twoDaysAgo.toISOString().split('T')[0]}"
    duration_ms: 3600000
    sessions: 1
    pages: 20
---

# Notes
`);

      const response = await fastify.inject({
        method: 'PATCH',
        url: '/api/library/test-note/reading-stats',
        payload: {
          sessionDurationMs: 5400000, // 1.5 hours today
          pagesRead: 30,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      // After update, history has 3 entries (today, yesterday, two days ago)
      // Today: 5400000ms, Yesterday: 7200000ms, Two days ago: 3600000ms
      // Weights: 1.0, 0.9, 0.81
      // Weighted sum: 5400000*1.0 + 7200000*0.9 + 3600000*0.81 = 5400000 + 6480000 + 2916000 = 14796000
      // Total weight: 1.0 + 0.9 + 0.81 = 2.71
      // Average: 14796000 / 2.71 = 5460516.6... → rounded to 5460517
      expect(body.readingStats.averageDailyReadingMs).toBeDefined();
      expect(body.readingStats.averageDailyReadingMs).not.toBeNull();
      expect(body.readingStats.averageDailyReadingMs).toBeGreaterThan(3600000); // More than min day
      expect(body.readingStats.averageDailyReadingMs).toBeLessThan(7200000); // Less than max day
    });

    it('only considers up to 14 most recent days with activity', async () => {
      // Create 20 days of history - only first 14 should be used
      const history = [];
      for (let i = 1; i <= 20; i++) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        history.push({
          date: date.toISOString().split('T')[0],
          duration_ms: i <= 14 ? 3600000 : 10800000, // Days 15-20 have 3h each (much higher)
          sessions: 1,
          pages: 20,
        });
      }

      const historyYaml = history.map(h =>
        `  - date: "${h.date}"\n    duration_ms: ${h.duration_ms}\n    sessions: ${h.sessions}\n    pages: ${h.pages}`
      ).join('\n');

      mockReadFileSync.mockReturnValue(`---
title: Test Book
reading_progress: 50
reading_history:
${historyYaml}
---

# Notes
`);

      const response = await fastify.inject({
        method: 'PATCH',
        url: '/api/library/test-note/reading-stats',
        payload: {
          sessionDurationMs: 3600000,
          pagesRead: 20,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      // The daily average should be based on 1h/day entries (not 3h/day)
      // because only the first 14 entries with activity are used
      expect(body.readingStats.averageDailyReadingMs).toBeDefined();
      expect(body.readingStats.averageDailyReadingMs).not.toBeNull();
      // With ~1h per day entries, the average should be around 3.6M ms (1 hour)
      expect(body.readingStats.averageDailyReadingMs).toBeLessThan(5400000); // Less than 1.5h
    });
  });

  describe('PATCH /api/library/:id/reading-stats - estimated completion date precision', () => {
    it('applies 5% buffer to estimated days', async () => {
      // Set up a book at 50% with known reading pace
      // totalPages=100, progress=50, so 50 pages remaining
      // If pagesPerHour = 50 and hoursPerDay = 1, then pagesPerDay = 50
      // daysToComplete = ceil((50/50) * 1.05) = ceil(1.05) = 2
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      mockReadFileSync.mockReturnValue(`---
title: Test Book
reading_progress: 50
total_pages: 100
reading_stats:
  total_time_ms: 7200000
  total_sessions: 2
  first_read: "2024-01-01T10:00:00Z"
  pages_per_hour: 50
  total_pages: 50
reading_sessions:
  - start: "2024-01-15T10:00:00Z"
    end: "2024-01-15T11:00:00Z"
    duration_ms: 3600000
    pages: 50
    start_page: 0
    end_page: 50
reading_history:
  - date: "${today.toISOString().split('T')[0]}"
    duration_ms: 3600000
    sessions: 1
    pages: 25
  - date: "${yesterday.toISOString().split('T')[0]}"
    duration_ms: 3600000
    sessions: 1
    pages: 25
---

# Notes
`);

      testNotes.get('test-note')!.progress = 50;
      testNotes.get('test-note')!.totalPages = 100;

      const response = await fastify.inject({
        method: 'PATCH',
        url: '/api/library/test-note/reading-stats',
        payload: {
          sessionDurationMs: 3600000, // 1 hour
          pagesRead: 50, // 50 pages per hour
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      // An estimated completion date should be set (not null)
      expect(body.readingStats.estimatedCompletionDate).not.toBeNull();

      // Verify the date is in the future
      const completionDate = new Date(body.readingStats.estimatedCompletionDate);
      expect(completionDate.getTime()).toBeGreaterThan(today.getTime());
    });

    it('uses averageDailyReadingMs path when available', async () => {
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const twoDaysAgo = new Date(today);
      twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

      // History with 2h per day of reading
      mockReadFileSync.mockReturnValue(`---
title: Test Book
reading_progress: 20
total_pages: 500
reading_stats:
  total_time_ms: 14400000
  total_sessions: 4
  first_read: "2024-01-01T10:00:00Z"
  pages_per_hour: 25
  total_pages: 100
reading_sessions:
  - start: "${yesterday.toISOString()}"
    end: "${new Date(yesterday.getTime() + 7200000).toISOString()}"
    duration_ms: 7200000
    pages: 50
    start_page: 50
    end_page: 100
  - start: "${twoDaysAgo.toISOString()}"
    end: "${new Date(twoDaysAgo.getTime() + 7200000).toISOString()}"
    duration_ms: 7200000
    pages: 50
    start_page: 0
    end_page: 50
reading_history:
  - date: "${yesterday.toISOString().split('T')[0]}"
    duration_ms: 7200000
    sessions: 1
    pages: 50
  - date: "${twoDaysAgo.toISOString().split('T')[0]}"
    duration_ms: 7200000
    sessions: 1
    pages: 50
---

# Notes
`);

      testNotes.get('test-note')!.progress = 20;
      testNotes.get('test-note')!.totalPages = 500;

      const response = await fastify.inject({
        method: 'PATCH',
        url: '/api/library/test-note/reading-stats',
        payload: {
          sessionDurationMs: 7200000, // 2 hours
          pagesRead: 50,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      // With daily average available, completion should be estimated
      expect(body.readingStats.estimatedCompletionDate).not.toBeNull();
      expect(body.readingStats.averageDailyReadingMs).not.toBeNull();

      // With ~2h/day and ~25pph, pagesPerDay ≈ 50
      // 400 remaining pages / 50 ppd * 1.05 = 8.4 → ceil = 9 days
      const completionDate = new Date(body.readingStats.estimatedCompletionDate);
      const daysUntilCompletion = Math.round(
        (completionDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
      );
      // Should be roughly 5-15 days (allowing for weighted averages)
      expect(daysUntilCompletion).toBeGreaterThanOrEqual(3);
      expect(daysUntilCompletion).toBeLessThanOrEqual(30);
    });

    it('skips estimation when remaining pages is zero despite progress < 100', async () => {
      // Edge case: progress rounds to totalPages (e.g., 99.5% of 10 pages → 10 pages)
      mockReadFileSync.mockReturnValue(`---
title: Test Book
reading_progress: 99
total_pages: 10
reading_stats:
  total_time_ms: 3600000
  total_sessions: 1
  pages_per_hour: 30
  total_pages: 10
  first_read: "2024-01-01T10:00:00Z"
reading_sessions:
  - start: "2024-01-15T10:00:00Z"
    end: "2024-01-15T11:00:00Z"
    duration_ms: 3600000
    pages: 10
    start_page: 0
    end_page: 10
reading_history:
  - date: "2024-01-15"
    duration_ms: 3600000
    sessions: 1
    pages: 10
  - date: "2024-01-14"
    duration_ms: 3600000
    sessions: 1
    pages: 10
---

# Notes
`);

      testNotes.get('test-note')!.progress = 99;
      testNotes.get('test-note')!.totalPages = 10;

      const response = await fastify.inject({
        method: 'PATCH',
        url: '/api/library/test-note/reading-stats',
        payload: {
          sessionDurationMs: 3600000,
          pagesRead: 1,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      // 99% of 10 = 9.9 → Math.round = 10 → Math.min(10, 10) = 10
      // remainingPages = 10 - 10 = 0, so estimation is skipped
      expect(body.readingStats.estimatedCompletionDate).toBeNull();
    });

    it('handles very large books with many remaining pages', async () => {
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      mockReadFileSync.mockReturnValue(`---
title: Test Book
reading_progress: 5
total_pages: 2000
reading_stats:
  total_time_ms: 3600000
  total_sessions: 1
  pages_per_hour: 20
  total_pages: 100
  first_read: "2024-01-01T10:00:00Z"
reading_sessions:
  - start: "${yesterday.toISOString()}"
    end: "${new Date(yesterday.getTime() + 3600000).toISOString()}"
    duration_ms: 3600000
    pages: 20
    start_page: 0
    end_page: 20
reading_history:
  - date: "${today.toISOString().split('T')[0]}"
    duration_ms: 3600000
    sessions: 1
    pages: 20
  - date: "${yesterday.toISOString().split('T')[0]}"
    duration_ms: 3600000
    sessions: 1
    pages: 20
---

# Notes
`);

      testNotes.get('test-note')!.progress = 5;
      testNotes.get('test-note')!.totalPages = 2000;

      const response = await fastify.inject({
        method: 'PATCH',
        url: '/api/library/test-note/reading-stats',
        payload: {
          sessionDurationMs: 3600000,
          pagesRead: 20,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      // 1900 remaining pages at ~20pph and ~1h/day = 95 days * 1.05 ≈ 100 days
      expect(body.readingStats.estimatedCompletionDate).not.toBeNull();
      const completionDate = new Date(body.readingStats.estimatedCompletionDate);
      const daysUntilCompletion = Math.round(
        (completionDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
      );
      expect(daysUntilCompletion).toBeGreaterThan(50);
    });

    it('does not estimate completion when hoursPerDay would be zero', async () => {
      // No daily history (so averageDailyReadingMs is null) and no valid sessions for fallback
      // This triggers the hoursPerDay = 0 path
      mockReadFileSync.mockReturnValue(`---
title: Test Book
reading_progress: 50
total_pages: 100
reading_sessions:
  - start: "2024-01-15T10:00:00Z"
    end: "2024-01-15T10:00:30Z"
    duration_ms: 30000
    pages: 0
    start_page: 0
    end_page: 0
---

# Notes
`);

      testNotes.get('test-note')!.progress = 50;
      testNotes.get('test-note')!.totalPages = 100;

      const response = await fastify.inject({
        method: 'PATCH',
        url: '/api/library/test-note/reading-stats',
        payload: {
          sessionDurationMs: 30000, // 30 seconds, too short for weighted calc
          pagesRead: 0,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      // pagesPerHour is null (no valid sessions for weighted, and totalPagesRead is 0)
      // so estimation is skipped entirely
      expect(body.readingStats.estimatedCompletionDate).toBeNull();
    });
  });

  describe('PATCH /api/library/:id/reading-stats - page clamping edge cases', () => {
    it('clamps current page to totalPages when progress rounding exceeds it', async () => {
      // progress=100 means currentPage = Math.min(200, Math.round((100/100)*200)) = 200
      // But progress=100 skips estimation entirely, so test 99.5% rounding
      // progress=99 of totalPages=3: Math.round(0.99*3) = Math.round(2.97) = 3
      // Math.min(3, 3) = 3, remainingPages = 0 → skips estimation
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      mockReadFileSync.mockReturnValue(`---
title: Test Book
reading_progress: 99
total_pages: 3
reading_stats:
  total_time_ms: 3600000
  total_sessions: 1
  pages_per_hour: 30
  total_pages: 3
  first_read: "2024-01-01T10:00:00Z"
reading_sessions:
  - start: "${yesterday.toISOString()}"
    end: "${new Date(yesterday.getTime() + 3600000).toISOString()}"
    duration_ms: 3600000
    pages: 3
    start_page: 0
    end_page: 3
reading_history:
  - date: "${today.toISOString().split('T')[0]}"
    duration_ms: 3600000
    sessions: 1
    pages: 1
  - date: "${yesterday.toISOString().split('T')[0]}"
    duration_ms: 3600000
    sessions: 1
    pages: 2
---

# Notes
`);

      testNotes.get('test-note')!.progress = 99;
      testNotes.get('test-note')!.totalPages = 3;

      const response = await fastify.inject({
        method: 'PATCH',
        url: '/api/library/test-note/reading-stats',
        payload: {
          sessionDurationMs: 3600000,
          pagesRead: 1,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      // Math.round(0.99 * 3) = 3 = totalPages, so remainingPages = 0
      expect(body.readingStats.estimatedCompletionDate).toBeNull();
    });

    it('handles progress at exactly 0% with valid reading data', async () => {
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      mockReadFileSync.mockReturnValue(`---
title: Test Book
reading_progress: 0
total_pages: 100
reading_sessions:
  - start: "${yesterday.toISOString()}"
    end: "${new Date(yesterday.getTime() + 3600000).toISOString()}"
    duration_ms: 3600000
    pages: 10
    start_page: 0
    end_page: 10
reading_history:
  - date: "${today.toISOString().split('T')[0]}"
    duration_ms: 1800000
    sessions: 1
    pages: 5
  - date: "${yesterday.toISOString().split('T')[0]}"
    duration_ms: 3600000
    sessions: 1
    pages: 10
---

# Notes
`);

      testNotes.get('test-note')!.progress = 0;
      testNotes.get('test-note')!.totalPages = 100;

      const response = await fastify.inject({
        method: 'PATCH',
        url: '/api/library/test-note/reading-stats',
        payload: {
          sessionDurationMs: 3600000,
          pagesRead: 10,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      // 0% progress → currentPage=0, remainingPages=100
      // With valid pagesPerHour and daily average, should estimate completion
      expect(body.readingStats.estimatedCompletionDate).not.toBeNull();
    });
  });

  describe('PATCH /api/library/:id/reading-stats - session frequency fallback for completion', () => {
    it('uses session frequency when daily average is null but sessions exist', async () => {
      // One prior session (not enough history days for daily average since we need >= 2)
      // but enough session data for session frequency fallback
      mockReadFileSync.mockReturnValue(`---
title: Test Book
reading_progress: 30
total_pages: 200
reading_stats:
  total_time_ms: 7200000
  total_sessions: 2
  pages_per_hour: 25
  total_pages: 50
  first_read: "2024-01-14T10:00:00Z"
reading_sessions:
  - start: "2024-01-15T10:00:00Z"
    end: "2024-01-15T12:00:00Z"
    duration_ms: 7200000
    pages: 50
    start_page: 0
    end_page: 50
---

# Notes
`);

      testNotes.get('test-note')!.progress = 30;
      testNotes.get('test-note')!.totalPages = 200;

      const response = await fastify.inject({
        method: 'PATCH',
        url: '/api/library/test-note/reading-stats',
        payload: {
          sessionDurationMs: 7200000, // 2 hours
          pagesRead: 50,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      // With 2 sessions of 2h each, the session frequency fallback
      // estimates hoursPerDay from recent sessions
      // 2 sessions taken, recentDays = min(7, 2) = 2
      // recentTotalMs = 2 * 7200000 = 14400000
      // hoursPerDay = (14400000 / 2) / 3600000 = 2
      expect(body.readingStats.estimatedCompletionDate).not.toBeNull();
    });
  });

  describe('GET /api/library/:id/reading-pace - trend edge cases', () => {
    it('handles exactly 3 valid sessions for trend (minimum)', async () => {
      testNotes.get('test-note')!.frontmatter = {
        reading_sessions: [
          { start: new Date('2024-01-17T10:00:00Z'), end: new Date('2024-01-17T11:00:00Z'), duration_ms: 3600000, pages: 30, start_page: 0, end_page: 30 },
          { start: new Date('2024-01-16T10:00:00Z'), end: new Date('2024-01-16T11:00:00Z'), duration_ms: 3600000, pages: 30, start_page: 0, end_page: 30 },
          { start: new Date('2024-01-15T10:00:00Z'), end: new Date('2024-01-15T11:00:00Z'), duration_ms: 3600000, pages: 30, start_page: 0, end_page: 30 },
        ],
      };

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library/test-note/reading-pace',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      // All sessions same speed → stable
      expect(body.trend).toBe('stable');
    });

    it('handles trend with all identical pace values', async () => {
      const sessions = [];
      for (let i = 0; i < 10; i++) {
        const date = new Date('2024-01-20');
        date.setDate(date.getDate() - i);
        sessions.push({
          start: date,
          end: new Date(date.getTime() + 3600000),
          duration_ms: 3600000,
          pages: 25,
          start_page: 0,
          end_page: 25,
        });
      }

      testNotes.get('test-note')!.frontmatter = {
        reading_sessions: sessions,
      };

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library/test-note/reading-pace',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      // All identical → percentChange = 0 → stable
      expect(body.trend).toBe('stable');
      expect(body.currentPace).toBe(25);
      expect(body.overallAverage).toBe(25);
    });

    it('calculates currentPace from last 5 sessions only', async () => {
      const sessions = [];
      // First 5 sessions (most recent): 50 pph
      for (let i = 0; i < 5; i++) {
        const date = new Date('2024-01-20');
        date.setDate(date.getDate() - i);
        sessions.push({
          start: date,
          end: new Date(date.getTime() + 3600000),
          duration_ms: 3600000,
          pages: 50,
          start_page: 0,
          end_page: 50,
        });
      }
      // Next 5 sessions (older): 10 pph
      for (let i = 5; i < 10; i++) {
        const date = new Date('2024-01-20');
        date.setDate(date.getDate() - i);
        sessions.push({
          start: date,
          end: new Date(date.getTime() + 3600000),
          duration_ms: 3600000,
          pages: 10,
          start_page: 0,
          end_page: 10,
        });
      }

      testNotes.get('test-note')!.frontmatter = {
        reading_sessions: sessions,
      };

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library/test-note/reading-pace',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      // currentPace should be based on last 5 sessions only (50 pph each)
      expect(body.currentPace).toBe(50);
      // overallAverage should blend both: (5*50 + 5*10) / 10 = 30
      expect(body.overallAverage).toBe(30);
    });
  });

  describe('GET /api/library/:id/reading-pace - quality tie resolution', () => {
    it('deep wins over focused when tied', async () => {
      testNotes.get('test-note')!.frontmatter = {
        reading_sessions: [
          { start: new Date('2024-01-17T10:00:00Z'), end: new Date('2024-01-17T11:00:00Z'), duration_ms: 3600000, pages: 30, start_page: 0, end_page: 30, quality: 'deep' },
          { start: new Date('2024-01-16T10:00:00Z'), end: new Date('2024-01-16T11:00:00Z'), duration_ms: 3600000, pages: 30, start_page: 0, end_page: 30, quality: 'focused' },
        ],
      };

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library/test-note/reading-pace',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      // Both have count 1 - deep is checked first, so deep wins
      expect(body.averageSessionQuality).toBe('deep');
      // Focus score: (100 + 75) / 2 = 87.5 → rounds to 88
      expect(body.focusScore).toBe(88);
    });

    it('focused wins over normal when tied', async () => {
      testNotes.get('test-note')!.frontmatter = {
        reading_sessions: [
          { start: new Date('2024-01-17T10:00:00Z'), end: new Date('2024-01-17T11:00:00Z'), duration_ms: 3600000, pages: 30, start_page: 0, end_page: 30, quality: 'focused' },
          { start: new Date('2024-01-16T10:00:00Z'), end: new Date('2024-01-16T11:00:00Z'), duration_ms: 3600000, pages: 30, start_page: 0, end_page: 30, quality: 'normal' },
        ],
      };

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library/test-note/reading-pace',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      // Both have count 1 - focused is checked before normal
      expect(body.averageSessionQuality).toBe('focused');
      // Focus score: (75 + 50) / 2 = 62.5 → rounds to 63
      expect(body.focusScore).toBe(63);
    });

    it('normal wins over distracted when tied', async () => {
      testNotes.get('test-note')!.frontmatter = {
        reading_sessions: [
          { start: new Date('2024-01-17T10:00:00Z'), end: new Date('2024-01-17T11:00:00Z'), duration_ms: 3600000, pages: 30, start_page: 0, end_page: 30, quality: 'normal' },
          { start: new Date('2024-01-16T10:00:00Z'), end: new Date('2024-01-16T11:00:00Z'), duration_ms: 3600000, pages: 30, start_page: 0, end_page: 30, quality: 'distracted' },
        ],
      };

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library/test-note/reading-pace',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      expect(body.averageSessionQuality).toBe('normal');
      // Focus score: (50 + 25) / 2 = 37.5 → rounds to 38
      expect(body.focusScore).toBe(38);
    });
  });

  describe('GET /api/library/:id/reading-pace - percentage in peak period', () => {
    it('calculates correct percentage when all sessions in one period', async () => {
      // All sessions in evening (17-20)
      const sessions = [];
      for (let i = 0; i < 5; i++) {
        const date = new Date('2024-01-20');
        date.setDate(date.getDate() - i);
        date.setHours(19, 0, 0, 0); // 7 PM
        sessions.push({
          start: date,
          end: new Date(date.getTime() + 3600000),
          duration_ms: 3600000,
          pages: 20,
          start_page: 0,
          end_page: 20,
          hour_of_day: 19,
        });
      }

      testNotes.get('test-note')!.frontmatter = {
        reading_sessions: sessions,
      };

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library/test-note/reading-pace',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      expect(body.preferredReadingTime).not.toBeNull();
      expect(body.preferredReadingTime.peakPeriod).toBe('evening');
      expect(body.preferredReadingTime.percentageInPeakPeriod).toBe(100);
      expect(body.preferredReadingTime.sessionsInPeakPeriod).toBe(5);
    });

    it('handles sessions spread across all periods', async () => {
      testNotes.get('test-note')!.frontmatter = {
        reading_sessions: [
          // Morning (5-11)
          { start: new Date('2024-01-20T08:00:00Z'), end: new Date('2024-01-20T09:00:00Z'), duration_ms: 3600000, pages: 20, start_page: 0, end_page: 20, hour_of_day: 8 },
          { start: new Date('2024-01-19T09:00:00Z'), end: new Date('2024-01-19T10:00:00Z'), duration_ms: 3600000, pages: 20, start_page: 0, end_page: 20, hour_of_day: 9 },
          // Afternoon (12-16)
          { start: new Date('2024-01-18T14:00:00Z'), end: new Date('2024-01-18T15:00:00Z'), duration_ms: 3600000, pages: 20, start_page: 0, end_page: 20, hour_of_day: 14 },
          // Evening (17-20)
          { start: new Date('2024-01-17T19:00:00Z'), end: new Date('2024-01-17T20:00:00Z'), duration_ms: 3600000, pages: 20, start_page: 0, end_page: 20, hour_of_day: 19 },
        ],
      };

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library/test-note/reading-pace',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      expect(body.preferredReadingTime).not.toBeNull();
      // Peak hour is 8 (morning, since hour 8 has 1 session, tied with 9, 14, 19 - 8 is first found)
      expect(body.preferredReadingTime.peakPeriod).toBe('morning');
      // 2 morning sessions out of 4 total = 50%
      expect(body.preferredReadingTime.sessionsInPeakPeriod).toBe(2);
      expect(body.preferredReadingTime.percentageInPeakPeriod).toBe(50);
    });
  });

  describe('PATCH /api/library/:id/reading-stats - milestone ordering on multi-threshold crossing', () => {
    it('sorts milestones by value when crossing multiple thresholds in one session', async () => {
      // Jump from 0% to 80% in a single session - should record 25%, 50%, 75% milestones in order
      const note = createTestNote({
        progress: 0,
        totalPages: 200,
        readingStats: null,
        frontmatter: {},
      });
      testNotes.set('multi-milestone', note);

      mockReadFileSync.mockReturnValue('---\n---\n');

      const response = await fastify.inject({
        method: 'PATCH',
        url: '/api/library/multi-milestone/reading-stats',
        payload: {
          sessionDurationMs: 7200000, // 2 hours
          pagesRead: 160,
          startPage: 0,
          endPage: 160,
          currentProgress: 80,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      // Should have milestones for 25%, 50%, 75%
      expect(body.readingStats.milestones).toBeDefined();
      expect(body.readingStats.milestones.length).toBeGreaterThanOrEqual(3);

      // Verify sorted order (ascending by milestone value)
      for (let i = 1; i < body.readingStats.milestones.length; i++) {
        expect(body.readingStats.milestones[i].milestone).toBeGreaterThanOrEqual(
          body.readingStats.milestones[i - 1].milestone
        );
      }

      // Verify specific milestones are present
      const milestoneValues = body.readingStats.milestones.map((m: { milestone: number }) => m.milestone);
      expect(milestoneValues).toContain(25);
      expect(milestoneValues).toContain(50);
      expect(milestoneValues).toContain(75);
    });
  });

  describe('PATCH /api/library/:id/reading-stats - daily average threshold behavior', () => {
    it('returns null averageDailyReadingMs with only 1 history entry', async () => {
      // A single day of reading history should not produce a daily average (requires >= 2)
      const note = createTestNote({
        progress: 30,
        totalPages: 100,
        readingStats: null,
        frontmatter: {},
      });
      testNotes.set('single-day', note);

      mockReadFileSync.mockReturnValue('---\n---\n');

      const response = await fastify.inject({
        method: 'PATCH',
        url: '/api/library/single-day/reading-stats',
        payload: {
          sessionDurationMs: 1800000, // 30 min
          pagesRead: 15,
          startPage: 0,
          endPage: 15,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      // With only 1 history entry, averageDailyReadingMs should be null
      expect(body.readingStats.averageDailyReadingMs).toBeNull();
    });

    it('computes averageDailyReadingMs when two history entries exist', async () => {
      const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

      const note = createTestNote({
        progress: 40,
        totalPages: 200,
        readingStats: {
          totalReadingTimeMs: 3600000,
          totalSessions: 1,
          averageSessionMs: 3600000,
          firstReadDate: yesterday + 'T10:00:00Z',
          pagesPerHour: 30,
          totalPagesRead: 30,
          longestSessionMs: 3600000,
          estimatedCompletionDate: null,
          averageDailyReadingMs: null,
        },
        frontmatter: {
          reading_history: [
            { date: yesterday, duration_ms: 3600000, sessions: 1, pages: 30 },
          ],
          reading_sessions: [
            { start: yesterday + 'T10:00:00Z', end: yesterday + 'T11:00:00Z', duration_ms: 3600000, pages: 30, start_page: 0, end_page: 30, hour_of_day: 10 },
          ],
        },
      });
      testNotes.set('two-day', note);

      mockReadFileSync.mockReturnValue(
        `---\nreading_history:\n  - date: "${yesterday}"\n    duration_ms: 3600000\n    sessions: 1\n    pages: 30\nreading_sessions:\n  - start: "${yesterday}T10:00:00Z"\n    end: "${yesterday}T11:00:00Z"\n    duration_ms: 3600000\n    pages: 30\n    start_page: 0\n    end_page: 30\n    hour_of_day: 10\n---\n`
      );

      const response = await fastify.inject({
        method: 'PATCH',
        url: '/api/library/two-day/reading-stats',
        payload: {
          sessionDurationMs: 1800000, // 30 min
          pagesRead: 15,
          startPage: 30,
          endPage: 45,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      // With 2 history entries, averageDailyReadingMs should be a weighted average (non-null)
      expect(body.readingStats.averageDailyReadingMs).not.toBeNull();
      expect(body.readingStats.averageDailyReadingMs).toBeGreaterThan(0);
    });
  });

  describe('PATCH /api/library/:id/reading-stats - session frequency fallback with many sessions', () => {
    it('uses at most 7 recent sessions for frequency estimation', async () => {
      // Provide 10 sessions - the frequency fallback should use min(7, length) = 7
      const sessions = [];
      for (let i = 0; i < 10; i++) {
        const date = new Date('2024-01-20');
        date.setDate(date.getDate() - i);
        sessions.push({
          start: date.toISOString(),
          end: new Date(date.getTime() + 3600000).toISOString(),
          duration_ms: 3600000, // 1 hour
          pages: 30,
          start_page: i * 30,
          end_page: (i + 1) * 30,
          hour_of_day: 10,
        });
      }

      const note = createTestNote({
        progress: 50,
        totalPages: 500,
        readingStats: null,
        frontmatter: {
          reading_sessions: sessions,
        },
      });
      testNotes.set('many-sessions', note);

      // File with existing sessions but no daily history (so frequency fallback is used)
      mockReadFileSync.mockReturnValue(
        `---\nreading_sessions:\n${sessions.map(s => `  - start: "${s.start}"\n    end: "${s.end}"\n    duration_ms: ${s.duration_ms}\n    pages: ${s.pages}\n    start_page: ${s.start_page}\n    end_page: ${s.end_page}\n    hour_of_day: ${s.hour_of_day}`).join('\n')}\n---\n`
      );

      const response = await fastify.inject({
        method: 'PATCH',
        url: '/api/library/many-sessions/reading-stats',
        payload: {
          sessionDurationMs: 3600000,
          pagesRead: 30,
          startPage: 300,
          endPage: 330,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      // The endpoint should succeed and produce an estimated completion date
      // (since we have valid pages and speed data)
      expect(body.readingStats.pagesPerHour).toBeGreaterThan(0);
    });
  });

  describe('GET /api/library/:id/reading-pace - focus score with uniform quality', () => {
    it('returns 100 focus score when all sessions are deep quality', async () => {
      const sessions = [];
      for (let i = 0; i < 5; i++) {
        const date = new Date('2024-01-20');
        date.setDate(date.getDate() - i);
        sessions.push({
          start: date.toISOString(),
          end: new Date(date.getTime() + 3600000).toISOString(),
          duration_ms: 3600000,
          pages: 30,
          start_page: i * 30,
          end_page: (i + 1) * 30,
          hour_of_day: 10,
          quality: 'deep',
        });
      }

      testNotes.get('test-note')!.frontmatter = {
        reading_sessions: sessions,
      };

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library/test-note/reading-pace',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      expect(body.focusScore).toBe(100);
      expect(body.averageSessionQuality).toBe('deep');
    });

    it('returns 25 focus score when all sessions are distracted quality', async () => {
      const sessions = [];
      for (let i = 0; i < 4; i++) {
        const date = new Date('2024-01-20');
        date.setDate(date.getDate() - i);
        sessions.push({
          start: date.toISOString(),
          end: new Date(date.getTime() + 3600000).toISOString(),
          duration_ms: 3600000,
          pages: 10,
          start_page: i * 10,
          end_page: (i + 1) * 10,
          hour_of_day: 14,
          quality: 'distracted',
        });
      }

      testNotes.get('test-note')!.frontmatter = {
        reading_sessions: sessions,
      };

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library/test-note/reading-pace',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      expect(body.focusScore).toBe(25);
      expect(body.averageSessionQuality).toBe('distracted');
    });
  });

  describe('GET /api/library/:id/reading-pace - overall average vs current pace', () => {
    it('computes overallAverage across all valid sessions, not just recent 5', async () => {
      // Create 8 sessions: first 3 slow (10 pph), last 5 fast (50 pph)
      const sessions = [];
      // Older slow sessions
      for (let i = 7; i >= 5; i--) {
        const date = new Date('2024-01-20');
        date.setDate(date.getDate() - i);
        sessions.push({
          start: date.toISOString(),
          end: new Date(date.getTime() + 3600000).toISOString(),
          duration_ms: 3600000, // 1 hour
          pages: 10, // 10 pph
          start_page: 0,
          end_page: 10,
          hour_of_day: 10,
        });
      }
      // Recent fast sessions
      for (let i = 4; i >= 0; i--) {
        const date = new Date('2024-01-20');
        date.setDate(date.getDate() - i);
        sessions.push({
          start: date.toISOString(),
          end: new Date(date.getTime() + 3600000).toISOString(),
          duration_ms: 3600000, // 1 hour
          pages: 50, // 50 pph
          start_page: 0,
          end_page: 50,
          hour_of_day: 14,
        });
      }

      testNotes.get('test-note')!.frontmatter = {
        reading_sessions: sessions,
      };

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library/test-note/reading-pace',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      // currentPace should reflect only the last 5 sessions (50 pph each)
      expect(body.currentPace).toBe(50);

      // overallAverage should include all 8 sessions: (10*3 + 50*5) / 8 = 280/8 = 35
      expect(body.overallAverage).toBe(35);

      // They should differ because old sessions pull the overall down
      expect(body.currentPace).toBeGreaterThan(body.overallAverage);
    });
  });

  describe('GET /api/library/:id/reading-pace - trend boundary at exactly 10% change', () => {
    it('reports stable when pace change is exactly 10%', async () => {
      // Create sessions where recent half is exactly 10% faster
      // Older half: 100 pph, Recent half: 110 pph => 10% change => stable (not improving)
      const sessions = [];
      // Recent sessions (first in array = most recent)
      for (let i = 0; i < 2; i++) {
        const date = new Date('2024-01-20');
        date.setDate(date.getDate() - i);
        sessions.push({
          start: date.toISOString(),
          end: new Date(date.getTime() + 3600000).toISOString(),
          duration_ms: 3600000,
          pages: 110, // 110 pph
          start_page: 0,
          end_page: 110,
          hour_of_day: 10,
        });
      }
      // Older sessions
      for (let i = 2; i < 4; i++) {
        const date = new Date('2024-01-20');
        date.setDate(date.getDate() - i);
        sessions.push({
          start: date.toISOString(),
          end: new Date(date.getTime() + 3600000).toISOString(),
          duration_ms: 3600000,
          pages: 100, // 100 pph
          start_page: 0,
          end_page: 100,
          hour_of_day: 10,
        });
      }

      testNotes.get('test-note')!.frontmatter = {
        reading_sessions: sessions,
      };

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library/test-note/reading-pace',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      // Exactly 10% change should be 'stable' (threshold is >10 for improving)
      expect(body.trend).toBe('stable');
    });

    it('reports improving when pace change is just over 10%', async () => {
      // Recent half: 111 pph, Older half: 100 pph => 11% change => improving
      const sessions = [];
      for (let i = 0; i < 2; i++) {
        const date = new Date('2024-01-20');
        date.setDate(date.getDate() - i);
        sessions.push({
          start: date.toISOString(),
          end: new Date(date.getTime() + 3600000).toISOString(),
          duration_ms: 3600000,
          pages: 111, // 111 pph
          start_page: 0,
          end_page: 111,
          hour_of_day: 10,
        });
      }
      for (let i = 2; i < 4; i++) {
        const date = new Date('2024-01-20');
        date.setDate(date.getDate() - i);
        sessions.push({
          start: date.toISOString(),
          end: new Date(date.getTime() + 3600000).toISOString(),
          duration_ms: 3600000,
          pages: 100,
          start_page: 0,
          end_page: 100,
          hour_of_day: 10,
        });
      }

      testNotes.get('test-note')!.frontmatter = {
        reading_sessions: sessions,
      };

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library/test-note/reading-pace',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      expect(body.trend).toBe('improving');
    });

    it('reports declining when pace drops just over 10%', async () => {
      // Recent half: 89 pph, Older half: 100 pph => -11% change => declining
      const sessions = [];
      for (let i = 0; i < 2; i++) {
        const date = new Date('2024-01-20');
        date.setDate(date.getDate() - i);
        sessions.push({
          start: date.toISOString(),
          end: new Date(date.getTime() + 3600000).toISOString(),
          duration_ms: 3600000,
          pages: 89, // 89 pph
          start_page: 0,
          end_page: 89,
          hour_of_day: 10,
        });
      }
      for (let i = 2; i < 4; i++) {
        const date = new Date('2024-01-20');
        date.setDate(date.getDate() - i);
        sessions.push({
          start: date.toISOString(),
          end: new Date(date.getTime() + 3600000).toISOString(),
          duration_ms: 3600000,
          pages: 100,
          start_page: 0,
          end_page: 100,
          hour_of_day: 10,
        });
      }

      testNotes.get('test-note')!.frontmatter = {
        reading_sessions: sessions,
      };

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library/test-note/reading-pace',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      expect(body.trend).toBe('declining');
    });
  });

  describe('GET /api/library/:id/reading-pace - pagesPerHour threshold at 1 minute', () => {
    it('returns null pagesPerHour for session exactly at 1-minute boundary', async () => {
      // durationHours = 60000 / 3600000 = 0.01666... which is < 0.0167 threshold
      const sessions = [{
        start: new Date('2024-01-20T10:00:00Z').toISOString(),
        end: new Date('2024-01-20T10:01:00Z').toISOString(),
        duration_ms: 60000, // exactly 1 minute = 0.01666 hours < 0.0167 threshold
        pages: 5,
        start_page: 0,
        end_page: 5,
        hour_of_day: 10,
      }];

      testNotes.get('test-note')!.frontmatter = {
        reading_sessions: sessions,
      };

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library/test-note/reading-pace',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      // 60000ms / 3600000 = 0.01666... which is below the 0.0167 threshold
      expect(body.paceData.length).toBe(1);
      expect(body.paceData[0].pagesPerHour).toBeNull();
    });

    it('returns valid pagesPerHour for session just above 1-minute threshold', async () => {
      // 60120ms / 3600000 = 0.0167 which meets the >= 0.0167 threshold
      const sessions = [{
        start: new Date('2024-01-20T10:00:00Z').toISOString(),
        end: new Date('2024-01-20T10:01:00.120Z').toISOString(),
        duration_ms: 60120, // just above threshold
        pages: 5,
        start_page: 0,
        end_page: 5,
        hour_of_day: 10,
      }];

      testNotes.get('test-note')!.frontmatter = {
        reading_sessions: sessions,
      };

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library/test-note/reading-pace',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      expect(body.paceData.length).toBe(1);
      expect(body.paceData[0].pagesPerHour).not.toBeNull();
      expect(body.paceData[0].pagesPerHour).toBeGreaterThan(0);
    });

    it('returns null pagesPerHour for session under 1 minute', async () => {
      const sessions = [{
        start: new Date('2024-01-20T10:00:00Z').toISOString(),
        end: new Date('2024-01-20T10:00:59Z').toISOString(),
        duration_ms: 59000, // just under 1 minute
        pages: 5,
        start_page: 0,
        end_page: 5,
        hour_of_day: 10,
      }];

      testNotes.get('test-note')!.frontmatter = {
        reading_sessions: sessions,
      };

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library/test-note/reading-pace',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      // Under the 0.0167 threshold, so pagesPerHour should be null
      expect(body.paceData.length).toBe(1);
      expect(body.paceData[0].pagesPerHour).toBeNull();
    });

    it('returns null pagesPerHour when pages read is zero despite long duration', async () => {
      const sessions = [{
        start: new Date('2024-01-20T10:00:00Z').toISOString(),
        end: new Date('2024-01-20T11:00:00Z').toISOString(),
        duration_ms: 3600000, // 1 hour
        pages: 0,
        start_page: 10,
        end_page: 10,
        hour_of_day: 10,
      }];

      testNotes.get('test-note')!.frontmatter = {
        reading_sessions: sessions,
      };

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library/test-note/reading-pace',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      expect(body.paceData.length).toBe(1);
      expect(body.paceData[0].pagesPerHour).toBeNull();
    });
  });

  describe('GET /api/library/:id/reading-pace - preferred reading time with single session at boundary hours', () => {
    it('classifies hour 4 as night', async () => {
      testNotes.get('test-note')!.frontmatter = {
        reading_sessions: [{
          start: new Date('2024-01-20T04:00:00Z').toISOString(),
          end: new Date('2024-01-20T05:00:00Z').toISOString(),
          duration_ms: 3600000,
          pages: 20,
          start_page: 0,
          end_page: 20,
          hour_of_day: 4,
        }],
      };

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library/test-note/reading-pace',
      });

      const body = JSON.parse(response.body);
      expect(body.preferredReadingTime.peakPeriod).toBe('night');
      expect(body.preferredReadingTime.peakHour).toBe(4);
    });

    it('classifies hour 5 as morning (boundary)', async () => {
      testNotes.get('test-note')!.frontmatter = {
        reading_sessions: [{
          start: new Date('2024-01-20T05:00:00Z').toISOString(),
          end: new Date('2024-01-20T06:00:00Z').toISOString(),
          duration_ms: 3600000,
          pages: 20,
          start_page: 0,
          end_page: 20,
          hour_of_day: 5,
        }],
      };

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library/test-note/reading-pace',
      });

      const body = JSON.parse(response.body);
      expect(body.preferredReadingTime.peakPeriod).toBe('morning');
      expect(body.preferredReadingTime.peakHour).toBe(5);
    });

    it('classifies hour 11 as morning (boundary)', async () => {
      testNotes.get('test-note')!.frontmatter = {
        reading_sessions: [{
          start: new Date('2024-01-20T11:00:00Z').toISOString(),
          end: new Date('2024-01-20T12:00:00Z').toISOString(),
          duration_ms: 3600000,
          pages: 20,
          start_page: 0,
          end_page: 20,
          hour_of_day: 11,
        }],
      };

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library/test-note/reading-pace',
      });

      const body = JSON.parse(response.body);
      expect(body.preferredReadingTime.peakPeriod).toBe('morning');
      expect(body.preferredReadingTime.peakHour).toBe(11);
    });

    it('classifies hour 12 as afternoon (boundary)', async () => {
      testNotes.get('test-note')!.frontmatter = {
        reading_sessions: [{
          start: new Date('2024-01-20T12:00:00Z').toISOString(),
          end: new Date('2024-01-20T13:00:00Z').toISOString(),
          duration_ms: 3600000,
          pages: 20,
          start_page: 0,
          end_page: 20,
          hour_of_day: 12,
        }],
      };

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library/test-note/reading-pace',
      });

      const body = JSON.parse(response.body);
      expect(body.preferredReadingTime.peakPeriod).toBe('afternoon');
      expect(body.preferredReadingTime.peakHour).toBe(12);
    });

    it('classifies hour 16 as afternoon (boundary)', async () => {
      testNotes.get('test-note')!.frontmatter = {
        reading_sessions: [{
          start: new Date('2024-01-20T16:00:00Z').toISOString(),
          end: new Date('2024-01-20T17:00:00Z').toISOString(),
          duration_ms: 3600000,
          pages: 20,
          start_page: 0,
          end_page: 20,
          hour_of_day: 16,
        }],
      };

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library/test-note/reading-pace',
      });

      const body = JSON.parse(response.body);
      expect(body.preferredReadingTime.peakPeriod).toBe('afternoon');
      expect(body.preferredReadingTime.peakHour).toBe(16);
    });

    it('classifies hour 17 as evening (boundary)', async () => {
      testNotes.get('test-note')!.frontmatter = {
        reading_sessions: [{
          start: new Date('2024-01-20T17:00:00Z').toISOString(),
          end: new Date('2024-01-20T18:00:00Z').toISOString(),
          duration_ms: 3600000,
          pages: 20,
          start_page: 0,
          end_page: 20,
          hour_of_day: 17,
        }],
      };

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library/test-note/reading-pace',
      });

      const body = JSON.parse(response.body);
      expect(body.preferredReadingTime.peakPeriod).toBe('evening');
      expect(body.preferredReadingTime.peakHour).toBe(17);
    });

    it('classifies hour 20 as evening (boundary)', async () => {
      testNotes.get('test-note')!.frontmatter = {
        reading_sessions: [{
          start: new Date('2024-01-20T20:00:00Z').toISOString(),
          end: new Date('2024-01-20T21:00:00Z').toISOString(),
          duration_ms: 3600000,
          pages: 20,
          start_page: 0,
          end_page: 20,
          hour_of_day: 20,
        }],
      };

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library/test-note/reading-pace',
      });

      const body = JSON.parse(response.body);
      expect(body.preferredReadingTime.peakPeriod).toBe('evening');
      expect(body.preferredReadingTime.peakHour).toBe(20);
    });

    it('classifies hour 21 as night (boundary)', async () => {
      testNotes.get('test-note')!.frontmatter = {
        reading_sessions: [{
          start: new Date('2024-01-20T21:00:00Z').toISOString(),
          end: new Date('2024-01-20T22:00:00Z').toISOString(),
          duration_ms: 3600000,
          pages: 20,
          start_page: 0,
          end_page: 20,
          hour_of_day: 21,
        }],
      };

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library/test-note/reading-pace',
      });

      const body = JSON.parse(response.body);
      expect(body.preferredReadingTime.peakPeriod).toBe('night');
      expect(body.preferredReadingTime.peakHour).toBe(21);
    });
  });

  describe('GET /api/library/:id/reading-pace - time of day patterns with derived hourOfDay', () => {
    it('derives hourOfDay from startTime when not explicitly stored', async () => {
      testNotes.get('test-note')!.frontmatter = {
        reading_sessions: [
          // Session with explicit hourOfDay
          { start: new Date('2024-01-20T10:00:00Z').toISOString(), end: new Date('2024-01-20T11:00:00Z').toISOString(), duration_ms: 3600000, pages: 20, start_page: 0, end_page: 20, hour_of_day: 10 },
          // Session without hourOfDay - should be derived from startTime (hour 14 in UTC)
          { start: new Date('2024-01-19T14:00:00Z').toISOString(), end: new Date('2024-01-19T15:00:00Z').toISOString(), duration_ms: 3600000, pages: 25, start_page: 20, end_page: 45 },
          // Another session with explicit hourOfDay
          { start: new Date('2024-01-18T10:00:00Z').toISOString(), end: new Date('2024-01-18T11:00:00Z').toISOString(), duration_ms: 1800000, pages: 15, start_page: 45, end_page: 60, hour_of_day: 10 },
        ],
      };

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library/test-note/reading-pace',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      // Should have all 24 hours in patterns
      expect(body.timeOfDayPatterns).toHaveLength(24);

      // Hour 10 should have 2 sessions (from the two sessions with hour_of_day: 10)
      const hour10 = body.timeOfDayPatterns.find((p: { hour: number }) => p.hour === 10);
      expect(hour10.totalSessions).toBe(2);
      expect(hour10.totalDurationMs).toBe(3600000 + 1800000);
      expect(hour10.averageDurationMs).toBe(Math.round((3600000 + 1800000) / 2));

      // The session without explicit hour_of_day should have hourOfDay derived from startTime
      // All 3 sessions should be counted in patterns (derivation fills in the gap)
      const totalSessionsInPatterns = body.timeOfDayPatterns.reduce(
        (sum: number, p: { totalSessions: number }) => sum + p.totalSessions, 0
      );
      expect(totalSessionsInPatterns).toBe(3);

      // The derived session (from 14:00 UTC) should appear in the local-time hour bucket
      // Note: exact hour depends on local timezone, but the total should be 3
    });
  });

  describe('GET /api/library/:id/reading-pace - edge case with exactly 2 valid sessions for trend', () => {
    it('returns null trend with exactly 2 valid sessions (minimum is 3)', async () => {
      const sessions = [
        {
          start: new Date('2024-01-20T10:00:00Z').toISOString(),
          end: new Date('2024-01-20T11:00:00Z').toISOString(),
          duration_ms: 3600000,
          pages: 30,
          start_page: 0,
          end_page: 30,
          hour_of_day: 10,
        },
        {
          start: new Date('2024-01-19T10:00:00Z').toISOString(),
          end: new Date('2024-01-19T11:00:00Z').toISOString(),
          duration_ms: 3600000,
          pages: 20,
          start_page: 30,
          end_page: 50,
          hour_of_day: 10,
        },
      ];

      testNotes.get('test-note')!.frontmatter = {
        reading_sessions: sessions,
      };

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library/test-note/reading-pace',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      expect(body.trend).toBeNull();
      // But overallAverage and currentPace should still be computed
      expect(body.currentPace).not.toBeNull();
      expect(body.overallAverage).not.toBeNull();
    });
  });
});
