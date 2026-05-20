import { betterAuth } from 'better-auth';
import { env, isProduction, splitEnvList } from '../config/env.js';
import { pool } from '../db/pool.js';
import { createSecondaryStorage } from '../redis/client.js';

const trustedOrigins = splitEnvList(
  env.BETTER_AUTH_TRUSTED_ORIGINS || env.CORS_ORIGINS
);

export const auth = betterAuth({
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  database: pool,
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
    autoSignIn: false,
  },
  secondaryStorage: createSecondaryStorage(env.BETTER_AUTH_REDIS_PREFIX),
  trustedOrigins,
  session: {
    storeSessionInDatabase: env.BETTER_AUTH_STORE_SESSIONS_IN_POSTGRES,
  },
  advanced: {
    database: {
      generateId: 'uuid',
    },
    useSecureCookies: env.BETTER_AUTH_SECURE_COOKIES ?? isProduction,
  },
});
