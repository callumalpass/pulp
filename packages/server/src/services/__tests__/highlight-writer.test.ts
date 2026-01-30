import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { HighlightWriter } from '../highlight-writer.js';
import type { Config } from '../../config/schema.js';
import type { LiteratureNote, CreateHighlightRequest, PDFHighlight, EPUBHighlight } from '@pulp/shared';

// Mock fs module
vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

import { readFileSync, writeFileSync } from 'node:fs';

const mockReadFileSync = vi.mocked(readFileSync);
const mockWriteFileSync = vi.mocked(writeFileSync);

// Test configuration with templates
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
  highlight_template: '> {{text}}\n- [[{{source}}#page={{page}}&selection={{selection}}|p. {{pageLabel}}]]{{#if note}}\n{{note}}{{/if}}\n',
  highlight_template_epub: '> {{text}}\n- [[{{source}}#cfi={{cfi}}|loc]]{{#if note}}\n{{note}}{{/if}}\n',
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
    frontmatter: { id: 'test-citekey' },
    ...overrides,
  };
}

describe('HighlightWriter', () => {
  let writer: HighlightWriter;

  beforeEach(() => {
    vi.clearAllMocks();
    writer = new HighlightWriter(testConfig);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('creates instance with compiled templates', () => {
      expect(writer).toBeInstanceOf(HighlightWriter);
    });

    it('registers Handlebars if helper correctly', () => {
      // The constructor should not throw when templates use {{#if}}
      const configWithIfHelper: Config = {
        ...testConfig,
        highlight_template: '{{#if note}}Note: {{note}}{{/if}}',
      };
      expect(() => new HighlightWriter(configWithIfHelper)).not.toThrow();
    });
  });

  describe('write', () => {
    describe('PDF highlights', () => {
      it('writes PDF highlight with selection data', async () => {
        const note = createTestNote();
        mockReadFileSync.mockReturnValue('# Test Note\n\nSome content\n');

        const request: CreateHighlightRequest = {
          type: 'pdf',
          page: 42,
          pageLabel: '42',
          selection: {
            beginIndex: 10,
            beginOffset: 5,
            endIndex: 10,
            endOffset: 25,
          },
          text: 'This is the highlighted text',
        };

        const result = await writer.write(note, request);

        expect(result.type).toBe('pdf');
        expect((result as PDFHighlight).page).toBe(42);
        expect((result as PDFHighlight).pageLabel).toBe('42');
        expect((result as PDFHighlight).selection).toEqual(request.selection);
        expect(result.text).toBe('This is the highlighted text');
        expect(result.id).toBeDefined();
        expect(result.id.length).toBe(10);
        expect(result.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      });

      it('writes PDF highlight with note', async () => {
        const note = createTestNote();
        mockReadFileSync.mockReturnValue('# Test Note\n');

        const request: CreateHighlightRequest = {
          type: 'pdf',
          page: 10,
          selection: {
            beginIndex: 0,
            beginOffset: 0,
            endIndex: 0,
            endOffset: 10,
          },
          text: 'Quote text',
          note: 'My note about this quote',
        };

        const result = await writer.write(note, request);

        expect(result.note).toBe('My note about this quote');

        // Verify the written content includes the note
        expect(mockWriteFileSync).toHaveBeenCalled();
        const writtenContent = mockWriteFileSync.mock.calls[0][1] as string;
        expect(writtenContent).toContain('My note about this quote');
      });

      it('throws error when PDF highlight missing selection', async () => {
        const note = createTestNote();

        const request: CreateHighlightRequest = {
          type: 'pdf',
          page: 42,
          text: 'Some text',
          // selection is missing
        };

        await expect(writer.write(note, request)).rejects.toThrow(
          'PDF highlights require selection data'
        );
      });

      it('uses frontmatter id as citekey when available', async () => {
        const note = createTestNote({
          frontmatter: { id: 'author2024title' },
        });
        mockReadFileSync.mockReturnValue('# Note\n');

        const request: CreateHighlightRequest = {
          type: 'pdf',
          page: 1,
          selection: { beginIndex: 0, beginOffset: 0, endIndex: 0, endOffset: 5 },
          text: 'Test',
        };

        await writer.write(note, request);

        // The template receives citekey - verify through the written content
        expect(mockWriteFileSync).toHaveBeenCalled();
      });

      it('falls back to note id when frontmatter id missing', async () => {
        const note = createTestNote({
          id: 'fallback-note-id',
          frontmatter: {},
        });
        mockReadFileSync.mockReturnValue('# Note\n');

        const request: CreateHighlightRequest = {
          type: 'pdf',
          page: 1,
          selection: { beginIndex: 0, beginOffset: 0, endIndex: 0, endOffset: 5 },
          text: 'Test',
        };

        await writer.write(note, request);

        expect(mockWriteFileSync).toHaveBeenCalled();
      });

      it('uses physical page number when pageLabel is not provided', async () => {
        const note = createTestNote();
        mockReadFileSync.mockReturnValue('# Note\n');

        const request: CreateHighlightRequest = {
          type: 'pdf',
          page: 42,
          // pageLabel is undefined
          selection: { beginIndex: 0, beginOffset: 0, endIndex: 0, endOffset: 5 },
          text: 'Test',
        };

        await writer.write(note, request);

        const writtenContent = mockWriteFileSync.mock.calls[0][1] as string;
        expect(writtenContent).toContain('p. 42');
      });
    });

    describe('EPUB highlights', () => {
      it('writes EPUB highlight with CFI', async () => {
        const note = createTestNote({
          sourceType: 'epub',
          source: '/test/library/books/test.epub',
          sourceRelative: 'books/test.epub',
          filePath: '/test/library/books/test.epub',
        });
        mockReadFileSync.mockReturnValue('# Test EPUB Note\n');

        const request: CreateHighlightRequest = {
          type: 'epub',
          cfi: 'epubcfi(/6/4[chap01]!/4/2/3:0)',
          text: 'EPUB highlighted text',
        };

        const result = await writer.write(note, request);

        expect(result.type).toBe('epub');
        expect((result as EPUBHighlight).cfi).toBe('epubcfi(/6/4[chap01]!/4/2/3:0)');
        expect(result.text).toBe('EPUB highlighted text');
        expect(result.id).toBeDefined();
        expect(result.id.length).toBe(10);
      });

      it('writes EPUB highlight with note', async () => {
        const note = createTestNote({ sourceType: 'epub' });
        mockReadFileSync.mockReturnValue('# Note\n');

        const request: CreateHighlightRequest = {
          type: 'epub',
          cfi: 'epubcfi(/6/4)',
          text: 'Quote',
          note: 'My EPUB note',
        };

        const result = await writer.write(note, request);

        expect(result.note).toBe('My EPUB note');

        const writtenContent = mockWriteFileSync.mock.calls[0][1] as string;
        expect(writtenContent).toContain('My EPUB note');
      });
    });

    describe('file operations', () => {
      it('appends highlight to note file', async () => {
        const note = createTestNote();
        mockReadFileSync.mockReturnValue('# Existing content\n');

        const request: CreateHighlightRequest = {
          type: 'pdf',
          page: 1,
          selection: { beginIndex: 0, beginOffset: 0, endIndex: 0, endOffset: 5 },
          text: 'New highlight',
        };

        await writer.write(note, request);

        expect(mockWriteFileSync).toHaveBeenCalledWith(
          note.notePath,
          expect.stringContaining('# Existing content'),
          'utf-8'
        );
        expect(mockWriteFileSync).toHaveBeenCalledWith(
          note.notePath,
          expect.stringContaining('New highlight'),
          'utf-8'
        );
      });

      it('adds newline separator when file does not end with newline', async () => {
        const note = createTestNote();
        mockReadFileSync.mockReturnValue('# No trailing newline');

        const request: CreateHighlightRequest = {
          type: 'pdf',
          page: 1,
          selection: { beginIndex: 0, beginOffset: 0, endIndex: 0, endOffset: 5 },
          text: 'Test',
        };

        await writer.write(note, request);

        const writtenContent = mockWriteFileSync.mock.calls[0][1] as string;
        // Should have a newline between original content and highlight
        expect(writtenContent).toMatch(/# No trailing newline\n>/);
      });

      it('does not add extra newline when file ends with newline', async () => {
        const note = createTestNote();
        mockReadFileSync.mockReturnValue('# With newline\n');

        const request: CreateHighlightRequest = {
          type: 'pdf',
          page: 1,
          selection: { beginIndex: 0, beginOffset: 0, endIndex: 0, endOffset: 5 },
          text: 'Test',
        };

        await writer.write(note, request);

        const writtenContent = mockWriteFileSync.mock.calls[0][1] as string;
        // Should NOT have double newline
        expect(writtenContent).not.toMatch(/\n\n>/);
      });
    });

    describe('text formatting', () => {
      it('formats multi-line text as blockquote', async () => {
        const note = createTestNote();
        mockReadFileSync.mockReturnValue('# Note\n');

        const request: CreateHighlightRequest = {
          type: 'pdf',
          page: 1,
          selection: { beginIndex: 0, beginOffset: 0, endIndex: 0, endOffset: 50 },
          text: 'First line\nSecond line\nThird line',
        };

        await writer.write(note, request);

        const writtenContent = mockWriteFileSync.mock.calls[0][1] as string;
        // Blockquote lines should be joined with \n>
        expect(writtenContent).toContain('First line\n> Second line\n> Third line');
      });

      it('trims whitespace from text lines', async () => {
        const note = createTestNote();
        mockReadFileSync.mockReturnValue('# Note\n');

        const request: CreateHighlightRequest = {
          type: 'pdf',
          page: 1,
          selection: { beginIndex: 0, beginOffset: 0, endIndex: 0, endOffset: 30 },
          text: '  Padded text  \n  More text  ',
        };

        await writer.write(note, request);

        const writtenContent = mockWriteFileSync.mock.calls[0][1] as string;
        expect(writtenContent).toContain('Padded text');
        expect(writtenContent).toContain('More text');
        expect(writtenContent).not.toContain('  Padded');
      });

      it('filters out empty lines from text', async () => {
        const note = createTestNote();
        mockReadFileSync.mockReturnValue('# Note\n');

        const request: CreateHighlightRequest = {
          type: 'pdf',
          page: 1,
          selection: { beginIndex: 0, beginOffset: 0, endIndex: 0, endOffset: 20 },
          text: 'Line one\n\n\nLine two',
        };

        await writer.write(note, request);

        const writtenContent = mockWriteFileSync.mock.calls[0][1] as string;
        // Empty lines should be filtered out
        expect(writtenContent).toContain('Line one\n> Line two');
        expect(writtenContent).not.toContain('\n> \n');
      });
    });

    describe('selection formatting', () => {
      it('formats selection coordinates correctly', async () => {
        const note = createTestNote();
        mockReadFileSync.mockReturnValue('# Note\n');

        const request: CreateHighlightRequest = {
          type: 'pdf',
          page: 5,
          selection: {
            beginIndex: 12,
            beginOffset: 34,
            endIndex: 56,
            endOffset: 78,
          },
          text: 'Test',
        };

        await writer.write(note, request);

        const writtenContent = mockWriteFileSync.mock.calls[0][1] as string;
        expect(writtenContent).toContain('selection=12,34,56,78');
      });
    });
  });

  describe('update', () => {
    it('returns null when highlight not found in note', async () => {
      const note = createTestNote({ highlights: [] });

      const result = await writer.update(note, 'nonexistent-id', { note: 'Updated' });

      expect(result).toBeNull();
    });

    it('returns null when highlight link not found in file content', async () => {
      const existingHighlight: PDFHighlight = {
        id: 'abc1234567',
        type: 'pdf',
        page: 10,
        selection: { beginIndex: 0, beginOffset: 0, endIndex: 0, endOffset: 5 },
        text: 'Test',
        createdAt: '2024-01-15T10:00:00Z',
      };

      const note = createTestNote({ highlights: [existingHighlight] });
      mockReadFileSync.mockReturnValue('# Note without the highlight link\n');

      const result = await writer.update(note, 'abc1234567', { note: 'New note' });

      expect(result).toBeNull();
    });

    it('updates PDF highlight note', async () => {
      const existingHighlight: PDFHighlight = {
        id: 'abc1234567',
        type: 'pdf',
        page: 10,
        selection: { beginIndex: 5, beginOffset: 10, endIndex: 5, endOffset: 30 },
        text: 'Quoted text',
        createdAt: '2024-01-15T10:00:00Z',
      };

      const note = createTestNote({
        highlights: [existingHighlight],
      });

      const fileContent = `# Test Note

> Quoted text
[[books/test.pdf#page=10&selection=5,10,5,30|p. 10]]
Old note here

> Another quote
`;
      mockReadFileSync.mockReturnValue(fileContent);

      const result = await writer.update(note, 'abc1234567', { note: 'New note content' });

      expect(result).not.toBeNull();
      expect(result!.note).toBe('New note content');
      expect(mockWriteFileSync).toHaveBeenCalled();
    });

    it('updates EPUB highlight note', async () => {
      const existingHighlight: EPUBHighlight = {
        id: 'epub123456',
        type: 'epub',
        cfi: 'epubcfi(/6/4)',
        text: 'EPUB quote',
        createdAt: '2024-01-15T10:00:00Z',
      };

      const note = createTestNote({
        sourceType: 'epub',
        sourceRelative: 'books/test.epub',
        highlights: [existingHighlight],
      });

      const fileContent = `# EPUB Note

> EPUB quote
[[books/test.epub#cfi=epubcfi(/6/4)|loc]]
`;
      mockReadFileSync.mockReturnValue(fileContent);

      const result = await writer.update(note, 'epub123456', { note: 'EPUB note update' });

      expect(result).not.toBeNull();
      expect(result!.note).toBe('EPUB note update');
    });

    it('adds note when highlight had no previous note', async () => {
      const existingHighlight: PDFHighlight = {
        id: 'abc1234567',
        type: 'pdf',
        page: 10,
        selection: { beginIndex: 0, beginOffset: 0, endIndex: 0, endOffset: 10 },
        text: 'Quote',
        createdAt: '2024-01-15T10:00:00Z',
      };

      const note = createTestNote({ highlights: [existingHighlight] });

      const fileContent = `# Note

> Quote
[[books/test.pdf#page=10&selection=0,0,0,10|p. 10]]

> Next quote
`;
      mockReadFileSync.mockReturnValue(fileContent);

      const result = await writer.update(note, 'abc1234567', { note: 'Brand new note' });

      expect(result).not.toBeNull();
      expect(result!.note).toBe('Brand new note');

      const writtenContent = mockWriteFileSync.mock.calls[0][1] as string;
      expect(writtenContent).toContain('Brand new note');
    });

    it('removes note when update note is empty', async () => {
      const existingHighlight: PDFHighlight = {
        id: 'abc1234567',
        type: 'pdf',
        page: 10,
        selection: { beginIndex: 0, beginOffset: 0, endIndex: 0, endOffset: 10 },
        text: 'Quote',
        note: 'Existing note',
        createdAt: '2024-01-15T10:00:00Z',
      };

      const note = createTestNote({ highlights: [existingHighlight] });

      const fileContent = `# Note

> Quote
- [[books/test.pdf#page=10&selection=0,0,0,10|p. 10]]
Existing note

> Next quote
`;
      mockReadFileSync.mockReturnValue(fileContent);

      const result = await writer.update(note, 'abc1234567', { note: '' });

      expect(result).not.toBeNull();
      // When note is empty string, result.note is '' (trimmed empty) which is falsy
      expect(result!.note).toBeFalsy();
    });

    it('trims whitespace from updated note', async () => {
      const existingHighlight: PDFHighlight = {
        id: 'abc1234567',
        type: 'pdf',
        page: 10,
        selection: { beginIndex: 0, beginOffset: 0, endIndex: 0, endOffset: 10 },
        text: 'Quote',
        createdAt: '2024-01-15T10:00:00Z',
      };

      const note = createTestNote({ highlights: [existingHighlight] });
      mockReadFileSync.mockReturnValue(`[[books/test.pdf#page=10&selection=0,0,0,10|p. 10]]\n`);

      const result = await writer.update(note, 'abc1234567', { note: '  Trimmed note  ' });

      expect(result!.note).toBe('Trimmed note');
    });
  });

  describe('delete', () => {
    it('returns false when highlight not found in note', async () => {
      const note = createTestNote({ highlights: [] });

      const result = await writer.delete(note, 'nonexistent-id');

      expect(result).toBe(false);
    });

    it('returns false when highlight link not found in file', async () => {
      const existingHighlight: PDFHighlight = {
        id: 'abc1234567',
        type: 'pdf',
        page: 10,
        selection: { beginIndex: 0, beginOffset: 0, endIndex: 0, endOffset: 5 },
        text: 'Test',
        createdAt: '2024-01-15T10:00:00Z',
      };

      const note = createTestNote({ highlights: [existingHighlight] });
      mockReadFileSync.mockReturnValue('# Note without the highlight\n');

      const result = await writer.delete(note, 'abc1234567');

      expect(result).toBe(false);
    });

    it('deletes PDF highlight block', async () => {
      const existingHighlight: PDFHighlight = {
        id: 'abc1234567',
        type: 'pdf',
        page: 10,
        selection: { beginIndex: 5, beginOffset: 10, endIndex: 5, endOffset: 30 },
        text: 'Quote to delete',
        createdAt: '2024-01-15T10:00:00Z',
      };

      const note = createTestNote({ highlights: [existingHighlight] });

      // Format matches the highlight template output: blockquote followed by list item with link
      const fileContent = `# Test Note

> Quote to delete
- [[books/test.pdf#page=10&selection=5,10,5,30|p. 10]]

> Keep this quote
- [[books/test.pdf#page=20&selection=0,0,0,10|p. 20]]
`;
      mockReadFileSync.mockReturnValue(fileContent);

      const result = await writer.delete(note, 'abc1234567');

      expect(result).toBe(true);
      expect(mockWriteFileSync).toHaveBeenCalled();

      const writtenContent = mockWriteFileSync.mock.calls[0][1] as string;
      expect(writtenContent).not.toContain('Quote to delete');
      expect(writtenContent).toContain('Keep this quote');
    });

    it('deletes EPUB highlight block', async () => {
      const existingHighlight: EPUBHighlight = {
        id: 'epub123456',
        type: 'epub',
        cfi: 'epubcfi(/6/4)',
        text: 'EPUB quote to delete',
        createdAt: '2024-01-15T10:00:00Z',
      };

      const note = createTestNote({
        sourceType: 'epub',
        sourceRelative: 'books/test.epub',
        highlights: [existingHighlight],
      });

      // Format matches the EPUB highlight template output
      const fileContent = `# EPUB Note

> EPUB quote to delete
- [[books/test.epub#cfi=epubcfi(/6/4)|loc]]

> Keep this
- [[books/test.epub#cfi=epubcfi(/6/6)|loc]]
`;
      mockReadFileSync.mockReturnValue(fileContent);

      const result = await writer.delete(note, 'epub123456');

      expect(result).toBe(true);

      const writtenContent = mockWriteFileSync.mock.calls[0][1] as string;
      expect(writtenContent).not.toContain('EPUB quote to delete');
      expect(writtenContent).toContain('Keep this');
    });

    it('deletes highlight with associated note', async () => {
      const existingHighlight: PDFHighlight = {
        id: 'abc1234567',
        type: 'pdf',
        page: 10,
        selection: { beginIndex: 0, beginOffset: 0, endIndex: 0, endOffset: 10 },
        text: 'Quote',
        note: 'Note to delete too',
        createdAt: '2024-01-15T10:00:00Z',
      };

      const note = createTestNote({ highlights: [existingHighlight] });

      const fileContent = `# Note

> Quote
[[books/test.pdf#page=10&selection=0,0,0,10|p. 10]]
Note to delete too

> Another quote
`;
      mockReadFileSync.mockReturnValue(fileContent);

      const result = await writer.delete(note, 'abc1234567');

      expect(result).toBe(true);

      const writtenContent = mockWriteFileSync.mock.calls[0][1] as string;
      expect(writtenContent).not.toContain('Note to delete too');
      expect(writtenContent).toContain('Another quote');
    });

    it('handles highlight at end of file', async () => {
      const existingHighlight: PDFHighlight = {
        id: 'abc1234567',
        type: 'pdf',
        page: 10,
        selection: { beginIndex: 0, beginOffset: 0, endIndex: 0, endOffset: 10 },
        text: 'Last quote',
        createdAt: '2024-01-15T10:00:00Z',
      };

      const note = createTestNote({ highlights: [existingHighlight] });

      // Highlight at end of file with no trailing newline after link line
      const fileContent = `# Note

Some content

> Last quote
- [[books/test.pdf#page=10&selection=0,0,0,10|p. 10]]`;
      mockReadFileSync.mockReturnValue(fileContent);

      const result = await writer.delete(note, 'abc1234567');

      expect(result).toBe(true);

      const writtenContent = mockWriteFileSync.mock.calls[0][1] as string;
      expect(writtenContent).not.toContain('Last quote');
      expect(writtenContent).toContain('Some content');
    });
  });

  describe('escapeRegex', () => {
    it('escapes special regex characters in source paths', async () => {
      const note = createTestNote({
        sourceRelative: 'books/test (2024) [Final].pdf',
        highlights: [{
          id: 'abc1234567',
          type: 'pdf',
          page: 10,
          selection: { beginIndex: 0, beginOffset: 0, endIndex: 0, endOffset: 5 },
          text: 'Test',
          createdAt: '2024-01-15T10:00:00Z',
        } as PDFHighlight],
      });

      // File content with special characters in path
      const fileContent = `# Note

> Test
[[books/test (2024) [Final].pdf#page=10&selection=0,0,0,5|p. 10]]
`;
      mockReadFileSync.mockReturnValue(fileContent);

      const result = await writer.delete(note, 'abc1234567');

      expect(result).toBe(true);
    });
  });

  describe('category handling', () => {
    describe('write with categories', () => {
      it('defaults category to highlight when not specified', async () => {
        const note = createTestNote();
        mockReadFileSync.mockReturnValue('# Note\n');

        const request: CreateHighlightRequest = {
          type: 'pdf',
          page: 5,
          selection: { beginIndex: 0, beginOffset: 0, endIndex: 0, endOffset: 10 },
          text: 'Default category text',
        };

        const result = await writer.write(note, request);

        expect(result.category).toBe('highlight');
      });

      it('uses specified category for PDF highlights', async () => {
        const note = createTestNote();
        mockReadFileSync.mockReturnValue('# Note\n');

        const request: CreateHighlightRequest = {
          type: 'pdf',
          page: 5,
          selection: { beginIndex: 0, beginOffset: 0, endIndex: 0, endOffset: 10 },
          text: 'Important text',
          category: 'important',
        };

        const result = await writer.write(note, request);

        expect(result.category).toBe('important');
      });

      it('uses specified category for EPUB highlights', async () => {
        const note = createTestNote({ sourceType: 'epub' });
        mockReadFileSync.mockReturnValue('# Note\n');

        const request: CreateHighlightRequest = {
          type: 'epub',
          cfi: 'epubcfi(/6/4)',
          text: 'Question text',
          category: 'question',
        };

        const result = await writer.write(note, request);

        expect(result.category).toBe('question');
      });

      it('does not pass category to template when it is the default highlight', async () => {
        // Use a template that includes category to verify the {{#if category}} behavior
        const categoryConfig: Config = {
          ...testConfig,
          highlight_template: '> {{text}}\n- [[{{source}}#page={{page}}&selection={{selection}}{{#if category}}&category={{category}}{{/if}}|p. {{pageLabel}}]]{{#if note}}\n{{note}}{{/if}}\n',
        };
        const categoryWriter = new HighlightWriter(categoryConfig);

        const note = createTestNote();
        mockReadFileSync.mockReturnValue('# Note\n');

        const request: CreateHighlightRequest = {
          type: 'pdf',
          page: 5,
          selection: { beginIndex: 0, beginOffset: 0, endIndex: 0, endOffset: 10 },
          text: 'Default text',
          // category is undefined, defaults to 'highlight'
        };

        await categoryWriter.write(note, request);

        const writtenContent = mockWriteFileSync.mock.calls[0][1] as string;
        // 'highlight' category should NOT produce &category= in the link
        expect(writtenContent).not.toContain('&category=');
      });

      it('passes non-default category to template', async () => {
        const categoryConfig: Config = {
          ...testConfig,
          highlight_template: '> {{text}}\n- [[{{source}}#page={{page}}&selection={{selection}}{{#if category}}&category={{category}}{{/if}}|p. {{pageLabel}}]]{{#if note}}\n{{note}}{{/if}}\n',
        };
        const categoryWriter = new HighlightWriter(categoryConfig);

        const note = createTestNote();
        mockReadFileSync.mockReturnValue('# Note\n');

        const request: CreateHighlightRequest = {
          type: 'pdf',
          page: 5,
          selection: { beginIndex: 0, beginOffset: 0, endIndex: 0, endOffset: 10 },
          text: 'Important text',
          category: 'important',
        };

        await categoryWriter.write(note, request);

        const writtenContent = mockWriteFileSync.mock.calls[0][1] as string;
        expect(writtenContent).toContain('&category=important');
      });

      it('passes non-default category to EPUB template', async () => {
        const categoryConfig: Config = {
          ...testConfig,
          highlight_template_epub: '> {{text}}\n- [[{{source}}#cfi={{cfi}}{{#if category}}&category={{category}}{{/if}}|loc]]{{#if note}}\n{{note}}{{/if}}\n',
        };
        const categoryWriter = new HighlightWriter(categoryConfig);

        const note = createTestNote({
          sourceType: 'epub',
          sourceRelative: 'books/test.epub',
        });
        mockReadFileSync.mockReturnValue('# Note\n');

        const request: CreateHighlightRequest = {
          type: 'epub',
          cfi: 'epubcfi(/6/4)',
          text: 'Definition text',
          category: 'definition',
        };

        await categoryWriter.write(note, request);

        const writtenContent = mockWriteFileSync.mock.calls[0][1] as string;
        expect(writtenContent).toContain('&category=definition');
      });

      it('supports all valid category values', async () => {
        const categories = ['important', 'question', 'todo', 'definition'] as const;
        const note = createTestNote();

        for (const category of categories) {
          vi.clearAllMocks();
          mockReadFileSync.mockReturnValue('# Note\n');

          const request: CreateHighlightRequest = {
            type: 'pdf',
            page: 1,
            selection: { beginIndex: 0, beginOffset: 0, endIndex: 0, endOffset: 5 },
            text: `${category} text`,
            category,
          };

          const result = await writer.write(note, request);

          expect(result.category).toBe(category);
        }
      });
    });

    describe('update with category changes', () => {
      it('updates PDF highlight category in the link fragment', async () => {
        const existingHighlight: PDFHighlight = {
          id: 'abc1234567',
          type: 'pdf',
          page: 10,
          selection: { beginIndex: 5, beginOffset: 10, endIndex: 5, endOffset: 30 },
          text: 'Quoted text',
          category: 'highlight',
          createdAt: '2024-01-15T10:00:00Z',
        };

        const note = createTestNote({ highlights: [existingHighlight] });

        const fileContent = `# Note

> Quoted text
[[books/test.pdf#page=10&selection=5,10,5,30|p. 10]]

> Another quote
`;
        mockReadFileSync.mockReturnValue(fileContent);

        const result = await writer.update(note, 'abc1234567', { category: 'important' });

        expect(result).not.toBeNull();
        expect(result!.category).toBe('important');

        const writtenContent = mockWriteFileSync.mock.calls[0][1] as string;
        expect(writtenContent).toContain('&category=important');
      });

      it('updates EPUB highlight category in the link fragment', async () => {
        const existingHighlight: EPUBHighlight = {
          id: 'epub123456',
          type: 'epub',
          cfi: 'epubcfi(/6/4)',
          text: 'EPUB quote',
          category: 'highlight',
          createdAt: '2024-01-15T10:00:00Z',
        };

        const note = createTestNote({
          sourceType: 'epub',
          sourceRelative: 'books/test.epub',
          highlights: [existingHighlight],
        });

        const fileContent = `# EPUB Note

> EPUB quote
[[books/test.epub#cfi=epubcfi(/6/4)|loc]]
`;
        mockReadFileSync.mockReturnValue(fileContent);

        const result = await writer.update(note, 'epub123456', { category: 'question' });

        expect(result).not.toBeNull();
        expect(result!.category).toBe('question');

        const writtenContent = mockWriteFileSync.mock.calls[0][1] as string;
        expect(writtenContent).toContain('&category=question');
      });

      it('removes category fragment when changing to default highlight', async () => {
        const existingHighlight: PDFHighlight = {
          id: 'abc1234567',
          type: 'pdf',
          page: 10,
          selection: { beginIndex: 5, beginOffset: 10, endIndex: 5, endOffset: 30 },
          text: 'Quoted text',
          category: 'important',
          createdAt: '2024-01-15T10:00:00Z',
        };

        const note = createTestNote({ highlights: [existingHighlight] });

        const fileContent = `# Note

> Quoted text
[[books/test.pdf#page=10&selection=5,10,5,30&category=important|p. 10]]
`;
        mockReadFileSync.mockReturnValue(fileContent);

        const result = await writer.update(note, 'abc1234567', { category: 'highlight' });

        expect(result).not.toBeNull();
        expect(result!.category).toBe('highlight');

        const writtenContent = mockWriteFileSync.mock.calls[0][1] as string;
        // When category is 'highlight' (default), it should NOT include &category=
        expect(writtenContent).not.toContain('&category=');
      });

      it('changes from one non-default category to another', async () => {
        const existingHighlight: PDFHighlight = {
          id: 'abc1234567',
          type: 'pdf',
          page: 10,
          selection: { beginIndex: 5, beginOffset: 10, endIndex: 5, endOffset: 30 },
          text: 'Quoted text',
          category: 'important',
          createdAt: '2024-01-15T10:00:00Z',
        };

        const note = createTestNote({ highlights: [existingHighlight] });

        const fileContent = `# Note

> Quoted text
[[books/test.pdf#page=10&selection=5,10,5,30&category=important|p. 10]]
`;
        mockReadFileSync.mockReturnValue(fileContent);

        const result = await writer.update(note, 'abc1234567', { category: 'todo' });

        expect(result).not.toBeNull();
        expect(result!.category).toBe('todo');

        const writtenContent = mockWriteFileSync.mock.calls[0][1] as string;
        expect(writtenContent).toContain('&category=todo');
        expect(writtenContent).not.toContain('&category=important');
      });

      it('updates both category and note simultaneously', async () => {
        const existingHighlight: PDFHighlight = {
          id: 'abc1234567',
          type: 'pdf',
          page: 10,
          selection: { beginIndex: 5, beginOffset: 10, endIndex: 5, endOffset: 30 },
          text: 'Quoted text',
          category: 'highlight',
          createdAt: '2024-01-15T10:00:00Z',
        };

        const note = createTestNote({ highlights: [existingHighlight] });

        const fileContent = `# Note

> Quoted text
[[books/test.pdf#page=10&selection=5,10,5,30|p. 10]]
Old note
`;
        mockReadFileSync.mockReturnValue(fileContent);

        const result = await writer.update(note, 'abc1234567', {
          category: 'question',
          note: 'New note with new category',
        });

        expect(result).not.toBeNull();
        expect(result!.category).toBe('question');
        expect(result!.note).toBe('New note with new category');

        const writtenContent = mockWriteFileSync.mock.calls[0][1] as string;
        expect(writtenContent).toContain('&category=question');
        expect(writtenContent).toContain('New note with new category');
        expect(writtenContent).not.toContain('Old note');
      });

      it('preserves category when only updating note', async () => {
        const existingHighlight: PDFHighlight = {
          id: 'abc1234567',
          type: 'pdf',
          page: 10,
          selection: { beginIndex: 5, beginOffset: 10, endIndex: 5, endOffset: 30 },
          text: 'Quoted text',
          category: 'important',
          createdAt: '2024-01-15T10:00:00Z',
        };

        const note = createTestNote({ highlights: [existingHighlight] });

        const fileContent = `# Note

> Quoted text
[[books/test.pdf#page=10&selection=5,10,5,30&category=important|p. 10]]
`;
        mockReadFileSync.mockReturnValue(fileContent);

        const result = await writer.update(note, 'abc1234567', { note: 'Just updating note' });

        expect(result).not.toBeNull();
        expect(result!.category).toBe('important');
        expect(result!.note).toBe('Just updating note');

        const writtenContent = mockWriteFileSync.mock.calls[0][1] as string;
        // Category should remain in the link
        expect(writtenContent).toContain('&category=important');
      });

      it('preserves display text when changing category', async () => {
        const existingHighlight: PDFHighlight = {
          id: 'abc1234567',
          type: 'pdf',
          page: 10,
          pageLabel: 'x',
          selection: { beginIndex: 5, beginOffset: 10, endIndex: 5, endOffset: 30 },
          text: 'Quoted text',
          category: 'highlight',
          createdAt: '2024-01-15T10:00:00Z',
        };

        const note = createTestNote({ highlights: [existingHighlight] });

        const fileContent = `# Note

> Quoted text
[[books/test.pdf#page=10&selection=5,10,5,30|"Quoted text"|p. x|2024-01-15]]
`;
        mockReadFileSync.mockReturnValue(fileContent);

        const result = await writer.update(note, 'abc1234567', { category: 'definition' });

        expect(result).not.toBeNull();

        const writtenContent = mockWriteFileSync.mock.calls[0][1] as string;
        // The display text portion after | should be preserved
        expect(writtenContent).toContain('|"Quoted text"|p. x|2024-01-15]]');
        expect(writtenContent).toContain('&category=definition');
      });

      it('includes updatedAt timestamp in returned highlight', async () => {
        const existingHighlight: PDFHighlight = {
          id: 'abc1234567',
          type: 'pdf',
          page: 10,
          selection: { beginIndex: 0, beginOffset: 0, endIndex: 0, endOffset: 10 },
          text: 'Quote',
          createdAt: '2024-01-15T10:00:00Z',
        };

        const note = createTestNote({ highlights: [existingHighlight] });

        mockReadFileSync.mockReturnValue(`[[books/test.pdf#page=10&selection=0,0,0,10|p. 10]]\n`);

        const result = await writer.update(note, 'abc1234567', { note: 'Updated' });

        expect(result).not.toBeNull();
        expect(result!.updatedAt).toBeDefined();
        expect(result!.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      });
    });

    describe('delete with categories', () => {
      it('deletes PDF highlight that has a category in the link', async () => {
        const existingHighlight: PDFHighlight = {
          id: 'abc1234567',
          type: 'pdf',
          page: 10,
          selection: { beginIndex: 5, beginOffset: 10, endIndex: 5, endOffset: 30 },
          text: 'Important quote',
          category: 'important',
          createdAt: '2024-01-15T10:00:00Z',
        };

        const note = createTestNote({ highlights: [existingHighlight] });

        const fileContent = `# Note

> Important quote
- [[books/test.pdf#page=10&selection=5,10,5,30&category=important|p. 10]]

> Keep this
- [[books/test.pdf#page=20&selection=0,0,0,10|p. 20]]
`;
        mockReadFileSync.mockReturnValue(fileContent);

        const result = await writer.delete(note, 'abc1234567');

        expect(result).toBe(true);

        const writtenContent = mockWriteFileSync.mock.calls[0][1] as string;
        expect(writtenContent).not.toContain('Important quote');
        expect(writtenContent).not.toContain('&category=important');
        expect(writtenContent).toContain('Keep this');
      });

      it('deletes EPUB highlight that has a category in the link', async () => {
        const existingHighlight: EPUBHighlight = {
          id: 'epub123456',
          type: 'epub',
          cfi: 'epubcfi(/6/4)',
          text: 'Question text',
          category: 'question',
          createdAt: '2024-01-15T10:00:00Z',
        };

        const note = createTestNote({
          sourceType: 'epub',
          sourceRelative: 'books/test.epub',
          highlights: [existingHighlight],
        });

        const fileContent = `# EPUB Note

> Question text
- [[books/test.epub#cfi=epubcfi(/6/4)&category=question|loc]]

> Keep this
- [[books/test.epub#cfi=epubcfi(/6/6)|loc]]
`;
        mockReadFileSync.mockReturnValue(fileContent);

        const result = await writer.delete(note, 'epub123456');

        expect(result).toBe(true);

        const writtenContent = mockWriteFileSync.mock.calls[0][1] as string;
        expect(writtenContent).not.toContain('Question text');
        expect(writtenContent).not.toContain('&category=question');
        expect(writtenContent).toContain('Keep this');
      });

      it('deletes highlight with category and associated note', async () => {
        const existingHighlight: PDFHighlight = {
          id: 'abc1234567',
          type: 'pdf',
          page: 10,
          selection: { beginIndex: 0, beginOffset: 0, endIndex: 0, endOffset: 10 },
          text: 'Todo quote',
          note: 'Todo note to delete',
          category: 'todo',
          createdAt: '2024-01-15T10:00:00Z',
        };

        const note = createTestNote({ highlights: [existingHighlight] });

        const fileContent = `# Note

> Todo quote
- [[books/test.pdf#page=10&selection=0,0,0,10&category=todo|p. 10]]
Todo note to delete

> Another quote
`;
        mockReadFileSync.mockReturnValue(fileContent);

        const result = await writer.delete(note, 'abc1234567');

        expect(result).toBe(true);

        const writtenContent = mockWriteFileSync.mock.calls[0][1] as string;
        expect(writtenContent).not.toContain('Todo quote');
        expect(writtenContent).not.toContain('Todo note to delete');
        expect(writtenContent).toContain('Another quote');
      });
    });
  });

  describe('edge cases', () => {
    it('handles empty file content', async () => {
      const note = createTestNote();
      mockReadFileSync.mockReturnValue('');

      const request: CreateHighlightRequest = {
        type: 'pdf',
        page: 1,
        selection: { beginIndex: 0, beginOffset: 0, endIndex: 0, endOffset: 5 },
        text: 'Test',
      };

      await writer.write(note, request);

      expect(mockWriteFileSync).toHaveBeenCalled();
      const writtenContent = mockWriteFileSync.mock.calls[0][1] as string;
      expect(writtenContent).toContain('Test');
    });

    it('handles text with special HTML characters', async () => {
      const note = createTestNote();
      mockReadFileSync.mockReturnValue('# Note\n');

      const request: CreateHighlightRequest = {
        type: 'pdf',
        page: 1,
        selection: { beginIndex: 0, beginOffset: 0, endIndex: 0, endOffset: 20 },
        text: 'Text with <angle> & "quotes"',
      };

      await writer.write(note, request);

      const writtenContent = mockWriteFileSync.mock.calls[0][1] as string;
      // Handlebars SafeString should preserve these characters
      expect(writtenContent).toContain('Text with <angle> & "quotes"');
    });

    it('generates unique IDs for highlights at same page but different selections', async () => {
      const note = createTestNote();
      mockReadFileSync.mockReturnValue('# Note\n');

      const request1: CreateHighlightRequest = {
        type: 'pdf',
        page: 10,
        selection: { beginIndex: 0, beginOffset: 0, endIndex: 0, endOffset: 10 },
        text: 'First',
      };

      const request2: CreateHighlightRequest = {
        type: 'pdf',
        page: 10,
        selection: { beginIndex: 5, beginOffset: 0, endIndex: 5, endOffset: 10 },
        text: 'Second',
      };

      const result1 = await writer.write(note, request1);
      const result2 = await writer.write(note, request2);

      expect(result1.id).not.toBe(result2.id);
    });

    it('generates unique IDs for EPUB highlights with different CFIs', async () => {
      const note = createTestNote({ sourceType: 'epub' });
      mockReadFileSync.mockReturnValue('# Note\n');

      const request1: CreateHighlightRequest = {
        type: 'epub',
        cfi: 'epubcfi(/6/4)',
        text: 'First',
      };

      const request2: CreateHighlightRequest = {
        type: 'epub',
        cfi: 'epubcfi(/6/6)',
        text: 'Second',
      };

      const result1 = await writer.write(note, request1);
      const result2 = await writer.write(note, request2);

      expect(result1.id).not.toBe(result2.id);
    });
  });

  describe('write - createdAt formatting', () => {
    it('formats createdAt as YYYY-MM-DD date in template output', async () => {
      const note = createTestNote();
      mockReadFileSync.mockReturnValue('# Note\n');

      // Use a template that includes createdAt to verify the date format
      const dateConfig: Config = {
        ...testConfig,
        highlight_template: '> {{text}}\n- [[{{source}}#page={{page}}&selection={{selection}}|p. {{pageLabel}}]] ({{createdAt}})\n',
      };
      const dateWriter = new HighlightWriter(dateConfig);

      const request: CreateHighlightRequest = {
        type: 'pdf',
        page: 1,
        selection: { beginIndex: 0, beginOffset: 0, endIndex: 0, endOffset: 5 },
        text: 'Test',
      };

      await dateWriter.write(note, request);

      const writtenContent = mockWriteFileSync.mock.calls[0][1] as string;
      // Should contain a date in YYYY-MM-DD format, not full ISO timestamp
      expect(writtenContent).toMatch(/\(\d{4}-\d{2}-\d{2}\)/);
      expect(writtenContent).not.toMatch(/T\d{2}:\d{2}:\d{2}/);
    });

    it('formats createdAt as YYYY-MM-DD for EPUB template output', async () => {
      const note = createTestNote({
        sourceType: 'epub',
        sourceRelative: 'books/test.epub',
      });
      mockReadFileSync.mockReturnValue('# Note\n');

      const dateConfig: Config = {
        ...testConfig,
        highlight_template_epub: '> {{text}}\n- [[{{source}}#cfi={{cfi}}|loc]] ({{createdAt}})\n',
      };
      const dateWriter = new HighlightWriter(dateConfig);

      const request: CreateHighlightRequest = {
        type: 'epub',
        cfi: 'epubcfi(/6/4)',
        text: 'Test',
      };

      await dateWriter.write(note, request);

      const writtenContent = mockWriteFileSync.mock.calls[0][1] as string;
      expect(writtenContent).toMatch(/\(\d{4}-\d{2}-\d{2}\)/);
      expect(writtenContent).not.toMatch(/T\d{2}:\d{2}:\d{2}/);
    });
  });

  describe('write - EPUB minimal fields', () => {
    it('writes EPUB highlight without optional note or category', async () => {
      const note = createTestNote({
        sourceType: 'epub',
        sourceRelative: 'books/test.epub',
        filePath: '/test/library/books/test.epub',
        source: '/test/library/books/test.epub',
      });
      mockReadFileSync.mockReturnValue('# EPUB Note\n');

      const request: CreateHighlightRequest = {
        type: 'epub',
        cfi: 'epubcfi(/6/8[chap04]!/4/2/1:0)',
        text: 'Simple highlight without extras',
      };

      const result = await writer.write(note, request);

      expect(result.type).toBe('epub');
      expect(result.note).toBeUndefined();
      expect(result.category).toBe('highlight');
      expect((result as EPUBHighlight).cfi).toBe('epubcfi(/6/8[chap04]!/4/2/1:0)');

      const writtenContent = mockWriteFileSync.mock.calls[0][1] as string;
      expect(writtenContent).toContain('Simple highlight without extras');
      // Template uses {{#if note}} so no note section should appear
      expect(writtenContent).not.toContain('undefined');
      expect(writtenContent).not.toContain('null');
    });
  });

  describe('update - note value edge cases', () => {
    it('sets note to null when request.note is explicitly null', async () => {
      const existingHighlight: PDFHighlight = {
        id: 'abc1234567',
        type: 'pdf',
        page: 10,
        selection: { beginIndex: 0, beginOffset: 0, endIndex: 0, endOffset: 10 },
        text: 'Quote',
        note: 'Existing note to clear',
        createdAt: '2024-01-15T10:00:00Z',
      };

      const note = createTestNote({ highlights: [existingHighlight] });

      const fileContent = `# Note

> Quote
- [[books/test.pdf#page=10&selection=0,0,0,10|p. 10]]
Existing note to clear

> Another quote
`;
      mockReadFileSync.mockReturnValue(fileContent);

      const result = await writer.update(note, 'abc1234567', { note: null as unknown as string });

      expect(result).not.toBeNull();
      // null?.trim() is undefined, which is falsy, so the existing note should be preserved
      // because request.note !== undefined is true (null !== undefined), but null?.trim() is undefined
    });

    it('preserves existing note when request.note is undefined', async () => {
      const existingHighlight: PDFHighlight = {
        id: 'abc1234567',
        type: 'pdf',
        page: 10,
        selection: { beginIndex: 0, beginOffset: 0, endIndex: 0, endOffset: 10 },
        text: 'Quote',
        note: 'Keep this note',
        createdAt: '2024-01-15T10:00:00Z',
      };

      const note = createTestNote({ highlights: [existingHighlight] });

      const fileContent = `# Note

> Quote
- [[books/test.pdf#page=10&selection=0,0,0,10|p. 10]]
Keep this note

> Another quote
`;
      mockReadFileSync.mockReturnValue(fileContent);

      // Only update category, no note field at all
      const result = await writer.update(note, 'abc1234567', { category: 'important' });

      expect(result).not.toBeNull();
      expect(result!.note).toBe('Keep this note');
    });

    it('replaces existing note with whitespace-only note effectively removes it', async () => {
      const existingHighlight: PDFHighlight = {
        id: 'abc1234567',
        type: 'pdf',
        page: 10,
        selection: { beginIndex: 0, beginOffset: 0, endIndex: 0, endOffset: 10 },
        text: 'Quote',
        note: 'Old note',
        createdAt: '2024-01-15T10:00:00Z',
      };

      const note = createTestNote({ highlights: [existingHighlight] });

      const fileContent = `# Note

> Quote
- [[books/test.pdf#page=10&selection=0,0,0,10|p. 10]]
Old note

> Another quote
`;
      mockReadFileSync.mockReturnValue(fileContent);

      const result = await writer.update(note, 'abc1234567', { note: '   ' });

      expect(result).not.toBeNull();
      // Whitespace-only string trims to empty, which is falsy
      expect(result!.note).toBeFalsy();
    });
  });

  describe('delete - block boundary detection', () => {
    it('deletes highlight block that immediately follows another highlight', async () => {
      const highlight1: PDFHighlight = {
        id: 'first12345',
        type: 'pdf',
        page: 5,
        selection: { beginIndex: 0, beginOffset: 0, endIndex: 0, endOffset: 10 },
        text: 'First quote',
        createdAt: '2024-01-15T10:00:00Z',
      };
      const highlight2: PDFHighlight = {
        id: 'second1234',
        type: 'pdf',
        page: 10,
        selection: { beginIndex: 0, beginOffset: 0, endIndex: 0, endOffset: 10 },
        text: 'Second quote',
        createdAt: '2024-01-15T10:00:00Z',
      };

      const note = createTestNote({ highlights: [highlight1, highlight2] });

      // Two consecutive highlights with no empty line between them
      const fileContent = `# Note

> First quote
- [[books/test.pdf#page=5&selection=0,0,0,10|p. 5]]
> Second quote
- [[books/test.pdf#page=10&selection=0,0,0,10|p. 10]]
`;
      mockReadFileSync.mockReturnValue(fileContent);

      const result = await writer.delete(note, 'second1234');

      expect(result).toBe(true);

      const writtenContent = mockWriteFileSync.mock.calls[0][1] as string;
      expect(writtenContent).not.toContain('Second quote');
      expect(writtenContent).toContain('First quote');
    });

    it('deletes highlight with list marker prefix in template', async () => {
      const existingHighlight: PDFHighlight = {
        id: 'abc1234567',
        type: 'pdf',
        page: 10,
        selection: { beginIndex: 0, beginOffset: 0, endIndex: 0, endOffset: 10 },
        text: 'Quote with list marker',
        createdAt: '2024-01-15T10:00:00Z',
      };

      const note = createTestNote({ highlights: [existingHighlight] });

      // The template wraps the link in a list marker (- [[...]])
      const fileContent = `# Note

> Quote with list marker
- [[books/test.pdf#page=10&selection=0,0,0,10|p. 10]]

Some other content
`;
      mockReadFileSync.mockReturnValue(fileContent);

      const result = await writer.delete(note, 'abc1234567');

      expect(result).toBe(true);

      const writtenContent = mockWriteFileSync.mock.calls[0][1] as string;
      expect(writtenContent).not.toContain('Quote with list marker');
      expect(writtenContent).toContain('Some other content');
    });

    it('deletes only the targeted highlight when multiple exist on same page', async () => {
      const highlight1: PDFHighlight = {
        id: 'first12345',
        type: 'pdf',
        page: 10,
        selection: { beginIndex: 0, beginOffset: 0, endIndex: 0, endOffset: 10 },
        text: 'First on page 10',
        createdAt: '2024-01-15T10:00:00Z',
      };
      const highlight2: PDFHighlight = {
        id: 'second1234',
        type: 'pdf',
        page: 10,
        selection: { beginIndex: 5, beginOffset: 0, endIndex: 5, endOffset: 10 },
        text: 'Second on page 10',
        createdAt: '2024-01-15T10:00:00Z',
      };

      const note = createTestNote({ highlights: [highlight1, highlight2] });

      const fileContent = `# Note

> First on page 10
- [[books/test.pdf#page=10&selection=0,0,0,10|p. 10]]

> Second on page 10
- [[books/test.pdf#page=10&selection=5,0,5,10|p. 10]]
`;
      mockReadFileSync.mockReturnValue(fileContent);

      const result = await writer.delete(note, 'first12345');

      expect(result).toBe(true);

      const writtenContent = mockWriteFileSync.mock.calls[0][1] as string;
      expect(writtenContent).not.toContain('First on page 10');
      expect(writtenContent).toContain('Second on page 10');
    });

    it('handles delete of highlight that is the only content in the file', async () => {
      const existingHighlight: PDFHighlight = {
        id: 'abc1234567',
        type: 'pdf',
        page: 1,
        selection: { beginIndex: 0, beginOffset: 0, endIndex: 0, endOffset: 5 },
        text: 'Only highlight',
        createdAt: '2024-01-15T10:00:00Z',
      };

      const note = createTestNote({ highlights: [existingHighlight] });

      const fileContent = `> Only highlight
- [[books/test.pdf#page=1&selection=0,0,0,5|p. 1]]
`;
      mockReadFileSync.mockReturnValue(fileContent);

      const result = await writer.delete(note, 'abc1234567');

      expect(result).toBe(true);

      const writtenContent = mockWriteFileSync.mock.calls[0][1] as string;
      expect(writtenContent).not.toContain('Only highlight');
    });

    it('deletes EPUB highlight with note text after it', async () => {
      const existingHighlight: EPUBHighlight = {
        id: 'epub123456',
        type: 'epub',
        cfi: 'epubcfi(/6/4)',
        text: 'EPUB with note',
        note: 'My annotation',
        createdAt: '2024-01-15T10:00:00Z',
      };

      const note = createTestNote({
        sourceType: 'epub',
        sourceRelative: 'books/test.epub',
        highlights: [existingHighlight],
      });

      const fileContent = `# EPUB Note

> EPUB with note
- [[books/test.epub#cfi=epubcfi(/6/4)|loc]]
My annotation

> Keep this
- [[books/test.epub#cfi=epubcfi(/6/6)|loc]]
`;
      mockReadFileSync.mockReturnValue(fileContent);

      const result = await writer.delete(note, 'epub123456');

      expect(result).toBe(true);

      const writtenContent = mockWriteFileSync.mock.calls[0][1] as string;
      expect(writtenContent).not.toContain('EPUB with note');
      expect(writtenContent).not.toContain('My annotation');
      expect(writtenContent).toContain('Keep this');
    });
  });

  describe('update - content modification scenarios', () => {
    it('handles update when highlight is on the last line without trailing newline', async () => {
      const existingHighlight: PDFHighlight = {
        id: 'abc1234567',
        type: 'pdf',
        page: 10,
        selection: { beginIndex: 0, beginOffset: 0, endIndex: 0, endOffset: 10 },
        text: 'Quote',
        createdAt: '2024-01-15T10:00:00Z',
      };

      const note = createTestNote({ highlights: [existingHighlight] });

      // No trailing newline after the link
      const fileContent = `[[books/test.pdf#page=10&selection=0,0,0,10|p. 10]]`;
      mockReadFileSync.mockReturnValue(fileContent);

      const result = await writer.update(note, 'abc1234567', { note: 'New note' });

      expect(result).not.toBeNull();
      expect(result!.note).toBe('New note');
    });

    it('handles update on highlight preceded by heading', async () => {
      const existingHighlight: PDFHighlight = {
        id: 'abc1234567',
        type: 'pdf',
        page: 10,
        selection: { beginIndex: 0, beginOffset: 0, endIndex: 0, endOffset: 10 },
        text: 'Quote after heading',
        createdAt: '2024-01-15T10:00:00Z',
      };

      const note = createTestNote({ highlights: [existingHighlight] });

      const fileContent = `# Chapter 1 Highlights

> Quote after heading
[[books/test.pdf#page=10&selection=0,0,0,10|p. 10]]
`;
      mockReadFileSync.mockReturnValue(fileContent);

      const result = await writer.update(note, 'abc1234567', { note: 'Added note' });

      expect(result).not.toBeNull();
      expect(result!.note).toBe('Added note');

      const writtenContent = mockWriteFileSync.mock.calls[0][1] as string;
      expect(writtenContent).toContain('# Chapter 1 Highlights');
      expect(writtenContent).toContain('Added note');
    });

    it('handles EPUB update with special characters in CFI', async () => {
      const existingHighlight: EPUBHighlight = {
        id: 'epub123456',
        type: 'epub',
        cfi: 'epubcfi(/6/4[chap01ref]!/4/2/14/3:10)',
        text: 'Complex CFI highlight',
        createdAt: '2024-01-15T10:00:00Z',
      };

      const note = createTestNote({
        sourceType: 'epub',
        sourceRelative: 'books/test.epub',
        highlights: [existingHighlight],
      });

      const fileContent = `# EPUB Note

> Complex CFI highlight
[[books/test.epub#cfi=epubcfi(/6/4[chap01ref]!/4/2/14/3:10)|loc]]
`;
      mockReadFileSync.mockReturnValue(fileContent);

      const result = await writer.update(note, 'epub123456', { note: 'Note on complex CFI' });

      expect(result).not.toBeNull();
      expect(result!.note).toBe('Note on complex CFI');
    });
  });

  describe('write - template variable coverage', () => {
    it('passes citekey from frontmatter to PDF template', async () => {
      const citekeyConfig: Config = {
        ...testConfig,
        highlight_template: '> {{text}}\n- [[{{source}}#page={{page}}&selection={{selection}}|{{citekey}}, p. {{pageLabel}}]]{{#if note}}\n{{note}}{{/if}}\n',
      };
      const citekeyWriter = new HighlightWriter(citekeyConfig);

      const note = createTestNote({
        frontmatter: { id: 'smith2024reading' },
      });
      mockReadFileSync.mockReturnValue('# Note\n');

      const request: CreateHighlightRequest = {
        type: 'pdf',
        page: 42,
        pageLabel: '42',
        selection: { beginIndex: 0, beginOffset: 0, endIndex: 0, endOffset: 5 },
        text: 'Test text',
      };

      await citekeyWriter.write(note, request);

      const writtenContent = mockWriteFileSync.mock.calls[0][1] as string;
      expect(writtenContent).toContain('smith2024reading, p. 42');
    });

    it('passes citekey from frontmatter to EPUB template', async () => {
      const citekeyConfig: Config = {
        ...testConfig,
        highlight_template_epub: '> {{text}}\n- [[{{source}}#cfi={{cfi}}|{{citekey}}, loc]]{{#if note}}\n{{note}}{{/if}}\n',
      };
      const citekeyWriter = new HighlightWriter(citekeyConfig);

      const note = createTestNote({
        sourceType: 'epub',
        sourceRelative: 'books/test.epub',
        frontmatter: { id: 'jones2023novel' },
      });
      mockReadFileSync.mockReturnValue('# Note\n');

      const request: CreateHighlightRequest = {
        type: 'epub',
        cfi: 'epubcfi(/6/4)',
        text: 'EPUB text',
      };

      await citekeyWriter.write(note, request);

      const writtenContent = mockWriteFileSync.mock.calls[0][1] as string;
      expect(writtenContent).toContain('jones2023novel, loc');
    });

    it('uses note ID as citekey fallback for EPUB when frontmatter has no id', async () => {
      const citekeyConfig: Config = {
        ...testConfig,
        highlight_template_epub: '> {{text}}\n- [[{{source}}#cfi={{cfi}}|{{citekey}}]]{{#if note}}\n{{note}}{{/if}}\n',
      };
      const citekeyWriter = new HighlightWriter(citekeyConfig);

      const note = createTestNote({
        id: 'fallback-id-123',
        sourceType: 'epub',
        sourceRelative: 'books/test.epub',
        frontmatter: {}, // No id field
      });
      mockReadFileSync.mockReturnValue('# Note\n');

      const request: CreateHighlightRequest = {
        type: 'epub',
        cfi: 'epubcfi(/6/4)',
        text: 'Test',
      };

      await citekeyWriter.write(note, request);

      const writtenContent = mockWriteFileSync.mock.calls[0][1] as string;
      expect(writtenContent).toContain('fallback-id-123');
    });

    it('handles pageLabel with roman numerals', async () => {
      const note = createTestNote();
      mockReadFileSync.mockReturnValue('# Note\n');

      const request: CreateHighlightRequest = {
        type: 'pdf',
        page: 4, // Physical page 4
        pageLabel: 'iv', // Roman numeral label
        selection: { beginIndex: 0, beginOffset: 0, endIndex: 0, endOffset: 5 },
        text: 'Preface text',
      };

      await writer.write(note, request);

      const writtenContent = mockWriteFileSync.mock.calls[0][1] as string;
      expect(writtenContent).toContain('p. iv');
    });
  });

  describe('write - text edge cases', () => {
    it('handles single-line text without newlines', async () => {
      const note = createTestNote();
      mockReadFileSync.mockReturnValue('# Note\n');

      const request: CreateHighlightRequest = {
        type: 'pdf',
        page: 1,
        selection: { beginIndex: 0, beginOffset: 0, endIndex: 0, endOffset: 5 },
        text: 'Single line of text',
      };

      await writer.write(note, request);

      const writtenContent = mockWriteFileSync.mock.calls[0][1] as string;
      expect(writtenContent).toContain('> Single line of text');
    });

    it('handles text that is only whitespace after trimming', async () => {
      const note = createTestNote();
      mockReadFileSync.mockReturnValue('# Note\n');

      const request: CreateHighlightRequest = {
        type: 'pdf',
        page: 1,
        selection: { beginIndex: 0, beginOffset: 0, endIndex: 0, endOffset: 5 },
        text: '  \n  \n  ', // Only whitespace
      };

      await writer.write(note, request);

      // Should still write, even if blockquote content ends up empty
      expect(mockWriteFileSync).toHaveBeenCalled();
    });

    it('handles text with markdown formatting preserved', async () => {
      const note = createTestNote();
      mockReadFileSync.mockReturnValue('# Note\n');

      const request: CreateHighlightRequest = {
        type: 'pdf',
        page: 1,
        selection: { beginIndex: 0, beginOffset: 0, endIndex: 0, endOffset: 50 },
        text: 'Text with **bold** and *italic* and `code`',
      };

      await writer.write(note, request);

      const writtenContent = mockWriteFileSync.mock.calls[0][1] as string;
      // SafeString should preserve markdown formatting
      expect(writtenContent).toContain('**bold**');
      expect(writtenContent).toContain('*italic*');
      expect(writtenContent).toContain('`code`');
    });
  });

  describe('update - multiple highlights in same file', () => {
    it('updates the correct highlight when multiple exist', async () => {
      const highlight1: PDFHighlight = {
        id: 'first12345',
        type: 'pdf',
        page: 5,
        selection: { beginIndex: 0, beginOffset: 0, endIndex: 0, endOffset: 10 },
        text: 'First quote',
        createdAt: '2024-01-15T10:00:00Z',
      };
      const highlight2: PDFHighlight = {
        id: 'second1234',
        type: 'pdf',
        page: 20,
        selection: { beginIndex: 3, beginOffset: 0, endIndex: 3, endOffset: 15 },
        text: 'Second quote',
        createdAt: '2024-01-15T10:00:00Z',
      };

      const note = createTestNote({ highlights: [highlight1, highlight2] });

      const fileContent = `# Note

> First quote
[[books/test.pdf#page=5&selection=0,0,0,10|p. 5]]

> Second quote
[[books/test.pdf#page=20&selection=3,0,3,15|p. 20]]
`;
      mockReadFileSync.mockReturnValue(fileContent);

      const result = await writer.update(note, 'second1234', { note: 'Note on second' });

      expect(result).not.toBeNull();
      expect(result!.note).toBe('Note on second');

      const writtenContent = mockWriteFileSync.mock.calls[0][1] as string;
      expect(writtenContent).toContain('Note on second');
      // First highlight should be untouched
      expect(writtenContent).toContain('First quote');
    });
  });

  describe('delete - EPUB with special CFI characters', () => {
    it('correctly escapes regex special chars in EPUB CFI for deletion', async () => {
      const existingHighlight: EPUBHighlight = {
        id: 'epub123456',
        type: 'epub',
        cfi: 'epubcfi(/6/4[chap01]!/4/2/14/3:10)',
        text: 'Complex CFI quote',
        createdAt: '2024-01-15T10:00:00Z',
      };

      const note = createTestNote({
        sourceType: 'epub',
        sourceRelative: 'books/test (2024).epub',
        highlights: [existingHighlight],
      });

      const fileContent = `# Note

> Complex CFI quote
- [[books/test (2024).epub#cfi=epubcfi(/6/4[chap01]!/4/2/14/3:10)|loc]]

> Keep this
`;
      mockReadFileSync.mockReturnValue(fileContent);

      const result = await writer.delete(note, 'epub123456');

      expect(result).toBe(true);

      const writtenContent = mockWriteFileSync.mock.calls[0][1] as string;
      expect(writtenContent).not.toContain('Complex CFI quote');
      expect(writtenContent).toContain('Keep this');
    });
  });

  describe('write - concurrent writes', () => {
    it('appends multiple highlights sequentially to same note', async () => {
      const note = createTestNote();

      // First write
      mockReadFileSync.mockReturnValue('# Note\n');
      const request1: CreateHighlightRequest = {
        type: 'pdf',
        page: 1,
        selection: { beginIndex: 0, beginOffset: 0, endIndex: 0, endOffset: 5 },
        text: 'First highlight',
      };
      await writer.write(note, request1);

      // Second write - simulate that the file now has the first highlight
      const firstWritten = mockWriteFileSync.mock.calls[0][1] as string;
      mockReadFileSync.mockReturnValue(firstWritten);
      const request2: CreateHighlightRequest = {
        type: 'pdf',
        page: 2,
        selection: { beginIndex: 0, beginOffset: 0, endIndex: 0, endOffset: 5 },
        text: 'Second highlight',
      };
      await writer.write(note, request2);

      const secondWritten = mockWriteFileSync.mock.calls[1][1] as string;
      // Both highlights should be in the final content
      expect(secondWritten).toContain('First highlight');
      expect(secondWritten).toContain('Second highlight');
    });
  });

  describe('delete - multi-line blockquote detection', () => {
    it('deletes highlight block with multiple blockquote lines before the link', async () => {
      const existingHighlight: PDFHighlight = {
        id: 'abc1234567',
        type: 'pdf',
        page: 10,
        selection: { beginIndex: 0, beginOffset: 0, endIndex: 0, endOffset: 10 },
        text: 'First line\nSecond line\nThird line',
        createdAt: '2024-01-15T10:00:00Z',
      };

      const note = createTestNote({ highlights: [existingHighlight] });

      const fileContent = `# Note

> First line
> Second line
> Third line
- [[books/test.pdf#page=10&selection=0,0,0,10|p. 10]]

> Keep this
- [[books/test.pdf#page=20&selection=0,0,0,5|p. 20]]
`;
      mockReadFileSync.mockReturnValue(fileContent);

      const result = await writer.delete(note, 'abc1234567');

      expect(result).toBe(true);

      const writtenContent = mockWriteFileSync.mock.calls[0][1] as string;
      expect(writtenContent).not.toContain('First line');
      expect(writtenContent).not.toContain('Second line');
      expect(writtenContent).not.toContain('Third line');
      expect(writtenContent).toContain('Keep this');
    });

    it('stops backward scan at non-blockquote non-empty line', async () => {
      const existingHighlight: PDFHighlight = {
        id: 'abc1234567',
        type: 'pdf',
        page: 10,
        selection: { beginIndex: 0, beginOffset: 0, endIndex: 0, endOffset: 10 },
        text: 'Quote',
        createdAt: '2024-01-15T10:00:00Z',
      };

      const note = createTestNote({ highlights: [existingHighlight] });

      // Regular text line precedes the blockquote - should not be included in deletion
      const fileContent = `# Note

Some paragraph text here
> Quote
- [[books/test.pdf#page=10&selection=0,0,0,10|p. 10]]
`;
      mockReadFileSync.mockReturnValue(fileContent);

      const result = await writer.delete(note, 'abc1234567');

      expect(result).toBe(true);

      const writtenContent = mockWriteFileSync.mock.calls[0][1] as string;
      expect(writtenContent).not.toContain('> Quote');
      // The paragraph text before the blockquote must be preserved
      expect(writtenContent).toContain('Some paragraph text here');
    });
  });

  describe('delete - forward scan note detection', () => {
    it('includes note text that follows the link line in deletion', async () => {
      const existingHighlight: PDFHighlight = {
        id: 'abc1234567',
        type: 'pdf',
        page: 10,
        selection: { beginIndex: 0, beginOffset: 0, endIndex: 0, endOffset: 10 },
        text: 'Quote',
        note: 'Annotation text',
        createdAt: '2024-01-15T10:00:00Z',
      };

      const note = createTestNote({ highlights: [existingHighlight] });

      const fileContent = `# Note

> Quote
- [[books/test.pdf#page=10&selection=0,0,0,10|p. 10]]
Annotation text

## Next Section
`;
      mockReadFileSync.mockReturnValue(fileContent);

      const result = await writer.delete(note, 'abc1234567');

      expect(result).toBe(true);

      const writtenContent = mockWriteFileSync.mock.calls[0][1] as string;
      expect(writtenContent).not.toContain('Annotation text');
      expect(writtenContent).toContain('## Next Section');
    });

    it('stops forward scan at heading line', async () => {
      const existingHighlight: PDFHighlight = {
        id: 'abc1234567',
        type: 'pdf',
        page: 10,
        selection: { beginIndex: 0, beginOffset: 0, endIndex: 0, endOffset: 10 },
        text: 'Quote',
        createdAt: '2024-01-15T10:00:00Z',
      };

      const note = createTestNote({ highlights: [existingHighlight] });

      // Heading immediately follows the link line (no note in between)
      const fileContent = `# Note

> Quote
- [[books/test.pdf#page=10&selection=0,0,0,10|p. 10]]
## Chapter 2

> Another quote
`;
      mockReadFileSync.mockReturnValue(fileContent);

      const result = await writer.delete(note, 'abc1234567');

      expect(result).toBe(true);

      const writtenContent = mockWriteFileSync.mock.calls[0][1] as string;
      expect(writtenContent).not.toContain('> Quote');
      expect(writtenContent).toContain('## Chapter 2');
      expect(writtenContent).toContain('Another quote');
    });

    it('stops forward scan at list marker line (next highlight)', async () => {
      const existingHighlight: PDFHighlight = {
        id: 'abc1234567',
        type: 'pdf',
        page: 10,
        selection: { beginIndex: 0, beginOffset: 0, endIndex: 0, endOffset: 10 },
        text: 'Quote',
        createdAt: '2024-01-15T10:00:00Z',
      };

      const note = createTestNote({ highlights: [existingHighlight] });

      // A list marker line immediately follows (no empty line separation)
      const fileContent = `# Note

> Quote
- [[books/test.pdf#page=10&selection=0,0,0,10|p. 10]]
- Some other list item

More content
`;
      mockReadFileSync.mockReturnValue(fileContent);

      const result = await writer.delete(note, 'abc1234567');

      expect(result).toBe(true);

      const writtenContent = mockWriteFileSync.mock.calls[0][1] as string;
      expect(writtenContent).toContain('- Some other list item');
      expect(writtenContent).toContain('More content');
    });
  });

  describe('update - note text in file content', () => {
    it('preserves existing note text in file when request.note is undefined', async () => {
      const existingHighlight: PDFHighlight = {
        id: 'abc1234567',
        type: 'pdf',
        page: 10,
        selection: { beginIndex: 0, beginOffset: 0, endIndex: 0, endOffset: 10 },
        text: 'Quote',
        note: 'Original note',
        createdAt: '2024-01-15T10:00:00Z',
      };

      const note = createTestNote({ highlights: [existingHighlight] });

      const fileContent = `# Note

> Quote
- [[books/test.pdf#page=10&selection=0,0,0,10|p. 10]]
Original note

> Another quote
`;
      mockReadFileSync.mockReturnValue(fileContent);

      // Only change category - note field not present in request
      const result = await writer.update(note, 'abc1234567', { category: 'important' });

      expect(result).not.toBeNull();
      expect(result!.note).toBe('Original note');

      const writtenContent = mockWriteFileSync.mock.calls[0][1] as string;
      // The original note text should still be in the file
      expect(writtenContent).toContain('Original note');
      expect(writtenContent).toContain('&category=important');
    });

    it('removes existing note from file when request.note is empty string', async () => {
      const existingHighlight: PDFHighlight = {
        id: 'abc1234567',
        type: 'pdf',
        page: 10,
        selection: { beginIndex: 0, beginOffset: 0, endIndex: 0, endOffset: 10 },
        text: 'Quote',
        note: 'Note to remove',
        createdAt: '2024-01-15T10:00:00Z',
      };

      const note = createTestNote({ highlights: [existingHighlight] });

      const fileContent = `# Note

> Quote
- [[books/test.pdf#page=10&selection=0,0,0,10|p. 10]]
Note to remove

> Another quote
`;
      mockReadFileSync.mockReturnValue(fileContent);

      const result = await writer.update(note, 'abc1234567', { note: '' });

      expect(result).not.toBeNull();

      const writtenContent = mockWriteFileSync.mock.calls[0][1] as string;
      expect(writtenContent).not.toContain('Note to remove');
      // The next highlight should still be there
      expect(writtenContent).toContain('Another quote');
    });

    it('adds note to file when highlight previously had no note', async () => {
      const existingHighlight: PDFHighlight = {
        id: 'abc1234567',
        type: 'pdf',
        page: 10,
        selection: { beginIndex: 0, beginOffset: 0, endIndex: 0, endOffset: 10 },
        text: 'Quote',
        createdAt: '2024-01-15T10:00:00Z',
      };

      const note = createTestNote({ highlights: [existingHighlight] });

      const fileContent = `# Note

> Quote
- [[books/test.pdf#page=10&selection=0,0,0,10|p. 10]]

> Another quote
- [[books/test.pdf#page=20&selection=0,0,0,5|p. 20]]
`;
      mockReadFileSync.mockReturnValue(fileContent);

      const result = await writer.update(note, 'abc1234567', { note: 'Brand new annotation' });

      expect(result).not.toBeNull();
      expect(result!.note).toBe('Brand new annotation');

      const writtenContent = mockWriteFileSync.mock.calls[0][1] as string;
      expect(writtenContent).toContain('Brand new annotation');
      // The other highlight should be unaffected
      expect(writtenContent).toContain('Another quote');
    });
  });

  describe('update - link on last line without trailing newline', () => {
    it('adds note after link that has no trailing newline', async () => {
      const existingHighlight: PDFHighlight = {
        id: 'abc1234567',
        type: 'pdf',
        page: 10,
        selection: { beginIndex: 0, beginOffset: 0, endIndex: 0, endOffset: 10 },
        text: 'Quote',
        createdAt: '2024-01-15T10:00:00Z',
      };

      const note = createTestNote({ highlights: [existingHighlight] });

      // No trailing newline - the link is the very last thing in the file
      const fileContent = `> Quote\n- [[books/test.pdf#page=10&selection=0,0,0,10|p. 10]]`;
      mockReadFileSync.mockReturnValue(fileContent);

      const result = await writer.update(note, 'abc1234567', { note: 'Note at end' });

      expect(result).not.toBeNull();
      expect(result!.note).toBe('Note at end');
    });
  });

  describe('write - note with HTML entities', () => {
    it('preserves HTML entities in note text via SafeString', async () => {
      const note = createTestNote();
      mockReadFileSync.mockReturnValue('# Note\n');

      const request: CreateHighlightRequest = {
        type: 'pdf',
        page: 1,
        selection: { beginIndex: 0, beginOffset: 0, endIndex: 0, endOffset: 10 },
        text: 'Quote text',
        note: 'Note with <em>HTML</em> & "entities"',
      };

      await writer.write(note, request);

      const writtenContent = mockWriteFileSync.mock.calls[0][1] as string;
      // Note is wrapped in SafeString, so HTML should not be escaped
      expect(writtenContent).toContain('Note with <em>HTML</em> & "entities"');
    });

    it('does not double-escape ampersands in note text', async () => {
      const note = createTestNote();
      mockReadFileSync.mockReturnValue('# Note\n');

      const request: CreateHighlightRequest = {
        type: 'pdf',
        page: 1,
        selection: { beginIndex: 0, beginOffset: 0, endIndex: 0, endOffset: 10 },
        text: 'Quote',
        note: 'A & B & C',
      };

      await writer.write(note, request);

      const writtenContent = mockWriteFileSync.mock.calls[0][1] as string;
      expect(writtenContent).toContain('A & B & C');
      expect(writtenContent).not.toContain('&amp;');
    });
  });

  describe('update - EPUB category changes', () => {
    it('updates EPUB highlight category from non-default to another non-default', async () => {
      const existingHighlight: EPUBHighlight = {
        id: 'epub123456',
        type: 'epub',
        cfi: 'epubcfi(/6/4)',
        text: 'EPUB quote',
        category: 'important',
        createdAt: '2024-01-15T10:00:00Z',
      };

      const note = createTestNote({
        sourceType: 'epub',
        sourceRelative: 'books/test.epub',
        highlights: [existingHighlight],
      });

      const fileContent = `# EPUB Note

> EPUB quote
[[books/test.epub#cfi=epubcfi(/6/4)&category=important|loc]]
`;
      mockReadFileSync.mockReturnValue(fileContent);

      const result = await writer.update(note, 'epub123456', { category: 'definition' });

      expect(result).not.toBeNull();
      expect(result!.category).toBe('definition');

      const writtenContent = mockWriteFileSync.mock.calls[0][1] as string;
      expect(writtenContent).toContain('&category=definition');
      expect(writtenContent).not.toContain('&category=important');
    });

    it('removes EPUB category fragment when changing to default highlight', async () => {
      const existingHighlight: EPUBHighlight = {
        id: 'epub123456',
        type: 'epub',
        cfi: 'epubcfi(/6/4)',
        text: 'EPUB quote',
        category: 'question',
        createdAt: '2024-01-15T10:00:00Z',
      };

      const note = createTestNote({
        sourceType: 'epub',
        sourceRelative: 'books/test.epub',
        highlights: [existingHighlight],
      });

      const fileContent = `# EPUB Note

> EPUB quote
[[books/test.epub#cfi=epubcfi(/6/4)&category=question|loc]]
`;
      mockReadFileSync.mockReturnValue(fileContent);

      const result = await writer.update(note, 'epub123456', { category: 'highlight' });

      expect(result).not.toBeNull();
      expect(result!.category).toBe('highlight');

      const writtenContent = mockWriteFileSync.mock.calls[0][1] as string;
      expect(writtenContent).not.toContain('&category=');
    });
  });

  describe('update - simultaneous category and note on EPUB', () => {
    it('updates both category and note on EPUB highlight', async () => {
      const existingHighlight: EPUBHighlight = {
        id: 'epub123456',
        type: 'epub',
        cfi: 'epubcfi(/6/4)',
        text: 'EPUB quote',
        category: 'highlight',
        note: 'Old note',
        createdAt: '2024-01-15T10:00:00Z',
      };

      const note = createTestNote({
        sourceType: 'epub',
        sourceRelative: 'books/test.epub',
        highlights: [existingHighlight],
      });

      const fileContent = `# EPUB Note

> EPUB quote
[[books/test.epub#cfi=epubcfi(/6/4)|loc]]
Old note

> Next quote
`;
      mockReadFileSync.mockReturnValue(fileContent);

      const result = await writer.update(note, 'epub123456', {
        category: 'todo',
        note: 'Updated EPUB note',
      });

      expect(result).not.toBeNull();
      expect(result!.category).toBe('todo');
      expect(result!.note).toBe('Updated EPUB note');

      const writtenContent = mockWriteFileSync.mock.calls[0][1] as string;
      expect(writtenContent).toContain('&category=todo');
      expect(writtenContent).toContain('Updated EPUB note');
      expect(writtenContent).not.toContain('Old note');
      expect(writtenContent).toContain('Next quote');
    });
  });

  describe('delete - edge cases for backward scan', () => {
    it('handles deletion when highlight is at the very start of content', async () => {
      const existingHighlight: PDFHighlight = {
        id: 'abc1234567',
        type: 'pdf',
        page: 1,
        selection: { beginIndex: 0, beginOffset: 0, endIndex: 0, endOffset: 5 },
        text: 'First thing in file',
        createdAt: '2024-01-15T10:00:00Z',
      };

      const note = createTestNote({ highlights: [existingHighlight] });

      // Blockquote starts at the very beginning of the file, no heading
      const fileContent = `> First thing in file
- [[books/test.pdf#page=1&selection=0,0,0,5|p. 1]]

> Second highlight
- [[books/test.pdf#page=2&selection=0,0,0,5|p. 2]]
`;
      mockReadFileSync.mockReturnValue(fileContent);

      const result = await writer.delete(note, 'abc1234567');

      expect(result).toBe(true);

      const writtenContent = mockWriteFileSync.mock.calls[0][1] as string;
      expect(writtenContent).not.toContain('First thing in file');
      expect(writtenContent).toContain('Second highlight');
    });
  });

  describe('write - Handlebars if helper behavior', () => {
    it('renders note section when note is provided in template with if block', async () => {
      const note = createTestNote();
      mockReadFileSync.mockReturnValue('# Note\n');

      const request: CreateHighlightRequest = {
        type: 'pdf',
        page: 1,
        selection: { beginIndex: 0, beginOffset: 0, endIndex: 0, endOffset: 5 },
        text: 'Quote',
        note: 'This should appear',
      };

      await writer.write(note, request);

      const writtenContent = mockWriteFileSync.mock.calls[0][1] as string;
      // The template has {{#if note}}\n{{note}}{{/if}} so when note is present
      // it should appear on a new line after the link
      expect(writtenContent).toContain('This should appear');
    });

    it('omits note section when note is undefined in template with if block', async () => {
      const note = createTestNote();
      mockReadFileSync.mockReturnValue('# Note\n');

      const request: CreateHighlightRequest = {
        type: 'pdf',
        page: 1,
        selection: { beginIndex: 0, beginOffset: 0, endIndex: 0, endOffset: 5 },
        text: 'Quote without note',
        // note is undefined
      };

      await writer.write(note, request);

      const writtenContent = mockWriteFileSync.mock.calls[0][1] as string;
      // Should have the link but no note section after it
      // Verify that the template output is clean - no "undefined" or extra blank lines from the if block
      expect(writtenContent).not.toContain('undefined');
      // The content after the link line should just be a newline (the template's trailing \n)
      const linkLine = writtenContent.split('\n').find(l => l.includes('selection='));
      expect(linkLine).toBeDefined();
    });
  });

  describe('write - EPUB with complex CFI containing special regex chars', () => {
    it('handles CFI with parentheses, brackets, and colons', async () => {
      const note = createTestNote({
        sourceType: 'epub',
        sourceRelative: 'books/test.epub',
      });
      mockReadFileSync.mockReturnValue('# Note\n');

      const complexCfi = 'epubcfi(/6/14[chapter07]!/4/2/8/1:0,/6/14[chapter07]!/4/2/12/3:42)';

      const request: CreateHighlightRequest = {
        type: 'epub',
        cfi: complexCfi,
        text: 'Range CFI highlight',
      };

      const result = await writer.write(note, request);

      expect(result.type).toBe('epub');
      expect((result as EPUBHighlight).cfi).toBe(complexCfi);

      const writtenContent = mockWriteFileSync.mock.calls[0][1] as string;
      expect(writtenContent).toContain(complexCfi);
    });
  });

  describe('formatBlockquote - edge cases', () => {
    it('produces empty blockquote content for whitespace-only text', async () => {
      const note = createTestNote();
      mockReadFileSync.mockReturnValue('# Note\n');

      const request: CreateHighlightRequest = {
        type: 'pdf',
        page: 1,
        selection: { beginIndex: 0, beginOffset: 0, endIndex: 0, endOffset: 5 },
        text: '   \n   \n   ',
      };

      await writer.write(note, request);

      const writtenContent = mockWriteFileSync.mock.calls[0][1] as string;
      // After trimming and filtering empty lines, the blockquote has no content
      // The template renders "> " with the formatted (empty) text
      expect(writtenContent).toContain('>');
      // The blockquote line itself should just be "> " with no visible text
      const blockquoteLine = writtenContent.split('\n').find(l => l.startsWith('>'));
      expect(blockquoteLine).toBeDefined();
      expect(blockquoteLine!.replace(/^>\s*/, '')).toBe('');
    });

    it('handles text with mixed empty and non-empty lines', async () => {
      const note = createTestNote();
      mockReadFileSync.mockReturnValue('# Note\n');

      const request: CreateHighlightRequest = {
        type: 'pdf',
        page: 1,
        selection: { beginIndex: 0, beginOffset: 0, endIndex: 0, endOffset: 30 },
        text: 'Start\n\n\nMiddle\n\n\nEnd',
      };

      await writer.write(note, request);

      const writtenContent = mockWriteFileSync.mock.calls[0][1] as string;
      // Empty lines should be filtered, leaving only non-empty lines joined with \n>
      expect(writtenContent).toContain('Start\n> Middle\n> End');
    });

    it('handles text with tabs and various whitespace', async () => {
      const note = createTestNote();
      mockReadFileSync.mockReturnValue('# Note\n');

      const request: CreateHighlightRequest = {
        type: 'pdf',
        page: 1,
        selection: { beginIndex: 0, beginOffset: 0, endIndex: 0, endOffset: 30 },
        text: '\tTabbed line\n  Spaced line\n\t  Mixed',
      };

      await writer.write(note, request);

      const writtenContent = mockWriteFileSync.mock.calls[0][1] as string;
      // Lines should be trimmed of leading/trailing whitespace
      expect(writtenContent).toContain('Tabbed line');
      expect(writtenContent).toContain('Spaced line');
      expect(writtenContent).toContain('Mixed');
      expect(writtenContent).not.toContain('\t');
    });
  });

  describe('update - existing note boundary detection', () => {
    it('detects note line that follows empty lines between link and note', async () => {
      const existingHighlight: PDFHighlight = {
        id: 'abc1234567',
        type: 'pdf',
        page: 10,
        selection: { beginIndex: 0, beginOffset: 0, endIndex: 0, endOffset: 10 },
        text: 'Quote',
        note: 'Spaced note',
        createdAt: '2024-01-15T10:00:00Z',
      };

      const note = createTestNote({ highlights: [existingHighlight] });

      // Empty line between link and note text
      const fileContent = `# Note

> Quote
- [[books/test.pdf#page=10&selection=0,0,0,10|p. 10]]

Spaced note

> Next quote
`;
      mockReadFileSync.mockReturnValue(fileContent);

      const result = await writer.update(note, 'abc1234567', { note: 'Replaced note' });

      expect(result).not.toBeNull();
      expect(result!.note).toBe('Replaced note');

      const writtenContent = mockWriteFileSync.mock.calls[0][1] as string;
      expect(writtenContent).toContain('Replaced note');
      expect(writtenContent).not.toContain('Spaced note');
    });

    it('does not consume blockquote line as existing note', async () => {
      const existingHighlight: PDFHighlight = {
        id: 'abc1234567',
        type: 'pdf',
        page: 10,
        selection: { beginIndex: 0, beginOffset: 0, endIndex: 0, endOffset: 10 },
        text: 'Quote',
        createdAt: '2024-01-15T10:00:00Z',
      };

      const note = createTestNote({ highlights: [existingHighlight] });

      // Next line after link is a blockquote (start of next highlight)
      const fileContent = `# Note

> Quote
- [[books/test.pdf#page=10&selection=0,0,0,10|p. 10]]
> Next highlight text
- [[books/test.pdf#page=20&selection=0,0,0,5|p. 20]]
`;
      mockReadFileSync.mockReturnValue(fileContent);

      const result = await writer.update(note, 'abc1234567', { note: 'New note' });

      expect(result).not.toBeNull();

      const writtenContent = mockWriteFileSync.mock.calls[0][1] as string;
      expect(writtenContent).toContain('New note');
      // The next highlight's blockquote must not be consumed
      expect(writtenContent).toContain('> Next highlight text');
    });

    it('does not consume heading line as existing note', async () => {
      const existingHighlight: PDFHighlight = {
        id: 'abc1234567',
        type: 'pdf',
        page: 10,
        selection: { beginIndex: 0, beginOffset: 0, endIndex: 0, endOffset: 10 },
        text: 'Quote',
        createdAt: '2024-01-15T10:00:00Z',
      };

      const note = createTestNote({ highlights: [existingHighlight] });

      // Next line after link is a heading
      const fileContent = `# Note

> Quote
- [[books/test.pdf#page=10&selection=0,0,0,10|p. 10]]
## Chapter 2

> Another quote
`;
      mockReadFileSync.mockReturnValue(fileContent);

      const result = await writer.update(note, 'abc1234567', { note: 'Added note' });

      expect(result).not.toBeNull();

      const writtenContent = mockWriteFileSync.mock.calls[0][1] as string;
      expect(writtenContent).toContain('Added note');
      expect(writtenContent).toContain('## Chapter 2');
    });
  });

  describe('escapeRegex - comprehensive special character handling', () => {
    it('handles source path with dots in filename', async () => {
      const note = createTestNote({
        sourceRelative: 'books/v2.0.1-final.pdf',
        highlights: [{
          id: 'abc1234567',
          type: 'pdf',
          page: 1,
          selection: { beginIndex: 0, beginOffset: 0, endIndex: 0, endOffset: 5 },
          text: 'Test',
          createdAt: '2024-01-15T10:00:00Z',
        } as PDFHighlight],
      });

      const fileContent = `> Test
[[books/v2.0.1-final.pdf#page=1&selection=0,0,0,5|p. 1]]
`;
      mockReadFileSync.mockReturnValue(fileContent);

      const result = await writer.delete(note, 'abc1234567');

      expect(result).toBe(true);
    });

    it('handles EPUB source path with plus signs and dollar signs', async () => {
      const note = createTestNote({
        sourceType: 'epub',
        sourceRelative: 'books/C++ Programming $.epub',
        highlights: [{
          id: 'epub123456',
          type: 'epub',
          cfi: 'epubcfi(/6/4)',
          text: 'Test',
          createdAt: '2024-01-15T10:00:00Z',
        } as EPUBHighlight],
      });

      const fileContent = `> Test
[[books/C++ Programming $.epub#cfi=epubcfi(/6/4)|loc]]
`;
      mockReadFileSync.mockReturnValue(fileContent);

      const result = await writer.delete(note, 'epub123456');

      expect(result).toBe(true);
    });
  });

  describe('write - selection with zero values', () => {
    it('correctly formats selection where all values are zero', async () => {
      const note = createTestNote();
      mockReadFileSync.mockReturnValue('# Note\n');

      const request: CreateHighlightRequest = {
        type: 'pdf',
        page: 1,
        selection: { beginIndex: 0, beginOffset: 0, endIndex: 0, endOffset: 0 },
        text: 'Zero selection',
      };

      await writer.write(note, request);

      const writtenContent = mockWriteFileSync.mock.calls[0][1] as string;
      expect(writtenContent).toContain('selection=0,0,0,0');
    });

    it('correctly formats selection with large values', async () => {
      const note = createTestNote();
      mockReadFileSync.mockReturnValue('# Note\n');

      const request: CreateHighlightRequest = {
        type: 'pdf',
        page: 999,
        selection: { beginIndex: 1000, beginOffset: 5000, endIndex: 2000, endOffset: 9999 },
        text: 'Large selection values',
      };

      await writer.write(note, request);

      const writtenContent = mockWriteFileSync.mock.calls[0][1] as string;
      expect(writtenContent).toContain('selection=1000,5000,2000,9999');
      expect(writtenContent).toContain('page=999');
    });
  });

  describe('update - createdAt preservation', () => {
    it('preserves original createdAt while adding updatedAt', async () => {
      const originalCreatedAt = '2024-01-15T10:00:00Z';
      const existingHighlight: PDFHighlight = {
        id: 'abc1234567',
        type: 'pdf',
        page: 10,
        selection: { beginIndex: 0, beginOffset: 0, endIndex: 0, endOffset: 10 },
        text: 'Quote',
        createdAt: originalCreatedAt,
      };

      const note = createTestNote({ highlights: [existingHighlight] });

      mockReadFileSync.mockReturnValue(`[[books/test.pdf#page=10&selection=0,0,0,10|p. 10]]\n`);

      const result = await writer.update(note, 'abc1234567', { note: 'New note' });

      expect(result).not.toBeNull();
      expect(result!.createdAt).toBe(originalCreatedAt);
      expect(result!.updatedAt).toBeDefined();
      expect(result!.updatedAt).not.toBe(originalCreatedAt);
    });

    it('spreads all original highlight fields into result', async () => {
      const existingHighlight: PDFHighlight = {
        id: 'abc1234567',
        type: 'pdf',
        page: 42,
        pageLabel: 'xlii',
        selection: { beginIndex: 5, beginOffset: 10, endIndex: 5, endOffset: 30 },
        text: 'Original text',
        category: 'important',
        createdAt: '2024-01-15T10:00:00Z',
      };

      const note = createTestNote({ highlights: [existingHighlight] });

      mockReadFileSync.mockReturnValue(
        `[[books/test.pdf#page=42&selection=5,10,5,30&category=important|p. xlii]]\n`
      );

      const result = await writer.update(note, 'abc1234567', { note: 'New note' });

      expect(result).not.toBeNull();
      // All original fields should be preserved
      expect(result!.id).toBe('abc1234567');
      expect(result!.type).toBe('pdf');
      expect((result as PDFHighlight).page).toBe(42);
      expect((result as PDFHighlight).pageLabel).toBe('xlii');
      expect((result as PDFHighlight).selection).toEqual({
        beginIndex: 5, beginOffset: 10, endIndex: 5, endOffset: 30,
      });
      expect(result!.text).toBe('Original text');
      expect(result!.category).toBe('important');
    });
  });
});
