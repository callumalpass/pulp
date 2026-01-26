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

function getYesterday(): string {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  return date.toISOString().split('T')[0];
}

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
      },
      streak: {
        currentStreak: 0,
        longestStreak: 0,
        lastReadDate: '',
        streakStartDate: today,
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
    this.data.goals = {
      ...this.data.goals,
      ...goals,
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
   * Update streak after a reading session ends.
   * Called from reading-stats route after recording a session.
   */
  updateStreak(): ReadingStreak {
    const today = getToday();
    const yesterday = getYesterday();
    const todaySummary = this.getTodayProgress();

    // Only count toward streak if daily goal is met
    if (!todaySummary.goalMet) {
      return this.getStreak();
    }

    const lastRead = this.data.streak.lastReadDate;

    if (lastRead === today) {
      // Already counted today
      return this.getStreak();
    }

    if (lastRead === yesterday) {
      // Continuing streak
      this.data.streak.currentStreak++;
      this.data.streak.lastReadDate = today;
    } else if (!lastRead || lastRead < yesterday) {
      // Streak broken, start new streak
      this.data.streak.currentStreak = 1;
      this.data.streak.lastReadDate = today;
      this.data.streak.streakStartDate = today;
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
   */
  recalculateStreak(): ReadingStreak {
    const today = getToday();
    let currentStreak = 0;
    let streakStartDate = today;

    // Walk backwards from today
    for (let i = 0; i < 365; i++) {
      const date = getDaysAgo(i);
      const summary = this.getDaySummary(date);

      if (summary.goalMet) {
        currentStreak++;
        streakStartDate = date;
      } else if (i === 0) {
        // Today not met yet, check if yesterday continues streak
        continue;
      } else {
        // Streak broken
        break;
      }
    }

    // If today wasn't met but yesterday was, we're still on a streak
    // (user might still meet today's goal)
    const todaySummary = this.getDaySummary(today);
    if (!todaySummary.goalMet && currentStreak > 0) {
      const yesterdaySummary = this.getDaySummary(getYesterday());
      if (!yesterdaySummary.goalMet) {
        currentStreak = 0;
        streakStartDate = today;
      }
    }

    this.data.streak.currentStreak = currentStreak;
    this.data.streak.streakStartDate = streakStartDate;
    if (currentStreak > 0) {
      this.data.streak.lastReadDate = currentStreak === 0 ? '' :
        todaySummary.goalMet ? today : getYesterday();
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
