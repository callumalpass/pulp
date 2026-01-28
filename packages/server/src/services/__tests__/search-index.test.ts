import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { SearchIndex } from '../search-index.js';
import type { Config } from '../../config/schema.js';
import type { LiteratureNote } from '@pulp/shared';

// Mock fs modules
vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  readFileSync: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
}));

// Mock pdfjs-dist
vi.mock('pdfjs-dist/legacy/build/pdf.mjs', () => ({
  getDocument: vi.fn(),
}));

// Mock epub2
vi.mock('epub2', () => ({
  default: vi.fn(),
}));

import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import EPub from 'epub2';

const mockExistsSync = vi.mocked(existsSync);
const mockMkdirSync = vi.mocked(mkdirSync);
const mockReadFileSync = vi.mocked(readFileSync);
const mockReadFile = vi.mocked(readFile);
const mockWriteFile = vi.mocked(writeFile);
const mockGetDocument = vi.mocked(pdfjsLib.getDocument);
const mockEPub = vi.mocked(EPub);

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
    id: 'test-note-id',
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

// Helper to create a populated search index for testing search functionality
function createPopulatedSearchIndex(): SearchIndex {
  // Mock an existing cache with indexed documents
  // Using longer text passages to properly test context truncation (80 char context on each side)
  const cacheData = {
    version: 1,
    documents: {
      'note-1': {
        noteId: 'note-1',
        title: 'The Great Gatsby',
        sourceType: 'pdf' as const,
        pages: [
          {
            pageNum: 1,
            pageLabel: '1',
            // ~250 chars - 'advice' appears at position ~100, which is beyond 80 char context
            text: 'In my younger and more vulnerable years my father gave me some advice that I have been turning over in my mind ever since. Reserving judgments is a matter of infinite hope. I am inclined to reserve all judgments, a habit that has opened up many curious natures.',
            position: 0,
          },
          {
            pageNum: 2,
            pageLabel: '2',
            text: 'Whenever you feel like criticizing anyone, just remember that all the people in this world have not had the advantages that you have had. Some people are born with advantages that others simply do not have access to in their lives.',
            position: 260,
          },
        ],
        indexedAt: Date.now(),
      },
      'note-2': {
        noteId: 'note-2',
        title: '1984',
        sourceType: 'pdf' as const,
        pages: [
          {
            pageNum: 1,
            pageLabel: 'i',
            text: 'It was a bright cold day in April, and the clocks were striking thirteen. Winston Smith, his chin nuzzled into his breast in an effort to escape the vile wind, slipped quickly through the glass doors of Victory Mansions.',
            position: 0,
          },
          {
            pageNum: 2,
            pageLabel: 'ii',
            text: 'The hallway smelt of boiled cabbage and old rag mats. At one end of it a coloured poster, too large for indoor display, had been tacked to the wall. It depicted simply an enormous face, more than a metre wide.',
            position: 220,
          },
        ],
        indexedAt: Date.now(),
      },
      'note-3': {
        noteId: 'note-3',
        title: 'Introduction to Algorithms',
        sourceType: 'epub' as const,
        pages: [
          {
            chapter: 'Chapter 1: Getting Started',
            chapterHref: 'chapter1.xhtml',
            text: 'This chapter will familiarize you with the framework we shall use throughout the book to think about the design and analysis of algorithms. We begin by examining the insertion sort algorithm to solve the sorting problem introduced in Chapter 1.',
            position: 0,
          },
          {
            chapter: 'Chapter 2: Sorting',
            chapterHref: 'chapter2.xhtml',
            text: 'Sorting algorithms are fundamental to computer science. The sorting problem is to rearrange items in ascending or descending order. There are many different algorithms that can accomplish this task with varying levels of efficiency.',
            position: 250,
          },
        ],
        indexedAt: Date.now(),
      },
    },
  };

  mockExistsSync.mockReturnValue(true);
  mockReadFileSync.mockReturnValue(JSON.stringify(cacheData));

  return new SearchIndex(testConfig);
}

describe('SearchIndex', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: cache directory doesn't exist, no existing cache
    mockExistsSync.mockReturnValue(false);
    mockReadFileSync.mockReturnValue('{}');
    mockWriteFile.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor and initialization', () => {
    it('creates cache directory if it does not exist', () => {
      mockExistsSync.mockReturnValue(false);

      new SearchIndex(testConfig);

      expect(mockMkdirSync).toHaveBeenCalledWith(
        '/test/library/.pulp-cache/search',
        { recursive: true }
      );
    });

    it('does not create cache directory if it already exists', () => {
      mockExistsSync.mockImplementation((path) => {
        return path === '/test/library/.pulp-cache/search';
      });

      new SearchIndex(testConfig);

      expect(mockMkdirSync).not.toHaveBeenCalled();
    });

    it('loads existing cache on construction', () => {
      const cacheData = {
        version: 1,
        documents: {
          'doc-1': {
            noteId: 'doc-1',
            title: 'Test Doc',
            sourceType: 'pdf',
            pages: [],
            indexedAt: Date.now(),
          },
        },
      };

      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(cacheData));

      const index = new SearchIndex(testConfig);

      expect(index.isIndexed('doc-1')).toBe(true);
      expect(index.getIndexedCount()).toBe(1);
    });

    it('handles corrupted cache file gracefully', () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue('invalid json{');

      const index = new SearchIndex(testConfig);

      expect(index.getIndexedCount()).toBe(0);
    });

    it('ignores cache with outdated version', () => {
      const oldCache = {
        version: 0, // Old version
        documents: {
          'doc-1': { noteId: 'doc-1', title: 'Test', sourceType: 'pdf', pages: [], indexedAt: 1 },
        },
      };

      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(oldCache));

      const index = new SearchIndex(testConfig);

      expect(index.getIndexedCount()).toBe(0);
    });

    it('uses custom search config values when provided', () => {
      const customConfig: Config = {
        ...testConfig,
        search_context_chars: 40,
        search_max_matches_per_doc: 20,
        search_results_per_doc: 5,
      };

      mockExistsSync.mockReturnValue(false);

      const index = new SearchIndex(customConfig);

      // We can verify by searching - the context chars will affect results
      expect(index.getIndexedCount()).toBe(0);
    });
  });

  describe('search', () => {
    describe('basic search functionality', () => {
      it('returns empty array for empty query', () => {
        const index = createPopulatedSearchIndex();

        const results = index.search('');
        expect(results).toEqual([]);

        const resultsWhitespace = index.search('   ');
        expect(resultsWhitespace).toEqual([]);
      });

      it('finds matches in indexed documents', () => {
        const index = createPopulatedSearchIndex();

        const results = index.search('father');

        expect(results).toHaveLength(1);
        expect(results[0].noteId).toBe('note-1');
        expect(results[0].title).toBe('The Great Gatsby');
        expect(results[0].totalMatches).toBe(1);
        expect(results[0].matches[0].text).toContain('father');
      });

      it('performs case-insensitive search', () => {
        const index = createPopulatedSearchIndex();

        const resultsLower = index.search('winston');
        const resultsUpper = index.search('WINSTON');
        const resultsMixed = index.search('WiNsToN');

        expect(resultsLower).toHaveLength(1);
        expect(resultsUpper).toHaveLength(1);
        expect(resultsMixed).toHaveLength(1);
        expect(resultsLower[0].noteId).toBe('note-2');
      });

      it('finds multiple matches in same document', () => {
        const index = createPopulatedSearchIndex();

        // "the" appears in multiple pages of note-1
        const results = index.search('the');

        expect(results.length).toBeGreaterThan(0);
        // Results should include documents with multiple matches
        const note1Result = results.find(r => r.noteId === 'note-1');
        if (note1Result) {
          expect(note1Result.totalMatches).toBeGreaterThan(0);
        }
      });

      it('finds matches across multiple documents', () => {
        const index = createPopulatedSearchIndex();

        // "in" appears in multiple documents
        const results = index.search('in');

        expect(results.length).toBeGreaterThanOrEqual(2);
      });

      it('returns matches sorted by total match count (descending)', () => {
        const index = createPopulatedSearchIndex();

        // "the" should appear more in some documents than others
        const results = index.search('the');

        for (let i = 1; i < results.length; i++) {
          expect(results[i - 1].totalMatches).toBeGreaterThanOrEqual(results[i].totalMatches);
        }
      });
    });

    describe('search context extraction', () => {
      it('extracts context around matches', () => {
        const index = createPopulatedSearchIndex();

        const results = index.search('father');

        expect(results).toHaveLength(1);
        const match = results[0].matches[0];
        expect(match.text).toContain('father');
        // Should have surrounding context
        expect(match.text.length).toBeGreaterThan('father'.length);
      });

      it('adds ellipsis when context is truncated at start', () => {
        const index = createPopulatedSearchIndex();

        // 'judgments' appears around position 125 in the text, beyond the 80-char context window
        const results = index.search('judgments');

        expect(results).toHaveLength(1);
        const match = results[0].matches[0];
        // Match is far enough into text that start should be truncated
        expect(match.text.startsWith('...')).toBe(true);
      });

      it('adds ellipsis when context is truncated at end', () => {
        const index = createPopulatedSearchIndex();

        // 'younger' appears near the start, and text is long enough that end will be truncated
        const results = index.search('younger');

        expect(results).toHaveLength(1);
        const match = results[0].matches[0];
        // Text is longer than context window, so end should be truncated
        expect(match.text.endsWith('...')).toBe(true);
      });

      it('does not add ellipsis when match is at start of text', () => {
        const index = createPopulatedSearchIndex();

        // 'In my' is at the very start of the text
        const results = index.search('In my');

        expect(results).toHaveLength(1);
        const match = results[0].matches[0];
        // Match is at the very start
        expect(match.text.startsWith('...')).toBe(false);
      });
    });

    describe('search result metadata', () => {
      it('includes page number for PDF matches', () => {
        const index = createPopulatedSearchIndex();

        const results = index.search('father');

        expect(results).toHaveLength(1);
        const match = results[0].matches[0];
        expect(match.page).toBe(1);
        expect(match.pageLabel).toBe('1');
      });

      it('includes chapter info for EPUB matches', () => {
        const index = createPopulatedSearchIndex();

        const results = index.search('algorithm');

        expect(results).toHaveLength(1);
        expect(results[0].sourceType).toBe('epub');
        const match = results[0].matches[0];
        expect(match.chapter).toBeDefined();
        expect(match.chapterHref).toBeDefined();
      });

      it('includes position for sorting within document', () => {
        const index = createPopulatedSearchIndex();

        const results = index.search('the');

        for (const result of results) {
          for (const match of result.matches) {
            expect(typeof match.position).toBe('number');
            expect(match.position).toBeGreaterThanOrEqual(0);
          }
        }
      });
    });

    describe('filtering by noteIds', () => {
      it('filters results to specified noteIds', () => {
        const index = createPopulatedSearchIndex();

        const results = index.search('the', ['note-1']);

        expect(results).toHaveLength(1);
        expect(results[0].noteId).toBe('note-1');
      });

      it('returns empty when noteIds do not match any indexed documents', () => {
        const index = createPopulatedSearchIndex();

        const results = index.search('the', ['nonexistent-note']);

        expect(results).toEqual([]);
      });

      it('filters to multiple noteIds', () => {
        const index = createPopulatedSearchIndex();

        const results = index.search('the', ['note-1', 'note-2']);

        expect(results.length).toBeLessThanOrEqual(2);
        for (const result of results) {
          expect(['note-1', 'note-2']).toContain(result.noteId);
        }
      });
    });

    describe('match limiting', () => {
      it('limits matches per document to configured max', () => {
        // Create a document with many potential matches
        const cacheData = {
          version: 1,
          documents: {
            'many-matches': {
              noteId: 'many-matches',
              title: 'Many Matches',
              sourceType: 'pdf' as const,
              pages: [
                {
                  pageNum: 1,
                  text: 'the the the the the the the the the the the the the the the the the the the the the the the the the the the the the the the the the the the the the the the the the the the the the the the the the the the the the the the the the the the',
                  position: 0,
                },
              ],
              indexedAt: Date.now(),
            },
          },
        };

        mockExistsSync.mockReturnValue(true);
        mockReadFileSync.mockReturnValue(JSON.stringify(cacheData));

        const customConfig = { ...testConfig, search_max_matches_per_doc: 5, search_results_per_doc: 3 };
        const index = new SearchIndex(customConfig);

        const results = index.search('the');

        expect(results).toHaveLength(1);
        // Should return only search_results_per_doc matches
        expect(results[0].matches.length).toBeLessThanOrEqual(3);
        // But totalMatches should reflect the capped count (search_max_matches_per_doc)
        expect(results[0].totalMatches).toBeLessThanOrEqual(5);
      });
    });

    describe('edge cases', () => {
      it('handles query with special regex characters', () => {
        const cacheData = {
          version: 1,
          documents: {
            'special': {
              noteId: 'special',
              title: 'Special Characters',
              sourceType: 'pdf' as const,
              pages: [
                {
                  pageNum: 1,
                  text: 'This has special characters like (parentheses) and [brackets] and dots...',
                  position: 0,
                },
              ],
              indexedAt: Date.now(),
            },
          },
        };

        mockExistsSync.mockReturnValue(true);
        mockReadFileSync.mockReturnValue(JSON.stringify(cacheData));

        const index = new SearchIndex(testConfig);

        // These should not throw or cause regex issues
        expect(() => index.search('(parentheses)')).not.toThrow();
        expect(() => index.search('[brackets]')).not.toThrow();
        expect(() => index.search('dots...')).not.toThrow();
      });

      it('returns empty results when no documents are indexed', () => {
        mockExistsSync.mockReturnValue(false);
        const index = new SearchIndex(testConfig);

        const results = index.search('anything');

        expect(results).toEqual([]);
      });

      it('handles search for text not in any document', () => {
        const index = createPopulatedSearchIndex();

        const results = index.search('xyznonexistent123');

        expect(results).toEqual([]);
      });
    });
  });

  describe('isIndexed', () => {
    it('returns true for indexed documents', () => {
      const index = createPopulatedSearchIndex();

      expect(index.isIndexed('note-1')).toBe(true);
      expect(index.isIndexed('note-2')).toBe(true);
    });

    it('returns false for non-indexed documents', () => {
      const index = createPopulatedSearchIndex();

      expect(index.isIndexed('nonexistent')).toBe(false);
    });

    it('returns false after document is invalidated', () => {
      const index = createPopulatedSearchIndex();

      expect(index.isIndexed('note-1')).toBe(true);
      index.invalidateIndex('note-1');
      expect(index.isIndexed('note-1')).toBe(false);
    });
  });

  describe('getIndexedCount', () => {
    it('returns 0 for empty index', () => {
      mockExistsSync.mockReturnValue(false);
      const index = new SearchIndex(testConfig);

      expect(index.getIndexedCount()).toBe(0);
    });

    it('returns correct count for populated index', () => {
      const index = createPopulatedSearchIndex();

      expect(index.getIndexedCount()).toBe(3);
    });

    it('decrements after invalidation', () => {
      const index = createPopulatedSearchIndex();

      expect(index.getIndexedCount()).toBe(3);
      index.invalidateIndex('note-1');
      expect(index.getIndexedCount()).toBe(2);
    });
  });

  describe('invalidateIndex', () => {
    it('removes document from index', () => {
      const index = createPopulatedSearchIndex();

      expect(index.isIndexed('note-1')).toBe(true);
      index.invalidateIndex('note-1');
      expect(index.isIndexed('note-1')).toBe(false);
    });

    it('does nothing when document is not indexed', () => {
      const index = createPopulatedSearchIndex();

      const countBefore = index.getIndexedCount();
      index.invalidateIndex('nonexistent');
      expect(index.getIndexedCount()).toBe(countBefore);
    });

    it('triggers cache save', async () => {
      const index = createPopulatedSearchIndex();
      vi.clearAllMocks(); // Clear mocks from construction

      index.invalidateIndex('note-1');

      // Wait for debounced save
      await vi.waitFor(() => {
        expect(mockWriteFile).toHaveBeenCalled();
      }, { timeout: 2000 });
    });
  });

  describe('clearIndex', () => {
    it('removes all documents from index', () => {
      const index = createPopulatedSearchIndex();

      expect(index.getIndexedCount()).toBe(3);
      index.clearIndex();
      expect(index.getIndexedCount()).toBe(0);
    });

    it('search returns empty after clearing', () => {
      const index = createPopulatedSearchIndex();

      const resultsBefore = index.search('the');
      expect(resultsBefore.length).toBeGreaterThan(0);

      index.clearIndex();

      const resultsAfter = index.search('the');
      expect(resultsAfter).toEqual([]);
    });

    it('triggers cache save', async () => {
      const index = createPopulatedSearchIndex();
      vi.clearAllMocks();

      index.clearIndex();

      // Wait for debounced save
      await vi.waitFor(() => {
        expect(mockWriteFile).toHaveBeenCalled();
      }, { timeout: 2000 });
    });
  });

  describe('indexNote', () => {
    it('skips indexing if note is already indexed', async () => {
      const index = createPopulatedSearchIndex();
      vi.clearAllMocks();

      const note = createTestNote({ id: 'note-1' });
      await index.indexNote(note);

      // Should not attempt to read the PDF since already indexed
      expect(mockReadFile).not.toHaveBeenCalled();
    });

    it('skips if indexing is already in progress for the note', async () => {
      mockExistsSync.mockReturnValue(false);
      const index = new SearchIndex(testConfig);

      // Create a slow mock that we can control
      let resolveFirst: () => void;
      const firstPromise = new Promise<Buffer>(resolve => {
        resolveFirst = () => resolve(Buffer.from(''));
      });
      mockReadFile.mockReturnValueOnce(firstPromise as unknown as ReturnType<typeof mockReadFile>);

      const note = createTestNote({ id: 'new-note' });

      // Start first indexing (will be waiting on read)
      const firstIndex = index.indexNote(note);

      // Try to start second indexing immediately
      const secondIndex = index.indexNote(note);

      // Resolve the first read
      resolveFirst!();

      await Promise.all([firstIndex, secondIndex]);

      // Should only have read once
      expect(mockReadFile).toHaveBeenCalledTimes(1);
    });
  });

  describe('indexAllNotes', () => {
    it('indexes multiple notes sequentially', async () => {
      mockExistsSync.mockReturnValue(false);
      const index = new SearchIndex(testConfig);

      // Mock PDF reading to fail quickly (we just want to test sequencing)
      mockReadFile.mockRejectedValue(new Error('Test error'));

      const notes = [
        createTestNote({ id: 'note-a', title: 'Note A' }),
        createTestNote({ id: 'note-b', title: 'Note B' }),
      ];

      await index.indexAllNotes(notes);

      // Should have attempted to read each note's file
      expect(mockReadFile).toHaveBeenCalledTimes(2);
    });
  });

  describe('indexNote - PDF extraction', () => {
    // Helper to create a mock PDF document with controllable pages
    function createMockPdfDocument(pages: Array<{ items: Array<{ str: string }> }>, pageLabels?: string[] | null) {
      const mockPages = pages.map((page, i) => ({
        getTextContent: vi.fn().mockResolvedValue({ items: page.items }),
        pageNum: i + 1,
      }));

      const mockPdf = {
        numPages: pages.length,
        getPage: vi.fn().mockImplementation((num: number) => Promise.resolve(mockPages[num - 1])),
        getPageLabels: vi.fn().mockResolvedValue(pageLabels ?? null),
        destroy: vi.fn().mockResolvedValue(undefined),
      };

      return mockPdf;
    }

    beforeEach(() => {
      mockExistsSync.mockReturnValue(false);
    });

    it('indexes a PDF and makes it searchable', async () => {
      const index = new SearchIndex(testConfig);

      const mockPdf = createMockPdfDocument([
        { items: [{ str: 'Hello' }, { str: 'world' }] },
        { items: [{ str: 'Second page content here' }] },
      ]);
      mockReadFile.mockResolvedValue(Buffer.from('fake-pdf') as unknown as ReturnType<typeof readFile>);
      mockGetDocument.mockReturnValue({ promise: Promise.resolve(mockPdf) } as unknown as ReturnType<typeof pdfjsLib.getDocument>);

      const note = createTestNote({ id: 'pdf-note', title: 'PDF Book', sourceType: 'pdf' });
      await index.indexNote(note);

      expect(index.isIndexed('pdf-note')).toBe(true);
      expect(index.getIndexedCount()).toBe(1);

      // Verify the indexed content is searchable
      const results = index.search('Hello');
      expect(results).toHaveLength(1);
      expect(results[0].noteId).toBe('pdf-note');
      expect(results[0].title).toBe('PDF Book');
      expect(results[0].sourceType).toBe('pdf');
      expect(results[0].matches[0].page).toBe(1);
    });

    it('includes page labels in indexed pages', async () => {
      const index = new SearchIndex(testConfig);

      const mockPdf = createMockPdfDocument(
        [
          { items: [{ str: 'Preface content' }] },
          { items: [{ str: 'Chapter one begins' }] },
        ],
        ['iv', '1'],
      );
      mockReadFile.mockResolvedValue(Buffer.from('fake-pdf') as unknown as ReturnType<typeof readFile>);
      mockGetDocument.mockReturnValue({ promise: Promise.resolve(mockPdf) } as unknown as ReturnType<typeof pdfjsLib.getDocument>);

      const note = createTestNote({ id: 'labeled-pdf', sourceType: 'pdf' });
      await index.indexNote(note);

      const results = index.search('Preface');
      expect(results).toHaveLength(1);
      expect(results[0].matches[0].pageLabel).toBe('iv');

      const results2 = index.search('Chapter one');
      expect(results2).toHaveLength(1);
      expect(results2[0].matches[0].pageLabel).toBe('1');
    });

    it('skips pages with empty text content', async () => {
      const index = new SearchIndex(testConfig);

      const mockPdf = createMockPdfDocument([
        { items: [{ str: '' }] },
        { items: [{ str: '   ' }] },
        { items: [{ str: 'Real content here' }] },
      ]);
      mockReadFile.mockResolvedValue(Buffer.from('fake-pdf') as unknown as ReturnType<typeof readFile>);
      mockGetDocument.mockReturnValue({ promise: Promise.resolve(mockPdf) } as unknown as ReturnType<typeof pdfjsLib.getDocument>);

      const note = createTestNote({ id: 'sparse-pdf', sourceType: 'pdf' });
      await index.indexNote(note);

      // Only the non-empty page should be searchable
      const results = index.search('Real content');
      expect(results).toHaveLength(1);
      expect(results[0].matches[0].page).toBe(3);
    });

    it('continues extracting after a page error', async () => {
      const index = new SearchIndex(testConfig);

      const goodPage = {
        getTextContent: vi.fn().mockResolvedValue({ items: [{ str: 'Good page content' }] }),
      };
      const badPage = {
        getTextContent: vi.fn().mockRejectedValue(new Error('Page corrupted')),
      };
      const anotherGoodPage = {
        getTextContent: vi.fn().mockResolvedValue({ items: [{ str: 'Another good page' }] }),
      };

      const mockPdf = {
        numPages: 3,
        getPage: vi.fn()
          .mockResolvedValueOnce(goodPage)
          .mockResolvedValueOnce(badPage)
          .mockResolvedValueOnce(anotherGoodPage),
        getPageLabels: vi.fn().mockResolvedValue(null),
        destroy: vi.fn().mockResolvedValue(undefined),
      };

      mockReadFile.mockResolvedValue(Buffer.from('fake-pdf') as unknown as ReturnType<typeof readFile>);
      mockGetDocument.mockReturnValue({ promise: Promise.resolve(mockPdf) } as unknown as ReturnType<typeof pdfjsLib.getDocument>);

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const note = createTestNote({ id: 'partial-pdf', sourceType: 'pdf' });
      await index.indexNote(note);
      consoleSpy.mockRestore();

      // Both good pages should be indexed
      expect(index.search('Good page')).toHaveLength(1);
      expect(index.search('Another good')).toHaveLength(1);
    });

    it('joins text items with spaces and normalizes whitespace', async () => {
      const index = new SearchIndex(testConfig);

      const mockPdf = createMockPdfDocument([
        { items: [{ str: 'Multiple' }, { str: '  spaces  ' }, { str: 'between' }] },
      ]);
      mockReadFile.mockResolvedValue(Buffer.from('fake-pdf') as unknown as ReturnType<typeof readFile>);
      mockGetDocument.mockReturnValue({ promise: Promise.resolve(mockPdf) } as unknown as ReturnType<typeof pdfjsLib.getDocument>);

      const note = createTestNote({ id: 'spaced-pdf', sourceType: 'pdf' });
      await index.indexNote(note);

      // Search for normalized text
      const results = index.search('Multiple spaces between');
      expect(results).toHaveLength(1);
    });

    it('destroys PDF document after extraction', async () => {
      const index = new SearchIndex(testConfig);

      const mockPdf = createMockPdfDocument([
        { items: [{ str: 'Some text' }] },
      ]);
      mockReadFile.mockResolvedValue(Buffer.from('fake-pdf') as unknown as ReturnType<typeof readFile>);
      mockGetDocument.mockReturnValue({ promise: Promise.resolve(mockPdf) } as unknown as ReturnType<typeof pdfjsLib.getDocument>);

      const note = createTestNote({ id: 'cleanup-pdf', sourceType: 'pdf' });
      await index.indexNote(note);

      expect(mockPdf.destroy).toHaveBeenCalled();
    });

    it('handles PDF read failure gracefully', async () => {
      const index = new SearchIndex(testConfig);

      mockReadFile.mockRejectedValue(new Error('ENOENT: no such file'));

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const note = createTestNote({ id: 'missing-pdf', sourceType: 'pdf' });
      await index.indexNote(note);
      consoleSpy.mockRestore();

      // extractPDFText catches the error and returns empty pages,
      // so the note is indexed but has no searchable content
      expect(index.isIndexed('missing-pdf')).toBe(true);
      expect(index.search('anything')).toHaveLength(0);
    });

    it('handles getDocument failure gracefully', async () => {
      const index = new SearchIndex(testConfig);

      mockReadFile.mockResolvedValue(Buffer.from('bad-data') as unknown as ReturnType<typeof readFile>);
      mockGetDocument.mockReturnValue({ promise: Promise.reject(new Error('Invalid PDF')) } as unknown as ReturnType<typeof pdfjsLib.getDocument>);

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const note = createTestNote({ id: 'invalid-pdf', sourceType: 'pdf' });
      await index.indexNote(note);
      consoleSpy.mockRestore();

      // Empty pages result — the note gets indexed with 0 pages
      // because extractPDFText catches errors and returns empty array
      expect(index.isIndexed('invalid-pdf')).toBe(true);
    });

    it('handles items without str property', async () => {
      const index = new SearchIndex(testConfig);

      const mockPage = {
        getTextContent: vi.fn().mockResolvedValue({
          items: [
            { str: 'Normal text' },
            { transform: [1, 0, 0, 1, 0, 0] }, // Item without str
            { str: 'more text' },
          ],
        }),
      };
      const mockPdf = {
        numPages: 1,
        getPage: vi.fn().mockResolvedValue(mockPage),
        getPageLabels: vi.fn().mockResolvedValue(null),
        destroy: vi.fn().mockResolvedValue(undefined),
      };

      mockReadFile.mockResolvedValue(Buffer.from('fake-pdf') as unknown as ReturnType<typeof readFile>);
      mockGetDocument.mockReturnValue({ promise: Promise.resolve(mockPdf) } as unknown as ReturnType<typeof pdfjsLib.getDocument>);

      const note = createTestNote({ id: 'mixed-items', sourceType: 'pdf' });
      await index.indexNote(note);

      const results = index.search('Normal text');
      expect(results).toHaveLength(1);
    });
  });

  describe('indexNote - EPUB extraction', () => {
    // Helper to create a mock EPub class
    function createMockEpubClass(options: {
      flow?: Array<{ id: string }>;
      toc?: Array<{ href?: string; title?: string; subitems?: unknown[] }>;
      manifest?: Record<string, { href?: string }>;
      chapters?: Record<string, string>;
      parseError?: boolean;
      chapterErrors?: Record<string, Error>;
    } = {}) {
      const eventHandlers: Record<string, Array<(...args: unknown[]) => void>> = {};

      class MockEPubClass {
        flow = options.flow || [];
        toc = options.toc || [];
        manifest = options.manifest || {};

        on(event: string, callback: (...args: unknown[]) => void) {
          if (!eventHandlers[event]) eventHandlers[event] = [];
          eventHandlers[event].push(callback);
          return this;
        }

        parse() {
          process.nextTick(() => {
            if (options.parseError) {
              eventHandlers['error']?.forEach(cb => cb(new Error('Parse error')));
            } else {
              eventHandlers['end']?.forEach(cb => cb());
            }
          });
        }

        getChapter(id: string, callback: (err: Error | null, text: string | null) => void) {
          if (options.chapterErrors?.[id]) {
            callback(options.chapterErrors[id], null);
          } else {
            callback(null, options.chapters?.[id] || null);
          }
        }
      }

      return MockEPubClass;
    }

    beforeEach(() => {
      mockExistsSync.mockReturnValue(false);
    });

    it('indexes an EPUB and makes it searchable', async () => {
      const index = new SearchIndex(testConfig);

      const MockClass = createMockEpubClass({
        flow: [{ id: 'ch1' }, { id: 'ch2' }],
        toc: [
          { href: 'chapter1.xhtml', title: 'Introduction' },
          { href: 'chapter2.xhtml', title: 'Getting Started' },
        ],
        manifest: {
          ch1: { href: 'chapter1.xhtml' },
          ch2: { href: 'chapter2.xhtml' },
        },
        chapters: {
          ch1: '<p>Welcome to the introduction chapter.</p>',
          ch2: '<p>Let us get started with the basics.</p>',
        },
      });
      mockEPub.mockImplementation(function () { return new MockClass(); } as unknown as typeof EPub);

      const note = createTestNote({ id: 'epub-note', title: 'EPUB Book', sourceType: 'epub', filePath: '/path/to/book.epub' });
      await index.indexNote(note);

      expect(index.isIndexed('epub-note')).toBe(true);

      const results = index.search('introduction');
      expect(results).toHaveLength(1);
      expect(results[0].noteId).toBe('epub-note');
      expect(results[0].sourceType).toBe('epub');
      expect(results[0].matches[0].chapter).toBe('Introduction');
      expect(results[0].matches[0].chapterHref).toBe('chapter1.xhtml');
    });

    it('strips HTML tags from chapter content', async () => {
      const index = new SearchIndex(testConfig);

      const MockClass = createMockEpubClass({
        flow: [{ id: 'ch1' }],
        manifest: { ch1: { href: 'ch1.xhtml' } },
        chapters: {
          ch1: '<h1>Title</h1><p>Some <strong>bold</strong> and <em>italic</em> text.</p>',
        },
      });
      mockEPub.mockImplementation(function () { return new MockClass(); } as unknown as typeof EPub);

      const note = createTestNote({ id: 'html-epub', sourceType: 'epub', filePath: '/path/to/book.epub' });
      await index.indexNote(note);

      // HTML tags should be stripped — search for plain text
      const results = index.search('bold and italic text');
      expect(results).toHaveLength(1);
    });

    it('strips script and style tags from chapter content', async () => {
      const index = new SearchIndex(testConfig);

      const MockClass = createMockEpubClass({
        flow: [{ id: 'ch1' }],
        manifest: { ch1: { href: 'ch1.xhtml' } },
        chapters: {
          ch1: '<style>.cls { color: red; }</style><script>alert("hi")</script><p>Visible content only.</p>',
        },
      });
      mockEPub.mockImplementation(function () { return new MockClass(); } as unknown as typeof EPub);

      const note = createTestNote({ id: 'script-epub', sourceType: 'epub', filePath: '/path/to/book.epub' });
      await index.indexNote(note);

      // Script and style content should not be indexed
      expect(index.search('alert')).toHaveLength(0);
      expect(index.search('color: red')).toHaveLength(0);
      expect(index.search('Visible content')).toHaveLength(1);
    });

    it('decodes HTML entities in chapter content', async () => {
      const index = new SearchIndex(testConfig);

      const MockClass = createMockEpubClass({
        flow: [{ id: 'ch1' }],
        manifest: { ch1: { href: 'ch1.xhtml' } },
        chapters: {
          ch1: '<p>A &amp; B &lt; C &gt; D &quot;quoted&quot; and&nbsp;non-breaking.</p>',
        },
      });
      mockEPub.mockImplementation(function () { return new MockClass(); } as unknown as typeof EPub);

      const note = createTestNote({ id: 'entity-epub', sourceType: 'epub', filePath: '/path/to/book.epub' });
      await index.indexNote(note);

      const results = index.search('A & B');
      expect(results).toHaveLength(1);
    });

    it('maps chapter titles from TOC including nested subitems', async () => {
      const index = new SearchIndex(testConfig);

      const MockClass = createMockEpubClass({
        flow: [{ id: 'ch1' }, { id: 'ch2' }],
        toc: [
          {
            href: 'part1.xhtml',
            title: 'Part 1',
            subitems: [
              { href: 'ch1.xhtml', title: 'Chapter 1: Nested' },
            ],
          },
          { href: 'ch2.xhtml', title: 'Chapter 2: Top Level' },
        ],
        manifest: {
          ch1: { href: 'ch1.xhtml' },
          ch2: { href: 'ch2.xhtml' },
        },
        chapters: {
          ch1: '<p>Nested chapter content here.</p>',
          ch2: '<p>Top level chapter content here.</p>',
        },
      });
      mockEPub.mockImplementation(function () { return new MockClass(); } as unknown as typeof EPub);

      const note = createTestNote({ id: 'nested-toc', sourceType: 'epub', filePath: '/path/to/book.epub' });
      await index.indexNote(note);

      const results1 = index.search('Nested chapter');
      expect(results1).toHaveLength(1);
      expect(results1[0].matches[0].chapter).toBe('Chapter 1: Nested');

      const results2 = index.search('Top level chapter');
      expect(results2).toHaveLength(1);
      expect(results2[0].matches[0].chapter).toBe('Chapter 2: Top Level');
    });

    it('uses href as fallback when no TOC title for chapter', async () => {
      const index = new SearchIndex(testConfig);

      const MockClass = createMockEpubClass({
        flow: [{ id: 'ch1' }],
        toc: [], // No TOC entries
        manifest: { ch1: { href: 'chapter1.xhtml' } },
        chapters: {
          ch1: '<p>Content without TOC title.</p>',
        },
      });
      mockEPub.mockImplementation(function () { return new MockClass(); } as unknown as typeof EPub);

      const note = createTestNote({ id: 'no-toc', sourceType: 'epub', filePath: '/path/to/book.epub' });
      await index.indexNote(note);

      const results = index.search('without TOC');
      expect(results).toHaveLength(1);
      // Should fall back to href as chapter title
      expect(results[0].matches[0].chapter).toBe('chapter1.xhtml');
    });

    it('skips spine items without id', async () => {
      const index = new SearchIndex(testConfig);

      const MockClass = createMockEpubClass({
        flow: [{ id: '' }, { id: 'ch1' }] as Array<{ id: string }>,
        manifest: { ch1: { href: 'ch1.xhtml' } },
        chapters: {
          ch1: '<p>Valid chapter content.</p>',
        },
      });
      mockEPub.mockImplementation(function () { return new MockClass(); } as unknown as typeof EPub);

      const note = createTestNote({ id: 'no-id-spine', sourceType: 'epub', filePath: '/path/to/book.epub' });
      await index.indexNote(note);

      const results = index.search('Valid chapter');
      expect(results).toHaveLength(1);
    });

    it('skips chapters that return empty text', async () => {
      const index = new SearchIndex(testConfig);

      const MockClass = createMockEpubClass({
        flow: [{ id: 'empty' }, { id: 'full' }],
        manifest: {
          empty: { href: 'empty.xhtml' },
          full: { href: 'full.xhtml' },
        },
        chapters: {
          empty: '',
          full: '<p>This chapter has content.</p>',
        },
      });
      mockEPub.mockImplementation(function () { return new MockClass(); } as unknown as typeof EPub);

      const note = createTestNote({ id: 'empty-chapters', sourceType: 'epub', filePath: '/path/to/book.epub' });
      await index.indexNote(note);

      const results = index.search('has content');
      expect(results).toHaveLength(1);
    });

    it('continues after chapter extraction errors', async () => {
      const index = new SearchIndex(testConfig);

      const MockClass = createMockEpubClass({
        flow: [{ id: 'bad' }, { id: 'good' }],
        manifest: {
          bad: { href: 'bad.xhtml' },
          good: { href: 'good.xhtml' },
        },
        chapters: {
          good: '<p>Good chapter text.</p>',
        },
        chapterErrors: {
          bad: new Error('Chapter read failed'),
        },
      });
      mockEPub.mockImplementation(function () { return new MockClass(); } as unknown as typeof EPub);

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const note = createTestNote({ id: 'partial-epub', sourceType: 'epub', filePath: '/path/to/book.epub' });
      await index.indexNote(note);
      consoleSpy.mockRestore();

      // The good chapter should still be indexed
      const results = index.search('Good chapter');
      expect(results).toHaveLength(1);
    });

    it('handles EPUB parse errors gracefully', async () => {
      const index = new SearchIndex(testConfig);

      const MockClass = createMockEpubClass({ parseError: true });
      mockEPub.mockImplementation(function () { return new MockClass(); } as unknown as typeof EPub);

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const note = createTestNote({ id: 'broken-epub', sourceType: 'epub', filePath: '/path/to/book.epub' });
      await index.indexNote(note);
      consoleSpy.mockRestore();

      // EPUB parse errors resolve with empty pages, so note is indexed with no content
      expect(index.isIndexed('broken-epub')).toBe(true);
      expect(index.search('anything')).toHaveLength(0);
    });

    it('handles EPUB constructor throwing', async () => {
      const index = new SearchIndex(testConfig);

      mockEPub.mockImplementation(function () { throw new Error('EPUB init failed'); } as unknown as typeof EPub);

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const note = createTestNote({ id: 'throw-epub', sourceType: 'epub', filePath: '/path/to/book.epub' });
      await index.indexNote(note);
      consoleSpy.mockRestore();

      // Constructor error resolves with empty pages, so note is indexed with no content
      expect(index.isIndexed('throw-epub')).toBe(true);
    });

    it('strips TOC href fragments when matching chapter titles', async () => {
      const index = new SearchIndex(testConfig);

      const MockClass = createMockEpubClass({
        flow: [{ id: 'ch1' }],
        toc: [
          { href: 'chapter1.xhtml#section-1', title: 'Section One' },
        ],
        manifest: { ch1: { href: 'chapter1.xhtml' } },
        chapters: {
          ch1: '<p>Section content with specific chapter.</p>',
        },
      });
      mockEPub.mockImplementation(function () { return new MockClass(); } as unknown as typeof EPub);

      const note = createTestNote({ id: 'frag-epub', sourceType: 'epub', filePath: '/path/to/book.epub' });
      await index.indexNote(note);

      const results = index.search('Section content');
      expect(results).toHaveLength(1);
      // TOC title should still match despite fragment in href
      expect(results[0].matches[0].chapter).toBe('Section One');
    });
  });

  describe('indexNote - error handling', () => {
    beforeEach(() => {
      mockExistsSync.mockReturnValue(false);
    });

    it('cleans up indexingInProgress set after extraction failure', async () => {
      const index = new SearchIndex(testConfig);

      // Make the PDF extraction fail at the indexNote level (timeout)
      // by making readFile hang, then rejecting with timeout
      mockReadFile.mockImplementation(() => new Promise(() => {
        // never resolves - will be caught by indexNote's timeout
      }) as unknown as ReturnType<typeof readFile>);

      vi.useFakeTimers();

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const note = createTestNote({ id: 'timeout-note', sourceType: 'pdf' });
      const indexPromise = index.indexNote(note);

      // Advance past the 60s timeout
      await vi.advanceTimersByTimeAsync(61000);
      await indexPromise;
      consoleSpy.mockRestore();

      vi.useRealTimers();

      // After failure, should not be indexed (timeout prevents indexing)
      expect(index.isIndexed('timeout-note')).toBe(false);

      // The note should be retryable (not stuck in indexingInProgress)
      const mockPdf = {
        numPages: 1,
        getPage: vi.fn().mockResolvedValue({
          getTextContent: vi.fn().mockResolvedValue({ items: [{ str: 'Retry success' }] }),
        }),
        getPageLabels: vi.fn().mockResolvedValue(null),
        destroy: vi.fn().mockResolvedValue(undefined),
      };
      mockReadFile.mockResolvedValue(Buffer.from('fake-pdf') as unknown as ReturnType<typeof readFile>);
      mockGetDocument.mockReturnValue({ promise: Promise.resolve(mockPdf) } as unknown as ReturnType<typeof pdfjsLib.getDocument>);

      await index.indexNote(note);

      // Should now be indexed
      const results = index.search('Retry success');
      expect(results).toHaveLength(1);
    });

    it('logs extraction errors to console', async () => {
      const index = new SearchIndex(testConfig);

      // Make readFile throw to trigger the extractPDFText error path
      mockReadFile.mockRejectedValue(new Error('disk read error'));

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const note = createTestNote({ id: 'string-error', sourceType: 'pdf' });
      await index.indexNote(note);

      expect(consoleSpy).toHaveBeenCalledWith(
        'PDF text extraction failed:',
        expect.any(Error),
      );
      consoleSpy.mockRestore();
    });
  });

  describe('saveCache debouncing', () => {
    it('coalesces multiple invalidations into a single write', async () => {
      vi.useFakeTimers();

      const index = createPopulatedSearchIndex();
      mockWriteFile.mockClear();

      // Trigger multiple saves rapidly
      index.invalidateIndex('note-1');
      index.invalidateIndex('note-2');

      // Advance past the 1000ms debounce
      await vi.advanceTimersByTimeAsync(1100);

      // Should only write once due to debouncing
      expect(mockWriteFile).toHaveBeenCalledTimes(1);

      vi.useRealTimers();
    });

    it('handles write failure gracefully', async () => {
      vi.useFakeTimers();

      const index = createPopulatedSearchIndex();
      mockWriteFile.mockClear();
      mockWriteFile.mockRejectedValue(new Error('Disk full'));

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      index.invalidateIndex('note-1');

      // Advance past the debounce
      await vi.advanceTimersByTimeAsync(1100);

      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to save search index cache:',
        expect.any(Error),
      );
      consoleSpy.mockRestore();

      vi.useRealTimers();
    });

    it('writes the correct cache file path', async () => {
      vi.useFakeTimers();

      const index = createPopulatedSearchIndex();
      mockWriteFile.mockClear();

      index.invalidateIndex('note-1');

      await vi.advanceTimersByTimeAsync(1100);

      expect(mockWriteFile).toHaveBeenCalledWith(
        '/test/library/.pulp-cache/search/index.json',
        expect.any(String),
      );

      vi.useRealTimers();
    });
  });

  describe('search - additional coverage', () => {
    it('includes sourceType in all search results', () => {
      const index = createPopulatedSearchIndex();

      const results = index.search('the');

      for (const result of results) {
        expect(['pdf', 'epub']).toContain(result.sourceType);
      }
    });

    it('correctly distinguishes PDF and EPUB source types', () => {
      const index = createPopulatedSearchIndex();

      // note-1 and note-2 are pdf, note-3 is epub
      const pdfResults = index.search('father');
      expect(pdfResults[0].sourceType).toBe('pdf');

      const epubResults = index.search('algorithm');
      expect(epubResults[0].sourceType).toBe('epub');
    });

    it('calculates correct position across multiple pages', () => {
      const index = createPopulatedSearchIndex();

      // 'advantages' appears in note-1 page 2 (position 260+offset within text)
      const results = index.search('advantages', ['note-1']);
      expect(results).toHaveLength(1);

      const match = results[0].matches[0];
      // Position should include the base position of page 2 (260)
      expect(match.position).toBeGreaterThanOrEqual(260);
    });

    it('stops searching pages once max matches reached', () => {
      // Create a document with many matches spread across pages
      const cacheData = {
        version: 1,
        documents: {
          'multi-page': {
            noteId: 'multi-page',
            title: 'Multi Page',
            sourceType: 'pdf' as const,
            pages: [
              { pageNum: 1, text: 'a a a a a a a a a a a a a a a a a a a a a a a a a a a a a a', position: 0 },
              { pageNum: 2, text: 'a a a a a a a a a a a a a a a a a a a a a a a a a a a a a a', position: 100 },
              { pageNum: 3, text: 'unique text only here', position: 200 },
            ],
            indexedAt: Date.now(),
          },
        },
      };

      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(cacheData));

      // Use a very low max to test the limit behavior
      const customConfig = { ...testConfig, search_max_matches_per_doc: 3, search_results_per_doc: 2 };
      const index = new SearchIndex(customConfig);

      const results = index.search('a');
      expect(results).toHaveLength(1);
      // totalMatches should be capped at maxMatchesPerDoc
      expect(results[0].totalMatches).toBe(3);
      // returned matches should be capped at resultsPerDoc
      expect(results[0].matches.length).toBe(2);
    });

    it('does not add ellipsis when match context covers entire text', () => {
      const cacheData = {
        version: 1,
        documents: {
          'short': {
            noteId: 'short',
            title: 'Short',
            sourceType: 'pdf' as const,
            pages: [
              { pageNum: 1, text: 'tiny', position: 0 },
            ],
            indexedAt: Date.now(),
          },
        },
      };

      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(cacheData));
      const index = new SearchIndex(testConfig);

      const results = index.search('tiny');
      expect(results).toHaveLength(1);
      expect(results[0].matches[0].text).toBe('tiny');
      // No ellipsis on either side
      expect(results[0].matches[0].text.startsWith('...')).toBe(false);
      expect(results[0].matches[0].text.endsWith('...')).toBe(false);
    });
  });
});
