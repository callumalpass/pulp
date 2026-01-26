import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import type { LiteratureNoteSummary } from '@pulp/shared';
import { api } from '../lib/api';

export function usePinned() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: ({ id, pinned }: { id: string; pinned: boolean }) =>
      api.pin.update(id, { pinned }),
    onMutate: async ({ id, pinned }) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['library'] });

      // Snapshot the previous value
      const previousLibrary = queryClient.getQueryData(['library']);

      // Optimistically update all library queries
      queryClient.setQueriesData<LiteratureNoteSummary[]>(
        { queryKey: ['library'] },
        (old) => old?.map((note) =>
          note.id === id ? { ...note, pinned } : note
        )
      );

      return { previousLibrary };
    },
    onError: (_err, _variables, context) => {
      // Rollback on error
      if (context?.previousLibrary) {
        queryClient.setQueriesData(
          { queryKey: ['library'] },
          context.previousLibrary
        );
      }
    },
    onSettled: () => {
      // Refetch after error or success
      queryClient.invalidateQueries({ queryKey: ['library'] });
    },
  });

  const togglePin = useCallback(
    (id: string, currentPinned: boolean) => {
      mutation.mutate({ id, pinned: !currentPinned });
    },
    [mutation]
  );

  return {
    togglePin,
    isPending: mutation.isPending,
  };
}
