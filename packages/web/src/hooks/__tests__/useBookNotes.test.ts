import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── API mock ────────────────────────────────────────────────────────────

const mockBookNotesGet = vi.fn();
const mockBookNotesUpdate = vi.fn();

vi.mock('../../lib/api', () => ({
  api: {
    bookNotes: {
      get: (...args: unknown[]) => mockBookNotesGet(...args),
      update: (...args: unknown[]) => mockBookNotesUpdate(...args),
    },
  },
}));

// ── React Query mock ────────────────────────────────────────────────────

const mockSetQueryData = vi.fn();

const mockQueryClient = {
  setQueryData: mockSetQueryData,
};

type QueryConfig = {
  queryKey: unknown[];
  queryFn: () => Promise<unknown>;
  enabled: boolean;
};

type MutationConfig = {
  mutationFn: (notes: string | null) => Promise<{ success: boolean; notes: string | null }>;
  onSuccess: (result: { success: boolean; notes: string | null }) => void;
};

let queryConfig: QueryConfig;
let mutationConfig: MutationConfig;
let mutateFn: ReturnType<typeof vi.fn>;
let queryData: { notes: string | null } | undefined = undefined;
let queryIsLoading = false;
let queryError: Error | null = null;
let mutationIsPending = false;

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => mockQueryClient,
  useQuery: (config: QueryConfig) => {
    queryConfig = config;
    return {
      data: queryData,
      isLoading: queryIsLoading,
      error: queryError,
    };
  },
  useMutation: (config: MutationConfig) => {
    mutationConfig = config;
    mutateFn = vi.fn();
    return {
      mutate: mutateFn,
      isPending: mutationIsPending,
    };
  },
}));

// ── Import under test (after mocks) ────────────────────────────────────

import { useBookNotes } from '../useBookNotes';

// ── Helpers ─────────────────────────────────────────────────────────────

function callHook(noteId?: string) {
  queryData = undefined;
  queryIsLoading = false;
  queryError = null;
  mutationIsPending = false;
  return useBookNotes(noteId);
}

// ── Tests ───────────────────────────────────────────────────────────────

describe('useBookNotes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryData = undefined;
    queryIsLoading = false;
    queryError = null;
    mutationIsPending = false;
  });

  describe('initialization', () => {
    it('returns the expected API shape', () => {
      const result = callHook('note-1');

      expect(result).toHaveProperty('notes');
      expect(result).toHaveProperty('isLoading');
      expect(result).toHaveProperty('error');
      expect(result).toHaveProperty('updateNotes');
      expect(result).toHaveProperty('isUpdating');
    });

    it('defaults notes to null when no data is loaded', () => {
      const result = callHook('note-1');

      expect(result.notes).toBeNull();
    });

    it('defaults isLoading to false', () => {
      const result = callHook('note-1');

      expect(result.isLoading).toBe(false);
    });

    it('defaults error to null', () => {
      const result = callHook('note-1');

      expect(result.error).toBeNull();
    });

    it('defaults isUpdating to false', () => {
      const result = callHook('note-1');

      expect(result.isUpdating).toBe(false);
    });
  });

  describe('query configuration', () => {
    it('uses correct query key with noteId', () => {
      callHook('note-42');

      expect(queryConfig.queryKey).toEqual(['bookNotes', 'note-42']);
    });

    it('is enabled when noteId is provided', () => {
      callHook('note-1');

      expect(queryConfig.enabled).toBe(true);
    });

    it('is disabled when noteId is undefined', () => {
      callHook(undefined);

      expect(queryConfig.enabled).toBe(false);
    });

    it('is disabled when noteId is empty string', () => {
      callHook('');

      expect(queryConfig.enabled).toBe(false);
    });

    it('calls api.bookNotes.get with the noteId', async () => {
      mockBookNotesGet.mockResolvedValueOnce({ notes: 'test notes' });
      callHook('note-1');

      await queryConfig.queryFn();

      expect(mockBookNotesGet).toHaveBeenCalledWith('note-1');
    });
  });

  describe('data states', () => {
    it('returns notes from query data', () => {
      queryData = { notes: 'Some notes about the book' };
      const result = useBookNotes('note-1');

      expect(result.notes).toBe('Some notes about the book');
    });

    it('returns null when data has null notes', () => {
      queryData = { notes: null };
      const result = useBookNotes('note-1');

      expect(result.notes).toBeNull();
    });

    it('reflects loading state', () => {
      queryIsLoading = true;
      const result = useBookNotes('note-1');

      expect(result.isLoading).toBe(true);
    });

    it('reflects error state', () => {
      const testError = new Error('Failed to fetch');
      queryError = testError;
      const result = useBookNotes('note-1');

      expect(result.error).toBe(testError);
    });

    it('reflects mutation pending state', () => {
      mutationIsPending = true;
      const result = useBookNotes('note-1');

      expect(result.isUpdating).toBe(true);
    });
  });

  describe('mutationFn', () => {
    it('calls api.bookNotes.update with noteId and notes', async () => {
      mockBookNotesUpdate.mockResolvedValueOnce({ success: true, notes: 'updated' });
      callHook('note-1');

      await mutationConfig.mutationFn('updated notes');

      expect(mockBookNotesUpdate).toHaveBeenCalledWith('note-1', { notes: 'updated notes' });
    });

    it('passes null to clear notes', async () => {
      mockBookNotesUpdate.mockResolvedValueOnce({ success: true, notes: null });
      callHook('note-1');

      await mutationConfig.mutationFn(null);

      expect(mockBookNotesUpdate).toHaveBeenCalledWith('note-1', { notes: null });
    });

    it('returns the API response', async () => {
      mockBookNotesUpdate.mockResolvedValueOnce({ success: true, notes: 'new notes' });
      callHook('note-1');

      const result = await mutationConfig.mutationFn('new notes');

      expect(result).toEqual({ success: true, notes: 'new notes' });
    });

    it('propagates API errors', async () => {
      mockBookNotesUpdate.mockRejectedValueOnce(new Error('HTTP 500: Internal Server Error'));
      callHook('note-1');

      await expect(mutationConfig.mutationFn('notes')).rejects.toThrow(
        'HTTP 500: Internal Server Error'
      );
    });

    it('propagates not-found errors', async () => {
      mockBookNotesUpdate.mockRejectedValueOnce(new Error('HTTP 404: Not Found'));
      callHook('note-1');

      await expect(mutationConfig.mutationFn('notes')).rejects.toThrow('HTTP 404: Not Found');
    });
  });

  describe('onSuccess (cache update)', () => {
    it('updates the bookNotes query cache', () => {
      callHook('note-1');

      mutationConfig.onSuccess({ success: true, notes: 'updated notes' });

      expect(mockSetQueryData).toHaveBeenCalledWith(
        ['bookNotes', 'note-1'],
        { notes: 'updated notes' }
      );
    });

    it('updates the bookNotes cache with null notes', () => {
      callHook('note-1');

      mutationConfig.onSuccess({ success: true, notes: null });

      expect(mockSetQueryData).toHaveBeenCalledWith(
        ['bookNotes', 'note-1'],
        { notes: null }
      );
    });

    it('updates the note cache when it exists with bookNotes field', () => {
      callHook('note-1');

      mutationConfig.onSuccess({ success: true, notes: 'updated notes' });

      // Second call should be for the note cache
      expect(mockSetQueryData).toHaveBeenCalledWith(
        ['note', 'note-1'],
        expect.any(Function)
      );

      // Extract the updater and verify it merges bookNotes
      const noteUpdater = mockSetQueryData.mock.calls[1][1];
      const updatedNote = noteUpdater({
        id: 'note-1',
        title: 'Test Book',
        bookNotes: 'old notes',
      });

      expect(updatedNote).toEqual({
        id: 'note-1',
        title: 'Test Book',
        bookNotes: 'updated notes',
      });
    });

    it('does not modify note cache when it has no bookNotes field', () => {
      callHook('note-1');

      mutationConfig.onSuccess({ success: true, notes: 'updated' });

      const noteUpdater = mockSetQueryData.mock.calls[1][1];
      const original = { id: 'note-1', title: 'Test Book' };
      const result = noteUpdater(original);

      expect(result).toBe(original);
    });

    it('returns undefined when note cache is undefined', () => {
      callHook('note-1');

      mutationConfig.onSuccess({ success: true, notes: 'updated' });

      const noteUpdater = mockSetQueryData.mock.calls[1][1];
      const result = noteUpdater(undefined);

      expect(result).toBeUndefined();
    });

    it('returns null when note cache is null', () => {
      callHook('note-1');

      mutationConfig.onSuccess({ success: true, notes: 'updated' });

      const noteUpdater = mockSetQueryData.mock.calls[1][1];
      const result = noteUpdater(null);

      expect(result).toBeNull();
    });

    it('returns non-object values unchanged', () => {
      callHook('note-1');

      mutationConfig.onSuccess({ success: true, notes: 'updated' });

      const noteUpdater = mockSetQueryData.mock.calls[1][1];
      const result = noteUpdater('not-an-object');

      expect(result).toBe('not-an-object');
    });

    it('makes exactly two setQueryData calls on success', () => {
      callHook('note-1');

      mutationConfig.onSuccess({ success: true, notes: 'updated' });

      expect(mockSetQueryData).toHaveBeenCalledTimes(2);
    });
  });

  describe('updateNotes', () => {
    it('exposes the mutation mutate function', () => {
      const result = callHook('note-1');

      expect(result.updateNotes).toBe(mutateFn);
    });
  });

  describe('full update cycle', () => {
    it('update → API success → caches updated', async () => {
      mockBookNotesUpdate.mockResolvedValueOnce({ success: true, notes: 'new notes' });
      callHook('note-1');

      // 1. API call
      const apiResult = await mutationConfig.mutationFn('new notes');
      expect(apiResult).toEqual({ success: true, notes: 'new notes' });

      // 2. onSuccess updates caches
      mutationConfig.onSuccess(apiResult);

      expect(mockSetQueryData).toHaveBeenCalledWith(
        ['bookNotes', 'note-1'],
        { notes: 'new notes' }
      );
      expect(mockSetQueryData).toHaveBeenCalledWith(
        ['note', 'note-1'],
        expect.any(Function)
      );
    });

    it('clear notes → API success → caches cleared', async () => {
      mockBookNotesUpdate.mockResolvedValueOnce({ success: true, notes: null });
      callHook('note-1');

      const apiResult = await mutationConfig.mutationFn(null);
      expect(apiResult).toEqual({ success: true, notes: null });

      mutationConfig.onSuccess(apiResult);

      expect(mockSetQueryData).toHaveBeenCalledWith(
        ['bookNotes', 'note-1'],
        { notes: null }
      );
    });
  });

  describe('edge cases', () => {
    it('handles empty string notes', async () => {
      mockBookNotesUpdate.mockResolvedValueOnce({ success: true, notes: '' });
      callHook('note-1');

      await mutationConfig.mutationFn('');

      expect(mockBookNotesUpdate).toHaveBeenCalledWith('note-1', { notes: '' });
    });

    it('handles very long notes content', async () => {
      const longNotes = 'a'.repeat(100000);
      mockBookNotesUpdate.mockResolvedValueOnce({ success: true, notes: longNotes });
      callHook('note-1');

      await mutationConfig.mutationFn(longNotes);

      expect(mockBookNotesUpdate).toHaveBeenCalledWith('note-1', { notes: longNotes });
    });

    it('handles notes with special characters', async () => {
      const specialNotes = '# Title\n\n**Bold** _italic_ `code`\n\n> Quote\n\n- List item';
      mockBookNotesUpdate.mockResolvedValueOnce({ success: true, notes: specialNotes });
      callHook('note-1');

      await mutationConfig.mutationFn(specialNotes);

      expect(mockBookNotesUpdate).toHaveBeenCalledWith('note-1', { notes: specialNotes });
    });

    it('handles noteId with special characters in query key', () => {
      callHook('note/with/slashes');

      expect(queryConfig.queryKey).toEqual(['bookNotes', 'note/with/slashes']);
    });

    it('uses correct noteId for different hook instances', () => {
      callHook('note-A');
      expect(queryConfig.queryKey).toEqual(['bookNotes', 'note-A']);

      callHook('note-B');
      expect(queryConfig.queryKey).toEqual(['bookNotes', 'note-B']);
    });

    it('onSuccess note updater preserves other fields on note object', () => {
      callHook('note-1');

      mutationConfig.onSuccess({ success: true, notes: 'updated' });

      const noteUpdater = mockSetQueryData.mock.calls[1][1];
      const original = {
        id: 'note-1',
        title: 'Test Book',
        author: 'Author',
        bookNotes: 'old notes',
        progress: 0.5,
        highlights: [],
      };
      const updated = noteUpdater(original);

      expect(updated.id).toBe('note-1');
      expect(updated.title).toBe('Test Book');
      expect(updated.author).toBe('Author');
      expect(updated.progress).toBe(0.5);
      expect(updated.highlights).toEqual([]);
      expect(updated.bookNotes).toBe('updated');
    });
  });
});
