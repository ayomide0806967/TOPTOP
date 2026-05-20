import { env } from '../../config/env.js';
import { HttpError } from '../../utils/httpError.js';

const DEMO_MODES = new Set(['demo', 'test', 'sandbox', 'development']);

function coalesce(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

export function getPaystackPublicKey() {
  if (DEMO_MODES.has(env.PAYSTACK_MODE)) {
    return coalesce(env.PAYSTACK_TEST_PUBLIC_KEY, env.PAYSTACK_PUBLIC_KEY);
  }
  return coalesce(env.PAYSTACK_PUBLIC_KEY, env.PAYSTACK_LIVE_PUBLIC_KEY);
}

export function getPaystackSecretKey() {
  if (DEMO_MODES.has(env.PAYSTACK_MODE)) {
    return coalesce(env.PAYSTACK_TEST_SECRET_KEY, env.PAYSTACK_SECRET_KEY);
  }
  return coalesce(env.PAYSTACK_SECRET_KEY, env.PAYSTACK_LIVE_SECRET_KEY);
}

export function requirePaystackPublicKey() {
  const key = getPaystackPublicKey();
  if (!key) {
    throw new HttpError(
      500,
      'PAYSTACK_CONFIG_MISSING',
      'Paystack public key is not configured.'
    );
  }
  return key;
}

export function requirePaystackSecretKey() {
  const key = getPaystackSecretKey();
  if (!key) {
    throw new HttpError(
      500,
      'PAYSTACK_CONFIG_MISSING',
      'Paystack secret key is not configured.'
    );
  }
  return key;
}
