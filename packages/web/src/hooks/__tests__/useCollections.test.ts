import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── API mock ────────────────────────────────────────────────────────────

const mockList = vi.fn();
const mockUpdate = vi.fn();

vi.mock('../../lib/api', () => ({
  api: {
    collections: {
      list: (...args: unknown[]) => mockList(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
    },
  },
}));

// ── React Query mock ────────────────────────────────────────────────────

const mockInvalidateQueries = vi.fn();
const mockQueryClient = { invalidateQueries: mockInvalidateQueries };

type QueryConfig = {
  queryKey: unknown[];
  queryFn: () => Promise<unknown>;
};

type MutationConfig = {
  mutationFn: (...args: unknown[]) => Promise<unknown>;
  onSuccess?: (...args: unknown[]) => void;
};

let lastQueryConfig: QueryConfig;
let lastMutationConfig: MutationConfig;

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => mockQueryClient,
  useQuery: (config: QueryConfig) => {
    lastQueryConfig = config;
    return {
      data: undefined,
      isLoading: false,
      error: null,
    };
  },
  useMutation: (config: MutationConfig) => {
    lastMutationConfig = config;
    return {
      mutate: vi.fn(),
      mutateAsync: vi.fn(),
      isPending: false,
    };
  },
}));

// ── Import under test (after mocks are set up) ─────────────────────────

import { useCollections, useUpdateCollections } from '../useCollections';

// ── Tests ───────────────────────────────────────────────────────────────

describe('useCollections', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('queryKey', () => {
    it('uses "collections" as the query key', () => {
      useCollections();

      expect(lastQueryConfig.queryKey).toEqual(['collections']);
    });
  });

  describe('queryFn', () => {
    it('calls api.collections.list', async () => {
      mockList.mockResolvedValueOnce({ collections: ['fiction', 'non-fiction'] });

      useCollections();

      const result = await lastQueryConfig.queryFn();

      expect(mockList).toHaveBeenCalledTimes(1);
      expect(mockList).toHaveBeenCalledWith();
      expect(result).toEqual({ collections: ['fiction', 'non-fiction'] });
    });

    it('returns empty array when no collections exist', async () => {
      mockList.mockResolvedValueOnce({ collections: [] });

      useCollections();

      const result = await lastQueryConfig.queryFn();

      expect(result).toEqual({ collections: [] });
    });

    it('handles collections with special characters', async () => {
      mockList.mockResolvedValueOnce({
        collections: ['📚 Books', 'Research & Notes', 'To-Read/2025'],
      });

      useCollections();

      const result = await lastQueryConfig.queryFn();

      expect(result).toEqual({
        collections: ['📚 Books', 'Research & Notes', 'To-Read/2025'],
      });
    });

    it('propagates API errors', async () => {
      mockList.mockRejectedValueOnce(new Error('Network error'));

      useCollections();

      await expect(lastQueryConfig.queryFn()).rejects.toThrow('Network error');
    });

    it('handles server errors', async () => {
      mockList.mockRejectedValueOnce(new Error('HTTP 500: Internal Server Error'));

      useCollections();

      await expect(lastQueryConfig.queryFn()).rejects.toThrow('HTTP 500: Internal Server Error');
    });
  });
});

describe('useUpdateCollections', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('mutationFn', () => {
    it('calls api.collections.update with noteId and collections', async () => {
      mockUpdate.mockResolvedValueOnce({ success: true, collections: ['fiction'] });

      useUpdateCollections();

      const result = await lastMutationConfig.mutationFn({
        noteId: 'note-123',
        collections: ['fiction'],
      });

      expect(mockUpdate).toHaveBeenCalledTimes(1);
      expect(mockUpdate).toHaveBeenCalledWith('note-123', { collections: ['fiction'] });
      expect(result).toEqual({ success: true, collections: ['fiction'] });
    });

    it('handles adding multiple collections', async () => {
      mockUpdate.mockResolvedValueOnce({
        success: true,
        collections: ['fiction', 'favorites', 'to-read'],
      });

      useUpdateCollections();

      await lastMutationConfig.mutationFn({
        noteId: 'note-456',
        collections: ['fiction', 'favorites', 'to-read'],
      });

      expect(mockUpdate).toHaveBeenCalledWith('note-456', {
        collections: ['fiction', 'favorites', 'to-read'],
      });
    });

    it('handles removing all collections (empty array)', async () => {
      mockUpdate.mockResolvedValueOnce({ success: true, collections: [] });

      useUpdateCollections();

      const result = await lastMutationConfig.mutationFn({
        noteId: 'note-789',
        collections: [],
      });

      expect(mockUpdate).toHaveBeenCalledWith('note-789', { collections: [] });
      expect(result).toEqual({ success: true, collections: [] });
    });

    it('handles collections with special characters', async () => {
      mockUpdate.mockResolvedValueOnce({
        success: true,
        collections: ['📚 Books', 'Research & Notes'],
      });

      useUpdateCollections();

      await lastMutationConfig.mutationFn({
        noteId: 'note-abc',
        collections: ['📚 Books', 'Research & Notes'],
      });

      expect(mockUpdate).toHaveBeenCalledWith('note-abc', {
        collections: ['📚 Books', 'Research & Notes'],
      });
    });

    it('handles collections with unicode characters', async () => {
      mockUpdate.mockResolvedValueOnce({
        success: true,
        collections: ['日本語', 'العربية', 'עברית'],
      });

      useUpdateCollections();

      await lastMutationConfig.mutationFn({
        noteId: 'note-unicode',
        collections: ['日本語', 'العربية', 'עברית'],
      });

      expect(mockUpdate).toHaveBeenCalledWith('note-unicode', {
        collections: ['日本語', 'العربية', 'עברית'],
      });
    });

    it('propagates API errors', async () => {
      mockUpdate.mockRejectedValueOnce(new Error('HTTP 404: Note not found'));

      useUpdateCollections();

      await expect(
        lastMutationConfig.mutationFn({
          noteId: 'nonexistent-note',
          collections: ['fiction'],
        })
      ).rejects.toThrow('HTTP 404: Note not found');
    });

    it('handles network failures', async () => {
      mockUpdate.mockRejectedValueOnce(new Error('Network request failed'));

      useUpdateCollections();

      await expect(
        lastMutationConfig.mutationFn({
          noteId: 'note-123',
          collections: ['fiction'],
        })
      ).rejects.toThrow('Network request failed');
    });

    it('handles server validation errors', async () => {
      mockUpdate.mockRejectedValueOnce(new Error('HTTP 400: Invalid collection name'));

      useUpdateCollections();

      await expect(
        lastMutationConfig.mutationFn({
          noteId: 'note-123',
          collections: [''],
        })
      ).rejects.toThrow('HTTP 400: Invalid collection name');
    });
  });

  describe('onSuccess cache invalidation', () => {
    it('invalidates collections query', () => {
      useUpdateCollections();

      lastMutationConfig.onSuccess?.(
        { success: true, collections: ['fiction'] },
        { noteId: 'note-123', collections: ['fiction'] }
      );

      expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['collections'] });
    });

    it('invalidates library query', () => {
      useUpdateCollections();

      lastMutationConfig.onSuccess?.(
        { success: true, collections: ['fiction'] },
        { noteId: 'note-123', collections: ['fiction'] }
      );

      expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['library'] });
    });

    it('invalidates specific note query with correct noteId', () => {
      useUpdateCollections();

      lastMutationConfig.onSuccess?.(
        { success: true, collections: ['fiction'] },
        { noteId: 'note-specific-123', collections: ['fiction'] }
      );

      expect(mockInvalidateQueries).toHaveBeenCalledWith({
        queryKey: ['note', 'note-specific-123'],
      });
    });

    it('invalidates all three query keys on success', () => {
      useUpdateCollections();

      lastMutationConfig.onSuccess?.(
        { success: true, collections: ['fiction'] },
        { noteId: 'note-123', collections: ['fiction'] }
      );

      expect(mockInvalidateQueries).toHaveBeenCalledTimes(3);
    });

    it('invalidates queries with different noteIds correctly', () => {
      useUpdateCollections();

      // First update
      lastMutationConfig.onSuccess?.(
        { success: true, collections: ['fiction'] },
        { noteId: 'note-aaa', collections: ['fiction'] }
      );

      vi.clearAllMocks();

      // Second update with different noteId
      lastMutationConfig.onSuccess?.(
        { success: true, collections: ['non-fiction'] },
        { noteId: 'note-bbb', collections: ['non-fiction'] }
      );

      expect(mockInvalidateQueries).toHaveBeenCalledWith({
        queryKey: ['note', 'note-bbb'],
      });
      expect(mockInvalidateQueries).not.toHaveBeenCalledWith({
        queryKey: ['note', 'note-aaa'],
      });
    });

    it('invalidates queries even when collections are empty', () => {
      useUpdateCollections();

      lastMutationConfig.onSuccess?.(
        { success: true, collections: [] },
        { noteId: 'note-123', collections: [] }
      );

      expect(mockInvalidateQueries).toHaveBeenCalledTimes(3);
      expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['collections'] });
      expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['library'] });
      expect(mockInvalidateQueries).toHaveBeenCalledWith({
        queryKey: ['note', 'note-123'],
      });
    });
  });

  describe('edge cases', () => {
    it('handles very long collection names', async () => {
      const longName = 'a'.repeat(500);
      mockUpdate.mockResolvedValueOnce({
        success: true,
        collections: [longName],
      });

      useUpdateCollections();

      await lastMutationConfig.mutationFn({
        noteId: 'note-123',
        collections: [longName],
      });

      expect(mockUpdate).toHaveBeenCalledWith('note-123', {
        collections: [longName],
      });
    });

    it('handles many collections at once', async () => {
      const manyCollections = Array.from({ length: 100 }, (_, i) => `collection-${i}`);
      mockUpdate.mockResolvedValueOnce({
        success: true,
        collections: manyCollections,
      });

      useUpdateCollections();

      await lastMutationConfig.mutationFn({
        noteId: 'note-123',
        collections: manyCollections,
      });

      expect(mockUpdate).toHaveBeenCalledWith('note-123', {
        collections: manyCollections,
      });
    });

    it('handles noteId with special characters', async () => {
      mockUpdate.mockResolvedValueOnce({
        success: true,
        collections: ['fiction'],
      });

      useUpdateCollections();

      await lastMutationConfig.mutationFn({
        noteId: 'note/with/slashes',
        collections: ['fiction'],
      });

      expect(mockUpdate).toHaveBeenCalledWith('note/with/slashes', {
        collections: ['fiction'],
      });
    });

    it('handles duplicate collection names in input', async () => {
      mockUpdate.mockResolvedValueOnce({
        success: true,
        collections: ['fiction', 'fiction'],
      });

      useUpdateCollections();

      await lastMutationConfig.mutationFn({
        noteId: 'note-123',
        collections: ['fiction', 'fiction'],
      });

      // The hook should pass through whatever is given; server handles deduplication
      expect(mockUpdate).toHaveBeenCalledWith('note-123', {
        collections: ['fiction', 'fiction'],
      });
    });
  });
});
