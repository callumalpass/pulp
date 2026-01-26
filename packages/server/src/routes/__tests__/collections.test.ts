import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { collectionsRoutes } from '../collections.js';
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

describe('collections routes', () => {
  let fastify: FastifyInstance;
  let mockScanner: LibraryScanner;
  let testNotes: Map<string, LiteratureNote>;

  beforeEach(async () => {
    vi.clearAllMocks();

    testNotes = new Map();
    testNotes.set('note1', createTestNote({
      id: 'note1',
      title: 'Book 1',
      collections: ['Fiction', 'Favorites'],
    }));
    testNotes.set('note2', createTestNote({
      id: 'note2',
      title: 'Book 2',
      collections: ['Non-Fiction', 'Favorites'],
    }));
    testNotes.set('note3', createTestNote({
      id: 'note3',
      title: 'Book 3',
      collections: [],
    }));

    mockScanner = createMockScanner(testNotes);

    fastify = Fastify({ logger: false });
    await fastify.register(collectionsRoutes, {
      scanner: mockScanner,
      config: testConfig,
    });

    await fastify.ready();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fastify.close();
  });

  describe('GET /api/collections', () => {
    it('returns all unique collections across the library', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/collections',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.collections).toEqual(['Favorites', 'Fiction', 'Non-Fiction']);
    });

    it('returns empty array when no collections exist', async () => {
      testNotes.forEach(note => {
        note.collections = [];
      });

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/collections',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.collections).toEqual([]);
    });

    it('sorts collections alphabetically', async () => {
      testNotes.get('note1')!.collections = ['Zebra', 'Apple', 'Banana'];

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/collections',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.collections[0]).toBe('Apple');
      expect(body.collections[body.collections.length - 1]).toBe('Zebra');
    });
  });

  describe('PATCH /api/library/:id/collections', () => {
    beforeEach(() => {
      mockReadFileSync.mockReturnValue(`---
title: Test Book
collections:
  - OldCollection
---

# Notes
`);
    });

    it('updates collections for a note', async () => {
      const response = await fastify.inject({
        method: 'PATCH',
        url: '/api/library/note1/collections',
        payload: {
          collections: ['New Collection', 'Another One'],
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.collections).toEqual(['New Collection', 'Another One']);

      // Verify file was written
      expect(mockWriteFileSync).toHaveBeenCalled();
      const writtenContent = mockWriteFileSync.mock.calls[0][1] as string;
      expect(writtenContent).toContain('New Collection');
      expect(writtenContent).toContain('Another One');
    });

    it('trims whitespace from collection names', async () => {
      const response = await fastify.inject({
        method: 'PATCH',
        url: '/api/library/note1/collections',
        payload: {
          collections: ['  Trimmed  ', '  Another  '],
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.collections).toEqual(['Trimmed', 'Another']);
    });

    it('filters out empty collection names', async () => {
      const response = await fastify.inject({
        method: 'PATCH',
        url: '/api/library/note1/collections',
        payload: {
          collections: ['Valid', '', '  ', 'Also Valid'],
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.collections).toEqual(['Valid', 'Also Valid']);
    });

    it('removes collections key when setting to empty array', async () => {
      const response = await fastify.inject({
        method: 'PATCH',
        url: '/api/library/note1/collections',
        payload: {
          collections: [],
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.collections).toEqual([]);

      // Verify the collections key was removed from frontmatter
      expect(mockWriteFileSync).toHaveBeenCalled();
      const writtenContent = mockWriteFileSync.mock.calls[0][1] as string;
      expect(writtenContent).not.toContain('collections:');
    });

    it('returns 404 for non-existent note', async () => {
      const response = await fastify.inject({
        method: 'PATCH',
        url: '/api/library/nonexistent/collections',
        payload: {
          collections: ['Test'],
        },
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Note not found');
    });

    it('requires collections array in body', async () => {
      const response = await fastify.inject({
        method: 'PATCH',
        url: '/api/library/note1/collections',
        payload: {},
      });

      expect(response.statusCode).toBe(400);
    });

    it('updates in-memory cache after successful update', async () => {
      await fastify.inject({
        method: 'PATCH',
        url: '/api/library/note1/collections',
        payload: {
          collections: ['Updated'],
        },
      });

      expect(mockScanner.updateNote).toHaveBeenCalledWith('note1', {
        collections: ['Updated'],
      });
    });

    it('preserves other frontmatter when updating collections', async () => {
      mockReadFileSync.mockReturnValue(`---
title: My Book
author: Author Name
rating: 5
collections:
  - OldCollection
---

# Notes
Some content here.
`);

      await fastify.inject({
        method: 'PATCH',
        url: '/api/library/note1/collections',
        payload: {
          collections: ['NewCollection'],
        },
      });

      const writtenContent = mockWriteFileSync.mock.calls[0][1] as string;
      expect(writtenContent).toContain('title: My Book');
      expect(writtenContent).toContain('author: Author Name');
      expect(writtenContent).toContain('rating: 5');
      expect(writtenContent).toContain('NewCollection');
      expect(writtenContent).toContain('Some content here.');
    });
  });
});
