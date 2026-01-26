import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { bookNotesRoutes } from '../book-notes.js';
import type { LibraryScanner } from '../../services/library-scanner.js';
import type { Config } from '../../config/schema.js';
import type { LiteratureNote } from '@pulp/shared';

// Mock fs module
vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

// Mock gray-matter
vi.mock('gray-matter', () => ({
  default: vi.fn(),
}));

import { readFileSync, writeFileSync } from 'node:fs';
import matter from 'gray-matter';

const mockReadFileSync = vi.mocked(readFileSync);
const mockWriteFileSync = vi.mocked(writeFileSync);
const mockMatter = vi.mocked(matter);

describe('Book Notes Routes', () => {
  let fastify: ReturnType<typeof Fastify>;
  let mockScanner: LibraryScanner;
  let mockConfig: Config;
  let mockNote: LiteratureNote;

  beforeEach(async () => {
    vi.clearAllMocks();

    mockNote = {
      id: 'test-note-id',
      title: 'Test Book',
      author: 'Test Author',
      source: '/vault/books/test.pdf',
      sourceRelative: 'books/test.pdf',
      sourceType: 'pdf',
      filePath: '/vault/books/test.pdf',
      notePath: '/vault/notes/test.md',
      progress: 50,
      lastRead: '2024-01-15T10:00:00.000Z',
      lastOpenedCfi: null,
      dateCreated: '2024-01-01T00:00:00.000Z',
      dateFinished: null,
      collections: [],
      tags: [],
      cover: null,
      highlights: [],
      bookmarks: [],
      pinned: false,
      rating: null,
      readingStats: null,
      totalPages: 200,
      readerPreferences: null,
      currentChapter: null,
      bookNotes: 'My original notes about this book.',
      paused: false,
      pausedAt: null,
      frontmatter: {},
    };

    mockScanner = {
      getById: vi.fn().mockReturnValue(mockNote),
      updateNote: vi.fn(),
    } as unknown as LibraryScanner;

    mockConfig = {
      book_notes_key: 'book_notes',
      paused_key: 'paused',
      paused_at_key: 'paused_at',
    } as Config;

    fastify = Fastify();
    await fastify.register(bookNotesRoutes, { scanner: mockScanner, config: mockConfig });
    await fastify.ready();
  });

  describe('GET /api/library/:id/notes', () => {
    it('returns book notes when they exist', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library/test-note-id/notes',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.notes).toBe('My original notes about this book.');
    });

    it('returns null when no notes exist', async () => {
      mockNote.bookNotes = null;

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library/test-note-id/notes',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.notes).toBeNull();
    });

    it('returns 404 for non-existent note', async () => {
      (mockScanner.getById as ReturnType<typeof vi.fn>).mockReturnValue(undefined);

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library/non-existent/notes',
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('PATCH /api/library/:id/notes', () => {
    beforeEach(() => {
      mockReadFileSync.mockReturnValue('---\ntitle: Test\n---\nContent');
      mockMatter.mockReturnValue({
        data: { title: 'Test' },
        content: 'Content',
      } as any);
      (mockMatter as any).stringify = vi.fn().mockReturnValue('---\ntitle: Test\nbook_notes: New notes\n---\nContent');
    });

    it('updates book notes successfully', async () => {
      const response = await fastify.inject({
        method: 'PATCH',
        url: '/api/library/test-note-id/notes',
        payload: { notes: 'New notes about this book.' },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.notes).toBe('New notes about this book.');
      expect(mockScanner.updateNote).toHaveBeenCalledWith('test-note-id', { bookNotes: 'New notes about this book.' });
    });

    it('clears notes when set to null', async () => {
      const response = await fastify.inject({
        method: 'PATCH',
        url: '/api/library/test-note-id/notes',
        payload: { notes: null },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.notes).toBeNull();
      expect(mockScanner.updateNote).toHaveBeenCalledWith('test-note-id', { bookNotes: null });
    });

    it('clears notes when set to empty string', async () => {
      const response = await fastify.inject({
        method: 'PATCH',
        url: '/api/library/test-note-id/notes',
        payload: { notes: '   ' },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.notes).toBeNull();
      expect(mockScanner.updateNote).toHaveBeenCalledWith('test-note-id', { bookNotes: null });
    });

    it('trims whitespace from notes', async () => {
      const response = await fastify.inject({
        method: 'PATCH',
        url: '/api/library/test-note-id/notes',
        payload: { notes: '  Trimmed notes  ' },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.notes).toBe('Trimmed notes');
      expect(mockScanner.updateNote).toHaveBeenCalledWith('test-note-id', { bookNotes: 'Trimmed notes' });
    });

    it('returns 404 for non-existent note', async () => {
      (mockScanner.getById as ReturnType<typeof vi.fn>).mockReturnValue(undefined);

      const response = await fastify.inject({
        method: 'PATCH',
        url: '/api/library/non-existent/notes',
        payload: { notes: 'Some notes' },
      });

      expect(response.statusCode).toBe(404);
    });

    it('writes updated frontmatter to file', async () => {
      await fastify.inject({
        method: 'PATCH',
        url: '/api/library/test-note-id/notes',
        payload: { notes: 'New notes' },
      });

      expect(mockReadFileSync).toHaveBeenCalledWith('/vault/notes/test.md', 'utf-8');
      expect(mockWriteFileSync).toHaveBeenCalledWith(
        '/vault/notes/test.md',
        expect.any(String),
        'utf-8'
      );
    });
  });
});
