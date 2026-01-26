import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Mock fs module
vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

// We need to import after mocking
const mockExistsSync = vi.mocked(existsSync);
const mockReadFileSync = vi.mocked(readFileSync);
const mockWriteFileSync = vi.mocked(writeFileSync);

// Mock LibraryScanner
const mockScanner = {
  getAll: vi.fn(),
};

// Helper to create a mock config
function createMockConfig(overrides = {}) {
  return {
    library_path: '/test/library',
    reading_history_key: 'reading_history',
    default_daily_goal_minutes: 30,
    default_grace_period_days: 1,
    ...overrides,
  };
}

// Helper to create a mock goals file data
function createGoalsFileData(overrides: Record<string, unknown> = {}) {
  return {
    goals: {
      dailyGoalMinutes: 30,
      weeklyGoalMinutes: null,
      gracePeriodDays: 1,
      ...(overrides.goals as Record<string, unknown> || {}),
    },
    streak: {
      currentStreak: 0,
      longestStreak: 0,
      lastReadDate: '',
      streakStartDate: '2024-01-15',
      graceDaysUsed: 0,
      ...(overrides.streak as Record<string, unknown> || {}),
    },
  };
}

describe('ReadingGoalsService', () => {
  let ReadingGoalsService: typeof import('../reading-goals.js').ReadingGoalsService;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-15T12:00:00Z'));

    // Reset module cache and reimport
    vi.resetModules();
    const module = await import('../reading-goals.js');
    ReadingGoalsService = module.ReadingGoalsService;

    // Default mock return values
    mockExistsSync.mockReturnValue(false);
    mockScanner.getAll.mockReturnValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('constructor and initialization', () => {
    it('creates default goals file when none exists', () => {
      mockExistsSync.mockReturnValue(false);

      const service = new ReadingGoalsService(
        createMockConfig() as any,
        mockScanner as any
      );

      expect(mockWriteFileSync).toHaveBeenCalledWith(
        '/test/library/.pulp-goals.json',
        expect.stringContaining('"dailyGoalMinutes": 30'),
        'utf-8'
      );
    });

    it('loads existing goals file', () => {
      const existingData = createGoalsFileData({
        goals: { dailyGoalMinutes: 45 },
        streak: { currentStreak: 5 },
      });

      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(existingData));

      const service = new ReadingGoalsService(
        createMockConfig() as any,
        mockScanner as any
      );

      const goals = service.getGoals();
      expect(goals.dailyGoalMinutes).toBe(45);

      const streak = service.getStreak();
      expect(streak.currentStreak).toBe(5);
    });

    it('uses config defaults when creating new goals file', () => {
      mockExistsSync.mockReturnValue(false);

      const service = new ReadingGoalsService(
        createMockConfig({
          default_daily_goal_minutes: 60,
          default_grace_period_days: 2,
        }) as any,
        mockScanner as any
      );

      const goals = service.getGoals();
      expect(goals.dailyGoalMinutes).toBe(60);
      expect(goals.gracePeriodDays).toBe(2);
    });

    it('handles corrupted goals file gracefully', () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue('invalid json{');

      const service = new ReadingGoalsService(
        createMockConfig() as any,
        mockScanner as any
      );

      // Should use defaults
      const goals = service.getGoals();
      expect(goals.dailyGoalMinutes).toBe(30);
    });
  });

  describe('updateGoals', () => {
    it('updates daily goal with valid value', () => {
      mockExistsSync.mockReturnValue(false);

      const service = new ReadingGoalsService(
        createMockConfig() as any,
        mockScanner as any
      );

      const updated = service.updateGoals({ dailyGoalMinutes: 45 });
      expect(updated.dailyGoalMinutes).toBe(45);
    });

    it('clamps daily goal to minimum of 1 minute', () => {
      mockExistsSync.mockReturnValue(false);

      const service = new ReadingGoalsService(
        createMockConfig() as any,
        mockScanner as any
      );

      const updated = service.updateGoals({ dailyGoalMinutes: 0 });
      expect(updated.dailyGoalMinutes).toBe(1);

      const updated2 = service.updateGoals({ dailyGoalMinutes: -10 });
      expect(updated2.dailyGoalMinutes).toBe(1);
    });

    it('clamps daily goal to maximum of 1440 minutes (24 hours)', () => {
      mockExistsSync.mockReturnValue(false);

      const service = new ReadingGoalsService(
        createMockConfig() as any,
        mockScanner as any
      );

      const updated = service.updateGoals({ dailyGoalMinutes: 2000 });
      expect(updated.dailyGoalMinutes).toBe(1440);
    });

    it('allows null weekly goal to clear it', () => {
      mockExistsSync.mockReturnValue(false);

      const service = new ReadingGoalsService(
        createMockConfig() as any,
        mockScanner as any
      );

      service.updateGoals({ weeklyGoalMinutes: 200 });
      expect(service.getGoals().weeklyGoalMinutes).toBe(200);

      service.updateGoals({ weeklyGoalMinutes: null });
      expect(service.getGoals().weeklyGoalMinutes).toBeNull();
    });

    it('clamps grace period to 0-7 days', () => {
      mockExistsSync.mockReturnValue(false);

      const service = new ReadingGoalsService(
        createMockConfig() as any,
        mockScanner as any
      );

      const updated1 = service.updateGoals({ gracePeriodDays: -1 });
      expect(updated1.gracePeriodDays).toBe(0);

      const updated2 = service.updateGoals({ gracePeriodDays: 10 });
      expect(updated2.gracePeriodDays).toBe(7);
    });

    it('rounds fractional values', () => {
      mockExistsSync.mockReturnValue(false);

      const service = new ReadingGoalsService(
        createMockConfig() as any,
        mockScanner as any
      );

      const updated = service.updateGoals({ dailyGoalMinutes: 30.7 });
      expect(updated.dailyGoalMinutes).toBe(31);
    });
  });

  describe('getTodayProgress', () => {
    it('returns zero progress when no books have been read', () => {
      mockExistsSync.mockReturnValue(false);
      mockScanner.getAll.mockReturnValue([]);

      const service = new ReadingGoalsService(
        createMockConfig() as any,
        mockScanner as any
      );

      const progress = service.getTodayProgress();
      expect(progress.totalDurationMs).toBe(0);
      expect(progress.totalSessions).toBe(0);
      expect(progress.booksRead).toBe(0);
      expect(progress.goalMet).toBe(false);
    });

    it('aggregates reading time across all books', () => {
      mockExistsSync.mockReturnValue(false);
      mockScanner.getAll.mockReturnValue([
        {
          frontmatter: {
            reading_history: [
              { date: '2024-01-15', duration_ms: 1800000, sessions: 1, pages: 10 },
            ],
          },
        },
        {
          frontmatter: {
            reading_history: [
              { date: '2024-01-15', duration_ms: 600000, sessions: 2, pages: 5 },
            ],
          },
        },
      ]);

      const service = new ReadingGoalsService(
        createMockConfig() as any,
        mockScanner as any
      );

      const progress = service.getTodayProgress();
      expect(progress.totalDurationMs).toBe(2400000); // 40 minutes
      expect(progress.totalSessions).toBe(3);
      expect(progress.booksRead).toBe(2);
      expect(progress.goalMet).toBe(true); // 40min > 30min goal
    });

    it('correctly determines when goal is not met', () => {
      mockExistsSync.mockReturnValue(false);
      mockScanner.getAll.mockReturnValue([
        {
          frontmatter: {
            reading_history: [
              { date: '2024-01-15', duration_ms: 900000, sessions: 1, pages: 5 }, // 15 minutes
            ],
          },
        },
      ]);

      const service = new ReadingGoalsService(
        createMockConfig() as any,
        mockScanner as any
      );

      const progress = service.getTodayProgress();
      expect(progress.goalMet).toBe(false); // 15min < 30min goal
    });
  });

  describe('updateStreak', () => {
    it('starts a new streak on first read', () => {
      mockExistsSync.mockReturnValue(false);
      mockScanner.getAll.mockReturnValue([
        {
          frontmatter: {
            reading_history: [
              { date: '2024-01-15', duration_ms: 1800000, sessions: 1, pages: 10 }, // 30min = goal met
            ],
          },
        },
      ]);

      const service = new ReadingGoalsService(
        createMockConfig() as any,
        mockScanner as any
      );

      const streak = service.updateStreak();
      expect(streak.currentStreak).toBe(1);
      expect(streak.lastReadDate).toBe('2024-01-15');
      expect(streak.streakStartDate).toBe('2024-01-15');
    });

    it('does not update streak if goal not met', () => {
      mockExistsSync.mockReturnValue(false);
      mockScanner.getAll.mockReturnValue([
        {
          frontmatter: {
            reading_history: [
              { date: '2024-01-15', duration_ms: 900000, sessions: 1, pages: 5 }, // 15min < 30min goal
            ],
          },
        },
      ]);

      const service = new ReadingGoalsService(
        createMockConfig() as any,
        mockScanner as any
      );

      const streak = service.updateStreak();
      expect(streak.currentStreak).toBe(0);
    });

    it('continues streak on consecutive days', () => {
      const existingData = createGoalsFileData({
        streak: {
          currentStreak: 3,
          lastReadDate: '2024-01-14',
          streakStartDate: '2024-01-12',
        },
      });

      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(existingData));
      mockScanner.getAll.mockReturnValue([
        {
          frontmatter: {
            reading_history: [
              { date: '2024-01-15', duration_ms: 1800000, sessions: 1, pages: 10 },
            ],
          },
        },
      ]);

      const service = new ReadingGoalsService(
        createMockConfig() as any,
        mockScanner as any
      );

      const streak = service.updateStreak();
      expect(streak.currentStreak).toBe(4);
      expect(streak.lastReadDate).toBe('2024-01-15');
      expect(streak.graceDaysUsed).toBe(0);
    });

    it('uses grace period when missing a day', () => {
      const existingData = createGoalsFileData({
        goals: { gracePeriodDays: 2 },
        streak: {
          currentStreak: 3,
          lastReadDate: '2024-01-13', // Missed Jan 14
          streakStartDate: '2024-01-11',
        },
      });

      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(existingData));
      mockScanner.getAll.mockReturnValue([
        {
          frontmatter: {
            reading_history: [
              { date: '2024-01-15', duration_ms: 1800000, sessions: 1, pages: 10 },
            ],
          },
        },
      ]);

      const service = new ReadingGoalsService(
        createMockConfig() as any,
        mockScanner as any
      );

      const streak = service.updateStreak();
      expect(streak.currentStreak).toBe(4); // Streak continues
      expect(streak.graceDaysUsed).toBe(1); // Used 1 grace day
    });

    it('breaks streak when grace period exceeded', () => {
      const existingData = createGoalsFileData({
        goals: { gracePeriodDays: 1 },
        streak: {
          currentStreak: 10,
          longestStreak: 10,
          lastReadDate: '2024-01-12', // Missed Jan 13 and 14
          streakStartDate: '2024-01-03',
        },
      });

      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(existingData));
      mockScanner.getAll.mockReturnValue([
        {
          frontmatter: {
            reading_history: [
              { date: '2024-01-15', duration_ms: 1800000, sessions: 1, pages: 10 },
            ],
          },
        },
      ]);

      const service = new ReadingGoalsService(
        createMockConfig() as any,
        mockScanner as any
      );

      const streak = service.updateStreak();
      expect(streak.currentStreak).toBe(1); // New streak starts
      expect(streak.longestStreak).toBe(10); // Longest preserved
      expect(streak.streakStartDate).toBe('2024-01-15');
    });

    it('updates longest streak when current exceeds it', () => {
      const existingData = createGoalsFileData({
        streak: {
          currentStreak: 5,
          longestStreak: 5,
          lastReadDate: '2024-01-14',
          streakStartDate: '2024-01-10',
        },
      });

      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(existingData));
      mockScanner.getAll.mockReturnValue([
        {
          frontmatter: {
            reading_history: [
              { date: '2024-01-15', duration_ms: 1800000, sessions: 1, pages: 10 },
            ],
          },
        },
      ]);

      const service = new ReadingGoalsService(
        createMockConfig() as any,
        mockScanner as any
      );

      const streak = service.updateStreak();
      expect(streak.currentStreak).toBe(6);
      expect(streak.longestStreak).toBe(6);
    });

    it('does not double-count same day', () => {
      const existingData = createGoalsFileData({
        streak: {
          currentStreak: 1,
          lastReadDate: '2024-01-15', // Already counted today
          streakStartDate: '2024-01-15',
        },
      });

      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(existingData));
      mockScanner.getAll.mockReturnValue([
        {
          frontmatter: {
            reading_history: [
              { date: '2024-01-15', duration_ms: 3600000, sessions: 2, pages: 20 }, // More reading same day
            ],
          },
        },
      ]);

      const service = new ReadingGoalsService(
        createMockConfig() as any,
        mockScanner as any
      );

      const streak = service.updateStreak();
      expect(streak.currentStreak).toBe(1); // Still 1, not incremented
    });
  });

  describe('getWeekHistory', () => {
    it('returns 7 days of history', () => {
      mockExistsSync.mockReturnValue(false);
      mockScanner.getAll.mockReturnValue([]);

      const service = new ReadingGoalsService(
        createMockConfig() as any,
        mockScanner as any
      );

      const history = service.getWeekHistory();
      expect(history).toHaveLength(7);
    });

    it('returns days in chronological order', () => {
      mockExistsSync.mockReturnValue(false);
      mockScanner.getAll.mockReturnValue([]);

      const service = new ReadingGoalsService(
        createMockConfig() as any,
        mockScanner as any
      );

      const history = service.getWeekHistory();
      // First should be 6 days ago, last should be today
      expect(history[0].date).toBe('2024-01-09');
      expect(history[6].date).toBe('2024-01-15');
    });
  });

  describe('recalculateStreak', () => {
    it('recalculates streak from reading history', () => {
      mockExistsSync.mockReturnValue(false);
      mockScanner.getAll.mockReturnValue([
        {
          frontmatter: {
            reading_history: [
              { date: '2024-01-15', duration_ms: 1800000, sessions: 1, pages: 10 },
              { date: '2024-01-14', duration_ms: 1800000, sessions: 1, pages: 10 },
              { date: '2024-01-13', duration_ms: 1800000, sessions: 1, pages: 10 },
            ],
          },
        },
      ]);

      const service = new ReadingGoalsService(
        createMockConfig() as any,
        mockScanner as any
      );

      const streak = service.recalculateStreak();
      expect(streak.currentStreak).toBe(3);
      expect(streak.streakStartDate).toBe('2024-01-13');
    });

    it('handles gaps within grace period during recalculation', () => {
      const existingData = createGoalsFileData({
        goals: { gracePeriodDays: 1 },
      });

      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(existingData));
      mockScanner.getAll.mockReturnValue([
        {
          frontmatter: {
            reading_history: [
              { date: '2024-01-15', duration_ms: 1800000, sessions: 1, pages: 10 },
              // Missing Jan 14
              { date: '2024-01-13', duration_ms: 1800000, sessions: 1, pages: 10 },
            ],
          },
        },
      ]);

      const service = new ReadingGoalsService(
        createMockConfig() as any,
        mockScanner as any
      );

      const streak = service.recalculateStreak();
      expect(streak.currentStreak).toBe(2);
      expect(streak.graceDaysUsed).toBe(1);
    });
  });

  describe('reload', () => {
    it('reloads goals from file', () => {
      // Initial state
      mockExistsSync.mockReturnValue(false);

      const service = new ReadingGoalsService(
        createMockConfig() as any,
        mockScanner as any
      );

      expect(service.getGoals().dailyGoalMinutes).toBe(30);

      // Simulate external change to file
      const updatedData = createGoalsFileData({
        goals: { dailyGoalMinutes: 60 },
      });

      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(updatedData));

      service.reload();
      expect(service.getGoals().dailyGoalMinutes).toBe(60);
    });
  });
});
