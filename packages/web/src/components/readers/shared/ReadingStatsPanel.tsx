import { useEffect, useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useReadingStatsStore } from '../../../stores/readingStats';
import { useIdleDetection } from '../../../hooks/useIdleDetection';
import { useReadingPaceTrends } from '../../../hooks/useReadingPaceTrends';
import { api } from '../../../lib/api';
import type { TimeOfDayPattern, PreferredReadingTime } from '@pulp/shared';

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

  // Fetch reading pace trends and time-of-day patterns
  const { data: paceTrends } = useReadingPaceTrends(noteId, 30);

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

        {/* Reading Pace Trends */}
        {paceTrends && paceTrends.paceData.length >= 2 && (
          <section>
            <h3 className="text-xs font-medium text-text-secondary uppercase tracking-wide mb-3">
              Reading Pace
            </h3>
            <div className="bg-bg-deep rounded-lg p-4">
              <ReadingPaceChart
                paceData={paceTrends.paceData}
                trend={paceTrends.trend}
                currentPace={paceTrends.currentPace}
                overallAverage={paceTrends.overallAverage}
              />
            </div>
          </section>
        )}

        {/* Time of Day Patterns */}
        {paceTrends && paceTrends.timeOfDayPatterns.some(p => p.totalSessions > 0) && (
          <section>
            <h3 className="text-xs font-medium text-text-secondary uppercase tracking-wide mb-3">
              Reading Time Patterns
            </h3>
            <div className="bg-bg-deep rounded-lg p-4">
              <TimeOfDayChart
                patterns={paceTrends.timeOfDayPatterns}
                preferredTime={paceTrends.preferredReadingTime}
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
              {bookStats.estimatedCompletionDate && !dateFinished && (
                <StatCard
                  label="Est. completion"
                  value={formatDate(bookStats.estimatedCompletionDate)}
                  secondary
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

function StatCard({ label, value, highlight, secondary }: { label: string; value: string; highlight?: boolean; secondary?: boolean }) {
  return (
    <div className={`rounded-lg p-3 ${highlight ? 'bg-green-600/20' : secondary ? 'bg-accent-primary/10' : 'bg-bg-deep'}`}>
      <div className={`text-lg font-semibold ${highlight ? 'text-green-500' : secondary ? 'text-accent-primary' : 'text-text-primary'}`}>{value}</div>
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

interface ReadingPaceChartProps {
  paceData: Array<{ date: string; pagesPerHour: number | null; pagesRead: number; durationMs: number }>;
  trend: 'improving' | 'declining' | 'stable' | null;
  currentPace: number | null;
  overallAverage: number | null;
}

function ReadingPaceChart({ paceData, trend, currentPace, overallAverage }: ReadingPaceChartProps) {
  // Filter to sessions with valid pace data
  const validData = paceData.filter(p => p.pagesPerHour !== null && p.pagesPerHour > 0);

  const maxPace = useMemo(() => {
    const paces = validData.map(p => p.pagesPerHour!);
    return Math.max(...paces, 1);
  }, [validData]);

  const minPace = useMemo(() => {
    const paces = validData.map(p => p.pagesPerHour!);
    return Math.min(...paces, 0);
  }, [validData]);

  // Show last 15 sessions for the chart
  const chartData = validData.slice(-15);

  return (
    <div className="space-y-3">
      {/* Pace trend indicator */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg font-semibold text-text-primary">
            {currentPace !== null ? `${currentPace} pg/hr` : '--'}
          </span>
          {trend && (
            <span className={`text-xs px-1.5 py-0.5 rounded flex items-center gap-0.5 ${
              trend === 'improving' ? 'bg-green-500/20 text-green-500' :
              trend === 'declining' ? 'bg-red-500/20 text-red-500' :
              'bg-text-secondary/20 text-text-secondary'
            }`}>
              {trend === 'improving' && <TrendUpIcon className="w-3 h-3" />}
              {trend === 'declining' && <TrendDownIcon className="w-3 h-3" />}
              {trend === 'stable' && <TrendStableIcon className="w-3 h-3" />}
              {trend.charAt(0).toUpperCase() + trend.slice(1)}
            </span>
          )}
        </div>
        {overallAverage !== null && (
          <div className="text-xs text-text-secondary">
            Avg: {overallAverage} pg/hr
          </div>
        )}
      </div>

      {/* Mini line chart visualization */}
      {chartData.length >= 2 && (
        <div className="relative h-16">
          {/* Y-axis range markers */}
          <div className="absolute inset-y-0 left-0 w-8 flex flex-col justify-between text-[9px] text-text-secondary/50">
            <span>{Math.round(maxPace)}</span>
            <span>{Math.round(minPace)}</span>
          </div>

          {/* Chart area */}
          <div className="ml-9 h-full flex items-end gap-0.5">
            {chartData.map((point, index) => {
              const normalizedHeight = maxPace > minPace
                ? ((point.pagesPerHour! - minPace) / (maxPace - minPace)) * 100
                : 50;
              const height = Math.max(4, Math.min(100, normalizedHeight));
              const isLatest = index === chartData.length - 1;

              return (
                <div
                  key={`${point.date}-${index}`}
                  className="flex-1 flex flex-col items-center justify-end"
                  title={`${formatChartDate(point.date)}: ${point.pagesPerHour} pg/hr (${point.pagesRead} pages)`}
                >
                  <div
                    className={`w-full max-w-3 rounded-t transition-all ${
                      isLatest ? 'bg-accent-primary' : 'bg-accent-primary/50'
                    }`}
                    style={{ height: `${height}%`, minHeight: '4px' }}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="flex justify-between text-[10px] text-text-secondary/70 pt-1">
        <span>{validData.length} sessions</span>
        <span>Recent pace over time</span>
      </div>
    </div>
  );
}

interface TimeOfDayChartProps {
  patterns: TimeOfDayPattern[];
  preferredTime: PreferredReadingTime | null;
}

function TimeOfDayChart({ patterns, preferredTime }: TimeOfDayChartProps) {
  // Group into 4-hour periods for a cleaner visualization
  const periods = useMemo(() => {
    const periodData = [
      { name: 'Night', range: '12-4am', hours: [0, 1, 2, 3], sessions: 0, durationMs: 0 },
      { name: 'Early', range: '4-8am', hours: [4, 5, 6, 7], sessions: 0, durationMs: 0 },
      { name: 'Morning', range: '8am-12pm', hours: [8, 9, 10, 11], sessions: 0, durationMs: 0 },
      { name: 'Afternoon', range: '12-4pm', hours: [12, 13, 14, 15], sessions: 0, durationMs: 0 },
      { name: 'Evening', range: '4-8pm', hours: [16, 17, 18, 19], sessions: 0, durationMs: 0 },
      { name: 'Night', range: '8pm-12am', hours: [20, 21, 22, 23], sessions: 0, durationMs: 0 },
    ];

    for (const pattern of patterns) {
      const period = periodData.find(p => p.hours.includes(pattern.hour));
      if (period) {
        period.sessions += pattern.totalSessions;
        period.durationMs += pattern.totalDurationMs;
      }
    }

    return periodData;
  }, [patterns]);

  const maxSessions = Math.max(...periods.map(p => p.sessions), 1);

  // Determine period names for display
  const periodLabels = ['Night', 'Early', 'Morning', 'Afternoon', 'Evening', 'Night'];

  return (
    <div className="space-y-3">
      {/* Preferred reading time callout */}
      {preferredTime && (
        <div className="flex items-center gap-2 text-sm">
          <ClockIcon className="w-4 h-4 text-accent-primary" />
          <span className="text-text-secondary">
            You read most in the{' '}
            <span className="text-text-primary font-medium">
              {preferredTime.peakPeriod}
            </span>
            {' '}({preferredTime.percentageInPeakPeriod}% of sessions)
          </span>
        </div>
      )}

      {/* Bar chart by time period */}
      <div className="space-y-1.5">
        {periods.map((period, index) => {
          const width = Math.max(4, (period.sessions / maxSessions) * 100);
          const isPeak = preferredTime && periodLabels[index].toLowerCase() === preferredTime.peakPeriod;

          return (
            <div key={`${period.name}-${index}`} className="flex items-center gap-2">
              <div className="w-16 text-[10px] text-text-secondary truncate" title={period.range}>
                {period.range}
              </div>
              <div className="flex-1 h-4 bg-bg-surface rounded overflow-hidden">
                <div
                  className={`h-full rounded transition-all ${
                    isPeak ? 'bg-accent-primary' : 'bg-accent-primary/40'
                  }`}
                  style={{ width: `${width}%`, minWidth: period.sessions > 0 ? '4px' : '0' }}
                />
              </div>
              <div className="w-8 text-[10px] text-text-secondary text-right">
                {period.sessions > 0 ? period.sessions : '-'}
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="text-[10px] text-text-secondary/70 text-center pt-1">
        Sessions by time of day
      </div>
    </div>
  );
}

function TrendUpIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
      <polyline points="17 6 23 6 23 12" />
    </svg>
  );
}

function TrendDownIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="23 18 13.5 8.5 8.5 13.5 1 6" />
      <polyline points="17 18 23 18 23 12" />
    </svg>
  );
}

function TrendStableIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="1" y1="12" x2="23" y2="12" />
    </svg>
  );
}

function ClockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}
