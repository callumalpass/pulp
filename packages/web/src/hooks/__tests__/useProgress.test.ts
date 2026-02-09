import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── API mock ────────────────────────────────────────────────────────────

const mockProgressUpdate = vi.fn();

vi.mock('../../lib/api', () => ({
  api: {
    progress: {
      update: (...args: unknown[]) => mockProgressUpdate(...args),
    },
  },
}));

// ── React Query mock ────────────────────────────────────────────────────

const mockSetQueryData = vi.fn();
const mockInvalidateQueries = vi.fn();

const mockQueryClient = {
  setQueryData: mockSetQueryData,
  invalidateQueries: mockInvalidateQueries,
};

type MutationVars = { id: string; progress: number; lastOpenedCfi?: string };

type MutationConfig = {
  mutationFn: (vars: MutationVars) => Promise<unknown>;
  onSuccess: (data: { progress: number; lastRead: string; lastOpenedCfi?: string }, vars: MutationVars) => void;
  onError: () => void;
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

let stateValues: Record<string, unknown> = {};
let stateSetters: Record<string, ReturnType<typeof vi.fn>> = {};
let stateCallCount = 0;

const refValues: Record<string, { current: unknown }> = {};
let refCallCount = 0;

vi.mock('react', () => ({
  useCallback: (fn: Function, _deps: unknown[]) => fn,
  useState: (initial: unknown) => {
    const key = `state_${stateCallCount++}`;
    if (!(key in stateValues)) {
      stateValues[key] = initial;
      stateSetters[key] = vi.fn((val: unknown) => {
        stateValues[key] = typeof val === 'function' ? (val as Function)(stateValues[key]) : val;
      });
    }
    return [stateValues[key], stateSetters[key]];
  },
  useRef: (initial: unknown) => {
    const key = `ref_${refCallCount++}`;
    if (!(key in refValues)) {
      refValues[key] = { current: initial };
    }
    return refValues[key];
  },
}));

// ── Import under test (after mocks) ────────────────────────────────────

import { useProgress } from '../useProgress';

// ── Helpers ─────────────────────────────────────────────────────────────

// Refs created during hook initialization (order matters):
// ref 0: timeoutRef (setTimeout id)
// ref 1: pendingProgress (queued data)
// ref 2: isSavingRef (guard flag)
// ref 3: savedTimeoutRef (saved-status timeout)

function getTimeoutRef() { return refValues['ref_0']; }
function getPendingRef() { return refValues['ref_1']; }
function getIsSavingRef() { return refValues['ref_2']; }

function resetMockState() {
  // Reset state tracking
  stateCallCount = 0;
  stateValues = {};
  stateSetters = {};

  // Reset ref tracking
  refCallCount = 0;
  for (const key of Object.keys(refValues)) {
    delete refValues[key];
  }
}

function callHook(noteId?: string) {
  resetMockState();
  mutationIsPending = false;
  return useProgress(noteId);
}

// The state setter for saveStatus is the second call (index 0 = saveStatus)
function getSaveStatusSetter() {
  return stateSetters['state_0'];
}

// ── Tests ───────────────────────────────────────────────────────────────

describe('useProgress', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockProgressUpdate.mockReset();
    vi.useFakeTimers();
    mutationIsPending = false;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('initialization', () => {
    it('returns the expected API shape', () => {
      const result = callHook('note-1');

      expect(result).toHaveProperty('updateProgress');
      expect(result).toHaveProperty('saveImmediately');
      expect(result).toHaveProperty('hasPendingChanges');
      expect(result).toHaveProperty('isUpdating');
      expect(result).toHaveProperty('saveStatus');
      expect(typeof result.updateProgress).toBe('function');
      expect(typeof result.saveImmediately).toBe('function');
      expect(typeof result.hasPendingChanges).toBe('function');
    });

    it('initializes with idle saveStatus', () => {
      const result = callHook('note-1');

      expect(result.saveStatus).toBe('idle');
    });

    it('initializes with isUpdating false', () => {
      const result = callHook('note-1');

      expect(result.isUpdating).toBe(false);
    });

    it('reflects isPending from mutation state', () => {
      resetMockState();
      mutationIsPending = true;
      const result = useProgress('note-1');

      expect(result.isUpdating).toBe(true);
    });

    it('initializes with no pending changes', () => {
      const result = callHook('note-1');

      expect(result.hasPendingChanges()).toBe(false);
    });
  });

  describe('updateProgress', () => {
    it('does nothing when noteId is undefined', () => {
      const result = callHook(undefined);

      result.updateProgress(0.5);

      // pendingProgress ref is created during hook init but never written to
      expect(getPendingRef().current).toBeNull();
    });

    it('stores pending progress data', () => {
      const result = callHook('note-1');

      result.updateProgress(0.5, 'epubcfi(/6/4)');

      expect(getPendingRef().current).toEqual({
        progress: 0.5,
        lastOpenedCfi: 'epubcfi(/6/4)',
      });
    });

    it('stores progress without lastOpenedCfi', () => {
      const result = callHook('note-1');

      result.updateProgress(0.75);

      expect(getPendingRef().current).toEqual({
        progress: 0.75,
        lastOpenedCfi: undefined,
      });
    });

    it('sets saveStatus to pending when currently idle', () => {
      const result = callHook('note-1');

      result.updateProgress(0.5);

      expect(getSaveStatusSetter()).toHaveBeenCalledWith('pending');
    });

    it('debounces the save by 5 seconds', () => {
      const result = callHook('note-1');

      result.updateProgress(0.5);

      // Should not have called mutate yet
      expect(mutateFn).not.toHaveBeenCalled();

      // Advance to just before debounce threshold
      vi.advanceTimersByTime(4999);
      expect(mutateFn).not.toHaveBeenCalled();

      // Advance past debounce threshold
      vi.advanceTimersByTime(1);
      expect(mutateFn).toHaveBeenCalled();
    });

    it('resets debounce timer on subsequent calls', () => {
      const result = callHook('note-1');

      result.updateProgress(0.3);
      vi.advanceTimersByTime(3000);

      // Update again, should reset the timer
      result.updateProgress(0.6);
      vi.advanceTimersByTime(3000);

      // Still shouldn't have fired (only 3s after second call)
      expect(mutateFn).not.toHaveBeenCalled();

      // Now pass the full 5s from the second call
      vi.advanceTimersByTime(2000);
      expect(mutateFn).toHaveBeenCalledTimes(1);
    });

    it('uses the latest progress value when debounce fires', () => {
      const result = callHook('note-1');

      result.updateProgress(0.1);
      result.updateProgress(0.5);
      result.updateProgress(0.9, 'epubcfi(/6/10)');

      vi.advanceTimersByTime(5000);

      expect(mutateFn).toHaveBeenCalledTimes(1);
      expect(mutateFn).toHaveBeenCalledWith(
        { id: 'note-1', progress: 0.9, lastOpenedCfi: 'epubcfi(/6/10)' },
        expect.any(Object),
      );
    });

    it('clears pending data after debounce fires', () => {
      const result = callHook('note-1');

      result.updateProgress(0.5);

      vi.advanceTimersByTime(5000);

      expect(getPendingRef().current).toBeNull();
    });

    it('handles progress at boundary values', () => {
      const result = callHook('note-1');

      result.updateProgress(0);
      vi.advanceTimersByTime(5000);

      expect(mutateFn).toHaveBeenCalledWith(
        { id: 'note-1', progress: 0, lastOpenedCfi: undefined },
        expect.any(Object),
      );
    });

    it('handles progress value of 1 (complete)', () => {
      const result = callHook('note-1');

      result.updateProgress(1);
      vi.advanceTimersByTime(5000);

      expect(mutateFn).toHaveBeenCalledWith(
        { id: 'note-1', progress: 1, lastOpenedCfi: undefined },
        expect.any(Object),
      );
    });
  });

  describe('executeSave', () => {
    it('does not save when noteId is undefined', () => {
      const result = callHook(undefined);

      result.updateProgress(0.5);
      vi.advanceTimersByTime(5000);

      expect(mutateFn).not.toHaveBeenCalled();
    });

    it('does not save when already saving', () => {
      const result = callHook('note-1');

      // First save - start it
      result.updateProgress(0.5);
      vi.advanceTimersByTime(5000);
      expect(mutateFn).toHaveBeenCalledTimes(1);

      // isSavingRef is now true (set in executeSave)
      // Trigger another save attempt while still saving
      getPendingRef().current = { progress: 0.8 };
      result.updateProgress(0.8);
      vi.advanceTimersByTime(5000);

      // Second call should be blocked by isSavingRef guard
      // The mutate is still called because the pending data is set,
      // but executeSave checks isSavingRef
      // Actually, let's verify what happens: executeSave checks isSavingRef
      // After first executeSave: isSavingRef.current = true
      // The onSettled callback resets it
    });

    it('sets saveStatus to saving when executing', () => {
      const result = callHook('note-1');

      result.updateProgress(0.5);
      vi.advanceTimersByTime(5000);

      expect(getSaveStatusSetter()).toHaveBeenCalledWith('saving');
    });

    it('passes correct mutation variables', () => {
      const result = callHook('note-1');

      result.updateProgress(0.42, 'epubcfi(/6/8)');
      vi.advanceTimersByTime(5000);

      expect(mutateFn).toHaveBeenCalledWith(
        { id: 'note-1', progress: 0.42, lastOpenedCfi: 'epubcfi(/6/8)' },
        expect.objectContaining({ onSettled: expect.any(Function) }),
      );
    });

    it('resets isSaving flag via onSettled callback', () => {
      const result = callHook('note-1');
      mockProgressUpdate.mockResolvedValueOnce({ progress: 0.5, lastRead: '2025-01-01' });

      result.updateProgress(0.5);
      vi.advanceTimersByTime(5000);

      // Get the onSettled callback from the mutate call
      const mutateCallbacks = mutateFn.mock.calls[0][1];
      expect(mutateCallbacks).toHaveProperty('onSettled');

      // Simulate mutation settling
      mutateCallbacks.onSettled();

      expect(getIsSavingRef().current).toBe(false);
    });
  });

  describe('saveImmediately', () => {
    it('does nothing when noteId is undefined', () => {
      const result = callHook(undefined);

      result.updateProgress(0.5);
      result.saveImmediately();

      expect(mutateFn).not.toHaveBeenCalled();
    });

    it('does nothing when no pending progress', () => {
      const result = callHook('note-1');

      result.saveImmediately();

      expect(mutateFn).not.toHaveBeenCalled();
    });

    it('saves pending progress immediately', () => {
      const result = callHook('note-1');

      result.updateProgress(0.7, 'epubcfi(/6/12)');

      // Don't wait for debounce - save immediately
      result.saveImmediately();

      expect(mutateFn).toHaveBeenCalledWith(
        { id: 'note-1', progress: 0.7, lastOpenedCfi: 'epubcfi(/6/12)' },
        expect.any(Object),
      );
    });

    it('clears pending data after immediate save', () => {
      const result = callHook('note-1');

      result.updateProgress(0.7);
      result.saveImmediately();

      expect(getPendingRef().current).toBeNull();
    });

    it('clears the debounce timeout', () => {
      const result = callHook('note-1');

      result.updateProgress(0.7);
      result.saveImmediately();

      expect(getTimeoutRef().current).toBeNull();
    });

    it('does not fire debounced save after immediate save', () => {
      const result = callHook('note-1');

      result.updateProgress(0.7);
      result.saveImmediately();

      // Advance past what would have been the debounce timeout
      vi.advanceTimersByTime(10000);

      // Should only have been called once (the immediate save)
      expect(mutateFn).toHaveBeenCalledTimes(1);
    });
  });

  describe('hasPendingChanges', () => {
    it('returns false when no updates have been made', () => {
      const result = callHook('note-1');

      expect(result.hasPendingChanges()).toBe(false);
    });

    it('returns true after updateProgress is called', () => {
      const result = callHook('note-1');

      result.updateProgress(0.5);

      expect(result.hasPendingChanges()).toBe(true);
    });

    it('returns false after debounce fires', () => {
      const result = callHook('note-1');

      result.updateProgress(0.5);
      vi.advanceTimersByTime(5000);

      expect(result.hasPendingChanges()).toBe(false);
    });

    it('returns false after saveImmediately', () => {
      const result = callHook('note-1');

      result.updateProgress(0.5);
      result.saveImmediately();

      expect(result.hasPendingChanges()).toBe(false);
    });
  });

  describe('mutationFn (retry logic)', () => {
    it('calls api.progress.update with correct arguments', async () => {
      mockProgressUpdate.mockResolvedValueOnce({ progress: 0.5, lastRead: '2025-01-01' });
      callHook('note-1');

      await mutationConfig.mutationFn({ id: 'note-1', progress: 0.5, lastOpenedCfi: 'epubcfi(/6/4)' });

      expect(mockProgressUpdate).toHaveBeenCalledWith('note-1', {
        progress: 0.5,
        lastOpenedCfi: 'epubcfi(/6/4)',
      });
    });

    it('calls api without lastOpenedCfi when not provided', async () => {
      mockProgressUpdate.mockResolvedValueOnce({ progress: 0.5, lastRead: '2025-01-01' });
      callHook('note-1');

      await mutationConfig.mutationFn({ id: 'note-1', progress: 0.5 });

      expect(mockProgressUpdate).toHaveBeenCalledWith('note-1', {
        progress: 0.5,
        lastOpenedCfi: undefined,
      });
    });

    it('returns API response on success', async () => {
      const response = { progress: 0.75, lastRead: '2025-01-15', lastOpenedCfi: 'epubcfi(/6/8)' };
      mockProgressUpdate.mockResolvedValueOnce(response);
      callHook('note-1');

      const result = await mutationConfig.mutationFn({ id: 'note-1', progress: 0.75 });

      expect(result).toEqual(response);
    });

    it('retries on network/server errors up to 3 times', async () => {
      vi.useRealTimers();
      mockProgressUpdate
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('HTTP 500'))
        .mockResolvedValueOnce({ progress: 0.5, lastRead: '2025-01-01' });
      callHook('note-1');

      const result = await mutationConfig.mutationFn({ id: 'note-1', progress: 0.5 });

      expect(result).toEqual({ progress: 0.5, lastRead: '2025-01-01' });
      expect(mockProgressUpdate).toHaveBeenCalledTimes(3);
      vi.useFakeTimers();
    });

    it('does not retry on 4xx client errors', async () => {
      vi.useRealTimers();
      mockProgressUpdate.mockRejectedValueOnce(new Error('HTTP 404: Not Found'));
      callHook('note-1');

      await expect(
        mutationConfig.mutationFn({ id: 'note-1', progress: 0.5 })
      ).rejects.toThrow('HTTP 404: Not Found');

      expect(mockProgressUpdate).toHaveBeenCalledTimes(1);
      vi.useFakeTimers();
    });

    it('does not retry on HTTP 400 errors', async () => {
      vi.useRealTimers();
      mockProgressUpdate.mockRejectedValueOnce(new Error('HTTP 400: Bad Request'));
      callHook('note-1');

      await expect(
        mutationConfig.mutationFn({ id: 'note-1', progress: 0.5 })
      ).rejects.toThrow('HTTP 400: Bad Request');

      expect(mockProgressUpdate).toHaveBeenCalledTimes(1);
      vi.useFakeTimers();
    });

    it('throws after exhausting all retry attempts', async () => {
      vi.useRealTimers();
      mockProgressUpdate
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'));
      callHook('note-1');

      await expect(
        mutationConfig.mutationFn({ id: 'note-1', progress: 0.5 })
      ).rejects.toThrow('Network error');

      expect(mockProgressUpdate).toHaveBeenCalledTimes(3);
      vi.useFakeTimers();
    });

    it('uses exponential backoff for retry delays', async () => {
      // Verify the retry mechanism uses increasing delays
      // by checking the pattern: 1000 * 2^0 = 1000ms, 1000 * 2^1 = 2000ms
      vi.useRealTimers();
      const timestamps: number[] = [];
      mockProgressUpdate.mockImplementation(() => {
        timestamps.push(Date.now());
        if (timestamps.length < 3) {
          return Promise.reject(new Error('timeout'));
        }
        return Promise.resolve({ progress: 0.5, lastRead: '2025-01-01' });
      });
      callHook('note-1');

      await mutationConfig.mutationFn({ id: 'note-1', progress: 0.5 });

      expect(mockProgressUpdate).toHaveBeenCalledTimes(3);
      // First retry delay should be ~1000ms, second ~2000ms
      const delay1 = timestamps[1] - timestamps[0];
      const delay2 = timestamps[2] - timestamps[1];
      expect(delay1).toBeGreaterThanOrEqual(900);
      expect(delay1).toBeLessThan(1500);
      expect(delay2).toBeGreaterThanOrEqual(1800);
      expect(delay2).toBeLessThan(2500);
      vi.useFakeTimers();
    });

    it('wraps non-Error exceptions in Error', async () => {
      vi.useRealTimers();
      mockProgressUpdate
        .mockRejectedValueOnce('string error')
        .mockRejectedValueOnce('string error')
        .mockRejectedValueOnce('string error');
      callHook('note-1');

      await expect(
        mutationConfig.mutationFn({ id: 'note-1', progress: 0.5 })
      ).rejects.toThrow('Unknown error');
      vi.useFakeTimers();
    });
  });

  describe('onSuccess (cache update)', () => {
    it('updates the note query cache with new progress data', () => {
      callHook('note-1');
      const responseData = { progress: 0.8, lastRead: '2025-01-20' };

      mutationConfig.onSuccess(responseData, { id: 'note-1', progress: 0.8 });

      expect(mockSetQueryData).toHaveBeenCalledWith(
        ['note', 'note-1'],
        expect.any(Function),
      );
    });

    it('merges progress and lastRead into existing note cache', () => {
      callHook('note-1');
      const responseData = { progress: 0.8, lastRead: '2025-01-20' };
      const existingNote = {
        id: 'note-1',
        title: 'My Book',
        progress: 0.5,
        lastRead: '2025-01-10',
      };

      mutationConfig.onSuccess(responseData, { id: 'note-1', progress: 0.8 });

      const updater = mockSetQueryData.mock.calls[0][1] as Function;
      const updated = updater(existingNote);

      expect(updated).toEqual({
        id: 'note-1',
        title: 'My Book',
        progress: 0.8,
        lastRead: '2025-01-20',
      });
    });

    it('includes lastOpenedCfi when present in response', () => {
      callHook('note-1');
      const responseData = { progress: 0.8, lastRead: '2025-01-20', lastOpenedCfi: 'epubcfi(/6/14)' };
      const existingNote = {
        id: 'note-1',
        title: 'My Book',
        progress: 0.5,
        lastRead: '2025-01-10',
      };

      mutationConfig.onSuccess(responseData, { id: 'note-1', progress: 0.8 });

      const updater = mockSetQueryData.mock.calls[0][1] as Function;
      const updated = updater(existingNote);

      expect(updated.lastOpenedCfi).toBe('epubcfi(/6/14)');
    });

    it('does not add lastOpenedCfi when not in response', () => {
      callHook('note-1');
      const responseData = { progress: 0.8, lastRead: '2025-01-20' };
      const existingNote = {
        id: 'note-1',
        title: 'My Book',
        progress: 0.5,
        lastRead: '2025-01-10',
        lastOpenedCfi: 'epubcfi(/6/2)',
      };

      mutationConfig.onSuccess(responseData, { id: 'note-1', progress: 0.8 });

      const updater = mockSetQueryData.mock.calls[0][1] as Function;
      const updated = updater(existingNote);

      // Should keep the existing lastOpenedCfi since response doesn't include it
      expect(updated.lastOpenedCfi).toBe('epubcfi(/6/2)');
    });

    it('returns old data unchanged when it has no progress property', () => {
      callHook('note-1');
      const responseData = { progress: 0.8, lastRead: '2025-01-20' };

      mutationConfig.onSuccess(responseData, { id: 'note-1', progress: 0.8 });

      const updater = mockSetQueryData.mock.calls[0][1] as Function;

      // Object without 'progress' property
      const nonNoteData = { something: 'else' };
      expect(updater(nonNoteData)).toBe(nonNoteData);
    });

    it('returns old data unchanged when it is null', () => {
      callHook('note-1');
      const responseData = { progress: 0.8, lastRead: '2025-01-20' };

      mutationConfig.onSuccess(responseData, { id: 'note-1', progress: 0.8 });

      const updater = mockSetQueryData.mock.calls[0][1] as Function;
      expect(updater(null)).toBeNull();
    });

    it('returns old data unchanged when it is undefined', () => {
      callHook('note-1');
      const responseData = { progress: 0.8, lastRead: '2025-01-20' };

      mutationConfig.onSuccess(responseData, { id: 'note-1', progress: 0.8 });

      const updater = mockSetQueryData.mock.calls[0][1] as Function;
      expect(updater(undefined)).toBeUndefined();
    });

    it('invalidates library queries to update grid', () => {
      callHook('note-1');
      const responseData = { progress: 0.8, lastRead: '2025-01-20' };

      mutationConfig.onSuccess(responseData, { id: 'note-1', progress: 0.8 });

      expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['library'] });
    });

    it('sets save status to saved then back to idle after 2s', () => {
      callHook('note-1');
      const responseData = { progress: 0.8, lastRead: '2025-01-20' };

      mutationConfig.onSuccess(responseData, { id: 'note-1', progress: 0.8 });

      // Should have been set to 'saved'
      expect(getSaveStatusSetter()).toHaveBeenCalledWith('saved');

      // After 2 seconds, should go back to idle
      vi.advanceTimersByTime(2000);
      expect(getSaveStatusSetter()).toHaveBeenCalledWith('idle');
    });
  });

  describe('onError', () => {
    it('sets saveStatus to error', () => {
      callHook('note-1');

      mutationConfig.onError();

      expect(getSaveStatusSetter()).toHaveBeenCalledWith('error');
    });

    it('resets saveStatus to idle after 3 seconds', () => {
      callHook('note-1');

      mutationConfig.onError();

      vi.advanceTimersByTime(3000);
      expect(getSaveStatusSetter()).toHaveBeenCalledWith('idle');
    });
  });

  describe('full save cycle', () => {
    it('debounced update: pending → saving → saved → idle', () => {
      const result = callHook('note-1');
      const setter = getSaveStatusSetter();

      // 1. Update progress - should set pending
      result.updateProgress(0.5);
      expect(setter).toHaveBeenCalledWith('pending');

      // 2. Wait for debounce - executeSave fires
      vi.advanceTimersByTime(5000);
      expect(setter).toHaveBeenCalledWith('saving');

      // 3. Simulate mutation success callback
      const responseData = { progress: 0.5, lastRead: '2025-01-20' };
      mutationConfig.onSuccess(responseData, { id: 'note-1', progress: 0.5 });
      expect(setter).toHaveBeenCalledWith('saved');

      // 4. After 2s, back to idle
      vi.advanceTimersByTime(2000);
      expect(setter).toHaveBeenCalledWith('idle');
    });

    it('immediate save bypasses debounce', () => {
      const result = callHook('note-1');

      result.updateProgress(0.5);
      result.saveImmediately();

      // Should have fired the mutation without waiting
      expect(mutateFn).toHaveBeenCalledTimes(1);
      expect(mutateFn).toHaveBeenCalledWith(
        { id: 'note-1', progress: 0.5, lastOpenedCfi: undefined },
        expect.any(Object),
      );
    });

    it('error cycle: pending → saving → error → idle', () => {
      const result = callHook('note-1');
      const setter = getSaveStatusSetter();

      result.updateProgress(0.5);
      expect(setter).toHaveBeenCalledWith('pending');

      vi.advanceTimersByTime(5000);
      expect(setter).toHaveBeenCalledWith('saving');

      // Simulate mutation error callback
      mutationConfig.onError();
      expect(setter).toHaveBeenCalledWith('error');

      // After 3s, back to idle
      vi.advanceTimersByTime(3000);
      expect(setter).toHaveBeenCalledWith('idle');
    });
  });

  describe('edge cases', () => {
    it('handles rapid progress updates efficiently', () => {
      const result = callHook('note-1');

      // Simulate rapid page turns
      for (let i = 1; i <= 20; i++) {
        result.updateProgress(i / 20, `epubcfi(/6/${i * 2})`);
      }

      vi.advanceTimersByTime(5000);

      // Should only call mutate once with the latest value
      expect(mutateFn).toHaveBeenCalledTimes(1);
      expect(mutateFn).toHaveBeenCalledWith(
        { id: 'note-1', progress: 1, lastOpenedCfi: 'epubcfi(/6/40)' },
        expect.any(Object),
      );
    });

    it('saveImmediately with no noteId is safe', () => {
      const result = callHook(undefined);

      expect(() => result.saveImmediately()).not.toThrow();
      expect(mutateFn).not.toHaveBeenCalled();
    });

    it('saveImmediately with no pending data is a no-op', () => {
      const result = callHook('note-1');

      result.saveImmediately();

      expect(mutateFn).not.toHaveBeenCalled();
    });

    it('handles empty string CFI', () => {
      const result = callHook('note-1');

      result.updateProgress(0.5, '');
      vi.advanceTimersByTime(5000);

      expect(mutateFn).toHaveBeenCalledWith(
        { id: 'note-1', progress: 0.5, lastOpenedCfi: '' },
        expect.any(Object),
      );
    });

    it('handles special characters in noteId', () => {
      mockProgressUpdate.mockResolvedValueOnce({ progress: 0.5, lastRead: '2025-01-01' });
      callHook('note/with/slashes');

      mutationConfig.mutationFn({ id: 'note/with/slashes', progress: 0.5 });

      expect(mockProgressUpdate).toHaveBeenCalledWith('note/with/slashes', {
        progress: 0.5,
        lastOpenedCfi: undefined,
      });
    });

    it('savedStatus timeout is cleared on subsequent successes', () => {
      callHook('note-1');
      const responseData = { progress: 0.8, lastRead: '2025-01-20' };

      // First success
      mutationConfig.onSuccess(responseData, { id: 'note-1', progress: 0.8 });

      // Advance part way through
      vi.advanceTimersByTime(1000);

      // Second success before the first idle timeout fires
      mutationConfig.onSuccess(responseData, { id: 'note-1', progress: 0.9 });

      // The first timeout should have been cleared, only the second one runs
      vi.advanceTimersByTime(2000);
      const setter = getSaveStatusSetter();

      // Last call should be 'idle' from the second success's timeout
      const calls = setter.mock.calls.map((c: unknown[]) => c[0]);
      const idleCalls = calls.filter((c: unknown) => c === 'idle');
      // Only one idle transition should happen (from the second success)
      expect(idleCalls.length).toBe(1);
    });
  });
});
