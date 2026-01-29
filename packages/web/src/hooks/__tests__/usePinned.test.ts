import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── API mock ────────────────────────────────────────────────────────────

const mockPinUpdate = vi.fn();

vi.mock('../../lib/api', () => ({
  api: {
    pin: {
      update: (...args: unknown[]) => mockPinUpdate(...args),
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
  mutationFn: (vars: { id: string; pinned: boolean }) => Promise<unknown>;
  onMutate: (vars: { id: string; pinned: boolean }) => Promise<{ previousLibrary: unknown }>;
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

import { usePinned } from '../usePinned';

// ── Helpers ─────────────────────────────────────────────────────────────

function callHook() {
  mutationIsPending = false;
  return usePinned();
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

describe('usePinned', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mutationIsPending = false;
  });

  describe('initialization', () => {
    it('returns the expected API shape', () => {
      const result = callHook();

      expect(result).toHaveProperty('togglePin');
      expect(result).toHaveProperty('isPending');
      expect(typeof result.togglePin).toBe('function');
      expect(typeof result.isPending).toBe('boolean');
    });

    it('initializes with isPending false', () => {
      const result = callHook();

      expect(result.isPending).toBe(false);
    });

    it('reflects isPending from mutation state', () => {
      mutationIsPending = true;
      const result = usePinned();

      expect(result.isPending).toBe(true);
    });
  });

  describe('togglePin', () => {
    it('calls mutate with toggled pin value (false → true)', () => {
      const result = callHook();

      result.togglePin('note-1', false);

      expect(mutateFn).toHaveBeenCalledWith({ id: 'note-1', pinned: true });
    });

    it('calls mutate with toggled pin value (true → false)', () => {
      const result = callHook();

      result.togglePin('note-2', true);

      expect(mutateFn).toHaveBeenCalledWith({ id: 'note-2', pinned: false });
    });

    it('can be called multiple times for different notes', () => {
      const result = callHook();

      result.togglePin('note-1', false);
      result.togglePin('note-2', true);
      result.togglePin('note-3', false);

      expect(mutateFn).toHaveBeenCalledTimes(3);
      expect(mutateFn).toHaveBeenNthCalledWith(1, { id: 'note-1', pinned: true });
      expect(mutateFn).toHaveBeenNthCalledWith(2, { id: 'note-2', pinned: false });
      expect(mutateFn).toHaveBeenNthCalledWith(3, { id: 'note-3', pinned: true });
    });
  });

  describe('mutationFn', () => {
    it('calls api.pin.update with id and pinned value', async () => {
      mockPinUpdate.mockResolvedValueOnce({ success: true, pinned: true });
      callHook();

      await mutationConfig.mutationFn({ id: 'note-1', pinned: true });

      expect(mockPinUpdate).toHaveBeenCalledWith('note-1', { pinned: true });
    });

    it('returns API response on success', async () => {
      mockPinUpdate.mockResolvedValueOnce({ success: true, pinned: false });
      callHook();

      const result = await mutationConfig.mutationFn({ id: 'note-2', pinned: false });

      expect(result).toEqual({ success: true, pinned: false });
    });

    it('propagates API errors', async () => {
      mockPinUpdate.mockRejectedValueOnce(new Error('HTTP 500: Internal Server Error'));
      callHook();

      await expect(
        mutationConfig.mutationFn({ id: 'note-1', pinned: true })
      ).rejects.toThrow('HTTP 500: Internal Server Error');
    });

    it('propagates not-found errors', async () => {
      mockPinUpdate.mockRejectedValueOnce(new Error('HTTP 404: Not Found'));
      callHook();

      await expect(
        mutationConfig.mutationFn({ id: 'nonexistent', pinned: true })
      ).rejects.toThrow('HTTP 404: Not Found');
    });
  });

  describe('onMutate (optimistic update)', () => {
    it('cancels outgoing library queries', async () => {
      callHook();

      await mutationConfig.onMutate({ id: 'note-1', pinned: true });

      expect(mockCancelQueries).toHaveBeenCalledWith({ queryKey: ['library'] });
    });

    it('snapshots the previous library data', async () => {
      const previousData = [...sampleLibrary];
      mockGetQueryData.mockReturnValueOnce(previousData);
      callHook();

      const context = await mutationConfig.onMutate({ id: 'note-1', pinned: true });

      expect(mockGetQueryData).toHaveBeenCalledWith(['library']);
      expect(context.previousLibrary).toBe(previousData);
    });

    it('optimistically updates pinned state in library cache', async () => {
      mockGetQueryData.mockReturnValueOnce([...sampleLibrary]);
      callHook();

      await mutationConfig.onMutate({ id: 'note-1', pinned: true });

      expect(mockSetQueriesData).toHaveBeenCalledWith(
        { queryKey: ['library'] },
        expect.any(Function),
      );

      // Extract the updater function and verify it works correctly
      const updater = mockSetQueriesData.mock.calls[0][1];
      const updated = updater([...sampleLibrary]);

      // note-1 should now be pinned
      expect(updated.find((n: { id: string }) => n.id === 'note-1').pinned).toBe(true);
      // Other notes should be unchanged
      expect(updated.find((n: { id: string }) => n.id === 'note-2').pinned).toBe(true);
      expect(updated.find((n: { id: string }) => n.id === 'note-3').pinned).toBe(false);
    });

    it('optimistically unpins a pinned note', async () => {
      mockGetQueryData.mockReturnValueOnce([...sampleLibrary]);
      callHook();

      await mutationConfig.onMutate({ id: 'note-2', pinned: false });

      const updater = mockSetQueriesData.mock.calls[0][1];
      const updated = updater([...sampleLibrary]);

      expect(updated.find((n: { id: string }) => n.id === 'note-2').pinned).toBe(false);
      // Others unchanged
      expect(updated.find((n: { id: string }) => n.id === 'note-1').pinned).toBe(false);
    });

    it('does not modify other properties of the updated note', async () => {
      mockGetQueryData.mockReturnValueOnce([...sampleLibrary]);
      callHook();

      await mutationConfig.onMutate({ id: 'note-2', pinned: false });

      const updater = mockSetQueriesData.mock.calls[0][1];
      const updated = updater([...sampleLibrary]);

      const note2 = updated.find((n: { id: string }) => n.id === 'note-2');
      expect(note2.title).toBe('Book Two');
      expect(note2.author).toBe('Author B');
      expect(note2.progress).toBe(1.0);
      expect(note2.rating).toBeNull();
      expect(note2.collections).toEqual(['fiction']);
    });

    it('handles undefined library data gracefully', async () => {
      mockGetQueryData.mockReturnValueOnce(undefined);
      callHook();

      const context = await mutationConfig.onMutate({ id: 'note-1', pinned: true });

      expect(context.previousLibrary).toBeUndefined();

      // The updater should handle undefined input
      const updater = mockSetQueriesData.mock.calls[0][1];
      expect(updater(undefined)).toBeUndefined();
    });

    it('returns context with previous library for rollback', async () => {
      const previousData = [...sampleLibrary];
      mockGetQueryData.mockReturnValueOnce(previousData);
      callHook();

      const context = await mutationConfig.onMutate({ id: 'note-1', pinned: true });

      expect(context).toEqual({ previousLibrary: previousData });
    });

    it('handles note not found in library (no match)', async () => {
      mockGetQueryData.mockReturnValueOnce([...sampleLibrary]);
      callHook();

      await mutationConfig.onMutate({ id: 'nonexistent-note', pinned: true });

      const updater = mockSetQueriesData.mock.calls[0][1];
      const updated = updater([...sampleLibrary]);

      // All notes should be unchanged
      expect(updated).toEqual(sampleLibrary);
    });
  });

  describe('onError (rollback)', () => {
    it('restores previous library data on error', () => {
      const previousData = [...sampleLibrary];
      callHook();

      mutationConfig.onError(
        new Error('Server error'),
        { id: 'note-1', pinned: true },
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
        { id: 'note-1', pinned: true },
        undefined,
      );

      expect(mockSetQueriesData).not.toHaveBeenCalled();
    });

    it('does not rollback when previousLibrary is undefined', () => {
      callHook();

      mutationConfig.onError(
        new Error('Server error'),
        { id: 'note-1', pinned: true },
        { previousLibrary: undefined as unknown },
      );

      expect(mockSetQueriesData).not.toHaveBeenCalled();
    });

    it('restores with the exact snapshot data (not mutated)', () => {
      const previousData = [
        { ...sampleLibrary[0], pinned: false },
        { ...sampleLibrary[1], pinned: true },
      ];
      callHook();

      mutationConfig.onError(
        new Error('Network error'),
        { id: 'note-1', pinned: true },
        { previousLibrary: previousData },
      );

      const restoredData = mockSetQueriesData.mock.calls[0][1];
      expect(restoredData[0].pinned).toBe(false);
      expect(restoredData[1].pinned).toBe(true);
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

      // First the error handler runs (rollback)
      mutationConfig.onError(
        new Error('fail'),
        { id: 'note-1', pinned: true },
        { previousLibrary: sampleLibrary },
      );

      vi.clearAllMocks();

      // Then onSettled fires
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
    it('pin: optimistic update → API success → refetch', async () => {
      mockGetQueryData.mockReturnValueOnce([...sampleLibrary]);
      mockPinUpdate.mockResolvedValueOnce({ success: true, pinned: true });
      callHook();

      // 1. Optimistic update
      const context = await mutationConfig.onMutate({ id: 'note-1', pinned: true });

      expect(mockCancelQueries).toHaveBeenCalledWith({ queryKey: ['library'] });
      expect(mockSetQueriesData).toHaveBeenCalled();

      const updater = mockSetQueriesData.mock.calls[0][1];
      const optimisticState = updater([...sampleLibrary]);
      expect(optimisticState.find((n: { id: string }) => n.id === 'note-1').pinned).toBe(true);

      // 2. API succeeds
      const result = await mutationConfig.mutationFn({ id: 'note-1', pinned: true });
      expect(result).toEqual({ success: true, pinned: true });

      // 3. Refetch
      mutationConfig.onSettled();
      expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['library'] });

      // Context was available for rollback if needed
      expect(context.previousLibrary).toBeDefined();
    });

    it('pin: optimistic update → API failure → rollback → refetch', async () => {
      const snapshot = [...sampleLibrary];
      mockGetQueryData.mockReturnValueOnce(snapshot);
      mockPinUpdate.mockRejectedValueOnce(new Error('Server error'));
      callHook();

      // 1. Optimistic update
      const context = await mutationConfig.onMutate({ id: 'note-1', pinned: true });

      // 2. API fails
      await expect(
        mutationConfig.mutationFn({ id: 'note-1', pinned: true })
      ).rejects.toThrow('Server error');

      // 3. Rollback
      vi.clearAllMocks();
      mutationConfig.onError(
        new Error('Server error'),
        { id: 'note-1', pinned: true },
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

    it('unpin: full cycle with optimistic update', async () => {
      mockGetQueryData.mockReturnValueOnce([...sampleLibrary]);
      mockPinUpdate.mockResolvedValueOnce({ success: true, pinned: false });
      callHook();

      // note-2 starts pinned
      expect(sampleLibrary.find(n => n.id === 'note-2')!.pinned).toBe(true);

      // 1. Optimistic update: unpin note-2
      await mutationConfig.onMutate({ id: 'note-2', pinned: false });

      const updater = mockSetQueriesData.mock.calls[0][1];
      const optimisticState = updater([...sampleLibrary]);
      expect(optimisticState.find((n: { id: string }) => n.id === 'note-2').pinned).toBe(false);

      // 2. API succeeds
      const result = await mutationConfig.mutationFn({ id: 'note-2', pinned: false });
      expect(result).toEqual({ success: true, pinned: false });

      // 3. Refetch
      mutationConfig.onSettled();
      expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['library'] });
    });
  });

  describe('edge cases', () => {
    it('handles empty library cache', async () => {
      mockGetQueryData.mockReturnValueOnce([]);
      callHook();

      const context = await mutationConfig.onMutate({ id: 'note-1', pinned: true });

      const updater = mockSetQueriesData.mock.calls[0][1];
      const updated = updater([]);
      expect(updated).toEqual([]);
      expect(context.previousLibrary).toEqual([]);
    });

    it('handles notes with special characters in id', async () => {
      mockPinUpdate.mockResolvedValueOnce({ success: true, pinned: true });
      callHook();

      await mutationConfig.mutationFn({ id: 'note/with/slashes', pinned: true });

      expect(mockPinUpdate).toHaveBeenCalledWith('note/with/slashes', { pinned: true });
    });

    it('handles rapid consecutive toggles for the same note', () => {
      const result = callHook();

      result.togglePin('note-1', false);  // → pin
      result.togglePin('note-1', true);   // → unpin
      result.togglePin('note-1', false);  // → pin again

      expect(mutateFn).toHaveBeenCalledTimes(3);
      expect(mutateFn).toHaveBeenNthCalledWith(1, { id: 'note-1', pinned: true });
      expect(mutateFn).toHaveBeenNthCalledWith(2, { id: 'note-1', pinned: false });
      expect(mutateFn).toHaveBeenNthCalledWith(3, { id: 'note-1', pinned: true });
    });

    it('optimistic update preserves all notes in library', async () => {
      const largeLibrary = Array.from({ length: 50 }, (_, i) => ({
        ...sampleLibrary[0],
        id: `note-${i}`,
        title: `Book ${i}`,
        pinned: i % 2 === 0,
      }));
      mockGetQueryData.mockReturnValueOnce(largeLibrary);
      callHook();

      await mutationConfig.onMutate({ id: 'note-25', pinned: true });

      const updater = mockSetQueriesData.mock.calls[0][1];
      const updated = updater(largeLibrary);

      expect(updated).toHaveLength(50);
      expect(updated.find((n: { id: string }) => n.id === 'note-25').pinned).toBe(true);
      // Verify a few others are unchanged
      expect(updated.find((n: { id: string }) => n.id === 'note-0').pinned).toBe(true);
      expect(updated.find((n: { id: string }) => n.id === 'note-1').pinned).toBe(false);
    });
  });
});
