import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mocks ──────────────────────────────────────────────────────────────

vi.mock('../../lib/api', () => ({
  api: {
    progress: {
      update: vi.fn(),
    },
  },
}));

// Track React state and refs through controlled mocks
let stateValues: Record<string, unknown> = {};
const setStateFns: Record<string, (v: unknown) => void> = {};
let refValues: Record<string, { current: unknown }> = {};
let refCounter = 0;
let stateCounter = 0;

// Store the useMutation config so we can invoke mutationFn / callbacks directly
let mutationConfig: {
  mutationFn: (vars: { id: string; progress: number; lastOpenedCfi?: string }) => Promise<unknown>;
  onSuccess: (data: unknown, vars: { id: string; progress: number; lastOpenedCfi?: string }) => void;
  onError: () => void;
};
let mutateFn: ReturnType<typeof vi.fn>;
let mutationIsPending = false;

const mockInvalidateQueries = vi.fn();
const mockSetQueryData = vi.fn();

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    setQueryData: mockSetQueryData,
    invalidateQueries: mockInvalidateQueries,
  }),
  useMutation: (config: typeof mutationConfig) => {
    mutationConfig = config;
    mutateFn = vi.fn((vars, options) => {
      // Simulate react-query calling mutationFn and then callbacks
      config.mutationFn(vars).then(
        (data) => {
          config.onSuccess(data, vars);
          options?.onSettled?.();
        },
        () => {
          config.onError();
          options?.onSettled?.();
        }
      );
    });
    return {
      mutate: mutateFn,
      isPending: mutationIsPending,
    };
  },
}));

let refMap: Record<number, { current: unknown }> = {};

vi.mock('react', () => ({
  useCallback: (fn: Function, _deps: unknown[]) => fn,
  useRef: (initial: unknown) => {
    const idx = refCounter++;
    if (!refMap[idx]) {
      refMap[idx] = { current: initial };
    }
    // Assign named refs based on order:
    // 0 = timeoutRef, 1 = pendingProgress, 2 = isSavingRef, 3 = savedTimeoutRef
    const names = ['timeoutRef', 'pendingProgress', 'isSavingRef', 'savedTimeoutRef'];
    if (names[idx]) {
      refValues[names[idx]] = refMap[idx];
    }
    return refMap[idx];
  },
  useState: (initial: unknown) => {
    const idx = stateCounter++;
    // 0 = saveStatus
    const names = ['saveStatus'];
    const name = names[idx] || `state_${idx}`;
    if (!(name in stateValues)) {
      stateValues[name] = initial;
    }
    const setter = (v: unknown) => {
      stateValues[name] = typeof v === 'function' ? (v as Function)(stateValues[name]) : v;
    };
    setStateFns[name] = setter;
    return [stateValues[name], setter];
  },
}));

import { useProgress } from '../useProgress';
import { api } from '../../lib/api';

const mockedApiUpdate = vi.mocked(api.progress.update);

// ── Helpers ────────────────────────────────────────────────────────────

function resetHookState() {
  stateValues = {};
  refValues = {};
  refMap = {};
  refCounter = 0;
  stateCounter = 0;
  mutationIsPending = false;
}

function callHook(noteId?: string) {
  resetHookState();
  return useProgress(noteId);
}

// ── Tests ──────────────────────────────────────────────────────────────

describe('useProgress', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    resetHookState();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('initialization', () => {
    it('returns the expected API shape', () => {
      const result = callHook('note-1');

      expect(result).toHaveProperty('updateProgress');
      expect(result).toHaveProperty('saveImmediately');
      expect(result).toHaveProperty('hasPendingChanges');
      expect(result).toHaveProperty('isUpdating');
      expect(result).toHaveProperty('saveStatus');
    });

    it('initializes with idle save status', () => {
      const result = callHook('note-1');

      expect(result.saveStatus).toBe('idle');
    });

    it('initializes with no pending changes', () => {
      const result = callHook('note-1');

      expect(result.hasPendingChanges()).toBe(false);
    });

    it('initializes with isUpdating false', () => {
      const result = callHook('note-1');

      expect(result.isUpdating).toBe(false);
    });
  });

  describe('updateProgress', () => {
    it('does nothing when noteId is undefined', () => {
      const result = callHook(undefined);

      result.updateProgress(0.5);

      expect(result.hasPendingChanges()).toBe(false);
    });

    it('stores pending progress data', () => {
      const result = callHook('note-1');

      result.updateProgress(0.75);

      expect(result.hasPendingChanges()).toBe(true);
    });

    it('stores progress with lastOpenedCfi', () => {
      const result = callHook('note-1');

      result.updateProgress(0.5, 'epubcfi(/6/4)');

      expect(result.hasPendingChanges()).toBe(true);
    });

    it('overwrites pending progress with latest value', () => {
      const result = callHook('note-1');

      result.updateProgress(0.25);
      result.updateProgress(0.50);
      result.updateProgress(0.75);

      // Only the last value should be pending
      expect(result.hasPendingChanges()).toBe(true);
      // Underlying ref holds only the latest value
      expect(refValues['pendingProgress'].current).toEqual({
        progress: 0.75,
        lastOpenedCfi: undefined,
      });
    });

    it('debounces the save for 5000ms', () => {
      const result = callHook('note-1');

      result.updateProgress(0.5);

      // Before debounce completes
      expect(mutateFn).not.toHaveBeenCalled();

      // After debounce
      vi.advanceTimersByTime(5000);

      expect(mutateFn).toHaveBeenCalledTimes(1);
      expect(mutateFn).toHaveBeenCalledWith(
        { id: 'note-1', progress: 0.5, lastOpenedCfi: undefined },
        expect.objectContaining({ onSettled: expect.any(Function) }),
      );
    });

    it('resets debounce timer on each call', () => {
      const result = callHook('note-1');

      result.updateProgress(0.25);
      vi.advanceTimersByTime(3000);

      // Another update resets the timer
      result.updateProgress(0.50);
      vi.advanceTimersByTime(3000);

      // 6000ms total but only 3000ms since last update — should not have saved yet
      expect(mutateFn).not.toHaveBeenCalled();

      // Complete the debounce from the second call
      vi.advanceTimersByTime(2000);

      expect(mutateFn).toHaveBeenCalledTimes(1);
      expect(mutateFn).toHaveBeenCalledWith(
        { id: 'note-1', progress: 0.50, lastOpenedCfi: undefined },
        expect.any(Object),
      );
    });

    it('clears pending progress after debounce fires', () => {
      const result = callHook('note-1');

      result.updateProgress(0.5);
      vi.advanceTimersByTime(5000);

      expect(refValues['pendingProgress'].current).toBeNull();
    });

    it('sets save status to pending on first update', () => {
      const result = callHook('note-1');

      result.updateProgress(0.5);

      expect(stateValues['saveStatus']).toBe('pending');
    });
  });

  describe('saveImmediately', () => {
    it('does nothing when noteId is undefined', () => {
      const result = callHook(undefined);

      result.saveImmediately();

      expect(mutateFn).not.toHaveBeenCalled();
    });

    it('does nothing when no pending changes', () => {
      const result = callHook('note-1');

      result.saveImmediately();

      expect(mutateFn).not.toHaveBeenCalled();
    });

    it('flushes pending progress immediately', () => {
      const result = callHook('note-1');

      result.updateProgress(0.75, 'epubcfi(/6/8)');

      // Don't wait for debounce
      result.saveImmediately();

      expect(mutateFn).toHaveBeenCalledWith(
        { id: 'note-1', progress: 0.75, lastOpenedCfi: 'epubcfi(/6/8)' },
        expect.any(Object),
      );
    });

    it('clears pending data after immediate save', () => {
      const result = callHook('note-1');

      result.updateProgress(0.75);
      result.saveImmediately();

      expect(refValues['pendingProgress'].current).toBeNull();
    });

    it('cancels the debounce timer', () => {
      const result = callHook('note-1');

      result.updateProgress(0.5);
      result.saveImmediately();

      // Clear mutate call count from saveImmediately
      mutateFn.mockClear();

      // Debounce timer fires but there's nothing left to save
      vi.advanceTimersByTime(5000);

      expect(mutateFn).not.toHaveBeenCalled();
    });

    it('saves the most recent value, not earlier ones', () => {
      const result = callHook('note-1');

      result.updateProgress(0.25);
      result.updateProgress(0.50);
      result.updateProgress(0.75);

      result.saveImmediately();

      expect(mutateFn).toHaveBeenCalledWith(
        { id: 'note-1', progress: 0.75, lastOpenedCfi: undefined },
        expect.any(Object),
      );
    });
  });

  describe('executeSave guard', () => {
    it('does not double-save while a save is in progress', () => {
      const result = callHook('note-1');

      // First save
      result.updateProgress(0.5);
      vi.advanceTimersByTime(5000);

      // isSavingRef is set to true during mutation
      // The onSettled callback hasn't fired yet so isSavingRef.current is true
      expect(refValues['isSavingRef'].current).toBe(true);

      // Second save attempt while first is in progress
      result.updateProgress(0.75);
      vi.advanceTimersByTime(5000);

      // Should not call mutate again because isSavingRef is true
      expect(mutateFn).toHaveBeenCalledTimes(1);
    });
  });

  describe('mutation retry logic', () => {
    it('succeeds on first attempt when API call works', async () => {
      callHook('note-1');

      mockedApiUpdate.mockResolvedValueOnce({
        success: true,
        progress: 0.5,
        lastRead: '2025-01-15T00:00:00.000Z',
      });

      const result = await mutationConfig.mutationFn({
        id: 'note-1',
        progress: 0.5,
      });

      expect(result).toEqual({
        success: true,
        progress: 0.5,
        lastRead: '2025-01-15T00:00:00.000Z',
      });
      expect(mockedApiUpdate).toHaveBeenCalledTimes(1);
    });

    it('retries up to 3 times on server errors', async () => {
      callHook('note-1');

      mockedApiUpdate
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Server error'))
        .mockResolvedValueOnce({
          success: true,
          progress: 0.5,
          lastRead: '2025-01-15T00:00:00.000Z',
        });

      const promise = mutationConfig.mutationFn({
        id: 'note-1',
        progress: 0.5,
      });

      // Advance past retry delays (1000ms + 2000ms)
      await vi.advanceTimersByTimeAsync(5000);

      const result = await promise;

      expect(result).toEqual({
        success: true,
        progress: 0.5,
        lastRead: '2025-01-15T00:00:00.000Z',
      });
      expect(mockedApiUpdate).toHaveBeenCalledTimes(3);
    });

    it('throws after exhausting all retry attempts', async () => {
      callHook('note-1');

      mockedApiUpdate
        .mockRejectedValueOnce(new Error('Server error 1'))
        .mockRejectedValueOnce(new Error('Server error 2'))
        .mockRejectedValueOnce(new Error('Server error 3'));

      const promise = mutationConfig.mutationFn({ id: 'note-1', progress: 0.5 })
        .catch((e: Error) => e);

      await vi.advanceTimersByTimeAsync(5000);

      const error = await promise;
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe('Server error 3');

      expect(mockedApiUpdate).toHaveBeenCalledTimes(3);
    });

    it('does not retry on 4xx client errors', async () => {
      callHook('note-1');
      vi.useRealTimers();

      mockedApiUpdate.mockRejectedValueOnce(new Error('HTTP 404: Not Found'));

      await expect(
        mutationConfig.mutationFn({ id: 'note-1', progress: 0.5 })
      ).rejects.toThrow('HTTP 404: Not Found');

      // Should only try once — no retry on client errors
      expect(mockedApiUpdate).toHaveBeenCalledTimes(1);
    });

    it('does not retry on HTTP 400 errors', async () => {
      callHook('note-1');
      vi.useRealTimers();

      mockedApiUpdate.mockRejectedValueOnce(new Error('HTTP 400: Bad Request'));

      await expect(
        mutationConfig.mutationFn({ id: 'note-1', progress: 0.5 })
      ).rejects.toThrow('HTTP 400: Bad Request');

      expect(mockedApiUpdate).toHaveBeenCalledTimes(1);
    });

    it('wraps non-Error exceptions in an Error', async () => {
      callHook('note-1');

      mockedApiUpdate
        .mockRejectedValueOnce('string error')
        .mockRejectedValueOnce('string error')
        .mockRejectedValueOnce('string error');

      const promise = mutationConfig.mutationFn({ id: 'note-1', progress: 0.5 })
        .catch((e: Error) => e);

      await vi.advanceTimersByTimeAsync(5000);

      const error = await promise;
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe('Unknown error');

      expect(mockedApiUpdate).toHaveBeenCalledTimes(3);
    });

    it('passes lastOpenedCfi through to the API', async () => {
      callHook('note-1');

      mockedApiUpdate.mockResolvedValueOnce({
        success: true,
        progress: 0.5,
        lastRead: '2025-01-15T00:00:00.000Z',
        lastOpenedCfi: 'epubcfi(/6/4)',
      });

      await mutationConfig.mutationFn({
        id: 'note-1',
        progress: 0.5,
        lastOpenedCfi: 'epubcfi(/6/4)',
      });

      expect(mockedApiUpdate).toHaveBeenCalledWith('note-1', {
        progress: 0.5,
        lastOpenedCfi: 'epubcfi(/6/4)',
      });
    });

    it('uses exponential backoff between retries', async () => {
      callHook('note-1');

      const delays: number[] = [];
      const origSetTimeout = globalThis.setTimeout;
      const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout').mockImplementation(
        ((fn: Function, delay?: number, ...args: unknown[]) => {
          if (delay && delay >= 1000) {
            delays.push(delay);
          }
          return origSetTimeout(fn, 0, ...args);
        }) as typeof setTimeout,
      );

      mockedApiUpdate
        .mockRejectedValueOnce(new Error('Server error'))
        .mockRejectedValueOnce(new Error('Server error'))
        .mockRejectedValueOnce(new Error('Server error'));

      const promise = mutationConfig.mutationFn({ id: 'note-1', progress: 0.5 })
        .catch(() => { /* expected rejection */ });

      // Flush all microtasks and immediate timers
      await vi.advanceTimersByTimeAsync(5000);

      await promise;

      // Exponential backoff: 1000 * 2^0 = 1000, 1000 * 2^1 = 2000
      // No delay after the last attempt
      expect(delays).toEqual([1000, 2000]);

      setTimeoutSpy.mockRestore();
    });
  });

  describe('onSuccess callback', () => {
    it('updates query cache with new progress data', () => {
      callHook('note-1');

      const successData = {
        success: true,
        progress: 0.75,
        lastRead: '2025-01-15T10:00:00.000Z',
      };

      mutationConfig.onSuccess(successData, {
        id: 'note-1',
        progress: 0.75,
      });

      expect(mockSetQueryData).toHaveBeenCalledWith(
        ['note', 'note-1'],
        expect.any(Function),
      );
    });

    it('merges progress and lastRead into existing query data', () => {
      callHook('note-1');

      const successData = {
        progress: 0.75,
        lastRead: '2025-01-15T10:00:00.000Z',
      };

      mutationConfig.onSuccess(successData, { id: 'note-1', progress: 0.75 });

      // Get the updater function and verify it merges correctly
      const updater = mockSetQueryData.mock.calls[0][1];
      const oldData = { title: 'Test Book', progress: 0.5, lastRead: '2025-01-14' };
      const newData = updater(oldData);

      expect(newData).toEqual({
        title: 'Test Book',
        progress: 0.75,
        lastRead: '2025-01-15T10:00:00.000Z',
      });
    });

    it('includes lastOpenedCfi in merged data when present', () => {
      callHook('note-1');

      const successData = {
        progress: 0.5,
        lastRead: '2025-01-15T10:00:00.000Z',
        lastOpenedCfi: 'epubcfi(/6/4)',
      };

      mutationConfig.onSuccess(successData, {
        id: 'note-1',
        progress: 0.5,
        lastOpenedCfi: 'epubcfi(/6/4)',
      });

      const updater = mockSetQueryData.mock.calls[0][1];
      const oldData = { title: 'Test', progress: 0.25, lastRead: '2025-01-14' };
      const newData = updater(oldData);

      expect(newData).toEqual({
        title: 'Test',
        progress: 0.5,
        lastRead: '2025-01-15T10:00:00.000Z',
        lastOpenedCfi: 'epubcfi(/6/4)',
      });
    });

    it('does not include lastOpenedCfi when not in response', () => {
      callHook('note-1');

      const successData = {
        progress: 0.5,
        lastRead: '2025-01-15T10:00:00.000Z',
      };

      mutationConfig.onSuccess(successData, { id: 'note-1', progress: 0.5 });

      const updater = mockSetQueryData.mock.calls[0][1];
      const oldData = {
        title: 'Test',
        progress: 0.25,
        lastRead: '2025-01-14',
        lastOpenedCfi: 'old-cfi',
      };
      const newData = updater(oldData);

      // Should keep old CFI since response didn't include one
      expect(newData.lastOpenedCfi).toBe('old-cfi');
    });

    it('returns old data unchanged if it does not have a progress field', () => {
      callHook('note-1');

      mutationConfig.onSuccess(
        { progress: 0.5, lastRead: '2025-01-15' },
        { id: 'note-1', progress: 0.5 },
      );

      const updater = mockSetQueryData.mock.calls[0][1];

      // Non-object data
      expect(updater(null)).toBeNull();
      expect(updater(undefined)).toBeUndefined();

      // Object without progress field
      const noProgress = { title: 'Test' };
      expect(updater(noProgress)).toBe(noProgress);
    });

    it('invalidates library queries after successful save', () => {
      callHook('note-1');

      mutationConfig.onSuccess(
        { progress: 0.5, lastRead: '2025-01-15' },
        { id: 'note-1', progress: 0.5 },
      );

      expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['library'] });
    });

    it('transitions save status to saved then back to idle', () => {
      callHook('note-1');

      mutationConfig.onSuccess(
        { progress: 0.5, lastRead: '2025-01-15' },
        { id: 'note-1', progress: 0.5 },
      );

      expect(stateValues['saveStatus']).toBe('saved');

      // After 2000ms, should return to idle
      vi.advanceTimersByTime(2000);

      expect(stateValues['saveStatus']).toBe('idle');
    });
  });

  describe('onError callback', () => {
    it('sets save status to error', () => {
      callHook('note-1');

      mutationConfig.onError();

      expect(stateValues['saveStatus']).toBe('error');
    });

    it('resets save status to idle after 3000ms', () => {
      callHook('note-1');

      mutationConfig.onError();

      expect(stateValues['saveStatus']).toBe('error');

      vi.advanceTimersByTime(3000);

      expect(stateValues['saveStatus']).toBe('idle');
    });
  });

  describe('hasPendingChanges', () => {
    it('returns false initially', () => {
      const result = callHook('note-1');

      expect(result.hasPendingChanges()).toBe(false);
    });

    it('returns true after updateProgress', () => {
      const result = callHook('note-1');

      result.updateProgress(0.5);

      expect(result.hasPendingChanges()).toBe(true);
    });

    it('returns false after saveImmediately flushes', () => {
      const result = callHook('note-1');

      result.updateProgress(0.5);
      result.saveImmediately();

      expect(result.hasPendingChanges()).toBe(false);
    });

    it('returns false after debounce fires', () => {
      const result = callHook('note-1');

      result.updateProgress(0.5);
      vi.advanceTimersByTime(5000);

      expect(result.hasPendingChanges()).toBe(false);
    });
  });
});
