import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── API mock ────────────────────────────────────────────────────────────

const mockGetContent = vi.fn();
const mockUpdateContent = vi.fn();

vi.mock('../../lib/api', () => ({
  api: {
    library: {
      getContent: (...args: unknown[]) => mockGetContent(...args),
      updateContent: (...args: unknown[]) => mockUpdateContent(...args),
    },
  },
}));

// ── React Query mock ────────────────────────────────────────────────────

const mockInvalidateQueries = vi.fn();
const mockQueryClient = { invalidateQueries: mockInvalidateQueries };

type QueryConfig = {
  queryKey: unknown[];
  queryFn: () => Promise<unknown>;
  enabled?: boolean;
  select?: (data: unknown) => unknown;
};

type MutationConfig = {
  mutationFn: (args: unknown) => Promise<unknown>;
  onSuccess?: () => void;
};

let lastQueryConfig: QueryConfig | undefined;
let lastMutationConfig: MutationConfig | undefined;
let capturedMutateFn: ((args: unknown) => void) | undefined;

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
    const mutateFn = vi.fn((args: unknown) => {
      config.mutationFn(args);
    });
    capturedMutateFn = mutateFn;
    return {
      mutate: mutateFn,
      isPending: false,
      isSuccess: false,
    };
  },
}));

// ── React mocks ─────────────────────────────────────────────────────────

// Track refs created by useRef
interface RefObject<T> {
  current: T;
}

const refs: RefObject<unknown>[] = [];
let refIndex = 0;

const mockUseRef = vi.fn(<T>(initial: T): RefObject<T> => {
  if (refs[refIndex] === undefined) {
    refs[refIndex] = { current: initial };
  }
  return refs[refIndex++] as RefObject<T>;
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockUseCallback = vi.fn(<T extends (...args: any[]) => any>(
  callback: T,
  _deps: unknown[]
): T => callback);

vi.mock('react', () => ({
  useRef: <T>(initial: T) => mockUseRef(initial),
  useCallback: <T extends (...args: unknown[]) => unknown>(
    callback: T,
    deps: unknown[]
  ) => mockUseCallback(callback, deps),
}));

// ── Import under test (after mocks are set up) ─────────────────────────

import { useNoteContent, useUpdateNoteContent } from '../useNoteContent';

// ── Helpers ─────────────────────────────────────────────────────────────

function resetRefs(): void {
  refs.length = 0;
  refIndex = 0;
}

// ── Tests ───────────────────────────────────────────────────────────────

describe('useNoteContent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lastQueryConfig = undefined;
    resetRefs();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('query configuration', () => {
    it('uses the correct query key with note id', () => {
      useNoteContent('note-123');

      expect(lastQueryConfig?.queryKey).toEqual(['noteContent', 'note-123']);
    });

    it('is disabled when id is undefined', () => {
      useNoteContent(undefined);

      expect(lastQueryConfig?.enabled).toBe(false);
    });

    it('is enabled when id is provided', () => {
      useNoteContent('note-123');

      expect(lastQueryConfig?.enabled).toBe(true);
    });

    it('calls api.library.getContent with the note id', async () => {
      mockGetContent.mockResolvedValue({ content: 'test content' });
      useNoteContent('note-456');

      await lastQueryConfig?.queryFn();

      expect(mockGetContent).toHaveBeenCalledWith('note-456');
    });

    it('selects the content field from the response', () => {
      useNoteContent('note-123');
      const mockData = { content: 'selected content', other: 'ignored' };

      const result = lastQueryConfig?.select?.(mockData);

      expect(result).toBe('selected content');
    });
  });
});

describe('useUpdateNoteContent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lastMutationConfig = undefined;
    capturedMutateFn = undefined;
    resetRefs();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('mutation configuration', () => {
    it('calls api.library.updateContent with id and content', async () => {
      mockUpdateContent.mockResolvedValue({});
      useUpdateNoteContent('note-789');

      await lastMutationConfig?.mutationFn('new content');

      expect(mockUpdateContent).toHaveBeenCalledWith('note-789', 'new content');
    });

    it('invalidates highlights query on success', () => {
      useUpdateNoteContent('note-123');

      lastMutationConfig?.onSuccess?.();

      expect(mockInvalidateQueries).toHaveBeenCalledWith({
        queryKey: ['highlights', 'note-123'],
      });
    });
  });

  describe('saveDebounced', () => {
    it('does not call mutate immediately', () => {
      const { saveDebounced } = useUpdateNoteContent('note-1');

      saveDebounced('content 1');

      expect(capturedMutateFn).not.toHaveBeenCalled();
    });

    it('calls mutate after 1500ms debounce', () => {
      const { saveDebounced } = useUpdateNoteContent('note-1');

      saveDebounced('debounced content');
      vi.advanceTimersByTime(1499);
      expect(capturedMutateFn).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1);
      expect(capturedMutateFn).toHaveBeenCalledWith('debounced content');
    });

    it('resets the debounce timer on subsequent calls', () => {
      const { saveDebounced } = useUpdateNoteContent('note-1');

      saveDebounced('first');
      vi.advanceTimersByTime(1000);
      saveDebounced('second');
      vi.advanceTimersByTime(1000);
      saveDebounced('third');

      expect(capturedMutateFn).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1500);
      expect(capturedMutateFn).toHaveBeenCalledTimes(1);
      expect(capturedMutateFn).toHaveBeenCalledWith('third');
    });

    it('only saves the last content when called multiple times', () => {
      const { saveDebounced } = useUpdateNoteContent('note-1');

      saveDebounced('content A');
      saveDebounced('content B');
      saveDebounced('content C');
      vi.advanceTimersByTime(1500);

      expect(capturedMutateFn).toHaveBeenCalledTimes(1);
      expect(capturedMutateFn).toHaveBeenCalledWith('content C');
    });
  });

  describe('saveImmediately', () => {
    it('calls mutate immediately without debounce', () => {
      const { saveImmediately } = useUpdateNoteContent('note-1');

      saveImmediately('immediate content');

      expect(capturedMutateFn).toHaveBeenCalledWith('immediate content');
    });

    it('cancels any pending debounced save', () => {
      const { saveDebounced, saveImmediately } = useUpdateNoteContent('note-1');

      saveDebounced('debounced');
      vi.advanceTimersByTime(500);
      saveImmediately('immediate');

      expect(capturedMutateFn).toHaveBeenCalledTimes(1);
      expect(capturedMutateFn).toHaveBeenCalledWith('immediate');

      // Advance past the original debounce time
      vi.advanceTimersByTime(2000);

      // Still only called once (debounced was cancelled)
      expect(capturedMutateFn).toHaveBeenCalledTimes(1);
    });

    it('saves with correct content even after cancelling debounced', () => {
      const { saveDebounced, saveImmediately } = useUpdateNoteContent('note-1');

      saveDebounced('should be cancelled');
      saveImmediately('should be saved');

      expect(capturedMutateFn).toHaveBeenCalledWith('should be saved');
    });
  });

  describe('cancelPendingSave', () => {
    it('cancels a pending debounced save', () => {
      const { saveDebounced, cancelPendingSave } = useUpdateNoteContent('note-1');

      saveDebounced('will be cancelled');
      vi.advanceTimersByTime(500);
      cancelPendingSave();
      vi.advanceTimersByTime(2000);

      expect(capturedMutateFn).not.toHaveBeenCalled();
    });

    it('is safe to call when no save is pending', () => {
      const { cancelPendingSave } = useUpdateNoteContent('note-1');

      expect(() => cancelPendingSave()).not.toThrow();
    });

    it('can be called multiple times safely', () => {
      const { saveDebounced, cancelPendingSave } = useUpdateNoteContent('note-1');

      saveDebounced('content');
      cancelPendingSave();
      cancelPendingSave();
      cancelPendingSave();

      expect(capturedMutateFn).not.toHaveBeenCalled();
    });
  });

  describe('hasPendingDebounce', () => {
    it('returns false when no save is pending', () => {
      const { hasPendingDebounce } = useUpdateNoteContent('note-1');

      expect(hasPendingDebounce()).toBe(false);
    });

    it('returns true while a debounced save is pending', () => {
      const { saveDebounced, hasPendingDebounce } = useUpdateNoteContent('note-1');

      saveDebounced('content');

      expect(hasPendingDebounce()).toBe(true);
    });

    it('returns false after the debounced save executes', () => {
      const { saveDebounced, hasPendingDebounce } = useUpdateNoteContent('note-1');

      saveDebounced('content');
      vi.advanceTimersByTime(1500);

      expect(hasPendingDebounce()).toBe(false);
    });

    it('returns false after cancelPendingSave', () => {
      const { saveDebounced, cancelPendingSave, hasPendingDebounce } =
        useUpdateNoteContent('note-1');

      saveDebounced('content');
      expect(hasPendingDebounce()).toBe(true);

      cancelPendingSave();
      expect(hasPendingDebounce()).toBe(false);
    });

    it('returns false after saveImmediately cancels pending', () => {
      const { saveDebounced, saveImmediately, hasPendingDebounce } =
        useUpdateNoteContent('note-1');

      saveDebounced('debounced');
      expect(hasPendingDebounce()).toBe(true);

      saveImmediately('immediate');
      expect(hasPendingDebounce()).toBe(false);
    });
  });

  describe('returned state', () => {
    it('returns isPending from mutation', () => {
      const { isPending } = useUpdateNoteContent('note-1');

      expect(isPending).toBe(false);
    });

    it('returns isSuccess from mutation', () => {
      const { isSuccess } = useUpdateNoteContent('note-1');

      expect(isSuccess).toBe(false);
    });
  });

  describe('integration scenarios', () => {
    it('handles rapid typing followed by tab close (saveImmediately)', () => {
      const { saveDebounced, saveImmediately, hasPendingDebounce } =
        useUpdateNoteContent('note-1');

      // Simulate rapid typing
      saveDebounced('H');
      saveDebounced('He');
      saveDebounced('Hel');
      saveDebounced('Hell');
      saveDebounced('Hello');

      expect(hasPendingDebounce()).toBe(true);

      // User closes tab, trigger immediate save
      saveImmediately('Hello');

      expect(capturedMutateFn).toHaveBeenCalledTimes(1);
      expect(capturedMutateFn).toHaveBeenCalledWith('Hello');
      expect(hasPendingDebounce()).toBe(false);
    });

    it('handles user navigating away (cancelPendingSave)', () => {
      const { saveDebounced, cancelPendingSave, hasPendingDebounce } =
        useUpdateNoteContent('note-1');

      // User types something
      saveDebounced('draft content');
      expect(hasPendingDebounce()).toBe(true);

      // User navigates away without wanting to save
      cancelPendingSave();
      expect(hasPendingDebounce()).toBe(false);

      // No save should occur
      vi.advanceTimersByTime(2000);
      expect(capturedMutateFn).not.toHaveBeenCalled();
    });

    it('handles multiple debounced saves that complete naturally', () => {
      const { saveDebounced } = useUpdateNoteContent('note-1');

      saveDebounced('first save');
      vi.advanceTimersByTime(1500);
      expect(capturedMutateFn).toHaveBeenCalledWith('first save');

      vi.clearAllMocks();

      saveDebounced('second save');
      vi.advanceTimersByTime(1500);
      expect(capturedMutateFn).toHaveBeenCalledWith('second save');
    });

    it('handles alternating debounced and immediate saves', () => {
      const { saveDebounced, saveImmediately } = useUpdateNoteContent('note-1');

      saveDebounced('debounced 1');
      vi.advanceTimersByTime(500);
      saveImmediately('immediate 1');
      expect(capturedMutateFn).toHaveBeenCalledWith('immediate 1');

      vi.clearAllMocks();

      saveDebounced('debounced 2');
      vi.advanceTimersByTime(1500);
      expect(capturedMutateFn).toHaveBeenCalledWith('debounced 2');
    });
  });

  describe('edge cases', () => {
    it('handles empty string content', () => {
      const { saveDebounced } = useUpdateNoteContent('note-1');

      saveDebounced('');
      vi.advanceTimersByTime(1500);

      expect(capturedMutateFn).toHaveBeenCalledWith('');
    });

    it('handles very long content', () => {
      const { saveDebounced } = useUpdateNoteContent('note-1');
      const longContent = 'x'.repeat(100000);

      saveDebounced(longContent);
      vi.advanceTimersByTime(1500);

      expect(capturedMutateFn).toHaveBeenCalledWith(longContent);
    });

    it('handles content with special characters', () => {
      const { saveDebounced } = useUpdateNoteContent('note-1');
      const specialContent = '# Heading\n```js\nconsole.log("hello");\n```\n<div>html</div>';

      saveDebounced(specialContent);
      vi.advanceTimersByTime(1500);

      expect(capturedMutateFn).toHaveBeenCalledWith(specialContent);
    });

    it('handles unicode content', () => {
      const { saveDebounced } = useUpdateNoteContent('note-1');
      const unicodeContent = '你好世界 🌍 émojis и другие символы';

      saveDebounced(unicodeContent);
      vi.advanceTimersByTime(1500);

      expect(capturedMutateFn).toHaveBeenCalledWith(unicodeContent);
    });
  });
});
