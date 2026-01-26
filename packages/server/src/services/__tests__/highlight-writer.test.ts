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
});
