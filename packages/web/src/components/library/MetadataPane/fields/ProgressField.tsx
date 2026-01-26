import type { ReadingStats } from '@pulp/shared';
import { formatLastRead, getEstimatedTimeRemaining, formatEstimatedCompletion } from '../../../../lib/format';
import { useReadingStatsStore } from '../../../../stores/readingStats';

interface ProgressFieldProps {
  progress: number;
  totalPages: number | null;
  lastRead: string | null;
  readingStats: ReadingStats | null;
}

/**
 * Displays comprehensive reading progress information.
 * Includes progress bar, reading time, pace, and estimated completion.
 */
export function ProgressField({ progress, totalPages, lastRead, readingStats }: ProgressFieldProps) {
  const { getFormattedReadingTime } = useReadingStatsStore();

  const estimatedTime = getEstimatedTimeRemaining({
    totalPages,
    progress,
    pagesPerHour: readingStats?.pagesPerHour,
  });

  const estimatedCompletion = formatEstimatedCompletion(readingStats?.estimatedCompletionDate ?? null);

  const formatPace = (pagesPerHour: number | null): string | null => {
    if (!pagesPerHour) return null;
    return `${Math.round(pagesPerHour)} pages/hour`;
  };

  const formatSessions = (totalSessions: number): string => {
    return `${totalSessions} session${totalSessions !== 1 ? 's' : ''}`;
  };

  return (
    <div className="metadata-progress-section">
      {/* Progress bar */}
      <div className="metadata-progress-bar-container">
        <div className="metadata-progress-bar">
          <div
            className="metadata-progress-bar-fill"
            style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
          />
        </div>
        <span className="metadata-progress-percent">{Math.round(progress)}%</span>
      </div>

      {/* Progress details */}
      <div className="metadata-progress-details">
        {totalPages && (
          <div className="metadata-field">
            <span className="metadata-field-label">Pages</span>
            <span className="metadata-field-value">
              {Math.round((progress / 100) * totalPages)} / {totalPages}
            </span>
          </div>
        )}

        {readingStats && readingStats.totalReadingTimeMs > 0 && (
          <div className="metadata-field">
            <span className="metadata-field-label">Time Read</span>
            <span className="metadata-field-value">
              {getFormattedReadingTime(readingStats.totalReadingTimeMs)}
            </span>
          </div>
        )}

        {readingStats && readingStats.totalSessions > 0 && (
          <div className="metadata-field">
            <span className="metadata-field-label">Sessions</span>
            <span className="metadata-field-value">
              {formatSessions(readingStats.totalSessions)}
            </span>
          </div>
        )}

        {readingStats?.pagesPerHour && (
          <div className="metadata-field">
            <span className="metadata-field-label">Pace</span>
            <span className="metadata-field-value">
              {formatPace(readingStats.pagesPerHour)}
            </span>
          </div>
        )}

        {estimatedTime && progress < 100 && (
          <div className="metadata-field">
            <span className="metadata-field-label">Time Remaining</span>
            <span className="metadata-field-value">{estimatedTime}</span>
          </div>
        )}

        {estimatedCompletion && progress < 100 && (
          <div className="metadata-field">
            <span className="metadata-field-label">Est. Completion</span>
            <span className="metadata-field-value">{estimatedCompletion}</span>
          </div>
        )}

        {lastRead && (
          <div className="metadata-field">
            <span className="metadata-field-label">Last Read</span>
            <span className="metadata-field-value">{formatLastRead(lastRead)}</span>
          </div>
        )}
      </div>
    </div>
  );
}
