import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

export function useLibrary(
  sort: 'lastRead' | 'title' | 'progress' | 'dateCreated' | 'author' | 'rating' = 'lastRead',
  order: 'asc' | 'desc' = 'desc'
) {
  return useQuery({
    queryKey: ['library', sort, order],
    queryFn: () => api.library.list(sort, order),
    // Keep data fresh for 30 seconds - reduces refetches when navigating between pages
    staleTime: 30 * 1000,
    // Cache unused data for 5 minutes
    gcTime: 5 * 60 * 1000,
  });
}
