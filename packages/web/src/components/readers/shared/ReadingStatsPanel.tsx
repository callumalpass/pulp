import { useEffect, useState } from 'react';
import { useReadingStatsStore } from '../../../stores/readingStats';
import { useIdleDetection } from '../../../hooks/useIdleDetection';

interface ReadingStatsPanelProps {
  noteId: string;
  currentPage: number;
  totalPages: number;
  dateFinished?: string | null;
  onClose: () => void;
}

export function ReadingStatsPanel({ noteId, currentPage, totalPages, dateFinished, onClose }: ReadingStatsPanelProps) {
  const {
    getBookStats,
    getEstimatedTimeRemaining,
    getFormattedReadingTime,
    getActiveSessionDuration,
  } = useReadingStatsStore();

  const [sessionDuration, setSessionDuration] = useState(0);
  const bookStats = getBookStats(noteId);
  const { isIdlePaused } = useIdleDetection();

  // Update session duration every second
  useEffect(() => {
    const interval = setInterval(() => {
      setSessionDuration(getActiveSessionDuration());
    }, 1000);
    return () => clearInterval(interval);
  }, [getActiveSessionDuration]);

  const estimatedRemaining = getEstimatedTimeRemaining(noteId, currentPage, totalPages);
  const progress = totalPages > 0 ? (currentPage / totalPages) * 100 : 0;

  return (
    <aside
      className="w-80 bg-bg-surface border-l border-text-secondary/10 flex flex-col overflow-hidden"
      role="complementary"
      aria-label="Reading statistics"
    >
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-text-secondary/10">
        <h2 className="text-sm font-semibold text-text-primary">Reading Statistics</h2>
        <button
          onClick={onClose}
          className="w-7 h-7 rounded flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-bg-deep transition-colors"
          aria-label="Close statistics panel"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Current Session */}
        <section>
          <h3 className="text-xs font-medium text-text-secondary uppercase tracking-wide mb-3">
            Current Session
          </h3>
          <div className="bg-bg-deep rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-text-secondary">Time reading</span>
              <div className="flex items-center gap-2">
                {isIdlePaused && (
                  <span className="text-xs px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-500" title="Session paused due to inactivity. Move your mouse or press a key to resume.">
                    Paused
                  </span>
                )}
                <span className="text-lg font-mono text-text-primary">
                  {getFormattedReadingTime(sessionDuration)}
                </span>
              </div>
            </div>
            {estimatedRemaining !== null && estimatedRemaining > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-text-secondary">Est. remaining</span>
                <span className="text-sm font-mono text-accent-primary">
                  {getFormattedReadingTime(estimatedRemaining)}
                </span>
              </div>
            )}
            <div className="pt-2 border-t border-text-secondary/10">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-text-secondary">Progress</span>
                <span className="text-xs text-text-secondary">{Math.round(progress)}%</span>
              </div>
              <div className="w-full h-2 bg-bg-surface rounded-full overflow-hidden">
                <div
                  className="h-full bg-accent-primary transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          </div>
        </section>

        {/* Book Statistics */}
        {bookStats && bookStats.totalReadingTimeMs > 0 && (
          <section>
            <h3 className="text-xs font-medium text-text-secondary uppercase tracking-wide mb-3">
              This Book
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <StatCard
                label="Total time"
                value={getFormattedReadingTime(bookStats.totalReadingTimeMs)}
              />
              <StatCard
                label="Sessions"
                value={String(bookStats.totalSessions)}
              />
              <StatCard
                label="Avg. session"
                value={getFormattedReadingTime(bookStats.averageSessionMs)}
              />
              {bookStats.pagesPerHour !== null && bookStats.pagesPerHour > 0 && (
                <StatCard
                  label="Reading speed"
                  value={`${bookStats.pagesPerHour.toFixed(1)} pg/hr`}
                />
              )}
              {bookStats.longestSessionMs !== null && bookStats.longestSessionMs > 0 && (
                <StatCard
                  label="Longest session"
                  value={getFormattedReadingTime(bookStats.longestSessionMs)}
                />
              )}
              {bookStats.totalPagesRead > 0 && (
                <StatCard
                  label="Pages read"
                  value={String(bookStats.totalPagesRead)}
                />
              )}
              {bookStats.firstReadDate && (
                <StatCard
                  label="First read"
                  value={formatDate(bookStats.firstReadDate)}
                />
              )}
              {dateFinished && (
                <StatCard
                  label="Completed"
                  value={formatDate(dateFinished)}
                  highlight
                />
              )}
            </div>
          </section>
        )}

        {/* No stats yet message */}
        {(!bookStats || bookStats.totalReadingTimeMs === 0) && (
          <section>
            <div className="bg-bg-deep rounded-lg p-4 text-center">
              <p className="text-sm text-text-secondary">
                Your reading statistics will appear here after you finish your first session.
              </p>
              <p className="text-xs text-text-secondary/70 mt-2">
                Stats are saved to the note's frontmatter.
              </p>
            </div>
          </section>
        )}
      </div>
    </aside>
  );
}

function StatCard({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-lg p-3 ${highlight ? 'bg-green-600/20' : 'bg-bg-deep'}`}>
      <div className={`text-lg font-semibold ${highlight ? 'text-green-500' : 'text-text-primary'}`}>{value}</div>
      <div className="text-xs text-text-secondary">{label}</div>
    </div>
  );
}

function formatDate(isoDate: string): string {
  const date = new Date(isoDate);
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
  });
}
