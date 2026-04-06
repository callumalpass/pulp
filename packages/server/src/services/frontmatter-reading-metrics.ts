import type {
  ReadingStats,
  ProgressMilestone,
  ProgressMilestoneRecord,
  ReadingMomentum,
  SessionQuality,
} from '@pulp/shared';

export interface DailyReadingEntryLike {
  date: string;
  durationMs: number;
  sessions?: number;
  pagesRead?: number;
}

export interface ReadingSessionLike {
  startTime: string;
  endTime: string;
  durationMs: number;
  pagesRead: number;
  startPage: number;
  endPage: number;
  hourOfDay?: number;
  quality?: SessionQuality;
  idlePauseCount?: number;
  idlePauseTotalMs?: number;
}

interface ComputeReadingStatsOptions {
  history: DailyReadingEntryLike[];
  sessions: ReadingSessionLike[];
  totalPages: number | null;
  progress: number;
  legacyStats?: ReadingStats | null;
}

/**
 * Calculate session quality based on idle pause metrics.
 */
export function calculateSessionQuality(
  durationMs: number,
  idlePauseCount: number | undefined,
  idlePauseTotalMs: number | undefined
): SessionQuality {
  if (durationMs < 5 * 60 * 1000) {
    return 'normal';
  }

  const pauseCount = idlePauseCount ?? 0;
  const pauseTotalMs = idlePauseTotalMs ?? 0;
  const idlePercentage = durationMs > 0 ? (pauseTotalMs / durationMs) * 100 : 0;

  if (pauseCount === 0 && durationMs >= 30 * 60 * 1000) {
    return 'deep';
  }

  if (pauseCount <= 1 && idlePercentage < 5) {
    return 'focused';
  }

  if (pauseCount >= 5 || idlePercentage > 15) {
    return 'distracted';
  }

  return 'normal';
}

/**
 * Return all progress milestones crossed in this update.
 */
export function checkMilestones(
  previousProgress: number,
  currentProgress: number,
  existingMilestones: ProgressMilestoneRecord[]
): ProgressMilestone[] {
  const milestones: ProgressMilestone[] = [10, 25, 50, 75, 100];
  const recordedMilestones = new Set(existingMilestones.map((m) => m.milestone));

  const crossed: ProgressMilestone[] = [];
  for (const milestone of milestones) {
    if (
      currentProgress >= milestone &&
      previousProgress < milestone &&
      !recordedMilestones.has(milestone)
    ) {
      crossed.push(milestone);
    }
  }

  return crossed;
}

function daysBetweenDates(date1: string, date2: string): number {
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  const diffTime = Math.abs(d2.getTime() - d1.getTime());
  return Math.floor(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * Create a milestone record.
 */
export function createMilestoneRecord(
  milestone: ProgressMilestone,
  firstReadDate: string | null,
  totalReadingTimeMs: number
): ProgressMilestoneRecord {
  const now = new Date().toISOString();
  return {
    milestone,
    reachedAt: now,
    daysFromStart: firstReadDate ? daysBetweenDates(firstReadDate, now) : null,
    totalReadingTimeMs,
  };
}

/**
 * Calculate reading momentum based on recent activity.
 */
export function calculateMomentum(
  readingHistory: DailyReadingEntryLike[]
): { momentum: ReadingMomentum; score: number } {
  const today = new Date();

  const last7Days: number[] = [];
  const previous7Days: number[] = [];

  for (let i = 0; i < 14; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];

    const entry = readingHistory.find((h) => h.date === dateStr);
    const durationMs = entry?.durationMs ?? 0;

    if (i < 7) {
      last7Days.push(durationMs);
    } else {
      previous7Days.push(durationMs);
    }
  }

  const recentTotal = last7Days.reduce((sum, d) => sum + d, 0);
  const previousTotal = previous7Days.reduce((sum, d) => sum + d, 0);

  const recentActiveDays = last7Days.filter((d) => d > 0).length;
  const previousActiveDays = previous7Days.filter((d) => d > 0).length;

  if (recentTotal === 0 && previousTotal === 0) {
    return { momentum: 'inactive', score: 0 };
  }

  let score = 0;

  if (previousTotal > 0) {
    const timeChange = ((recentTotal - previousTotal) / previousTotal) * 50;
    score += Math.max(-50, Math.min(50, timeChange));
  } else if (recentTotal > 0) {
    score += 25;
  }

  const daysDiff = recentActiveDays - previousActiveDays;
  score += daysDiff * 10;

  score = Math.max(-100, Math.min(100, Math.round(score)));

  let momentum: ReadingMomentum;
  if (recentTotal === 0 && recentActiveDays === 0) {
    momentum = 'inactive';
  } else if (score >= 20) {
    momentum = 'accelerating';
  } else if (score <= -20) {
    momentum = 'slowing';
  } else {
    momentum = 'steady';
  }

  return { momentum, score };
}

function roundToSingleDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}

function deriveHistoryFromSessions(sessions: ReadingSessionLike[]): DailyReadingEntryLike[] {
  const byDate = new Map<string, DailyReadingEntryLike>();

  for (const session of sessions) {
    const date = session.startTime.split('T')[0];
    const existing = byDate.get(date);
    if (existing) {
      existing.durationMs += session.durationMs;
      existing.sessions = (existing.sessions ?? 0) + 1;
      existing.pagesRead = (existing.pagesRead ?? 0) + session.pagesRead;
      continue;
    }

    byDate.set(date, {
      date,
      durationMs: session.durationMs,
      sessions: 1,
      pagesRead: session.pagesRead,
    });
  }

  return Array.from(byDate.values()).sort((a, b) => b.date.localeCompare(a.date));
}

function getFirstReadDate(
  history: DailyReadingEntryLike[],
  sessions: ReadingSessionLike[],
  legacyStats?: ReadingStats | null
): string | null {
  const oldestHistoryDate = history.length > 0
    ? history.reduce((oldest, entry) => entry.date < oldest ? entry.date : oldest, history[0].date)
    : null;
  const oldestSessionStart = sessions.length > 0
    ? sessions.reduce((oldest, session) => session.startTime < oldest ? session.startTime : oldest, sessions[0].startTime)
    : null;

  if (oldestHistoryDate && oldestSessionStart) {
    return `${oldestHistoryDate}T00:00:00.000Z` < oldestSessionStart
      ? `${oldestHistoryDate}T00:00:00.000Z`
      : oldestSessionStart;
  }

  if (oldestSessionStart) return oldestSessionStart;
  if (oldestHistoryDate) return `${oldestHistoryDate}T00:00:00.000Z`;
  return legacyStats?.firstReadDate ?? null;
}

export function computeReadingStatsFromHistoryAndSessions(
  options: ComputeReadingStatsOptions
): ReadingStats | null {
  const { totalPages, progress, legacyStats = null } = options;
  const sessions = [...options.sessions].sort((a, b) => b.startTime.localeCompare(a.startTime));
  const history = options.history.length > 0
    ? [...options.history].sort((a, b) => b.date.localeCompare(a.date))
    : deriveHistoryFromSessions(sessions);

  if (history.length === 0 && sessions.length === 0) {
    return legacyStats;
  }

  const historyTotals = history.reduce((acc, entry) => {
    acc.durationMs += entry.durationMs;
    acc.sessions += entry.sessions ?? 0;
    acc.pagesRead += entry.pagesRead ?? 0;
    return acc;
  }, { durationMs: 0, sessions: 0, pagesRead: 0 });

  const sessionTotals = sessions.reduce((acc, session) => {
    acc.durationMs += session.durationMs;
    acc.pagesRead += session.pagesRead;
    return acc;
  }, { durationMs: 0, pagesRead: 0 });

  const totalReadingTimeMs = history.length > 0 ? historyTotals.durationMs : sessionTotals.durationMs;
  const totalSessions = history.length > 0
    ? historyTotals.sessions
    : sessions.length;
  const totalPagesRead = history.length > 0 ? historyTotals.pagesRead : sessionTotals.pagesRead;
  const averageSessionMs = totalSessions > 0 ? totalReadingTimeMs / totalSessions : 0;
  const firstReadDate = getFirstReadDate(history, sessions, legacyStats);

  const validSessionsForSpeed = sessions
    .filter((session) => session.durationMs >= 60000 && session.pagesRead > 0)
    .slice(0, 20);

  let pagesPerHour: number | null = null;
  if (validSessionsForSpeed.length > 0) {
    const decayFactor = 0.85;
    let weightedPace = 0;
    let totalWeight = 0;

    for (let i = 0; i < validSessionsForSpeed.length; i++) {
      const session = validSessionsForSpeed[i];
      const hours = session.durationMs / (1000 * 60 * 60);
      if (hours <= 0) continue;
      const weight = Math.pow(decayFactor, i);
      weightedPace += (session.pagesRead / hours) * weight;
      totalWeight += weight;
    }

    if (totalWeight > 0) {
      pagesPerHour = roundToSingleDecimal(weightedPace / totalWeight);
    }
  } else if (totalPagesRead > 0 && totalReadingTimeMs >= 60000) {
    const totalHours = totalReadingTimeMs / (1000 * 60 * 60);
    if (totalHours > 0) {
      pagesPerHour = roundToSingleDecimal(totalPagesRead / totalHours);
    }
  }

  const longestDerivedSessionMs = sessions.length > 0
    ? sessions.reduce((max, session) => Math.max(max, session.durationMs), 0)
    : null;
  const longestSessionMs = longestDerivedSessionMs !== null || legacyStats?.longestSessionMs !== null
    ? Math.max(longestDerivedSessionMs ?? 0, legacyStats?.longestSessionMs ?? 0)
    : null;

  const recentHistory = history.filter((entry) => entry.durationMs > 0).slice(0, 14);
  let averageDailyReadingMs: number | null = null;
  if (recentHistory.length >= 2) {
    const decay = 0.9;
    let weightedDailyMs = 0;
    let totalWeight = 0;

    for (let i = 0; i < recentHistory.length; i++) {
      const weight = Math.pow(decay, i);
      weightedDailyMs += recentHistory[i].durationMs * weight;
      totalWeight += weight;
    }

    if (totalWeight > 0) {
      averageDailyReadingMs = Math.round(weightedDailyMs / totalWeight);
    }
  }

  let estimatedCompletionDate: string | null = null;
  if (pagesPerHour !== null && pagesPerHour > 0 && totalPages !== null && progress < 100) {
    const currentPage = Math.min(totalPages, Math.round((progress / 100) * totalPages));
    const remainingPages = totalPages - currentPage;

    if (remainingPages > 0) {
      let hoursPerDay = 0;

      if (averageDailyReadingMs !== null && averageDailyReadingMs > 0) {
        hoursPerDay = averageDailyReadingMs / (1000 * 60 * 60);
      } else if (validSessionsForSpeed.length > 0) {
        const recentDays = Math.min(7, validSessionsForSpeed.length);
        const recentTotalMs = validSessionsForSpeed
          .slice(0, recentDays)
          .reduce((sum, session) => sum + session.durationMs, 0);
        hoursPerDay = (recentTotalMs / recentDays) / (1000 * 60 * 60);
      }

      if (hoursPerDay > 0) {
        const pagesPerDay = pagesPerHour * hoursPerDay;
        if (pagesPerDay > 0) {
          const daysToComplete = Math.ceil((remainingPages / pagesPerDay) * 1.05);
          const targetDate = new Date();
          targetDate.setDate(targetDate.getDate() + daysToComplete);
          estimatedCompletionDate = targetDate.toISOString().split('T')[0];
        }
      }
    }
  }

  const { momentum, score } = calculateMomentum(history);

  const result: ReadingStats = {
    totalReadingTimeMs,
    totalSessions,
    averageSessionMs,
    firstReadDate,
    pagesPerHour,
    totalPagesRead,
    longestSessionMs,
    estimatedCompletionDate,
    averageDailyReadingMs,
  };

  if (legacyStats?.milestones && legacyStats.milestones.length > 0) {
    result.milestones = legacyStats.milestones;
  }
  result.momentum = momentum;
  result.momentumScore = score;

  return result;
}
