import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

export function useLibraryStats() {
  return useQuery({
    queryKey: ['library-stats'],
    queryFn: () => api.libraryStats.get(),
    staleTime: 30000, // Consider fresh for 30 seconds
  });
}
