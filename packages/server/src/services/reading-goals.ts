import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { ReadingGoals, ReadingStreak, DailyReadingSummary } from '@pulp/shared';
import type { Config } from '../config/schema.js';
import type { LibraryScanner } from './library-scanner.js';
import { getDailyReadingHistory } from './frontmatter-parser.js';

const GOALS_FILE = '.pulp-goals.json';

interface GoalsFileData {
  goals: ReadingGoals;
  streak: ReadingStreak;
}

function getToday(): string {
  return new Date().toISOString().split('T')[0];
}

// getYesterday is no longer used after grace period refactoring
// function getYesterday(): string {
//   const date = new Date();
//   date.setDate(date.getDate() - 1);
//   return date.toISOString().split('T')[0];
// }

function getDaysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
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
        dailyGoalMinutes: 30,
        weeklyGoalMinutes: null,
        gracePeriodDays: 1,
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
      // Ensure minimum of 1 minute, maximum of 24 hours (1440 minutes)
      sanitizedGoals.dailyGoalMinutes = Math.max(1, Math.min(1440, Math.round(goals.dailyGoalMinutes)));
    }

    if (goals.weeklyGoalMinutes !== undefined) {
      // Allow null to clear, otherwise minimum of 1 minute
      sanitizedGoals.weeklyGoalMinutes = goals.weeklyGoalMinutes === null
        ? null
        : Math.max(1, Math.round(goals.weeklyGoalMinutes));
    }

    if (goals.gracePeriodDays !== undefined) {
      // Grace period: 0-7 days
      sanitizedGoals.gracePeriodDays = Math.max(0, Math.min(7, Math.round(goals.gracePeriodDays)));
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
    for (let i = 0; i < 365; i++) {
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
}
