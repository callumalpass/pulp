import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { highlightsRoutes } from '../highlights.js';
import type { LibraryScanner } from '../../services/library-scanner.js';
import type { HighlightWriter } from '../../services/highlight-writer.js';
import type { LiteratureNote, PDFHighlight, EPUBHighlight } from '@pulp/shared';

// Test fixtures
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

const samplePDFHighlight: PDFHighlight = {
  id: 'h1',
  type: 'pdf',
  page: 42,
  pageLabel: 'xlii',
  selection: { beginIndex: 0, beginOffset: 5, endIndex: 0, endOffset: 50 },
  text: 'This is highlighted text from the PDF.',
  note: 'My annotation',
  category: 'important',
  createdAt: '2024-01-15T10:30:00Z',
};

const sampleEPUBHighlight: EPUBHighlight = {
  id: 'h2',
  type: 'epub',
  cfi: 'epubcfi(/6/4!/4/2/1:0)',
  text: 'This is highlighted text from the EPUB.',
  note: 'Another annotation',
  category: 'question',
  createdAt: '2024-01-16T14:00:00Z',
};

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

// Create mock highlight writer
function createMockHighlightWriter(): HighlightWriter {
  return {
    write: vi.fn().mockImplementation(async (_note, request) => ({
      id: 'new-highlight-id',
      type: request.type,
      page: request.page,
      pageLabel: request.pageLabel,
      selection: request.selection,
      cfi: request.cfi,
      text: request.text,
      note: request.note,
      category: request.category || 'highlight',
      createdAt: new Date().toISOString(),
    })),
    update: vi.fn().mockImplementation(async (note, highlightId, request) => {
      const highlight = note.highlights.find((h: PDFHighlight | EPUBHighlight) => h.id === highlightId);
      if (!highlight) return null;
      return { ...highlight, ...request, updatedAt: new Date().toISOString() };
    }),
    delete: vi.fn().mockResolvedValue(true),
  } as unknown as HighlightWriter;
}

describe('highlights routes', () => {
  let fastify: FastifyInstance;
  let mockScanner: LibraryScanner;
  let mockHighlightWriter: HighlightWriter;
  let testNotes: Map<string, LiteratureNote>;

  beforeEach(async () => {
    vi.clearAllMocks();

    testNotes = new Map();
    const testNote = createTestNote({
      highlights: [samplePDFHighlight, sampleEPUBHighlight],
    });
    testNotes.set('test-note', testNote);

    mockScanner = createMockScanner(testNotes);
    mockHighlightWriter = createMockHighlightWriter();

    fastify = Fastify({ logger: false });
    await fastify.register(highlightsRoutes, {
      scanner: mockScanner,
      highlightWriter: mockHighlightWriter,
    });

    await fastify.ready();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fastify.close();
  });

  describe('POST /api/library/:id/highlights', () => {
    it('creates a new PDF highlight', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/api/library/test-note/highlights',
        payload: {
          type: 'pdf',
          page: 10,
          selection: { beginIndex: 0, beginOffset: 0, endIndex: 0, endOffset: 20 },
          text: 'New highlight text',
          note: 'A note',
          category: 'highlight',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.highlight).toBeDefined();
      expect(body.highlight.type).toBe('pdf');
      expect(mockHighlightWriter.write).toHaveBeenCalled();
    });

    it('creates a new EPUB highlight', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/api/library/test-note/highlights',
        payload: {
          type: 'epub',
          cfi: 'epubcfi(/6/4!/4/2/1:0)',
          text: 'New EPUB highlight',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.highlight.type).toBe('epub');
    });

    it('rejects PDF highlight without page', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/api/library/test-note/highlights',
        payload: {
          type: 'pdf',
          selection: { beginIndex: 0, beginOffset: 0, endIndex: 0, endOffset: 20 },
          text: 'Highlight without page',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toContain('page');
    });

    it('rejects EPUB highlight without cfi', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/api/library/test-note/highlights',
        payload: {
          type: 'epub',
          text: 'Highlight without CFI',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toContain('cfi');
    });

    it('returns 404 for non-existent note', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/api/library/nonexistent/highlights',
        payload: {
          type: 'pdf',
          page: 10,
          selection: { beginIndex: 0, beginOffset: 0, endIndex: 0, endOffset: 20 },
          text: 'Some text',
        },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('PATCH /api/library/:id/highlights/:highlightId', () => {
    it('updates a highlight note', async () => {
      const response = await fastify.inject({
        method: 'PATCH',
        url: '/api/library/test-note/highlights/h1',
        payload: {
          note: 'Updated annotation',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(mockHighlightWriter.update).toHaveBeenCalled();
    });

    it('returns 404 for non-existent highlight', async () => {
      vi.mocked(mockHighlightWriter.update).mockResolvedValueOnce(null);

      const response = await fastify.inject({
        method: 'PATCH',
        url: '/api/library/test-note/highlights/nonexistent',
        payload: {
          note: 'Updated annotation',
        },
      });

      expect(response.statusCode).toBe(404);
    });

    it('returns 404 for non-existent note', async () => {
      const response = await fastify.inject({
        method: 'PATCH',
        url: '/api/library/nonexistent/highlights/h1',
        payload: {
          note: 'Updated annotation',
        },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('DELETE /api/library/:id/highlights/:highlightId', () => {
    it('deletes a highlight', async () => {
      const response = await fastify.inject({
        method: 'DELETE',
        url: '/api/library/test-note/highlights/h1',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(mockHighlightWriter.delete).toHaveBeenCalled();
    });

    it('returns 404 for non-existent highlight', async () => {
      const response = await fastify.inject({
        method: 'DELETE',
        url: '/api/library/test-note/highlights/nonexistent',
      });

      expect(response.statusCode).toBe(404);
    });

    it('returns 404 for non-existent note', async () => {
      const response = await fastify.inject({
        method: 'DELETE',
        url: '/api/library/nonexistent/highlights/h1',
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('GET /api/library/:id/highlights/export', () => {
    it('exports highlights as markdown', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library/test-note/highlights/export?format=markdown',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.content).toContain('# Highlights');
      expect(body.content).toContain(samplePDFHighlight.text);
      expect(body.content).toContain(sampleEPUBHighlight.text);
      expect(body.filename).toContain('.md');
      expect(body.mimeType).toBe('text/markdown');
    });

    it('exports highlights as JSON', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library/test-note/highlights/export?format=json',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      const exported = JSON.parse(body.content);
      expect(exported.title).toBe('Test Book');
      expect(exported.highlights).toHaveLength(2);
      expect(exported.highlightCount).toBe(2);
      expect(body.mimeType).toBe('application/json');
    });

    it('exports highlights as CSV', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library/test-note/highlights/export?format=csv',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.content).toContain('Text,Type,Location');
      expect(body.content).toContain(samplePDFHighlight.text);
      expect(body.mimeType).toBe('text/csv');
    });

    it('exports highlights as plaintext', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library/test-note/highlights/export?format=plaintext',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.content).toContain('HIGHLIGHTS FROM:');
      expect(body.content).toContain(samplePDFHighlight.text);
      expect(body.mimeType).toBe('text/plain');
    });

    it('respects includeNotes option', async () => {
      const withNotes = await fastify.inject({
        method: 'GET',
        url: '/api/library/test-note/highlights/export?format=markdown&includeNotes=true',
      });
      expect(JSON.parse(withNotes.body).content).toContain(samplePDFHighlight.note);

      const withoutNotes = await fastify.inject({
        method: 'GET',
        url: '/api/library/test-note/highlights/export?format=markdown&includeNotes=false',
      });
      expect(JSON.parse(withoutNotes.body).content).not.toContain('**Note:**');
    });

    it('respects includeCategories option', async () => {
      const withCategories = await fastify.inject({
        method: 'GET',
        url: '/api/library/test-note/highlights/export?format=markdown&includeCategories=true',
      });
      expect(JSON.parse(withCategories.body).content).toContain('[Important]');

      const withoutCategories = await fastify.inject({
        method: 'GET',
        url: '/api/library/test-note/highlights/export?format=markdown&includeCategories=false',
      });
      expect(JSON.parse(withoutCategories.body).content).not.toContain('[Important]');
    });

    it('groups by category when requested', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library/test-note/highlights/export?format=markdown&groupByCategory=true',
      });

      const body = JSON.parse(response.body);
      expect(body.content).toContain('## Important');
      expect(body.content).toContain('## Question');
    });

    it('returns 400 for note with no highlights', async () => {
      testNotes.set('empty-note', createTestNote({ id: 'empty-note', highlights: [] }));

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library/empty-note/highlights/export?format=markdown',
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toContain('No highlights');
    });

    it('returns 404 for non-existent note', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library/nonexistent/highlights/export?format=markdown',
      });

      expect(response.statusCode).toBe(404);
    });

    it('returns 400 for unsupported format', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library/test-note/highlights/export?format=invalid',
      });

      expect(response.statusCode).toBe(400);
    });

    it('generates correct filename from title', async () => {
      testNotes.set('special-title-note', createTestNote({
        id: 'special-title-note',
        title: 'The Book: A Special Edition!',
        highlights: [samplePDFHighlight],
      }));

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library/special-title-note/highlights/export?format=markdown',
      });

      const body = JSON.parse(response.body);
      expect(body.filename).toBe('The-Book-A-Special-Edition-highlights.md');
    });
  });
});
