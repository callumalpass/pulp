import { useQuery } from '@tanstack/react-query';
import type { ReadingPaceTrends } from '@pulp/shared';
import { api } from '../lib/api';

/**
 * Hook to fetch reading pace trends and time-of-day patterns for a book
 */
export function useReadingPaceTrends(noteId: string | null, limit?: number) {
  return useQuery<ReadingPaceTrends>({
    queryKey: ['reading-pace-trends', noteId, limit],
    queryFn: () => api.readingStats.getPaceTrends(noteId!, limit),
    enabled: !!noteId,
    staleTime: 60000, // Consider fresh for 1 minute
  });
}
