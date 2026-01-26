import { useEffect, useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useReadingStatsStore } from '../../../stores/readingStats';
import { useIdleDetection } from '../../../hooks/useIdleDetection';
import { api } from '../../../lib/api';

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

  // Fetch reading history for the chart
  const { data: historyData } = useQuery({
    queryKey: ['reading-history', noteId],
    queryFn: () => api.readingStats.getHistory(noteId, 14),
    staleTime: 60000, // Refresh every minute
  });

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

        {/* Reading History Chart */}
        {historyData?.history && historyData.history.some(h => h.durationMs > 0) && (
          <section>
            <h3 className="text-xs font-medium text-text-secondary uppercase tracking-wide mb-3">
              Recent Activity
            </h3>
            <div className="bg-bg-deep rounded-lg p-4">
              <ReadingHistoryChart
                history={historyData.history}
                sessionDuration={sessionDuration}
                getFormattedReadingTime={getFormattedReadingTime}
              />
            </div>
          </section>
        )}

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

interface ReadingHistoryChartProps {
  history: Array<{ date: string; durationMs: number; sessions: number; pagesRead: number }>;
  sessionDuration: number;
  getFormattedReadingTime: (ms: number) => string;
}

function ReadingHistoryChart({ history, sessionDuration, getFormattedReadingTime }: ReadingHistoryChartProps) {
  const today = new Date().toISOString().split('T')[0];

  // Add current session to today's data for live updates
  const adjustedHistory = useMemo(() => {
    return history.map(h => ({
      ...h,
      durationMs: h.date === today ? h.durationMs + sessionDuration : h.durationMs,
    }));
  }, [history, sessionDuration, today]);

  // Calculate max duration for scaling
  const maxDuration = useMemo(() => {
    return Math.max(...adjustedHistory.map(h => h.durationMs), 60000); // Minimum 1 minute for scale
  }, [adjustedHistory]);

  // Calculate total for the period
  const totalDuration = useMemo(() => {
    return adjustedHistory.reduce((sum, h) => sum + h.durationMs, 0);
  }, [adjustedHistory]);

  const daysWithActivity = useMemo(() => {
    return adjustedHistory.filter(h => h.durationMs > 0).length;
  }, [adjustedHistory]);

  return (
    <div className="space-y-3">
      {/* Bar chart */}
      <div className="flex items-end gap-1 h-20">
        {adjustedHistory.map((day) => {
          const isToday = day.date === today;
          const height = Math.max(2, (day.durationMs / maxDuration) * 100);
          const hasActivity = day.durationMs > 0;

          return (
            <div
              key={day.date}
              className="flex-1 flex flex-col items-center"
              title={`${formatChartDate(day.date)}: ${getFormattedReadingTime(day.durationMs)}`}
            >
              <div
                className={`w-full rounded-t transition-all duration-300 ${
                  hasActivity
                    ? isToday
                      ? 'bg-accent-primary'
                      : 'bg-accent-primary/60'
                    : 'bg-text-secondary/20'
                }`}
                style={{ height: `${height}%`, minHeight: '2px' }}
              />
            </div>
          );
        })}
      </div>

      {/* Date labels (show first, middle, last) */}
      <div className="flex justify-between text-[10px] text-text-secondary/70">
        <span>{formatChartDate(adjustedHistory[0]?.date)}</span>
        <span>{formatChartDate(adjustedHistory[Math.floor(adjustedHistory.length / 2)]?.date)}</span>
        <span>Today</span>
      </div>

      {/* Summary stats */}
      <div className="flex justify-between pt-2 border-t border-text-secondary/10">
        <div className="text-center">
          <div className="text-sm font-semibold text-text-primary">
            {getFormattedReadingTime(totalDuration)}
          </div>
          <div className="text-[10px] text-text-secondary">Last 2 weeks</div>
        </div>
        <div className="text-center">
          <div className="text-sm font-semibold text-text-primary">
            {daysWithActivity}
          </div>
          <div className="text-[10px] text-text-secondary">Days active</div>
        </div>
        <div className="text-center">
          <div className="text-sm font-semibold text-text-primary">
            {daysWithActivity > 0 ? getFormattedReadingTime(totalDuration / daysWithActivity) : '0m'}
          </div>
          <div className="text-[10px] text-text-secondary">Avg per day</div>
        </div>
      </div>
    </div>
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

function formatChartDate(dateStr: string | undefined): string {
  if (!dateStr) return '';
  const date = new Date(dateStr + 'T12:00:00');
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
