import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { CreateHighlightRequest, UpdateHighlightRequest, Highlight } from '@pulp/shared';
import { api } from '../lib/api';

export function useCreateHighlight(noteId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateHighlightRequest) => {
      if (!noteId) throw new Error('No note ID');
      return api.highlights.create(noteId, data);
    },
    onSuccess: (result) => {
      // Add highlight to cache
      queryClient.setQueryData<Highlight[]>(['highlights', noteId], (old) => {
        return old ? [...old, result.highlight] : [result.highlight];
      });
    },
  });
}

export function useUpdateHighlight(noteId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ highlightId, data }: { highlightId: string; data: UpdateHighlightRequest }) => {
      if (!noteId) throw new Error('No note ID');
      return api.highlights.update(noteId, highlightId, data);
    },
    onSuccess: (result) => {
      // Update highlight in cache
      queryClient.setQueryData<Highlight[]>(['highlights', noteId], (old) => {
        if (!old) return [result.highlight];
        return old.map((h) => (h.id === result.highlight.id ? result.highlight : h));
      });
    },
  });
}

export function useDeleteHighlight(noteId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (highlightId: string) => {
      if (!noteId) throw new Error('No note ID');
      return api.highlights.delete(noteId, highlightId);
    },
    onSuccess: (_, highlightId) => {
      // Remove highlight from cache
      queryClient.setQueryData<Highlight[]>(['highlights', noteId], (old) => {
        return old ? old.filter((h) => h.id !== highlightId) : [];
      });
    },
  });
}
