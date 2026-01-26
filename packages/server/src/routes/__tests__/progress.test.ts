import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { progressRoutes } from '../progress.js';
import type { LibraryScanner } from '../../services/library-scanner.js';
import type { Config } from '../../config/schema.js';
import type { LiteratureNote } from '@pulp/shared';

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

describe('progressRoutes', () => {
  let app: FastifyInstance;
  let notes: Map<string, LiteratureNote>;
  let mockScanner: LibraryScanner;

  beforeEach(async () => {
    // Reset mock implementations completely
    vi.resetAllMocks();
    mockReadFileSync.mockReset();
    mockWriteFileSync.mockReset();

    notes = new Map();
    mockScanner = createMockScanner(notes);
    app = Fastify();
    await app.register(progressRoutes, { scanner: mockScanner, config: testConfig });
  });

  afterEach(async () => {
    await app.close();
  });

  describe('PATCH /api/library/:id/progress', () => {
    describe('happy path', () => {
      it('updates progress for a PDF note', async () => {
        const testNote = createTestNote();
        notes.set('test-note', testNote);

        mockReadFileSync.mockReturnValue(`---
title: Test Book
reading_progress: 50
---
Content`);

        const response = await app.inject({
          method: 'PATCH',
          url: '/api/library/test-note/progress',
          payload: {
            progress: 75,
          },
        });

        expect(response.statusCode).toBe(200);
        const body = response.json();
        expect(body.success).toBe(true);
        expect(body.progress).toBe(75);
        expect(body.lastRead).toBeDefined();
        expect(mockWriteFileSync).toHaveBeenCalled();
        expect(mockScanner.updateNote).toHaveBeenCalledWith('test-note', expect.objectContaining({
          progress: 75,
        }));
      });

      it('updates progress for an EPUB note with CFI', async () => {
        const testNote = createTestNote({ sourceType: 'epub' });
        notes.set('test-note', testNote);

        mockReadFileSync.mockReturnValue(`---
title: Test Book
reading_progress: 30
---
Content`);

        const response = await app.inject({
          method: 'PATCH',
          url: '/api/library/test-note/progress',
          payload: {
            progress: 45,
            lastOpenedCfi: 'epubcfi(/6/4!/4/2)',
          },
        });

        expect(response.statusCode).toBe(200);
        const body = response.json();
        expect(body.success).toBe(true);
        expect(body.progress).toBe(45);
        expect(body.lastOpenedCfi).toBe('epubcfi(/6/4!/4/2)');
        expect(mockScanner.updateNote).toHaveBeenCalledWith('test-note', expect.objectContaining({
          progress: 45,
          lastOpenedCfi: 'epubcfi(/6/4!/4/2)',
        }));
      });

      it('updates lastRead timestamp', async () => {
        const testNote = createTestNote();
        notes.set('test-note', testNote);

        mockReadFileSync.mockReturnValue(`---
title: Test Book
reading_progress: 50
---
Content`);

        const beforeRequest = new Date().toISOString();
        const response = await app.inject({
          method: 'PATCH',
          url: '/api/library/test-note/progress',
          payload: {
            progress: 60,
          },
        });
        const afterRequest = new Date().toISOString();

        const body = response.json();
        expect(body.lastRead >= beforeRequest).toBe(true);
        expect(body.lastRead <= afterRequest).toBe(true);
      });
    });

    describe('date_finished behavior', () => {
      it('sets date_finished when progress reaches 100% for the first time', async () => {
        const testNote = createTestNote({ progress: 95, dateFinished: null });
        notes.set('test-note', testNote);

        mockReadFileSync.mockReturnValue(`---
title: Test Book
reading_progress: 95
---
Content`);

        const response = await app.inject({
          method: 'PATCH',
          url: '/api/library/test-note/progress',
          payload: {
            progress: 100,
          },
        });

        expect(response.statusCode).toBe(200);
        const body = response.json();
        expect(body.dateFinished).toBeDefined();

        // Check that writeFileSync was called with date_finished in frontmatter
        const writeCall = mockWriteFileSync.mock.calls[0];
        expect(writeCall[1]).toContain('date_finished');
      });

      it('does not update date_finished when already completed', async () => {
        const existingFinishDate = '2024-01-10T00:00:00Z';
        const testNote = createTestNote({
          progress: 80,
          dateFinished: existingFinishDate,
        });
        notes.set('test-note', testNote);

        mockReadFileSync.mockReturnValue(`---
title: Test Book
reading_progress: 80
date_finished: ${existingFinishDate}
---
Content`);

        const response = await app.inject({
          method: 'PATCH',
          url: '/api/library/test-note/progress',
          payload: {
            progress: 100,
          },
        });

        expect(response.statusCode).toBe(200);
        const body = response.json();
        // dateFinished should be the original date, not a new one
        expect(body.dateFinished).toBe(existingFinishDate);
      });

      it('does not set date_finished when progress is below 100%', async () => {
        const testNote = createTestNote({ progress: 50, dateFinished: null });
        notes.set('test-note', testNote);

        mockReadFileSync.mockReturnValue(`---
title: Test Book
reading_progress: 50
---
Content`);

        const response = await app.inject({
          method: 'PATCH',
          url: '/api/library/test-note/progress',
          payload: {
            progress: 99,
          },
        });

        expect(response.statusCode).toBe(200);
        const body = response.json();
        // dateFinished is null when not yet completed (from note.dateFinished)
        expect(body.dateFinished).toBeNull();
      });
    });

    describe('CFI handling', () => {
      it('saves lastOpenedCfi for EPUB sources', async () => {
        const testNote = createTestNote({ sourceType: 'epub' });
        notes.set('test-note', testNote);

        mockReadFileSync.mockReturnValue(`---
title: Test Book
reading_progress: 30
---
Content`);

        const response = await app.inject({
          method: 'PATCH',
          url: '/api/library/test-note/progress',
          payload: {
            progress: 45,
            lastOpenedCfi: 'epubcfi(/6/8!/4/2/1:0)',
          },
        });

        expect(response.statusCode).toBe(200);

        // Check that writeFileSync was called with last_opened_cfi in frontmatter
        const writeCall = mockWriteFileSync.mock.calls[0];
        expect(writeCall[1]).toContain('last_opened_cfi');
        expect(writeCall[1]).toContain('epubcfi(/6/8!/4/2/1:0)');
      });

      it('does not include lastOpenedCfi in cache update for PDF sources', async () => {
        const testNote = createTestNote({ sourceType: 'pdf' });
        notes.set('test-note', testNote);

        mockReadFileSync.mockReturnValue(`---
title: Test Book
reading_progress: 30
---
Content`);

        const response = await app.inject({
          method: 'PATCH',
          url: '/api/library/test-note/progress',
          payload: {
            progress: 45,
            lastOpenedCfi: 'epubcfi(/6/8!/4/2/1:0)', // Should not be saved for PDF
          },
        });

        expect(response.statusCode).toBe(200);
        // The response still echoes back the input lastOpenedCfi
        const body = response.json();
        expect(body.lastOpenedCfi).toBe('epubcfi(/6/8!/4/2/1:0)');

        // The in-memory cache update should NOT include lastOpenedCfi for PDF
        // This verifies line 79 of progress.ts: ...(lastOpenedCfi && note.sourceType === 'epub' ? { lastOpenedCfi } : {})
        const updateCall = mockScanner.updateNote.mock.calls[0];
        expect(updateCall[1]).not.toHaveProperty('lastOpenedCfi');
      });
    });

    describe('progress value validation and clamping', () => {
      it('rejects progress below 0 via schema validation', async () => {
        const testNote = createTestNote();
        notes.set('test-note', testNote);

        const response = await app.inject({
          method: 'PATCH',
          url: '/api/library/test-note/progress',
          payload: {
            progress: -10,
          },
        });

        expect(response.statusCode).toBe(400);
      });

      it('rejects progress above 100 via schema validation', async () => {
        const testNote = createTestNote();
        notes.set('test-note', testNote);

        const response = await app.inject({
          method: 'PATCH',
          url: '/api/library/test-note/progress',
          payload: {
            progress: 150,
          },
        });

        expect(response.statusCode).toBe(400);
      });

      it('accepts progress at 0', async () => {
        const testNote = createTestNote({ progress: 50 });
        notes.set('test-note', testNote);

        mockReadFileSync.mockReturnValue(`---
title: Test Book
reading_progress: 50
---
Content`);

        const response = await app.inject({
          method: 'PATCH',
          url: '/api/library/test-note/progress',
          payload: {
            progress: 0,
          },
        });

        expect(response.statusCode).toBe(200);
        const body = response.json();
        expect(body.progress).toBe(0);
      });

      it('accepts progress at 100', async () => {
        const testNote = createTestNote({ progress: 50 });
        notes.set('test-note', testNote);

        mockReadFileSync.mockReturnValue(`---
title: Test Book
reading_progress: 50
---
Content`);

        const response = await app.inject({
          method: 'PATCH',
          url: '/api/library/test-note/progress',
          payload: {
            progress: 100,
          },
        });

        expect(response.statusCode).toBe(200);
        const body = response.json();
        expect(body.progress).toBe(100);
      });

      it('accepts decimal progress values', async () => {
        const testNote = createTestNote({ progress: 50 });
        notes.set('test-note', testNote);

        mockReadFileSync.mockReturnValue(`---
title: Test Book
reading_progress: 50
---
Content`);

        const response = await app.inject({
          method: 'PATCH',
          url: '/api/library/test-note/progress',
          payload: {
            progress: 33.33,
          },
        });

        expect(response.statusCode).toBe(200);
        const body = response.json();
        expect(body.progress).toBe(33.33);
      });
    });

    describe('error handling', () => {
      it('returns 404 for non-existent note', async () => {
        const response = await app.inject({
          method: 'PATCH',
          url: '/api/library/non-existent/progress',
          payload: {
            progress: 50,
          },
        });

        expect(response.statusCode).toBe(404);
        const body = response.json();
        expect(body.error).toContain('not found');
      });

      it('returns 500 when file read fails', async () => {
        const testNote = createTestNote();
        notes.set('test-note', testNote);

        mockReadFileSync.mockImplementation(() => {
          throw new Error('File not found');
        });

        const response = await app.inject({
          method: 'PATCH',
          url: '/api/library/test-note/progress',
          payload: {
            progress: 75,
          },
        });

        expect(response.statusCode).toBe(500);
        const body = response.json();
        expect(body.error).toContain('Failed to update progress');
      });

      it('returns 500 when file write fails', async () => {
        const testNote = createTestNote();
        notes.set('test-note', testNote);

        mockReadFileSync.mockReturnValue(`---
title: Test Book
reading_progress: 50
---
Content`);

        mockWriteFileSync.mockImplementation(() => {
          throw new Error('Permission denied');
        });

        const response = await app.inject({
          method: 'PATCH',
          url: '/api/library/test-note/progress',
          payload: {
            progress: 75,
          },
        });

        expect(response.statusCode).toBe(500);
        const body = response.json();
        expect(body.error).toContain('Failed to update progress');
      });

      it('rejects missing progress field', async () => {
        const testNote = createTestNote();
        notes.set('test-note', testNote);

        const response = await app.inject({
          method: 'PATCH',
          url: '/api/library/test-note/progress',
          payload: {},
        });

        expect(response.statusCode).toBe(400);
      });
    });

    describe('frontmatter preservation', () => {
      it('preserves existing frontmatter fields when updating progress', async () => {
        const testNote = createTestNote();
        notes.set('test-note', testNote);

        mockReadFileSync.mockReturnValue(`---
title: Test Book
author: Test Author
reading_progress: 50
rating: 4
custom_field: custom_value
---
Content`);

        await app.inject({
          method: 'PATCH',
          url: '/api/library/test-note/progress',
          payload: {
            progress: 75,
          },
        });

        const writeCall = mockWriteFileSync.mock.calls[0];
        const writtenContent = writeCall[1] as string;

        expect(writtenContent).toContain('title: Test Book');
        expect(writtenContent).toContain('author: Test Author');
        expect(writtenContent).toContain('rating: 4');
        expect(writtenContent).toContain('custom_field: custom_value');
        expect(writtenContent).toContain('reading_progress: 75');
      });

      it('preserves markdown content after frontmatter', async () => {
        const testNote = createTestNote();
        notes.set('test-note', testNote);

        const markdownContent = `# Notes

This is my reading notes content.

## Chapter 1
Some notes about chapter 1.`;

        mockReadFileSync.mockReturnValue(`---
title: Test Book
reading_progress: 50
---
${markdownContent}`);

        await app.inject({
          method: 'PATCH',
          url: '/api/library/test-note/progress',
          payload: {
            progress: 75,
          },
        });

        const writeCall = mockWriteFileSync.mock.calls[0];
        const writtenContent = writeCall[1] as string;

        expect(writtenContent).toContain('# Notes');
        expect(writtenContent).toContain('This is my reading notes content.');
        expect(writtenContent).toContain('## Chapter 1');
      });
    });

    describe('in-memory cache updates', () => {
      it('updates scanner cache with new progress', async () => {
        const testNote = createTestNote({ progress: 50 });
        notes.set('test-note', testNote);

        mockReadFileSync.mockReturnValue(`---
title: Test Book
reading_progress: 50
---
Content`);

        await app.inject({
          method: 'PATCH',
          url: '/api/library/test-note/progress',
          payload: {
            progress: 75,
          },
        });

        expect(mockScanner.updateNote).toHaveBeenCalledWith('test-note', expect.objectContaining({
          progress: 75,
        }));
      });

      it('updates scanner cache with lastRead timestamp', async () => {
        const testNote = createTestNote();
        notes.set('test-note', testNote);

        mockReadFileSync.mockReturnValue(`---
title: Test Book
reading_progress: 50
---
Content`);

        await app.inject({
          method: 'PATCH',
          url: '/api/library/test-note/progress',
          payload: {
            progress: 75,
          },
        });

        expect(mockScanner.updateNote).toHaveBeenCalledWith('test-note', expect.objectContaining({
          lastRead: expect.any(String),
        }));
      });

      it('updates scanner cache with dateFinished when completing', async () => {
        const testNote = createTestNote({ progress: 95, dateFinished: null });
        notes.set('test-note', testNote);

        mockReadFileSync.mockReturnValue(`---
title: Test Book
reading_progress: 95
---
Content`);

        await app.inject({
          method: 'PATCH',
          url: '/api/library/test-note/progress',
          payload: {
            progress: 100,
          },
        });

        expect(mockScanner.updateNote).toHaveBeenCalledWith('test-note', expect.objectContaining({
          dateFinished: expect.any(String),
        }));
      });
    });
  });
});
