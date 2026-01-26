import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';

// Mock fs module
vi.mock('node:fs', () => ({
  readdirSync: vi.fn(),
  statSync: vi.fn(),
  readFileSync: vi.fn(),
}));

// Mock frontmatter-parser functions
vi.mock('../frontmatter-parser.js', () => ({
  parseNoteFrontmatter: vi.fn(),
  hasTag: vi.fn(),
  getSourcePath: vi.fn(),
  getProgress: vi.fn(),
  getLastRead: vi.fn(),
  getLastOpenedCfi: vi.fn(),
  getDateCreated: vi.fn(),
  getDateFinished: vi.fn(),
  getCollections: vi.fn(),
  getTitle: vi.fn(),
  getBookmarks: vi.fn(),
  getPinned: vi.fn(),
  getReadingStats: vi.fn(),
  getAuthor: vi.fn(),
  getRating: vi.fn(),
  getTotalPages: vi.fn(),
  getReaderPreferences: vi.fn(),
  getCurrentChapter: vi.fn(),
}));

// Mock highlight-parser
vi.mock('../highlight-parser.js', () => ({
  parseHighlightsFromNote: vi.fn(),
}));

const mockReaddirSync = vi.mocked(readdirSync);
const mockStatSync = vi.mocked(statSync);

// Import mocked modules
import * as frontmatterParser from '../frontmatter-parser.js';
import * as highlightParser from '../highlight-parser.js';

const mockParseNoteFrontmatter = vi.mocked(frontmatterParser.parseNoteFrontmatter);
const mockHasTag = vi.mocked(frontmatterParser.hasTag);
const mockGetSourcePath = vi.mocked(frontmatterParser.getSourcePath);
const mockGetProgress = vi.mocked(frontmatterParser.getProgress);
const mockGetLastRead = vi.mocked(frontmatterParser.getLastRead);
const mockGetLastOpenedCfi = vi.mocked(frontmatterParser.getLastOpenedCfi);
const mockGetDateCreated = vi.mocked(frontmatterParser.getDateCreated);
const mockGetDateFinished = vi.mocked(frontmatterParser.getDateFinished);
const mockGetCollections = vi.mocked(frontmatterParser.getCollections);
const mockGetTitle = vi.mocked(frontmatterParser.getTitle);
const mockGetBookmarks = vi.mocked(frontmatterParser.getBookmarks);
const mockGetPinned = vi.mocked(frontmatterParser.getPinned);
const mockGetReadingStats = vi.mocked(frontmatterParser.getReadingStats);
const mockGetAuthor = vi.mocked(frontmatterParser.getAuthor);
const mockGetRating = vi.mocked(frontmatterParser.getRating);
const mockGetTotalPages = vi.mocked(frontmatterParser.getTotalPages);
const mockGetReaderPreferences = vi.mocked(frontmatterParser.getReaderPreferences);
const mockGetCurrentChapter = vi.mocked(frontmatterParser.getCurrentChapter);
const mockParseHighlightsFromNote = vi.mocked(highlightParser.parseHighlightsFromNote);

// Helper to create mock config
function createMockConfig(overrides: Partial<ReturnType<typeof createMockConfig>> = {}) {
  return {
    library_path: '/test/vault',
    literature_note_tag: 'literature-note',
    source_key: 'source',
    progress_key: 'reading_progress',
    last_read_key: 'last_read',
    last_opened_cfi_key: 'last_opened_cfi',
    date_created_key: 'dateCreated',
    date_finished_key: 'date_finished',
    collections_key: 'collections',
    bookmarks_key: 'bookmarks',
    pinned_key: 'pinned',
    reading_stats_key: 'reading_stats',
    author_key: 'author',
    rating_key: 'rating',
    total_pages_key: 'total_pages',
    reader_preferences_key: 'reader_preferences',
    current_chapter_key: 'current_chapter',
    exclude_folders: ['.obsidian', '.trash', 'templates'],
    highlight_template: '',
    highlight_template_epub: '',
    progress_debounce_ms: 5000,
    search_context_chars: 80,
    search_max_matches_per_doc: 50,
    search_results_per_doc: 10,
    reading_history_max_days: 90,
    cover_width: 300,
    cover_height: 450,
    cover_quality: 80,
    default_daily_goal_minutes: 30,
    default_grace_period_days: 1,
    reading_history_key: 'reading_history',
    ...overrides,
  };
}

// Helper to create a mock directory entry
function createMockDirent(name: string, isDir: boolean) {
  return {
    name,
    isDirectory: () => isDir,
    isFile: () => !isDir,
    isBlockDevice: () => false,
    isCharacterDevice: () => false,
    isSymbolicLink: () => false,
    isFIFO: () => false,
    isSocket: () => false,
    parentPath: '/test',
    path: '/test/' + name,
  };
}

// Setup default mocks for note parsing
function setupDefaultNoteMocks() {
  mockParseNoteFrontmatter.mockReturnValue({
    frontmatter: { tags: ['literature-note'] },
    content: '',
  });
  mockHasTag.mockReturnValue(true);
  mockGetSourcePath.mockReturnValue('books/test.pdf');
  mockGetProgress.mockReturnValue(50);
  mockGetLastRead.mockReturnValue('2024-01-15T10:00:00.000Z');
  mockGetLastOpenedCfi.mockReturnValue(null);
  mockGetDateCreated.mockReturnValue('2024-01-01T00:00:00.000Z');
  mockGetDateFinished.mockReturnValue(null);
  mockGetCollections.mockReturnValue([]);
  mockGetTitle.mockReturnValue('Test Book');
  mockGetBookmarks.mockReturnValue([]);
  mockGetPinned.mockReturnValue(false);
  mockGetReadingStats.mockReturnValue(null);
  mockGetAuthor.mockReturnValue(null);
  mockGetRating.mockReturnValue(null);
  mockGetTotalPages.mockReturnValue(null);
  mockGetReaderPreferences.mockReturnValue(null);
  mockGetCurrentChapter.mockReturnValue(null);
  mockParseHighlightsFromNote.mockReturnValue([]);
}

describe('LibraryScanner', () => {
  let LibraryScanner: typeof import('../library-scanner.js').LibraryScanner;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    // Reimport to get fresh module
    const module = await import('../library-scanner.js');
    LibraryScanner = module.LibraryScanner;

    // Setup default mocks
    setupDefaultNoteMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('creates scanner with provided config', () => {
      const config = createMockConfig();
      mockReaddirSync.mockReturnValue([]);

      const scanner = new LibraryScanner(config as any);
      expect(scanner).toBeDefined();
    });
  });

  describe('scan', () => {
    it('scans the library path for markdown files', () => {
      const config = createMockConfig();
      mockReaddirSync.mockReturnValue([
        createMockDirent('note.md', false),
      ] as any);
      mockStatSync.mockReturnValue({ isFile: () => true } as any);

      const scanner = new LibraryScanner(config as any);
      scanner.scan();

      expect(mockReaddirSync).toHaveBeenCalledWith(
        '/test/vault',
        expect.objectContaining({ withFileTypes: true })
      );
    });

    it('clears existing notes before scanning', () => {
      const config = createMockConfig();
      mockReaddirSync.mockReturnValue([
        createMockDirent('note.md', false),
      ] as any);
      mockStatSync.mockReturnValue({ isFile: () => true } as any);

      const scanner = new LibraryScanner(config as any);
      scanner.scan();

      // First scan
      expect(scanner.getAll().length).toBeLessThanOrEqual(1);

      // Mock to return no files on second scan
      mockReaddirSync.mockReturnValue([]);
      scanner.scan();

      expect(scanner.getAll()).toHaveLength(0);
    });

    it('recursively scans subdirectories', () => {
      const config = createMockConfig();

      // Root directory
      mockReaddirSync.mockImplementation((path) => {
        if (path === '/test/vault') {
          return [createMockDirent('subdir', true)] as any;
        }
        if (path === '/test/vault/subdir') {
          return [createMockDirent('note.md', false)] as any;
        }
        return [];
      });

      mockStatSync.mockReturnValue({ isFile: () => true } as any);

      const scanner = new LibraryScanner(config as any);
      scanner.scan();

      expect(mockReaddirSync).toHaveBeenCalledWith(
        '/test/vault/subdir',
        expect.objectContaining({ withFileTypes: true })
      );
    });

    it('skips hidden files and directories', () => {
      const config = createMockConfig();
      mockReaddirSync.mockReturnValue([
        createMockDirent('.hidden', true),
        createMockDirent('.hiddenfile.md', false),
        createMockDirent('visible.md', false),
      ] as any);
      mockStatSync.mockReturnValue({ isFile: () => true } as any);

      const scanner = new LibraryScanner(config as any);
      scanner.scan();

      // Should only process visible.md
      expect(mockParseNoteFrontmatter).toHaveBeenCalledTimes(1);
      expect(mockParseNoteFrontmatter).toHaveBeenCalledWith('/test/vault/visible.md');
    });

    it('skips excluded folders', () => {
      const config = createMockConfig({
        exclude_folders: ['.obsidian', 'templates'],
      });

      mockReaddirSync.mockImplementation((path) => {
        if (path === '/test/vault') {
          return [
            createMockDirent('.obsidian', true),
            createMockDirent('templates', true),
            createMockDirent('notes', true),
          ] as any;
        }
        if (path === '/test/vault/notes') {
          return [createMockDirent('note.md', false)] as any;
        }
        return [];
      });

      mockStatSync.mockReturnValue({ isFile: () => true } as any);

      const scanner = new LibraryScanner(config as any);
      scanner.scan();

      // Should not scan .obsidian or templates
      expect(mockReaddirSync).not.toHaveBeenCalledWith(
        '/test/vault/.obsidian',
        expect.anything()
      );
      expect(mockReaddirSync).not.toHaveBeenCalledWith(
        '/test/vault/templates',
        expect.anything()
      );
      expect(mockReaddirSync).toHaveBeenCalledWith(
        '/test/vault/notes',
        expect.objectContaining({ withFileTypes: true })
      );
    });

    it('skips nested excluded folders', () => {
      const config = createMockConfig({
        exclude_folders: ['archive/old'],
      });

      mockReaddirSync.mockImplementation((path) => {
        if (path === '/test/vault') {
          return [createMockDirent('archive', true)] as any;
        }
        if (path === '/test/vault/archive') {
          return [
            createMockDirent('old', true),
            createMockDirent('new', true),
          ] as any;
        }
        if (path === '/test/vault/archive/new') {
          return [createMockDirent('note.md', false)] as any;
        }
        return [];
      });

      mockStatSync.mockReturnValue({ isFile: () => true } as any);

      const scanner = new LibraryScanner(config as any);
      scanner.scan();

      // Should not scan archive/old but should scan archive/new
      expect(mockReaddirSync).not.toHaveBeenCalledWith(
        '/test/vault/archive/old',
        expect.anything()
      );
    });

    it('handles directory read errors gracefully', () => {
      const config = createMockConfig();
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      mockReaddirSync.mockImplementation((path) => {
        if (path === '/test/vault') {
          throw new Error('Permission denied');
        }
        return [];
      });

      const scanner = new LibraryScanner(config as any);
      expect(() => scanner.scan()).not.toThrow();
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Unable to scan directory')
      );

      consoleSpy.mockRestore();
    });

    it('does not log warning for ENOENT errors', () => {
      const config = createMockConfig();
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      mockReaddirSync.mockImplementation(() => {
        const error = new Error('ENOENT: no such file or directory');
        throw error;
      });

      const scanner = new LibraryScanner(config as any);
      scanner.scan();

      expect(consoleSpy).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('note processing', () => {
    it('skips files without literature note tag', () => {
      const config = createMockConfig();
      mockReaddirSync.mockReturnValue([
        createMockDirent('note.md', false),
      ] as any);
      mockHasTag.mockReturnValue(false);

      const scanner = new LibraryScanner(config as any);
      scanner.scan();

      expect(scanner.getAll()).toHaveLength(0);
    });

    it('skips notes without source path', () => {
      const config = createMockConfig();
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      mockReaddirSync.mockReturnValue([
        createMockDirent('note.md', false),
      ] as any);
      mockGetSourcePath.mockReturnValue(null);

      const scanner = new LibraryScanner(config as any);
      scanner.scan();

      expect(scanner.getAll()).toHaveLength(0);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('missing source')
      );

      consoleSpy.mockRestore();
    });

    it('skips notes with unsupported source types', () => {
      const config = createMockConfig();
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      mockReaddirSync.mockReturnValue([
        createMockDirent('note.md', false),
      ] as any);
      mockGetSourcePath.mockReturnValue('document.docx');

      const scanner = new LibraryScanner(config as any);
      scanner.scan();

      expect(scanner.getAll()).toHaveLength(0);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Unsupported source type')
      );

      consoleSpy.mockRestore();
    });

    it('processes PDF source files', () => {
      const config = createMockConfig();
      mockReaddirSync.mockReturnValue([
        createMockDirent('note.md', false),
      ] as any);
      mockStatSync.mockReturnValue({ isFile: () => true } as any);
      mockGetSourcePath.mockReturnValue('books/test.pdf');

      const scanner = new LibraryScanner(config as any);
      scanner.scan();

      const notes = scanner.getAll();
      expect(notes).toHaveLength(1);
      expect(notes[0].sourceType).toBe('pdf');
    });

    it('processes EPUB source files', () => {
      const config = createMockConfig();
      mockReaddirSync.mockReturnValue([
        createMockDirent('note.md', false),
      ] as any);
      mockStatSync.mockReturnValue({ isFile: () => true } as any);
      mockGetSourcePath.mockReturnValue('books/test.epub');

      const scanner = new LibraryScanner(config as any);
      scanner.scan();

      const notes = scanner.getAll();
      expect(notes).toHaveLength(1);
      expect(notes[0].sourceType).toBe('epub');
    });

    it('handles source type case-insensitively', () => {
      const config = createMockConfig();
      mockReaddirSync.mockReturnValue([
        createMockDirent('note.md', false),
      ] as any);
      mockStatSync.mockReturnValue({ isFile: () => true } as any);
      mockGetSourcePath.mockReturnValue('books/test.PDF');

      const scanner = new LibraryScanner(config as any);
      scanner.scan();

      const notes = scanner.getAll();
      expect(notes).toHaveLength(1);
      expect(notes[0].sourceType).toBe('pdf');
    });

    it('warns when source file is not found', () => {
      const config = createMockConfig();
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      mockReaddirSync.mockReturnValue([
        createMockDirent('note.md', false),
      ] as any);
      // Source file doesn't exist
      mockStatSync.mockImplementation(() => {
        throw new Error('ENOENT');
      });

      const scanner = new LibraryScanner(config as any);
      scanner.scan();

      expect(scanner.getAll()).toHaveLength(0);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Source file not found')
      );

      consoleSpy.mockRestore();
    });

    it('handles note processing errors gracefully', () => {
      const config = createMockConfig();
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      mockReaddirSync.mockReturnValue([
        createMockDirent('note.md', false),
      ] as any);
      mockParseNoteFrontmatter.mockImplementation(() => {
        throw new Error('Parse error');
      });

      const scanner = new LibraryScanner(config as any);
      expect(() => scanner.scan()).not.toThrow();
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error processing note'),
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });
  });

  describe('source path resolution', () => {
    it('resolves source relative to note directory first', () => {
      const config = createMockConfig();
      mockReaddirSync.mockReturnValue([
        createMockDirent('notes', true),
      ] as any);

      mockReaddirSync.mockImplementation((path) => {
        if (path === '/test/vault') {
          return [createMockDirent('notes', true)] as any;
        }
        if (path === '/test/vault/notes') {
          return [createMockDirent('book.md', false)] as any;
        }
        return [];
      });

      mockGetSourcePath.mockReturnValue('book.pdf');

      // Source exists relative to note
      mockStatSync.mockImplementation((path) => {
        if (path === '/test/vault/notes/book.pdf') {
          return { isFile: () => true } as any;
        }
        throw new Error('ENOENT');
      });

      const scanner = new LibraryScanner(config as any);
      scanner.scan();

      const notes = scanner.getAll();
      expect(notes).toHaveLength(1);
      expect(notes[0].source).toBe('/test/vault/notes/book.pdf');
    });

    it('falls back to vault root for source resolution', () => {
      const config = createMockConfig();
      mockReaddirSync.mockReturnValue([
        createMockDirent('note.md', false),
      ] as any);
      mockGetSourcePath.mockReturnValue('attachments/book.pdf');

      // Source doesn't exist relative to note but exists at vault root
      mockStatSync.mockImplementation((path) => {
        if (path === '/test/vault/attachments/book.pdf') {
          return { isFile: () => true } as any;
        }
        throw new Error('ENOENT');
      });

      const scanner = new LibraryScanner(config as any);
      scanner.scan();

      const notes = scanner.getAll();
      expect(notes).toHaveLength(1);
      expect(notes[0].source).toBe('/test/vault/attachments/book.pdf');
    });

    it('checks common attachment folders for source files', () => {
      const config = createMockConfig();
      mockReaddirSync.mockReturnValue([
        createMockDirent('note.md', false),
      ] as any);
      mockGetSourcePath.mockReturnValue('book.pdf');

      // Source only exists in assets folder
      mockStatSync.mockImplementation((path) => {
        if (path === '/test/vault/assets/book.pdf') {
          return { isFile: () => true } as any;
        }
        throw new Error('ENOENT');
      });

      const scanner = new LibraryScanner(config as any);
      scanner.scan();

      const notes = scanner.getAll();
      expect(notes).toHaveLength(1);
      expect(notes[0].source).toBe('/test/vault/assets/book.pdf');
    });
  });

  describe('ID generation', () => {
    it('generates stable IDs from note paths', () => {
      const config = createMockConfig();
      mockReaddirSync.mockReturnValue([
        createMockDirent('note.md', false),
      ] as any);
      mockStatSync.mockReturnValue({ isFile: () => true } as any);

      const scanner = new LibraryScanner(config as any);
      scanner.scan();

      const notes = scanner.getAll();
      expect(notes[0].id).toHaveLength(12);
      expect(notes[0].id).toMatch(/^[a-f0-9]+$/);
    });

    it('generates consistent IDs for the same path', () => {
      const config = createMockConfig();
      mockReaddirSync.mockReturnValue([
        createMockDirent('note.md', false),
      ] as any);
      mockStatSync.mockReturnValue({ isFile: () => true } as any);

      const scanner = new LibraryScanner(config as any);
      scanner.scan();
      const id1 = scanner.getAll()[0].id;

      scanner.scan();
      const id2 = scanner.getAll()[0].id;

      expect(id1).toBe(id2);
    });

    it('generates different IDs for different paths', () => {
      const config = createMockConfig();
      mockReaddirSync.mockReturnValue([
        createMockDirent('note1.md', false),
        createMockDirent('note2.md', false),
      ] as any);
      mockStatSync.mockReturnValue({ isFile: () => true } as any);

      const scanner = new LibraryScanner(config as any);
      scanner.scan();

      const notes = scanner.getAll();
      expect(notes[0].id).not.toBe(notes[1].id);
    });
  });

  describe('tag extraction', () => {
    it('extracts tags from frontmatter array', () => {
      const config = createMockConfig();
      mockReaddirSync.mockReturnValue([
        createMockDirent('note.md', false),
      ] as any);
      mockStatSync.mockReturnValue({ isFile: () => true } as any);
      mockParseNoteFrontmatter.mockReturnValue({
        frontmatter: { tags: ['#fiction', 'reading', '#science'] },
        content: '',
      });

      const scanner = new LibraryScanner(config as any);
      scanner.scan();

      const notes = scanner.getAll();
      expect(notes[0].tags).toEqual(['fiction', 'reading', 'science']);
    });

    it('handles comma-separated string tags', () => {
      const config = createMockConfig();
      mockReaddirSync.mockReturnValue([
        createMockDirent('note.md', false),
      ] as any);
      mockStatSync.mockReturnValue({ isFile: () => true } as any);
      mockParseNoteFrontmatter.mockReturnValue({
        frontmatter: { tags: '#fiction, reading, #science' },
        content: '',
      });

      const scanner = new LibraryScanner(config as any);
      scanner.scan();

      const notes = scanner.getAll();
      expect(notes[0].tags).toEqual(['fiction', 'reading', 'science']);
    });

    it('returns empty array when no tags', () => {
      const config = createMockConfig();
      mockReaddirSync.mockReturnValue([
        createMockDirent('note.md', false),
      ] as any);
      mockStatSync.mockReturnValue({ isFile: () => true } as any);
      mockParseNoteFrontmatter.mockReturnValue({
        frontmatter: {},
        content: '',
      });

      const scanner = new LibraryScanner(config as any);
      scanner.scan();

      const notes = scanner.getAll();
      expect(notes[0].tags).toEqual([]);
    });

    it('handles null or undefined tags', () => {
      const config = createMockConfig();
      mockReaddirSync.mockReturnValue([
        createMockDirent('note.md', false),
      ] as any);
      mockStatSync.mockReturnValue({ isFile: () => true } as any);
      mockParseNoteFrontmatter.mockReturnValue({
        frontmatter: { tags: null },
        content: '',
      });

      const scanner = new LibraryScanner(config as any);
      scanner.scan();

      const notes = scanner.getAll();
      expect(notes[0].tags).toEqual([]);
    });
  });

  describe('getAll', () => {
    it('returns all scanned notes', () => {
      const config = createMockConfig();
      mockReaddirSync.mockReturnValue([
        createMockDirent('note1.md', false),
        createMockDirent('note2.md', false),
      ] as any);
      mockStatSync.mockReturnValue({ isFile: () => true } as any);

      const scanner = new LibraryScanner(config as any);
      scanner.scan();

      expect(scanner.getAll()).toHaveLength(2);
    });

    it('returns empty array before scanning', () => {
      const config = createMockConfig();
      const scanner = new LibraryScanner(config as any);

      expect(scanner.getAll()).toHaveLength(0);
    });
  });

  describe('getById', () => {
    it('returns note by ID', () => {
      const config = createMockConfig();
      mockReaddirSync.mockReturnValue([
        createMockDirent('note.md', false),
      ] as any);
      mockStatSync.mockReturnValue({ isFile: () => true } as any);

      const scanner = new LibraryScanner(config as any);
      scanner.scan();

      const notes = scanner.getAll();
      const note = scanner.getById(notes[0].id);

      expect(note).toBeDefined();
      expect(note?.id).toBe(notes[0].id);
    });

    it('returns undefined for non-existent ID', () => {
      const config = createMockConfig();
      mockReaddirSync.mockReturnValue([]);

      const scanner = new LibraryScanner(config as any);
      scanner.scan();

      expect(scanner.getById('nonexistent')).toBeUndefined();
    });
  });

  describe('getSummaries', () => {
    beforeEach(() => {
      mockGetAuthor.mockReturnValue('Test Author');
      mockGetRating.mockReturnValue(4);
    });

    it('returns summaries of all notes', () => {
      const config = createMockConfig();
      mockReaddirSync.mockReturnValue([
        createMockDirent('note.md', false),
      ] as any);
      mockStatSync.mockReturnValue({ isFile: () => true } as any);

      const scanner = new LibraryScanner(config as any);
      scanner.scan();

      const summaries = scanner.getSummaries();
      expect(summaries).toHaveLength(1);
      expect(summaries[0]).toHaveProperty('id');
      expect(summaries[0]).toHaveProperty('title');
      expect(summaries[0]).toHaveProperty('progress');
      expect(summaries[0]).toHaveProperty('highlightCount');
    });

    it('sorts by lastRead descending by default', () => {
      const config = createMockConfig();
      mockReaddirSync.mockReturnValue([
        createMockDirent('note1.md', false),
        createMockDirent('note2.md', false),
      ] as any);
      mockStatSync.mockReturnValue({ isFile: () => true } as any);

      // Use separate counters for each mock function
      let lastReadCalls = 0;
      let titleCalls = 0;
      mockGetLastRead.mockImplementation(() => {
        lastReadCalls++;
        return lastReadCalls === 1 ? '2024-01-01T00:00:00.000Z' : '2024-01-15T00:00:00.000Z';
      });
      mockGetTitle.mockImplementation(() => {
        titleCalls++;
        return titleCalls === 1 ? 'Older Book' : 'Newer Book';
      });

      const scanner = new LibraryScanner(config as any);
      scanner.scan();

      const summaries = scanner.getSummaries();
      expect(summaries[0].title).toBe('Newer Book');
      expect(summaries[1].title).toBe('Older Book');
    });

    it('sorts by title ascending', () => {
      const config = createMockConfig();
      mockReaddirSync.mockReturnValue([
        createMockDirent('note1.md', false),
        createMockDirent('note2.md', false),
      ] as any);
      mockStatSync.mockReturnValue({ isFile: () => true } as any);

      let callCount = 0;
      mockGetTitle.mockImplementation(() => {
        callCount++;
        return callCount === 1 ? 'Zebra' : 'Apple';
      });

      const scanner = new LibraryScanner(config as any);
      scanner.scan();

      const summaries = scanner.getSummaries('title', 'asc');
      expect(summaries[0].title).toBe('Apple');
      expect(summaries[1].title).toBe('Zebra');
    });

    it('sorts by progress', () => {
      const config = createMockConfig();
      mockReaddirSync.mockReturnValue([
        createMockDirent('note1.md', false),
        createMockDirent('note2.md', false),
      ] as any);
      mockStatSync.mockReturnValue({ isFile: () => true } as any);

      let progressCalls = 0;
      let titleCalls = 0;
      mockGetProgress.mockImplementation(() => {
        progressCalls++;
        return progressCalls === 1 ? 25 : 75;
      });
      mockGetTitle.mockImplementation(() => {
        titleCalls++;
        return titleCalls === 1 ? 'Low Progress' : 'High Progress';
      });

      const scanner = new LibraryScanner(config as any);
      scanner.scan();

      const summaries = scanner.getSummaries('progress', 'desc');
      expect(summaries[0].title).toBe('High Progress');
      expect(summaries[1].title).toBe('Low Progress');
    });

    it('sorts by dateCreated', () => {
      const config = createMockConfig();
      mockReaddirSync.mockReturnValue([
        createMockDirent('note1.md', false),
        createMockDirent('note2.md', false),
      ] as any);
      mockStatSync.mockReturnValue({ isFile: () => true } as any);

      let dateCreatedCalls = 0;
      let titleCalls = 0;
      mockGetDateCreated.mockImplementation(() => {
        dateCreatedCalls++;
        return dateCreatedCalls === 1 ? '2024-01-01T00:00:00.000Z' : '2024-01-15T00:00:00.000Z';
      });
      mockGetTitle.mockImplementation(() => {
        titleCalls++;
        return titleCalls === 1 ? 'Older' : 'Newer';
      });

      const scanner = new LibraryScanner(config as any);
      scanner.scan();

      const summaries = scanner.getSummaries('dateCreated', 'asc');
      expect(summaries[0].title).toBe('Older');
      expect(summaries[1].title).toBe('Newer');
    });

    it('sorts by author with empty authors at end', () => {
      const config = createMockConfig();
      mockReaddirSync.mockReturnValue([
        createMockDirent('note1.md', false),
        createMockDirent('note2.md', false),
        createMockDirent('note3.md', false),
      ] as any);
      mockStatSync.mockReturnValue({ isFile: () => true } as any);

      let callCount = 0;
      mockGetAuthor.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return null;
        if (callCount === 2) return 'Alice';
        return 'Bob';
      });
      mockGetTitle.mockImplementation(() => `Book ${callCount}`);

      const scanner = new LibraryScanner(config as any);
      scanner.scan();

      const summaries = scanner.getSummaries('author', 'asc');
      expect(summaries[0].author).toBe('Alice');
      expect(summaries[1].author).toBe('Bob');
      expect(summaries[2].author).toBeNull();
    });

    it('sorts by rating with unrated at end', () => {
      const config = createMockConfig();
      mockReaddirSync.mockReturnValue([
        createMockDirent('note1.md', false),
        createMockDirent('note2.md', false),
        createMockDirent('note3.md', false),
      ] as any);
      mockStatSync.mockReturnValue({ isFile: () => true } as any);

      // Reset and use mockReturnValueOnce to control each call
      mockGetRating.mockReset();
      mockGetRating
        .mockReturnValueOnce(null)  // note1.md
        .mockReturnValueOnce(3)     // note2.md
        .mockReturnValueOnce(5);    // note3.md

      mockGetTitle.mockReset();
      mockGetTitle
        .mockReturnValueOnce('Unrated Book')  // note1.md
        .mockReturnValueOnce('Book with 3')   // note2.md
        .mockReturnValueOnce('Book with 5');  // note3.md

      const scanner = new LibraryScanner(config as any);
      scanner.scan();

      const summaries = scanner.getSummaries('rating', 'desc');
      expect(summaries[0].rating).toBe(5);
      expect(summaries[1].rating).toBe(3);
      expect(summaries[2].rating).toBeNull();
    });

    it('includes highlight count in summary', () => {
      const config = createMockConfig();
      mockReaddirSync.mockReturnValue([
        createMockDirent('note.md', false),
      ] as any);
      mockStatSync.mockReturnValue({ isFile: () => true } as any);
      mockParseHighlightsFromNote.mockReturnValue([
        { id: '1', type: 'pdf', page: 1, text: 'Test', createdAt: '', selection: { beginIndex: 0, beginOffset: 0, endIndex: 0, endOffset: 1 } },
        { id: '2', type: 'pdf', page: 2, text: 'Test 2', createdAt: '', selection: { beginIndex: 0, beginOffset: 0, endIndex: 0, endOffset: 1 } },
      ] as any);

      const scanner = new LibraryScanner(config as any);
      scanner.scan();

      const summaries = scanner.getSummaries();
      expect(summaries[0].highlightCount).toBe(2);
    });

    it('includes citekey from frontmatter id', () => {
      const config = createMockConfig();
      mockReaddirSync.mockReturnValue([
        createMockDirent('note.md', false),
      ] as any);
      mockStatSync.mockReturnValue({ isFile: () => true } as any);
      mockParseNoteFrontmatter.mockReturnValue({
        frontmatter: { tags: ['literature-note'], id: 'smith2024' },
        content: '',
      });

      const scanner = new LibraryScanner(config as any);
      scanner.scan();

      const summaries = scanner.getSummaries();
      expect(summaries[0].citekey).toBe('smith2024');
    });
  });

  describe('refresh', () => {
    it('rescans the library', () => {
      const config = createMockConfig();
      mockReaddirSync.mockReturnValue([
        createMockDirent('note.md', false),
      ] as any);
      mockStatSync.mockReturnValue({ isFile: () => true } as any);

      const scanner = new LibraryScanner(config as any);
      scanner.scan();
      expect(scanner.getAll()).toHaveLength(1);

      // Add another note
      mockReaddirSync.mockReturnValue([
        createMockDirent('note.md', false),
        createMockDirent('note2.md', false),
      ] as any);

      scanner.refresh();
      expect(scanner.getAll()).toHaveLength(2);
    });
  });

  describe('updateNote', () => {
    it('updates note properties in memory', () => {
      const config = createMockConfig();
      mockReaddirSync.mockReturnValue([
        createMockDirent('note.md', false),
      ] as any);
      mockStatSync.mockReturnValue({ isFile: () => true } as any);

      const scanner = new LibraryScanner(config as any);
      scanner.scan();

      const notes = scanner.getAll();
      const originalProgress = notes[0].progress;

      scanner.updateNote(notes[0].id, { progress: 100 });

      const updatedNote = scanner.getById(notes[0].id);
      expect(updatedNote?.progress).toBe(100);
      expect(updatedNote?.progress).not.toBe(originalProgress);
    });

    it('does nothing for non-existent note ID', () => {
      const config = createMockConfig();
      mockReaddirSync.mockReturnValue([]);

      const scanner = new LibraryScanner(config as any);
      scanner.scan();

      // Should not throw
      expect(() => scanner.updateNote('nonexistent', { progress: 100 })).not.toThrow();
    });
  });

  describe('cover path', () => {
    it('uses explicit cover from frontmatter if present', () => {
      const config = createMockConfig();
      mockReaddirSync.mockReturnValue([
        createMockDirent('note.md', false),
      ] as any);
      mockStatSync.mockReturnValue({ isFile: () => true } as any);
      mockParseNoteFrontmatter.mockReturnValue({
        frontmatter: { tags: ['literature-note'], cover: 'covers/mybook.jpg' },
        content: '',
      });

      const scanner = new LibraryScanner(config as any);
      scanner.scan();

      const notes = scanner.getAll();
      expect(notes[0].cover).toBe('covers/mybook.jpg');
    });

    it('generates API cover path when no explicit cover', () => {
      const config = createMockConfig();
      mockReaddirSync.mockReturnValue([
        createMockDirent('note.md', false),
      ] as any);
      mockStatSync.mockReturnValue({ isFile: () => true } as any);

      const scanner = new LibraryScanner(config as any);
      scanner.scan();

      const notes = scanner.getAll();
      expect(notes[0].cover).toMatch(/^\/api\/covers\/[a-f0-9]+$/);
    });
  });

  describe('EPUB specific handling', () => {
    it('includes lastOpenedCfi for EPUB sources', () => {
      const config = createMockConfig();
      mockReaddirSync.mockReturnValue([
        createMockDirent('note.md', false),
      ] as any);
      mockStatSync.mockReturnValue({ isFile: () => true } as any);
      mockGetSourcePath.mockReturnValue('books/test.epub');
      mockGetLastOpenedCfi.mockReturnValue('epubcfi(/6/4[chap01ref]!/4/2/4)');

      const scanner = new LibraryScanner(config as any);
      scanner.scan();

      const notes = scanner.getAll();
      expect(notes[0].sourceType).toBe('epub');
      expect(notes[0].lastOpenedCfi).toBe('epubcfi(/6/4[chap01ref]!/4/2/4)');
    });

    it('sets lastOpenedCfi to null for PDF sources', () => {
      const config = createMockConfig();
      mockReaddirSync.mockReturnValue([
        createMockDirent('note.md', false),
      ] as any);
      mockStatSync.mockReturnValue({ isFile: () => true } as any);
      mockGetSourcePath.mockReturnValue('books/test.pdf');
      mockGetLastOpenedCfi.mockReturnValue('epubcfi(/6/4)'); // Should be ignored

      const scanner = new LibraryScanner(config as any);
      scanner.scan();

      const notes = scanner.getAll();
      expect(notes[0].sourceType).toBe('pdf');
      expect(notes[0].lastOpenedCfi).toBeNull();
    });
  });

  describe('note data population', () => {
    it('populates all note fields correctly', () => {
      const config = createMockConfig();
      mockReaddirSync.mockReturnValue([
        createMockDirent('note.md', false),
      ] as any);
      mockStatSync.mockReturnValue({ isFile: () => true } as any);

      mockGetTitle.mockReturnValue('My Book Title');
      mockGetAuthor.mockReturnValue('John Author');
      mockGetProgress.mockReturnValue(75);
      mockGetLastRead.mockReturnValue('2024-01-15T10:00:00.000Z');
      mockGetDateCreated.mockReturnValue('2024-01-01T00:00:00.000Z');
      mockGetDateFinished.mockReturnValue('2024-01-20T00:00:00.000Z');
      mockGetCollections.mockReturnValue(['Fiction', 'Favorites']);
      mockGetPinned.mockReturnValue(true);
      mockGetRating.mockReturnValue(5);
      mockGetTotalPages.mockReturnValue(350);
      mockGetReaderPreferences.mockReturnValue({ zoomLevel: 1.5, theme: 'dark' });
      mockGetCurrentChapter.mockReturnValue('Chapter 10');
      mockGetBookmarks.mockReturnValue([
        { id: 'b1', label: 'Start', page: 1, createdAt: '2024-01-01' },
      ]);
      mockParseHighlightsFromNote.mockReturnValue([
        { id: 'h1', type: 'pdf', page: 10, text: 'Important', createdAt: '', selection: { beginIndex: 0, beginOffset: 0, endIndex: 0, endOffset: 1 } },
      ] as any);

      const scanner = new LibraryScanner(config as any);
      scanner.scan();

      const notes = scanner.getAll();
      expect(notes).toHaveLength(1);

      const note = notes[0];
      expect(note.title).toBe('My Book Title');
      expect(note.author).toBe('John Author');
      expect(note.progress).toBe(75);
      expect(note.lastRead).toBe('2024-01-15T10:00:00.000Z');
      expect(note.dateCreated).toBe('2024-01-01T00:00:00.000Z');
      expect(note.dateFinished).toBe('2024-01-20T00:00:00.000Z');
      expect(note.collections).toEqual(['Fiction', 'Favorites']);
      expect(note.pinned).toBe(true);
      expect(note.rating).toBe(5);
      expect(note.totalPages).toBe(350);
      expect(note.readerPreferences).toEqual({ zoomLevel: 1.5, theme: 'dark' });
      expect(note.currentChapter).toBe('Chapter 10');
      expect(note.bookmarks).toHaveLength(1);
      expect(note.highlights).toHaveLength(1);
      expect(note.notePath).toBe('/test/vault/note.md');
      expect(note.sourceRelative).toBe('books/test.pdf');
    });
  });
});
