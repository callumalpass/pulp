import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef, useCallback } from 'react';
import { api } from '../lib/api';

export function useNoteContent(id: string | undefined) {
  return useQuery({
    queryKey: ['noteContent', id],
    queryFn: () => api.library.getContent(id!),
    enabled: !!id,
    select: (data) => data.content,
  });
}

export function useUpdateNoteContent(id: string | undefined) {
  const queryClient = useQueryClient();
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const mutation = useMutation({
    mutationFn: (content: string) => api.library.updateContent(id!, content),
    onSuccess: () => {
      // Invalidate highlights since content change may affect them
      queryClient.invalidateQueries({ queryKey: ['highlights', id] });
    },
  });

  // Use a ref for mutation.mutate to keep callbacks stable across renders.
  // The mutation object from useMutation gets a new reference when mutation
  // state changes (isPending, isSuccess, etc.), which would make callbacks
  // unstable if used directly as a dependency.
  const mutateRef = useRef(mutation.mutate);
  mutateRef.current = mutation.mutate;

  const saveDebounced = useCallback(
    (content: string) => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      debounceTimerRef.current = setTimeout(() => {
        debounceTimerRef.current = null;
        mutateRef.current(content);
      }, 1500);
    },
    []
  );

  const saveImmediately = useCallback(
    (content: string) => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      mutateRef.current(content);
    },
    []
  );

  const cancelPendingSave = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
  }, []);

  return {
    saveDebounced,
    saveImmediately,
    cancelPendingSave,
    isPending: mutation.isPending,
    isSuccess: mutation.isSuccess,
    hasPendingDebounce: () => debounceTimerRef.current !== null,
  };
}
