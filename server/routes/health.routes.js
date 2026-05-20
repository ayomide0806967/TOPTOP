import { Hono } from 'hono';
import { pool } from '../db/pool.js';
import { ensureRedisConnected, redis } from '../redis/client.js';

export const healthRoutes = new Hono();

healthRoutes.get('/health', async (c) => {
  const checks = {
    app: 'ok',
    postgres: 'unknown',
    redis: redis ? 'unknown' : 'disabled',
  };

  try {
    await pool.query('select 1');
    checks.postgres = 'ok';
  } catch (error) {
    checks.postgres = 'error';
    checks.postgresError = error.message;
  }

  if (redis) {
    try {
      await ensureRedisConnected();
      await redis.ping();
      checks.redis = 'ok';
    } catch (error) {
      checks.redis = 'error';
      checks.redisError = error.message;
    }
  }

  const healthy =
    checks.postgres === 'ok' &&
    (checks.redis === 'ok' || checks.redis === 'disabled');

  return c.json(checks, healthy ? 200 : 503);
});
