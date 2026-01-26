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

const mockExistsSync = vi.mocked(existsSync);
const mockMkdirSync = vi.mocked(mkdirSync);
const mockReadFileSync = vi.mocked(readFileSync);
const mockReadFile = vi.mocked(readFile);
const mockWriteFile = vi.mocked(writeFile);

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
  date_finished_key: 'date_finished',
  collections_key: 'collections',
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
});
