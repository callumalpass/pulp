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

    it('calculates averageDailyMs correctly', () => {
      mockExistsSync.mockReturnValue(false);
      mockScanner.getAll.mockReturnValue([
        {
          id: 'book1',
          dateFinished: null,
          frontmatter: {
            reading_history: [
              { date: '2024-01-10', duration_ms: 1800000, sessions: 1, pages: 10 }, // 30min
              { date: '2024-01-11', duration_ms: 3600000, sessions: 2, pages: 20 }, // 60min
            ],
          },
        },
      ]);

      const service = new ReadingGoalsService(
        createMockConfig() as any,
        mockScanner as any
      );

      const summary = service.getMonthSummary('2024-01');
      // Total: 5400000ms, 2 days with reading => average = 2700000ms
      expect(summary.averageDailyMs).toBe(2700000);
    });

    it('returns zero averageDailyMs when no reading days', () => {
      mockExistsSync.mockReturnValue(false);
      mockScanner.getAll.mockReturnValue([]);

      const service = new ReadingGoalsService(
        createMockConfig() as any,
        mockScanner as any
      );

      const summary = service.getMonthSummary('2024-01');
      expect(summary.averageDailyMs).toBe(0);
    });

    it('counts days with reading across multiple books on the same day', () => {
      mockExistsSync.mockReturnValue(false);
      mockScanner.getAll.mockReturnValue([
        {
          id: 'book1',
          dateFinished: null,
          frontmatter: {
            reading_history: [
              { date: '2024-01-10', duration_ms: 600000, sessions: 1, pages: 5 },
            ],
          },
        },
        {
          id: 'book2',
          dateFinished: null,
          frontmatter: {
            reading_history: [
              { date: '2024-01-10', duration_ms: 1200000, sessions: 1, pages: 8 },
            ],
          },
        },
      ]);

      const service = new ReadingGoalsService(
        createMockConfig() as any,
        mockScanner as any
      );

      const summary = service.getMonthSummary('2024-01');
      // Both books read on same day - should count as 1 day with reading
      expect(summary.daysWithReading).toBe(1);
      // Combined duration for that day: 600000 + 1200000 = 1800000 (30min = goal met)
      expect(summary.daysGoalMet).toBe(1);
      expect(summary.booksRead).toBe(2);
    });
  });

  describe('updateGoals - streakFreezeDays validation', () => {
    it('filters out invalid date formats from streakFreezeDays', () => {
      mockExistsSync.mockReturnValue(false);

      const service = new ReadingGoalsService(
        createMockConfig() as any,
        mockScanner as any
      );

      const updated = service.updateGoals({
        streakFreezeDays: ['2024-01-20', 'invalid', '01-20-2024', '2024-1-5', '2024-01-25'],
      });

      // Only valid YYYY-MM-DD dates should be kept, and past dates cleaned
      expect(updated.streakFreezeDays).toContain('2024-01-20');
      expect(updated.streakFreezeDays).toContain('2024-01-25');
      expect(updated.streakFreezeDays).not.toContain('invalid');
      expect(updated.streakFreezeDays).not.toContain('01-20-2024');
      expect(updated.streakFreezeDays).not.toContain('2024-1-5');
    });

    it('limits streakFreezeDays to maximum of 30', () => {
      mockExistsSync.mockReturnValue(false);

      const service = new ReadingGoalsService(
        createMockConfig() as any,
        mockScanner as any
      );

      // Generate 35 future dates
      const dates: string[] = [];
      for (let i = 0; i < 35; i++) {
        const day = String(i + 15).padStart(2, '0');
        // Use January and February to get enough days
        if (i + 15 <= 31) {
          dates.push(`2024-01-${day}`);
        } else {
          const febDay = String(i + 15 - 31).padStart(2, '0');
          dates.push(`2024-02-${febDay}`);
        }
      }

      const updated = service.updateGoals({ streakFreezeDays: dates });
      expect(updated.streakFreezeDays.length).toBeLessThanOrEqual(30);
    });

    it('cleans up past dates from streakFreezeDays', () => {
      mockExistsSync.mockReturnValue(false);

      const service = new ReadingGoalsService(
        createMockConfig() as any,
        mockScanner as any
      );

      const updated = service.updateGoals({
        streakFreezeDays: ['2024-01-10', '2024-01-12', '2024-01-20', '2024-01-25'],
      });

      // Past dates (before 2024-01-15) should be removed
      expect(updated.streakFreezeDays).not.toContain('2024-01-10');
      expect(updated.streakFreezeDays).not.toContain('2024-01-12');
      // Future dates preserved
      expect(updated.streakFreezeDays).toContain('2024-01-20');
      expect(updated.streakFreezeDays).toContain('2024-01-25');
    });

    it('sorts streakFreezeDays chronologically', () => {
      mockExistsSync.mockReturnValue(false);

      const service = new ReadingGoalsService(
        createMockConfig() as any,
        mockScanner as any
      );

      const updated = service.updateGoals({
        streakFreezeDays: ['2024-01-25', '2024-01-18', '2024-01-20'],
      });

      expect(updated.streakFreezeDays).toEqual(['2024-01-18', '2024-01-20', '2024-01-25']);
    });
  });

  describe('addFreezeDay - edge cases', () => {
    it('rejects invalid date format', () => {
      mockExistsSync.mockReturnValue(false);

      const service = new ReadingGoalsService(
        createMockConfig() as any,
        mockScanner as any
      );

      const goals = service.addFreezeDay('not-a-date');
      expect(goals.streakFreezeDays).toHaveLength(0);
    });

    it('prevents duplicate freeze day', () => {
      const existingData = createGoalsFileData({
        goals: { streakFreezeDays: ['2024-01-20'] },
      });

      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(existingData));

      const service = new ReadingGoalsService(
        createMockConfig() as any,
        mockScanner as any
      );

      const goals = service.addFreezeDay('2024-01-20');
      // Should still have only one instance
      expect(goals.streakFreezeDays.filter(d => d === '2024-01-20')).toHaveLength(1);
    });

    it('enforces maximum of 30 freeze days', () => {
      // Create 30 existing freeze days
      const dates: string[] = [];
      for (let i = 15; i <= 31; i++) {
        dates.push(`2024-01-${String(i).padStart(2, '0')}`);
      }
      for (let i = 1; i <= 13; i++) {
        dates.push(`2024-02-${String(i).padStart(2, '0')}`);
      }
      // Now we have 30 dates (Jan 15-31 = 17, Feb 1-13 = 13)

      const existingData = createGoalsFileData({
        goals: { streakFreezeDays: dates },
      });

      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(existingData));

      const service = new ReadingGoalsService(
        createMockConfig() as any,
        mockScanner as any
      );

      const goals = service.addFreezeDay('2024-02-20');
      expect(goals.streakFreezeDays).not.toContain('2024-02-20');
      expect(goals.streakFreezeDays).toHaveLength(30);
    });

    it('allows adding today as a freeze day', () => {
      mockExistsSync.mockReturnValue(false);

      const service = new ReadingGoalsService(
        createMockConfig() as any,
        mockScanner as any
      );

      const goals = service.addFreezeDay('2024-01-15'); // Today
      expect(goals.streakFreezeDays).toContain('2024-01-15');
    });

    it('keeps freeze days sorted after adding', () => {
      const existingData = createGoalsFileData({
        goals: { streakFreezeDays: ['2024-01-20', '2024-01-25'] },
      });

      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(existingData));

      const service = new ReadingGoalsService(
        createMockConfig() as any,
        mockScanner as any
      );

      const goals = service.addFreezeDay('2024-01-22');
      expect(goals.streakFreezeDays).toEqual(['2024-01-20', '2024-01-22', '2024-01-25']);
    });
  });

  describe('removeFreezeDay - edge cases', () => {
    it('handles removing a date that does not exist', () => {
      const existingData = createGoalsFileData({
        goals: { streakFreezeDays: ['2024-01-20'] },
      });

      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(existingData));

      const service = new ReadingGoalsService(
        createMockConfig() as any,
        mockScanner as any
      );

      const goals = service.removeFreezeDay('2024-01-25');
      expect(goals.streakFreezeDays).toEqual(['2024-01-20']);
    });

    it('handles removing from empty freeze days list', () => {
      mockExistsSync.mockReturnValue(false);

      const service = new ReadingGoalsService(
        createMockConfig() as any,
        mockScanner as any
      );

      const goals = service.removeFreezeDay('2024-01-20');
      expect(goals.streakFreezeDays).toEqual([]);
    });
  });

  describe('recalculateStreak - advanced scenarios', () => {
    it('accounts for freeze days during recalculation', () => {
      const existingData = createGoalsFileData({
        goals: {
          gracePeriodDays: 0,
          streakFreezeDays: ['2024-01-14'], // Yesterday is a freeze day
        },
      });

      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(existingData));
      mockScanner.getAll.mockReturnValue([
        {
          frontmatter: {
            reading_history: [
              { date: '2024-01-15', duration_ms: 1800000, sessions: 1, pages: 10 }, // Today
              // Jan 14 = freeze day (no reading needed)
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
      expect(streak.currentStreak).toBe(2); // Jan 13 + Jan 15 (freeze day skipped)
      expect(streak.freezeDaysUsed).toBe(1);
    });

    it('resets streak to zero when grace period exceeded on recalculation', () => {
      const existingData = createGoalsFileData({
        goals: { gracePeriodDays: 1 },
      });

      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(existingData));
      mockScanner.getAll.mockReturnValue([
        {
          frontmatter: {
            reading_history: [
              // No reading today (Jan 15), or yesterday (Jan 14), or day before (Jan 13)
              { date: '2024-01-12', duration_ms: 1800000, sessions: 1, pages: 10 },
              { date: '2024-01-11', duration_ms: 1800000, sessions: 1, pages: 10 },
            ],
          },
        },
      ]);

      const service = new ReadingGoalsService(
        createMockConfig() as any,
        mockScanner as any
      );

      const streak = service.recalculateStreak();
      // Today not met, Jan 14 not met, Jan 13 not met => grace exceeded (>1 day)
      // Streak should be 0 since we can't reach any goal-met days within grace
      expect(streak.currentStreak).toBe(0);
    });

    it('preserves longestStreak when recalculated streak is shorter', () => {
      const existingData = createGoalsFileData({
        streak: {
          currentStreak: 20,
          longestStreak: 50,
          lastReadDate: '2024-01-14',
        },
      });

      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(existingData));
      mockScanner.getAll.mockReturnValue([
        {
          frontmatter: {
            reading_history: [
              { date: '2024-01-15', duration_ms: 1800000, sessions: 1, pages: 10 },
              { date: '2024-01-14', duration_ms: 1800000, sessions: 1, pages: 10 },
            ],
          },
        },
      ]);

      const service = new ReadingGoalsService(
        createMockConfig() as any,
        mockScanner as any
      );

      const streak = service.recalculateStreak();
      // Recalculated streak is 2 (Jan 14 + Jan 15), but longest should stay at 50
      expect(streak.currentStreak).toBe(2);
      expect(streak.longestStreak).toBe(50);
    });

    it('updates longestStreak when recalculated streak exceeds it', () => {
      const existingData = createGoalsFileData({
        streak: {
          longestStreak: 2,
        },
      });

      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(existingData));
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
      expect(streak.longestStreak).toBe(3);
    });

    it('sets lastReadDate to empty string when no reading history', () => {
      mockExistsSync.mockReturnValue(false);
      mockScanner.getAll.mockReturnValue([]);

      const service = new ReadingGoalsService(
        createMockConfig() as any,
        mockScanner as any
      );

      const streak = service.recalculateStreak();
      expect(streak.currentStreak).toBe(0);
      expect(streak.lastReadDate).toBe('');
    });
  });

  describe('updateStreak - freeze days combined with grace period', () => {
    it('uses both freeze days and grace period to bridge a multi-day gap', () => {
      const existingData = createGoalsFileData({
        goals: {
          gracePeriodDays: 1,
          streakFreezeDays: ['2024-01-13'], // One freeze day
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
      // Gap: Jan 13 (freeze), Jan 14 (grace). Grace days needed = 1, grace period = 1 => OK
      expect(streak.currentStreak).toBe(6);
      expect(streak.freezeDaysUsed).toBe(1);
      expect(streak.graceDaysUsed).toBe(1);
    });

    it('breaks streak when non-freeze missed days exceed grace period', () => {
      const existingData = createGoalsFileData({
        goals: {
          gracePeriodDays: 1,
          streakFreezeDays: ['2024-01-13'], // Only one freeze day
        },
        streak: {
          currentStreak: 5,
          lastReadDate: '2024-01-11', // Last read 4 days ago
          streakStartDate: '2024-01-07',
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
      // Gap: Jan 12 (grace), Jan 13 (freeze), Jan 14 (grace). Grace days needed = 2, grace period = 1 => BROKEN
      expect(streak.currentStreak).toBe(1);
      expect(streak.streakStartDate).toBe('2024-01-15');
    });

    it('resets graceDaysUsed on consecutive day read', () => {
      const existingData = createGoalsFileData({
        streak: {
          currentStreak: 3,
          lastReadDate: '2024-01-14',
          streakStartDate: '2024-01-12',
          graceDaysUsed: 2,
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
      expect(streak.graceDaysUsed).toBe(0); // Reset on consecutive day
    });
  });

  describe('getWeekSummary - advanced', () => {
    it('uses custom weeklyGoalMinutes when set', () => {
      vi.setSystemTime(new Date('2024-01-15T12:00:00Z')); // Monday

      const goalsData = createGoalsFileData({
        goals: {
          dailyGoalMinutes: 30,
          weeklyGoalMinutes: 60, // Custom weekly goal: 60 minutes total for the week
        },
      });
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(goalsData));

      mockScanner.getAll.mockReturnValue([
        {
          id: 'book1',
          frontmatter: {
            reading_history: [
              { date: '2024-01-15', duration_ms: 3600000, sessions: 1, pages: 30 }, // 60min
            ],
          },
        },
      ]);

      const service = new ReadingGoalsService(
        createMockConfig() as any,
        mockScanner as any
      );

      const summary = service.getWeekSummary();
      // 60min reading >= 60min weekly goal => met
      expect(summary.weeklyGoalMet).toBe(true);
    });

    it('calculates averageDailyMs only for days with reading', () => {
      vi.setSystemTime(new Date('2024-01-17T12:00:00Z')); // Wednesday

      mockExistsSync.mockReturnValue(false);
      mockScanner.getAll.mockReturnValue([
        {
          id: 'book1',
          frontmatter: {
            reading_history: [
              { date: '2024-01-15', duration_ms: 1800000, sessions: 1, pages: 10 }, // Mon: 30min
              { date: '2024-01-17', duration_ms: 3600000, sessions: 2, pages: 20 }, // Wed: 60min
              // Tue: no reading
            ],
          },
        },
      ]);

      const service = new ReadingGoalsService(
        createMockConfig() as any,
        mockScanner as any
      );

      const summary = service.getWeekSummary();
      // Total: 5400000ms, 2 days with reading => average = 2700000ms
      expect(summary.averageDailyMs).toBe(2700000);
      expect(summary.daysWithReading).toBe(2);
    });

    it('returns zero averageDailyMs when no reading in the week', () => {
      mockExistsSync.mockReturnValue(false);
      mockScanner.getAll.mockReturnValue([]);

      const service = new ReadingGoalsService(
        createMockConfig() as any,
        mockScanner as any
      );

      const summary = service.getWeekSummary();
      expect(summary.averageDailyMs).toBe(0);
    });

    it('does not include future dates in week summary', () => {
      vi.setSystemTime(new Date('2024-01-15T12:00:00Z')); // Monday

      mockExistsSync.mockReturnValue(false);
      // Suppose there's somehow data for future dates
      mockScanner.getAll.mockReturnValue([
        {
          id: 'book1',
          frontmatter: {
            reading_history: [
              { date: '2024-01-15', duration_ms: 1800000, sessions: 1, pages: 10 }, // Today
              { date: '2024-01-16', duration_ms: 1800000, sessions: 1, pages: 10 }, // Tomorrow (future)
            ],
          },
        },
      ]);

      const service = new ReadingGoalsService(
        createMockConfig() as any,
        mockScanner as any
      );

      const summary = service.getWeekSummary();
      // Only today's data should be counted
      expect(summary.totalDurationMs).toBe(1800000);
      expect(summary.daysWithReading).toBe(1);
    });
  });

  describe('getStreakRiskInfo - advanced', () => {
    it('includes nextFreezeDay in risk info', () => {
      const existingData = createGoalsFileData({
        goals: { streakFreezeDays: ['2024-01-18', '2024-01-22'] },
        streak: {
          currentStreak: 5,
          lastReadDate: '2024-01-14',
        },
      });

      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(existingData));
      mockScanner.getAll.mockReturnValue([]);

      const service = new ReadingGoalsService(
        createMockConfig() as any,
        mockScanner as any
      );

      const risk = service.getStreakRiskInfo();
      expect(risk).not.toBeNull();
      expect(risk!.nextFreezeDay).toBe('2024-01-18');
    });

    it('returns null nextFreezeDay when no freeze days scheduled', () => {
      const existingData = createGoalsFileData({
        streak: {
          currentStreak: 5,
          lastReadDate: '2024-01-14',
        },
      });

      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(existingData));
      mockScanner.getAll.mockReturnValue([]);

      const service = new ReadingGoalsService(
        createMockConfig() as any,
        mockScanner as any
      );

      const risk = service.getStreakRiskInfo();
      expect(risk).not.toBeNull();
      expect(risk!.nextFreezeDay).toBeNull();
    });

    it('calculates minutesRemaining based on partial reading', () => {
      const goalsData = createGoalsFileData({
        streak: {
          currentStreak: 3,
          lastReadDate: '2024-01-14',
        },
      });

      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(goalsData));

      // 20 minutes of reading, 30 min goal -> 10 min remaining
      mockScanner.getAll.mockReturnValue([
        {
          frontmatter: {
            reading_history: [
              { date: '2024-01-15', duration_ms: 1200000, sessions: 1, pages: 7 }, // 20min
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
      expect(risk!.minutesRemaining).toBe(10);
      expect(risk!.isAtRisk).toBe(true);
    });

    it('shows full goal as minutesRemaining when no reading done', () => {
      const goalsData = createGoalsFileData({
        streak: {
          currentStreak: 3,
          lastReadDate: '2024-01-14',
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
      expect(risk!.minutesRemaining).toBe(30);
    });
  });

  describe('getDaySummary - edge cases', () => {
    it('ignores entries with zero duration', () => {
      mockExistsSync.mockReturnValue(false);
      mockScanner.getAll.mockReturnValue([
        {
          frontmatter: {
            reading_history: [
              { date: '2024-01-15', duration_ms: 0, sessions: 0, pages: 0 },
            ],
          },
        },
      ]);

      const service = new ReadingGoalsService(
        createMockConfig() as any,
        mockScanner as any
      );

      const summary = service.getDaySummary('2024-01-15');
      expect(summary.totalDurationMs).toBe(0);
      expect(summary.booksRead).toBe(0);
      expect(summary.goalMet).toBe(false);
    });

    it('returns correct data for a date with no entries', () => {
      mockExistsSync.mockReturnValue(false);
      mockScanner.getAll.mockReturnValue([
        {
          frontmatter: {
            reading_history: [
              { date: '2024-01-10', duration_ms: 1800000, sessions: 1, pages: 10 },
            ],
          },
        },
      ]);

      const service = new ReadingGoalsService(
        createMockConfig() as any,
        mockScanner as any
      );

      const summary = service.getDaySummary('2024-01-15');
      expect(summary.date).toBe('2024-01-15');
      expect(summary.totalDurationMs).toBe(0);
      expect(summary.totalSessions).toBe(0);
      expect(summary.booksRead).toBe(0);
      expect(summary.goalMet).toBe(false);
    });
  });

  describe('updateGoals - partial updates', () => {
    it('preserves existing fields when updating only one field', () => {
      const existingData = createGoalsFileData({
        goals: {
          dailyGoalMinutes: 45,
          weeklyGoalMinutes: 200,
          gracePeriodDays: 3,
          streakFreezeDays: ['2024-01-20'],
        },
      });

      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(existingData));

      const service = new ReadingGoalsService(
        createMockConfig() as any,
        mockScanner as any
      );

      const updated = service.updateGoals({ dailyGoalMinutes: 60 });
      expect(updated.dailyGoalMinutes).toBe(60);
      expect(updated.weeklyGoalMinutes).toBe(200); // Unchanged
      expect(updated.gracePeriodDays).toBe(3); // Unchanged
      expect(updated.streakFreezeDays).toContain('2024-01-20'); // Unchanged
    });

    it('persists updated goals to file', () => {
      mockExistsSync.mockReturnValue(false);

      const service = new ReadingGoalsService(
        createMockConfig() as any,
        mockScanner as any
      );

      // Reset writeFileSync call count from constructor
      mockWriteFileSync.mockClear();

      service.updateGoals({ dailyGoalMinutes: 45 });

      expect(mockWriteFileSync).toHaveBeenCalledTimes(1);
      const writtenContent = JSON.parse(mockWriteFileSync.mock.calls[0][1] as string);
      expect(writtenContent.goals.dailyGoalMinutes).toBe(45);
    });
  });

  describe('constructor - merges with defaults for incomplete files', () => {
    it('fills in missing fields from an existing partial goals file', () => {
      // Simulate a file that only has some fields
      const partialData = {
        goals: {
          dailyGoalMinutes: 45,
          // Missing: weeklyGoalMinutes, gracePeriodDays, streakFreezeDays
        },
        streak: {
          currentStreak: 5,
          // Missing: longestStreak, lastReadDate, streakStartDate, etc.
        },
      };

      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(partialData));

      const service = new ReadingGoalsService(
        createMockConfig() as any,
        mockScanner as any
      );

      const goals = service.getGoals();
      expect(goals.dailyGoalMinutes).toBe(45); // From file
      expect(goals.weeklyGoalMinutes).toBeNull(); // Default
      expect(goals.gracePeriodDays).toBe(1); // Default
      expect(goals.streakFreezeDays).toEqual([]); // Default

      const streak = service.getStreak();
      expect(streak.currentStreak).toBe(5); // From file
      expect(streak.longestStreak).toBe(0); // Default
      expect(streak.lastReadDate).toBe(''); // Default
    });
  });

  describe('getGoals and getStreak return copies', () => {
    it('getGoals returns a new object each call', () => {
      mockExistsSync.mockReturnValue(false);

      const service = new ReadingGoalsService(
        createMockConfig() as any,
        mockScanner as any
      );

      const goals1 = service.getGoals();
      const goals2 = service.getGoals();
      expect(goals1).toEqual(goals2);
      expect(goals1).not.toBe(goals2);
    });

    it('getStreak returns a new object each call', () => {
      mockExistsSync.mockReturnValue(false);

      const service = new ReadingGoalsService(
        createMockConfig() as any,
        mockScanner as any
      );

      const streak1 = service.getStreak();
      const streak2 = service.getStreak();
      expect(streak1).toEqual(streak2);
      expect(streak1).not.toBe(streak2);
    });

    it('mutating returned goals does not affect internal state', () => {
      mockExistsSync.mockReturnValue(false);

      const service = new ReadingGoalsService(
        createMockConfig() as any,
        mockScanner as any
      );

      const goals = service.getGoals();
      goals.dailyGoalMinutes = 9999;

      expect(service.getGoals().dailyGoalMinutes).toBe(30);
    });
  });

  describe('updateStreak - zero grace period', () => {
    it('breaks streak when any day is missed with gracePeriodDays=0', () => {
      const existingData = createGoalsFileData({
        goals: { gracePeriodDays: 0 },
        streak: {
          currentStreak: 5,
          longestStreak: 5,
          lastReadDate: '2024-01-13', // Missed Jan 14
          streakStartDate: '2024-01-09',
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
      // Gap has 1 non-freeze day (Jan 14), grace period = 0 => broken
      expect(streak.currentStreak).toBe(1);
      expect(streak.streakStartDate).toBe('2024-01-15');
    });

    it('continues streak on consecutive days with gracePeriodDays=0', () => {
      const existingData = createGoalsFileData({
        goals: { gracePeriodDays: 0 },
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
    });

    it('continues streak when all gap days are freeze days even with gracePeriodDays=0', () => {
      const existingData = createGoalsFileData({
        goals: {
          gracePeriodDays: 0,
          streakFreezeDays: ['2024-01-13', '2024-01-14'],
        },
        streak: {
          currentStreak: 3,
          lastReadDate: '2024-01-12',
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
      // All gap days are freeze days, so 0 grace days needed => OK
      expect(streak.currentStreak).toBe(4);
      expect(streak.freezeDaysUsed).toBe(2);
      expect(streak.graceDaysUsed).toBe(0);
    });
  });

  describe('updateStreak - graceDaysUsed accumulation', () => {
    it('accumulates graceDaysUsed from previous value when gap has non-freeze days', () => {
      const existingData = createGoalsFileData({
        goals: { gracePeriodDays: 3 },
        streak: {
          currentStreak: 5,
          lastReadDate: '2024-01-13',
          streakStartDate: '2024-01-09',
          graceDaysUsed: 1, // Already used 1 grace day previously
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
      // Gap is Jan 14 (1 grace day needed), gracePeriod=3 so OK
      // graceDaysUsed = previous 1 + new 1 = 2
      expect(streak.currentStreak).toBe(6);
      expect(streak.graceDaysUsed).toBe(2);
    });

    it('accumulates freezeDaysUsed from previous value', () => {
      const existingData = createGoalsFileData({
        goals: {
          gracePeriodDays: 2,
          streakFreezeDays: ['2024-01-14'],
        },
        streak: {
          currentStreak: 5,
          lastReadDate: '2024-01-13',
          streakStartDate: '2024-01-09',
          freezeDaysUsed: 3,
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
      // Gap: Jan 14 is freeze. 0 grace days needed.
      expect(streak.currentStreak).toBe(6);
      expect(streak.freezeDaysUsed).toBe(4); // 3 + 1
    });
  });

  describe('recalculateStreak - today not met but within grace', () => {
    it('keeps streak alive when today is not met but within grace period', () => {
      const existingData = createGoalsFileData({
        goals: { gracePeriodDays: 2 },
      });

      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(existingData));
      mockScanner.getAll.mockReturnValue([
        {
          frontmatter: {
            reading_history: [
              // Today (Jan 15) not met - only 10 min
              { date: '2024-01-15', duration_ms: 600000, sessions: 1, pages: 3 },
              { date: '2024-01-14', duration_ms: 1800000, sessions: 1, pages: 10 }, // Yesterday met
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
      // Today not met, but only 1 non-freeze day since last goal met (today itself)
      // Grace period = 2, so streak should be preserved
      expect(streak.currentStreak).toBe(2); // Jan 13 + Jan 14
      expect(streak.lastReadDate).toBe('2024-01-14');
    });

    it('resets streak when today not met and grace period exceeded', () => {
      const existingData = createGoalsFileData({
        goals: { gracePeriodDays: 1 },
      });

      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(existingData));
      mockScanner.getAll.mockReturnValue([
        {
          frontmatter: {
            reading_history: [
              // Today (Jan 15) not met - 0 reading
              // Jan 14 not met either
              { date: '2024-01-13', duration_ms: 1800000, sessions: 1, pages: 10 },
              { date: '2024-01-12', duration_ms: 1800000, sessions: 1, pages: 10 },
            ],
          },
        },
      ]);

      const service = new ReadingGoalsService(
        createMockConfig() as any,
        mockScanner as any
      );

      const streak = service.recalculateStreak();
      // Last goal met was Jan 13. Non-freeze days since: Jan 14 + Jan 15 = 2
      // Grace period = 1 => exceeded => streak reset to 0
      expect(streak.currentStreak).toBe(0);
      expect(streak.lastReadDate).toBe('');
    });

    it('keeps streak alive when today is a freeze day and not met', () => {
      const existingData = createGoalsFileData({
        goals: {
          gracePeriodDays: 1,
          streakFreezeDays: ['2024-01-15'], // Today is a freeze day
        },
      });

      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(existingData));
      mockScanner.getAll.mockReturnValue([
        {
          frontmatter: {
            reading_history: [
              // Today (Jan 15) - freeze day, no reading needed
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
      // Today is a freeze day, so the post-loop check skips (isTodayFreeze=true)
      expect(streak.currentStreak).toBe(2);
      expect(streak.freezeDaysUsed).toBe(1);
    });
  });

  describe('recalculateStreak - grace period with freeze days in gap', () => {
    it('counts only non-freeze days against grace when today not met', () => {
      const existingData = createGoalsFileData({
        goals: {
          gracePeriodDays: 1,
          streakFreezeDays: ['2024-01-14'], // Yesterday is a freeze day
        },
      });

      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(existingData));
      mockScanner.getAll.mockReturnValue([
        {
          frontmatter: {
            reading_history: [
              // Today (Jan 15) not met
              // Jan 14 = freeze day
              { date: '2024-01-13', duration_ms: 1800000, sessions: 1, pages: 10 }, // Goal met
              { date: '2024-01-12', duration_ms: 1800000, sessions: 1, pages: 10 },
            ],
          },
        },
      ]);

      const service = new ReadingGoalsService(
        createMockConfig() as any,
        mockScanner as any
      );

      const streak = service.recalculateStreak();
      // Last goal met = Jan 13. Between Jan 13 and today (Jan 15):
      // Jan 14 = freeze day, Jan 15 = today (non-freeze). nonFreezeDaysSince = 1
      // Grace period = 1 => 1 <= 1 => streak preserved
      expect(streak.currentStreak).toBe(2);
    });
  });

  describe('saveGoalsFile - error handling', () => {
    it('handles writeFileSync errors gracefully during save', () => {
      mockExistsSync.mockReturnValue(false);
      mockWriteFileSync.mockImplementationOnce(() => {
        // Allow constructor save
      }).mockImplementation(() => {
        throw new Error('Disk full');
      });

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const service = new ReadingGoalsService(
        createMockConfig() as any,
        mockScanner as any
      );

      // Should not throw, but log the error
      const updated = service.updateGoals({ dailyGoalMinutes: 45 });
      expect(updated.dailyGoalMinutes).toBe(45); // In-memory state updated
      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to save goals file:',
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });
  });

  describe('getWeekSummary - weekStartDate and book deduplication', () => {
    it('returns the correct weekStartDate (Monday)', () => {
      // Jan 15, 2024 is a Monday
      vi.setSystemTime(new Date('2024-01-17T12:00:00Z')); // Wednesday

      mockExistsSync.mockReturnValue(false);
      mockScanner.getAll.mockReturnValue([]);

      const service = new ReadingGoalsService(
        createMockConfig() as any,
        mockScanner as any
      );

      const summary = service.getWeekSummary();
      expect(summary.weekStartDate).toBe('2024-01-15'); // Monday
    });

    it('returns Monday for a Sunday date', () => {
      vi.setSystemTime(new Date('2024-01-21T12:00:00Z')); // Sunday

      mockExistsSync.mockReturnValue(false);
      mockScanner.getAll.mockReturnValue([]);

      const service = new ReadingGoalsService(
        createMockConfig() as any,
        mockScanner as any
      );

      const summary = service.getWeekSummary();
      expect(summary.weekStartDate).toBe('2024-01-15'); // Previous Monday
    });

    it('deduplicates books read across multiple days', () => {
      vi.setSystemTime(new Date('2024-01-17T12:00:00Z')); // Wednesday

      mockExistsSync.mockReturnValue(false);
      mockScanner.getAll.mockReturnValue([
        {
          id: 'book-A',
          frontmatter: {
            reading_history: [
              { date: '2024-01-15', duration_ms: 1800000, sessions: 1, pages: 10 },
              { date: '2024-01-16', duration_ms: 1800000, sessions: 1, pages: 10 },
              { date: '2024-01-17', duration_ms: 1800000, sessions: 1, pages: 10 },
            ],
          },
        },
      ]);

      const service = new ReadingGoalsService(
        createMockConfig() as any,
        mockScanner as any
      );

      const summary = service.getWeekSummary();
      expect(summary.booksRead).toBe(1); // Same book across 3 days = 1 unique book
      expect(summary.daysWithReading).toBe(3);
    });
  });

  describe('getMonthSummary - daily goal aggregation across books', () => {
    it('aggregates multiple books on the same day to determine if daily goal is met', () => {
      mockExistsSync.mockReturnValue(false);
      mockScanner.getAll.mockReturnValue([
        {
          id: 'book1',
          dateFinished: null,
          frontmatter: {
            reading_history: [
              { date: '2024-01-10', duration_ms: 900000, sessions: 1, pages: 5 }, // 15min
            ],
          },
        },
        {
          id: 'book2',
          dateFinished: null,
          frontmatter: {
            reading_history: [
              { date: '2024-01-10', duration_ms: 900000, sessions: 1, pages: 5 }, // 15min
            ],
          },
        },
      ]);

      const service = new ReadingGoalsService(
        createMockConfig() as any, // 30min goal
        mockScanner as any
      );

      const summary = service.getMonthSummary('2024-01');
      // 15min + 15min = 30min = goal met (combined across books)
      expect(summary.daysGoalMet).toBe(1);
      expect(summary.totalDurationMs).toBe(1800000);
    });

    it('does not count day as goal-met when combined reading falls short', () => {
      mockExistsSync.mockReturnValue(false);
      mockScanner.getAll.mockReturnValue([
        {
          id: 'book1',
          dateFinished: null,
          frontmatter: {
            reading_history: [
              { date: '2024-01-10', duration_ms: 600000, sessions: 1, pages: 3 }, // 10min
            ],
          },
        },
        {
          id: 'book2',
          dateFinished: null,
          frontmatter: {
            reading_history: [
              { date: '2024-01-10', duration_ms: 600000, sessions: 1, pages: 3 }, // 10min
            ],
          },
        },
      ]);

      const service = new ReadingGoalsService(
        createMockConfig() as any, // 30min goal
        mockScanner as any
      );

      const summary = service.getMonthSummary('2024-01');
      // 10 + 10 = 20min < 30min goal
      expect(summary.daysGoalMet).toBe(0);
    });
  });

  describe('getStreakRiskInfo - edge cases', () => {
    it('detects risk when currentStreak is 0 but lastReadDate is within grace', () => {
      const goalsData = createGoalsFileData({
        goals: { gracePeriodDays: 2 },
        streak: {
          currentStreak: 0,
          lastReadDate: '2024-01-14', // Read yesterday, streak somehow 0
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
      // lastReadDate exists and within grace => isAtRisk should be true
      // nonFreezeDaysSinceLastRead = 1 (Jan 15), gracePeriodDays = 2 => 1 <= 2
      expect(risk!.isAtRisk).toBe(true);
    });

    it('returns null when currentStreak is 0 and no lastReadDate', () => {
      mockExistsSync.mockReturnValue(false);
      mockScanner.getAll.mockReturnValue([]);

      const service = new ReadingGoalsService(
        createMockConfig() as any,
        mockScanner as any
      );

      const risk = service.getStreakRiskInfo();
      expect(risk).toBeNull();
    });

    it('shows not at risk on freeze day even with no reading', () => {
      const goalsData = createGoalsFileData({
        goals: {
          streakFreezeDays: ['2024-01-15'], // Today is a freeze day
        },
        streak: {
          currentStreak: 10,
          lastReadDate: '2024-01-14',
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
      expect(risk!.isAtRisk).toBe(false);
      expect(risk!.isFreezeDay).toBe(true);
      expect(risk!.minutesRemaining).toBe(0);
    });

    it('calculates graceDaysRemaining considering freeze days in gap', () => {
      const goalsData = createGoalsFileData({
        goals: {
          gracePeriodDays: 3,
          streakFreezeDays: ['2024-01-14'], // Yesterday was freeze
        },
        streak: {
          currentStreak: 5,
          lastReadDate: '2024-01-12', // 3 days gap
          graceDaysUsed: 0,
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
      // Gap days: Jan 13 (non-freeze), Jan 14 (freeze), Jan 15=today (non-freeze)
      // nonFreezeDaysSinceLastRead = 2 (Jan 13, Jan 15)
      // graceDaysRemaining = max(0, 3 - 2 + 1) = 2
      expect(risk!.graceDaysRemaining).toBe(2);
    });
  });

  describe('getDaySummary - notes with missing reading_history', () => {
    it('handles notes with empty frontmatter', () => {
      mockExistsSync.mockReturnValue(false);
      mockScanner.getAll.mockReturnValue([
        {
          frontmatter: {},
        },
      ]);

      const service = new ReadingGoalsService(
        createMockConfig() as any,
        mockScanner as any
      );

      const summary = service.getDaySummary('2024-01-15');
      expect(summary.totalDurationMs).toBe(0);
      expect(summary.booksRead).toBe(0);
    });

    it('handles mix of notes with and without reading history', () => {
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
          frontmatter: {}, // No reading_history
        },
        {
          frontmatter: {
            reading_history: [], // Empty history
          },
        },
      ]);

      const service = new ReadingGoalsService(
        createMockConfig() as any,
        mockScanner as any
      );

      const summary = service.getDaySummary('2024-01-15');
      expect(summary.totalDurationMs).toBe(1800000);
      expect(summary.booksRead).toBe(1);
    });
  });

  describe('getUpcomingFreezeDays - custom range', () => {
    it('returns freeze days within a custom daysAhead range', () => {
      const existingData = createGoalsFileData({
        goals: { streakFreezeDays: ['2024-01-16', '2024-01-18', '2024-01-25', '2024-02-10'] },
      });

      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(existingData));

      const service = new ReadingGoalsService(
        createMockConfig() as any,
        mockScanner as any
      );

      const upcoming14 = service.getUpcomingFreezeDays(14);
      expect(upcoming14).toEqual(['2024-01-16', '2024-01-18', '2024-01-25']);

      const upcoming2 = service.getUpcomingFreezeDays(2);
      expect(upcoming2).toEqual(['2024-01-16']);
    });

    it('returns empty array when no freeze days exist', () => {
      mockExistsSync.mockReturnValue(false);

      const service = new ReadingGoalsService(
        createMockConfig() as any,
        mockScanner as any
      );

      const upcoming = service.getUpcomingFreezeDays();
      expect(upcoming).toEqual([]);
    });

    it('includes today as upcoming freeze day', () => {
      const existingData = createGoalsFileData({
        goals: { streakFreezeDays: ['2024-01-15', '2024-01-20'] },
      });

      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(existingData));

      const service = new ReadingGoalsService(
        createMockConfig() as any,
        mockScanner as any
      );

      const upcoming = service.getUpcomingFreezeDays(7);
      expect(upcoming).toContain('2024-01-15');
    });
  });

  describe('updateGoals - weeklyGoalMinutes validation', () => {
    it('clamps weeklyGoalMinutes to minimum of 1 minute', () => {
      mockExistsSync.mockReturnValue(false);

      const service = new ReadingGoalsService(
        createMockConfig() as any,
        mockScanner as any
      );

      const updated = service.updateGoals({ weeklyGoalMinutes: 0 });
      expect(updated.weeklyGoalMinutes).toBe(1);
    });

    it('rounds fractional weeklyGoalMinutes', () => {
      mockExistsSync.mockReturnValue(false);

      const service = new ReadingGoalsService(
        createMockConfig() as any,
        mockScanner as any
      );

      const updated = service.updateGoals({ weeklyGoalMinutes: 120.6 });
      expect(updated.weeklyGoalMinutes).toBe(121);
    });

    it('rounds fractional gracePeriodDays', () => {
      mockExistsSync.mockReturnValue(false);

      const service = new ReadingGoalsService(
        createMockConfig() as any,
        mockScanner as any
      );

      const updated = service.updateGoals({ gracePeriodDays: 2.7 });
      expect(updated.gracePeriodDays).toBe(3);
    });
  });

  describe('getMonthSummary - dateFinished edge cases', () => {
    it('handles dateFinished without time component', () => {
      mockExistsSync.mockReturnValue(false);
      mockScanner.getAll.mockReturnValue([
        {
          id: 'book1',
          dateFinished: '2024-01-20', // No 'T' - split('T')[0] still yields '2024-01-20'
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

      const summary = service.getMonthSummary('2024-01');
      expect(summary.booksCompleted).toBe(1);
    });

    it('does not count books with null dateFinished', () => {
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

      const summary = service.getMonthSummary('2024-01');
      expect(summary.booksCompleted).toBe(0);
    });

    it('does not count books with undefined dateFinished', () => {
      mockExistsSync.mockReturnValue(false);
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

      const summary = service.getMonthSummary('2024-01');
      expect(summary.booksCompleted).toBe(0);
    });
  });

  describe('recalculateStreak - long streak across many days', () => {
    it('correctly counts a long streak of consecutive days', () => {
      mockExistsSync.mockReturnValue(false);

      // Build 30 consecutive days of reading history ending today (Jan 15)
      const history: { date: string; duration_ms: number; sessions: number; pages: number }[] = [];
      for (let i = 29; i >= 0; i--) {
        const date = new Date('2024-01-15T12:00:00Z');
        date.setDate(date.getDate() - i);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        history.push({
          date: `${year}-${month}-${day}`,
          duration_ms: 1800000,
          sessions: 1,
          pages: 10,
        });
      }

      mockScanner.getAll.mockReturnValue([
        {
          frontmatter: {
            reading_history: history,
          },
        },
      ]);

      const service = new ReadingGoalsService(
        createMockConfig() as any,
        mockScanner as any
      );

      const streak = service.recalculateStreak();
      expect(streak.currentStreak).toBe(30);
    });
  });

  describe('getWeekSummary - defaults without weeklyGoalMinutes', () => {
    it('defaults weekly goal to dailyGoalMinutes * 7 when weeklyGoalMinutes is null', () => {
      vi.setSystemTime(new Date('2024-01-21T12:00:00Z')); // Sunday

      const goalsData = createGoalsFileData({
        goals: {
          dailyGoalMinutes: 30,
          weeklyGoalMinutes: null,
        },
      });

      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(goalsData));

      // Provide exactly 210 min (30 * 7) of reading this week
      mockScanner.getAll.mockReturnValue([
        {
          id: 'book1',
          frontmatter: {
            reading_history: [
              { date: '2024-01-15', duration_ms: 1800000, sessions: 1, pages: 10 }, // 30min
              { date: '2024-01-16', duration_ms: 1800000, sessions: 1, pages: 10 },
              { date: '2024-01-17', duration_ms: 1800000, sessions: 1, pages: 10 },
              { date: '2024-01-18', duration_ms: 1800000, sessions: 1, pages: 10 },
              { date: '2024-01-19', duration_ms: 1800000, sessions: 1, pages: 10 },
              { date: '2024-01-20', duration_ms: 1800000, sessions: 1, pages: 10 },
              { date: '2024-01-21', duration_ms: 1800000, sessions: 1, pages: 10 },
            ],
          },
        },
      ]);

      const service = new ReadingGoalsService(
        createMockConfig() as any,
        mockScanner as any
      );

      const summary = service.getWeekSummary();
      // 210min (7 * 30) >= default weekly goal of 210min => met
      expect(summary.weeklyGoalMet).toBe(true);
      expect(summary.totalDurationMs).toBe(12600000); // 210min in ms
    });
  });
});
