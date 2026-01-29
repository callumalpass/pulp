import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── API mock ────────────────────────────────────────────────────────────

const mockGetPaceTrends = vi.fn();

vi.mock('../../lib/api', () => ({
  api: {
    readingStats: {
      getPaceTrends: (...args: unknown[]) => mockGetPaceTrends(...args),
    },
  },
}));

// ── React Query mock ────────────────────────────────────────────────────

type QueryConfig = {
  queryKey: unknown[];
  queryFn: () => Promise<unknown>;
  enabled?: boolean;
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

import { useReadingPaceTrends } from '../useReadingPaceTrends';

// ── Tests ───────────────────────────────────────────────────────────────

describe('useReadingPaceTrends', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('queryKey', () => {
    it('includes noteId in query key', () => {
      useReadingPaceTrends('note-123');

      expect(lastQueryConfig.queryKey).toEqual(['reading-pace-trends', 'note-123', undefined]);
    });

    it('includes limit in query key when provided', () => {
      useReadingPaceTrends('note-123', 20);

      expect(lastQueryConfig.queryKey).toEqual(['reading-pace-trends', 'note-123', 20]);
    });

    it('includes null noteId in query key', () => {
      useReadingPaceTrends(null);

      expect(lastQueryConfig.queryKey).toEqual(['reading-pace-trends', null, undefined]);
    });

    it('produces different keys for different noteIds', () => {
      useReadingPaceTrends('note-1');
      const firstKey = [...lastQueryConfig.queryKey];

      useReadingPaceTrends('note-2');
      const secondKey = [...lastQueryConfig.queryKey];

      expect(firstKey).not.toEqual(secondKey);
    });

    it('produces different keys for different limits', () => {
      useReadingPaceTrends('note-1', 10);
      const firstKey = [...lastQueryConfig.queryKey];

      useReadingPaceTrends('note-1', 20);
      const secondKey = [...lastQueryConfig.queryKey];

      expect(firstKey).not.toEqual(secondKey);
    });
  });

  describe('queryFn', () => {
    it('calls api.readingStats.getPaceTrends with noteId', async () => {
      mockGetPaceTrends.mockResolvedValueOnce({});

      useReadingPaceTrends('note-123');
      await lastQueryConfig.queryFn();

      expect(mockGetPaceTrends).toHaveBeenCalledWith('note-123', undefined);
    });

    it('calls api.readingStats.getPaceTrends with noteId and limit', async () => {
      mockGetPaceTrends.mockResolvedValueOnce({});

      useReadingPaceTrends('note-123', 15);
      await lastQueryConfig.queryFn();

      expect(mockGetPaceTrends).toHaveBeenCalledWith('note-123', 15);
    });

    it('returns the API response', async () => {
      const mockData = {
        paceData: [{ date: '2025-01-01', pagesPerHour: 30 }],
        trend: 'improving',
        totalSessions: 5,
      };
      mockGetPaceTrends.mockResolvedValueOnce(mockData);

      useReadingPaceTrends('note-123');
      const result = await lastQueryConfig.queryFn();

      expect(result).toEqual(mockData);
    });

    it('propagates API errors', async () => {
      mockGetPaceTrends.mockRejectedValueOnce(new Error('Failed to fetch trends'));

      useReadingPaceTrends('note-123');

      await expect(lastQueryConfig.queryFn()).rejects.toThrow('Failed to fetch trends');
    });
  });

  describe('enabled', () => {
    it('is enabled when noteId is a non-empty string', () => {
      useReadingPaceTrends('note-123');

      expect(lastQueryConfig.enabled).toBe(true);
    });

    it('is disabled when noteId is null', () => {
      useReadingPaceTrends(null);

      expect(lastQueryConfig.enabled).toBe(false);
    });

    it('is disabled when noteId is an empty string', () => {
      useReadingPaceTrends('');

      expect(lastQueryConfig.enabled).toBe(false);
    });
  });

  describe('cache configuration', () => {
    it('sets staleTime to 60 seconds', () => {
      useReadingPaceTrends('note-123');

      expect(lastQueryConfig.staleTime).toBe(60000);
    });
  });
});
