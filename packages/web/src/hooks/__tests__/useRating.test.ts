import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── API mock ────────────────────────────────────────────────────────────

const mockRatingUpdate = vi.fn();

vi.mock('../../lib/api', () => ({
  api: {
    rating: {
      update: (...args: unknown[]) => mockRatingUpdate(...args),
    },
  },
}));

// ── React Query mock ────────────────────────────────────────────────────

const mockCancelQueries = vi.fn().mockResolvedValue(undefined);
const mockGetQueryData = vi.fn();
const mockSetQueriesData = vi.fn();
const mockInvalidateQueries = vi.fn();

const mockQueryClient = {
  cancelQueries: mockCancelQueries,
  getQueryData: mockGetQueryData,
  setQueriesData: mockSetQueriesData,
  invalidateQueries: mockInvalidateQueries,
};

type MutationConfig = {
  mutationFn: (vars: { id: string; rating: number | null }) => Promise<unknown>;
  onMutate: (vars: { id: string; rating: number | null }) => Promise<{ previousLibrary: unknown }>;
  onError: (err: unknown, variables: unknown, context: { previousLibrary: unknown } | undefined) => void;
  onSettled: () => void;
};

let mutationConfig: MutationConfig;
let mutateFn: ReturnType<typeof vi.fn>;
let mutationIsPending = false;

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => mockQueryClient,
  useMutation: (config: MutationConfig) => {
    mutationConfig = config;
    mutateFn = vi.fn();
    return {
      mutate: mutateFn,
      isPending: mutationIsPending,
    };
  },
}));

// ── React mock ──────────────────────────────────────────────────────────

vi.mock('react', () => ({
  useCallback: (fn: Function, _deps: unknown[]) => fn,
}));

// ── Import under test (after mocks) ────────────────────────────────────

import { useRating } from '../useRating';

// ── Helpers ─────────────────────────────────────────────────────────────

function callHook() {
  mutationIsPending = false;
  return useRating();
}

const sampleLibrary = [
  {
    id: 'note-1',
    title: 'Book One',
    author: 'Author A',
    pinned: false,
    rating: 3,
    progress: 0.5,
    sourceType: 'epub' as const,
    collections: [],
    highlightCount: 0,
    paused: false,
    pausedAt: null,
    citekey: null,
    lastRead: null,
    dateCreated: null,
    dateFinished: null,
    yearCompleted: null,
    cover: null,
    readingStats: null,
    totalPages: null,
    currentChapter: null,
    csl: null,
  },
  {
    id: 'note-2',
    title: 'Book Two',
    author: 'Author B',
    pinned: true,
    rating: null,
    progress: 1.0,
    sourceType: 'pdf' as const,
    collections: ['fiction'],
    highlightCount: 5,
    paused: false,
    pausedAt: null,
    citekey: null,
    lastRead: '2025-01-10',
    dateCreated: '2025-01-01',
    dateFinished: null,
    yearCompleted: null,
    cover: null,
    readingStats: null,
    totalPages: 200,
    currentChapter: null,
    csl: null,
  },
  {
    id: 'note-3',
    title: 'Book Three',
    author: null,
    pinned: false,
    rating: 5,
    progress: 0,
    sourceType: 'epub' as const,
    collections: ['non-fiction', 'favorites'],
    highlightCount: 12,
    paused: true,
    pausedAt: '2025-01-05',
    citekey: 'smith2024',
    lastRead: '2025-01-05',
    dateCreated: '2024-12-01',
    dateFinished: null,
    yearCompleted: null,
    cover: 'cover.jpg',
    readingStats: null,
    totalPages: 350,
    currentChapter: 'Chapter 3',
    csl: null,
  },
];

// ── Tests ───────────────────────────────────────────────────────────────

describe('useRating', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mutationIsPending = false;
  });

  describe('initialization', () => {
    it('returns the expected API shape', () => {
      const result = callHook();

      expect(result).toHaveProperty('setRating');
      expect(result).toHaveProperty('isPending');
      expect(typeof result.setRating).toBe('function');
      expect(typeof result.isPending).toBe('boolean');
    });

    it('initializes with isPending false', () => {
      const result = callHook();

      expect(result.isPending).toBe(false);
    });

    it('reflects isPending from mutation state', () => {
      mutationIsPending = true;
      const result = useRating();

      expect(result.isPending).toBe(true);
    });
  });

  describe('setRating', () => {
    it('calls mutate with the given id and rating', () => {
      const result = callHook();

      result.setRating('note-1', 4);

      expect(mutateFn).toHaveBeenCalledWith({ id: 'note-1', rating: 4 });
    });

    it('calls mutate with null to clear a rating', () => {
      const result = callHook();

      result.setRating('note-1', null);

      expect(mutateFn).toHaveBeenCalledWith({ id: 'note-1', rating: null });
    });

    it('can be called multiple times for different notes', () => {
      const result = callHook();

      result.setRating('note-1', 5);
      result.setRating('note-2', 3);
      result.setRating('note-3', null);

      expect(mutateFn).toHaveBeenCalledTimes(3);
      expect(mutateFn).toHaveBeenNthCalledWith(1, { id: 'note-1', rating: 5 });
      expect(mutateFn).toHaveBeenNthCalledWith(2, { id: 'note-2', rating: 3 });
      expect(mutateFn).toHaveBeenNthCalledWith(3, { id: 'note-3', rating: null });
    });

    it('accepts boundary rating values', () => {
      const result = callHook();

      result.setRating('note-1', 1);
      result.setRating('note-1', 5);

      expect(mutateFn).toHaveBeenNthCalledWith(1, { id: 'note-1', rating: 1 });
      expect(mutateFn).toHaveBeenNthCalledWith(2, { id: 'note-1', rating: 5 });
    });
  });

  describe('mutationFn', () => {
    it('calls api.rating.update with id and rating', async () => {
      mockRatingUpdate.mockResolvedValueOnce({ success: true, rating: 4 });
      callHook();

      await mutationConfig.mutationFn({ id: 'note-1', rating: 4 });

      expect(mockRatingUpdate).toHaveBeenCalledWith('note-1', { rating: 4 });
    });

    it('calls api.rating.update with null to clear rating', async () => {
      mockRatingUpdate.mockResolvedValueOnce({ success: true, rating: null });
      callHook();

      await mutationConfig.mutationFn({ id: 'note-1', rating: null });

      expect(mockRatingUpdate).toHaveBeenCalledWith('note-1', { rating: null });
    });

    it('returns API response on success', async () => {
      mockRatingUpdate.mockResolvedValueOnce({ success: true, rating: 5 });
      callHook();

      const result = await mutationConfig.mutationFn({ id: 'note-3', rating: 5 });

      expect(result).toEqual({ success: true, rating: 5 });
    });

    it('propagates API errors', async () => {
      mockRatingUpdate.mockRejectedValueOnce(new Error('HTTP 500: Internal Server Error'));
      callHook();

      await expect(
        mutationConfig.mutationFn({ id: 'note-1', rating: 4 })
      ).rejects.toThrow('HTTP 500: Internal Server Error');
    });

    it('propagates not-found errors', async () => {
      mockRatingUpdate.mockRejectedValueOnce(new Error('HTTP 404: Not Found'));
      callHook();

      await expect(
        mutationConfig.mutationFn({ id: 'nonexistent', rating: 3 })
      ).rejects.toThrow('HTTP 404: Not Found');
    });
  });

  describe('onMutate (optimistic update)', () => {
    it('cancels outgoing library queries', async () => {
      callHook();

      await mutationConfig.onMutate({ id: 'note-1', rating: 5 });

      expect(mockCancelQueries).toHaveBeenCalledWith({ queryKey: ['library'] });
    });

    it('snapshots the previous library data', async () => {
      const previousData = [...sampleLibrary];
      mockGetQueryData.mockReturnValueOnce(previousData);
      callHook();

      const context = await mutationConfig.onMutate({ id: 'note-1', rating: 5 });

      expect(mockGetQueryData).toHaveBeenCalledWith(['library']);
      expect(context.previousLibrary).toBe(previousData);
    });

    it('optimistically updates rating in library cache', async () => {
      mockGetQueryData.mockReturnValueOnce([...sampleLibrary]);
      callHook();

      await mutationConfig.onMutate({ id: 'note-1', rating: 5 });

      expect(mockSetQueriesData).toHaveBeenCalledWith(
        { queryKey: ['library'] },
        expect.any(Function),
      );

      const updater = mockSetQueriesData.mock.calls[0][1];
      const updated = updater([...sampleLibrary]);

      expect(updated.find((n: { id: string }) => n.id === 'note-1').rating).toBe(5);
      // Other notes unchanged
      expect(updated.find((n: { id: string }) => n.id === 'note-2').rating).toBeNull();
      expect(updated.find((n: { id: string }) => n.id === 'note-3').rating).toBe(5);
    });

    it('optimistically sets rating to null (clear)', async () => {
      mockGetQueryData.mockReturnValueOnce([...sampleLibrary]);
      callHook();

      await mutationConfig.onMutate({ id: 'note-1', rating: null });

      const updater = mockSetQueriesData.mock.calls[0][1];
      const updated = updater([...sampleLibrary]);

      expect(updated.find((n: { id: string }) => n.id === 'note-1').rating).toBeNull();
    });

    it('does not modify other properties of the updated note', async () => {
      mockGetQueryData.mockReturnValueOnce([...sampleLibrary]);
      callHook();

      await mutationConfig.onMutate({ id: 'note-1', rating: 5 });

      const updater = mockSetQueriesData.mock.calls[0][1];
      const updated = updater([...sampleLibrary]);

      const note1 = updated.find((n: { id: string }) => n.id === 'note-1');
      expect(note1.title).toBe('Book One');
      expect(note1.author).toBe('Author A');
      expect(note1.progress).toBe(0.5);
      expect(note1.pinned).toBe(false);
      expect(note1.collections).toEqual([]);
    });

    it('handles undefined library data gracefully', async () => {
      mockGetQueryData.mockReturnValueOnce(undefined);
      callHook();

      const context = await mutationConfig.onMutate({ id: 'note-1', rating: 4 });

      expect(context.previousLibrary).toBeUndefined();

      const updater = mockSetQueriesData.mock.calls[0][1];
      expect(updater(undefined)).toBeUndefined();
    });

    it('returns context with previous library for rollback', async () => {
      const previousData = [...sampleLibrary];
      mockGetQueryData.mockReturnValueOnce(previousData);
      callHook();

      const context = await mutationConfig.onMutate({ id: 'note-1', rating: 4 });

      expect(context).toEqual({ previousLibrary: previousData });
    });

    it('handles note not found in library (no match)', async () => {
      mockGetQueryData.mockReturnValueOnce([...sampleLibrary]);
      callHook();

      await mutationConfig.onMutate({ id: 'nonexistent-note', rating: 3 });

      const updater = mockSetQueriesData.mock.calls[0][1];
      const updated = updater([...sampleLibrary]);

      expect(updated).toEqual(sampleLibrary);
    });
  });

  describe('onError (rollback)', () => {
    it('restores previous library data on error', () => {
      const previousData = [...sampleLibrary];
      callHook();

      mutationConfig.onError(
        new Error('Server error'),
        { id: 'note-1', rating: 5 },
        { previousLibrary: previousData },
      );

      expect(mockSetQueriesData).toHaveBeenCalledWith(
        { queryKey: ['library'] },
        previousData,
      );
    });

    it('does not rollback when context is undefined', () => {
      callHook();

      mutationConfig.onError(
        new Error('Server error'),
        { id: 'note-1', rating: 5 },
        undefined,
      );

      expect(mockSetQueriesData).not.toHaveBeenCalled();
    });

    it('does not rollback when previousLibrary is undefined', () => {
      callHook();

      mutationConfig.onError(
        new Error('Server error'),
        { id: 'note-1', rating: 5 },
        { previousLibrary: undefined as unknown },
      );

      expect(mockSetQueriesData).not.toHaveBeenCalled();
    });

    it('restores with the exact snapshot data (not mutated)', () => {
      const previousData = [
        { ...sampleLibrary[0], rating: 3 },
        { ...sampleLibrary[1], rating: null },
      ];
      callHook();

      mutationConfig.onError(
        new Error('Network error'),
        { id: 'note-1', rating: 5 },
        { previousLibrary: previousData },
      );

      const restoredData = mockSetQueriesData.mock.calls[0][1];
      expect(restoredData[0].rating).toBe(3);
      expect(restoredData[1].rating).toBeNull();
    });
  });

  describe('onSettled (refetch)', () => {
    it('invalidates library queries on success', () => {
      callHook();

      mutationConfig.onSettled();

      expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['library'] });
    });

    it('invalidates library queries on error (after rollback)', () => {
      callHook();

      mutationConfig.onError(
        new Error('fail'),
        { id: 'note-1', rating: 5 },
        { previousLibrary: sampleLibrary },
      );

      vi.clearAllMocks();

      mutationConfig.onSettled();

      expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['library'] });
    });

    it('only invalidates library queries (no other cache keys)', () => {
      callHook();

      mutationConfig.onSettled();

      expect(mockInvalidateQueries).toHaveBeenCalledTimes(1);
      expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['library'] });
    });
  });

  describe('full optimistic update cycle', () => {
    it('set rating: optimistic update → API success → refetch', async () => {
      mockGetQueryData.mockReturnValueOnce([...sampleLibrary]);
      mockRatingUpdate.mockResolvedValueOnce({ success: true, rating: 5 });
      callHook();

      // 1. Optimistic update
      const context = await mutationConfig.onMutate({ id: 'note-1', rating: 5 });

      expect(mockCancelQueries).toHaveBeenCalledWith({ queryKey: ['library'] });
      expect(mockSetQueriesData).toHaveBeenCalled();

      const updater = mockSetQueriesData.mock.calls[0][1];
      const optimisticState = updater([...sampleLibrary]);
      expect(optimisticState.find((n: { id: string }) => n.id === 'note-1').rating).toBe(5);

      // 2. API succeeds
      const result = await mutationConfig.mutationFn({ id: 'note-1', rating: 5 });
      expect(result).toEqual({ success: true, rating: 5 });

      // 3. Refetch
      mutationConfig.onSettled();
      expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['library'] });

      // Context was available for rollback if needed
      expect(context.previousLibrary).toBeDefined();
    });

    it('set rating: optimistic update → API failure → rollback → refetch', async () => {
      const snapshot = [...sampleLibrary];
      mockGetQueryData.mockReturnValueOnce(snapshot);
      mockRatingUpdate.mockRejectedValueOnce(new Error('Server error'));
      callHook();

      // 1. Optimistic update
      const context = await mutationConfig.onMutate({ id: 'note-1', rating: 5 });

      // 2. API fails
      await expect(
        mutationConfig.mutationFn({ id: 'note-1', rating: 5 })
      ).rejects.toThrow('Server error');

      // 3. Rollback
      vi.clearAllMocks();
      mutationConfig.onError(
        new Error('Server error'),
        { id: 'note-1', rating: 5 },
        context,
      );
      expect(mockSetQueriesData).toHaveBeenCalledWith(
        { queryKey: ['library'] },
        snapshot,
      );

      // 4. Refetch to reconcile state
      mutationConfig.onSettled();
      expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['library'] });
    });

    it('clear rating: full cycle with optimistic update', async () => {
      mockGetQueryData.mockReturnValueOnce([...sampleLibrary]);
      mockRatingUpdate.mockResolvedValueOnce({ success: true, rating: null });
      callHook();

      // note-1 starts with rating 3
      expect(sampleLibrary.find(n => n.id === 'note-1')!.rating).toBe(3);

      // 1. Optimistic update: clear rating
      await mutationConfig.onMutate({ id: 'note-1', rating: null });

      const updater = mockSetQueriesData.mock.calls[0][1];
      const optimisticState = updater([...sampleLibrary]);
      expect(optimisticState.find((n: { id: string }) => n.id === 'note-1').rating).toBeNull();

      // 2. API succeeds
      const result = await mutationConfig.mutationFn({ id: 'note-1', rating: null });
      expect(result).toEqual({ success: true, rating: null });

      // 3. Refetch
      mutationConfig.onSettled();
      expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['library'] });
    });

    it('change rating: update existing rating to new value', async () => {
      mockGetQueryData.mockReturnValueOnce([...sampleLibrary]);
      mockRatingUpdate.mockResolvedValueOnce({ success: true, rating: 1 });
      callHook();

      // note-3 starts with rating 5
      expect(sampleLibrary.find(n => n.id === 'note-3')!.rating).toBe(5);

      // 1. Optimistic update: change rating from 5 to 1
      await mutationConfig.onMutate({ id: 'note-3', rating: 1 });

      const updater = mockSetQueriesData.mock.calls[0][1];
      const optimisticState = updater([...sampleLibrary]);
      expect(optimisticState.find((n: { id: string }) => n.id === 'note-3').rating).toBe(1);

      // 2. API succeeds
      const result = await mutationConfig.mutationFn({ id: 'note-3', rating: 1 });
      expect(result).toEqual({ success: true, rating: 1 });

      // 3. Refetch
      mutationConfig.onSettled();
      expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['library'] });
    });
  });

  describe('edge cases', () => {
    it('handles empty library cache', async () => {
      mockGetQueryData.mockReturnValueOnce([]);
      callHook();

      const context = await mutationConfig.onMutate({ id: 'note-1', rating: 4 });

      const updater = mockSetQueriesData.mock.calls[0][1];
      const updated = updater([]);
      expect(updated).toEqual([]);
      expect(context.previousLibrary).toEqual([]);
    });

    it('handles notes with special characters in id', async () => {
      mockRatingUpdate.mockResolvedValueOnce({ success: true, rating: 3 });
      callHook();

      await mutationConfig.mutationFn({ id: 'note/with/slashes', rating: 3 });

      expect(mockRatingUpdate).toHaveBeenCalledWith('note/with/slashes', { rating: 3 });
    });

    it('handles rapid consecutive rating changes for the same note', () => {
      const result = callHook();

      result.setRating('note-1', 1);
      result.setRating('note-1', 3);
      result.setRating('note-1', 5);

      expect(mutateFn).toHaveBeenCalledTimes(3);
      expect(mutateFn).toHaveBeenNthCalledWith(1, { id: 'note-1', rating: 1 });
      expect(mutateFn).toHaveBeenNthCalledWith(2, { id: 'note-1', rating: 3 });
      expect(mutateFn).toHaveBeenNthCalledWith(3, { id: 'note-1', rating: 5 });
    });

    it('optimistic update preserves all notes in library', async () => {
      const largeLibrary = Array.from({ length: 50 }, (_, i) => ({
        ...sampleLibrary[0],
        id: `note-${i}`,
        title: `Book ${i}`,
        rating: i % 5 === 0 ? null : (i % 5),
      }));
      mockGetQueryData.mockReturnValueOnce(largeLibrary);
      callHook();

      await mutationConfig.onMutate({ id: 'note-25', rating: 5 });

      const updater = mockSetQueriesData.mock.calls[0][1];
      const updated = updater(largeLibrary);

      expect(updated).toHaveLength(50);
      expect(updated.find((n: { id: string }) => n.id === 'note-25').rating).toBe(5);
      // Verify others unchanged
      expect(updated.find((n: { id: string }) => n.id === 'note-0').rating).toBeNull();
      expect(updated.find((n: { id: string }) => n.id === 'note-1').rating).toBe(1);
    });

    it('setting rating on unrated note (null → number)', async () => {
      mockGetQueryData.mockReturnValueOnce([...sampleLibrary]);
      callHook();

      // note-2 has rating: null
      await mutationConfig.onMutate({ id: 'note-2', rating: 4 });

      const updater = mockSetQueriesData.mock.calls[0][1];
      const updated = updater([...sampleLibrary]);

      expect(updated.find((n: { id: string }) => n.id === 'note-2').rating).toBe(4);
    });
  });
});
