import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import type { LiteratureNoteSummary } from '@pulp/shared';
import { api } from '../lib/api';

export function useRating() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: ({ id, rating }: { id: string; rating: number | null }) =>
      api.rating.update(id, { rating }),
    onMutate: async ({ id, rating }) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['library'] });

      // Snapshot the previous value
      const previousLibrary = queryClient.getQueryData(['library']);

      // Optimistically update all library queries
      queryClient.setQueriesData<LiteratureNoteSummary[]>(
        { queryKey: ['library'] },
        (old) => old?.map((note) =>
          note.id === id ? { ...note, rating } : note
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

  const setRating = useCallback(
    (id: string, rating: number | null) => {
      mutation.mutate({ id, rating });
    },
    [mutation]
  );

  return {
    setRating,
    isPending: mutation.isPending,
  };
}
