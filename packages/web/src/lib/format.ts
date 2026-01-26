/**
 * Format a date as a relative time string (e.g., "today", "yesterday", "3d ago")
 */
export function formatLastRead(isoDate: string): string {
  const date = new Date(isoDate);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'today';
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return date.toLocaleDateString();
}

/**
 * Format reading time in milliseconds as a human-readable string.
 *
 * @param ms - Duration in milliseconds
 * @param options.showSeconds - If true, show seconds for sub-minute times (default: true)
 * @param options.showZero - If true, show "0m" for times under 1 minute when showSeconds is false (default: true)
 *
 * Examples:
 * - formatReadingTime(30000) → "30s"
 * - formatReadingTime(30000, { showSeconds: false }) → "0m"
 * - formatReadingTime(300000) → "5m"
 * - formatReadingTime(3900000) → "1h 5m"
 * - formatReadingTime(7200000) → "2h"
 */
export function formatReadingTime(
  ms: number,
  options: { showSeconds?: boolean; showZero?: boolean } = {}
): string {
  const { showSeconds = true, showZero = true } = options;

  // Handle sub-minute times
  if (ms < 60000) {
    if (showSeconds) {
      return `${Math.round(ms / 1000)}s`;
    }
    return showZero ? '0m' : '';
  }

  // Handle times under an hour
  if (ms < 3600000) {
    const mins = Math.round(ms / 60000);
    return `${mins}m`;
  }

  // Handle times >= 1 hour
  const hours = Math.floor(ms / 3600000);
  const mins = Math.round((ms % 3600000) / 60000);
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

interface EstimatedTimeParams {
  totalPages: number | null;
  progress: number;
  pagesPerHour?: number | null;
}

/**
 * Calculate estimated time remaining to finish a book
 * Returns a formatted string (e.g., "30m", "2.5h") or null if cannot be calculated
 */
export function getEstimatedTimeRemaining({
  totalPages,
  progress,
  pagesPerHour,
}: EstimatedTimeParams): string | null {
  if (!totalPages || progress >= 100) return null;

  // Use provided reading speed or default to 25 pages/hour
  const speed = pagesPerHour ?? 25;
  const pagesRemaining = Math.ceil(totalPages * ((100 - progress) / 100));
  const hoursRemaining = pagesRemaining / speed;

  if (hoursRemaining < 1) {
    const mins = Math.round(hoursRemaining * 60);
    return `${mins}m`;
  } else if (hoursRemaining < 10) {
    const hours = Math.round(hoursRemaining * 10) / 10;
    return `${hours}h`;
  } else {
    const hours = Math.round(hoursRemaining);
    return `${hours}h`;
  }
}

/**
 * Format an estimated completion date as a relative string
 * Returns null for dates in the past or invalid dates
 */
export function formatEstimatedCompletion(isoDate: string | null): string | null {
  if (!isoDate) return null;

  const date = new Date(isoDate);
  if (isNaN(date.getTime())) return null;

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  // Don't show dates in the past
  if (target < today) return null;

  const diffMs = target.getTime() - today.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays < 7) return `In ${diffDays} days`;
  if (diffDays < 14) return 'Next week';
  if (diffDays < 30) return `In ${Math.round(diffDays / 7)} weeks`;
  if (diffDays < 60) return 'Next month';

  // For longer estimates, show the month
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
