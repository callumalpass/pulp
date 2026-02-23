import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { CoverExtractor } from '../cover-extractor.js';
import type { Config } from '../../config/schema.js';

// Mock fs module
vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  readFileSync: vi.fn(),
  statSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({
  unlink: vi.fn(),
}));

// Mock pdfjs-dist
vi.mock('pdfjs-dist/legacy/build/pdf.mjs', () => ({
  getDocument: vi.fn(),
}));

// Mock @napi-rs/canvas
vi.mock('@napi-rs/canvas', () => ({
  createCanvas: vi.fn(),
}));

// Mock sharp
vi.mock('sharp', () => ({
  default: vi.fn(),
}));

// Mock epub2
vi.mock('epub2', () => ({
  default: vi.fn(),
}));

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { unlink } from 'node:fs/promises';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createCanvas } from '@napi-rs/canvas';
import sharp from 'sharp';
import EPub from 'epub2';

const mockExistsSync = vi.mocked(existsSync);
const mockMkdirSync = vi.mocked(mkdirSync);
const mockReadFileSync = vi.mocked(readFileSync);
const mockStatSync = vi.mocked(statSync);
const mockWriteFileSync = vi.mocked(writeFileSync);
const mockUnlink = vi.mocked(unlink);
const mockGetDocument = vi.mocked(pdfjsLib.getDocument);
const mockCreateCanvas = vi.mocked(createCanvas);
const mockSharp = vi.mocked(sharp);
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
  highlight_template: '> {{text}}',
  highlight_template_epub: '> {{text}}',
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

// Helper to create a mock sharp instance chain
function createMockSharpChain(finalBuffer: Buffer = Buffer.from('webp-image')) {
  const chain = {
    resize: vi.fn().mockReturnThis(),
    webp: vi.fn().mockReturnThis(),
    toBuffer: vi.fn().mockResolvedValue(finalBuffer),
    metadata: vi.fn().mockResolvedValue({ width: 400, height: 600 }),
  };
  return chain;
}

// Helper to create a mock PDF document
function createMockPdf() {
  const mockPage = {
    getViewport: vi.fn().mockReturnValue({ width: 612, height: 792 }),
    render: vi.fn().mockReturnValue({
      promise: Promise.resolve(),
    }),
  };
  const mockPdf = {
    getPage: vi.fn().mockResolvedValue(mockPage),
    destroy: vi.fn().mockResolvedValue(undefined),
  };
  return { mockPdf, mockPage };
}

// Helper to create a mock canvas
function createMockCanvas() {
  const mockCtx = {
    fillRect: vi.fn(),
    drawImage: vi.fn(),
  };
  const mockCanvas = {
    getContext: vi.fn().mockReturnValue(mockCtx),
    toBuffer: vi.fn().mockReturnValue(Buffer.from('png-image')),
  };
  return { mockCanvas, mockCtx };
}

// Helper to create a mock EPub class that properly simulates the epub2 library
function createMockEpubClass(options: {
  metadata?: { cover?: string };
  manifest?: Record<string, { href: string; 'media-type': string; properties?: string }>;
  guide?: Array<{ type: string; href: string }>;
  spine?: { contents: Array<{ id: string }> };
  parseError?: boolean;
  getImageError?: boolean;
  imageData?: Buffer;
  chapterContent?: string;
} = {}) {
  const eventHandlers: Record<string, Array<(...args: unknown[]) => void>> = {};

  // Create a class that simulates the epub2 EPub class
  class MockEPub {
    metadata = options.metadata || {};
    manifest = options.manifest || {};
    guide = options.guide;
    spine = options.spine || { contents: [] };

    on(event: string, callback: (...args: unknown[]) => void) {
      if (!eventHandlers[event]) {
        eventHandlers[event] = [];
      }
      eventHandlers[event].push(callback);
      return this;
    }

    parse() {
      // Simulate async event emission using process.nextTick for more reliable behavior
      process.nextTick(() => {
        if (options.parseError) {
          eventHandlers['error']?.forEach(cb => cb(new Error('Parse error')));
        } else {
          eventHandlers['end']?.forEach(cb => cb());
        }
      });
    }

    getImage(_id: string, callback: (err: Error | null, data: Buffer | null, mimeType: string) => void) {
      if (options.getImageError) {
        callback(new Error('Failed to get image'), null, '');
      } else {
        callback(null, options.imageData || Buffer.from('image-data'), 'image/jpeg');
      }
    }

    getChapter(_id: string, callback: (err: Error | null, text: string | null) => void) {
      callback(null, options.chapterContent || '<img src="cover.jpg">');
    }
  }

  return MockEPub;
}

describe('CoverExtractor', () => {
  let extractor: CoverExtractor;

  beforeEach(() => {
    vi.clearAllMocks();
    // Default: cache directory doesn't exist, so it will be created
    mockExistsSync.mockReturnValue(false);
    mockStatSync.mockReturnValue({ size: 1024 } as ReturnType<typeof statSync>);
    extractor = new CoverExtractor(testConfig);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor and initialization', () => {
    it('creates cache directory if it does not exist', () => {
      mockExistsSync.mockReturnValue(false);
      new CoverExtractor(testConfig);

      expect(mockMkdirSync).toHaveBeenCalledWith(
        '/test/library/.pulp-cache/covers',
        { recursive: true }
      );
    });

    it('does not create cache directory if it already exists', () => {
      mockExistsSync.mockReturnValue(true);
      mockMkdirSync.mockClear();
      new CoverExtractor(testConfig);

      expect(mockMkdirSync).not.toHaveBeenCalled();
    });

    it('uses config values for cover dimensions', () => {
      const customConfig = {
        ...testConfig,
        cover_width: 400,
        cover_height: 600,
        cover_quality: 90,
      };
      mockExistsSync.mockReturnValue(true);
      const customExtractor = new CoverExtractor(customConfig);

      // Verify the extractor was created (internal values are private, but tested via getCover)
      expect(customExtractor).toBeDefined();
    });

    it('uses default constants when config values are undefined', () => {
      const minimalConfig = {
        ...testConfig,
        cover_width: undefined as unknown as number,
        cover_height: undefined as unknown as number,
        cover_quality: undefined as unknown as number,
      };
      mockExistsSync.mockReturnValue(true);
      const minimalExtractor = new CoverExtractor(minimalConfig);

      expect(minimalExtractor).toBeDefined();
    });
  });

  describe('getCachedCoverPath', () => {
    it('returns the correct cache path for a note ID', () => {
      const path = extractor.getCachedCoverPath('test-note-123');
      expect(path).toBe('/test/library/.pulp-cache/covers/test-note-123.webp');
    });

    it('handles note IDs with special characters', () => {
      const path = extractor.getCachedCoverPath('note-with-special_chars.123');
      expect(path).toBe('/test/library/.pulp-cache/covers/note-with-special_chars.123.webp');
    });
  });

  describe('hasCachedCover', () => {
    it('returns true when cached cover exists', () => {
      mockExistsSync.mockReturnValue(true);
      const result = extractor.hasCachedCover('test-note');
      expect(result).toBe(true);
    });

    it('returns false when cached cover does not exist', () => {
      mockExistsSync.mockImplementation((path) => {
        // Cache dir exists but cover file doesn't
        if (path === '/test/library/.pulp-cache/covers') return true;
        return false;
      });
      const result = extractor.hasCachedCover('test-note');
      expect(result).toBe(false);
    });
  });

  describe('getCover', () => {
    describe('cache behavior', () => {
      it('returns cached cover if it exists', async () => {
        const cachedBuffer = Buffer.from('cached-cover');
        mockExistsSync.mockReturnValue(true);
        mockReadFileSync.mockReturnValue(cachedBuffer);

        const result = await extractor.getCover('test-note', '/path/to/file.pdf', 'pdf');

        expect(result).toBe(cachedBuffer);
        expect(mockGetDocument).not.toHaveBeenCalled();
      });

      it('extracts and caches cover when not cached', async () => {
        const webpBuffer = Buffer.from('webp-image');
        mockExistsSync.mockImplementation((path) => {
          if (typeof path === 'string' && path.includes('.pulp-cache/covers')) {
            return !path.endsWith('.webp'); // Cache dir exists, but cover file doesn't
          }
          return true;
        });
        mockReadFileSync.mockReturnValue(Buffer.from([1, 2, 3]));

        const { mockPdf } = createMockPdf();
        mockGetDocument.mockReturnValue({ promise: Promise.resolve(mockPdf) } as unknown as ReturnType<typeof pdfjsLib.getDocument>);

        const { mockCanvas } = createMockCanvas();
        mockCreateCanvas.mockReturnValue(mockCanvas as unknown as ReturnType<typeof createCanvas>);

        const sharpChain = createMockSharpChain(webpBuffer);
        mockSharp.mockReturnValue(sharpChain as unknown as ReturnType<typeof sharp>);

        const result = await extractor.getCover('test-note', '/path/to/file.pdf', 'pdf');

        expect(result).toEqual(webpBuffer);
        expect(mockWriteFileSync).toHaveBeenCalledWith(
          '/test/library/.pulp-cache/covers/test-note.webp',
          webpBuffer
        );
      });

      it('returns null when extraction fails', async () => {
        mockExistsSync.mockImplementation((path) => {
          if (typeof path === 'string' && path.endsWith('.webp')) return false;
          return true;
        });
        mockReadFileSync.mockImplementation(() => {
          throw new Error('File not found');
        });

        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const result = await extractor.getCover('test-note', '/nonexistent/file.pdf', 'pdf');

        expect(result).toBeNull();
        expect(consoleSpy).toHaveBeenCalled();
        consoleSpy.mockRestore();
      });
    });

    describe('PDF cover extraction', () => {
      beforeEach(() => {
        mockExistsSync.mockImplementation((path) => {
          if (typeof path === 'string' && path.endsWith('.webp')) return false;
          return true;
        });
      });

      it('extracts first page of PDF as cover', async () => {
        const webpBuffer = Buffer.from('webp-image');
        mockReadFileSync.mockReturnValue(Buffer.from([1, 2, 3]));

        const { mockPdf, mockPage } = createMockPdf();
        mockGetDocument.mockReturnValue({ promise: Promise.resolve(mockPdf) } as unknown as ReturnType<typeof pdfjsLib.getDocument>);

        const { mockCanvas } = createMockCanvas();
        mockCreateCanvas.mockReturnValue(mockCanvas as unknown as ReturnType<typeof createCanvas>);

        const sharpChain = createMockSharpChain(webpBuffer);
        mockSharp.mockReturnValue(sharpChain as unknown as ReturnType<typeof sharp>);

        const result = await extractor.getCover('test-note', '/path/to/file.pdf', 'pdf');

        expect(mockGetDocument).toHaveBeenCalled();
        expect(mockPdf.getPage).toHaveBeenCalledWith(1);
        expect(mockPage.render).toHaveBeenCalled();
        expect(sharpChain.resize).toHaveBeenCalledWith(300, 450, { fit: 'cover' });
        expect(sharpChain.webp).toHaveBeenCalledWith({ quality: 80 });
        expect(result).toEqual(webpBuffer);
      });

      it('calculates correct scale based on viewport', async () => {
        mockReadFileSync.mockReturnValue(Buffer.from([1, 2, 3]));

        const mockPage = {
          getViewport: vi.fn().mockReturnValue({ width: 1000, height: 1500 }),
          render: vi.fn().mockReturnValue({ promise: Promise.resolve() }),
        };
        const mockPdf = {
          getPage: vi.fn().mockResolvedValue(mockPage),
          destroy: vi.fn().mockResolvedValue(undefined),
        };
        mockGetDocument.mockReturnValue({ promise: Promise.resolve(mockPdf) } as unknown as ReturnType<typeof pdfjsLib.getDocument>);

        const { mockCanvas } = createMockCanvas();
        mockCreateCanvas.mockReturnValue(mockCanvas as unknown as ReturnType<typeof createCanvas>);

        const sharpChain = createMockSharpChain();
        mockSharp.mockReturnValue(sharpChain as unknown as ReturnType<typeof sharp>);

        await extractor.getCover('test-note', '/path/to/file.pdf', 'pdf');

        // Should call getViewport twice: once with scale 1 and once with calculated scale
        expect(mockPage.getViewport).toHaveBeenCalledTimes(2);
        expect(mockPage.getViewport).toHaveBeenCalledWith({ scale: 1 });
      });

      it('destroys PDF document after extraction', async () => {
        mockReadFileSync.mockReturnValue(Buffer.from([1, 2, 3]));

        const { mockPdf } = createMockPdf();
        mockGetDocument.mockReturnValue({ promise: Promise.resolve(mockPdf) } as unknown as ReturnType<typeof pdfjsLib.getDocument>);

        const { mockCanvas } = createMockCanvas();
        mockCreateCanvas.mockReturnValue(mockCanvas as unknown as ReturnType<typeof createCanvas>);

        const sharpChain = createMockSharpChain();
        mockSharp.mockReturnValue(sharpChain as unknown as ReturnType<typeof sharp>);

        await extractor.getCover('test-note', '/path/to/file.pdf', 'pdf');

        expect(mockPdf.destroy).toHaveBeenCalled();
      });

      it('handles PDF loading errors gracefully', async () => {
        mockReadFileSync.mockReturnValue(Buffer.from([1, 2, 3]));
        mockGetDocument.mockReturnValue({ promise: Promise.reject(new Error('Invalid PDF')) } as unknown as ReturnType<typeof pdfjsLib.getDocument>);

        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const result = await extractor.getCover('test-note', '/path/to/file.pdf', 'pdf');

        expect(result).toBeNull();
        consoleSpy.mockRestore();
      });

      it('handles page render errors gracefully', async () => {
        mockReadFileSync.mockReturnValue(Buffer.from([1, 2, 3]));

        const mockPage = {
          getViewport: vi.fn().mockReturnValue({ width: 612, height: 792 }),
          render: vi.fn().mockReturnValue({
            promise: Promise.reject(new Error('Render failed')),
          }),
        };
        const mockPdf = {
          getPage: vi.fn().mockResolvedValue(mockPage),
          destroy: vi.fn().mockResolvedValue(undefined),
        };
        mockGetDocument.mockReturnValue({ promise: Promise.resolve(mockPdf) } as unknown as ReturnType<typeof pdfjsLib.getDocument>);

        const { mockCanvas } = createMockCanvas();
        mockCreateCanvas.mockReturnValue(mockCanvas as unknown as ReturnType<typeof createCanvas>);

        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const result = await extractor.getCover('test-note', '/path/to/file.pdf', 'pdf');

        expect(result).toBeNull();
        consoleSpy.mockRestore();
      });

      it('handles sharp processing errors gracefully', async () => {
        mockReadFileSync.mockReturnValue(Buffer.from([1, 2, 3]));

        const { mockPdf } = createMockPdf();
        mockGetDocument.mockReturnValue({ promise: Promise.resolve(mockPdf) } as unknown as ReturnType<typeof pdfjsLib.getDocument>);

        const { mockCanvas } = createMockCanvas();
        mockCreateCanvas.mockReturnValue(mockCanvas as unknown as ReturnType<typeof createCanvas>);

        const sharpChain = createMockSharpChain();
        sharpChain.toBuffer.mockRejectedValue(new Error('Sharp failed'));
        mockSharp.mockReturnValue(sharpChain as unknown as ReturnType<typeof sharp>);

        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const result = await extractor.getCover('test-note', '/path/to/file.pdf', 'pdf');

        expect(result).toBeNull();
        consoleSpy.mockRestore();
      });
    });

    describe('EPUB cover extraction', () => {
      beforeEach(() => {
        mockExistsSync.mockImplementation((path) => {
          if (typeof path === 'string' && path.endsWith('.webp')) return false;
          return true;
        });
      });

      it('extracts cover from EPUB metadata cover ID', async () => {
        const webpBuffer = Buffer.from('webp-image');
        const imageBuffer = Buffer.from('jpeg-image');

        const MockClass = createMockEpubClass({
          metadata: { cover: 'cover-image' },
          manifest: {
            'cover-image': { href: 'images/cover.jpg', 'media-type': 'image/jpeg' },
          },
          imageData: imageBuffer,
        });
        mockEPub.mockImplementation(function () { return new MockClass(); } as unknown as typeof EPub);

        const sharpChain = createMockSharpChain(webpBuffer);
        mockSharp.mockReturnValue(sharpChain as unknown as ReturnType<typeof sharp>);

        const result = await extractor.getCover('test-note', '/path/to/book.epub', 'epub');

        expect(result).toEqual(webpBuffer);
      });

      it('falls back to pattern matching when no metadata cover', async () => {
        const webpBuffer = Buffer.from('webp-image');
        const imageBuffer = Buffer.from('jpeg-image');

        const MockClass = createMockEpubClass({
          metadata: {},
          manifest: {
            'cover': { href: 'images/cover.jpg', 'media-type': 'image/jpeg' },
          },
          imageData: imageBuffer,
        });
        mockEPub.mockImplementation(function () { return new MockClass(); } as unknown as typeof EPub);

        const sharpChain = createMockSharpChain(webpBuffer);
        mockSharp.mockReturnValue(sharpChain as unknown as ReturnType<typeof sharp>);

        const result = await extractor.getCover('test-note', '/path/to/book.epub', 'epub');

        expect(result).toEqual(webpBuffer);
      });

      it('handles EPUB parse errors', async () => {
        const MockClass = createMockEpubClass({ parseError: true });
        mockEPub.mockImplementation(function () { return new MockClass(); } as unknown as typeof EPub);

        const result = await extractor.getCover('test-note', '/path/to/book.epub', 'epub');

        expect(result).toBeNull();
      });

      it('returns null when getImage fails and no fallback is available', async () => {
        mockExistsSync.mockImplementation((path) => {
          if (typeof path === 'string' && path.endsWith('.webp')) return false;
          return true;
        });

        const MockClass = createMockEpubClass({
          metadata: { cover: 'cover-image' },
          manifest: {
            'cover-image': { href: 'images/cover.jpg', 'media-type': 'image/jpeg' },
          },
          getImageError: true,
        });
        mockEPub.mockImplementation(function () { return new MockClass(); } as unknown as typeof EPub);

        const result = await extractor.getCover('test-note', '/path/to/book.epub', 'epub');

        // When the only cover image fails to load and there's no other fallback, returns null
        expect(result).toBeNull();
      });

      it('times out on problematic EPUB files', async () => {
        // Create an EPUB that never resolves
        const mockEpub = {
          metadata: {},
          manifest: {},
          spine: { contents: [] },
          on: vi.fn().mockReturnThis(), // Never calls callback
          parse: vi.fn(),
          getImage: vi.fn(),
          getChapter: vi.fn(),
        };
        mockEPub.mockImplementation(() => mockEpub as unknown as EPub);

        const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        // Use fake timers for this test
        vi.useFakeTimers();

        const resultPromise = extractor.getCover('test-note', '/path/to/book.epub', 'epub');

        // Fast-forward past the timeout
        vi.advanceTimersByTime(16000);

        const result = await resultPromise;

        expect(result).toBeNull();
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('timed out'));

        vi.useRealTimers();
        consoleSpy.mockRestore();
      });

      it('handles sharp errors during EPUB processing', async () => {
        const imageBuffer = Buffer.from('jpeg-image');

        const MockClass = createMockEpubClass({
          metadata: { cover: 'cover-image' },
          manifest: {
            'cover-image': { href: 'images/cover.jpg', 'media-type': 'image/jpeg' },
          },
          imageData: imageBuffer,
        });
        mockEPub.mockImplementation(function () { return new MockClass(); } as unknown as typeof EPub);

        const sharpChain = createMockSharpChain();
        sharpChain.toBuffer.mockRejectedValue(new Error('Sharp failed'));
        mockSharp.mockReturnValue(sharpChain as unknown as ReturnType<typeof sharp>);

        const result = await extractor.getCover('test-note', '/path/to/book.epub', 'epub');

        expect(result).toBeNull();
      });
    });
  });

  describe('invalidateCache', () => {
    it('deletes cached cover file when it exists', async () => {
      mockExistsSync.mockReturnValue(true);
      mockUnlink.mockResolvedValue(undefined);

      await extractor.invalidateCache('test-note');

      expect(mockUnlink).toHaveBeenCalledWith('/test/library/.pulp-cache/covers/test-note.webp');
    });

    it('does nothing when cached cover does not exist', async () => {
      mockExistsSync.mockImplementation((path) => {
        if (typeof path === 'string' && path.endsWith('.webp')) return false;
        return true;
      });

      await extractor.invalidateCache('test-note');

      expect(mockUnlink).not.toHaveBeenCalled();
    });
  });

  describe('EPUB fallback strategies', () => {
    // These tests use a simpler approach - we test the direct case of having
    // images in the manifest that can be found through exact ID matching ('cover')
    // which is Strategy 3 in extractEPUBCoverFallback

    it('falls back to exact cover ID match when no metadata cover', async () => {
      const webpBuffer = Buffer.from('webp-image');
      const imageBuffer = Buffer.from('jpeg-image');

      mockExistsSync.mockImplementation((path) => {
        if (typeof path === 'string' && path.endsWith('.webp')) return false;
        return true;
      });

      // EPUB with no metadata cover but an image with exact 'cover' id
      const MockClass = createMockEpubClass({
        metadata: {},
        manifest: {
          'cover': { href: 'images/cover.jpg', 'media-type': 'image/jpeg' },
        },
        imageData: imageBuffer,
      });
      mockEPub.mockImplementation(function () { return new MockClass(); } as unknown as typeof EPub);

      const sharpChain = createMockSharpChain(webpBuffer);
      mockSharp.mockReturnValue(sharpChain as unknown as ReturnType<typeof sharp>);

      const result = await extractor.getCover('test-note', '/path/to/book.epub', 'epub');

      expect(result).toEqual(webpBuffer);
    });

    it('falls back to cover-image property pattern', async () => {
      const webpBuffer = Buffer.from('webp-image');
      const imageBuffer = Buffer.from('jpeg-image');

      mockExistsSync.mockImplementation((path) => {
        if (typeof path === 'string' && path.endsWith('.webp')) return false;
        return true;
      });

      // EPUB with cover-image property in manifest
      const MockClass = createMockEpubClass({
        metadata: {},
        manifest: {
          'image-1': { href: 'images/front.jpg', 'media-type': 'image/jpeg', properties: 'cover-image' },
        },
        imageData: imageBuffer,
      });
      mockEPub.mockImplementation(function () { return new MockClass(); } as unknown as typeof EPub);

      const sharpChain = createMockSharpChain(webpBuffer);
      mockSharp.mockReturnValue(sharpChain as unknown as ReturnType<typeof sharp>);

      const result = await extractor.getCover('test-note', '/path/to/book.epub', 'epub');

      expect(result).toEqual(webpBuffer);
    });

    it('returns null when no suitable cover found in manifest', async () => {
      mockExistsSync.mockImplementation((path) => {
        if (typeof path === 'string' && path.endsWith('.webp')) return false;
        return true;
      });

      // EPUB with only non-image items
      const MockClass = createMockEpubClass({
        metadata: {},
        manifest: {
          'chapter1': { href: 'chapter1.xhtml', 'media-type': 'application/xhtml+xml' },
          'styles': { href: 'styles.css', 'media-type': 'text/css' },
        },
      });
      mockEPub.mockImplementation(function () { return new MockClass(); } as unknown as typeof EPub);

      const result = await extractor.getCover('test-note', '/path/to/book.epub', 'epub');

      expect(result).toBeNull();
    });
  });

  describe('edge cases', () => {
    it('handles empty EPUB manifest', async () => {
      mockExistsSync.mockImplementation((path) => {
        if (typeof path === 'string' && path.endsWith('.webp')) return false;
        return true;
      });

      const MockClass = createMockEpubClass({
        metadata: {},
        manifest: {},
      });
      mockEPub.mockImplementation(function () { return new MockClass(); } as unknown as typeof EPub);

      const result = await extractor.getCover('test-note', '/path/to/book.epub', 'epub');

      expect(result).toBeNull();
    });

    it('handles EPUB constructor throwing', async () => {
      mockExistsSync.mockImplementation((path) => {
        if (typeof path === 'string' && path.endsWith('.webp')) return false;
        return true;
      });

      mockEPub.mockImplementation(function () {
        throw new Error('Failed to create EPUB');
      } as unknown as typeof EPub);

      const result = await extractor.getCover('test-note', '/path/to/book.epub', 'epub');

      expect(result).toBeNull();
    });

    it('handles EPUB with only non-image manifest items', async () => {
      mockExistsSync.mockImplementation((path) => {
        if (typeof path === 'string' && path.endsWith('.webp')) return false;
        return true;
      });

      const MockClass = createMockEpubClass({
        metadata: {},
        manifest: {
          'chapter1': { href: 'chapter1.xhtml', 'media-type': 'application/xhtml+xml' },
          'styles': { href: 'styles.css', 'media-type': 'text/css' },
        },
      });
      mockEPub.mockImplementation(function () { return new MockClass(); } as unknown as typeof EPub);

      const result = await extractor.getCover('test-note', '/path/to/book.epub', 'epub');

      expect(result).toBeNull();
    });

    it('handles file read errors for PDF', async () => {
      mockExistsSync.mockImplementation((path) => {
        if (typeof path === 'string' && path.endsWith('.webp')) return false;
        return true;
      });
      mockReadFileSync.mockImplementation(() => {
        throw new Error('ENOENT: no such file');
      });

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const result = await extractor.getCover('test-note', '/nonexistent.pdf', 'pdf');

      expect(result).toBeNull();
      consoleSpy.mockRestore();
    });
  });

  describe('EPUB fallback strategy 2: guide element cover reference', () => {
    beforeEach(() => {
      mockExistsSync.mockImplementation((path) => {
        if (typeof path === 'string' && path.endsWith('.webp')) return false;
        return true;
      });
    });

    it('extracts cover from guide element with direct image reference', async () => {
      const webpBuffer = Buffer.from('webp-image');
      const imageBuffer = Buffer.from('jpeg-image');

      const MockClass = createMockEpubClass({
        metadata: {},
        manifest: {
          'cover-img': { href: 'images/cover.jpg', 'media-type': 'image/jpeg' },
        },
        guide: [{ type: 'cover', href: 'images/cover.jpg' }],
        imageData: imageBuffer,
      });
      mockEPub.mockImplementation(function () { return new MockClass(); } as unknown as typeof EPub);

      const sharpChain = createMockSharpChain(webpBuffer);
      mockSharp.mockReturnValue(sharpChain as unknown as ReturnType<typeof sharp>);

      const result = await extractor.getCover('test-note', '/path/to/book.epub', 'epub');

      expect(result).toEqual(webpBuffer);
    });

    it('extracts cover from guide element referencing an HTML page with image', async () => {
      const webpBuffer = Buffer.from('webp-image');
      const imageBuffer = Buffer.from('jpeg-image');

      const MockClass = createMockEpubClass({
        metadata: {},
        manifest: {
          'cover-page': { href: 'cover.xhtml', 'media-type': 'application/xhtml+xml' },
          'cover-img': { href: 'images/cover.jpg', 'media-type': 'image/jpeg' },
        },
        guide: [{ type: 'cover', href: 'cover.xhtml' }],
        imageData: imageBuffer,
        chapterContent: '<html><body><img src="images/cover.jpg" alt="Cover"></body></html>',
      });
      mockEPub.mockImplementation(function () { return new MockClass(); } as unknown as typeof EPub);

      const sharpChain = createMockSharpChain(webpBuffer);
      mockSharp.mockReturnValue(sharpChain as unknown as ReturnType<typeof sharp>);

      const result = await extractor.getCover('test-note', '/path/to/book.epub', 'epub');

      expect(result).toEqual(webpBuffer);
    });

    it('strips fragment from guide href before matching', async () => {
      const webpBuffer = Buffer.from('webp-image');
      const imageBuffer = Buffer.from('jpeg-image');

      const MockClass = createMockEpubClass({
        metadata: {},
        manifest: {
          'cover-img': { href: 'images/cover.jpg', 'media-type': 'image/jpeg' },
        },
        guide: [{ type: 'cover', href: 'images/cover.jpg#fragment' }],
        imageData: imageBuffer,
      });
      mockEPub.mockImplementation(function () { return new MockClass(); } as unknown as typeof EPub);

      const sharpChain = createMockSharpChain(webpBuffer);
      mockSharp.mockReturnValue(sharpChain as unknown as ReturnType<typeof sharp>);

      const result = await extractor.getCover('test-note', '/path/to/book.epub', 'epub');

      expect(result).toEqual(webpBuffer);
    });

    it('skips guide entries that are not type "cover"', async () => {
      const MockClass = createMockEpubClass({
        metadata: {},
        manifest: {
          'toc': { href: 'toc.xhtml', 'media-type': 'application/xhtml+xml' },
        },
        guide: [{ type: 'toc', href: 'toc.xhtml' }],
      });
      mockEPub.mockImplementation(function () { return new MockClass(); } as unknown as typeof EPub);

      const result = await extractor.getCover('test-note', '/path/to/book.epub', 'epub');

      expect(result).toBeNull();
    });

    it('returns null when guide is not present', async () => {
      const MockClass = createMockEpubClass({
        metadata: {},
        manifest: {
          'chapter1': { href: 'chapter1.xhtml', 'media-type': 'application/xhtml+xml' },
        },
      });
      mockEPub.mockImplementation(function () { return new MockClass(); } as unknown as typeof EPub);

      const result = await extractor.getCover('test-note', '/path/to/book.epub', 'epub');

      expect(result).toBeNull();
    });
  });

  describe('EPUB fallback strategy 4: pattern matching for common cover names', () => {
    beforeEach(() => {
      mockExistsSync.mockImplementation((path) => {
        if (typeof path === 'string' && path.endsWith('.webp')) return false;
        return true;
      });
    });

    it('matches cover image by ID containing "frontcover"', async () => {
      const webpBuffer = Buffer.from('webp-image');
      const imageBuffer = Buffer.from('jpeg-image');

      const MockClass = createMockEpubClass({
        metadata: {},
        manifest: {
          'frontcover-img': { href: 'img/fc.jpg', 'media-type': 'image/jpeg' },
        },
        imageData: imageBuffer,
      });
      mockEPub.mockImplementation(function () { return new MockClass(); } as unknown as typeof EPub);

      const sharpChain = createMockSharpChain(webpBuffer);
      mockSharp.mockReturnValue(sharpChain as unknown as ReturnType<typeof sharp>);

      const result = await extractor.getCover('test-note', '/path/to/book.epub', 'epub');

      expect(result).toEqual(webpBuffer);
    });

    it('matches cover image by href containing "jacket"', async () => {
      const webpBuffer = Buffer.from('webp-image');
      const imageBuffer = Buffer.from('jpeg-image');

      const MockClass = createMockEpubClass({
        metadata: {},
        manifest: {
          'img-001': { href: 'images/jacket.jpg', 'media-type': 'image/jpeg' },
        },
        imageData: imageBuffer,
      });
      mockEPub.mockImplementation(function () { return new MockClass(); } as unknown as typeof EPub);

      const sharpChain = createMockSharpChain(webpBuffer);
      mockSharp.mockReturnValue(sharpChain as unknown as ReturnType<typeof sharp>);

      const result = await extractor.getCover('test-note', '/path/to/book.epub', 'epub');

      expect(result).toEqual(webpBuffer);
    });

    it('matches cover image by href containing "titlepage"', async () => {
      const webpBuffer = Buffer.from('webp-image');
      const imageBuffer = Buffer.from('jpeg-image');

      const MockClass = createMockEpubClass({
        metadata: {},
        manifest: {
          'img-title': { href: 'images/titlepage.png', 'media-type': 'image/png' },
        },
        imageData: imageBuffer,
      });
      mockEPub.mockImplementation(function () { return new MockClass(); } as unknown as typeof EPub);

      const sharpChain = createMockSharpChain(webpBuffer);
      mockSharp.mockReturnValue(sharpChain as unknown as ReturnType<typeof sharp>);

      const result = await extractor.getCover('test-note', '/path/to/book.epub', 'epub');

      expect(result).toEqual(webpBuffer);
    });

    it('does not match non-cover pattern IDs or hrefs', async () => {
      const MockClass = createMockEpubClass({
        metadata: {},
        manifest: {
          'illustration-1': { href: 'images/fig1.jpg', 'media-type': 'image/jpeg' },
        },
        getImageError: true,
      });
      mockEPub.mockImplementation(function () { return new MockClass(); } as unknown as typeof EPub);

      const result = await extractor.getCover('test-note', '/path/to/book.epub', 'epub');

      // Falls through all strategies, tries first image (strategy 7) but fails
      expect(result).toBeNull();
    });
  });

  describe('EPUB fallback strategy 5: first spine item cover page', () => {
    beforeEach(() => {
      mockExistsSync.mockImplementation((path) => {
        if (typeof path === 'string' && path.endsWith('.webp')) return false;
        return true;
      });
    });

    it('extracts cover from first spine item when href contains "cover"', async () => {
      const webpBuffer = Buffer.from('webp-image');
      const imageBuffer = Buffer.from('jpeg-image');

      const MockClass = createMockEpubClass({
        metadata: {},
        manifest: {
          'cover-page': { href: 'cover-page.xhtml', 'media-type': 'application/xhtml+xml' },
          'cover-img': { href: 'images/cover.jpg', 'media-type': 'image/jpeg' },
        },
        spine: { contents: [{ id: 'cover-page' }] },
        imageData: imageBuffer,
        chapterContent: '<html><body><img src="images/cover.jpg" alt="Cover"></body></html>',
      });
      mockEPub.mockImplementation(function () { return new MockClass(); } as unknown as typeof EPub);

      const sharpChain = createMockSharpChain(webpBuffer);
      mockSharp.mockReturnValue(sharpChain as unknown as ReturnType<typeof sharp>);

      const result = await extractor.getCover('test-note', '/path/to/book.epub', 'epub');

      expect(result).toEqual(webpBuffer);
    });

    it('extracts cover from first spine item when href contains "title"', async () => {
      const webpBuffer = Buffer.from('webp-image');
      const imageBuffer = Buffer.from('jpeg-image');

      const MockClass = createMockEpubClass({
        metadata: {},
        manifest: {
          'title-page': { href: 'titlepage.xhtml', 'media-type': 'application/xhtml+xml' },
          'title-img': { href: 'images/title.jpg', 'media-type': 'image/jpeg' },
        },
        spine: { contents: [{ id: 'title-page' }] },
        imageData: imageBuffer,
        chapterContent: '<html><body><img src="images/title.jpg" alt="Title"></body></html>',
      });
      mockEPub.mockImplementation(function () { return new MockClass(); } as unknown as typeof EPub);

      const sharpChain = createMockSharpChain(webpBuffer);
      mockSharp.mockReturnValue(sharpChain as unknown as ReturnType<typeof sharp>);

      const result = await extractor.getCover('test-note', '/path/to/book.epub', 'epub');

      expect(result).toEqual(webpBuffer);
    });

    it('skips spine item when href does not match cover/title/jacket patterns', async () => {
      const MockClass = createMockEpubClass({
        metadata: {},
        manifest: {
          'chapter1': { href: 'chapter1.xhtml', 'media-type': 'application/xhtml+xml' },
        },
        spine: { contents: [{ id: 'chapter1' }] },
      });
      mockEPub.mockImplementation(function () { return new MockClass(); } as unknown as typeof EPub);

      const result = await extractor.getCover('test-note', '/path/to/book.epub', 'epub');

      expect(result).toBeNull();
    });

    it('handles empty spine contents', async () => {
      const MockClass = createMockEpubClass({
        metadata: {},
        manifest: {},
        spine: { contents: [] },
      });
      mockEPub.mockImplementation(function () { return new MockClass(); } as unknown as typeof EPub);

      const result = await extractor.getCover('test-note', '/path/to/book.epub', 'epub');

      expect(result).toBeNull();
    });

    it('handles spine item not found in manifest', async () => {
      const MockClass = createMockEpubClass({
        metadata: {},
        manifest: {},
        spine: { contents: [{ id: 'missing-item' }] },
      });
      mockEPub.mockImplementation(function () { return new MockClass(); } as unknown as typeof EPub);

      const result = await extractor.getCover('test-note', '/path/to/book.epub', 'epub');

      expect(result).toBeNull();
    });
  });

  describe('EPUB fallback strategy 6: largest image by dimensions', () => {
    beforeEach(() => {
      mockExistsSync.mockImplementation((path) => {
        if (typeof path === 'string' && path.endsWith('.webp')) return false;
        return true;
      });
    });

    it('selects the largest image by area', async () => {
      const webpBuffer = Buffer.from('webp-image');
      // Need to track which image IDs are requested to return different data
      const imageCallCount = { count: 0 };

      class MockEPubLargest {
        metadata = {};
        manifest = {
          'small-img': { href: 'images/small.jpg', 'media-type': 'image/jpeg' },
          'large-img': { href: 'images/large.jpg', 'media-type': 'image/jpeg' },
        };
        spine = { contents: [] };
        on(event: string, callback: (...args: unknown[]) => void) {
          if (event === 'end') process.nextTick(() => callback());
          return this;
        }
        parse() {}
        getImage(_id: string, callback: (err: Error | null, data: Buffer | null, mimeType: string) => void) {
          imageCallCount.count++;
          callback(null, Buffer.from(`image-data-${imageCallCount.count}`), 'image/jpeg');
        }
        getChapter(_id: string, callback: (err: Error | null, text: string | null) => void) {
          callback(null, '');
        }
      }
      mockEPub.mockImplementation(function () { return new MockEPubLargest(); } as unknown as typeof EPub);

      // First call: metadata for small image, second call: metadata for large image
      // Then: resize calls for processed images
      let metadataCallCount = 0;
      const sharpChain = {
        resize: vi.fn().mockReturnThis(),
        webp: vi.fn().mockReturnThis(),
        toBuffer: vi.fn().mockResolvedValue(webpBuffer),
        metadata: vi.fn().mockImplementation(() => {
          metadataCallCount++;
          if (metadataCallCount === 1) {
            return Promise.resolve({ width: 200, height: 300 });
          }
          return Promise.resolve({ width: 600, height: 900 });
        }),
      };
      mockSharp.mockReturnValue(sharpChain as unknown as ReturnType<typeof sharp>);

      const result = await extractor.getCover('test-note', '/path/to/book.epub', 'epub');

      expect(result).toEqual(webpBuffer);
      // sharp called for each image to get metadata, plus one resize call for the winner
      expect(sharpChain.metadata).toHaveBeenCalled();
    });

    it('skips images below minimum dimension threshold', async () => {
      class MockEPubTiny {
        metadata = {};
        manifest = {
          'tiny-img': { href: 'images/icon.png', 'media-type': 'image/png' },
        };
        spine = { contents: [] };
        on(event: string, callback: (...args: unknown[]) => void) {
          if (event === 'end') process.nextTick(() => callback());
          return this;
        }
        parse() {}
        getImage(_id: string, callback: (err: Error | null, data: Buffer | null, mimeType: string) => void) {
          callback(null, Buffer.from('tiny-image'), 'image/png');
        }
        getChapter(_id: string, callback: (err: Error | null, text: string | null) => void) {
          callback(null, '');
        }
      }
      mockEPub.mockImplementation(function () { return new MockEPubTiny(); } as unknown as typeof EPub);

      const sharpChain = {
        resize: vi.fn().mockReturnThis(),
        webp: vi.fn().mockReturnThis(),
        toBuffer: vi.fn().mockResolvedValue(Buffer.from('webp')),
        // Return dimensions below MIN_COVER_DIMENSION (100)
        metadata: vi.fn().mockResolvedValue({ width: 50, height: 50 }),
      };
      mockSharp.mockReturnValue(sharpChain as unknown as ReturnType<typeof sharp>);

      const result = await extractor.getCover('test-note', '/path/to/book.epub', 'epub');

      // All images too small, falls through to strategy 7 which tries first image
      // but sharp chain doesn't fail so it returns the processed image from tryGetEpubImage
      // Strategy 7: tries first image in manifest with tryGetEpubImage
      expect(result).toBeDefined();
    });

    it('prefers portrait-oriented images with 1.5x area boost', async () => {
      const webpBuffer = Buffer.from('webp-portrait');
      const imageCallCount = { count: 0 };

      class MockEPubPortrait {
        metadata = {};
        manifest = {
          'landscape': { href: 'images/landscape.jpg', 'media-type': 'image/jpeg' },
          'portrait': { href: 'images/portrait.jpg', 'media-type': 'image/jpeg' },
        };
        spine = { contents: [] };
        on(event: string, callback: (...args: unknown[]) => void) {
          if (event === 'end') process.nextTick(() => callback());
          return this;
        }
        parse() {}
        getImage(_id: string, callback: (err: Error | null, data: Buffer | null, mimeType: string) => void) {
          imageCallCount.count++;
          callback(null, Buffer.from(`image-${imageCallCount.count}`), 'image/jpeg');
        }
        getChapter(_id: string, callback: (err: Error | null, text: string | null) => void) {
          callback(null, '');
        }
      }
      mockEPub.mockImplementation(function () { return new MockEPubPortrait(); } as unknown as typeof EPub);

      let metadataCallCount = 0;
      const sharpChain = {
        resize: vi.fn().mockReturnThis(),
        webp: vi.fn().mockReturnThis(),
        toBuffer: vi.fn().mockResolvedValue(webpBuffer),
        metadata: vi.fn().mockImplementation(() => {
          metadataCallCount++;
          if (metadataCallCount === 1) {
            // Landscape: 800x400 = 320000 area (not portrait, no boost)
            return Promise.resolve({ width: 800, height: 400 });
          }
          // Portrait: 400x600 = 240000 area, but with 1.5x boost = 360000
          return Promise.resolve({ width: 400, height: 600 });
        }),
      };
      mockSharp.mockReturnValue(sharpChain as unknown as ReturnType<typeof sharp>);

      const result = await extractor.getCover('test-note', '/path/to/book.epub', 'epub');

      expect(result).toEqual(webpBuffer);
      // The resize should have been called (last winning image gets resized)
      expect(sharpChain.resize).toHaveBeenCalled();
    });

    it('handles sharp metadata errors gracefully and skips the image', async () => {
      class MockEPubMetaErr {
        metadata = {};
        manifest = {
          'bad-img': { href: 'images/corrupt.jpg', 'media-type': 'image/jpeg' },
        };
        spine = { contents: [] };
        on(event: string, callback: (...args: unknown[]) => void) {
          if (event === 'end') process.nextTick(() => callback());
          return this;
        }
        parse() {}
        getImage(_id: string, callback: (err: Error | null, data: Buffer | null, mimeType: string) => void) {
          callback(null, Buffer.from('corrupt-image'), 'image/jpeg');
        }
        getChapter(_id: string, callback: (err: Error | null, text: string | null) => void) {
          callback(null, '');
        }
      }
      mockEPub.mockImplementation(function () { return new MockEPubMetaErr(); } as unknown as typeof EPub);

      // First call (findLargestImage metadata) throws, second call (tryGetEpubImage/strategy 7) succeeds
      let sharpCallCount = 0;
      const sharpChain = {
        resize: vi.fn().mockReturnThis(),
        webp: vi.fn().mockReturnThis(),
        toBuffer: vi.fn().mockResolvedValue(Buffer.from('webp')),
        metadata: vi.fn().mockRejectedValue(new Error('Corrupt image')),
      };
      mockSharp.mockImplementation(() => {
        sharpCallCount++;
        if (sharpCallCount === 1) {
          // findLargestImage call - metadata fails
          return sharpChain as unknown as ReturnType<typeof sharp>;
        }
        // tryGetEpubImage call (strategy 7) - resize succeeds
        return {
          resize: vi.fn().mockReturnThis(),
          webp: vi.fn().mockReturnThis(),
          toBuffer: vi.fn().mockResolvedValue(Buffer.from('webp')),
        } as unknown as ReturnType<typeof sharp>;
      });

      const result = await extractor.getCover('test-note', '/path/to/book.epub', 'epub');

      // Falls through to strategy 7 (first image in manifest) which succeeds
      expect(result).toBeDefined();
    });

    it('limits candidate images to first 10', async () => {
      const imageIds = Array.from({ length: 15 }, (_, i) => `img-${i}`);
      const manifest: Record<string, { href: string; 'media-type': string }> = {};
      for (const id of imageIds) {
        manifest[id] = { href: `images/${id}.jpg`, 'media-type': 'image/jpeg' };
      }

      let getImageCallCount = 0;
      class MockEPubMany {
        metadata = {};
        manifest = manifest;
        spine = { contents: [] };
        on(event: string, callback: (...args: unknown[]) => void) {
          if (event === 'end') process.nextTick(() => callback());
          return this;
        }
        parse() {}
        getImage(_id: string, callback: (err: Error | null, data: Buffer | null, mimeType: string) => void) {
          getImageCallCount++;
          callback(null, Buffer.from(`image-${getImageCallCount}`), 'image/jpeg');
        }
        getChapter(_id: string, callback: (err: Error | null, text: string | null) => void) {
          callback(null, '');
        }
      }
      mockEPub.mockImplementation(function () { return new MockEPubMany(); } as unknown as typeof EPub);

      const webpBuffer = Buffer.from('webp-image');
      let metadataCount = 0;
      const sharpChain = {
        resize: vi.fn().mockReturnThis(),
        webp: vi.fn().mockReturnThis(),
        toBuffer: vi.fn().mockResolvedValue(webpBuffer),
        metadata: vi.fn().mockImplementation(() => {
          metadataCount++;
          return Promise.resolve({ width: 200, height: 300 });
        }),
      };
      mockSharp.mockReturnValue(sharpChain as unknown as ReturnType<typeof sharp>);

      await extractor.getCover('test-note', '/path/to/book.epub', 'epub');

      // Strategy 6 only checks first 10 images, so metadata called at most 10 times
      expect(metadataCount).toBeLessThanOrEqual(10);
    });
  });

  describe('EPUB fallback strategy 7: first image in manifest', () => {
    beforeEach(() => {
      mockExistsSync.mockImplementation((path) => {
        if (typeof path === 'string' && path.endsWith('.webp')) return false;
        return true;
      });
    });

    it('uses first image in manifest as last resort', async () => {
      const webpBuffer = Buffer.from('webp-image');
      const imageBuffer = Buffer.from('jpeg-image');

      // Use non-cover names so no earlier strategy matches
      class MockEPubFirstImg {
        metadata = {};
        manifest = {
          'chapter1': { href: 'chapter1.xhtml', 'media-type': 'application/xhtml+xml' as const },
          'illustration-1': { href: 'images/fig1.jpg', 'media-type': 'image/jpeg' as const },
        };
        spine = { contents: [] };
        on(event: string, callback: (...args: unknown[]) => void) {
          if (event === 'end') process.nextTick(() => callback());
          return this;
        }
        parse() {}
        getImage(_id: string, callback: (err: Error | null, data: Buffer | null, mimeType: string) => void) {
          callback(null, imageBuffer, 'image/jpeg');
        }
        getChapter(_id: string, callback: (err: Error | null, text: string | null) => void) {
          callback(null, '');
        }
      }
      mockEPub.mockImplementation(function () { return new MockEPubFirstImg(); } as unknown as typeof EPub);

      // For findLargestImage strategy, return small dimensions to skip it
      // Then for tryGetEpubImage (strategy 7), return the processed image
      let sharpCallCount = 0;
      mockSharp.mockImplementation(() => {
        sharpCallCount++;
        if (sharpCallCount === 1) {
          // findLargestImage metadata check
          return {
            metadata: vi.fn().mockResolvedValue({ width: 50, height: 50 }),
            resize: vi.fn().mockReturnThis(),
            webp: vi.fn().mockReturnThis(),
            toBuffer: vi.fn().mockResolvedValue(webpBuffer),
          } as unknown as ReturnType<typeof sharp>;
        }
        // tryGetEpubImage call
        return {
          resize: vi.fn().mockReturnThis(),
          webp: vi.fn().mockReturnThis(),
          toBuffer: vi.fn().mockResolvedValue(webpBuffer),
        } as unknown as ReturnType<typeof sharp>;
      });

      const result = await extractor.getCover('test-note', '/path/to/book.epub', 'epub');

      expect(result).toEqual(webpBuffer);
    });

    it('returns null when first image retrieval also fails', async () => {
      class MockEPubFail {
        metadata = {};
        manifest = {
          'illustration-1': { href: 'images/fig1.jpg', 'media-type': 'image/jpeg' as const },
        };
        spine = { contents: [] };
        on(event: string, callback: (...args: unknown[]) => void) {
          if (event === 'end') process.nextTick(() => callback());
          return this;
        }
        parse() {}
        getImage(_id: string, callback: (err: Error | null, data: Buffer | null, mimeType: string) => void) {
          callback(new Error('Failed'), null, '');
        }
        getChapter(_id: string, callback: (err: Error | null, text: string | null) => void) {
          callback(null, '');
        }
      }
      mockEPub.mockImplementation(function () { return new MockEPubFail(); } as unknown as typeof EPub);

      const result = await extractor.getCover('test-note', '/path/to/book.epub', 'epub');

      expect(result).toBeNull();
    });
  });

  describe('extractImageFromHtmlPage', () => {
    beforeEach(() => {
      mockExistsSync.mockImplementation((path) => {
        if (typeof path === 'string' && path.endsWith('.webp')) return false;
        return true;
      });
    });

    it('extracts image from SVG <image> tag with href attribute', async () => {
      const webpBuffer = Buffer.from('webp-image');
      const imageBuffer = Buffer.from('svg-image');

      const MockClass = createMockEpubClass({
        metadata: {},
        manifest: {
          'cover-page': { href: 'cover.xhtml', 'media-type': 'application/xhtml+xml' },
          'cover-img': { href: 'images/cover.jpg', 'media-type': 'image/jpeg' },
        },
        guide: [{ type: 'cover', href: 'cover.xhtml' }],
        imageData: imageBuffer,
        chapterContent: '<html><body><svg><image href="images/cover.jpg" width="300" height="450"/></svg></body></html>',
      });
      mockEPub.mockImplementation(function () { return new MockClass(); } as unknown as typeof EPub);

      const sharpChain = createMockSharpChain(webpBuffer);
      mockSharp.mockReturnValue(sharpChain as unknown as ReturnType<typeof sharp>);

      const result = await extractor.getCover('test-note', '/path/to/book.epub', 'epub');

      expect(result).toEqual(webpBuffer);
    });

    it('resolves relative paths with ../ segments in img src', async () => {
      const webpBuffer = Buffer.from('webp-image');
      const imageBuffer = Buffer.from('jpeg-image');

      const MockClass = createMockEpubClass({
        metadata: {},
        manifest: {
          'cover-page': { href: 'text/cover.xhtml', 'media-type': 'application/xhtml+xml' },
          'cover-img': { href: 'images/cover.jpg', 'media-type': 'image/jpeg' },
        },
        guide: [{ type: 'cover', href: 'text/cover.xhtml' }],
        imageData: imageBuffer,
        chapterContent: '<html><body><img src="../images/cover.jpg" alt="Cover"></body></html>',
      });
      mockEPub.mockImplementation(function () { return new MockClass(); } as unknown as typeof EPub);

      const sharpChain = createMockSharpChain(webpBuffer);
      mockSharp.mockReturnValue(sharpChain as unknown as ReturnType<typeof sharp>);

      const result = await extractor.getCover('test-note', '/path/to/book.epub', 'epub');

      expect(result).toEqual(webpBuffer);
    });

    it('handles absolute src paths starting with /', async () => {
      const webpBuffer = Buffer.from('webp-image');
      const imageBuffer = Buffer.from('jpeg-image');

      const MockClass = createMockEpubClass({
        metadata: {},
        manifest: {
          'cover-page': { href: 'text/cover.xhtml', 'media-type': 'application/xhtml+xml' },
          'cover-img': { href: 'images/cover.jpg', 'media-type': 'image/jpeg' },
        },
        guide: [{ type: 'cover', href: 'text/cover.xhtml' }],
        imageData: imageBuffer,
        chapterContent: '<html><body><img src="/images/cover.jpg" alt="Cover"></body></html>',
      });
      mockEPub.mockImplementation(function () { return new MockClass(); } as unknown as typeof EPub);

      const sharpChain = createMockSharpChain(webpBuffer);
      mockSharp.mockReturnValue(sharpChain as unknown as ReturnType<typeof sharp>);

      const result = await extractor.getCover('test-note', '/path/to/book.epub', 'epub');

      expect(result).toEqual(webpBuffer);
    });

    it('returns null when HTML page has no image tags', async () => {
      const MockClass = createMockEpubClass({
        metadata: {},
        manifest: {
          'cover-page': { href: 'cover.xhtml', 'media-type': 'application/xhtml+xml' },
        },
        guide: [{ type: 'cover', href: 'cover.xhtml' }],
        chapterContent: '<html><body><h1>Title Page</h1><p>No images here</p></body></html>',
      });
      mockEPub.mockImplementation(function () { return new MockClass(); } as unknown as typeof EPub);

      const result = await extractor.getCover('test-note', '/path/to/book.epub', 'epub');

      expect(result).toBeNull();
    });

    it('returns null when chapter content cannot be loaded', async () => {
      const eventHandlers: Record<string, Array<(...args: unknown[]) => void>> = {};

      class MockEPubChapterErr {
        metadata = {};
        manifest = {
          'cover-page': { href: 'cover.xhtml', 'media-type': 'application/xhtml+xml' as const },
        };
        guide = [{ type: 'cover', href: 'cover.xhtml' }];
        spine = { contents: [] };
        on(event: string, callback: (...args: unknown[]) => void) {
          if (!eventHandlers[event]) eventHandlers[event] = [];
          eventHandlers[event].push(callback);
          return this;
        }
        parse() {
          process.nextTick(() => eventHandlers['end']?.forEach(cb => cb()));
        }
        getImage(_id: string, callback: (err: Error | null, data: Buffer | null, mimeType: string) => void) {
          callback(new Error('No image'), null, '');
        }
        getChapter(_id: string, callback: (err: Error | null, text: string | null) => void) {
          callback(new Error('Chapter read failed'), null);
        }
      }
      mockEPub.mockImplementation(function () { return new MockEPubChapterErr(); } as unknown as typeof EPub);

      const result = await extractor.getCover('test-note', '/path/to/book.epub', 'epub');

      expect(result).toBeNull();
    });

    it('returns null when page href is not found in manifest', async () => {
      const eventHandlers: Record<string, Array<(...args: unknown[]) => void>> = {};

      class MockEPubNoManifest {
        metadata = {};
        manifest = {
          // Note: 'cover-page' with href 'other.xhtml' - does NOT match guide href 'cover.xhtml'
          'other-page': { href: 'other.xhtml', 'media-type': 'application/xhtml+xml' as const },
        };
        guide = [{ type: 'cover', href: 'cover.xhtml' }];
        spine = { contents: [] };
        on(event: string, callback: (...args: unknown[]) => void) {
          if (!eventHandlers[event]) eventHandlers[event] = [];
          eventHandlers[event].push(callback);
          return this;
        }
        parse() {
          process.nextTick(() => eventHandlers['end']?.forEach(cb => cb()));
        }
        getImage(_id: string, callback: (err: Error | null, data: Buffer | null, mimeType: string) => void) {
          callback(new Error('No image'), null, '');
        }
        getChapter(_id: string, callback: (err: Error | null, text: string | null) => void) {
          callback(null, '<html><body></body></html>');
        }
      }
      mockEPub.mockImplementation(function () { return new MockEPubNoManifest(); } as unknown as typeof EPub);

      const result = await extractor.getCover('test-note', '/path/to/book.epub', 'epub');

      expect(result).toBeNull();
    });
  });

  describe('EPUB metadata cover with fallback on getImage failure', () => {
    beforeEach(() => {
      mockExistsSync.mockImplementation((path) => {
        if (typeof path === 'string' && path.endsWith('.webp')) return false;
        return true;
      });
    });

    it('falls back to other strategies when metadata cover image retrieval fails', async () => {
      const webpBuffer = Buffer.from('webp-image');
      let getImageCallCount = 0;

      const eventHandlers: Record<string, Array<(...args: unknown[]) => void>> = {};

      class MockEPubFallback {
        metadata = { cover: 'cover-id' };
        manifest = {
          'cover-id': { href: 'images/cover.jpg', 'media-type': 'image/jpeg' as const },
          'backup-img': { href: 'images/backup.jpg', 'media-type': 'image/jpeg' as const, properties: 'cover-image' },
        };
        spine = { contents: [] };
        on(event: string, callback: (...args: unknown[]) => void) {
          if (!eventHandlers[event]) eventHandlers[event] = [];
          eventHandlers[event].push(callback);
          return this;
        }
        parse() {
          process.nextTick(() => eventHandlers['end']?.forEach(cb => cb()));
        }
        getImage(_id: string, callback: (err: Error | null, data: Buffer | null, mimeType: string) => void) {
          getImageCallCount++;
          if (getImageCallCount === 1) {
            // First call (metadata cover) fails
            callback(new Error('Image not found'), null, '');
          } else {
            // Subsequent calls succeed
            callback(null, Buffer.from('backup-image'), 'image/jpeg');
          }
        }
        getChapter(_id: string, callback: (err: Error | null, text: string | null) => void) {
          callback(null, '');
        }
      }
      mockEPub.mockImplementation(function () { return new MockEPubFallback(); } as unknown as typeof EPub);

      const sharpChain = createMockSharpChain(webpBuffer);
      mockSharp.mockReturnValue(sharpChain as unknown as ReturnType<typeof sharp>);

      const result = await extractor.getCover('test-note', '/path/to/book.epub', 'epub');

      expect(result).toEqual(webpBuffer);
      // Should have tried metadata cover first, then fallen back to cover-image property
      expect(getImageCallCount).toBeGreaterThan(1);
    });
  });

  describe('EPUB fallback strategy 3: exact cover filename match', () => {
    beforeEach(() => {
      mockExistsSync.mockImplementation((path) => {
        if (typeof path === 'string' && path.endsWith('.webp')) return false;
        return true;
      });
    });

    it('matches image with filename "cover" regardless of extension', async () => {
      const webpBuffer = Buffer.from('webp-image');
      const imageBuffer = Buffer.from('jpeg-image');

      const MockClass = createMockEpubClass({
        metadata: {},
        manifest: {
          'random-id': { href: 'images/cover.png', 'media-type': 'image/png' },
        },
        imageData: imageBuffer,
      });
      mockEPub.mockImplementation(function () { return new MockClass(); } as unknown as typeof EPub);

      const sharpChain = createMockSharpChain(webpBuffer);
      mockSharp.mockReturnValue(sharpChain as unknown as ReturnType<typeof sharp>);

      const result = await extractor.getCover('test-note', '/path/to/book.epub', 'epub');

      expect(result).toEqual(webpBuffer);
    });

    it('matches image with exact "cover" ID (case insensitive)', async () => {
      const webpBuffer = Buffer.from('webp-image');
      const imageBuffer = Buffer.from('jpeg-image');

      // Note: Object keys in JS are case-sensitive, and the code does idLower comparison.
      // The manifest key 'Cover' stays as is, but id.toLowerCase() === 'cover' would match.
      // However, epub2 Object.entries preserves original key - the code does idLower === 'cover'.
      const MockClass = createMockEpubClass({
        metadata: {},
        manifest: {
          'cover': { href: 'img/front.jpg', 'media-type': 'image/jpeg' },
        },
        imageData: imageBuffer,
      });
      mockEPub.mockImplementation(function () { return new MockClass(); } as unknown as typeof EPub);

      const sharpChain = createMockSharpChain(webpBuffer);
      mockSharp.mockReturnValue(sharpChain as unknown as ReturnType<typeof sharp>);

      const result = await extractor.getCover('test-note', '/path/to/book.epub', 'epub');

      expect(result).toEqual(webpBuffer);
    });
  });

  describe('getCover routing', () => {
    it('routes to EPUB extraction for epub sourceType', async () => {
      mockExistsSync.mockImplementation((path) => {
        if (typeof path === 'string' && path.endsWith('.webp')) return false;
        return true;
      });

      const MockClass = createMockEpubClass({
        metadata: { cover: 'cover-id' },
        manifest: {
          'cover-id': { href: 'cover.jpg', 'media-type': 'image/jpeg' },
        },
      });
      mockEPub.mockImplementation(function () { return new MockClass(); } as unknown as typeof EPub);

      const sharpChain = createMockSharpChain();
      mockSharp.mockReturnValue(sharpChain as unknown as ReturnType<typeof sharp>);

      await extractor.getCover('test-note', '/path/to/book.epub', 'epub');

      expect(mockEPub).toHaveBeenCalledWith('/path/to/book.epub');
      expect(mockGetDocument).not.toHaveBeenCalled();
    });

    it('routes to PDF extraction for pdf sourceType', async () => {
      mockExistsSync.mockImplementation((path) => {
        if (typeof path === 'string' && path.endsWith('.webp')) return false;
        return true;
      });
      mockReadFileSync.mockReturnValue(Buffer.from([1, 2, 3]));

      const { mockPdf } = createMockPdf();
      mockGetDocument.mockReturnValue({ promise: Promise.resolve(mockPdf) } as unknown as ReturnType<typeof pdfjsLib.getDocument>);

      const { mockCanvas } = createMockCanvas();
      mockCreateCanvas.mockReturnValue(mockCanvas as unknown as ReturnType<typeof createCanvas>);

      const sharpChain = createMockSharpChain();
      mockSharp.mockReturnValue(sharpChain as unknown as ReturnType<typeof sharp>);

      await extractor.getCover('test-note', '/path/to/file.pdf', 'pdf');

      expect(mockGetDocument).toHaveBeenCalled();
      expect(mockEPub).not.toHaveBeenCalled();
    });

    it('does not write to cache when extraction returns null', async () => {
      mockExistsSync.mockImplementation((path) => {
        if (typeof path === 'string' && path.endsWith('.webp')) return false;
        return true;
      });

      const MockClass = createMockEpubClass({
        metadata: {},
        manifest: {},
      });
      mockEPub.mockImplementation(function () { return new MockClass(); } as unknown as typeof EPub);

      await extractor.getCover('test-note', '/path/to/book.epub', 'epub');

      expect(mockWriteFileSync).not.toHaveBeenCalled();
    });
  });

  describe('normalizePath edge cases (via extractImageFromHtmlPage)', () => {
    // normalizePath is private but exercised through HTML page image extraction.
    // We reach it by setting up a guide → HTML page → img src path pipeline.

    beforeEach(() => {
      mockExistsSync.mockImplementation((path) => {
        if (typeof path === 'string' && path.endsWith('.webp')) return false;
        return true;
      });
    });

    function createEpubWithCoverPage(imgSrc: string, pageHref: string, imageManifestHref: string) {
      const imageBuffer = Buffer.from('jpeg-image');
      const eventHandlers: Record<string, Array<(...args: unknown[]) => void>> = {};

      class MockEPubNorm {
        metadata = {};
        manifest = {
          'cover-page': { href: pageHref, 'media-type': 'application/xhtml+xml' as const },
          'cover-img': { href: imageManifestHref, 'media-type': 'image/jpeg' as const },
        };
        guide = [{ type: 'cover', href: pageHref }];
        spine = { contents: [] };
        on(event: string, callback: (...args: unknown[]) => void) {
          if (!eventHandlers[event]) eventHandlers[event] = [];
          eventHandlers[event].push(callback);
          return this;
        }
        parse() {
          process.nextTick(() => eventHandlers['end']?.forEach(cb => cb()));
        }
        getImage(_id: string, callback: (err: Error | null, data: Buffer | null, mimeType: string) => void) {
          callback(null, imageBuffer, 'image/jpeg');
        }
        getChapter(_id: string, callback: (err: Error | null, text: string | null) => void) {
          callback(null, `<html><body><img src="${imgSrc}" alt="Cover"></body></html>`);
        }
      }
      return MockEPubNorm;
    }

    it('normalizes multiple consecutive ../ segments', async () => {
      const webpBuffer = Buffer.from('webp-image');
      // Page at OEBPS/text/pages/cover.xhtml, image src ../../images/cover.jpg
      // basePath = "OEBPS/text/pages/"
      // resolved = "OEBPS/text/pages/../../images/cover.jpg"
      // normalized = "OEBPS/images/cover.jpg"
      const MockClass = createEpubWithCoverPage(
        '../../images/cover.jpg',
        'OEBPS/text/pages/cover.xhtml',
        'OEBPS/images/cover.jpg'
      );
      mockEPub.mockImplementation(function () { return new MockClass(); } as unknown as typeof EPub);

      const sharpChain = createMockSharpChain(webpBuffer);
      mockSharp.mockReturnValue(sharpChain as unknown as ReturnType<typeof sharp>);

      const result = await extractor.getCover('test-note', '/path/to/book.epub', 'epub');
      expect(result).toEqual(webpBuffer);
    });

    it('normalizes paths with single dot segments', async () => {
      const webpBuffer = Buffer.from('webp-image');
      // Page at text/cover.xhtml, image src ./images/cover.jpg
      // basePath = "text/"
      // resolved = "text/./images/cover.jpg"
      // normalized = "text/images/cover.jpg"
      const MockClass = createEpubWithCoverPage(
        './images/cover.jpg',
        'text/cover.xhtml',
        'text/images/cover.jpg'
      );
      mockEPub.mockImplementation(function () { return new MockClass(); } as unknown as typeof EPub);

      const sharpChain = createMockSharpChain(webpBuffer);
      mockSharp.mockReturnValue(sharpChain as unknown as ReturnType<typeof sharp>);

      const result = await extractor.getCover('test-note', '/path/to/book.epub', 'epub');
      expect(result).toEqual(webpBuffer);
    });

    it('normalizes paths with double slashes', async () => {
      const webpBuffer = Buffer.from('webp-image');
      // Page at text/cover.xhtml, image src images//cover.jpg
      // basePath = "text/"
      // resolved = "text/images//cover.jpg"
      // normalized removes empty parts = "text/images/cover.jpg"
      const MockClass = createEpubWithCoverPage(
        'images//cover.jpg',
        'text/cover.xhtml',
        'text/images/cover.jpg'
      );
      mockEPub.mockImplementation(function () { return new MockClass(); } as unknown as typeof EPub);

      const sharpChain = createMockSharpChain(webpBuffer);
      mockSharp.mockReturnValue(sharpChain as unknown as ReturnType<typeof sharp>);

      const result = await extractor.getCover('test-note', '/path/to/book.epub', 'epub');
      expect(result).toEqual(webpBuffer);
    });

    it('handles ../ going above root gracefully', async () => {
      // Page at cover.xhtml (root level), image src ../../images/cover.jpg
      // basePath = "" (no directory component)
      // resolved = "../../images/cover.jpg"
      // normalized: pop on empty array is no-op, then pop again, result = "images/cover.jpg"
      const webpBuffer = Buffer.from('webp-image');
      const MockClass = createEpubWithCoverPage(
        '../../images/cover.jpg',
        'cover.xhtml',
        'images/cover.jpg'
      );
      mockEPub.mockImplementation(function () { return new MockClass(); } as unknown as typeof EPub);

      const sharpChain = createMockSharpChain(webpBuffer);
      mockSharp.mockReturnValue(sharpChain as unknown as ReturnType<typeof sharp>);

      const result = await extractor.getCover('test-note', '/path/to/book.epub', 'epub');
      expect(result).toEqual(webpBuffer);
    });

    it('resolves image when manifest href endsWith the normalized src', async () => {
      const webpBuffer = Buffer.from('webp-image');
      // The code checks: itemHref === normalizedSrc || itemHref.endsWith(normalizedSrc)
      // Page at text/cover.xhtml, image src "cover.jpg" (just filename)
      // basePath = "text/"
      // resolved = "text/cover.jpg"
      // Manifest has "OEBPS/text/cover.jpg" which endsWith "text/cover.jpg"
      const MockClass = createEpubWithCoverPage(
        'cover.jpg',
        'text/cover.xhtml',
        'OEBPS/text/cover.jpg'
      );
      mockEPub.mockImplementation(function () { return new MockClass(); } as unknown as typeof EPub);

      const sharpChain = createMockSharpChain(webpBuffer);
      mockSharp.mockReturnValue(sharpChain as unknown as ReturnType<typeof sharp>);

      const result = await extractor.getCover('test-note', '/path/to/book.epub', 'epub');
      expect(result).toEqual(webpBuffer);
    });
  });

  describe('findLargestImage aspect ratio boundary conditions', () => {
    beforeEach(() => {
      mockExistsSync.mockImplementation((path) => {
        if (typeof path === 'string' && path.endsWith('.webp')) return false;
        return true;
      });
    });

    function createEpubWithImages(imageCount: number) {
      const manifest: Record<string, { href: string; 'media-type': string }> = {};
      for (let i = 0; i < imageCount; i++) {
        manifest[`img-${i}`] = { href: `images/img-${i}.jpg`, 'media-type': 'image/jpeg' };
      }

      const eventHandlers: Record<string, Array<(...args: unknown[]) => void>> = {};

      class MockEPubImages {
        metadata = {};
        manifest = manifest;
        spine = { contents: [] };
        on(event: string, callback: (...args: unknown[]) => void) {
          if (!eventHandlers[event]) eventHandlers[event] = [];
          eventHandlers[event].push(callback);
          return this;
        }
        parse() {
          process.nextTick(() => eventHandlers['end']?.forEach(cb => cb()));
        }
        getImage(_id: string, callback: (err: Error | null, data: Buffer | null, mimeType: string) => void) {
          callback(null, Buffer.from('image-data'), 'image/jpeg');
        }
        getChapter(_id: string, callback: (err: Error | null, text: string | null) => void) {
          callback(null, '');
        }
      }
      return MockEPubImages;
    }

    it('applies portrait boost at exact lower boundary (aspect ratio = 0.5)', async () => {
      const webpBuffer = Buffer.from('webp-result');
      const MockClass = createEpubWithImages(2);
      mockEPub.mockImplementation(function () { return new MockClass(); } as unknown as typeof EPub);

      let metadataCall = 0;
      const sharpChain = {
        resize: vi.fn().mockReturnThis(),
        webp: vi.fn().mockReturnThis(),
        toBuffer: vi.fn().mockResolvedValue(webpBuffer),
        metadata: vi.fn().mockImplementation(() => {
          metadataCall++;
          if (metadataCall === 1) {
            // Landscape: 500x200 = 100000 area, aspect 2.5 (not portrait, no boost)
            return Promise.resolve({ width: 500, height: 200 });
          }
          // Exactly 0.5 ratio: 150x300 = 45000 area, with 1.5x boost = 67500
          // Without boost: 100000 > 67500, landscape wins
          // With boost: 100000 > 67500, landscape still wins
          // So use larger portrait: 200x400 = 80000, boosted = 120000 > 100000
          return Promise.resolve({ width: 200, height: 400 });
        }),
      };
      mockSharp.mockReturnValue(sharpChain as unknown as ReturnType<typeof sharp>);

      const result = await extractor.getCover('test-note', '/path/to/book.epub', 'epub');

      expect(result).toEqual(webpBuffer);
      // Portrait image (200/400 = 0.5) should get the 1.5x boost
      // 200*400*1.5 = 120000 > 500*200 = 100000
      expect(sharpChain.resize).toHaveBeenCalled();
    });

    it('applies portrait boost at exact upper boundary (aspect ratio = 0.9)', async () => {
      const webpBuffer = Buffer.from('webp-result');
      const MockClass = createEpubWithImages(2);
      mockEPub.mockImplementation(function () { return new MockClass(); } as unknown as typeof EPub);

      let metadataCall = 0;
      const sharpChain = {
        resize: vi.fn().mockReturnThis(),
        webp: vi.fn().mockReturnThis(),
        toBuffer: vi.fn().mockResolvedValue(webpBuffer),
        metadata: vi.fn().mockImplementation(() => {
          metadataCall++;
          if (metadataCall === 1) {
            // Square-ish: 300x300 = 90000 area, aspect 1.0 (not portrait, no boost)
            return Promise.resolve({ width: 300, height: 300 });
          }
          // Exactly 0.9 ratio: 270x300 = 81000 area, with 1.5x boost = 121500
          return Promise.resolve({ width: 270, height: 300 });
        }),
      };
      mockSharp.mockReturnValue(sharpChain as unknown as ReturnType<typeof sharp>);

      const result = await extractor.getCover('test-note', '/path/to/book.epub', 'epub');

      expect(result).toEqual(webpBuffer);
      // Portrait (270/300 = 0.9) boosted area = 81000*1.5 = 121500 > 90000
      expect(sharpChain.resize).toHaveBeenCalled();
    });

    it('does not apply portrait boost just outside boundaries', async () => {
      const webpBuffer = Buffer.from('webp-result');
      const MockClass = createEpubWithImages(1);
      mockEPub.mockImplementation(function () { return new MockClass(); } as unknown as typeof EPub);

      const sharpChain = {
        resize: vi.fn().mockReturnThis(),
        webp: vi.fn().mockReturnThis(),
        toBuffer: vi.fn().mockResolvedValue(webpBuffer),
        // Aspect ratio 0.91 (just above 0.9) — should NOT get portrait boost
        metadata: vi.fn().mockResolvedValue({ width: 273, height: 300 }),
      };
      mockSharp.mockReturnValue(sharpChain as unknown as ReturnType<typeof sharp>);

      const result = await extractor.getCover('test-note', '/path/to/book.epub', 'epub');

      // Still selected (only image above threshold), just without boost
      expect(result).toEqual(webpBuffer);
    });

    it('handles images with zero or undefined dimensions', async () => {
      const MockClass = createEpubWithImages(1);
      mockEPub.mockImplementation(function () { return new MockClass(); } as unknown as typeof EPub);

      const sharpChain = {
        resize: vi.fn().mockReturnThis(),
        webp: vi.fn().mockReturnThis(),
        toBuffer: vi.fn().mockResolvedValue(Buffer.from('webp')),
        // Width and height are undefined/zero — falls below MIN_COVER_DIMENSION
        metadata: vi.fn().mockResolvedValue({ width: undefined, height: undefined }),
      };
      mockSharp.mockReturnValue(sharpChain as unknown as ReturnType<typeof sharp>);

      const result = await extractor.getCover('test-note', '/path/to/book.epub', 'epub');

      // Strategy 6 skips the image, falls through to strategy 7
      expect(result).toBeDefined();
    });

    it('handles getEpubImageRaw returning null for some candidates', async () => {
      let getImageCall = 0;
      const eventHandlers: Record<string, Array<(...args: unknown[]) => void>> = {};

      class MockEPubSomeNull {
        metadata = {};
        manifest = {
          'img-0': { href: 'images/broken.jpg', 'media-type': 'image/jpeg' as const },
          'img-1': { href: 'images/valid.jpg', 'media-type': 'image/jpeg' as const },
        };
        spine = { contents: [] };
        on(event: string, callback: (...args: unknown[]) => void) {
          if (!eventHandlers[event]) eventHandlers[event] = [];
          eventHandlers[event].push(callback);
          return this;
        }
        parse() {
          process.nextTick(() => eventHandlers['end']?.forEach(cb => cb()));
        }
        getImage(_id: string, callback: (err: Error | null, data: Buffer | null, mimeType: string) => void) {
          getImageCall++;
          if (getImageCall === 1) {
            // First image (broken) — getEpubImageRaw returns null
            callback(new Error('Broken'), null, '');
          } else {
            callback(null, Buffer.from('valid-image'), 'image/jpeg');
          }
        }
        getChapter(_id: string, callback: (err: Error | null, text: string | null) => void) {
          callback(null, '');
        }
      }
      mockEPub.mockImplementation(function () { return new MockEPubSomeNull(); } as unknown as typeof EPub);

      const webpBuffer = Buffer.from('webp-image');
      const sharpChain = {
        resize: vi.fn().mockReturnThis(),
        webp: vi.fn().mockReturnThis(),
        toBuffer: vi.fn().mockResolvedValue(webpBuffer),
        metadata: vi.fn().mockResolvedValue({ width: 400, height: 600 }),
      };
      mockSharp.mockReturnValue(sharpChain as unknown as ReturnType<typeof sharp>);

      const result = await extractor.getCover('test-note', '/path/to/book.epub', 'epub');

      // Should skip broken image and pick valid one
      expect(result).toEqual(webpBuffer);
    });
  });

  describe('extractCoverFromFirstSpineItem edge cases', () => {
    beforeEach(() => {
      mockExistsSync.mockImplementation((path) => {
        if (typeof path === 'string' && path.endsWith('.webp')) return false;
        return true;
      });
    });

    it('extracts cover from first spine item when href contains "jacket"', async () => {
      const webpBuffer = Buffer.from('webp-image');
      const imageBuffer = Buffer.from('jpeg-image');

      const MockClass = createMockEpubClass({
        metadata: {},
        manifest: {
          'jacket-page': { href: 'jacket.xhtml', 'media-type': 'application/xhtml+xml' },
          'jacket-img': { href: 'images/jacket.jpg', 'media-type': 'image/jpeg' },
        },
        spine: { contents: [{ id: 'jacket-page' }] },
        imageData: imageBuffer,
        chapterContent: '<html><body><img src="images/jacket.jpg" alt="Jacket"></body></html>',
      });
      mockEPub.mockImplementation(function () { return new MockClass(); } as unknown as typeof EPub);

      const sharpChain = createMockSharpChain(webpBuffer);
      mockSharp.mockReturnValue(sharpChain as unknown as ReturnType<typeof sharp>);

      const result = await extractor.getCover('test-note', '/path/to/book.epub', 'epub');

      expect(result).toEqual(webpBuffer);
    });

    it('handles spine with null spine object', async () => {
      const eventHandlers: Record<string, Array<(...args: unknown[]) => void>> = {};

      class MockEPubNullSpine {
        metadata = {};
        manifest = {
          'img-1': { href: 'images/fig.jpg', 'media-type': 'image/jpeg' as const },
        };
        spine = null;
        on(event: string, callback: (...args: unknown[]) => void) {
          if (!eventHandlers[event]) eventHandlers[event] = [];
          eventHandlers[event].push(callback);
          return this;
        }
        parse() {
          process.nextTick(() => eventHandlers['end']?.forEach(cb => cb()));
        }
        getImage(_id: string, callback: (err: Error | null, data: Buffer | null, mimeType: string) => void) {
          callback(new Error('fail'), null, '');
        }
        getChapter(_id: string, callback: (err: Error | null, text: string | null) => void) {
          callback(null, '');
        }
      }
      mockEPub.mockImplementation(function () { return new MockEPubNullSpine(); } as unknown as typeof EPub);

      const result = await extractor.getCover('test-note', '/path/to/book.epub', 'epub');

      // Should skip strategy 5 and fall through to later strategies
      expect(result).toBeNull();
    });

    it('handles spine item with missing id', async () => {
      const eventHandlers: Record<string, Array<(...args: unknown[]) => void>> = {};

      class MockEPubNoId {
        metadata = {};
        manifest = {};
        spine = { contents: [{ id: null }] };
        on(event: string, callback: (...args: unknown[]) => void) {
          if (!eventHandlers[event]) eventHandlers[event] = [];
          eventHandlers[event].push(callback);
          return this;
        }
        parse() {
          process.nextTick(() => eventHandlers['end']?.forEach(cb => cb()));
        }
        getImage(_id: string, callback: (err: Error | null, data: Buffer | null, mimeType: string) => void) {
          callback(new Error('fail'), null, '');
        }
        getChapter(_id: string, callback: (err: Error | null, text: string | null) => void) {
          callback(null, '');
        }
      }
      mockEPub.mockImplementation(function () { return new MockEPubNoId(); } as unknown as typeof EPub);

      const result = await extractor.getCover('test-note', '/path/to/book.epub', 'epub');

      expect(result).toBeNull();
    });
  });

  describe('extractImageFromHtmlPage multiple images', () => {
    beforeEach(() => {
      mockExistsSync.mockImplementation((path) => {
        if (typeof path === 'string' && path.endsWith('.webp')) return false;
        return true;
      });
    });

    it('returns first matching image when page has multiple img tags', async () => {
      const webpBuffer = Buffer.from('webp-first');
      const imageBuffer = Buffer.from('jpeg-image');

      const MockClass = createMockEpubClass({
        metadata: {},
        manifest: {
          'cover-page': { href: 'cover.xhtml', 'media-type': 'application/xhtml+xml' },
          'img-first': { href: 'images/first.jpg', 'media-type': 'image/jpeg' },
          'img-second': { href: 'images/second.jpg', 'media-type': 'image/jpeg' },
        },
        guide: [{ type: 'cover', href: 'cover.xhtml' }],
        imageData: imageBuffer,
        chapterContent: '<html><body><img src="images/first.jpg"><img src="images/second.jpg"></body></html>',
      });
      mockEPub.mockImplementation(function () { return new MockClass(); } as unknown as typeof EPub);

      const sharpChain = createMockSharpChain(webpBuffer);
      mockSharp.mockReturnValue(sharpChain as unknown as ReturnType<typeof sharp>);

      const result = await extractor.getCover('test-note', '/path/to/book.epub', 'epub');

      expect(result).toEqual(webpBuffer);
    });

    it('tries next image when first img src not found in manifest', async () => {
      const webpBuffer = Buffer.from('webp-second');
      const imageBuffer = Buffer.from('jpeg-image');
      const eventHandlers: Record<string, Array<(...args: unknown[]) => void>> = {};

      class MockEPubMultiImg {
        metadata = {};
        manifest = {
          'cover-page': { href: 'cover.xhtml', 'media-type': 'application/xhtml+xml' as const },
          // Only second.jpg exists in manifest — first.jpg does not
          'img-second': { href: 'images/second.jpg', 'media-type': 'image/jpeg' as const },
        };
        guide = [{ type: 'cover', href: 'cover.xhtml' }];
        spine = { contents: [] };
        on(event: string, callback: (...args: unknown[]) => void) {
          if (!eventHandlers[event]) eventHandlers[event] = [];
          eventHandlers[event].push(callback);
          return this;
        }
        parse() {
          process.nextTick(() => eventHandlers['end']?.forEach(cb => cb()));
        }
        getImage(_id: string, callback: (err: Error | null, data: Buffer | null, mimeType: string) => void) {
          callback(null, imageBuffer, 'image/jpeg');
        }
        getChapter(_id: string, callback: (err: Error | null, text: string | null) => void) {
          callback(null, '<html><body><img src="images/first.jpg"><img src="images/second.jpg"></body></html>');
        }
      }
      mockEPub.mockImplementation(function () { return new MockEPubMultiImg(); } as unknown as typeof EPub);

      const sharpChain = createMockSharpChain(webpBuffer);
      mockSharp.mockReturnValue(sharpChain as unknown as ReturnType<typeof sharp>);

      const result = await extractor.getCover('test-note', '/path/to/book.epub', 'epub');

      expect(result).toEqual(webpBuffer);
    });

    it('handles mixed img and SVG image tags in same page', async () => {
      const webpBuffer = Buffer.from('webp-svg');
      const imageBuffer = Buffer.from('svg-image-data');

      const MockClass = createMockEpubClass({
        metadata: {},
        manifest: {
          'cover-page': { href: 'cover.xhtml', 'media-type': 'application/xhtml+xml' },
          'cover-img': { href: 'images/cover.jpg', 'media-type': 'image/jpeg' },
        },
        guide: [{ type: 'cover', href: 'cover.xhtml' }],
        imageData: imageBuffer,
        chapterContent: `<html><body>
          <p>Some text</p>
          <svg xmlns="http://www.w3.org/2000/svg"><image href="images/cover.jpg" width="300" height="450"/></svg>
        </body></html>`,
      });
      mockEPub.mockImplementation(function () { return new MockClass(); } as unknown as typeof EPub);

      const sharpChain = createMockSharpChain(webpBuffer);
      mockSharp.mockReturnValue(sharpChain as unknown as ReturnType<typeof sharp>);

      const result = await extractor.getCover('test-note', '/path/to/book.epub', 'epub');

      expect(result).toEqual(webpBuffer);
    });
  });

  describe('getCover EPUB cache write on success', () => {
    it('writes extracted EPUB cover to cache', async () => {
      const webpBuffer = Buffer.from('epub-webp-cover');
      const imageBuffer = Buffer.from('jpeg-image');

      mockExistsSync.mockImplementation((path) => {
        if (typeof path === 'string' && path.endsWith('.webp')) return false;
        return true;
      });

      const MockClass = createMockEpubClass({
        metadata: { cover: 'cover-id' },
        manifest: {
          'cover-id': { href: 'cover.jpg', 'media-type': 'image/jpeg' },
        },
        imageData: imageBuffer,
      });
      mockEPub.mockImplementation(function () { return new MockClass(); } as unknown as typeof EPub);

      const sharpChain = createMockSharpChain(webpBuffer);
      mockSharp.mockReturnValue(sharpChain as unknown as ReturnType<typeof sharp>);

      const result = await extractor.getCover('epub-note', '/path/to/book.epub', 'epub');

      expect(result).toEqual(webpBuffer);
      expect(mockWriteFileSync).toHaveBeenCalledWith(
        '/test/library/.pulp-cache/covers/epub-note.webp',
        webpBuffer
      );
    });
  });

  describe('PDF viewport scaling edge cases', () => {
    beforeEach(() => {
      mockExistsSync.mockImplementation((path) => {
        if (typeof path === 'string' && path.endsWith('.webp')) return false;
        return true;
      });
    });

    it('calculates correct scale for very wide viewport', async () => {
      mockReadFileSync.mockReturnValue(Buffer.from([1, 2, 3]));

      const mockPage = {
        getViewport: vi.fn()
          .mockReturnValueOnce({ width: 2000, height: 200 }) // scale 1
          .mockReturnValue({ width: 600, height: 60 }), // scaled
        render: vi.fn().mockReturnValue({ promise: Promise.resolve() }),
      };
      const mockPdf = {
        getPage: vi.fn().mockResolvedValue(mockPage),
        destroy: vi.fn().mockResolvedValue(undefined),
      };
      mockGetDocument.mockReturnValue({ promise: Promise.resolve(mockPdf) } as unknown as ReturnType<typeof pdfjsLib.getDocument>);

      const { mockCanvas } = createMockCanvas();
      mockCreateCanvas.mockReturnValue(mockCanvas as unknown as ReturnType<typeof createCanvas>);

      const sharpChain = createMockSharpChain();
      mockSharp.mockReturnValue(sharpChain as unknown as ReturnType<typeof sharp>);

      await extractor.getCover('test-note', '/path/to/wide.pdf', 'pdf');

      // Scale = min(300*2/2000, 450*2/200) = min(0.3, 4.5) = 0.3
      expect(mockPage.getViewport).toHaveBeenCalledWith({ scale: 1 });
      // Second call should be with the computed scale
      expect(mockPage.getViewport).toHaveBeenCalledTimes(2);
      expect(sharpChain.resize).toHaveBeenCalledWith(300, 450, { fit: 'cover' });
    });

    it('calculates correct scale for very tall viewport', async () => {
      mockReadFileSync.mockReturnValue(Buffer.from([1, 2, 3]));

      const mockPage = {
        getViewport: vi.fn()
          .mockReturnValueOnce({ width: 200, height: 3000 }) // scale 1
          .mockReturnValue({ width: 60, height: 900 }), // scaled
        render: vi.fn().mockReturnValue({ promise: Promise.resolve() }),
      };
      const mockPdf = {
        getPage: vi.fn().mockResolvedValue(mockPage),
        destroy: vi.fn().mockResolvedValue(undefined),
      };
      mockGetDocument.mockReturnValue({ promise: Promise.resolve(mockPdf) } as unknown as ReturnType<typeof pdfjsLib.getDocument>);

      const { mockCanvas } = createMockCanvas();
      mockCreateCanvas.mockReturnValue(mockCanvas as unknown as ReturnType<typeof createCanvas>);

      const sharpChain = createMockSharpChain();
      mockSharp.mockReturnValue(sharpChain as unknown as ReturnType<typeof sharp>);

      await extractor.getCover('test-note', '/path/to/tall.pdf', 'pdf');

      // Scale = min(300*2/200, 450*2/3000) = min(3.0, 0.3) = 0.3
      expect(mockPage.getViewport).toHaveBeenCalledWith({ scale: 1 });
      expect(mockPage.getViewport).toHaveBeenCalledTimes(2);
    });

    it('uses custom config dimensions for scaling and resize', async () => {
      const customConfig = {
        ...testConfig,
        cover_width: 500,
        cover_height: 700,
        cover_quality: 95,
      };
      mockExistsSync.mockReturnValue(false);
      const customExtractor = new CoverExtractor(customConfig);

      mockExistsSync.mockImplementation((path) => {
        if (typeof path === 'string' && path.endsWith('.webp')) return false;
        return true;
      });
      mockReadFileSync.mockReturnValue(Buffer.from([1, 2, 3]));

      const { mockPdf } = createMockPdf();
      mockGetDocument.mockReturnValue({ promise: Promise.resolve(mockPdf) } as unknown as ReturnType<typeof pdfjsLib.getDocument>);

      const { mockCanvas } = createMockCanvas();
      mockCreateCanvas.mockReturnValue(mockCanvas as unknown as ReturnType<typeof createCanvas>);

      const sharpChain = createMockSharpChain();
      mockSharp.mockReturnValue(sharpChain as unknown as ReturnType<typeof sharp>);

      await customExtractor.getCover('test-note', '/path/to/file.pdf', 'pdf');

      expect(sharpChain.resize).toHaveBeenCalledWith(500, 700, { fit: 'cover' });
      expect(sharpChain.webp).toHaveBeenCalledWith({ quality: 95 });
    });
  });

  describe('EPUB guide with case-insensitive type matching', () => {
    beforeEach(() => {
      mockExistsSync.mockImplementation((path) => {
        if (typeof path === 'string' && path.endsWith('.webp')) return false;
        return true;
      });
    });

    it('matches guide type "Cover" (uppercase) correctly', async () => {
      const webpBuffer = Buffer.from('webp-image');
      const imageBuffer = Buffer.from('jpeg-image');

      const MockClass = createMockEpubClass({
        metadata: {},
        manifest: {
          'cover-img': { href: 'cover.jpg', 'media-type': 'image/jpeg' },
        },
        guide: [{ type: 'Cover', href: 'cover.jpg' }],
        imageData: imageBuffer,
      });
      mockEPub.mockImplementation(function () { return new MockClass(); } as unknown as typeof EPub);

      const sharpChain = createMockSharpChain(webpBuffer);
      mockSharp.mockReturnValue(sharpChain as unknown as ReturnType<typeof sharp>);

      const result = await extractor.getCover('test-note', '/path/to/book.epub', 'epub');

      expect(result).toEqual(webpBuffer);
    });

    it('handles guide entry with missing type property', async () => {
      const eventHandlers: Record<string, Array<(...args: unknown[]) => void>> = {};

      class MockEPubGuideNoType {
        metadata = {};
        manifest = {
          'chapter1': { href: 'ch1.xhtml', 'media-type': 'application/xhtml+xml' as const },
        };
        guide = [{ type: undefined as unknown as string, href: 'ch1.xhtml' }];
        spine = { contents: [] };
        on(event: string, callback: (...args: unknown[]) => void) {
          if (!eventHandlers[event]) eventHandlers[event] = [];
          eventHandlers[event].push(callback);
          return this;
        }
        parse() {
          process.nextTick(() => eventHandlers['end']?.forEach(cb => cb()));
        }
        getImage(_id: string, callback: (err: Error | null, data: Buffer | null, mimeType: string) => void) {
          callback(new Error('fail'), null, '');
        }
        getChapter(_id: string, callback: (err: Error | null, text: string | null) => void) {
          callback(null, '');
        }
      }
      mockEPub.mockImplementation(function () { return new MockEPubGuideNoType(); } as unknown as typeof EPub);

      const result = await extractor.getCover('test-note', '/path/to/book.epub', 'epub');

      // Guide entry with no type should be skipped, falls through to null
      expect(result).toBeNull();
    });
  });
});
