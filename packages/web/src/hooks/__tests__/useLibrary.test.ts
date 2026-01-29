import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── API mock ────────────────────────────────────────────────────────────

const mockLibraryList = vi.fn();

vi.mock('../../lib/api', () => ({
  api: {
    library: {
      list: (...args: unknown[]) => mockLibraryList(...args),
    },
  },
}));

// ── React Query mock ────────────────────────────────────────────────────

type QueryConfig = {
  queryKey: unknown[];
  queryFn: () => Promise<unknown>;
  staleTime?: number;
  gcTime?: number;
};

let lastQueryConfig: QueryConfig;

vi.mock('@tanstack/react-query', () => ({
  useQuery: (config: QueryConfig) => {
    lastQueryConfig = config;
    return {
      data: undefined,
      isLoading: false,
      error: null,
    };
  },
}));

// ── Import under test (after mocks are set up) ─────────────────────────

import { useLibrary } from '../useLibrary';

// ── Tests ───────────────────────────────────────────────────────────────

describe('useLibrary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('queryKey', () => {
    it('uses default sort and order in query key', () => {
      useLibrary();

      expect(lastQueryConfig.queryKey).toEqual(['library', 'lastRead', 'desc']);
    });

    it('includes custom sort in query key', () => {
      useLibrary('title');

      expect(lastQueryConfig.queryKey).toEqual(['library', 'title', 'desc']);
    });

    it('includes custom order in query key', () => {
      useLibrary('lastRead', 'asc');

      expect(lastQueryConfig.queryKey).toEqual(['library', 'lastRead', 'asc']);
    });

    it('includes both custom sort and order in query key', () => {
      useLibrary('progress', 'asc');

      expect(lastQueryConfig.queryKey).toEqual(['library', 'progress', 'asc']);
    });

    it('produces different keys for different sort values', () => {
      useLibrary('title');
      const titleKey = [...lastQueryConfig.queryKey];

      useLibrary('author');
      const authorKey = [...lastQueryConfig.queryKey];

      expect(titleKey).not.toEqual(authorKey);
    });

    it('produces different keys for different order values', () => {
      useLibrary('lastRead', 'asc');
      const ascKey = [...lastQueryConfig.queryKey];

      useLibrary('lastRead', 'desc');
      const descKey = [...lastQueryConfig.queryKey];

      expect(ascKey).not.toEqual(descKey);
    });

    it('supports all sort options', () => {
      const sortOptions = ['lastRead', 'title', 'progress', 'dateCreated', 'author', 'rating'] as const;

      for (const sort of sortOptions) {
        useLibrary(sort);
        expect(lastQueryConfig.queryKey[1]).toBe(sort);
      }
    });
  });

  describe('queryFn', () => {
    it('calls api.library.list with default parameters', async () => {
      mockLibraryList.mockResolvedValueOnce([]);

      useLibrary();
      await lastQueryConfig.queryFn();

      expect(mockLibraryList).toHaveBeenCalledWith('lastRead', 'desc');
    });

    it('calls api.library.list with custom sort', async () => {
      mockLibraryList.mockResolvedValueOnce([]);

      useLibrary('title');
      await lastQueryConfig.queryFn();

      expect(mockLibraryList).toHaveBeenCalledWith('title', 'desc');
    });

    it('calls api.library.list with custom sort and order', async () => {
      mockLibraryList.mockResolvedValueOnce([]);

      useLibrary('rating', 'asc');
      await lastQueryConfig.queryFn();

      expect(mockLibraryList).toHaveBeenCalledWith('rating', 'asc');
    });

    it('returns the API response', async () => {
      const mockData = [{ id: 'note-1', title: 'Book' }];
      mockLibraryList.mockResolvedValueOnce(mockData);

      useLibrary();
      const result = await lastQueryConfig.queryFn();

      expect(result).toEqual(mockData);
    });

    it('propagates API errors', async () => {
      mockLibraryList.mockRejectedValueOnce(new Error('Network error'));

      useLibrary();

      await expect(lastQueryConfig.queryFn()).rejects.toThrow('Network error');
    });
  });

  describe('cache configuration', () => {
    it('sets staleTime to 30 seconds', () => {
      useLibrary();

      expect(lastQueryConfig.staleTime).toBe(30 * 1000);
    });

    it('sets gcTime to 5 minutes', () => {
      useLibrary();

      expect(lastQueryConfig.gcTime).toBe(5 * 60 * 1000);
    });
  });
});
