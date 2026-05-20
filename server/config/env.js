import 'dotenv/config';
import { z } from 'zod';

const booleanFromEnv = z
  .enum(['true', 'false'])
  .optional()
  .transform((value) => value === 'true');

const envSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    PORT: z.coerce.number().int().positive().default(3000),
    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
    REDIS_URL: z.string().url().optional(),
    PG_POOL_MAX: z.coerce.number().int().positive().default(10),
    PG_IDLE_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),
    PG_CONNECT_TIMEOUT_MS: z.coerce.number().int().positive().default(10000),
    BETTER_AUTH_URL: z.string().url().optional(),
    BETTER_AUTH_SECRET: z.string().min(32).optional(),
    BETTER_AUTH_TRUSTED_ORIGINS: z.string().optional(),
    CORS_ORIGINS: z.string().optional(),
    BETTER_AUTH_REDIS_PREFIX: z.string().default('cbt-fast:auth'),
    BETTER_AUTH_STORE_SESSIONS_IN_POSTGRES: booleanFromEnv.default(false),
    BETTER_AUTH_SECURE_COOKIES: booleanFromEnv,
    PAYSTACK_PUBLIC_KEY: z.string().optional(),
    PAYSTACK_SECRET_KEY: z.string().optional(),
    PAYSTACK_TEST_PUBLIC_KEY: z.string().optional(),
    PAYSTACK_TEST_SECRET_KEY: z.string().optional(),
    PAYSTACK_LIVE_PUBLIC_KEY: z.string().optional(),
    PAYSTACK_LIVE_SECRET_KEY: z.string().optional(),
    PAYSTACK_MODE: z
      .enum(['demo', 'test', 'sandbox', 'development', 'live', 'production'])
      .default('test'),
  })
  .superRefine((value, ctx) => {
    if (value.NODE_ENV !== 'production') return;

    if (!value.BETTER_AUTH_URL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['BETTER_AUTH_URL'],
        message: 'BETTER_AUTH_URL is required in production',
      });
    }

    if (!value.BETTER_AUTH_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['BETTER_AUTH_SECRET'],
        message: 'BETTER_AUTH_SECRET is required in production',
      });
    }
  });

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
    .join('; ');
  throw new Error(`Invalid server environment: ${issues}`);
}

export const env = parsed.data;
export const isProduction = env.NODE_ENV === 'production';

export function splitEnvList(value) {
  return String(value || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}
