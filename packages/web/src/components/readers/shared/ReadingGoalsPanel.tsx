import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { ReadingGoalsResponse, ReadingStreak, DailyReadingSummary, StreakRiskInfo, WeeklyReadingSummary } from '@pulp/shared';
import { api } from '../../../lib/api';
import { useReadingStatsStore } from '../../../stores/readingStats';

interface ReadingGoalsPanelProps {
  onClose: () => void;
}

export function ReadingGoalsPanel({ onClose }: ReadingGoalsPanelProps) {
  const queryClient = useQueryClient();
  const { getFormattedReadingTime, getActiveSessionDuration } = useReadingStatsStore();

  const [sessionDuration, setSessionDuration] = useState(0);
  const [editingGoal, setEditingGoal] = useState(false);
  const [goalInput, setGoalInput] = useState('');
  const [gracePeriodInput, setGracePeriodInput] = useState('');

  // Fetch reading goals data
  const { data, isLoading, error } = useQuery<ReadingGoalsResponse>({
    queryKey: ['reading-goals'],
    queryFn: () => api.readingGoals.get(),
    refetchInterval: 60000, // Refetch every minute to keep progress updated
  });

  // Update goals mutation
  const updateGoalsMutation = useMutation({
    mutationFn: (updates: { dailyGoalMinutes?: number; gracePeriodDays?: number }) =>
      api.readingGoals.update(updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reading-goals'] });
      setEditingGoal(false);
    },
  });

  // Update session duration every second
  useEffect(() => {
    const interval = setInterval(() => {
      setSessionDuration(getActiveSessionDuration());
    }, 1000);
    return () => clearInterval(interval);
  }, [getActiveSessionDuration]);

  // Initialize goal input when data loads
  useEffect(() => {
    if (data?.goals) {
      setGoalInput(String(data.goals.dailyGoalMinutes));
      setGracePeriodInput(String(data.goals.gracePeriodDays ?? 1));
    }
  }, [data?.goals]);

  if (isLoading) {
    return (
      <aside
        className="w-80 bg-bg-surface border-l border-text-secondary/10 flex flex-col overflow-hidden"
        role="complementary"
        aria-label="Reading goals"
      >
        <header className="flex items-center justify-between px-4 py-3 border-b border-text-secondary/10">
          <h2 className="text-sm font-semibold text-text-primary">Reading Goals</h2>
          <CloseButton onClick={onClose} />
        </header>
        <div className="flex-1 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-accent-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </aside>
    );
  }

  if (error || !data) {
    return (
      <aside
        className="w-80 bg-bg-surface border-l border-text-secondary/10 flex flex-col overflow-hidden"
        role="complementary"
        aria-label="Reading goals"
      >
        <header className="flex items-center justify-between px-4 py-3 border-b border-text-secondary/10">
          <h2 className="text-sm font-semibold text-text-primary">Reading Goals</h2>
          <CloseButton onClick={onClose} />
        </header>
        <div className="flex-1 flex items-center justify-center p-4">
          <p className="text-sm text-text-secondary text-center">
            Failed to load reading goals. Please try again.
          </p>
        </div>
      </aside>
    );
  }

  const { goals, streak, todayProgress, weekHistory, weekSummary, streakAtRisk } = data;

  // Calculate today's progress including current session
  const todayTotalMs = todayProgress.totalDurationMs + sessionDuration;
  const goalMs = goals.dailyGoalMinutes * 60 * 1000;
  const progressPercent = Math.min(100, (todayTotalMs / goalMs) * 100);
  const goalMet = todayTotalMs >= goalMs;

  const handleSaveGoal = () => {
    const minutes = parseInt(goalInput, 10);
    const graceDays = parseInt(gracePeriodInput, 10);
    if (minutes >= 1 && minutes <= 1440 && graceDays >= 0 && graceDays <= 7) {
      updateGoalsMutation.mutate({
        dailyGoalMinutes: minutes,
        gracePeriodDays: graceDays,
      });
    }
  };

  return (
    <aside
      className="w-80 bg-bg-surface border-l border-text-secondary/10 flex flex-col overflow-hidden"
      role="complementary"
      aria-label="Reading goals"
    >
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-text-secondary/10">
        <h2 className="text-sm font-semibold text-text-primary">Reading Goals</h2>
        <CloseButton onClick={onClose} />
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Today's Progress */}
        <section>
          <h3 className="text-xs font-medium text-text-secondary uppercase tracking-wide mb-3">
            Today's Progress
          </h3>
          <div className="bg-bg-deep rounded-lg p-4">
            {/* Circular progress */}
            <div className="flex items-center justify-center mb-4">
              <CircularProgress
                progress={progressPercent}
                size={120}
                strokeWidth={8}
                goalMet={goalMet}
              >
                <div className="text-center">
                  <div className="text-2xl font-bold text-text-primary">
                    {getFormattedReadingTime(todayTotalMs)}
                  </div>
                  <div className="text-xs text-text-secondary">
                    of {goals.dailyGoalMinutes}m goal
                  </div>
                </div>
              </CircularProgress>
            </div>

            {/* Goal status */}
            {goalMet ? (
              <div className="flex items-center justify-center gap-2 text-green-500">
                <CheckIcon />
                <span className="text-sm font-medium">Goal achieved!</span>
              </div>
            ) : (
              <div className="text-center text-sm text-text-secondary">
                {getFormattedReadingTime(Math.max(0, goalMs - todayTotalMs))} to go
              </div>
            )}

            {/* Streak at risk warning */}
            {!goalMet && streakAtRisk && streakAtRisk.isAtRisk && (
              <StreakRiskWarning
                streakAtRisk={streakAtRisk}
                currentStreak={streak.currentStreak}
                getFormattedReadingTime={getFormattedReadingTime}
              />
            )}

            {/* Edit goal */}
            <div className="mt-4 pt-3 border-t border-text-secondary/10">
              {editingGoal ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-text-secondary w-16">Daily goal</label>
                    <input
                      type="number"
                      min="1"
                      max="1440"
                      value={goalInput}
                      onChange={(e) => setGoalInput(e.target.value)}
                      className="flex-1 px-2 py-1 text-sm bg-bg-surface border border-text-secondary/20 rounded focus:outline-none focus:border-accent-primary"
                      aria-label="Daily goal in minutes"
                    />
                    <span className="text-xs text-text-secondary">min</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-text-secondary w-16">Grace days</label>
                    <input
                      type="number"
                      min="0"
                      max="7"
                      value={gracePeriodInput}
                      onChange={(e) => setGracePeriodInput(e.target.value)}
                      className="flex-1 px-2 py-1 text-sm bg-bg-surface border border-text-secondary/20 rounded focus:outline-none focus:border-accent-primary"
                      aria-label="Grace period days"
                      title="Days you can miss without breaking your streak"
                    />
                    <span className="text-xs text-text-secondary">days</span>
                  </div>
                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={() => {
                        setEditingGoal(false);
                        setGoalInput(String(goals.dailyGoalMinutes));
                        setGracePeriodInput(String(goals.gracePeriodDays ?? 1));
                      }}
                      className="px-2 py-1 text-xs text-text-secondary hover:text-text-primary"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveGoal}
                      disabled={updateGoalsMutation.isPending}
                      className="px-2 py-1 text-xs bg-accent-primary text-white rounded hover:bg-accent-primary/80 disabled:opacity-50"
                    >
                      Save
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setEditingGoal(true)}
                  className="w-full text-xs text-text-secondary hover:text-accent-primary transition-colors"
                >
                  Edit goals
                </button>
              )}
            </div>
          </div>
        </section>

        {/* Streak */}
        <section>
          <h3 className="text-xs font-medium text-text-secondary uppercase tracking-wide mb-3">
            Reading Streak
          </h3>
          <div className="bg-bg-deep rounded-lg p-4">
            <StreakDisplay streak={streak} goalMetToday={goalMet} streakAtRisk={streakAtRisk} />
          </div>
        </section>

        {/* Week Activity */}
        <section>
          <h3 className="text-xs font-medium text-text-secondary uppercase tracking-wide mb-3">
            This Week
          </h3>
          <div className="bg-bg-deep rounded-lg p-4">
            <WeekActivityGrid history={weekHistory} todayMs={todayTotalMs} goalMs={goalMs} />
          </div>
        </section>

        {/* Week Stats */}
        <section>
          <WeekSummarySection
            weekSummary={weekSummary}
            weekHistory={weekHistory}
            goalMet={goalMet}
            sessionDuration={sessionDuration}
            getFormattedReadingTime={getFormattedReadingTime}
          />
        </section>
      </div>
    </aside>
  );
}

function CloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-7 h-7 rounded flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-bg-deep transition-colors"
      aria-label="Close goals panel"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M18 6L6 18M6 6l12 12" />
      </svg>
    </button>
  );
}

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

interface CircularProgressProps {
  progress: number;
  size: number;
  strokeWidth: number;
  goalMet: boolean;
  children: React.ReactNode;
}

function CircularProgress({ progress, size, strokeWidth, goalMet, children }: CircularProgressProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (progress / 100) * circumference;

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="transform -rotate-90">
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-text-secondary/20"
        />
        {/* Progress circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className={`transition-colors duration-500 ${goalMet ? 'text-green-500' : 'text-accent-primary'}`}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        {children}
      </div>
    </div>
  );
}

interface StreakDisplayProps {
  streak: ReadingStreak;
  goalMetToday: boolean;
  streakAtRisk: StreakRiskInfo | null;
}

function StreakDisplay({ streak, goalMetToday, streakAtRisk }: StreakDisplayProps) {
  const { currentStreak, longestStreak, graceDaysUsed } = streak;

  // Determine if streak is at risk (goal not met today and it's not a fresh streak)
  const atRisk = !goalMetToday && currentStreak > 0;

  return (
    <div className="space-y-4">
      {/* Current streak */}
      <div className="flex items-center gap-3">
        <div className={`text-3xl ${currentStreak > 0 ? '' : 'grayscale opacity-50'}`}>
          🔥
        </div>
        <div>
          <div className="text-2xl font-bold text-text-primary">
            {currentStreak} {currentStreak === 1 ? 'day' : 'days'}
          </div>
          <div className="text-xs text-text-secondary">
            {atRisk ? (
              <span className="text-yellow-500">Complete today's goal to continue!</span>
            ) : currentStreak > 0 ? (
              graceDaysUsed > 0 ? (
                <span>Current streak <span className="text-accent-secondary">({graceDaysUsed} grace {graceDaysUsed === 1 ? 'day' : 'days'} used)</span></span>
              ) : (
                'Current streak'
              )
            ) : (
              'Start your streak today!'
            )}
          </div>
        </div>
      </div>

      {/* Grace days remaining indicator */}
      {streakAtRisk && currentStreak > 0 && streakAtRisk.graceDaysRemaining > 0 && !goalMetToday && (
        <div className="flex items-center justify-between text-xs pt-2 border-t border-text-secondary/10">
          <span className="text-text-secondary">Grace days available</span>
          <span className="text-accent-secondary font-medium">
            {streakAtRisk.graceDaysRemaining} {streakAtRisk.graceDaysRemaining === 1 ? 'day' : 'days'}
          </span>
        </div>
      )}

      {/* Longest streak */}
      {longestStreak > 0 && (
        <div className="flex items-center justify-between pt-3 border-t border-text-secondary/10">
          <span className="text-sm text-text-secondary">Longest streak</span>
          <span className="text-sm font-semibold text-text-primary">
            {longestStreak} {longestStreak === 1 ? 'day' : 'days'}
          </span>
        </div>
      )}
    </div>
  );
}

interface WeekActivityGridProps {
  history: DailyReadingSummary[];
  todayMs: number;
  goalMs: number;
}

function WeekActivityGrid({ history, todayMs, goalMs }: WeekActivityGridProps) {
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const today = new Date().toISOString().split('T')[0];

  return (
    <div className="grid grid-cols-7 gap-1">
      {history.map((day) => {
        const isToday = day.date === today;
        // For today, use the live todayMs value
        const effectiveDuration = isToday ? todayMs : day.totalDurationMs;
        const effectiveGoalMet = effectiveDuration >= goalMs;
        const progress = Math.min(100, (effectiveDuration / goalMs) * 100);

        // Get day of week
        const date = new Date(day.date + 'T12:00:00');
        const dayName = dayNames[date.getDay()];

        return (
          <div key={day.date} className="flex flex-col items-center gap-1">
            <span className="text-[10px] text-text-secondary">{dayName}</span>
            <div
              className={`w-8 h-8 rounded-md flex items-center justify-center text-xs font-medium transition-colors ${
                effectiveGoalMet
                  ? 'bg-green-500/20 text-green-500'
                  : progress > 0
                  ? 'bg-accent-primary/20 text-accent-primary'
                  : 'bg-text-secondary/10 text-text-secondary/50'
              } ${isToday ? 'ring-2 ring-accent-primary/50' : ''}`}
              title={`${day.date}: ${Math.round(effectiveDuration / 60000)}m`}
            >
              {effectiveGoalMet ? (
                <CheckIcon />
              ) : progress > 0 ? (
                `${Math.round(progress)}%`
              ) : (
                '—'
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function StatCard({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-lg p-3 ${highlight ? 'bg-green-500/10' : 'bg-bg-deep'}`}>
      <div className={`text-lg font-semibold ${highlight ? 'text-green-500' : 'text-text-primary'}`}>{value}</div>
      <div className="text-xs text-text-secondary">{label}</div>
    </div>
  );
}

interface StreakRiskWarningProps {
  streakAtRisk: StreakRiskInfo;
  currentStreak: number;
  getFormattedReadingTime: (ms: number) => string;
}

function StreakRiskWarning({ streakAtRisk, currentStreak, getFormattedReadingTime }: StreakRiskWarningProps) {
  const hoursLeft = Math.floor(streakAtRisk.hoursUntilMidnight);
  const minutesLeft = Math.round((streakAtRisk.hoursUntilMidnight - hoursLeft) * 60);

  return (
    <div className="mt-3 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
      <div className="flex items-center gap-2 text-yellow-500 mb-1">
        <AlertIcon />
        <span className="text-sm font-medium">Streak at risk!</span>
      </div>
      <div className="text-xs text-text-secondary space-y-1">
        <p>
          Read {getFormattedReadingTime(streakAtRisk.minutesRemaining * 60000)} more to maintain your{' '}
          <span className="text-text-primary font-medium">{currentStreak} day</span> streak.
        </p>
        <p className="text-text-secondary/70">
          {hoursLeft > 0 ? `${hoursLeft}h ${minutesLeft}m` : `${minutesLeft}m`} until midnight
        </p>
      </div>
    </div>
  );
}

function AlertIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

interface WeekSummarySectionProps {
  weekSummary: WeeklyReadingSummary;
  weekHistory: DailyReadingSummary[];
  goalMet: boolean;
  sessionDuration: number;
  getFormattedReadingTime: (ms: number) => string;
}

function WeekSummarySection({
  weekSummary,
  weekHistory,
  goalMet,
  sessionDuration,
  getFormattedReadingTime,
}: WeekSummarySectionProps) {
  // Calculate live values including current session
  const totalWithSession = weekSummary.totalDurationMs + sessionDuration;
  const daysGoalMetLive = weekHistory.filter((d, i) => {
    const isToday = i === weekHistory.length - 1;
    return isToday ? goalMet : d.goalMet;
  }).length;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <StatCard
          label="Week total"
          value={getFormattedReadingTime(totalWithSession)}
        />
        <StatCard
          label="Days met goal"
          value={`${daysGoalMetLive}/${weekHistory.length}`}
          highlight={daysGoalMetLive === weekHistory.length}
        />
      </div>

      {/* Additional week stats */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard
          label="Books read"
          value={String(weekSummary.booksRead)}
        />
        <StatCard
          label="Avg per day"
          value={getFormattedReadingTime(weekSummary.averageDailyMs)}
        />
      </div>

      {/* Weekly goal progress (if set) */}
      {weekSummary.weeklyGoalMet && (
        <div className="flex items-center justify-center gap-2 p-2 bg-green-500/10 rounded-lg text-green-500">
          <CheckIcon />
          <span className="text-sm font-medium">Weekly goal achieved!</span>
        </div>
      )}
    </div>
  );
}
