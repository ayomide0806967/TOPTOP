import { Hono } from 'hono';
import { requireSession } from '../auth/requireSession.js';
import { badRequest } from '../utils/httpError.js';
import {
  generateDailyQuizForUser,
  getActiveAnnouncement,
  getQuizHistory,
  getTodaysQuiz,
  getUserScheduleHealth,
  getUserSubscriptions,
  setDefaultSubscriptionForUser,
} from '../modules/dashboard/dashboard.service.js';

export const dashboardRoutes = new Hono();

dashboardRoutes.use('/*', requireSession);

dashboardRoutes.get('/dashboard/announcement', async (c) => {
  return c.json({ announcement: await getActiveAnnouncement() });
});

dashboardRoutes.get('/dashboard/schedule-health', async (c) => {
  const authContext = c.get('auth');
  return c.json({ health: await getUserScheduleHealth(authContext.user) });
});

dashboardRoutes.get('/dashboard/subscriptions', async (c) => {
  const authContext = c.get('auth');
  return c.json({
    subscriptions: await getUserSubscriptions(authContext.user.id),
  });
});

dashboardRoutes.post('/dashboard/default-subscription', async (c) => {
  const authContext = c.get('auth');
  const body = await c.req.json().catch(() => ({}));
  if (!body.subscriptionId) {
    throw badRequest('Subscription ID is required.');
  }
  return c.json(
    await setDefaultSubscriptionForUser(authContext.user, body.subscriptionId)
  );
});

dashboardRoutes.get('/dashboard/daily-quiz/today', async (c) => {
  const authContext = c.get('auth');
  return c.json({ quiz: await getTodaysQuiz(authContext.user.id) });
});

dashboardRoutes.post('/dashboard/daily-quiz/generate', async (c) => {
  const authContext = c.get('auth');
  const body = await c.req.json().catch(() => ({}));
  return c.json(
    await generateDailyQuizForUser(
      authContext.user,
      body.subscriptionId || null
    )
  );
});

dashboardRoutes.get('/dashboard/daily-quiz/history', async (c) => {
  const authContext = c.get('auth');
  const limit = Number(c.req.query('limit') || 30);
  return c.json({
    history: await getQuizHistory(
      authContext.user.id,
      Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 100) : 30
    ),
  });
});
