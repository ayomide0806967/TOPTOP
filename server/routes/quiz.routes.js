import { Hono } from 'hono';
import { getSessionContext, requireSession } from '../auth/requireSession.js';
import { badRequest, forbidden } from '../utils/httpError.js';
import {
  getDailyQuizForUser,
  getDailyQuizQuestionsForUser,
  recordDailyQuizAnswer,
  resetTodaysDailyQuiz,
  startDailyQuizForUser,
  submitDailyQuizForUser,
} from '../modules/quiz/dailyQuiz.service.js';

export const quizRoutes = new Hono();

quizRoutes.post('/quiz/daily/reset', requireSession, async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const authContext = c.get('auth') || (await getSessionContext(c));
  const requestedUserId = body.userId || authContext.user.id;
  const isAdmin = authContext.profile?.role === 'admin';

  if (!isAdmin && requestedUserId !== authContext.user.id) {
    throw forbidden('You can only reset your own daily quiz.');
  }

  return c.json(await resetTodaysDailyQuiz(requestedUserId));
});

quizRoutes.get('/quiz/daily/today', requireSession, async (c) => {
  const authContext = c.get('auth') || (await getSessionContext(c));
  return c.json({ quiz: await getDailyQuizForUser(authContext.user.id) });
});

quizRoutes.get('/quiz/daily/:quizId', requireSession, async (c) => {
  const authContext = c.get('auth') || (await getSessionContext(c));
  return c.json({
    quiz: await getDailyQuizForUser(authContext.user.id, c.req.param('quizId')),
  });
});

quizRoutes.get('/quiz/daily/:quizId/questions', requireSession, async (c) => {
  const authContext = c.get('auth') || (await getSessionContext(c));
  return c.json(
    await getDailyQuizQuestionsForUser(
      authContext.user.id,
      c.req.param('quizId')
    )
  );
});

quizRoutes.post('/quiz/daily/:quizId/start', requireSession, async (c) => {
  const authContext = c.get('auth') || (await getSessionContext(c));
  return c.json({
    quiz: await startDailyQuizForUser(
      authContext.user.id,
      c.req.param('quizId')
    ),
  });
});

quizRoutes.patch(
  '/quiz/daily/questions/:entryId',
  requireSession,
  async (c) => {
    const authContext = c.get('auth') || (await getSessionContext(c));
    const body = await c.req.json().catch(() => ({}));
    if (!body.optionId) throw badRequest('Option ID is required.');
    return c.json({
      answer: await recordDailyQuizAnswer(
        authContext.user.id,
        c.req.param('entryId'),
        body.optionId
      ),
    });
  }
);

quizRoutes.post('/quiz/daily/:quizId/submit', requireSession, async (c) => {
  const authContext = c.get('auth') || (await getSessionContext(c));
  const body = await c.req.json().catch(() => ({}));
  return c.json({
    quiz: await submitDailyQuizForUser(
      authContext.user.id,
      c.req.param('quizId'),
      body
    ),
  });
});
