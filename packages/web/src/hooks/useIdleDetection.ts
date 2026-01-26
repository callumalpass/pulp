import { useEffect, useCallback } from 'react';
import { useReadingStatsStore } from '../stores/readingStats';

const IDLE_CHECK_INTERVAL_MS = 30000; // Check every 30 seconds

/**
 * Hook to detect user idle state and pause reading session accordingly.
 * Records activity on user interactions and periodically checks for idle timeout.
 *
 * Usage: Call this hook in the reader component to enable idle detection.
 */
export function useIdleDetection() {
  const { recordActivity, checkIdleStatus, isIdlePaused } = useReadingStatsStore();

  // Check idle status periodically
  useEffect(() => {
    const interval = setInterval(() => {
      checkIdleStatus();
    }, IDLE_CHECK_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [checkIdleStatus]);

  // Record activity on user interactions
  const handleActivity = useCallback(() => {
    recordActivity();
  }, [recordActivity]);

  // Listen for user activity events
  useEffect(() => {
    const events = ['mousedown', 'keydown', 'scroll', 'touchstart', 'wheel'];

    events.forEach(event => {
      document.addEventListener(event, handleActivity, { passive: true });
    });

    return () => {
      events.forEach(event => {
        document.removeEventListener(event, handleActivity);
      });
    };
  }, [handleActivity]);

  return { isIdlePaused: isIdlePaused() };
}
