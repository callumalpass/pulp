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
 * Format reading time in milliseconds as a human-readable string
 */
export function formatReadingTime(ms: number): string {
  if (ms < 60000) {
    return `${Math.round(ms / 1000)}s`;
  }
  if (ms < 3600000) {
    const mins = Math.round(ms / 60000);
    return `${mins}m`;
  }
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
