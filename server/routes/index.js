import { Hono } from 'hono';
import { auth } from '../auth/betterAuth.js';
import { adminRoutes } from './admin.routes.js';
import { catalogRoutes } from './catalog.routes.js';
import { dashboardRoutes } from './dashboard.routes.js';
import { healthRoutes } from './health.routes.js';
import { meRoutes } from './me.routes.js';
import { paymentsRoutes } from './payments.routes.js';
import { quizRoutes } from './quiz.routes.js';
import { registrationRoutes } from './registration.routes.js';
import { usersRoutes } from './users.routes.js';

export function createApiRoutes() {
  const api = new Hono();

  api.route('/', healthRoutes);
  api.route('/', adminRoutes);
  api.route('/', catalogRoutes);
  api.route('/', dashboardRoutes);
  api.route('/', meRoutes);
  api.route('/', paymentsRoutes);
  api.route('/', quizRoutes);
  api.route('/', registrationRoutes);
  api.route('/', usersRoutes);
  api.on(['GET', 'POST'], '/auth/*', (c) => auth.handler(c.req.raw));
  api.use('/*', async (c) =>
    c.json({ error: { code: 'NOT_FOUND', message: 'Not found.' } }, 404)
  );

  return api;
}
