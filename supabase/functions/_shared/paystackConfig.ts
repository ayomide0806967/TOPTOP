const DEFAULT_PUBLIC_KEY = 'pk_test_943cfcdf1016a38545eeeefed3a0735df0e2caf4';
const DEFAULT_SECRET_KEY = 'sk_test_951fc9e51b016751378bf3a78bce024f32676b5c';
const DEFAULT_FORWARD_URL =
  'https://processpaystackwebhook-2juaft5ieq-uc.a.run.app';

const MODE_FLAG = (
  Deno.env.get('PAYSTACK_MODE') ??
  Deno.env.get('PAYSTACK_ENV') ??
  Deno.env.get('PAYSTACK_PROFILE') ??
  ''
).toLowerCase();

const DEMO_MODE_ALIASES = new Set([
  '',
  'demo',
  'test',
  'sandbox',
  'development',
]);

function isDemoMode(): boolean {
  return DEMO_MODE_ALIASES.has(MODE_FLAG);
}

function coalesce(...values: Array<string | null | undefined>) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}

export function getPaystackPublicKey(): string {
  if (isDemoMode()) {
    return (
      coalesce(
        Deno.env.get('PAYSTACK_TEST_PUBLIC_KEY'),
        DEFAULT_PUBLIC_KEY,
        Deno.env.get('PAYSTACK_PUBLIC_KEY')
      ) ?? DEFAULT_PUBLIC_KEY
    );
  }

  return (
    coalesce(
      Deno.env.get('PAYSTACK_PUBLIC_KEY'),
      Deno.env.get('PAYSTACK_LIVE_PUBLIC_KEY'),
      DEFAULT_PUBLIC_KEY
    ) ?? DEFAULT_PUBLIC_KEY
  );
}

export function getPaystackSecretKey(): string {
  const testSecret = coalesce(
    Deno.env.get('PAYSTACK_TEST_SECRET_KEY'),
    DEFAULT_SECRET_KEY
  );

  if (isDemoMode()) {
    return testSecret ?? DEFAULT_SECRET_KEY;
  }

  return (
    coalesce(
      Deno.env.get('PAYSTACK_SECRET_KEY'),
      Deno.env.get('PAYSTACK_LIVE_SECRET_KEY'),
      testSecret,
      DEFAULT_SECRET_KEY
    ) ?? DEFAULT_SECRET_KEY
  );
}

export function getPaystackForwardUrl(): string | null {
  return coalesce(
    Deno.env.get('PAYSTACK_FORWARD_URL'),
    Deno.env.get('PAYSTACK_WEBHOOK_FORWARD_URL'),
    DEFAULT_FORWARD_URL
  );
}
