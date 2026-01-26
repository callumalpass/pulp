import type { FastifyPluginAsync } from 'fastify';
import type { ReadingGoalsUpdate, ReadingGoalsResponse } from '@pulp/shared';
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

  // POST /api/reading-goals/recalculate - Force recalculate streak from history
  fastify.post('/api/reading-goals/recalculate', async () => {
    const streak = goalsService.recalculateStreak();

    return {
      success: true,
      streak,
    };
  });
};
