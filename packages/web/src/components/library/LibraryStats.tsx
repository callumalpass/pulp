import { useReadingGoals } from '../../hooks/useReadingGoals';
import { useLibraryStats } from '../../hooks/useLibraryStats';
import { useAnimatedCounter } from '../../hooks/useAnimatedCounter';
import { formatReadingTime } from '../../lib/format';

export function LibraryStats() {
  const { data, isLoading } = useReadingGoals();
  const { data: libraryStats } = useLibraryStats();

  if (isLoading || !data) {
    return <LibraryStatsSkeleton />;
  }

  const { streak, todayProgress, goals } = data;
  const todayMs = todayProgress?.totalDurationMs ?? 0;
  const goalMs = goals.dailyGoalMinutes * 60 * 1000;
  const goalMet = todayMs >= goalMs;
  const progressPercent = Math.min(100, Math.round((todayMs / goalMs) * 100));

  return (
    <div className="flex items-center gap-2 sm:gap-3 md:gap-5 text-sm overflow-x-auto scrollbar-thin pb-1 -mb-1 flex-nowrap min-w-0 max-w-full mask-fade-right md:flex-wrap md:overflow-x-visible min-h-[44px] scroll-smooth pr-12 md:pr-0" tabIndex={0} role="region" aria-label="Library statistics">
      {/* Today's reading time */}
      <div className="flex items-center gap-2 shrink-0">
        <div className="flex items-center gap-1.5 text-text-secondary">
          {/* Clock icon */}
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="opacity-80"
          >
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
          <span className="text-xs font-medium">Today</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={`font-semibold tabular-nums ${goalMet ? 'text-green-500' : 'text-text-primary'}`}>
            {formatReadingTime(todayMs, { showSeconds: false })}
          </span>
          {!goalMet && (
            <span className="text-text-secondary/60 text-xs font-medium">/ {goals.dailyGoalMinutes}m</span>
          )}
          {goalMet && (
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              className="text-green-500"
            >
              <path d="M20 6L9 17l-5-5" />
            </svg>
          )}
        </div>
        {/* Mini progress bar */}
        {!goalMet && (
          <AnimatedProgressBar percent={progressPercent} />
        )}
      </div>

      {/* Divider */}
      <div className="h-4 w-px bg-text-secondary/20 shrink-0" />

      {/* Streak indicator */}
      <div className="flex items-center gap-1.5 shrink-0">
        <span className={`${streak.currentStreak > 0 ? '' : 'grayscale opacity-50'}`} aria-hidden="true">
          {streak.currentStreak > 0 ? '🔥' : '💤'}
        </span>
        <span className="sr-only">{streak.currentStreak > 0 ? 'Active streak' : 'No active streak'}</span>
        <AnimatedStat
          value={streak.currentStreak}
          className={`font-medium ${streak.currentStreak > 0 ? 'text-text-primary' : 'text-text-secondary'}`}
        />
        <span className="text-text-secondary text-xs">
          {streak.currentStreak === 1 ? 'day' : 'days'}
        </span>
        {streak.graceDaysUsed > 0 && streak.currentStreak > 0 && (
          <span className="text-accent-secondary/70 text-xs" title={`${streak.graceDaysUsed} grace day${streak.graceDaysUsed === 1 ? '' : 's'} used`}>
            *
          </span>
        )}
        {streak.freezeDaysUsed > 0 && streak.currentStreak > 0 && (
          <span className="text-blue-400/70 text-xs" title={`${streak.freezeDaysUsed} freeze day${streak.freezeDaysUsed === 1 ? '' : 's'} used`}>
            ❄
          </span>
        )}
      </div>

      {/* Streak at-risk warning */}
      {data.streakAtRisk?.isAtRisk && streak.currentStreak > 0 && !data.streakAtRisk?.isFreezeDay && (
        <>
          <div className="h-4 w-px bg-text-secondary/20 shrink-0" />
          <div
            className="flex items-center gap-1.5 text-amber-500 shrink-0"
            role="status"
            aria-live="polite"
            title={`Read ${data.streakAtRisk.minutesRemaining}m more to keep your streak! ${data.streakAtRisk.hoursUntilMidnight.toFixed(1)}h until midnight.${data.streakAtRisk.graceDaysRemaining > 0 ? ` ${data.streakAtRisk.graceDaysRemaining} grace day${data.streakAtRisk.graceDaysRemaining === 1 ? '' : 's'} remaining.` : ''}`}
          >
            <WarningIcon className="w-3.5 h-3.5" />
            <span className="text-xs font-medium whitespace-nowrap">
              {data.streakAtRisk.minutesRemaining}m left
            </span>
            {data.streakAtRisk.hoursUntilMidnight <= 2 && (
              <span className="text-xs text-amber-400/80">
                ({data.streakAtRisk.hoursUntilMidnight.toFixed(1)}h left)
              </span>
            )}
          </div>
        </>
      )}

      {/* Freeze day indicator */}
      {data.streakAtRisk?.isFreezeDay && (
        <>
          <div className="h-4 w-px bg-text-secondary/20 shrink-0" />
          <div className="flex items-center gap-1.5 text-blue-400 shrink-0">
            <span aria-hidden="true">❄️</span>
            <span className="text-xs">Freeze day</span>
          </div>
        </>
      )}

      {/* Library stats (if available) */}
      {libraryStats && typeof libraryStats.totalBooks === 'number' && Number.isFinite(libraryStats.totalBooks) && libraryStats.totalBooks >= 0 && (
        <>
          <div className="h-4 w-px bg-text-secondary/20 shrink-0" />

          {/* Total books */}
          <div className="flex items-center gap-1.5 shrink-0" title={`${libraryStats.booksCompleted ?? 0} completed, ${libraryStats.booksInProgress ?? 0} in progress, ${libraryStats.booksUnread ?? 0} unread`}>
            <BookIcon className="w-3.5 h-3.5 text-text-secondary opacity-70" />
            <AnimatedStat value={libraryStats.totalBooks} className="font-medium text-text-primary" />
            <span className="text-text-secondary text-xs">books</span>
          </div>

          {/* Total reading time — hide on very small screens */}
          {libraryStats.totalReadingTimeMs > 0 && (
            <>
              <div className="h-4 w-px bg-text-secondary/20 shrink-0 hidden sm:block" />
              <div className="items-center gap-1.5 shrink-0 hidden sm:flex" title="Total reading time across all books">
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
              <div className="h-4 w-px bg-text-secondary/20 shrink-0 hidden md:block" />
              <div className="items-center gap-1.5 shrink-0 hidden md:flex" title="Total highlights across all books">
                <HighlightIcon className="w-3.5 h-3.5 text-text-secondary opacity-70" />
                <AnimatedStat value={libraryStats.totalHighlights} className="font-medium text-text-primary" />
                <span className="text-text-secondary text-xs">highlights</span>
              </div>
            </>
          )}

          {/* Books completed this year */}
          {typeof libraryStats.booksCompletedThisYear === 'number' && libraryStats.booksCompletedThisYear > 0 && (
            <>
              <div className="h-4 w-px bg-text-secondary/20 shrink-0 hidden md:block" />
              <div className="items-center gap-1.5 shrink-0 hidden md:flex" title={`${libraryStats.booksCompletedThisYear} book${libraryStats.booksCompletedThisYear === 1 ? '' : 's'} completed in ${libraryStats.currentYear}`}>
                <AnimatedStat value={libraryStats.booksCompletedThisYear} className="font-medium text-green-500" />
                <span className="text-text-secondary text-xs">in {libraryStats.currentYear}</span>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

function AnimatedStat({ value, className }: { value: number; className?: string }) {
  const safeValue = Number.isFinite(value) ? value : 0;
  const animated = useAnimatedCounter(safeValue, 600);
  // Belt-and-suspenders: ensure displayed value is always a valid integer
  const displayValue = Number.isFinite(animated) ? animated : safeValue;
  return <span className={`tabular-nums ${className ?? ''}`}>{String(displayValue)}</span>;
}

function AnimatedProgressBar({ percent }: { percent: number }) {
  const safePercent = Number.isFinite(percent) ? Math.min(100, Math.max(0, percent)) : 0;
  const animatedPercent = useAnimatedCounter(safePercent, 600);
  const displayPercent = Number.isFinite(animatedPercent) ? animatedPercent : safePercent;
  return (
    <div className="w-14 h-1.5 bg-bg-deep rounded-full overflow-hidden">
      <div
        className="h-full bg-accent-primary transition-[background-color] duration-300"
        style={{ width: `${displayPercent}%` }}
      />
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

function WarningIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

function LibraryStatsSkeleton() {
  return (
    <div className="flex items-center gap-3 md:gap-5 text-sm flex-wrap min-h-[44px]">
      {/* Today's reading time skeleton */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5">
          <div className="w-3.5 h-3.5 skeleton rounded" />
          <div className="w-8 h-3 skeleton rounded" />
        </div>
        <div className="w-10 h-4 skeleton rounded" />
        <div className="w-12 h-1.5 skeleton rounded-full" />
      </div>

      {/* Divider */}
      <div className="h-4 w-px bg-text-secondary/20 shrink-0" />

      {/* Streak skeleton */}
      <div className="flex items-center gap-1.5">
        <div className="w-4 h-4 skeleton rounded" />
        <div className="w-4 h-4 skeleton rounded" />
        <div className="w-8 h-3 skeleton rounded" />
      </div>

      {/* Divider */}
      <div className="h-4 w-px bg-text-secondary/20 shrink-0" />

      {/* Books skeleton */}
      <div className="flex items-center gap-1.5">
        <div className="w-3.5 h-3.5 skeleton rounded" />
        <div className="w-6 h-4 skeleton rounded" />
        <div className="w-10 h-3 skeleton rounded" />
      </div>
    </div>
  );
}
