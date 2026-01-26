import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

export function useCollections() {
  return useQuery({
    queryKey: ['collections'],
    queryFn: () => api.collections.list(),
  });
}

export function useUpdateCollections() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ noteId, collections }: { noteId: string; collections: string[] }) =>
      api.collections.update(noteId, { collections }),
    onSuccess: (_, { noteId }) => {
      // Invalidate both the collections list and the specific note
      queryClient.invalidateQueries({ queryKey: ['collections'] });
      queryClient.invalidateQueries({ queryKey: ['library'] });
      queryClient.invalidateQueries({ queryKey: ['note', noteId] });
    },
  });
}
