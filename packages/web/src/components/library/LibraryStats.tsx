import { useReadingGoals } from '../../hooks/useReadingGoals';
import { useLibraryStats } from '../../hooks/useLibraryStats';
import { formatReadingTime } from '../../lib/format';

export function LibraryStats() {
  const { data, isLoading } = useReadingGoals();
  const { data: libraryStats } = useLibraryStats();

  if (isLoading || !data) {
    return null;
  }

  const { streak, todayProgress, goals } = data;
  const todayMs = todayProgress?.totalDurationMs ?? 0;
  const goalMs = goals.dailyGoalMinutes * 60 * 1000;
  const goalMet = todayMs >= goalMs;
  const progressPercent = Math.min(100, Math.round((todayMs / goalMs) * 100));

  return (
    <div className="flex items-center gap-4 text-sm flex-wrap">
      {/* Today's reading time */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5 text-text-secondary">
          {/* Clock icon */}
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="opacity-70"
          >
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
          <span className="text-xs">Today</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={`font-medium ${goalMet ? 'text-green-500' : 'text-text-primary'}`}>
            {formatReadingTime(todayMs, { showSeconds: false })}
          </span>
          {!goalMet && (
            <span className="text-text-secondary/60 text-xs">/ {goals.dailyGoalMinutes}m</span>
          )}
          {goalMet && (
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="text-green-500"
            >
              <path d="M20 6L9 17l-5-5" />
            </svg>
          )}
        </div>
        {/* Mini progress bar */}
        {!goalMet && (
          <div className="w-12 h-1.5 bg-bg-deep rounded-full overflow-hidden">
            <div
              className="h-full bg-accent-primary transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        )}
      </div>

      {/* Divider */}
      <div className="h-4 w-px bg-text-secondary/20" />

      {/* Streak indicator */}
      <div className="flex items-center gap-1.5">
        <span className={`${streak.currentStreak > 0 ? '' : 'grayscale opacity-50'}`}>
          {streak.currentStreak > 0 ? '🔥' : '💤'}
        </span>
        <span className={`font-medium ${streak.currentStreak > 0 ? 'text-text-primary' : 'text-text-secondary'}`}>
          {streak.currentStreak}
        </span>
        <span className="text-text-secondary text-xs">
          {streak.currentStreak === 1 ? 'day' : 'days'}
        </span>
        {streak.graceDaysUsed > 0 && streak.currentStreak > 0 && (
          <span className="text-accent-secondary/70 text-xs" title={`${streak.graceDaysUsed} grace day${streak.graceDaysUsed === 1 ? '' : 's'} used`}>
            *
          </span>
        )}
      </div>

      {/* Library stats (if available) */}
      {libraryStats && (
        <>
          <div className="h-4 w-px bg-text-secondary/20" />

          {/* Total books */}
          <div className="flex items-center gap-1.5" title={`${libraryStats.booksCompleted} completed, ${libraryStats.booksInProgress} in progress, ${libraryStats.booksUnread} unread`}>
            <BookIcon className="w-3.5 h-3.5 text-text-secondary opacity-70" />
            <span className="font-medium text-text-primary">{libraryStats.totalBooks}</span>
            <span className="text-text-secondary text-xs">books</span>
          </div>

          {/* Total reading time */}
          {libraryStats.totalReadingTimeMs > 0 && (
            <>
              <div className="h-4 w-px bg-text-secondary/20" />
              <div className="flex items-center gap-1.5" title="Total reading time across all books">
                <span className="font-medium text-accent-primary">
                  {formatReadingTime(libraryStats.totalReadingTimeMs, { showSeconds: false })}
                </span>
                <span className="text-text-secondary text-xs">total</span>
              </div>
            </>
          )}

          {/* Total highlights */}
          {libraryStats.totalHighlights > 0 && (
            <>
              <div className="h-4 w-px bg-text-secondary/20" />
              <div className="flex items-center gap-1.5" title="Total highlights across all books">
                <HighlightIcon className="w-3.5 h-3.5 text-text-secondary opacity-70" />
                <span className="font-medium text-text-primary">{libraryStats.totalHighlights}</span>
                <span className="text-text-secondary text-xs">highlights</span>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

function BookIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  );
}

function HighlightIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
    </svg>
  );
}
