import { useQuery } from '@tanstack/react-query';
import type { ReadingGoalsResponse } from '@pulp/shared';
import { api } from '../lib/api';

/**
 * Hook to fetch reading goals, streak, and today's progress
 */
export function useReadingGoals() {
  return useQuery<ReadingGoalsResponse>({
    queryKey: ['reading-goals'],
    queryFn: () => api.readingGoals.get(),
    staleTime: 30000, // Consider fresh for 30 seconds
    refetchInterval: 60000, // Refetch every minute
  });
}
