import { useReadingGoals } from '../../hooks/useReadingGoals';
import { formatReadingTime } from '../../lib/format';

export function LibraryStats() {
  const { data, isLoading } = useReadingGoals();

  if (isLoading || !data) {
    return null;
  }

  const { streak, todayProgress, goals } = data;
  const todayMs = todayProgress?.totalDurationMs ?? 0;
  const goalMs = goals.dailyGoalMinutes * 60 * 1000;
  const goalMet = todayMs >= goalMs;
  const progressPercent = Math.min(100, Math.round((todayMs / goalMs) * 100));

  return (
    <div className="flex items-center gap-4 text-sm">
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
    </div>
  );
}
