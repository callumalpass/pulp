import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef, useState } from 'react';
import { api } from '../lib/api';

const DEBOUNCE_MS = 5000;
const MAX_RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 1000;

interface PendingProgress {
  progress: number;
  lastOpenedCfi?: string;
}

export type SaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

export function useProgress(noteId: string | undefined) {
  const queryClient = useQueryClient();
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingProgress = useRef<PendingProgress | null>(null);
  const isSavingRef = useRef(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const savedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear saved status after a delay
  const showSavedStatus = useCallback(() => {
    setSaveStatus('saved');
    if (savedTimeoutRef.current) {
      clearTimeout(savedTimeoutRef.current);
    }
    savedTimeoutRef.current = setTimeout(() => {
      setSaveStatus('idle');
    }, 2000);
  }, []);

  const mutation = useMutation({
    mutationFn: async ({ id, progress, lastOpenedCfi }: { id: string; progress: number; lastOpenedCfi?: string }) => {
      let lastError: Error | null = null;

      for (let attempt = 0; attempt < MAX_RETRY_ATTEMPTS; attempt++) {
        try {
          return await api.progress.update(id, { progress, lastOpenedCfi });
        } catch (error) {
          lastError = error instanceof Error ? error : new Error('Unknown error');

          // Don't retry on client errors (4xx), only on network/server errors
          if (lastError.message.includes('HTTP 4')) {
            throw lastError;
          }

          // Wait before retrying (with exponential backoff)
          if (attempt < MAX_RETRY_ATTEMPTS - 1) {
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS * Math.pow(2, attempt)));
          }
        }
      }

      throw lastError;
    },
    onSuccess: (data, { id }) => {
      queryClient.setQueryData(['note', id], (old: unknown) => {
        if (old && typeof old === 'object' && 'progress' in old) {
          return {
            ...old,
            progress: data.progress,
            lastRead: data.lastRead,
            ...(data.lastOpenedCfi ? { lastOpenedCfi: data.lastOpenedCfi } : {}),
          };
        }
        return old;
      });
      // Also invalidate library to update progress in grid
      queryClient.invalidateQueries({ queryKey: ['library'] });
      showSavedStatus();
    },
    onError: () => {
      setSaveStatus('error');
      // Reset to idle after showing error
      setTimeout(() => setSaveStatus('idle'), 3000);
    },
  });

  const executeSave = useCallback((data: PendingProgress) => {
    if (!noteId) return;

    if (isSavingRef.current) {
      // Keep the latest save request queued so it can flush after the in-flight save settles.
      pendingProgress.current = data;
      setSaveStatus('pending');
      return;
    }

    isSavingRef.current = true;
    setSaveStatus('saving');

    mutation.mutate(
      { id: noteId, progress: data.progress, lastOpenedCfi: data.lastOpenedCfi },
      {
        onSettled: () => {
          isSavingRef.current = false;

          const queuedProgress = pendingProgress.current;
          if (queuedProgress !== null) {
            pendingProgress.current = null;
            executeSave(queuedProgress);
          }
        },
      }
    );
  }, [noteId, mutation]);

  const updateProgress = useCallback(
    (progress: number, lastOpenedCfi?: string) => {
      if (!noteId) return;

      pendingProgress.current = { progress, lastOpenedCfi };

      // Show pending status immediately
      if (saveStatus === 'idle') {
        setSaveStatus('pending');
      }

      // Clear existing timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      // Debounce the save
      timeoutRef.current = setTimeout(() => {
        timeoutRef.current = null;
        const dataToSave = pendingProgress.current;
        if (dataToSave !== null) {
          pendingProgress.current = null;
          executeSave(dataToSave);
        }
      }, DEBOUNCE_MS);
    },
    [noteId, executeSave, saveStatus]
  );

  const saveImmediately = useCallback(() => {
    if (!noteId) return;

    // Capture pending data atomically
    const dataToSave = pendingProgress.current;
    if (dataToSave === null) return;

    // Clear pending state first
    pendingProgress.current = null;
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    executeSave(dataToSave);
  }, [noteId, executeSave]);

  const hasPendingChanges = useCallback(() => {
    return pendingProgress.current !== null;
  }, []);

  return {
    updateProgress,
    saveImmediately,
    hasPendingChanges,
    isUpdating: mutation.isPending,
    saveStatus,
  };
}
