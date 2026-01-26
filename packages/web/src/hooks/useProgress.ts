import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef } from 'react';
import { api } from '../lib/api';

const DEBOUNCE_MS = 5000;

export function useProgress(noteId: string | undefined) {
  const queryClient = useQueryClient();
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingProgress = useRef<number | null>(null);

  const mutation = useMutation({
    mutationFn: ({ id, progress }: { id: string; progress: number }) =>
      api.progress.update(id, { progress }),
    onSuccess: (data, { id }) => {
      queryClient.setQueryData(['note', id], (old: unknown) => {
        if (old && typeof old === 'object' && 'progress' in old) {
          return { ...old, progress: data.progress, lastRead: data.lastRead };
        }
        return old;
      });
    },
  });

  const updateProgress = useCallback(
    (progress: number) => {
      if (!noteId) return;

      pendingProgress.current = progress;

      // Clear existing timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      // Debounce the save
      timeoutRef.current = setTimeout(() => {
        if (pendingProgress.current !== null) {
          mutation.mutate({ id: noteId, progress: pendingProgress.current });
          pendingProgress.current = null;
        }
      }, DEBOUNCE_MS);
    },
    [noteId, mutation]
  );

  const saveImmediately = useCallback(() => {
    if (!noteId || pendingProgress.current === null) return;

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    mutation.mutate({ id: noteId, progress: pendingProgress.current });
    pendingProgress.current = null;
  }, [noteId, mutation]);

  return {
    updateProgress,
    saveImmediately,
    isUpdating: mutation.isPending,
  };
}
