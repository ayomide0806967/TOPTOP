import Redis from 'ioredis';
import { env } from '../config/env.js';

export const redis = env.REDIS_URL
  ? new Redis(env.REDIS_URL, {
      lazyConnect: true,
      maxRetriesPerRequest: 2,
      enableReadyCheck: true,
    })
  : null;

export async function ensureRedisConnected() {
  if (!redis) return null;
  if (redis.status === 'ready') return redis;
  await redis.connect();
  return redis;
}

export function createSecondaryStorage(prefix = 'better-auth') {
  if (!redis) return undefined;

  const keyFor = (key) => `${prefix}:${key}`;

  return {
    get: async (key) => {
      await ensureRedisConnected();
      return redis.get(keyFor(key));
    },
    set: async (key, value, ttl) => {
      await ensureRedisConnected();
      if (ttl && Number(ttl) > 0) {
        await redis.set(keyFor(key), value, 'EX', Number(ttl));
        return;
      }
      await redis.set(keyFor(key), value);
    },
    delete: async (key) => {
      await ensureRedisConnected();
      await redis.del(keyFor(key));
    },
  };
}
