import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

export function useLibrary(
  sort: 'lastRead' | 'title' | 'progress' = 'lastRead',
  order: 'asc' | 'desc' = 'desc'
) {
  return useQuery({
    queryKey: ['library', sort, order],
    queryFn: () => api.library.list(sort, order),
  });
}
