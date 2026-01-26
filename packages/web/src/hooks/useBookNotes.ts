import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

export function useBookNotes(noteId: string | undefined) {
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ['bookNotes', noteId],
    queryFn: () => api.bookNotes.get(noteId!),
    enabled: !!noteId,
  });

  const mutation = useMutation({
    mutationFn: (notes: string | null) => api.bookNotes.update(noteId!, { notes }),
    onSuccess: (result) => {
      queryClient.setQueryData(['bookNotes', noteId], { notes: result.notes });
      // Also update the note cache if it exists
      queryClient.setQueryData(['note', noteId], (old: unknown) => {
        if (old && typeof old === 'object' && 'bookNotes' in old) {
          return { ...old, bookNotes: result.notes };
        }
        return old;
      });
    },
  });

  return {
    notes: data?.notes ?? null,
    isLoading,
    error,
    updateNotes: mutation.mutate,
    isUpdating: mutation.isPending,
  };
}
