import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { libraryRoutes } from '../library.js';
import type { LibraryScanner } from '../../services/library-scanner.js';
import type { LiteratureNote, LiteratureNoteSummary } from '@pulp/shared';

// Mock fs module
vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

import { readFileSync, writeFileSync } from 'node:fs';

const mockReadFileSync = vi.mocked(readFileSync);
const mockWriteFileSync = vi.mocked(writeFileSync);

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
    highlights: [
      {
        id: 'h1',
        type: 'pdf',
        page: 1,
        selection: { beginIndex: 0, beginOffset: 0, endIndex: 0, endOffset: 1 },
        text: 'Highlighted text',
        category: 'highlight',
        createdAt: '2024-01-10T10:00:00Z',
      },
    ],
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

// Helper to create a test summary
function createTestSummary(overrides: Partial<LiteratureNoteSummary> = {}): LiteratureNoteSummary {
  return {
    id: 'test-note',
    title: 'Test Book',
    author: 'Test Author',
    cover: null,
    progress: 50,
    lastRead: '2024-01-15T10:00:00Z',
    sourceType: 'pdf',
    pinned: false,
    pausedAt: null,
    rating: null,
    readingStats: null,
    highlightCount: 1,
    collections: [],
    totalPages: 100,
    currentChapter: null,
    paused: false,
    citekey: null,
    dateCreated: '2024-01-01T00:00:00Z',
    dateFinished: null,
    yearCompleted: null,
    csl: null,
    ...overrides,
  };
}

// Create mock scanner
function createMockScanner(notes: Map<string, LiteratureNote> = new Map()): LibraryScanner {
  return {
    getById: vi.fn((id: string) => notes.get(id)),
    getAll: vi.fn(() => Array.from(notes.values())),
    updateNote: vi.fn(),
    scan: vi.fn(),
    refresh: vi.fn(),
    getSummaries: vi.fn((sort?: string, order?: string) => {
      const summaries = Array.from(notes.values()).map((note) =>
        createTestSummary({
          id: note.id,
          title: note.title,
          author: note.author,
          progress: note.progress,
          lastRead: note.lastRead,
          highlightCount: note.highlights.length,
        })
      );

      // Apply basic sorting for testing
      if (sort === 'title') {
        summaries.sort((a, b) => {
          const cmp = a.title.localeCompare(b.title);
          return order === 'asc' ? cmp : -cmp;
        });
      }

      return summaries;
    }),
  } as unknown as LibraryScanner;
}

describe('libraryRoutes', () => {
  let app: FastifyInstance;
  let notes: Map<string, LiteratureNote>;
  let mockScanner: LibraryScanner;

  beforeEach(async () => {
    notes = new Map();
    mockScanner = createMockScanner(notes);
    app = Fastify();
    await app.register(libraryRoutes, { scanner: mockScanner });
    vi.resetAllMocks();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('GET /api/library', () => {
    it('returns empty array when no notes exist', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/library',
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual([]);
    });

    it('returns list of note summaries', async () => {
      const note1 = createTestNote({ id: 'note-1', title: 'Book A' });
      const note2 = createTestNote({ id: 'note-2', title: 'Book B' });
      notes.set('note-1', note1);
      notes.set('note-2', note2);

      const response = await app.inject({
        method: 'GET',
        url: '/api/library',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body).toHaveLength(2);
      expect(body.map((n: LiteratureNoteSummary) => n.title)).toContain('Book A');
      expect(body.map((n: LiteratureNoteSummary) => n.title)).toContain('Book B');
    });

    it('uses default sort (lastRead desc) when no query params', async () => {
      notes.set('note-1', createTestNote({ id: 'note-1' }));

      await app.inject({
        method: 'GET',
        url: '/api/library',
      });

      expect(mockScanner.getSummaries).toHaveBeenCalledWith('lastRead', 'desc');
    });

    it('accepts sort by title ascending', async () => {
      notes.set('note-1', createTestNote({ id: 'note-1' }));

      const response = await app.inject({
        method: 'GET',
        url: '/api/library?sort=title&order=asc',
      });

      expect(response.statusCode).toBe(200);
      expect(mockScanner.getSummaries).toHaveBeenCalledWith('title', 'asc');
    });

    it('accepts sort by progress descending', async () => {
      notes.set('note-1', createTestNote({ id: 'note-1' }));

      await app.inject({
        method: 'GET',
        url: '/api/library?sort=progress&order=desc',
      });

      expect(mockScanner.getSummaries).toHaveBeenCalledWith('progress', 'desc');
    });

    it('accepts sort by dateCreated', async () => {
      notes.set('note-1', createTestNote({ id: 'note-1' }));

      await app.inject({
        method: 'GET',
        url: '/api/library?sort=dateCreated',
      });

      expect(mockScanner.getSummaries).toHaveBeenCalledWith('dateCreated', 'desc');
    });

    it('accepts sort by author', async () => {
      notes.set('note-1', createTestNote({ id: 'note-1' }));

      await app.inject({
        method: 'GET',
        url: '/api/library?sort=author',
      });

      expect(mockScanner.getSummaries).toHaveBeenCalledWith('author', 'desc');
    });

    it('accepts sort by rating', async () => {
      notes.set('note-1', createTestNote({ id: 'note-1' }));

      await app.inject({
        method: 'GET',
        url: '/api/library?sort=rating',
      });

      expect(mockScanner.getSummaries).toHaveBeenCalledWith('rating', 'desc');
    });

    it('rejects invalid sort values', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/library?sort=invalid',
      });

      expect(response.statusCode).toBe(400);
    });

    it('rejects invalid order values', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/library?order=invalid',
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('GET /api/library/:id', () => {
    it('returns note details by ID', async () => {
      const testNote = createTestNote({ id: 'test-123', title: 'My Book' });
      notes.set('test-123', testNote);

      const response = await app.inject({
        method: 'GET',
        url: '/api/library/test-123',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.id).toBe('test-123');
      expect(body.title).toBe('My Book');
      expect(body.author).toBe('Test Author');
      expect(body.progress).toBe(50);
    });

    it('returns full note object including highlights and bookmarks', async () => {
      const testNote = createTestNote({
        id: 'test-123',
        highlights: [
          { id: 'h1', type: 'pdf', page: 1, selection: { beginIndex: 0, beginOffset: 0, endIndex: 0, endOffset: 5 }, text: 'First highlight', category: 'highlight', createdAt: '2024-01-10T10:00:00Z' },
          { id: 'h2', type: 'pdf', page: 5, selection: { beginIndex: 0, beginOffset: 0, endIndex: 0, endOffset: 6 }, text: 'Second highlight', category: 'important', createdAt: '2024-01-11T10:00:00Z' },
        ],
        bookmarks: [
          { id: 'b1', page: 10, label: 'Chapter 1', createdAt: '2024-01-12T10:00:00Z' },
        ],
      });
      notes.set('test-123', testNote);

      const response = await app.inject({
        method: 'GET',
        url: '/api/library/test-123',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.highlights).toHaveLength(2);
      expect(body.bookmarks).toHaveLength(1);
    });

    it('returns 404 for non-existent note', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/library/nonexistent',
      });

      expect(response.statusCode).toBe(404);
      const body = response.json();
      expect(body.error).toBe('Note not found');
    });

    it('handles URL-encoded IDs', async () => {
      const testNote = createTestNote({ id: 'note-with-space' });
      notes.set('note-with-space', testNote);

      const response = await app.inject({
        method: 'GET',
        url: '/api/library/note-with-space',
      });

      expect(response.statusCode).toBe(200);
    });
  });

  describe('GET /api/library/:id/highlights', () => {
    it('returns highlights for a note', async () => {
      const testNote = createTestNote({
        id: 'test-123',
        highlights: [
          { id: 'h1', type: 'pdf', page: 1, selection: { beginIndex: 0, beginOffset: 0, endIndex: 0, endOffset: 5 }, text: 'First highlight', category: 'highlight', createdAt: '2024-01-10T10:00:00Z' },
          { id: 'h2', type: 'pdf', page: 5, selection: { beginIndex: 0, beginOffset: 0, endIndex: 0, endOffset: 6 }, text: 'Second highlight', category: 'important', createdAt: '2024-01-11T10:00:00Z' },
        ],
      });
      notes.set('test-123', testNote);

      const response = await app.inject({
        method: 'GET',
        url: '/api/library/test-123/highlights',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body).toHaveLength(2);
      expect(body[0].text).toBe('First highlight');
      expect(body[1].text).toBe('Second highlight');
    });

    it('returns empty array for note with no highlights', async () => {
      const testNote = createTestNote({ id: 'test-123', highlights: [] });
      notes.set('test-123', testNote);

      const response = await app.inject({
        method: 'GET',
        url: '/api/library/test-123/highlights',
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual([]);
    });

    it('returns 404 for non-existent note', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/library/nonexistent/highlights',
      });

      expect(response.statusCode).toBe(404);
      const body = response.json();
      expect(body.error).toBe('Note not found');
    });
  });

  describe('GET /api/library/:id/content', () => {
    it('returns markdown content of a note', async () => {
      const testNote = createTestNote({
        id: 'test-123',
        notePath: '/test/library/notes/test.md',
      });
      notes.set('test-123', testNote);

      const markdownContent = '---\ntitle: Test Book\n---\n\n# Chapter 1\n\nSome content here.';
      mockReadFileSync.mockReturnValue(markdownContent);

      const response = await app.inject({
        method: 'GET',
        url: '/api/library/test-123/content',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.content).toBe(markdownContent);
      expect(mockReadFileSync).toHaveBeenCalledWith('/test/library/notes/test.md', 'utf-8');
    });

    it('returns 404 for non-existent note', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/library/nonexistent/content',
      });

      expect(response.statusCode).toBe(404);
      const body = response.json();
      expect(body.error).toBe('Note not found');
    });

    it('returns 500 when file read fails', async () => {
      const testNote = createTestNote({ id: 'test-123' });
      notes.set('test-123', testNote);

      mockReadFileSync.mockImplementation(() => {
        throw new Error('ENOENT');
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/library/test-123/content',
      });

      expect(response.statusCode).toBe(500);
      const body = response.json();
      expect(body.error).toBe('Failed to read note content');
    });

    it('handles empty note content', async () => {
      const testNote = createTestNote({ id: 'test-123' });
      notes.set('test-123', testNote);

      mockReadFileSync.mockReturnValue('');

      const response = await app.inject({
        method: 'GET',
        url: '/api/library/test-123/content',
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().content).toBe('');
    });
  });

  describe('PUT /api/library/:id/content', () => {
    it('updates markdown content of a note', async () => {
      const testNote = createTestNote({
        id: 'test-123',
        notePath: '/test/library/notes/test.md',
      });
      notes.set('test-123', testNote);

      const newContent = '---\ntitle: Updated Book\n---\n\n# New Chapter\n\nUpdated content.';

      const response = await app.inject({
        method: 'PUT',
        url: '/api/library/test-123/content',
        payload: { content: newContent },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ success: true });
      expect(mockWriteFileSync).toHaveBeenCalledWith('/test/library/notes/test.md', newContent, 'utf-8');
    });

    it('calls scanner.refresh() after successful update', async () => {
      const testNote = createTestNote({ id: 'test-123' });
      notes.set('test-123', testNote);

      await app.inject({
        method: 'PUT',
        url: '/api/library/test-123/content',
        payload: { content: 'new content' },
      });

      expect(mockScanner.refresh).toHaveBeenCalled();
    });

    it('returns 404 for non-existent note', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: '/api/library/nonexistent/content',
        payload: { content: 'some content' },
      });

      expect(response.statusCode).toBe(404);
      const body = response.json();
      expect(body.error).toBe('Note not found');
    });

    it('returns 400 when content is missing', async () => {
      const testNote = createTestNote({ id: 'test-123' });
      notes.set('test-123', testNote);

      const response = await app.inject({
        method: 'PUT',
        url: '/api/library/test-123/content',
        payload: {},
      });

      expect(response.statusCode).toBe(400);
    });

    it('coerces number content to string', async () => {
      // Fastify schema coerces number to string
      const testNote = createTestNote({ id: 'test-123' });
      notes.set('test-123', testNote);

      const response = await app.inject({
        method: 'PUT',
        url: '/api/library/test-123/content',
        payload: { content: 123 },
      });

      expect(response.statusCode).toBe(200);
      expect(mockWriteFileSync).toHaveBeenCalledWith(expect.any(String), '123', 'utf-8');
    });

    it('returns 400 when content is an object', async () => {
      const testNote = createTestNote({ id: 'test-123' });
      notes.set('test-123', testNote);

      const response = await app.inject({
        method: 'PUT',
        url: '/api/library/test-123/content',
        payload: { content: { nested: 'object' } },
      });

      expect(response.statusCode).toBe(400);
    });

    it('returns 500 when file write fails', async () => {
      const testNote = createTestNote({ id: 'test-123' });
      notes.set('test-123', testNote);

      mockWriteFileSync.mockImplementation(() => {
        throw new Error('EACCES');
      });

      const response = await app.inject({
        method: 'PUT',
        url: '/api/library/test-123/content',
        payload: { content: 'new content' },
      });

      expect(response.statusCode).toBe(500);
      const body = response.json();
      expect(body.error).toBe('Failed to write note content');
    });

    it('does not call refresh when write fails', async () => {
      const testNote = createTestNote({ id: 'test-123' });
      notes.set('test-123', testNote);

      mockWriteFileSync.mockImplementation(() => {
        throw new Error('EACCES');
      });

      await app.inject({
        method: 'PUT',
        url: '/api/library/test-123/content',
        payload: { content: 'new content' },
      });

      expect(mockScanner.refresh).not.toHaveBeenCalled();
    });

    it('accepts empty string as valid content', async () => {
      const testNote = createTestNote({ id: 'test-123' });
      notes.set('test-123', testNote);

      const response = await app.inject({
        method: 'PUT',
        url: '/api/library/test-123/content',
        payload: { content: '' },
      });

      expect(response.statusCode).toBe(200);
      expect(mockWriteFileSync).toHaveBeenCalledWith(expect.any(String), '', 'utf-8');
    });

    it('handles unicode content correctly', async () => {
      const testNote = createTestNote({ id: 'test-123' });
      notes.set('test-123', testNote);

      const unicodeContent = '# 日本語タイトル\n\n内容は日本語で書かれています。\n\n🎉 emoji test';

      const response = await app.inject({
        method: 'PUT',
        url: '/api/library/test-123/content',
        payload: { content: unicodeContent },
      });

      expect(response.statusCode).toBe(200);
      expect(mockWriteFileSync).toHaveBeenCalledWith(expect.any(String), unicodeContent, 'utf-8');
    });
  });
});
