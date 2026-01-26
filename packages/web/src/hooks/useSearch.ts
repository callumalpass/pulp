import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

export function useSearch(
  query: string,
  options?: { noteId?: string; limit?: number; enabled?: boolean }
) {
  return useQuery({
    queryKey: ['search', query, options?.noteId, options?.limit],
    queryFn: () => api.search.query(query, options),
    enabled: (options?.enabled ?? true) && query.trim().length >= 2,
    staleTime: 30000, // Cache results for 30 seconds
  });
}

export function useSearchStatus() {
  return useQuery({
    queryKey: ['search-status'],
    queryFn: () => api.search.status(),
    refetchInterval: (query) => {
      // Refetch every 2 seconds while indexing is in progress
      const data = query.state.data;
      return data && !data.isComplete ? 2000 : false;
    },
  });
}
