import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { ReadingGoals, ReadingStreak, DailyReadingSummary, WeeklyReadingSummary, StreakRiskInfo, MonthlyReadingSummary } from '@pulp/shared';
import type { Config } from '../config/schema.js';
import type { LibraryScanner } from './library-scanner.js';
import { getDailyReadingHistory } from './frontmatter-parser.js';

/** Filename for storing reading goals and streak data */
const GOALS_FILE = '.pulp-goals.json';

/** Default daily reading goal in minutes */
const DEFAULT_DAILY_GOAL_MINUTES = 30;

/** Default grace period for maintaining streaks (days) */
const DEFAULT_GRACE_PERIOD_DAYS = 1;

/** Minimum allowed daily goal in minutes */
const MIN_DAILY_GOAL_MINUTES = 1;

/** Maximum allowed daily goal in minutes (24 hours) */
const MAX_DAILY_GOAL_MINUTES = 1440;

/** Maximum allowed grace period in days */
const MAX_GRACE_PERIOD_DAYS = 7;

/** Maximum days to look back when recalculating streaks */
const STREAK_LOOKBACK_DAYS = 365;

/** Days in a week */
const DAYS_IN_WEEK = 7;

interface GoalsFileData {
  goals: ReadingGoals;
  streak: ReadingStreak;
}

function getToday(): string {
  return new Date().toISOString().split('T')[0];
}

function getDaysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().split('T')[0];
}

/**
 * Get the start of the current week (Monday).
 */
function getWeekStart(): string {
  const date = new Date();
  const day = date.getDay();
  // Adjust for Monday as start of week (Sunday = 0, so Monday = 1)
  const diff = day === 0 ? 6 : day - 1;
  date.setDate(date.getDate() - diff);
  return date.toISOString().split('T')[0];
}

/**
 * Get hours remaining until midnight (local time).
 */
function getHoursUntilMidnight(): number {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setDate(midnight.getDate() + 1);
  midnight.setHours(0, 0, 0, 0);
  return (midnight.getTime() - now.getTime()) / (1000 * 60 * 60);
}

/**
 * Get the month string (YYYY-MM) for a date.
 */
function getMonthString(date: string): string {
  return date.slice(0, 7);
}

/**
 * Get a date N days after a given date string.
 */
function getDatePlusDays(dateStr: string, days: number): string {
  const date = new Date(dateStr + 'T12:00:00');
  date.setDate(date.getDate() + days);
  return date.toISOString().split('T')[0];
}

export class ReadingGoalsService {
  private goalsFilePath: string;
  private data: GoalsFileData;

  constructor(
    private config: Config,
    private scanner: LibraryScanner
  ) {
    this.goalsFilePath = join(config.library_path, GOALS_FILE);
    this.data = this.loadOrCreateGoalsFile();
  }

  private loadOrCreateGoalsFile(): GoalsFileData {
    const today = getToday();

    const defaultData: GoalsFileData = {
      goals: {
        dailyGoalMinutes: this.config.default_daily_goal_minutes ?? DEFAULT_DAILY_GOAL_MINUTES,
        weeklyGoalMinutes: null,
        gracePeriodDays: this.config.default_grace_period_days ?? DEFAULT_GRACE_PERIOD_DAYS,
      },
      streak: {
        currentStreak: 0,
        longestStreak: 0,
        lastReadDate: '',
        streakStartDate: today,
        graceDaysUsed: 0,
      },
    };

    if (!existsSync(this.goalsFilePath)) {
      this.saveGoalsFile(defaultData);
      return defaultData;
    }

    try {
      const content = readFileSync(this.goalsFilePath, 'utf-8');
      const parsed = JSON.parse(content) as GoalsFileData;

      // Ensure all required fields exist
      return {
        goals: {
          ...defaultData.goals,
          ...parsed.goals,
        },
        streak: {
          ...defaultData.streak,
          ...parsed.streak,
        },
      };
    } catch (error) {
      console.error('Failed to load goals file, using defaults:', error);
      return defaultData;
    }
  }

  private saveGoalsFile(data: GoalsFileData): void {
    try {
      writeFileSync(this.goalsFilePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (error) {
      console.error('Failed to save goals file:', error);
    }
  }

  getGoals(): ReadingGoals {
    return { ...this.data.goals };
  }

  getStreak(): ReadingStreak {
    return { ...this.data.streak };
  }

  updateGoals(goals: Partial<ReadingGoals>): ReadingGoals {
    // Validate and clamp values
    const sanitizedGoals: Partial<ReadingGoals> = {};

    if (goals.dailyGoalMinutes !== undefined) {
      // Ensure within valid range
      sanitizedGoals.dailyGoalMinutes = Math.max(
        MIN_DAILY_GOAL_MINUTES,
        Math.min(MAX_DAILY_GOAL_MINUTES, Math.round(goals.dailyGoalMinutes))
      );
    }

    if (goals.weeklyGoalMinutes !== undefined) {
      // Allow null to clear, otherwise minimum of 1 minute
      sanitizedGoals.weeklyGoalMinutes = goals.weeklyGoalMinutes === null
        ? null
        : Math.max(MIN_DAILY_GOAL_MINUTES, Math.round(goals.weeklyGoalMinutes));
    }

    if (goals.gracePeriodDays !== undefined) {
      // Grace period: 0 to max days
      sanitizedGoals.gracePeriodDays = Math.max(0, Math.min(MAX_GRACE_PERIOD_DAYS, Math.round(goals.gracePeriodDays)));
    }

    this.data.goals = {
      ...this.data.goals,
      ...sanitizedGoals,
    };
    this.saveGoalsFile(this.data);
    return this.getGoals();
  }

  /**
   * Calculate today's reading summary across all books.
   */
  getTodayProgress(): DailyReadingSummary {
    const today = getToday();
    return this.getDaySummary(today);
  }

  /**
   * Get reading summary for a specific date.
   */
  getDaySummary(date: string): DailyReadingSummary {
    const notes = this.scanner.getAll();
    let totalDurationMs = 0;
    let totalSessions = 0;
    let booksRead = 0;

    for (const note of notes) {
      const history = getDailyReadingHistory(note.frontmatter, this.config.reading_history_key);
      const dayEntry = history.find(e => e.date === date);

      if (dayEntry && dayEntry.durationMs > 0) {
        totalDurationMs += dayEntry.durationMs;
        totalSessions += dayEntry.sessions;
        booksRead++;
      }
    }

    const goalMs = this.data.goals.dailyGoalMinutes * 60 * 1000;

    return {
      date,
      totalDurationMs,
      totalSessions,
      booksRead,
      goalMet: totalDurationMs >= goalMs,
    };
  }

  /**
   * Get reading history for the last N days.
   */
  getWeekHistory(): DailyReadingSummary[] {
    const history: DailyReadingSummary[] = [];

    for (let i = 6; i >= 0; i--) {
      const date = getDaysAgo(i);
      history.push(this.getDaySummary(date));
    }

    return history;
  }

  /**
   * Calculate number of days between two dates (YYYY-MM-DD format).
   */
  private daysBetween(date1: string, date2: string): number {
    const d1 = new Date(date1 + 'T12:00:00');
    const d2 = new Date(date2 + 'T12:00:00');
    const diffTime = Math.abs(d2.getTime() - d1.getTime());
    return Math.floor(diffTime / (1000 * 60 * 60 * 24));
  }

  /**
   * Update streak after a reading session ends.
   * Called from reading-stats route after recording a session.
   * Supports grace period - allows missing days without breaking streak.
   */
  updateStreak(): ReadingStreak {
    const today = getToday();
    const todaySummary = this.getTodayProgress();

    // Only count toward streak if daily goal is met
    if (!todaySummary.goalMet) {
      return this.getStreak();
    }

    const lastRead = this.data.streak.lastReadDate;
    const gracePeriodDays = this.data.goals.gracePeriodDays || 1;

    if (lastRead === today) {
      // Already counted today
      return this.getStreak();
    }

    if (!lastRead) {
      // First day - start new streak
      this.data.streak.currentStreak = 1;
      this.data.streak.lastReadDate = today;
      this.data.streak.streakStartDate = today;
      this.data.streak.graceDaysUsed = 0;
    } else {
      const daysSinceLastRead = this.daysBetween(lastRead, today);

      if (daysSinceLastRead === 1) {
        // Continuing streak normally (consecutive days)
        this.data.streak.currentStreak++;
        this.data.streak.lastReadDate = today;
        // Reset grace days used when we have a consecutive day
        this.data.streak.graceDaysUsed = 0;
      } else if (daysSinceLastRead <= gracePeriodDays + 1) {
        // Within grace period - continue streak but track grace days used
        const graceDaysNeeded = daysSinceLastRead - 1;
        this.data.streak.currentStreak++;
        this.data.streak.lastReadDate = today;
        this.data.streak.graceDaysUsed = (this.data.streak.graceDaysUsed || 0) + graceDaysNeeded;
      } else {
        // Grace period exceeded - streak broken, start new streak
        this.data.streak.currentStreak = 1;
        this.data.streak.lastReadDate = today;
        this.data.streak.streakStartDate = today;
        this.data.streak.graceDaysUsed = 0;
      }
    }

    // Update longest streak if needed
    if (this.data.streak.currentStreak > this.data.streak.longestStreak) {
      this.data.streak.longestStreak = this.data.streak.currentStreak;
    }

    this.saveGoalsFile(this.data);
    return this.getStreak();
  }

  /**
   * Recalculate streak from history (useful for fixing inconsistencies).
   * Supports grace period - allows missing days without breaking streak.
   */
  recalculateStreak(): ReadingStreak {
    const today = getToday();
    const gracePeriodDays = this.data.goals.gracePeriodDays || 1;

    let currentStreak = 0;
    let streakStartDate = today;
    let graceDaysUsed = 0;
    let lastGoalMetDate = '';
    let consecutiveMissedDays = 0;

    // Walk backwards from today
    for (let i = 0; i < STREAK_LOOKBACK_DAYS; i++) {
      const date = getDaysAgo(i);
      const summary = this.getDaySummary(date);

      if (summary.goalMet) {
        currentStreak++;
        streakStartDate = date;
        lastGoalMetDate = lastGoalMetDate || date;
        // Track grace days from any gaps we've passed
        graceDaysUsed += consecutiveMissedDays;
        consecutiveMissedDays = 0;
      } else if (i === 0) {
        // Today not met yet - check if we're still within grace period
        consecutiveMissedDays = 1;
        continue;
      } else {
        consecutiveMissedDays++;
        // If we've exceeded grace period, streak is broken
        if (consecutiveMissedDays > gracePeriodDays) {
          break;
        }
        // Otherwise continue - we're in the grace period
      }
    }

    // If today wasn't met, check if we're still within grace period from last goal met
    const todaySummary = this.getDaySummary(today);
    if (!todaySummary.goalMet && currentStreak > 0 && lastGoalMetDate) {
      const daysSinceGoalMet = this.daysBetween(lastGoalMetDate, today);
      if (daysSinceGoalMet > gracePeriodDays) {
        // Grace period exceeded - streak is effectively 0 until user reads again
        currentStreak = 0;
        streakStartDate = today;
        graceDaysUsed = 0;
      }
    }

    this.data.streak.currentStreak = currentStreak;
    this.data.streak.streakStartDate = streakStartDate;
    this.data.streak.graceDaysUsed = graceDaysUsed;

    if (currentStreak > 0 && lastGoalMetDate) {
      this.data.streak.lastReadDate = lastGoalMetDate;
    } else {
      this.data.streak.lastReadDate = '';
    }

    if (this.data.streak.currentStreak > this.data.streak.longestStreak) {
      this.data.streak.longestStreak = this.data.streak.currentStreak;
    }

    this.saveGoalsFile(this.data);
    return this.getStreak();
  }

  /**
   * Reload goals from file (useful after external edits).
   */
  reload(): void {
    this.data = this.loadOrCreateGoalsFile();
  }

  /**
   * Get weekly summary for the current week (Monday to Sunday).
   */
  getWeekSummary(): WeeklyReadingSummary {
    const weekStart = getWeekStart();
    const today = getToday();

    let totalDurationMs = 0;
    let totalSessions = 0;
    let daysWithReading = 0;
    let daysGoalMet = 0;
    const booksReadSet = new Set<string>();

    const goalMs = this.data.goals.dailyGoalMinutes * 60 * 1000;

    // Iterate through each day of the current week (Mon-Sun)
    for (let i = 0; i < DAYS_IN_WEEK; i++) {
      const date = getDatePlusDays(weekStart, i);

      // Don't include future dates
      if (date > today) continue;

      const summary = this.getDaySummaryWithBooks(date);

      if (summary.totalDurationMs > 0) {
        totalDurationMs += summary.totalDurationMs;
        totalSessions += summary.totalSessions;
        daysWithReading++;

        for (const bookId of summary.bookIds) {
          booksReadSet.add(bookId);
        }
      }

      if (summary.totalDurationMs >= goalMs) {
        daysGoalMet++;
      }
    }

    // Check weekly goal
    const weeklyGoalMs = this.data.goals.weeklyGoalMinutes
      ? this.data.goals.weeklyGoalMinutes * 60 * 1000
      : this.data.goals.dailyGoalMinutes * DAYS_IN_WEEK * 60 * 1000;

    return {
      weekStartDate: weekStart,
      totalDurationMs,
      totalSessions,
      booksRead: booksReadSet.size,
      daysWithReading,
      daysGoalMet,
      weeklyGoalMet: totalDurationMs >= weeklyGoalMs,
      averageDailyMs: daysWithReading > 0 ? totalDurationMs / daysWithReading : 0,
    };
  }

  /**
   * Get day summary with book IDs included for tracking unique books.
   */
  private getDaySummaryWithBooks(date: string): DailyReadingSummary & { bookIds: string[] } {
    const notes = this.scanner.getAll();
    let totalDurationMs = 0;
    let totalSessions = 0;
    const bookIds: string[] = [];

    for (const note of notes) {
      const history = getDailyReadingHistory(note.frontmatter, this.config.reading_history_key);
      const dayEntry = history.find(e => e.date === date);

      if (dayEntry && dayEntry.durationMs > 0) {
        totalDurationMs += dayEntry.durationMs;
        totalSessions += dayEntry.sessions;
        bookIds.push(note.id);
      }
    }

    const goalMs = this.data.goals.dailyGoalMinutes * 60 * 1000;

    return {
      date,
      totalDurationMs,
      totalSessions,
      booksRead: bookIds.length,
      goalMet: totalDurationMs >= goalMs,
      bookIds,
    };
  }

  /**
   * Get streak risk information.
   * Returns info about whether the current streak is at risk and what's needed to save it.
   */
  getStreakRiskInfo(): StreakRiskInfo | null {
    const todaySummary = this.getTodayProgress();
    const streak = this.getStreak();

    // No streak to be at risk
    if (streak.currentStreak === 0 && !streak.lastReadDate) {
      return null;
    }

    // Goal already met today
    if (todaySummary.goalMet) {
      return {
        isAtRisk: false,
        minutesRemaining: 0,
        hoursUntilMidnight: getHoursUntilMidnight(),
        graceDaysRemaining: this.data.goals.gracePeriodDays - (streak.graceDaysUsed || 0),
      };
    }

    const today = getToday();
    const lastRead = streak.lastReadDate;
    const gracePeriodDays = this.data.goals.gracePeriodDays || 1;

    // Calculate days since last goal was met
    const daysSinceLastRead = lastRead ? this.daysBetween(lastRead, today) : 0;

    // If we already missed enough days to exceed grace period, streak would break
    // unless we read today
    const graceDaysRemaining = Math.max(0, gracePeriodDays - daysSinceLastRead + 1);

    // Streak is at risk if:
    // 1. We have a streak going (currentStreak > 0 or we read yesterday/within grace)
    // 2. Today's goal isn't met yet
    const isAtRisk = streak.currentStreak > 0 || (lastRead && daysSinceLastRead <= gracePeriodDays);

    const goalMs = this.data.goals.dailyGoalMinutes * 60 * 1000;
    const remainingMs = Math.max(0, goalMs - todaySummary.totalDurationMs);
    const minutesRemaining = Math.ceil(remainingMs / 60000);

    return {
      isAtRisk: isAtRisk || false,
      minutesRemaining,
      hoursUntilMidnight: getHoursUntilMidnight(),
      graceDaysRemaining,
    };
  }

  /**
   * Get monthly reading summary for a specific month.
   */
  getMonthSummary(monthString?: string): MonthlyReadingSummary {
    const targetMonth = monthString || getMonthString(getToday());
    const notes = this.scanner.getAll();

    let totalDurationMs = 0;
    let totalSessions = 0;
    const booksReadSet = new Set<string>();
    const daysWithReadingSet = new Set<string>();
    let daysGoalMet = 0;
    let booksCompleted = 0;

    const goalMs = this.data.goals.dailyGoalMinutes * 60 * 1000;

    // Track daily totals for goal checking
    const dailyTotals = new Map<string, number>();

    for (const note of notes) {
      const history = getDailyReadingHistory(note.frontmatter, this.config.reading_history_key);

      for (const entry of history) {
        // Check if this entry is in the target month
        if (getMonthString(entry.date) !== targetMonth) continue;

        if (entry.durationMs > 0) {
          totalDurationMs += entry.durationMs;
          totalSessions += entry.sessions;
          booksReadSet.add(note.id);
          daysWithReadingSet.add(entry.date);

          // Track daily total for goal checking
          const current = dailyTotals.get(entry.date) || 0;
          dailyTotals.set(entry.date, current + entry.durationMs);
        }
      }

      // Check if book was completed this month
      if (note.dateFinished) {
        const finishedMonth = getMonthString(note.dateFinished.split('T')[0]);
        if (finishedMonth === targetMonth) {
          booksCompleted++;
        }
      }
    }

    // Count days where goal was met
    for (const [, duration] of dailyTotals) {
      if (duration >= goalMs) {
        daysGoalMet++;
      }
    }

    return {
      month: targetMonth,
      totalDurationMs,
      totalSessions,
      booksRead: booksReadSet.size,
      daysWithReading: daysWithReadingSet.size,
      daysGoalMet,
      averageDailyMs: daysWithReadingSet.size > 0 ? totalDurationMs / daysWithReadingSet.size : 0,
      booksCompleted,
    };
  }
}
