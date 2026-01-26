import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { Bookmark, CreateBookmarkRequest } from '@pulp/shared';

export function useNote(id: string | undefined) {
  return useQuery({
    queryKey: ['note', id],
    queryFn: () => api.library.get(id!),
    enabled: !!id,
  });
}

export function useHighlights(id: string | undefined) {
  return useQuery({
    queryKey: ['highlights', id],
    queryFn: () => api.library.getHighlights(id!),
    enabled: !!id,
  });
}

export function useBookmarks(noteId: string | undefined) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['bookmarks', noteId],
    queryFn: () => api.bookmarks.list(noteId!),
    enabled: !!noteId,
  });

  const addMutation = useMutation({
    mutationFn: (data: CreateBookmarkRequest) => api.bookmarks.create(noteId!, data),
    onSuccess: (newBookmark) => {
      // Optimistically update the cache
      queryClient.setQueryData<Bookmark[]>(['bookmarks', noteId], (old) =>
        old ? [...old, newBookmark] : [newBookmark]
      );
    },
  });

  const removeMutation = useMutation({
    mutationFn: (bookmarkId: string) => api.bookmarks.delete(noteId!, bookmarkId),
    onSuccess: (_, bookmarkId) => {
      // Optimistically update the cache
      queryClient.setQueryData<Bookmark[]>(['bookmarks', noteId], (old) =>
        old ? old.filter((b) => b.id !== bookmarkId) : []
      );
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ bookmarkId, label }: { bookmarkId: string; label: string }) =>
      api.bookmarks.update(noteId!, bookmarkId, { label }),
    onSuccess: (updatedBookmark) => {
      queryClient.setQueryData<Bookmark[]>(['bookmarks', noteId], (old) =>
        old ? old.map((b) => (b.id === updatedBookmark.id ? updatedBookmark : b)) : []
      );
    },
  });

  return {
    bookmarks: query.data ?? [],
    isLoading: query.isLoading,
    addBookmark: addMutation.mutate,
    removeBookmark: removeMutation.mutate,
    updateBookmark: updateMutation.mutate,
    isAdding: addMutation.isPending,
    isRemoving: removeMutation.isPending,
  };
}
