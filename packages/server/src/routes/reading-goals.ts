import type { FastifyPluginAsync } from 'fastify';
import type { ReadingGoalsUpdate, ReadingGoalsResponse, MonthlyReadingSummary } from '@pulp/shared';
import type { ReadingGoalsService } from '../services/reading-goals.js';

interface ReadingGoalsRouteOptions {
  goalsService: ReadingGoalsService;
}

export const readingGoalsRoutes: FastifyPluginAsync<ReadingGoalsRouteOptions> = async (fastify, opts) => {
  const { goalsService } = opts;

  // GET /api/reading-goals - Get current goals, streak, and today's progress
  fastify.get('/api/reading-goals', async () => {
    const response: ReadingGoalsResponse = {
      goals: goalsService.getGoals(),
      streak: goalsService.getStreak(),
      todayProgress: goalsService.getTodayProgress(),
      weekHistory: goalsService.getWeekHistory(),
      weekSummary: goalsService.getWeekSummary(),
      streakAtRisk: goalsService.getStreakRiskInfo(),
      upcomingFreezeDays: goalsService.getUpcomingFreezeDays(14),
    };

    return response;
  });

  // PATCH /api/reading-goals - Update reading goals
  fastify.patch<{
    Body: ReadingGoalsUpdate;
  }>('/api/reading-goals', {
    schema: {
      body: {
        type: 'object',
        properties: {
          dailyGoalMinutes: { type: 'number', minimum: 1, maximum: 1440 },
          weeklyGoalMinutes: { type: ['number', 'null'], minimum: 1 },
          gracePeriodDays: { type: 'number', minimum: 0, maximum: 7 },
          streakFreezeDays: { type: 'array', items: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' } },
        },
      },
    },
  }, async (request) => {
    const updatedGoals = goalsService.updateGoals(request.body);

    // Recalculate streak in case goal changes affect it
    const streak = goalsService.recalculateStreak();

    return {
      success: true,
      goals: updatedGoals,
      streak,
    };
  });

  // POST /api/reading-goals/freeze-day - Add a freeze day
  fastify.post<{
    Body: { date: string };
  }>('/api/reading-goals/freeze-day', {
    schema: {
      body: {
        type: 'object',
        required: ['date'],
        properties: {
          date: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
        },
      },
    },
  }, async (request) => {
    const updatedGoals = goalsService.addFreezeDay(request.body.date);

    return {
      success: true,
      goals: updatedGoals,
    };
  });

  // DELETE /api/reading-goals/freeze-day/:date - Remove a freeze day
  fastify.delete<{
    Params: { date: string };
  }>('/api/reading-goals/freeze-day/:date', {
    schema: {
      params: {
        type: 'object',
        required: ['date'],
        properties: {
          date: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
        },
      },
    },
  }, async (request) => {
    const updatedGoals = goalsService.removeFreezeDay(request.params.date);

    return {
      success: true,
      goals: updatedGoals,
    };
  });

  // POST /api/reading-goals/recalculate - Force recalculate streak from history
  fastify.post('/api/reading-goals/recalculate', async () => {
    const streak = goalsService.recalculateStreak();

    return {
      success: true,
      streak,
    };
  });

  // GET /api/reading-goals/monthly - Get monthly reading statistics
  fastify.get<{
    Querystring: { month?: string };
  }>('/api/reading-goals/monthly', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          month: { type: 'string', pattern: '^\\d{4}-\\d{2}$' },
        },
      },
    },
  }, async (request): Promise<MonthlyReadingSummary> => {
    return goalsService.getMonthSummary(request.query.month);
  });
};
