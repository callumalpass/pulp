import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { bookNotesRoutes } from '../book-notes.js';
import type { LibraryScanner } from '../../services/library-scanner.js';
import type { Config } from '../../config/schema.js';
import type { LiteratureNote } from '@pulp/shared';

// Mock file-lock module
vi.mock('../../services/file-lock.js', () => ({
  atomicFrontmatterUpdate: vi.fn(async (_filePath: string, modifier: Function) => {
    const parsed = { frontmatter: {}, content: '' };
    return modifier(parsed);
  }),
}));

import { atomicFrontmatterUpdate } from '../../services/file-lock.js';

const mockAtomicFrontmatterUpdate = vi.mocked(atomicFrontmatterUpdate);

function createMockNote(overrides: Partial<LiteratureNote> = {}): LiteratureNote {
  return {
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
    ...overrides,
  };
}

describe('Book Notes Routes', () => {
  let fastify: ReturnType<typeof Fastify>;
  let mockScanner: LibraryScanner;
  let mockConfig: Config;
  let mockNote: LiteratureNote;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Restore default mock implementation after clearAllMocks resets it
    mockAtomicFrontmatterUpdate.mockImplementation(async (_filePath, modifier) => {
      const parsed = { frontmatter: {} as Record<string, unknown>, content: '' };
      return modifier(parsed);
    });

    mockNote = createMockNote();

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
      const body = JSON.parse(response.payload);
      expect(body.error).toBe('Note not found');
    });

    it('looks up note by the id param', async () => {
      await fastify.inject({
        method: 'GET',
        url: '/api/library/my-custom-id/notes',
      });

      expect(mockScanner.getById).toHaveBeenCalledWith('my-custom-id');
    });
  });

  describe('PATCH /api/library/:id/notes', () => {
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
    });

    it('updates in-memory cache after successful write', async () => {
      await fastify.inject({
        method: 'PATCH',
        url: '/api/library/test-note-id/notes',
        payload: { notes: 'Cached notes' },
      });

      expect(mockScanner.updateNote).toHaveBeenCalledWith('test-note-id', { bookNotes: 'Cached notes' });
    });

    it('calls atomicFrontmatterUpdate with the note file path', async () => {
      await fastify.inject({
        method: 'PATCH',
        url: '/api/library/test-note-id/notes',
        payload: { notes: 'Some notes' },
      });

      expect(mockAtomicFrontmatterUpdate).toHaveBeenCalledWith(
        '/vault/notes/test.md',
        expect.any(Function)
      );
    });

    it('sets the configured book_notes_key in frontmatter', async () => {
      const capturedFrontmatter: Record<string, unknown> = { title: 'Test' };
      mockAtomicFrontmatterUpdate.mockImplementation(async (_filePath, modifier) => {
        return modifier({ frontmatter: capturedFrontmatter, content: '' });
      });

      await fastify.inject({
        method: 'PATCH',
        url: '/api/library/test-note-id/notes',
        payload: { notes: 'My notes' },
      });

      expect(capturedFrontmatter.book_notes).toBe('My notes');
    });

    it('deletes the book_notes_key from frontmatter when clearing notes', async () => {
      const capturedFrontmatter: Record<string, unknown> = { title: 'Test', book_notes: 'Old notes' };
      mockAtomicFrontmatterUpdate.mockImplementation(async (_filePath, modifier) => {
        return modifier({ frontmatter: capturedFrontmatter, content: '' });
      });

      await fastify.inject({
        method: 'PATCH',
        url: '/api/library/test-note-id/notes',
        payload: { notes: null },
      });

      expect(capturedFrontmatter).not.toHaveProperty('book_notes');
    });

    it('uses the config book_notes_key for frontmatter operations', async () => {
      const customFastify = Fastify();
      const customConfig = { ...mockConfig, book_notes_key: 'my_custom_notes' } as Config;
      await customFastify.register(bookNotesRoutes, { scanner: mockScanner, config: customConfig });
      await customFastify.ready();

      const capturedFrontmatter: Record<string, unknown> = { title: 'Test' };
      mockAtomicFrontmatterUpdate.mockImplementation(async (_filePath, modifier) => {
        return modifier({ frontmatter: capturedFrontmatter, content: '' });
      });

      await customFastify.inject({
        method: 'PATCH',
        url: '/api/library/test-note-id/notes',
        payload: { notes: 'Custom key notes' },
      });

      expect(capturedFrontmatter.my_custom_notes).toBe('Custom key notes');
      expect(capturedFrontmatter).not.toHaveProperty('book_notes');
    });

    describe('trimming and normalization', () => {
      it('trims leading and trailing whitespace', async () => {
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

      it('treats whitespace-only string as null', async () => {
        const response = await fastify.inject({
          method: 'PATCH',
          url: '/api/library/test-note-id/notes',
          payload: { notes: '   ' },
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.payload);
        expect(body.notes).toBeNull();
        expect(mockScanner.updateNote).toHaveBeenCalledWith('test-note-id', { bookNotes: null });
      });

      it('treats tabs and newlines-only as null', async () => {
        const response = await fastify.inject({
          method: 'PATCH',
          url: '/api/library/test-note-id/notes',
          payload: { notes: '\t\n\r\n  ' },
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.payload);
        expect(body.notes).toBeNull();
      });

      it('preserves internal whitespace and newlines', async () => {
        const notes = 'Line 1\n\nLine 3\n\tIndented';
        const response = await fastify.inject({
          method: 'PATCH',
          url: '/api/library/test-note-id/notes',
          payload: { notes },
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.payload);
        expect(body.notes).toBe(notes);
      });
    });

    describe('clearing notes', () => {
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
          payload: { notes: '' },
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.payload);
        expect(body.notes).toBeNull();
      });

      it('deletes frontmatter key when clearing notes', async () => {
        const capturedFrontmatter: Record<string, unknown> = { title: 'Test', book_notes: 'Old notes' };
        mockAtomicFrontmatterUpdate.mockImplementation(async (_filePath, modifier) => {
          return modifier({ frontmatter: capturedFrontmatter, content: '' });
        });

        await fastify.inject({
          method: 'PATCH',
          url: '/api/library/test-note-id/notes',
          payload: { notes: null },
        });

        expect(capturedFrontmatter).not.toHaveProperty('book_notes');
      });
    });

    describe('MAX_NOTES_LENGTH validation', () => {
      it('accepts notes at exactly the 50000 character limit', async () => {
        const notes = 'A'.repeat(50000);
        const response = await fastify.inject({
          method: 'PATCH',
          url: '/api/library/test-note-id/notes',
          payload: { notes },
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.payload);
        expect(body.success).toBe(true);
      });

      it('rejects notes exceeding the 50000 character limit', async () => {
        const notes = 'A'.repeat(50001);
        const response = await fastify.inject({
          method: 'PATCH',
          url: '/api/library/test-note-id/notes',
          payload: { notes },
        });

        expect(response.statusCode).toBe(400);
      });

      it('does not write to file when validation fails', async () => {
        const notes = 'A'.repeat(50001);
        await fastify.inject({
          method: 'PATCH',
          url: '/api/library/test-note-id/notes',
          payload: { notes },
        });

        expect(mockAtomicFrontmatterUpdate).not.toHaveBeenCalled();
        expect(mockScanner.updateNote).not.toHaveBeenCalled();
      });
    });

    describe('schema validation', () => {
      it('rejects request without notes field', async () => {
        const response = await fastify.inject({
          method: 'PATCH',
          url: '/api/library/test-note-id/notes',
          payload: {},
        });

        expect(response.statusCode).toBe(400);
      });

      it('coerces numeric notes to string', async () => {
        // Fastify's default Ajv config coerces compatible types
        const response = await fastify.inject({
          method: 'PATCH',
          url: '/api/library/test-note-id/notes',
          payload: { notes: 42 },
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.payload);
        expect(body.notes).toBe('42');
      });

      it('rejects request with array notes value', async () => {
        const response = await fastify.inject({
          method: 'PATCH',
          url: '/api/library/test-note-id/notes',
          payload: { notes: ['note1', 'note2'] },
        });

        expect(response.statusCode).toBe(400);
      });
    });

    describe('error handling', () => {
      it('returns 404 for non-existent note', async () => {
        (mockScanner.getById as ReturnType<typeof vi.fn>).mockReturnValue(undefined);

        const response = await fastify.inject({
          method: 'PATCH',
          url: '/api/library/non-existent/notes',
          payload: { notes: 'Some notes' },
        });

        expect(response.statusCode).toBe(404);
        const body = JSON.parse(response.payload);
        expect(body.error).toBe('Note not found');
      });

      it('does not call atomicFrontmatterUpdate for non-existent note', async () => {
        (mockScanner.getById as ReturnType<typeof vi.fn>).mockReturnValue(undefined);

        await fastify.inject({
          method: 'PATCH',
          url: '/api/library/non-existent/notes',
          payload: { notes: 'Some notes' },
        });

        expect(mockAtomicFrontmatterUpdate).not.toHaveBeenCalled();
      });

      it('returns 500 when atomicFrontmatterUpdate throws', async () => {
        mockAtomicFrontmatterUpdate.mockRejectedValue(new Error('Disk write failed'));

        const response = await fastify.inject({
          method: 'PATCH',
          url: '/api/library/test-note-id/notes',
          payload: { notes: 'Some notes' },
        });

        expect(response.statusCode).toBe(500);
        const body = JSON.parse(response.payload);
        expect(body.error).toBe('Failed to update book notes');
      });

      it('does not update cache when atomicFrontmatterUpdate throws', async () => {
        mockAtomicFrontmatterUpdate.mockRejectedValue(new Error('Disk write failed'));

        await fastify.inject({
          method: 'PATCH',
          url: '/api/library/test-note-id/notes',
          payload: { notes: 'Some notes' },
        });

        expect(mockScanner.updateNote).not.toHaveBeenCalled();
      });
    });

    describe('edge cases', () => {
      it('handles unicode notes correctly', async () => {
        const notes = 'こんにちは世界 📚 — "quotes" & ampersand';
        const response = await fastify.inject({
          method: 'PATCH',
          url: '/api/library/test-note-id/notes',
          payload: { notes },
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.payload);
        expect(body.notes).toBe(notes);
      });

      it('handles multiline markdown notes', async () => {
        const notes = '# My Notes\n\n- Point 1\n- Point 2\n\n> A great quote';
        const response = await fastify.inject({
          method: 'PATCH',
          url: '/api/library/test-note-id/notes',
          payload: { notes },
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.payload);
        expect(body.notes).toBe(notes);
      });

      it('handles notes with only a single character', async () => {
        const response = await fastify.inject({
          method: 'PATCH',
          url: '/api/library/test-note-id/notes',
          payload: { notes: 'x' },
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.payload);
        expect(body.notes).toBe('x');
      });
    });
  });
});
