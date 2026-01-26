import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { Readable } from 'node:stream';
import { filesRoutes } from '../files.js';
import type { LibraryScanner } from '../../services/library-scanner.js';
import type { LiteratureNote } from '@pulp/shared';

// Mock fs module
vi.mock('node:fs', () => ({
  statSync: vi.fn(),
  createReadStream: vi.fn(),
}));

import { statSync, createReadStream } from 'node:fs';

const mockStatSync = vi.mocked(statSync);
const mockCreateReadStream = vi.mocked(createReadStream);

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
    updateNote: vi.fn(),
    scan: vi.fn(),
    refresh: vi.fn(),
    getSummaries: vi.fn(),
  } as unknown as LibraryScanner;
}

describe('filesRoutes', () => {
  let app: FastifyInstance;
  let notes: Map<string, LiteratureNote>;
  let mockScanner: LibraryScanner;

  beforeEach(async () => {
    notes = new Map();
    mockScanner = createMockScanner(notes);
    app = Fastify();
    await app.register(filesRoutes, { scanner: mockScanner });
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('GET /api/files/:id', () => {
    describe('range request validation', () => {
      beforeEach(() => {
        const testNote = createTestNote();
        notes.set('test-note', testNote);

        // Mock file stats - 10000 bytes file
        mockStatSync.mockReturnValue({
          size: 10000,
          isFile: () => true,
        } as any);

        // Mock read stream
        mockCreateReadStream.mockReturnValue(
          Readable.from(Buffer.alloc(100)) as any
        );
      });

      it('handles valid range request', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/api/files/test-note',
          headers: {
            range: 'bytes=0-499',
          },
        });

        expect(response.statusCode).toBe(206);
        expect(response.headers['content-range']).toBe('bytes 0-499/10000');
        expect(response.headers['content-length']).toBe('500');
      });

      it('handles open-ended range (start only)', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/api/files/test-note',
          headers: {
            range: 'bytes=5000-',
          },
        });

        expect(response.statusCode).toBe(206);
        expect(response.headers['content-range']).toBe('bytes 5000-9999/10000');
      });

      it('handles suffix range (last N bytes)', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/api/files/test-note',
          headers: {
            range: 'bytes=-500',
          },
        });

        expect(response.statusCode).toBe(206);
        expect(response.headers['content-range']).toBe('bytes 9500-9999/10000');
        expect(response.headers['content-length']).toBe('500');
      });

      it('rejects invalid range with empty start and end', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/api/files/test-note',
          headers: {
            range: 'bytes=-',
          },
        });

        expect(response.statusCode).toBe(416);
        const body = response.json();
        expect(body.error).toBe('Invalid range');
      });

      it('rejects range with start beyond file size', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/api/files/test-note',
          headers: {
            range: 'bytes=15000-16000',
          },
        });

        expect(response.statusCode).toBe(416);
        const body = response.json();
        expect(body.error).toBe('Range not satisfiable');
        expect(body.message).toContain('15000');
        expect(body.message).toContain('10000');
      });

      it('rejects range with start greater than end', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/api/files/test-note',
          headers: {
            range: 'bytes=500-100',
          },
        });

        expect(response.statusCode).toBe(416);
        const body = response.json();
        expect(body.error).toBe('Invalid range');
        expect(body.message).toContain('greater than');
      });

      it('handles malformed range with extra dash', async () => {
        // The range "bytes=-10-500" splits to ["-10", "500"]
        // The start "-10" parses to NaN, which triggers invalid range
        const response = await app.inject({
          method: 'GET',
          url: '/api/files/test-note',
          headers: {
            range: 'bytes=abc-500',
          },
        });

        expect(response.statusCode).toBe(416);
        const body = response.json();
        expect(body.error).toBe('Invalid range');
      });

      it('rejects non-numeric range values', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/api/files/test-note',
          headers: {
            range: 'bytes=abc-def',
          },
        });

        expect(response.statusCode).toBe(416);
        const body = response.json();
        expect(body.error).toBe('Invalid range');
      });

      it('rejects suffix range with zero length', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/api/files/test-note',
          headers: {
            range: 'bytes=-0',
          },
        });

        expect(response.statusCode).toBe(416);
        const body = response.json();
        expect(body.error).toBe('Invalid range');
        expect(body.message).toContain('positive');
      });

      it('clamps end position to file size', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/api/files/test-note',
          headers: {
            range: 'bytes=9000-99999',
          },
        });

        expect(response.statusCode).toBe(206);
        // End should be clamped to 9999 (file size - 1)
        expect(response.headers['content-range']).toBe('bytes 9000-9999/10000');
        expect(response.headers['content-length']).toBe('1000');
      });

      it('handles range at file boundary', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/api/files/test-note',
          headers: {
            range: 'bytes=9999-9999',
          },
        });

        expect(response.statusCode).toBe(206);
        expect(response.headers['content-range']).toBe('bytes 9999-9999/10000');
        expect(response.headers['content-length']).toBe('1');
      });

      it('returns full file without range header', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/api/files/test-note',
        });

        expect(response.statusCode).toBe(200);
        expect(response.headers['content-length']).toBe('10000');
        expect(response.headers['accept-ranges']).toBe('bytes');
      });

      it('returns correct MIME type for PDF', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/api/files/test-note',
        });

        expect(response.headers['content-type']).toBe('application/pdf');
      });

      it('returns correct MIME type for EPUB', async () => {
        const epubNote = createTestNote({
          id: 'epub-note',
          filePath: '/test/library/books/test.epub',
          sourceType: 'epub',
        });
        notes.set('epub-note', epubNote);

        const response = await app.inject({
          method: 'GET',
          url: '/api/files/epub-note',
        });

        expect(response.headers['content-type']).toBe('application/epub+zip');
      });
    });

    describe('error handling', () => {
      it('returns 404 for non-existent note', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/api/files/nonexistent',
        });

        expect(response.statusCode).toBe(404);
        const body = response.json();
        expect(body.error).toBe('Note not found');
      });

      it('returns 404 when source file is missing', async () => {
        const testNote = createTestNote();
        notes.set('test-note', testNote);

        mockStatSync.mockImplementation(() => {
          throw new Error('ENOENT');
        });

        const response = await app.inject({
          method: 'GET',
          url: '/api/files/test-note',
        });

        expect(response.statusCode).toBe(404);
        const body = response.json();
        expect(body.error).toBe('Source file not found');
      });
    });
  });
});
