import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

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
      streakFreezeDays: [],
      ...(overrides.goals as Record<string, unknown> || {}),
    },
    streak: {
      currentStreak: 0,
      longestStreak: 0,
      lastReadDate: '',
      streakStartDate: '2024-01-15',
      graceDaysUsed: 0,
      freezeDaysUsed: 0,
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

      // Creating the service should trigger file creation
      new ReadingGoalsService(
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

  describe('getWeekSummary', () => {
    it('returns empty summary when no reading data', () => {
      mockExistsSync.mockReturnValue(false);
      mockScanner.getAll.mockReturnValue([]);

      const service = new ReadingGoalsService(
        createMockConfig() as any,
        mockScanner as any
      );

      const summary = service.getWeekSummary();
      expect(summary.totalDurationMs).toBe(0);
      expect(summary.totalSessions).toBe(0);
      expect(summary.booksRead).toBe(0);
      expect(summary.daysWithReading).toBe(0);
      expect(summary.daysGoalMet).toBe(0);
      expect(summary.weeklyGoalMet).toBe(false);
    });

    it('aggregates reading data for the current week', () => {
      // Date is Monday Jan 15, 2024 - week is Jan 15-21 (Mon-Sun)
      // The test was set to Jan 15, so only data from Jan 15 onwards is in current week
      vi.setSystemTime(new Date('2024-01-15T12:00:00Z'));

      mockExistsSync.mockReturnValue(false);
      mockScanner.getAll.mockReturnValue([
        {
          id: 'book1',
          frontmatter: {
            reading_history: [
              { date: '2024-01-15', duration_ms: 1800000, sessions: 1, pages: 10 }, // Mon - 30min (in week)
              { date: '2024-01-14', duration_ms: 1800000, sessions: 1, pages: 10 }, // Sun - 30min (NOT in week - previous week)
            ],
          },
        },
        {
          id: 'book2',
          frontmatter: {
            reading_history: [
              { date: '2024-01-15', duration_ms: 600000, sessions: 1, pages: 5 }, // Mon - 10min additional
            ],
          },
        },
      ]);

      const service = new ReadingGoalsService(
        createMockConfig() as any,
        mockScanner as any
      );

      const summary = service.getWeekSummary();
      // Only Jan 15 data should be counted (1800000 + 600000 = 2400000 = 40 min)
      expect(summary.totalDurationMs).toBe(2400000);
      expect(summary.totalSessions).toBe(2);
      expect(summary.booksRead).toBe(2); // 2 unique books
      expect(summary.daysWithReading).toBe(1); // Only Mon
      expect(summary.daysGoalMet).toBe(1); // Mon met 30min goal (40min total)
    });

    it('correctly calculates weekly goal status', () => {
      // Set to end of week to test weekly goal calculation
      vi.setSystemTime(new Date('2024-01-21T12:00:00Z')); // Sunday Jan 21

      // 30min * 7 days = 210min weekly goal
      const goalsData = createGoalsFileData({
        goals: { dailyGoalMinutes: 30 },
      });
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(goalsData));

      // Provide enough reading to exceed weekly goal (220min) in current week (Jan 15-21)
      mockScanner.getAll.mockReturnValue([
        {
          id: 'book1',
          frontmatter: {
            reading_history: [
              { date: '2024-01-15', duration_ms: 3300000, sessions: 1, pages: 30 }, // 55min Mon
              { date: '2024-01-16', duration_ms: 3300000, sessions: 1, pages: 30 }, // 55min Tue
              { date: '2024-01-17', duration_ms: 3300000, sessions: 1, pages: 30 }, // 55min Wed
              { date: '2024-01-18', duration_ms: 3300000, sessions: 1, pages: 30 }, // 55min Thu = 220min total
            ],
          },
        },
      ]);

      const service = new ReadingGoalsService(
        createMockConfig() as any,
        mockScanner as any
      );

      const summary = service.getWeekSummary();
      expect(summary.weeklyGoalMet).toBe(true);
    });
  });

  describe('getStreakRiskInfo', () => {
    it('returns null when no streak exists', () => {
      mockExistsSync.mockReturnValue(false);
      mockScanner.getAll.mockReturnValue([]);

      const service = new ReadingGoalsService(
        createMockConfig() as any,
        mockScanner as any
      );

      const risk = service.getStreakRiskInfo();
      expect(risk).toBeNull();
    });

    it('returns not at risk when goal is met today', () => {
      const goalsData = createGoalsFileData({
        streak: {
          currentStreak: 5,
          lastReadDate: '2024-01-14',
        },
      });
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(goalsData));

      // Goal met (30min of reading today)
      mockScanner.getAll.mockReturnValue([
        {
          id: 'book1',
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

      const risk = service.getStreakRiskInfo();
      expect(risk).not.toBeNull();
      expect(risk!.isAtRisk).toBe(false);
      expect(risk!.minutesRemaining).toBe(0);
    });

    it('returns at risk when streak exists but goal not met today', () => {
      const goalsData = createGoalsFileData({
        streak: {
          currentStreak: 5,
          lastReadDate: '2024-01-14',
        },
      });
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(goalsData));

      // Only 15min of reading (50% of 30min goal)
      mockScanner.getAll.mockReturnValue([
        {
          id: 'book1',
          frontmatter: {
            reading_history: [
              { date: '2024-01-15', duration_ms: 900000, sessions: 1, pages: 5 },
            ],
          },
        },
      ]);

      const service = new ReadingGoalsService(
        createMockConfig() as any,
        mockScanner as any
      );

      const risk = service.getStreakRiskInfo();
      expect(risk).not.toBeNull();
      expect(risk!.isAtRisk).toBe(true);
      expect(risk!.minutesRemaining).toBe(15); // Need 15 more minutes
    });

    it('includes grace days remaining information', () => {
      const goalsData = createGoalsFileData({
        goals: { gracePeriodDays: 3 },
        streak: {
          currentStreak: 5,
          lastReadDate: '2024-01-14',
          graceDaysUsed: 1,
        },
      });
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(goalsData));
      mockScanner.getAll.mockReturnValue([]); // No reading today

      const service = new ReadingGoalsService(
        createMockConfig() as any,
        mockScanner as any
      );

      const risk = service.getStreakRiskInfo();
      expect(risk).not.toBeNull();
      expect(risk!.graceDaysRemaining).toBeGreaterThan(0);
    });

    it('includes hours until midnight', () => {
      // Set time to 6 PM (18:00)
      vi.setSystemTime(new Date('2024-01-15T18:00:00Z'));

      const goalsData = createGoalsFileData({
        streak: {
          currentStreak: 5,
          lastReadDate: '2024-01-14',
        },
      });
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(goalsData));
      mockScanner.getAll.mockReturnValue([]);

      const service = new ReadingGoalsService(
        createMockConfig() as any,
        mockScanner as any
      );

      const risk = service.getStreakRiskInfo();
      expect(risk).not.toBeNull();
      expect(risk!.hoursUntilMidnight).toBeLessThan(24);
      expect(risk!.hoursUntilMidnight).toBeGreaterThan(0);
    });
  });

  describe('streak freeze days', () => {
    it('allows adding a freeze day in the future', () => {
      mockExistsSync.mockReturnValue(false);

      const service = new ReadingGoalsService(
        createMockConfig() as any,
        mockScanner as any
      );

      const goals = service.addFreezeDay('2024-01-20');
      expect(goals.streakFreezeDays).toContain('2024-01-20');
    });

    it('prevents adding freeze days in the past', () => {
      mockExistsSync.mockReturnValue(false);

      const service = new ReadingGoalsService(
        createMockConfig() as any,
        mockScanner as any
      );

      const goals = service.addFreezeDay('2024-01-10'); // Before today (2024-01-15)
      expect(goals.streakFreezeDays).not.toContain('2024-01-10');
    });

    it('allows removing a freeze day', () => {
      const existingData = createGoalsFileData({
        goals: { streakFreezeDays: ['2024-01-20', '2024-01-25'] },
      });

      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(existingData));

      const service = new ReadingGoalsService(
        createMockConfig() as any,
        mockScanner as any
      );

      const goals = service.removeFreezeDay('2024-01-20');
      expect(goals.streakFreezeDays).not.toContain('2024-01-20');
      expect(goals.streakFreezeDays).toContain('2024-01-25');
    });

    it('recognizes today as a freeze day', () => {
      const existingData = createGoalsFileData({
        goals: { streakFreezeDays: ['2024-01-15'] }, // Today
      });

      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(existingData));

      const service = new ReadingGoalsService(
        createMockConfig() as any,
        mockScanner as any
      );

      expect(service.isTodayFreezeDay()).toBe(true);
    });

    it('does not break streak on freeze day even without reading', () => {
      const existingData = createGoalsFileData({
        goals: { streakFreezeDays: ['2024-01-14'] }, // Yesterday was a freeze day
        streak: {
          currentStreak: 3,
          lastReadDate: '2024-01-13',
          streakStartDate: '2024-01-11',
        },
      });

      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(existingData));
      mockScanner.getAll.mockReturnValue([
        {
          frontmatter: {
            reading_history: [
              { date: '2024-01-15', duration_ms: 1800000, sessions: 1, pages: 10 }, // Read today (30min)
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
      expect(streak.freezeDaysUsed).toBe(1); // Jan 14 was a freeze day
    });

    it('correctly counts freeze days during streak gap', () => {
      const existingData = createGoalsFileData({
        goals: {
          gracePeriodDays: 1,
          streakFreezeDays: ['2024-01-13', '2024-01-14'], // Two freeze days
        },
        streak: {
          currentStreak: 5,
          lastReadDate: '2024-01-12', // Last read 3 days ago
          streakStartDate: '2024-01-08',
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
      // 3 days since last read: Jan 13, 14 are freeze days, no grace needed
      expect(streak.currentStreak).toBe(6); // Streak continues
      expect(streak.freezeDaysUsed).toBe(2); // Two freeze days used
      expect(streak.graceDaysUsed).toBe(0); // No grace days needed
    });

    it('includes freeze day info in streak risk', () => {
      const existingData = createGoalsFileData({
        goals: { streakFreezeDays: ['2024-01-15'] }, // Today is a freeze day
        streak: {
          currentStreak: 5,
          lastReadDate: '2024-01-14',
        },
      });

      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(existingData));
      mockScanner.getAll.mockReturnValue([]); // No reading today

      const service = new ReadingGoalsService(
        createMockConfig() as any,
        mockScanner as any
      );

      const risk = service.getStreakRiskInfo();
      expect(risk).not.toBeNull();
      expect(risk!.isFreezeDay).toBe(true);
      expect(risk!.isAtRisk).toBe(false); // Not at risk because it's a freeze day
    });

    it('returns upcoming freeze days', () => {
      const existingData = createGoalsFileData({
        goals: { streakFreezeDays: ['2024-01-16', '2024-01-18', '2024-01-25'] },
      });

      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(existingData));

      const service = new ReadingGoalsService(
        createMockConfig() as any,
        mockScanner as any
      );

      const upcoming = service.getUpcomingFreezeDays(7);
      expect(upcoming).toEqual(['2024-01-16', '2024-01-18']); // 2024-01-25 is beyond 7 days
    });
  });

  describe('getMonthSummary', () => {
    it('returns empty summary for month with no reading', () => {
      mockExistsSync.mockReturnValue(false);
      mockScanner.getAll.mockReturnValue([]);

      const service = new ReadingGoalsService(
        createMockConfig() as any,
        mockScanner as any
      );

      const summary = service.getMonthSummary('2024-01');
      expect(summary.month).toBe('2024-01');
      expect(summary.totalDurationMs).toBe(0);
      expect(summary.totalSessions).toBe(0);
      expect(summary.booksRead).toBe(0);
      expect(summary.daysWithReading).toBe(0);
      expect(summary.booksCompleted).toBe(0);
    });

    it('aggregates reading data for the specified month', () => {
      mockExistsSync.mockReturnValue(false);
      mockScanner.getAll.mockReturnValue([
        {
          id: 'book1',
          dateFinished: null,
          frontmatter: {
            reading_history: [
              { date: '2024-01-10', duration_ms: 1800000, sessions: 1, pages: 10 },
              { date: '2024-01-15', duration_ms: 1800000, sessions: 1, pages: 10 },
              { date: '2024-01-20', duration_ms: 1800000, sessions: 1, pages: 10 },
              { date: '2024-02-01', duration_ms: 1800000, sessions: 1, pages: 10 }, // Different month
            ],
          },
        },
        {
          id: 'book2',
          dateFinished: null,
          frontmatter: {
            reading_history: [
              { date: '2024-01-15', duration_ms: 600000, sessions: 1, pages: 5 },
            ],
          },
        },
      ]);

      const service = new ReadingGoalsService(
        createMockConfig() as any,
        mockScanner as any
      );

      const summary = service.getMonthSummary('2024-01');
      expect(summary.month).toBe('2024-01');
      expect(summary.totalDurationMs).toBe(6000000); // 100 min (Jan only)
      expect(summary.totalSessions).toBe(4);
      expect(summary.booksRead).toBe(2);
      expect(summary.daysWithReading).toBe(3); // Jan 10, 15, 20
    });

    it('counts books completed in the month', () => {
      mockExistsSync.mockReturnValue(false);
      mockScanner.getAll.mockReturnValue([
        {
          id: 'book1',
          dateFinished: '2024-01-20T10:00:00Z', // Completed in January
          frontmatter: {
            reading_history: [
              { date: '2024-01-15', duration_ms: 1800000, sessions: 1, pages: 10 },
            ],
          },
        },
        {
          id: 'book2',
          dateFinished: '2024-01-25T10:00:00Z', // Also completed in January
          frontmatter: {
            reading_history: [
              { date: '2024-01-20', duration_ms: 1800000, sessions: 1, pages: 10 },
            ],
          },
        },
        {
          id: 'book3',
          dateFinished: '2024-02-05T10:00:00Z', // Completed in February
          frontmatter: {
            reading_history: [
              { date: '2024-01-25', duration_ms: 1800000, sessions: 1, pages: 10 },
            ],
          },
        },
      ]);

      const service = new ReadingGoalsService(
        createMockConfig() as any,
        mockScanner as any
      );

      const summary = service.getMonthSummary('2024-01');
      expect(summary.booksCompleted).toBe(2);
    });

    it('defaults to current month when no month specified', () => {
      vi.setSystemTime(new Date('2024-01-15T12:00:00Z'));

      mockExistsSync.mockReturnValue(false);
      mockScanner.getAll.mockReturnValue([
        {
          id: 'book1',
          dateFinished: null,
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

      const summary = service.getMonthSummary(); // No month specified
      expect(summary.month).toBe('2024-01');
      expect(summary.totalDurationMs).toBe(1800000);
    });

    it('calculates days goal met correctly', () => {
      mockExistsSync.mockReturnValue(false);
      mockScanner.getAll.mockReturnValue([
        {
          id: 'book1',
          dateFinished: null,
          frontmatter: {
            reading_history: [
              { date: '2024-01-10', duration_ms: 1800000, sessions: 1, pages: 10 }, // 30min - goal met
              { date: '2024-01-11', duration_ms: 900000, sessions: 1, pages: 5 },   // 15min - goal NOT met
              { date: '2024-01-12', duration_ms: 2400000, sessions: 1, pages: 15 }, // 40min - goal met
            ],
          },
        },
      ]);

      const service = new ReadingGoalsService(
        createMockConfig() as any,
        mockScanner as any
      );

      const summary = service.getMonthSummary('2024-01');
      expect(summary.daysGoalMet).toBe(2); // Jan 10 and Jan 12
    });
  });
});
