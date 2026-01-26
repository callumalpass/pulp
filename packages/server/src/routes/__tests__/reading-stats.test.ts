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
});
