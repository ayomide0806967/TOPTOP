import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { env } from './config/env.js';
import { createApiRoutes } from './routes/index.js';
import { logger } from './utils/logger.js';
import { toErrorResponse } from './utils/httpError.js';

const app = new Hono();

app.onError((error, c) => {
  const { status, body } = toErrorResponse(error);
  if (status >= 500) {
    logger.error('Unhandled request error', {
      path: c.req.path,
      method: c.req.method,
      error: error?.message,
      stack: error?.stack,
    });
  }
  return c.json(body, status);
});

app.route('/api', createApiRoutes());
app.use('/*', serveStatic({ root: './' }));
app.get('*', serveStatic({ path: './index.html' }));

serve(
  {
    fetch: app.fetch,
    port: env.PORT,
  },
  (info) => {
    logger.info('CBT Fast server listening', {
      url: `http://localhost:${info.port}`,
    });
  }
);
