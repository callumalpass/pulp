import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── API mock ────────────────────────────────────────────────────────────

const mockReadingGoalsGet = vi.fn();

vi.mock('../../lib/api', () => ({
  api: {
    readingGoals: {
      get: (...args: unknown[]) => mockReadingGoalsGet(...args),
    },
  },
}));

// ── React Query mock ────────────────────────────────────────────────────

type QueryConfig = {
  queryKey: unknown[];
  queryFn: () => Promise<unknown>;
  staleTime?: number;
  refetchInterval?: number;
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

import { useReadingGoals } from '../useReadingGoals';

// ── Tests ───────────────────────────────────────────────────────────────

describe('useReadingGoals', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('queryKey', () => {
    it('uses the correct query key', () => {
      useReadingGoals();

      expect(lastQueryConfig.queryKey).toEqual(['reading-goals']);
    });
  });

  describe('queryFn', () => {
    it('calls api.readingGoals.get', async () => {
      mockReadingGoalsGet.mockResolvedValueOnce({});

      useReadingGoals();
      await lastQueryConfig.queryFn();

      expect(mockReadingGoalsGet).toHaveBeenCalledTimes(1);
    });

    it('returns the API response', async () => {
      const mockData = {
        goals: { dailyGoalMinutes: 30 },
        streak: { currentStreak: 5 },
        todayProgress: { minutesRead: 15 },
      };
      mockReadingGoalsGet.mockResolvedValueOnce(mockData);

      useReadingGoals();
      const result = await lastQueryConfig.queryFn();

      expect(result).toEqual(mockData);
    });

    it('propagates API errors', async () => {
      mockReadingGoalsGet.mockRejectedValueOnce(new Error('Failed to fetch goals'));

      useReadingGoals();

      await expect(lastQueryConfig.queryFn()).rejects.toThrow('Failed to fetch goals');
    });
  });

  describe('cache configuration', () => {
    it('sets staleTime to 30 seconds', () => {
      useReadingGoals();

      expect(lastQueryConfig.staleTime).toBe(30000);
    });

    it('sets refetchInterval to 60 seconds', () => {
      useReadingGoals();

      expect(lastQueryConfig.refetchInterval).toBe(60000);
    });
  });
});
