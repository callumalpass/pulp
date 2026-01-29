import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { collectionsRoutes } from '../collections.js';
import type { LibraryScanner } from '../../services/library-scanner.js';
import type { LiteratureNote } from '@pulp/shared';
import { createTestConfig, createTestNote } from '../../test/test-helpers.js';

// Mock file-lock module (consistent with other route tests)
vi.mock('../../services/file-lock.js', () => ({
  atomicFrontmatterUpdate: vi.fn(async (_filePath: string, modifier: Function) => {
    const parsed = { frontmatter: {} as Record<string, unknown>, content: '' };
    return modifier(parsed);
  }),
}));

import { atomicFrontmatterUpdate } from '../../services/file-lock.js';

const mockAtomicFrontmatterUpdate = vi.mocked(atomicFrontmatterUpdate);
const testConfig = createTestConfig();

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

describe('collections routes', () => {
  let fastify: FastifyInstance;
  let mockScanner: LibraryScanner;
  let testNotes: Map<string, LiteratureNote>;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Restore default mock implementation after clearAllMocks resets it
    mockAtomicFrontmatterUpdate.mockImplementation(async (_filePath, modifier) => {
      const parsed = { frontmatter: {} as Record<string, unknown>, content: '' };
      return modifier(parsed);
    });

    testNotes = new Map();
    testNotes.set('note1', createTestNote({
      id: 'note1',
      title: 'Book 1',
      collections: ['Fiction', 'Favorites'],
    }));
    testNotes.set('note2', createTestNote({
      id: 'note2',
      title: 'Book 2',
      collections: ['Non-Fiction', 'Favorites'],
    }));
    testNotes.set('note3', createTestNote({
      id: 'note3',
      title: 'Book 3',
      collections: [],
    }));

    mockScanner = createMockScanner(testNotes);

    fastify = Fastify({ logger: false });
    await fastify.register(collectionsRoutes, {
      scanner: mockScanner,
      config: testConfig,
    });

    await fastify.ready();
  });

  afterEach(async () => {
    await fastify.close();
  });

  describe('GET /api/collections', () => {
    it('returns all unique collections across the library', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/collections',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.collections).toEqual(['Favorites', 'Fiction', 'Non-Fiction']);
    });

    it('returns empty array when no collections exist', async () => {
      testNotes.forEach(note => {
        note.collections = [];
      });

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/collections',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.collections).toEqual([]);
    });

    it('sorts collections alphabetically', async () => {
      testNotes.get('note1')!.collections = ['Zebra', 'Apple', 'Banana'];

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/collections',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.collections[0]).toBe('Apple');
      expect(body.collections[body.collections.length - 1]).toBe('Zebra');
    });

    it('returns empty array when library has no notes', async () => {
      testNotes.clear();

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/collections',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.collections).toEqual([]);
    });

    it('deduplicates collections from multiple notes', async () => {
      testNotes.get('note1')!.collections = ['Shared', 'Unique1'];
      testNotes.get('note2')!.collections = ['Shared', 'Unique2'];
      testNotes.get('note3')!.collections = ['Shared'];

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/collections',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.collections).toEqual(['Shared', 'Unique1', 'Unique2']);
    });

    it('handles a single note with one collection', async () => {
      testNotes.clear();
      testNotes.set('only', createTestNote({
        id: 'only',
        collections: ['Solo'],
      }));

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/collections',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.collections).toEqual(['Solo']);
    });

    it('sorts case-sensitively via localeCompare', async () => {
      testNotes.get('note1')!.collections = ['alpha', 'Beta'];
      testNotes.get('note2')!.collections = [];
      testNotes.get('note3')!.collections = [];

      const response = await fastify.inject({
        method: 'GET',
        url: '/api/collections',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      // localeCompare sorts case-insensitively by default in most locales
      expect(body.collections).toHaveLength(2);
      expect(body.collections).toContain('alpha');
      expect(body.collections).toContain('Beta');
    });
  });

  describe('PATCH /api/library/:id/collections', () => {
    it('updates collections for a note', async () => {
      const response = await fastify.inject({
        method: 'PATCH',
        url: '/api/library/note1/collections',
        payload: {
          collections: ['New Collection', 'Another One'],
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.collections).toEqual(['New Collection', 'Another One']);
    });

    it('calls atomicFrontmatterUpdate with the note file path', async () => {
      await fastify.inject({
        method: 'PATCH',
        url: '/api/library/note1/collections',
        payload: {
          collections: ['Test'],
        },
      });

      expect(mockAtomicFrontmatterUpdate).toHaveBeenCalledWith(
        testNotes.get('note1')!.notePath,
        expect.any(Function)
      );
    });

    it('sets the configured collections_key in frontmatter', async () => {
      const capturedFrontmatter: Record<string, unknown> = { title: 'Test' };
      mockAtomicFrontmatterUpdate.mockImplementation(async (_filePath, modifier) => {
        return modifier({ frontmatter: capturedFrontmatter, content: '' });
      });

      await fastify.inject({
        method: 'PATCH',
        url: '/api/library/note1/collections',
        payload: {
          collections: ['Science', 'History'],
        },
      });

      expect(capturedFrontmatter[testConfig.collections_key]).toEqual(['Science', 'History']);
    });

    it('uses custom collections_key from config', async () => {
      const customFastify = Fastify({ logger: false });
      const customConfig = createTestConfig({ collections_key: 'my_tags' });
      await customFastify.register(collectionsRoutes, { scanner: mockScanner, config: customConfig });
      await customFastify.ready();

      const capturedFrontmatter: Record<string, unknown> = {};
      mockAtomicFrontmatterUpdate.mockImplementation(async (_filePath, modifier) => {
        return modifier({ frontmatter: capturedFrontmatter, content: '' });
      });

      await customFastify.inject({
        method: 'PATCH',
        url: '/api/library/note1/collections',
        payload: { collections: ['TagA'] },
      });

      expect(capturedFrontmatter.my_tags).toEqual(['TagA']);
      expect(capturedFrontmatter).not.toHaveProperty('collections');
      await customFastify.close();
    });

    it('trims whitespace from collection names', async () => {
      const response = await fastify.inject({
        method: 'PATCH',
        url: '/api/library/note1/collections',
        payload: {
          collections: ['  Trimmed  ', '  Another  '],
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.collections).toEqual(['Trimmed', 'Another']);
    });

    it('filters out empty collection names', async () => {
      const response = await fastify.inject({
        method: 'PATCH',
        url: '/api/library/note1/collections',
        payload: {
          collections: ['Valid', '', '  ', 'Also Valid'],
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.collections).toEqual(['Valid', 'Also Valid']);
    });

    it('removes collections key when setting to empty array', async () => {
      const capturedFrontmatter: Record<string, unknown> = {
        title: 'Test',
        [testConfig.collections_key]: ['OldCollection'],
      };
      mockAtomicFrontmatterUpdate.mockImplementation(async (_filePath, modifier) => {
        return modifier({ frontmatter: capturedFrontmatter, content: '' });
      });

      const response = await fastify.inject({
        method: 'PATCH',
        url: '/api/library/note1/collections',
        payload: {
          collections: [],
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.collections).toEqual([]);
      expect(capturedFrontmatter).not.toHaveProperty(testConfig.collections_key);
    });

    it('removes collections key when all entries are whitespace-only', async () => {
      const capturedFrontmatter: Record<string, unknown> = {
        [testConfig.collections_key]: ['OldCollection'],
      };
      mockAtomicFrontmatterUpdate.mockImplementation(async (_filePath, modifier) => {
        return modifier({ frontmatter: capturedFrontmatter, content: '' });
      });

      const response = await fastify.inject({
        method: 'PATCH',
        url: '/api/library/note1/collections',
        payload: {
          collections: ['  ', '\t', ''],
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.collections).toEqual([]);
      expect(capturedFrontmatter).not.toHaveProperty(testConfig.collections_key);
    });

    it('returns 404 for non-existent note', async () => {
      const response = await fastify.inject({
        method: 'PATCH',
        url: '/api/library/nonexistent/collections',
        payload: {
          collections: ['Test'],
        },
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Note not found');
    });

    it('does not call atomicFrontmatterUpdate for non-existent note', async () => {
      await fastify.inject({
        method: 'PATCH',
        url: '/api/library/nonexistent/collections',
        payload: {
          collections: ['Test'],
        },
      });

      expect(mockAtomicFrontmatterUpdate).not.toHaveBeenCalled();
    });

    it('requires collections array in body', async () => {
      const response = await fastify.inject({
        method: 'PATCH',
        url: '/api/library/note1/collections',
        payload: {},
      });

      expect(response.statusCode).toBe(400);
    });

    it('coerces a string collections value into a single-element array', async () => {
      // Fastify uses AJV with coerceTypes, so a string becomes ['string']
      const response = await fastify.inject({
        method: 'PATCH',
        url: '/api/library/note1/collections',
        payload: {
          collections: 'single-value',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.collections).toEqual(['single-value']);
    });

    it('updates in-memory cache after successful update', async () => {
      await fastify.inject({
        method: 'PATCH',
        url: '/api/library/note1/collections',
        payload: {
          collections: ['Updated'],
        },
      });

      expect(mockScanner.updateNote).toHaveBeenCalledWith('note1', {
        collections: ['Updated'],
      });
    });

    it('does not update cache when atomicFrontmatterUpdate throws', async () => {
      mockAtomicFrontmatterUpdate.mockRejectedValue(new Error('Disk full'));

      await fastify.inject({
        method: 'PATCH',
        url: '/api/library/note1/collections',
        payload: {
          collections: ['Test'],
        },
      });

      expect(mockScanner.updateNote).not.toHaveBeenCalled();
    });

    it('returns 500 when atomicFrontmatterUpdate throws', async () => {
      mockAtomicFrontmatterUpdate.mockRejectedValue(new Error('Permission denied'));

      const response = await fastify.inject({
        method: 'PATCH',
        url: '/api/library/note1/collections',
        payload: {
          collections: ['Test'],
        },
      });

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Failed to update collections');
    });

    describe('edge cases', () => {
      it('handles unicode collection names', async () => {
        const response = await fastify.inject({
          method: 'PATCH',
          url: '/api/library/note1/collections',
          payload: {
            collections: ['文学', 'Poésie', 'Наука'],
          },
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.collections).toEqual(['文学', 'Poésie', 'Наука']);
      });

      it('handles collection names with special characters', async () => {
        const response = await fastify.inject({
          method: 'PATCH',
          url: '/api/library/note1/collections',
          payload: {
            collections: ['Science & Technology', 'Self-Help', 'How-To / DIY'],
          },
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.collections).toEqual(['Science & Technology', 'Self-Help', 'How-To / DIY']);
      });

      it('preserves duplicate collection names (no dedup on write)', async () => {
        const response = await fastify.inject({
          method: 'PATCH',
          url: '/api/library/note1/collections',
          payload: {
            collections: ['Fiction', 'Fiction', 'Fiction'],
          },
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        // The route does not deduplicate — it preserves the input as-is
        expect(body.collections).toEqual(['Fiction', 'Fiction', 'Fiction']);
      });

      it('handles a single collection', async () => {
        const response = await fastify.inject({
          method: 'PATCH',
          url: '/api/library/note1/collections',
          payload: {
            collections: ['Solo'],
          },
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.collections).toEqual(['Solo']);
      });

      it('handles a large number of collections', async () => {
        const manyCollections = Array.from({ length: 50 }, (_, i) => `Collection ${i + 1}`);
        const response = await fastify.inject({
          method: 'PATCH',
          url: '/api/library/note1/collections',
          payload: {
            collections: manyCollections,
          },
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.collections).toHaveLength(50);
        expect(body.collections[0]).toBe('Collection 1');
        expect(body.collections[49]).toBe('Collection 50');
      });

      it('handles collection names with leading/trailing newlines', async () => {
        const response = await fastify.inject({
          method: 'PATCH',
          url: '/api/library/note1/collections',
          payload: {
            collections: ['\nNewline\n', '\tTab\t'],
          },
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.collections).toEqual(['Newline', 'Tab']);
      });

      it('caches trimmed and filtered collections in memory', async () => {
        await fastify.inject({
          method: 'PATCH',
          url: '/api/library/note1/collections',
          payload: {
            collections: ['  Trimmed  ', '', '  Valid  '],
          },
        });

        // The in-memory cache should receive the sanitized collections
        expect(mockScanner.updateNote).toHaveBeenCalledWith('note1', {
          collections: ['Trimmed', 'Valid'],
        });
      });
    });
  });
});
