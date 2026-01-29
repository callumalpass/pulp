import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── API mock ────────────────────────────────────────────────────────────

const mockSearchQuery = vi.fn();
const mockSearchStatus = vi.fn();

vi.mock('../../lib/api', () => ({
  api: {
    search: {
      query: (...args: unknown[]) => mockSearchQuery(...args),
      status: (...args: unknown[]) => mockSearchStatus(...args),
    },
  },
}));

// ── React Query mock ────────────────────────────────────────────────────

type QueryConfig = {
  queryKey: unknown[];
  queryFn: () => Promise<unknown>;
  enabled?: boolean;
  staleTime?: number;
  refetchInterval?: ((query: { state: { data: unknown } }) => number | false) | number | false;
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

import { useSearch, useSearchStatus } from '../useSearch';

// ── Tests ───────────────────────────────────────────────────────────────

describe('useSearch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('queryKey', () => {
    it('includes query string in query key', () => {
      useSearch('test query');

      expect(lastQueryConfig.queryKey).toEqual(['search', 'test query', undefined, undefined]);
    });

    it('includes noteId in query key when provided', () => {
      useSearch('test', { noteId: 'note-123' });

      expect(lastQueryConfig.queryKey).toEqual(['search', 'test', 'note-123', undefined]);
    });

    it('includes limit in query key when provided', () => {
      useSearch('test', { limit: 10 });

      expect(lastQueryConfig.queryKey).toEqual(['search', 'test', undefined, 10]);
    });

    it('includes all options in query key', () => {
      useSearch('test', { noteId: 'note-123', limit: 5 });

      expect(lastQueryConfig.queryKey).toEqual(['search', 'test', 'note-123', 5]);
    });

    it('uses different query keys for different queries', () => {
      useSearch('first');
      const firstKey = [...lastQueryConfig.queryKey];

      useSearch('second');
      const secondKey = [...lastQueryConfig.queryKey];

      expect(firstKey).not.toEqual(secondKey);
    });
  });

  describe('queryFn', () => {
    it('calls api.search.query with query string', async () => {
      mockSearchQuery.mockResolvedValueOnce({ results: [] });

      useSearch('test query');

      const result = await lastQueryConfig.queryFn();

      expect(mockSearchQuery).toHaveBeenCalledTimes(1);
      expect(mockSearchQuery).toHaveBeenCalledWith('test query', undefined);
      expect(result).toEqual({ results: [] });
    });

    it('passes options to api.search.query', async () => {
      mockSearchQuery.mockResolvedValueOnce({ results: [] });

      const options = { noteId: 'note-123', limit: 10 };
      useSearch('test', options);

      await lastQueryConfig.queryFn();

      expect(mockSearchQuery).toHaveBeenCalledWith('test', options);
    });

    it('propagates API errors', async () => {
      mockSearchQuery.mockRejectedValueOnce(new Error('Search failed'));

      useSearch('test');

      await expect(lastQueryConfig.queryFn()).rejects.toThrow('Search failed');
    });

    it('returns search results from API', async () => {
      const mockResults = {
        results: [
          { id: '1', title: 'Result 1', snippet: 'found text' },
          { id: '2', title: 'Result 2', snippet: 'other text' },
        ],
      };
      mockSearchQuery.mockResolvedValueOnce(mockResults);

      useSearch('test');

      const result = await lastQueryConfig.queryFn();
      expect(result).toEqual(mockResults);
    });
  });

  describe('enabled condition', () => {
    it('is enabled for queries with 2 or more characters', () => {
      useSearch('ab');

      expect(lastQueryConfig.enabled).toBe(true);
    });

    it('is enabled for queries with more than 2 characters', () => {
      useSearch('test query');

      expect(lastQueryConfig.enabled).toBe(true);
    });

    it('is disabled for single character queries', () => {
      useSearch('a');

      expect(lastQueryConfig.enabled).toBe(false);
    });

    it('is disabled for empty string queries', () => {
      useSearch('');

      expect(lastQueryConfig.enabled).toBe(false);
    });

    it('trims whitespace before checking length', () => {
      useSearch('  ');

      expect(lastQueryConfig.enabled).toBe(false);
    });

    it('trims whitespace - single char after trim is disabled', () => {
      useSearch(' a ');

      expect(lastQueryConfig.enabled).toBe(false);
    });

    it('trims whitespace - two chars after trim is enabled', () => {
      useSearch(' ab ');

      expect(lastQueryConfig.enabled).toBe(true);
    });

    it('can be explicitly disabled via options', () => {
      useSearch('test query', { enabled: false });

      expect(lastQueryConfig.enabled).toBe(false);
    });

    it('respects explicit enabled=true with valid query', () => {
      useSearch('test', { enabled: true });

      expect(lastQueryConfig.enabled).toBe(true);
    });

    it('remains disabled for short query even with enabled=true', () => {
      useSearch('a', { enabled: true });

      expect(lastQueryConfig.enabled).toBe(false);
    });

    it('is disabled for whitespace-only query even with enabled=true', () => {
      useSearch('   ', { enabled: true });

      expect(lastQueryConfig.enabled).toBe(false);
    });
  });

  describe('staleTime', () => {
    it('has 30 second stale time', () => {
      useSearch('test');

      expect(lastQueryConfig.staleTime).toBe(30000);
    });
  });
});

describe('useSearchStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('queryKey', () => {
    it('uses "search-status" as query key', () => {
      useSearchStatus();

      expect(lastQueryConfig.queryKey).toEqual(['search-status']);
    });
  });

  describe('queryFn', () => {
    it('calls api.search.status', async () => {
      mockSearchStatus.mockResolvedValueOnce({ isComplete: true, totalDocuments: 42 });

      useSearchStatus();

      const result = await lastQueryConfig.queryFn();

      expect(mockSearchStatus).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ isComplete: true, totalDocuments: 42 });
    });

    it('propagates API errors', async () => {
      mockSearchStatus.mockRejectedValueOnce(new Error('Status check failed'));

      useSearchStatus();

      await expect(lastQueryConfig.queryFn()).rejects.toThrow('Status check failed');
    });

    it('returns indexing in-progress status', async () => {
      const status = { isComplete: false, indexedDocuments: 10, totalDocuments: 100 };
      mockSearchStatus.mockResolvedValueOnce(status);

      useSearchStatus();

      const result = await lastQueryConfig.queryFn();
      expect(result).toEqual(status);
    });
  });

  describe('refetchInterval', () => {
    it('refetches every 2 seconds when indexing is in progress', () => {
      useSearchStatus();

      const refetchFn = lastQueryConfig.refetchInterval;
      expect(typeof refetchFn).toBe('function');

      const mockQuery = { state: { data: { isComplete: false } } };
      const interval = (refetchFn as (query: { state: { data: unknown } }) => number | false)(mockQuery);

      expect(interval).toBe(2000);
    });

    it('stops refetching when indexing is complete', () => {
      useSearchStatus();

      const refetchFn = lastQueryConfig.refetchInterval;
      expect(typeof refetchFn).toBe('function');

      const mockQuery = { state: { data: { isComplete: true } } };
      const interval = (refetchFn as (query: { state: { data: unknown } }) => number | false)(mockQuery);

      expect(interval).toBe(false);
    });

    it('stops refetching when no data is available', () => {
      useSearchStatus();

      const refetchFn = lastQueryConfig.refetchInterval;
      expect(typeof refetchFn).toBe('function');

      const mockQuery = { state: { data: null } };
      const interval = (refetchFn as (query: { state: { data: unknown } }) => number | false)(mockQuery);

      expect(interval).toBe(false);
    });

    it('stops refetching when data is undefined', () => {
      useSearchStatus();

      const refetchFn = lastQueryConfig.refetchInterval;
      expect(typeof refetchFn).toBe('function');

      const mockQuery = { state: { data: undefined } };
      const interval = (refetchFn as (query: { state: { data: unknown } }) => number | false)(mockQuery);

      expect(interval).toBe(false);
    });
  });
});
