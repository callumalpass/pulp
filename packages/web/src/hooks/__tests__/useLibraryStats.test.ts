import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── API mock ────────────────────────────────────────────────────────────

const mockLibraryStatsGet = vi.fn();

vi.mock('../../lib/api', () => ({
  api: {
    libraryStats: {
      get: (...args: unknown[]) => mockLibraryStatsGet(...args),
    },
  },
}));

// ── React Query mock ────────────────────────────────────────────────────

type QueryConfig = {
  queryKey: unknown[];
  queryFn: () => Promise<unknown>;
  staleTime?: number;
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

import { useLibraryStats } from '../useLibraryStats';

// ── Tests ───────────────────────────────────────────────────────────────

describe('useLibraryStats', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('queryKey', () => {
    it('uses the correct query key', () => {
      useLibraryStats();

      expect(lastQueryConfig.queryKey).toEqual(['library-stats']);
    });
  });

  describe('queryFn', () => {
    it('calls api.libraryStats.get', async () => {
      mockLibraryStatsGet.mockResolvedValueOnce({ totalBooks: 10 });

      useLibraryStats();
      await lastQueryConfig.queryFn();

      expect(mockLibraryStatsGet).toHaveBeenCalledTimes(1);
    });

    it('returns the API response', async () => {
      const mockData = {
        totalBooks: 42,
        totalPdf: 20,
        totalEpub: 22,
        reading: 5,
        finished: 30,
        unread: 7,
      };
      mockLibraryStatsGet.mockResolvedValueOnce(mockData);

      useLibraryStats();
      const result = await lastQueryConfig.queryFn();

      expect(result).toEqual(mockData);
    });

    it('propagates API errors', async () => {
      mockLibraryStatsGet.mockRejectedValueOnce(new Error('Server error'));

      useLibraryStats();

      await expect(lastQueryConfig.queryFn()).rejects.toThrow('Server error');
    });
  });

  describe('cache configuration', () => {
    it('sets staleTime to 30 seconds', () => {
      useLibraryStats();

      expect(lastQueryConfig.staleTime).toBe(30000);
    });
  });
});
