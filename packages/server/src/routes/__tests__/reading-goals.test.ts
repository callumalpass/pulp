import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { readingGoalsRoutes } from '../reading-goals.js';
import type { ReadingGoalsService } from '../../services/reading-goals.js';
import type {
  ReadingGoals,
  ReadingStreak,
  DailyReadingSummary,
  WeeklyReadingSummary,
  StreakRiskInfo,
  MonthlyReadingSummary,
} from '@pulp/shared';

// Default mock data
const mockGoals: ReadingGoals = {
  dailyGoalMinutes: 30,
  weeklyGoalMinutes: null,
  gracePeriodDays: 1,
  streakFreezeDays: [],
};

const mockStreak: ReadingStreak = {
  currentStreak: 5,
  longestStreak: 12,
  lastReadDate: '2024-01-15',
  streakStartDate: '2024-01-10',
  graceDaysUsed: 0,
  freezeDaysUsed: 0,
};

const mockTodayProgress: DailyReadingSummary = {
  date: '2024-01-15',
  totalDurationMs: 1800000, // 30 minutes
  totalSessions: 2,
  booksRead: 1,
  goalMet: true,
};

const mockWeekHistory: DailyReadingSummary[] = [
  { date: '2024-01-15', totalDurationMs: 1800000, totalSessions: 2, booksRead: 1, goalMet: true },
  { date: '2024-01-14', totalDurationMs: 900000, totalSessions: 1, booksRead: 1, goalMet: false },
];

const mockWeekSummary: WeeklyReadingSummary = {
  weekStartDate: '2024-01-08',
  totalDurationMs: 5400000,
  totalSessions: 6,
  booksRead: 2,
  daysWithReading: 5,
  daysGoalMet: 3,
  weeklyGoalMet: false,
  averageDailyMs: 1080000,
};

const mockStreakRiskInfo: StreakRiskInfo = {
  isAtRisk: false,
  minutesRemaining: 0,
  hoursUntilMidnight: 8,
  graceDaysRemaining: 1,
  isFreezeDay: false,
  nextFreezeDay: null,
};

const mockMonthSummary: MonthlyReadingSummary = {
  month: '2024-01',
  totalDurationMs: 54000000,
  totalSessions: 30,
  booksRead: 3,
  daysWithReading: 15,
  daysGoalMet: 10,
  averageDailyMs: 3600000,
  booksCompleted: 1,
};

function createMockGoalsService(): ReadingGoalsService {
  return {
    getGoals: vi.fn().mockReturnValue(mockGoals),
    getStreak: vi.fn().mockReturnValue(mockStreak),
    getTodayProgress: vi.fn().mockReturnValue(mockTodayProgress),
    getWeekHistory: vi.fn().mockReturnValue(mockWeekHistory),
    getWeekSummary: vi.fn().mockReturnValue(mockWeekSummary),
    getStreakRiskInfo: vi.fn().mockReturnValue(mockStreakRiskInfo),
    getUpcomingFreezeDays: vi.fn().mockReturnValue([]),
    updateGoals: vi.fn().mockReturnValue(mockGoals),
    recalculateStreak: vi.fn().mockReturnValue(mockStreak),
    addFreezeDay: vi.fn().mockReturnValue(mockGoals),
    removeFreezeDay: vi.fn().mockReturnValue(mockGoals),
    getMonthSummary: vi.fn().mockReturnValue(mockMonthSummary),
  } as unknown as ReadingGoalsService;
}

describe('readingGoalsRoutes', () => {
  let app: FastifyInstance;
  let mockService: ReadingGoalsService;

  beforeEach(async () => {
    mockService = createMockGoalsService();
    app = Fastify();
    await app.register(readingGoalsRoutes, { goalsService: mockService });
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('GET /api/reading-goals', () => {
    it('returns the full reading goals response', async () => {
      vi.mocked(mockService.getGoals).mockReturnValue(mockGoals);
      vi.mocked(mockService.getStreak).mockReturnValue(mockStreak);
      vi.mocked(mockService.getTodayProgress).mockReturnValue(mockTodayProgress);
      vi.mocked(mockService.getWeekHistory).mockReturnValue(mockWeekHistory);
      vi.mocked(mockService.getWeekSummary).mockReturnValue(mockWeekSummary);
      vi.mocked(mockService.getStreakRiskInfo).mockReturnValue(mockStreakRiskInfo);
      vi.mocked(mockService.getUpcomingFreezeDays).mockReturnValue([]);

      const response = await app.inject({
        method: 'GET',
        url: '/api/reading-goals',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.goals).toEqual(mockGoals);
      expect(body.streak).toEqual(mockStreak);
      expect(body.todayProgress).toEqual(mockTodayProgress);
      expect(body.weekHistory).toEqual(mockWeekHistory);
      expect(body.weekSummary).toEqual(mockWeekSummary);
      expect(body.streakAtRisk).toEqual(mockStreakRiskInfo);
      expect(body.upcomingFreezeDays).toEqual([]);
    });

    it('calls getUpcomingFreezeDays with 14 days', async () => {
      vi.mocked(mockService.getGoals).mockReturnValue(mockGoals);
      vi.mocked(mockService.getStreak).mockReturnValue(mockStreak);
      vi.mocked(mockService.getTodayProgress).mockReturnValue(mockTodayProgress);
      vi.mocked(mockService.getWeekHistory).mockReturnValue(mockWeekHistory);
      vi.mocked(mockService.getWeekSummary).mockReturnValue(mockWeekSummary);
      vi.mocked(mockService.getStreakRiskInfo).mockReturnValue(null);
      vi.mocked(mockService.getUpcomingFreezeDays).mockReturnValue(['2024-01-20']);

      const response = await app.inject({
        method: 'GET',
        url: '/api/reading-goals',
      });

      expect(mockService.getUpcomingFreezeDays).toHaveBeenCalledWith(14);
      const body = response.json();
      expect(body.upcomingFreezeDays).toEqual(['2024-01-20']);
    });

    it('returns null for streakAtRisk when no risk', async () => {
      vi.mocked(mockService.getGoals).mockReturnValue(mockGoals);
      vi.mocked(mockService.getStreak).mockReturnValue(mockStreak);
      vi.mocked(mockService.getTodayProgress).mockReturnValue(mockTodayProgress);
      vi.mocked(mockService.getWeekHistory).mockReturnValue([]);
      vi.mocked(mockService.getWeekSummary).mockReturnValue(mockWeekSummary);
      vi.mocked(mockService.getStreakRiskInfo).mockReturnValue(null);
      vi.mocked(mockService.getUpcomingFreezeDays).mockReturnValue([]);

      const response = await app.inject({
        method: 'GET',
        url: '/api/reading-goals',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.streakAtRisk).toBeNull();
    });
  });

  describe('PATCH /api/reading-goals', () => {
    it('updates daily goal minutes', async () => {
      const updatedGoals = { ...mockGoals, dailyGoalMinutes: 45 };
      vi.mocked(mockService.updateGoals).mockReturnValue(updatedGoals);
      vi.mocked(mockService.recalculateStreak).mockReturnValue(mockStreak);

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/reading-goals',
        payload: { dailyGoalMinutes: 45 },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.goals.dailyGoalMinutes).toBe(45);
      expect(mockService.updateGoals).toHaveBeenCalledWith({ dailyGoalMinutes: 45 });
    });

    it('recalculates streak after updating goals', async () => {
      vi.mocked(mockService.updateGoals).mockReturnValue(mockGoals);
      vi.mocked(mockService.recalculateStreak).mockReturnValue(mockStreak);

      await app.inject({
        method: 'PATCH',
        url: '/api/reading-goals',
        payload: { dailyGoalMinutes: 60 },
      });

      expect(mockService.recalculateStreak).toHaveBeenCalled();
    });

    it('returns updated streak in response', async () => {
      const newStreak = { ...mockStreak, currentStreak: 10 };
      vi.mocked(mockService.updateGoals).mockReturnValue(mockGoals);
      vi.mocked(mockService.recalculateStreak).mockReturnValue(newStreak);

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/reading-goals',
        payload: { gracePeriodDays: 2 },
      });

      const body = response.json();
      expect(body.streak.currentStreak).toBe(10);
    });

    it('updates weekly goal minutes', async () => {
      vi.mocked(mockService.updateGoals).mockReturnValue({ ...mockGoals, weeklyGoalMinutes: 200 });
      vi.mocked(mockService.recalculateStreak).mockReturnValue(mockStreak);

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/reading-goals',
        payload: { weeklyGoalMinutes: 200 },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.goals.weeklyGoalMinutes).toBe(200);
    });

    it('allows setting weekly goal to null', async () => {
      vi.mocked(mockService.updateGoals).mockReturnValue({ ...mockGoals, weeklyGoalMinutes: null });
      vi.mocked(mockService.recalculateStreak).mockReturnValue(mockStreak);

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/reading-goals',
        payload: { weeklyGoalMinutes: null },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.goals.weeklyGoalMinutes).toBeNull();
    });

    it('updates streak freeze days', async () => {
      const freezeDays = ['2024-01-20', '2024-01-25'];
      vi.mocked(mockService.updateGoals).mockReturnValue({ ...mockGoals, streakFreezeDays: freezeDays });
      vi.mocked(mockService.recalculateStreak).mockReturnValue(mockStreak);

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/reading-goals',
        payload: { streakFreezeDays: freezeDays },
      });

      expect(response.statusCode).toBe(200);
      expect(mockService.updateGoals).toHaveBeenCalledWith({ streakFreezeDays: freezeDays });
    });

    describe('validation', () => {
      it('rejects dailyGoalMinutes below minimum', async () => {
        const response = await app.inject({
          method: 'PATCH',
          url: '/api/reading-goals',
          payload: { dailyGoalMinutes: 0 },
        });

        expect(response.statusCode).toBe(400);
      });

      it('rejects dailyGoalMinutes above maximum', async () => {
        const response = await app.inject({
          method: 'PATCH',
          url: '/api/reading-goals',
          payload: { dailyGoalMinutes: 1441 },
        });

        expect(response.statusCode).toBe(400);
      });

      it('accepts dailyGoalMinutes at minimum boundary', async () => {
        vi.mocked(mockService.updateGoals).mockReturnValue({ ...mockGoals, dailyGoalMinutes: 1 });
        vi.mocked(mockService.recalculateStreak).mockReturnValue(mockStreak);

        const response = await app.inject({
          method: 'PATCH',
          url: '/api/reading-goals',
          payload: { dailyGoalMinutes: 1 },
        });

        expect(response.statusCode).toBe(200);
      });

      it('accepts dailyGoalMinutes at maximum boundary', async () => {
        vi.mocked(mockService.updateGoals).mockReturnValue({ ...mockGoals, dailyGoalMinutes: 1440 });
        vi.mocked(mockService.recalculateStreak).mockReturnValue(mockStreak);

        const response = await app.inject({
          method: 'PATCH',
          url: '/api/reading-goals',
          payload: { dailyGoalMinutes: 1440 },
        });

        expect(response.statusCode).toBe(200);
      });

      it('rejects gracePeriodDays below minimum', async () => {
        const response = await app.inject({
          method: 'PATCH',
          url: '/api/reading-goals',
          payload: { gracePeriodDays: -1 },
        });

        expect(response.statusCode).toBe(400);
      });

      it('rejects gracePeriodDays above maximum', async () => {
        const response = await app.inject({
          method: 'PATCH',
          url: '/api/reading-goals',
          payload: { gracePeriodDays: 8 },
        });

        expect(response.statusCode).toBe(400);
      });

      it('rejects invalid freeze day format', async () => {
        const response = await app.inject({
          method: 'PATCH',
          url: '/api/reading-goals',
          payload: { streakFreezeDays: ['not-a-date'] },
        });

        expect(response.statusCode).toBe(400);
      });

      it('accepts valid freeze day format', async () => {
        vi.mocked(mockService.updateGoals).mockReturnValue({ ...mockGoals, streakFreezeDays: ['2024-01-20'] });
        vi.mocked(mockService.recalculateStreak).mockReturnValue(mockStreak);

        const response = await app.inject({
          method: 'PATCH',
          url: '/api/reading-goals',
          payload: { streakFreezeDays: ['2024-01-20'] },
        });

        expect(response.statusCode).toBe(200);
      });
    });
  });

  describe('POST /api/reading-goals/freeze-day', () => {
    it('adds a freeze day', async () => {
      const updatedGoals = { ...mockGoals, streakFreezeDays: ['2024-01-20'] };
      vi.mocked(mockService.addFreezeDay).mockReturnValue(updatedGoals);

      const response = await app.inject({
        method: 'POST',
        url: '/api/reading-goals/freeze-day',
        payload: { date: '2024-01-20' },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.goals.streakFreezeDays).toEqual(['2024-01-20']);
      expect(mockService.addFreezeDay).toHaveBeenCalledWith('2024-01-20');
    });

    it('rejects missing date', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/reading-goals/freeze-day',
        payload: {},
      });

      expect(response.statusCode).toBe(400);
    });

    it('rejects invalid date format', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/reading-goals/freeze-day',
        payload: { date: '01-20-2024' },
      });

      expect(response.statusCode).toBe(400);
    });

    it('rejects date with wrong separator', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/reading-goals/freeze-day',
        payload: { date: '2024/01/20' },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('DELETE /api/reading-goals/freeze-day/:date', () => {
    it('removes a freeze day', async () => {
      const updatedGoals = { ...mockGoals, streakFreezeDays: [] };
      vi.mocked(mockService.removeFreezeDay).mockReturnValue(updatedGoals);

      const response = await app.inject({
        method: 'DELETE',
        url: '/api/reading-goals/freeze-day/2024-01-20',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(mockService.removeFreezeDay).toHaveBeenCalledWith('2024-01-20');
    });

    it('rejects invalid date format in params', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: '/api/reading-goals/freeze-day/bad-date',
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('POST /api/reading-goals/recalculate', () => {
    it('recalculates and returns the streak', async () => {
      vi.mocked(mockService.recalculateStreak).mockReturnValue(mockStreak);

      const response = await app.inject({
        method: 'POST',
        url: '/api/reading-goals/recalculate',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.streak).toEqual(mockStreak);
      expect(mockService.recalculateStreak).toHaveBeenCalled();
    });
  });

  describe('GET /api/reading-goals/monthly', () => {
    it('returns monthly summary for current month by default', async () => {
      vi.mocked(mockService.getMonthSummary).mockReturnValue(mockMonthSummary);

      const response = await app.inject({
        method: 'GET',
        url: '/api/reading-goals/monthly',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.month).toBe('2024-01');
      expect(body.totalDurationMs).toBe(54000000);
      expect(body.booksCompleted).toBe(1);
      expect(mockService.getMonthSummary).toHaveBeenCalledWith(undefined);
    });

    it('accepts specific month parameter', async () => {
      vi.mocked(mockService.getMonthSummary).mockReturnValue({ ...mockMonthSummary, month: '2023-12' });

      const response = await app.inject({
        method: 'GET',
        url: '/api/reading-goals/monthly?month=2023-12',
      });

      expect(response.statusCode).toBe(200);
      expect(mockService.getMonthSummary).toHaveBeenCalledWith('2023-12');
    });

    it('rejects invalid month format', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/reading-goals/monthly?month=January',
      });

      expect(response.statusCode).toBe(400);
    });

    it('rejects month with day included', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/reading-goals/monthly?month=2024-01-15',
      });

      expect(response.statusCode).toBe(400);
    });
  });
});
