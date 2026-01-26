import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

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
