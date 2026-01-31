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
    paused: false,
    pausedAt: null,
    bookNotes: null,
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

    it('rejects PDF highlight without selection', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/api/library/test-note/highlights',
        payload: {
          type: 'pdf',
          page: 10,
          text: 'Highlight without selection',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toContain('selection');
    });

    it('pushes new highlight to in-memory cache after creation', async () => {
      const note = testNotes.get('test-note')!;
      const initialCount = note.highlights.length;

      await fastify.inject({
        method: 'POST',
        url: '/api/library/test-note/highlights',
        payload: {
          type: 'pdf',
          page: 10,
          selection: { beginIndex: 0, beginOffset: 0, endIndex: 0, endOffset: 20 },
          text: 'Cache test highlight',
        },
      });

      expect(note.highlights.length).toBe(initialCount + 1);
      expect(note.highlights[note.highlights.length - 1].text).toBe('Cache test highlight');
    });

    it('returns 500 when highlightWriter.write throws', async () => {
      vi.mocked(mockHighlightWriter.write).mockRejectedValueOnce(new Error('Write failed'));

      const response = await fastify.inject({
        method: 'POST',
        url: '/api/library/test-note/highlights',
        payload: {
          type: 'pdf',
          page: 10,
          selection: { beginIndex: 0, beginOffset: 0, endIndex: 0, endOffset: 20 },
          text: 'This should fail',
        },
      });

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.error).toContain('Failed to save highlight');
    });

    it('creates highlight with category', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/api/library/test-note/highlights',
        payload: {
          type: 'pdf',
          page: 5,
          selection: { beginIndex: 1, beginOffset: 0, endIndex: 2, endOffset: 10 },
          text: 'Important concept',
          category: 'important',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(mockHighlightWriter.write).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ category: 'important' }),
      );
    });

    it('creates highlight without optional note field', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/api/library/test-note/highlights',
        payload: {
          type: 'epub',
          cfi: 'epubcfi(/6/8!/4/2:100)',
          text: 'Highlight without note',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
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

    it('returns 500 when highlightWriter.update throws', async () => {
      vi.mocked(mockHighlightWriter.update).mockRejectedValueOnce(new Error('Update failed'));

      const response = await fastify.inject({
        method: 'PATCH',
        url: '/api/library/test-note/highlights/h1',
        payload: {
          note: 'This should fail',
        },
      });

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.error).toContain('Failed to update highlight');
    });

    it('updates the in-memory cache after successful update', async () => {
      const response = await fastify.inject({
        method: 'PATCH',
        url: '/api/library/test-note/highlights/h1',
        payload: {
          note: 'Updated annotation',
        },
      });

      expect(response.statusCode).toBe(200);
      const note = testNotes.get('test-note')!;
      const updated = note.highlights.find(h => h.id === 'h1');
      expect(updated).toBeDefined();
      expect(updated!.note).toBe('Updated annotation');
    });

    it('updates category on a highlight', async () => {
      const response = await fastify.inject({
        method: 'PATCH',
        url: '/api/library/test-note/highlights/h1',
        payload: {
          category: 'definition',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(mockHighlightWriter.update).toHaveBeenCalledWith(
        expect.anything(),
        'h1',
        expect.objectContaining({ category: 'definition' }),
      );
    });

    it('returns updatedAt timestamp in response', async () => {
      const response = await fastify.inject({
        method: 'PATCH',
        url: '/api/library/test-note/highlights/h1',
        payload: {
          note: 'New note',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.highlight.updatedAt).toBeDefined();
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

    it('returns 404 when highlightWriter.delete returns false', async () => {
      vi.mocked(mockHighlightWriter.delete).mockResolvedValueOnce(false);

      const response = await fastify.inject({
        method: 'DELETE',
        url: '/api/library/test-note/highlights/h1',
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error).toContain('not found in file');
    });

    it('returns 500 when highlightWriter.delete throws', async () => {
      vi.mocked(mockHighlightWriter.delete).mockRejectedValueOnce(new Error('Delete failed'));

      const response = await fastify.inject({
        method: 'DELETE',
        url: '/api/library/test-note/highlights/h1',
      });

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.error).toContain('Failed to delete highlight');
    });

    it('removes highlight from in-memory cache after deletion', async () => {
      const note = testNotes.get('test-note')!;
      expect(note.highlights.find(h => h.id === 'h1')).toBeDefined();

      await fastify.inject({
        method: 'DELETE',
        url: '/api/library/test-note/highlights/h1',
      });

      expect(note.highlights.find(h => h.id === 'h1')).toBeUndefined();
    });

    it('only removes the targeted highlight from cache, not others', async () => {
      const note = testNotes.get('test-note')!;
      const initialCount = note.highlights.length;

      await fastify.inject({
        method: 'DELETE',
        url: '/api/library/test-note/highlights/h1',
      });

      expect(note.highlights.length).toBe(initialCount - 1);
      expect(note.highlights.find(h => h.id === 'h2')).toBeDefined();
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

    it('generates correct file extension per format', async () => {
      const formats = [
        { format: 'markdown', ext: '.md' },
        { format: 'json', ext: '.json' },
        { format: 'csv', ext: '.csv' },
        { format: 'plaintext', ext: '.txt' },
      ];

      for (const { format, ext } of formats) {
        const response = await fastify.inject({
          method: 'GET',
          url: `/api/library/test-note/highlights/export?format=${format}`,
        });

        const body = JSON.parse(response.body);
        expect(body.filename).toContain(ext);
      }
    });

    it('truncates very long titles in filenames to 50 chars', async () => {
      testNotes.set('long-title', createTestNote({
        id: 'long-title',
        title: 'A'.repeat(100),
        highlights: [samplePDFHighlight],
      }));

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library/long-title/highlights/export?format=markdown',
      });

      const body = JSON.parse(response.body);
      // Safe title is sliced to 50 chars, then "-highlights.md" appended
      const safeTitle = body.filename.replace('-highlights.md', '');
      expect(safeTitle.length).toBeLessThanOrEqual(50);
    });

    it('uses pageLabel instead of page number in markdown export', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library/test-note/highlights/export?format=markdown',
      });

      const body = JSON.parse(response.body);
      // samplePDFHighlight has pageLabel 'xlii'
      expect(body.content).toContain('Page xlii');
    });

    it('uses pageLabel instead of page number in plaintext export', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library/test-note/highlights/export?format=plaintext',
      });

      const body = JSON.parse(response.body);
      expect(body.content).toContain('Page xlii');
    });

    it('uses pageLabel instead of page number in CSV export', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library/test-note/highlights/export?format=csv',
      });

      const body = JSON.parse(response.body);
      expect(body.content).toContain('Page xlii');
    });

    it('falls back to page number when pageLabel is missing', async () => {
      const highlightNoLabel: PDFHighlight = {
        id: 'h-no-label',
        type: 'pdf',
        page: 99,
        selection: { beginIndex: 0, beginOffset: 0, endIndex: 0, endOffset: 10 },
        text: 'No label highlight',
        createdAt: '2024-01-20T10:00:00Z',
      };
      testNotes.set('no-label-note', createTestNote({
        id: 'no-label-note',
        title: 'No Label Book',
        highlights: [highlightNoLabel],
      }));

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library/no-label-note/highlights/export?format=markdown',
      });

      const body = JSON.parse(response.body);
      expect(body.content).toContain('Page 99');
    });

    it('sorts PDF highlights by page in export', async () => {
      const page10: PDFHighlight = {
        id: 'p10',
        type: 'pdf',
        page: 10,
        selection: { beginIndex: 0, beginOffset: 0, endIndex: 0, endOffset: 5 },
        text: 'First page highlight',
        createdAt: '2024-01-20T10:00:00Z',
      };
      const page5: PDFHighlight = {
        id: 'p5',
        type: 'pdf',
        page: 5,
        selection: { beginIndex: 0, beginOffset: 0, endIndex: 0, endOffset: 5 },
        text: 'Earlier page highlight',
        createdAt: '2024-01-19T10:00:00Z',
      };
      testNotes.set('sort-note', createTestNote({
        id: 'sort-note',
        title: 'Sorting Test',
        highlights: [page10, page5],
      }));

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library/sort-note/highlights/export?format=plaintext',
      });

      const body = JSON.parse(response.body);
      const idx5 = body.content.indexOf('Earlier page highlight');
      const idx10 = body.content.indexOf('First page highlight');
      expect(idx5).toBeLessThan(idx10);
    });

    it('sorts EPUB highlights by creation date in export', async () => {
      const older: EPUBHighlight = {
        id: 'e-old',
        type: 'epub',
        cfi: 'epubcfi(/6/10!/4/2:0)',
        text: 'Older EPUB highlight',
        createdAt: '2024-01-10T10:00:00Z',
      };
      const newer: EPUBHighlight = {
        id: 'e-new',
        type: 'epub',
        cfi: 'epubcfi(/6/4!/4/2:0)',
        text: 'Newer EPUB highlight',
        createdAt: '2024-01-20T10:00:00Z',
      };
      testNotes.set('epub-sort-note', createTestNote({
        id: 'epub-sort-note',
        title: 'EPUB Sort Test',
        sourceType: 'epub',
        highlights: [newer, older],
      }));

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library/epub-sort-note/highlights/export?format=plaintext',
      });

      const body = JSON.parse(response.body);
      const idxOlder = body.content.indexOf('Older EPUB highlight');
      const idxNewer = body.content.indexOf('Newer EPUB highlight');
      expect(idxOlder).toBeLessThan(idxNewer);
    });

    it('JSON export respects includeNotes=false', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library/test-note/highlights/export?format=json&includeNotes=false',
      });

      const body = JSON.parse(response.body);
      const exported = JSON.parse(body.content);
      for (const h of exported.highlights) {
        expect(h.note).toBeUndefined();
      }
    });

    it('JSON export respects includeCategories=false', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library/test-note/highlights/export?format=json&includeCategories=false',
      });

      const body = JSON.parse(response.body);
      const exported = JSON.parse(body.content);
      for (const h of exported.highlights) {
        expect(h.category).toBeUndefined();
      }
    });

    it('JSON export respects includeTimestamps=false', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library/test-note/highlights/export?format=json&includeTimestamps=false',
      });

      const body = JSON.parse(response.body);
      const exported = JSON.parse(body.content);
      for (const h of exported.highlights) {
        expect(h.createdAt).toBeUndefined();
      }
    });

    it('JSON export includes updatedAt when present', async () => {
      const updatedHighlight: PDFHighlight = {
        ...samplePDFHighlight,
        id: 'h-updated',
        updatedAt: '2024-02-01T12:00:00Z',
      };
      testNotes.set('updated-note', createTestNote({
        id: 'updated-note',
        title: 'Updated Note',
        highlights: [updatedHighlight],
      }));

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library/updated-note/highlights/export?format=json',
      });

      const body = JSON.parse(response.body);
      const exported = JSON.parse(body.content);
      expect(exported.highlights[0].updatedAt).toBe('2024-02-01T12:00:00Z');
    });

    it('JSON export includes pageLabel for PDF highlights', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library/test-note/highlights/export?format=json',
      });

      const body = JSON.parse(response.body);
      const exported = JSON.parse(body.content);
      const pdfHighlight = exported.highlights.find((h: Record<string, unknown>) => h.type === 'pdf');
      expect(pdfHighlight.pageLabel).toBe('xlii');
    });

    it('JSON export includes CFI for EPUB highlights', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library/test-note/highlights/export?format=json',
      });

      const body = JSON.parse(response.body);
      const exported = JSON.parse(body.content);
      const epubHighlight = exported.highlights.find((h: Record<string, unknown>) => h.type === 'epub');
      expect(epubHighlight.cfi).toBe('epubcfi(/6/4!/4/2/1:0)');
    });

    it('CSV export escapes values containing commas', async () => {
      const commaHighlight: PDFHighlight = {
        id: 'h-comma',
        type: 'pdf',
        page: 1,
        selection: { beginIndex: 0, beginOffset: 0, endIndex: 0, endOffset: 5 },
        text: 'Hello, world',
        createdAt: '2024-01-15T10:00:00Z',
      };
      testNotes.set('csv-escape-note', createTestNote({
        id: 'csv-escape-note',
        title: 'CSV Escape Test',
        highlights: [commaHighlight],
      }));

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library/csv-escape-note/highlights/export?format=csv',
      });

      const body = JSON.parse(response.body);
      expect(body.content).toContain('"Hello, world"');
    });

    it('CSV export escapes values containing double quotes', async () => {
      const quoteHighlight: PDFHighlight = {
        id: 'h-quote',
        type: 'pdf',
        page: 1,
        selection: { beginIndex: 0, beginOffset: 0, endIndex: 0, endOffset: 5 },
        text: 'He said "hello"',
        createdAt: '2024-01-15T10:00:00Z',
      };
      testNotes.set('csv-quote-note', createTestNote({
        id: 'csv-quote-note',
        title: 'CSV Quote Test',
        highlights: [quoteHighlight],
      }));

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library/csv-quote-note/highlights/export?format=csv',
      });

      const body = JSON.parse(response.body);
      // Double quotes should be escaped as ""
      expect(body.content).toContain('"He said ""hello"""');
    });

    it('CSV export escapes values containing newlines', async () => {
      const newlineHighlight: PDFHighlight = {
        id: 'h-newline',
        type: 'pdf',
        page: 1,
        selection: { beginIndex: 0, beginOffset: 0, endIndex: 0, endOffset: 5 },
        text: 'Line one\nLine two',
        createdAt: '2024-01-15T10:00:00Z',
      };
      testNotes.set('csv-newline-note', createTestNote({
        id: 'csv-newline-note',
        title: 'CSV Newline Test',
        highlights: [newlineHighlight],
      }));

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library/csv-newline-note/highlights/export?format=csv',
      });

      const body = JSON.parse(response.body);
      expect(body.content).toContain('"Line one\nLine two"');
    });

    it('CSV export includes Category column with includeCategories', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library/test-note/highlights/export?format=csv&includeCategories=true',
      });

      const body = JSON.parse(response.body);
      const lines = body.content.split('\n');
      expect(lines[0]).toContain('Category');
      // samplePDFHighlight has category 'important'
      expect(body.content).toContain('Important');
    });

    it('CSV export shows "Highlight" for highlights without category', async () => {
      const noCatHighlight: PDFHighlight = {
        id: 'h-nocat',
        type: 'pdf',
        page: 1,
        selection: { beginIndex: 0, beginOffset: 0, endIndex: 0, endOffset: 5 },
        text: 'No category',
        createdAt: '2024-01-15T10:00:00Z',
      };
      testNotes.set('no-cat-note', createTestNote({
        id: 'no-cat-note',
        title: 'No Cat',
        highlights: [noCatHighlight],
      }));

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library/no-cat-note/highlights/export?format=csv&includeCategories=true',
      });

      const body = JSON.parse(response.body);
      expect(body.content).toContain('Highlight');
    });

    it('plaintext export respects includeTimestamps=false', async () => {
      const withTs = await fastify.inject({
        method: 'GET',
        url: '/api/library/test-note/highlights/export?format=plaintext&includeTimestamps=true',
      });
      const withoutTs = await fastify.inject({
        method: 'GET',
        url: '/api/library/test-note/highlights/export?format=plaintext&includeTimestamps=false',
      });

      const withTsContent = JSON.parse(withTs.body).content;
      const withoutTsContent = JSON.parse(withoutTs.body).content;
      // The version without timestamps should be shorter (no date lines)
      expect(withoutTsContent.length).toBeLessThan(withTsContent.length);
    });

    it('plaintext export respects includeNotes option', async () => {
      const withNotes = await fastify.inject({
        method: 'GET',
        url: '/api/library/test-note/highlights/export?format=plaintext&includeNotes=true',
      });
      const withoutNotes = await fastify.inject({
        method: 'GET',
        url: '/api/library/test-note/highlights/export?format=plaintext&includeNotes=false',
      });

      expect(JSON.parse(withNotes.body).content).toContain('Note:');
      expect(JSON.parse(withoutNotes.body).content).not.toContain('Note:');
    });

    it('plaintext export numbers highlights sequentially', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library/test-note/highlights/export?format=plaintext',
      });

      const body = JSON.parse(response.body);
      expect(body.content).toContain('[1]');
      expect(body.content).toContain('[2]');
    });

    it('markdown export uses blockquote syntax for highlight text', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library/test-note/highlights/export?format=markdown',
      });

      const body = JSON.parse(response.body);
      expect(body.content).toContain(`> ${samplePDFHighlight.text}`);
      expect(body.content).toContain(`> ${sampleEPUBHighlight.text}`);
    });

    it('markdown export respects includeTimestamps=false', async () => {
      const withTs = await fastify.inject({
        method: 'GET',
        url: '/api/library/test-note/highlights/export?format=markdown&includeTimestamps=true',
      });
      const withoutTs = await fastify.inject({
        method: 'GET',
        url: '/api/library/test-note/highlights/export?format=markdown&includeTimestamps=false',
      });

      const withTsContent = JSON.parse(withTs.body).content;
      const withoutTsContent = JSON.parse(withoutTs.body).content;
      // With timestamps is longer because it includes date strings
      expect(withoutTsContent.length).toBeLessThan(withTsContent.length);
    });

    it('markdown export shows EPUB location as "EPUB"', async () => {
      testNotes.set('epub-only', createTestNote({
        id: 'epub-only',
        title: 'EPUB Only Book',
        sourceType: 'epub',
        highlights: [sampleEPUBHighlight],
      }));

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library/epub-only/highlights/export?format=markdown',
      });

      const body = JSON.parse(response.body);
      expect(body.content).toContain('EPUB');
    });

    it('markdown export only shows category badge when highlight has category', async () => {
      const noCatHighlight: PDFHighlight = {
        id: 'h-nocat2',
        type: 'pdf',
        page: 1,
        selection: { beginIndex: 0, beginOffset: 0, endIndex: 0, endOffset: 5 },
        text: 'No category here',
        createdAt: '2024-01-15T10:00:00Z',
      };
      testNotes.set('nocat-md-note', createTestNote({
        id: 'nocat-md-note',
        title: 'No Category Test',
        highlights: [noCatHighlight],
      }));

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library/nocat-md-note/highlights/export?format=markdown&includeCategories=true',
      });

      const body = JSON.parse(response.body);
      // Should not have a bracket-enclosed category label since category is undefined
      expect(body.content).not.toMatch(/\[Highlight\]/);
      expect(body.content).not.toMatch(/\[Important\]/);
    });

    it('groupByCategory skips empty categories', async () => {
      // Only 'important' and 'question' categories are present
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library/test-note/highlights/export?format=markdown&groupByCategory=true',
      });

      const body = JSON.parse(response.body);
      expect(body.content).toContain('## Important');
      expect(body.content).toContain('## Question');
      // These categories have no highlights, so they should not appear
      expect(body.content).not.toContain('## Highlight');
      expect(body.content).not.toContain('## To-do');
      expect(body.content).not.toContain('## Definition');
    });
  });

  describe('GET /api/library/:id/highlights/export - mixed type sorting', () => {
    it('sorts mixed PDF and EPUB highlights by date when types differ', async () => {
      const pdfEarly: PDFHighlight = {
        id: 'p-early',
        type: 'pdf',
        page: 50,
        selection: { beginIndex: 0, beginOffset: 0, endIndex: 0, endOffset: 5 },
        text: 'PDF highlight on page 50',
        createdAt: '2024-01-10T10:00:00Z',
      };
      const epubMiddle: EPUBHighlight = {
        id: 'e-middle',
        type: 'epub',
        cfi: 'epubcfi(/6/4!/4/2:0)',
        text: 'EPUB highlight in middle',
        createdAt: '2024-01-15T10:00:00Z',
      };
      const pdfLate: PDFHighlight = {
        id: 'p-late',
        type: 'pdf',
        page: 10,
        selection: { beginIndex: 0, beginOffset: 0, endIndex: 0, endOffset: 5 },
        text: 'PDF highlight on page 10',
        createdAt: '2024-01-20T10:00:00Z',
      };
      testNotes.set('mixed-note', createTestNote({
        id: 'mixed-note',
        title: 'Mixed Type Book',
        highlights: [pdfLate, epubMiddle, pdfEarly],
      }));

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library/mixed-note/highlights/export?format=plaintext',
      });

      const body = JSON.parse(response.body);
      const idxEarly = body.content.indexOf('PDF highlight on page 50');
      const idxMiddle = body.content.indexOf('EPUB highlight in middle');
      const idxLate = body.content.indexOf('PDF highlight on page 10');
      // When mixed types, PDF-PDF comparisons use page, but cross-type uses createdAt
      // pdfEarly (Jan 10) should come before epubMiddle (Jan 15) which comes before pdfLate (Jan 20)
      expect(idxEarly).toBeLessThan(idxMiddle);
      expect(idxMiddle).toBeLessThan(idxLate);
    });
  });

  describe('GET /api/library/:id/highlights/export - CSV column exclusion', () => {
    it('CSV export omits Category column when includeCategories=false', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library/test-note/highlights/export?format=csv&includeCategories=false',
      });

      const body = JSON.parse(response.body);
      const headerLine = body.content.split('\n')[0];
      expect(headerLine).not.toContain('Category');
      expect(headerLine).toContain('Text');
      expect(headerLine).toContain('Type');
      expect(headerLine).toContain('Location');
    });

    it('CSV export omits Note column when includeNotes=false', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library/test-note/highlights/export?format=csv&includeNotes=false',
      });

      const body = JSON.parse(response.body);
      const headerLine = body.content.split('\n')[0];
      expect(headerLine).not.toContain('Note');
    });

    it('CSV export omits Created column when includeTimestamps=false', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library/test-note/highlights/export?format=csv&includeTimestamps=false',
      });

      const body = JSON.parse(response.body);
      const headerLine = body.content.split('\n')[0];
      expect(headerLine).not.toContain('Created');
    });

    it('CSV export with all options disabled has minimal columns', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library/test-note/highlights/export?format=csv&includeCategories=false&includeNotes=false&includeTimestamps=false',
      });

      const body = JSON.parse(response.body);
      const headerLine = body.content.split('\n')[0];
      expect(headerLine).toBe('Text,Type,Location');
    });
  });

  describe('GET /api/library/:id/highlights/export - CSV combined escaping', () => {
    it('CSV export handles text with commas, quotes, and newlines combined', async () => {
      const complexHighlight: PDFHighlight = {
        id: 'h-complex',
        type: 'pdf',
        page: 1,
        selection: { beginIndex: 0, beginOffset: 0, endIndex: 0, endOffset: 5 },
        text: 'He said, "hello"\nand then left',
        createdAt: '2024-01-15T10:00:00Z',
      };
      testNotes.set('csv-complex', createTestNote({
        id: 'csv-complex',
        title: 'Complex CSV',
        highlights: [complexHighlight],
      }));

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library/csv-complex/highlights/export?format=csv',
      });

      const body = JSON.parse(response.body);
      // Should be wrapped in quotes with internal quotes doubled
      expect(body.content).toContain('"He said, ""hello""\nand then left"');
    });

    it('CSV export does not escape text without special characters', async () => {
      const plainHighlight: PDFHighlight = {
        id: 'h-plain',
        type: 'pdf',
        page: 1,
        selection: { beginIndex: 0, beginOffset: 0, endIndex: 0, endOffset: 5 },
        text: 'Simple text without special chars',
        createdAt: '2024-01-15T10:00:00Z',
      };
      testNotes.set('csv-plain', createTestNote({
        id: 'csv-plain',
        title: 'Plain CSV',
        highlights: [plainHighlight],
      }));

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library/csv-plain/highlights/export?format=csv&includeCategories=false&includeNotes=false&includeTimestamps=false',
      });

      const body = JSON.parse(response.body);
      const dataLine = body.content.split('\n')[1];
      // Should not be wrapped in extra quotes
      expect(dataLine).toBe('Simple text without special chars,pdf,Page 1');
    });
  });

  describe('GET /api/library/:id/highlights/export - groupByCategory edge cases', () => {
    it('groupByCategory places uncategorized highlights under Highlight heading', async () => {
      const uncategorized: PDFHighlight = {
        id: 'h-uncat',
        type: 'pdf',
        page: 1,
        selection: { beginIndex: 0, beginOffset: 0, endIndex: 0, endOffset: 5 },
        text: 'Uncategorized text',
        createdAt: '2024-01-15T10:00:00Z',
      };
      const categorized: PDFHighlight = {
        id: 'h-cat',
        type: 'pdf',
        page: 2,
        selection: { beginIndex: 0, beginOffset: 0, endIndex: 0, endOffset: 5 },
        text: 'Important text',
        category: 'important',
        createdAt: '2024-01-16T10:00:00Z',
      };
      testNotes.set('group-mixed', createTestNote({
        id: 'group-mixed',
        title: 'Group Mixed',
        highlights: [uncategorized, categorized],
      }));

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library/group-mixed/highlights/export?format=markdown&groupByCategory=true',
      });

      const body = JSON.parse(response.body);
      // Uncategorized defaults to 'highlight' category
      expect(body.content).toContain('## Highlight');
      expect(body.content).toContain('## Important');
      expect(body.content).toContain('Uncategorized text');
      expect(body.content).toContain('Important text');
    });

    it('groupByCategory follows defined category order', async () => {
      const todo: PDFHighlight = {
        id: 'h-todo',
        type: 'pdf',
        page: 1,
        selection: { beginIndex: 0, beginOffset: 0, endIndex: 0, endOffset: 5 },
        text: 'Todo item',
        category: 'todo',
        createdAt: '2024-01-15T10:00:00Z',
      };
      const highlight: PDFHighlight = {
        id: 'h-hl',
        type: 'pdf',
        page: 2,
        selection: { beginIndex: 0, beginOffset: 0, endIndex: 0, endOffset: 5 },
        text: 'General highlight',
        category: 'highlight',
        createdAt: '2024-01-16T10:00:00Z',
      };
      const definition: PDFHighlight = {
        id: 'h-def',
        type: 'pdf',
        page: 3,
        selection: { beginIndex: 0, beginOffset: 0, endIndex: 0, endOffset: 5 },
        text: 'A definition',
        category: 'definition',
        createdAt: '2024-01-17T10:00:00Z',
      };
      testNotes.set('order-note', createTestNote({
        id: 'order-note',
        title: 'Order Test',
        highlights: [todo, highlight, definition],
      }));

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library/order-note/highlights/export?format=markdown&groupByCategory=true',
      });

      const body = JSON.parse(response.body);
      // Category order: highlight, important, question, todo, definition
      const hlIdx = body.content.indexOf('## Highlight');
      const todoIdx = body.content.indexOf('## To-do');
      const defIdx = body.content.indexOf('## Definition');
      expect(hlIdx).toBeLessThan(todoIdx);
      expect(todoIdx).toBeLessThan(defIdx);
    });

    it('groupByCategory with all five categories present', async () => {
      const makeHighlight = (id: string, category: string, page: number): PDFHighlight => ({
        id,
        type: 'pdf',
        page,
        selection: { beginIndex: 0, beginOffset: 0, endIndex: 0, endOffset: 5 },
        text: `Text for ${category}`,
        category: category as PDFHighlight['category'],
        createdAt: '2024-01-15T10:00:00Z',
      });

      testNotes.set('all-cats', createTestNote({
        id: 'all-cats',
        title: 'All Categories',
        highlights: [
          makeHighlight('h1', 'highlight', 1),
          makeHighlight('h2', 'important', 2),
          makeHighlight('h3', 'question', 3),
          makeHighlight('h4', 'todo', 4),
          makeHighlight('h5', 'definition', 5),
        ],
      }));

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library/all-cats/highlights/export?format=markdown&groupByCategory=true',
      });

      const body = JSON.parse(response.body);
      expect(body.content).toContain('## Highlight');
      expect(body.content).toContain('## Important');
      expect(body.content).toContain('## Question');
      expect(body.content).toContain('## To-do');
      expect(body.content).toContain('## Definition');
    });
  });

  describe('GET /api/library/:id/highlights/export - JSON combined options', () => {
    it('JSON export with all options disabled returns minimal highlight objects', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library/test-note/highlights/export?format=json&includeNotes=false&includeCategories=false&includeTimestamps=false',
      });

      const body = JSON.parse(response.body);
      const exported = JSON.parse(body.content);

      for (const h of exported.highlights) {
        expect(h.text).toBeDefined();
        expect(h.type).toBeDefined();
        // Optional fields should all be absent
        expect(h.note).toBeUndefined();
        expect(h.category).toBeUndefined();
        expect(h.createdAt).toBeUndefined();
        expect(h.updatedAt).toBeUndefined();
      }
      // Structural fields should still be present
      expect(exported.title).toBe('Test Book');
      expect(exported.highlightCount).toBe(2);
      expect(exported.exportedAt).toBeDefined();
    });

    it('JSON export includes page for PDF and cfi for EPUB even with options disabled', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library/test-note/highlights/export?format=json&includeNotes=false&includeCategories=false&includeTimestamps=false',
      });

      const body = JSON.parse(response.body);
      const exported = JSON.parse(body.content);
      const pdf = exported.highlights.find((h: Record<string, unknown>) => h.type === 'pdf');
      const epub = exported.highlights.find((h: Record<string, unknown>) => h.type === 'epub');

      expect(pdf.page).toBeDefined();
      expect(epub.cfi).toBeDefined();
    });
  });

  describe('GET /api/library/:id/highlights/export - filename edge cases', () => {
    it('generates filename from title with only special characters', async () => {
      testNotes.set('special-only', createTestNote({
        id: 'special-only',
        title: '!!!@@@###',
        highlights: [samplePDFHighlight],
      }));

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library/special-only/highlights/export?format=markdown',
      });

      const body = JSON.parse(response.body);
      // After sanitization all chars are stripped, leaving '-highlights.md'
      expect(body.filename).toBe('-highlights.md');
    });

    it('generates filename with spaces collapsed into single hyphens', async () => {
      testNotes.set('spaces-note', createTestNote({
        id: 'spaces-note',
        title: 'My   Book   Title',
        highlights: [samplePDFHighlight],
      }));

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library/spaces-note/highlights/export?format=json',
      });

      const body = JSON.parse(response.body);
      expect(body.filename).toBe('My-Book-Title-highlights.json');
    });

    it('generates different extensions for each format', async () => {
      testNotes.set('ext-note', createTestNote({
        id: 'ext-note',
        title: 'Extension Test',
        highlights: [samplePDFHighlight],
      }));

      const csvResponse = await fastify.inject({
        method: 'GET',
        url: '/api/library/ext-note/highlights/export?format=csv',
      });
      expect(JSON.parse(csvResponse.body).filename).toBe('Extension-Test-highlights.csv');

      const txtResponse = await fastify.inject({
        method: 'GET',
        url: '/api/library/ext-note/highlights/export?format=plaintext',
      });
      expect(JSON.parse(txtResponse.body).filename).toBe('Extension-Test-highlights.txt');
    });
  });

  describe('GET /api/library/:id/highlights/export - single highlight', () => {
    it('exports a single highlight correctly in all formats', async () => {
      const singleHighlight: PDFHighlight = {
        id: 'single',
        type: 'pdf',
        page: 1,
        selection: { beginIndex: 0, beginOffset: 0, endIndex: 0, endOffset: 5 },
        text: 'Only highlight',
        note: 'Only note',
        category: 'definition',
        createdAt: '2024-01-15T10:00:00Z',
      };
      testNotes.set('single-note', createTestNote({
        id: 'single-note',
        title: 'Single Highlight Book',
        highlights: [singleHighlight],
      }));

      // Markdown
      const mdResponse = await fastify.inject({
        method: 'GET',
        url: '/api/library/single-note/highlights/export?format=markdown',
      });
      const mdBody = JSON.parse(mdResponse.body);
      expect(mdBody.content).toContain('> Only highlight');
      expect(mdBody.content).toContain('**Note:** Only note');
      expect(mdBody.content).toContain('[Definition]');

      // JSON
      const jsonResponse = await fastify.inject({
        method: 'GET',
        url: '/api/library/single-note/highlights/export?format=json',
      });
      const jsonExported = JSON.parse(JSON.parse(jsonResponse.body).content);
      expect(jsonExported.highlightCount).toBe(1);
      expect(jsonExported.highlights[0].text).toBe('Only highlight');
      expect(jsonExported.highlights[0].category).toBe('definition');

      // CSV
      const csvResponse = await fastify.inject({
        method: 'GET',
        url: '/api/library/single-note/highlights/export?format=csv',
      });
      const csvContent = JSON.parse(csvResponse.body).content;
      const csvLines = csvContent.split('\n');
      expect(csvLines).toHaveLength(2); // header + 1 row

      // Plaintext
      const txtResponse = await fastify.inject({
        method: 'GET',
        url: '/api/library/single-note/highlights/export?format=plaintext',
      });
      const txtContent = JSON.parse(txtResponse.body).content;
      expect(txtContent).toContain('[1] Page 1');
      expect(txtContent).toContain('"Only highlight"');
      expect(txtContent).toContain('Note: Only note');
    });
  });

  describe('GET /api/library/:id/highlights/export - plaintext structure', () => {
    it('plaintext export contains proper header and separators', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library/test-note/highlights/export?format=plaintext',
      });

      const body = JSON.parse(response.body);
      expect(body.content).toContain('HIGHLIGHTS FROM: Test Book');
      expect(body.content).toContain('='.repeat(50));
      expect(body.content).toContain('-'.repeat(50));
    });

    it('plaintext export wraps highlight text in quotes', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library/test-note/highlights/export?format=plaintext',
      });

      const body = JSON.parse(response.body);
      expect(body.content).toContain(`"${samplePDFHighlight.text}"`);
      expect(body.content).toContain(`"${sampleEPUBHighlight.text}"`);
    });

    it('plaintext export shows EPUB location as "EPUB"', async () => {
      testNotes.set('epub-txt', createTestNote({
        id: 'epub-txt',
        title: 'EPUB Plaintext',
        sourceType: 'epub',
        highlights: [sampleEPUBHighlight],
      }));

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library/epub-txt/highlights/export?format=plaintext',
      });

      const body = JSON.parse(response.body);
      expect(body.content).toContain('[1] EPUB');
    });
  });

  describe('GET /api/library/:id/highlights/export - CSV EPUB location', () => {
    it('CSV export uses CFI string as location for EPUB highlights', async () => {
      testNotes.set('epub-csv', createTestNote({
        id: 'epub-csv',
        title: 'EPUB CSV Test',
        sourceType: 'epub',
        highlights: [sampleEPUBHighlight],
      }));

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library/epub-csv/highlights/export?format=csv&includeCategories=false&includeNotes=false&includeTimestamps=false',
      });

      const body = JSON.parse(response.body);
      const dataLine = body.content.split('\n')[1];
      // EPUB location uses the cfi string directly
      expect(dataLine).toContain(sampleEPUBHighlight.cfi);
    });
  });

  describe('GET /api/library/:id/highlights/export - markdown combined options', () => {
    it('markdown export with all options disabled shows only text and location', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library/test-note/highlights/export?format=markdown&includeNotes=false&includeCategories=false&includeTimestamps=false',
      });

      const body = JSON.parse(response.body);
      // Should have blockquoted text and location line, but no notes, categories, or timestamps
      expect(body.content).toContain(`> ${samplePDFHighlight.text}`);
      expect(body.content).not.toContain('**Note:**');
      expect(body.content).not.toContain('[Important]');
      // Location should still be shown
      expect(body.content).toContain('Page xlii');
    });

    it('markdown groupByCategory combined with includeNotes shows notes within groups', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library/test-note/highlights/export?format=markdown&groupByCategory=true&includeNotes=true',
      });

      const body = JSON.parse(response.body);
      expect(body.content).toContain('## Important');
      expect(body.content).toContain(`**Note:** ${samplePDFHighlight.note}`);
    });
  });

  describe('PATCH /api/library/:id/highlights/:highlightId - cache edge cases', () => {
    it('succeeds even when highlight is not in in-memory cache', async () => {
      // Simulate cache desync: highlightWriter.update returns a result,
      // but the highlight ID doesn't exist in note.highlights array
      const updatedResult = {
        ...samplePDFHighlight,
        id: 'ghost-highlight',
        note: 'Updated ghost',
        updatedAt: new Date().toISOString(),
      };
      vi.mocked(mockHighlightWriter.update).mockResolvedValueOnce(updatedResult);

      const response = await fastify.inject({
        method: 'PATCH',
        url: '/api/library/test-note/highlights/ghost-highlight',
        payload: { note: 'Updated ghost' },
      });

      // Route should still succeed - just the cache update is skipped
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.highlight.note).toBe('Updated ghost');

      // In-memory cache should be unchanged (no entry with this ID exists)
      const note = testNotes.get('test-note')!;
      expect(note.highlights.find(h => h.id === 'ghost-highlight')).toBeUndefined();
      // Original highlights should remain untouched
      expect(note.highlights).toHaveLength(2);
    });

    it('handles PATCH with empty body', async () => {
      const response = await fastify.inject({
        method: 'PATCH',
        url: '/api/library/test-note/highlights/h1',
        payload: {},
      });

      // Schema allows empty object since all body properties are optional
      expect(response.statusCode).toBe(200);
      expect(mockHighlightWriter.update).toHaveBeenCalledWith(
        expect.anything(),
        'h1',
        expect.objectContaining({}),
      );
    });
  });

  describe('GET /api/library/:id/highlights/export - sorting edge cases', () => {
    it('sorts two EPUB highlights by creation date', async () => {
      const epubOld: EPUBHighlight = {
        id: 'epub-old',
        type: 'epub',
        cfi: 'epubcfi(/6/4!/4/2:0)',
        text: 'Old EPUB text',
        createdAt: '2024-01-01T10:00:00Z',
      };
      const epubNew: EPUBHighlight = {
        id: 'epub-new',
        type: 'epub',
        cfi: 'epubcfi(/6/8!/4/2:0)',
        text: 'New EPUB text',
        createdAt: '2024-02-01T10:00:00Z',
      };
      // Insert in reverse order to verify sorting
      testNotes.set('epub-sort', createTestNote({
        id: 'epub-sort',
        title: 'EPUB Sort',
        sourceType: 'epub',
        highlights: [epubNew, epubOld],
      }));

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library/epub-sort/highlights/export?format=plaintext',
      });

      const body = JSON.parse(response.body);
      const idxOld = body.content.indexOf('Old EPUB text');
      const idxNew = body.content.indexOf('New EPUB text');
      expect(idxOld).toBeLessThan(idxNew);
    });

    it('sorts PDF-then-EPUB by date when types differ', async () => {
      const pdf: PDFHighlight = {
        id: 'pdf-later',
        type: 'pdf',
        page: 1,
        selection: { beginIndex: 0, beginOffset: 0, endIndex: 0, endOffset: 5 },
        text: 'PDF from later',
        createdAt: '2024-02-01T10:00:00Z',
      };
      const epub: EPUBHighlight = {
        id: 'epub-earlier',
        type: 'epub',
        cfi: 'epubcfi(/6/4!/4/2:0)',
        text: 'EPUB from earlier',
        createdAt: '2024-01-01T10:00:00Z',
      };
      testNotes.set('cross-type', createTestNote({
        id: 'cross-type',
        title: 'Cross Type Sort',
        highlights: [pdf, epub],
      }));

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library/cross-type/highlights/export?format=plaintext',
      });

      const body = JSON.parse(response.body);
      // EPUB (Jan 1) should come before PDF (Feb 1) because cross-type uses createdAt
      const idxEpub = body.content.indexOf('EPUB from earlier');
      const idxPdf = body.content.indexOf('PDF from later');
      expect(idxEpub).toBeLessThan(idxPdf);
    });

    it('sorts same-date highlights stably', async () => {
      const h1: PDFHighlight = {
        id: 'same-date-1',
        type: 'pdf',
        page: 5,
        selection: { beginIndex: 0, beginOffset: 0, endIndex: 0, endOffset: 5 },
        text: 'Page five highlight',
        createdAt: '2024-01-15T10:00:00Z',
      };
      const h2: PDFHighlight = {
        id: 'same-date-2',
        type: 'pdf',
        page: 3,
        selection: { beginIndex: 0, beginOffset: 0, endIndex: 0, endOffset: 5 },
        text: 'Page three highlight',
        createdAt: '2024-01-15T10:00:00Z',
      };
      testNotes.set('same-date', createTestNote({
        id: 'same-date',
        title: 'Same Date',
        highlights: [h1, h2],
      }));

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library/same-date/highlights/export?format=plaintext',
      });

      const body = JSON.parse(response.body);
      // Both are PDF, so sorted by page: page 3 before page 5
      const idx3 = body.content.indexOf('Page three highlight');
      const idx5 = body.content.indexOf('Page five highlight');
      expect(idx3).toBeLessThan(idx5);
    });
  });

  describe('GET /api/library/:id/highlights/export - JSON exportedAt and structure', () => {
    it('JSON export contains valid exportedAt ISO timestamp', async () => {
      const before = new Date().toISOString();

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library/test-note/highlights/export?format=json',
      });

      const after = new Date().toISOString();
      const body = JSON.parse(response.body);
      const exported = JSON.parse(body.content);

      expect(exported.exportedAt).toBeDefined();
      // Verify it's a valid ISO date between before and after
      const exportedDate = new Date(exported.exportedAt);
      expect(exportedDate.getTime()).toBeGreaterThanOrEqual(new Date(before).getTime());
      expect(exportedDate.getTime()).toBeLessThanOrEqual(new Date(after).getTime());
    });

    it('JSON export produces valid parseable JSON string', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library/test-note/highlights/export?format=json',
      });

      const body = JSON.parse(response.body);
      // Should not throw when parsed
      const exported = JSON.parse(body.content);
      expect(typeof exported).toBe('object');
      expect(Array.isArray(exported.highlights)).toBe(true);
    });

    it('JSON export omits pageLabel when not present on PDF highlight', async () => {
      const noLabel: PDFHighlight = {
        id: 'json-no-label',
        type: 'pdf',
        page: 42,
        selection: { beginIndex: 0, beginOffset: 0, endIndex: 0, endOffset: 5 },
        text: 'No label text',
        createdAt: '2024-01-15T10:00:00Z',
      };
      testNotes.set('json-no-label', createTestNote({
        id: 'json-no-label',
        title: 'No Label JSON',
        highlights: [noLabel],
      }));

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library/json-no-label/highlights/export?format=json',
      });

      const body = JSON.parse(response.body);
      const exported = JSON.parse(body.content);
      const h = exported.highlights[0];
      expect(h.page).toBe(42);
      expect(h.pageLabel).toBeUndefined();
    });
  });

  describe('GET /api/library/:id/highlights/export - CSV note field edge cases', () => {
    it('CSV export outputs empty string for undefined note', async () => {
      const noNote: PDFHighlight = {
        id: 'h-no-note',
        type: 'pdf',
        page: 1,
        selection: { beginIndex: 0, beginOffset: 0, endIndex: 0, endOffset: 5 },
        text: 'No note here',
        createdAt: '2024-01-15T10:00:00Z',
      };
      testNotes.set('csv-no-note', createTestNote({
        id: 'csv-no-note',
        title: 'CSV No Note',
        highlights: [noNote],
      }));

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library/csv-no-note/highlights/export?format=csv&includeNotes=true&includeCategories=false&includeTimestamps=false',
      });

      const body = JSON.parse(response.body);
      const lines = body.content.split('\n');
      // Header: Text,Type,Location,Note
      expect(lines[0]).toBe('Text,Type,Location,Note');
      // Data row should end with empty note field
      const dataRow = lines[1];
      // "No note here,pdf,Page 1," — trailing comma for empty note
      expect(dataRow).toMatch(/,$/);
    });

    it('CSV export escapes note field containing special characters', async () => {
      const specialNote: PDFHighlight = {
        id: 'h-special-note',
        type: 'pdf',
        page: 1,
        selection: { beginIndex: 0, beginOffset: 0, endIndex: 0, endOffset: 5 },
        text: 'Simple text',
        note: 'Note with "quotes" and, commas',
        createdAt: '2024-01-15T10:00:00Z',
      };
      testNotes.set('csv-special-note', createTestNote({
        id: 'csv-special-note',
        title: 'Special Note CSV',
        highlights: [specialNote],
      }));

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library/csv-special-note/highlights/export?format=csv&includeNotes=true&includeCategories=false&includeTimestamps=false',
      });

      const body = JSON.parse(response.body);
      expect(body.content).toContain('"Note with ""quotes"" and, commas"');
    });
  });

  describe('GET /api/library/:id/highlights/export - markdown flat view with mixed categories', () => {
    it('shows category badges inline in flat view (groupByCategory=false)', async () => {
      const important: PDFHighlight = {
        id: 'h-imp',
        type: 'pdf',
        page: 1,
        selection: { beginIndex: 0, beginOffset: 0, endIndex: 0, endOffset: 5 },
        text: 'Important text',
        category: 'important',
        createdAt: '2024-01-15T10:00:00Z',
      };
      const noCat: PDFHighlight = {
        id: 'h-nocat-flat',
        type: 'pdf',
        page: 2,
        selection: { beginIndex: 0, beginOffset: 0, endIndex: 0, endOffset: 5 },
        text: 'No category text',
        createdAt: '2024-01-16T10:00:00Z',
      };
      const question: EPUBHighlight = {
        id: 'h-q-flat',
        type: 'epub',
        cfi: 'epubcfi(/6/4!/4/2:0)',
        text: 'Question text',
        category: 'question',
        createdAt: '2024-01-17T10:00:00Z',
      };
      testNotes.set('flat-mixed', createTestNote({
        id: 'flat-mixed',
        title: 'Flat Mixed Categories',
        highlights: [important, noCat, question],
      }));

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library/flat-mixed/highlights/export?format=markdown&includeCategories=true&groupByCategory=false',
      });

      const body = JSON.parse(response.body);
      // Flat view should NOT have ## category headings
      expect(body.content).not.toContain('## Important');
      expect(body.content).not.toContain('## Question');
      // But should have inline category badges
      expect(body.content).toContain('[Important]');
      expect(body.content).toContain('[Question]');
      // Uncategorized highlight should NOT have a badge
      const lines = body.content.split('\n');
      const noCatLine = lines.find((l: string) => l.includes('Page 2'));
      expect(noCatLine).toBeDefined();
      expect(noCatLine).not.toMatch(/\[.*\]/);
    });
  });

  describe('GET /api/library/:id/highlights/export - filename edge cases', () => {
    it('handles title with unicode characters by stripping them', async () => {
      testNotes.set('unicode-title', createTestNote({
        id: 'unicode-title',
        title: 'Café résumé naïve',
        highlights: [samplePDFHighlight],
      }));

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library/unicode-title/highlights/export?format=markdown',
      });

      const body = JSON.parse(response.body);
      // The regex [^a-zA-Z0-9\s-] strips non-ASCII, so accented chars are removed
      expect(body.filename).toBe('Caf-rsum-nave-highlights.md');
    });

    it('handles title that is exactly 50 characters after sanitization', async () => {
      // Create a title that is exactly 50 alphanumeric chars
      const title50 = 'A'.repeat(50);
      testNotes.set('exact-50', createTestNote({
        id: 'exact-50',
        title: title50,
        highlights: [samplePDFHighlight],
      }));

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library/exact-50/highlights/export?format=csv',
      });

      const body = JSON.parse(response.body);
      const safeTitle = body.filename.replace('-highlights.csv', '');
      expect(safeTitle).toBe('A'.repeat(50));
    });

    it('truncates title longer than 50 characters after sanitization', async () => {
      const title60 = 'B'.repeat(60);
      testNotes.set('over-50', createTestNote({
        id: 'over-50',
        title: title60,
        highlights: [samplePDFHighlight],
      }));

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library/over-50/highlights/export?format=json',
      });

      const body = JSON.parse(response.body);
      const safeTitle = body.filename.replace('-highlights.json', '');
      expect(safeTitle).toBe('B'.repeat(50));
      expect(safeTitle.length).toBe(50);
    });
  });

  describe('POST /api/library/:id/highlights - schema validation edge cases', () => {
    it('rejects request missing required text field', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/api/library/test-note/highlights',
        payload: {
          type: 'pdf',
          page: 10,
          selection: { beginIndex: 0, beginOffset: 0, endIndex: 0, endOffset: 20 },
          // Missing 'text' field
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('rejects request missing required type field', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/api/library/test-note/highlights',
        payload: {
          page: 10,
          selection: { beginIndex: 0, beginOffset: 0, endIndex: 0, endOffset: 20 },
          text: 'Some text',
          // Missing 'type' field
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('rejects request with invalid type enum value', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/api/library/test-note/highlights',
        payload: {
          type: 'docx',
          text: 'Some text',
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('DELETE /api/library/:id/highlights/:highlightId - cache consistency', () => {
    it('does not modify cache when highlightWriter.delete returns false', async () => {
      vi.mocked(mockHighlightWriter.delete).mockResolvedValueOnce(false);

      const note = testNotes.get('test-note')!;
      const originalHighlights = [...note.highlights];

      await fastify.inject({
        method: 'DELETE',
        url: '/api/library/test-note/highlights/h1',
      });

      // Cache should remain unchanged since delete returned false
      // (the route returns 404 before reaching splice)
      expect(note.highlights).toHaveLength(originalHighlights.length);
    });

    it('does not modify cache when highlightWriter.delete throws', async () => {
      vi.mocked(mockHighlightWriter.delete).mockRejectedValueOnce(new Error('Disk error'));

      const note = testNotes.get('test-note')!;
      const originalHighlights = [...note.highlights];

      await fastify.inject({
        method: 'DELETE',
        url: '/api/library/test-note/highlights/h1',
      });

      // Cache should remain unchanged since delete threw
      expect(note.highlights).toHaveLength(originalHighlights.length);
      expect(note.highlights[0].id).toBe(originalHighlights[0].id);
    });
  });

  describe('GET /api/library/:id/highlights/export - many highlights', () => {
    it('exports a large number of highlights correctly', async () => {
      const manyHighlights: PDFHighlight[] = Array.from({ length: 50 }, (_, i) => ({
        id: `h-bulk-${i}`,
        type: 'pdf' as const,
        page: i + 1,
        selection: { beginIndex: 0, beginOffset: 0, endIndex: 0, endOffset: 5 },
        text: `Highlight number ${i + 1}`,
        createdAt: `2024-01-${String(15).padStart(2, '0')}T10:00:00Z`,
      }));
      testNotes.set('bulk-note', createTestNote({
        id: 'bulk-note',
        title: 'Bulk Test',
        highlights: manyHighlights,
      }));

      // JSON
      const jsonResp = await fastify.inject({
        method: 'GET',
        url: '/api/library/bulk-note/highlights/export?format=json',
      });
      const jsonExported = JSON.parse(JSON.parse(jsonResp.body).content);
      expect(jsonExported.highlightCount).toBe(50);
      expect(jsonExported.highlights).toHaveLength(50);

      // CSV
      const csvResp = await fastify.inject({
        method: 'GET',
        url: '/api/library/bulk-note/highlights/export?format=csv',
      });
      const csvLines = JSON.parse(csvResp.body).content.split('\n');
      expect(csvLines).toHaveLength(51); // header + 50 rows

      // Plaintext
      const txtResp = await fastify.inject({
        method: 'GET',
        url: '/api/library/bulk-note/highlights/export?format=plaintext',
      });
      const txtContent = JSON.parse(txtResp.body).content;
      expect(txtContent).toContain('[1]');
      expect(txtContent).toContain('[50]');
    });

    it('sorts many PDF highlights by page number in export', async () => {
      // Create highlights in reverse page order
      const reversedHighlights: PDFHighlight[] = Array.from({ length: 10 }, (_, i) => ({
        id: `h-rev-${i}`,
        type: 'pdf' as const,
        page: 10 - i,
        selection: { beginIndex: 0, beginOffset: 0, endIndex: 0, endOffset: 5 },
        text: `Page ${10 - i} text`,
        createdAt: '2024-01-15T10:00:00Z',
      }));
      testNotes.set('reversed-note', createTestNote({
        id: 'reversed-note',
        title: 'Reversed Pages',
        highlights: reversedHighlights,
      }));

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/library/reversed-note/highlights/export?format=plaintext',
      });

      const body = JSON.parse(response.body);
      // Verify pages appear in ascending order
      for (let i = 1; i <= 9; i++) {
        const idxCurrent = body.content.indexOf(`Page ${i} text`);
        const idxNext = body.content.indexOf(`Page ${i + 1} text`);
        expect(idxCurrent).toBeLessThan(idxNext);
      }
    });
  });
});
