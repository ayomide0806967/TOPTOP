import {
  createClient,
  SupabaseClient,
} from 'https://esm.sh/@supabase/supabase-js@2.45.1';

const SUPABASE_URL =
  Deno.env.get('APP_SUPABASE_URL') ?? Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY =
  Deno.env.get('APP_SUPABASE_ANON_KEY') ??
  Deno.env.get('SUPABASE_ANON_KEY') ??
  '';
const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get('APP_SUPABASE_SERVICE_ROLE_KEY') ??
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ??
  '';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    'Supabase environment variables missing for Paystack integration. Ensure APP_SUPABASE_URL, APP_SUPABASE_ANON_KEY, and APP_SUPABASE_SERVICE_ROLE_KEY are set.'
  );
}

type PaystackMetadata = {
  user_id?: string;
  plan_id?: string;
  [key: string]: unknown;
};

interface SubscriptionResult {
  subscriptionId: string;
  transactionId: string;
}

let serviceClient: SupabaseClient | null = null;

export function getServiceClient(): SupabaseClient {
  if (serviceClient) return serviceClient;
  serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
    },
  });
  return serviceClient;
}

export function getUserClient(authHeader: string | null): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: false,
    },
    global: {
      headers: authHeader ? { Authorization: authHeader } : {},
    },
  });
}



function computeExpiryDate(
  durationDays: number | null | undefined,
  paidAt: string | null
): string | null {
  if (!durationDays || durationDays <= 0) {
    return null;
  }
  const base = paidAt ? new Date(paidAt) : new Date();
  if (Number.isNaN(base.getTime())) {
    return null;
  }
  base.setUTCDate(base.getUTCDate() + Number(durationDays));
  return base.toISOString();
}

export async function upsertPaymentAndSubscription(options: {
  userId: string;
  planId: string;
  reference: string;
  status: string;
  amountKobo: number;
  currency: string;
  paidAt?: string | null;
  metadata?: PaystackMetadata;
  rawResponse?: unknown;
}): Promise<SubscriptionResult> {
  const {
    userId,
    planId,
    reference,
    status,
    amountKobo,
    currency,
    paidAt = new Date().toISOString(),
    metadata = {},
    rawResponse = null,
  } = options;

  const admin = getServiceClient();

  const { data: plan, error: planError } = await admin
    .from('subscription_plans')
    .select('id, duration_days, price, currency')
    .eq('id', planId)
    .maybeSingle();
  if (planError || !plan) {
    throw planError ?? new Error('Subscription plan not found.');
  }

  const amount = Number((amountKobo ?? 0) / 100);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Invalid payment amount.');
  }

  if (plan.price && Math.abs(Number(plan.price) - amount) > 5) {
    console.warn('[Paystack] Amount mismatch', {
      expected: plan.price,
      received: amount,
      reference,
    });
  }

  const upsertPayload = {
    user_id: userId,
    plan_id: planId,
    provider: 'paystack',
    reference,
    status,
    amount,
    currency: currency || plan.currency || 'NGN',
    paid_at: paidAt,
    metadata,
    raw_response: rawResponse ?? null,
  };

  const { data: transactionRows, error: transactionError } = await admin
    .from('payment_transactions')
    .upsert(upsertPayload, { onConflict: 'provider,reference' })
    .select('id')
    .limit(1);

  if (transactionError) {
    throw transactionError;
  }

  const transactionId = transactionRows?.[0]?.id;
  if (!transactionId) {
    throw new Error('Failed to record payment transaction.');
  }

  const expiresAt = computeExpiryDate(plan.duration_days, paidAt);

  const subscriptionPayload = {
    status: 'active',
    started_at: paidAt,
    expires_at: expiresAt,
    price: amount,
    currency: currency || plan.currency || 'NGN',
  };

  const { data: existingSub, error: existingError } = await admin
    .from('user_subscriptions')
    .select('id')
    .eq('user_id', userId)
    .eq('plan_id', planId)
    .eq('status', 'active')
    .maybeSingle();

  if (existingError && existingError.code !== 'PGRST116') {
    throw existingError;
  }

  let subscriptionId: string | null = null;

  if (existingSub?.id) {
    const { error: updateError } = await admin
      .from('user_subscriptions')
      .update(subscriptionPayload)
      .eq('id', existingSub.id);
    if (updateError) {
      throw updateError;
    }
    subscriptionId = existingSub.id;
  } else {
    const insertPayload = {
      user_id: userId,
      plan_id: planId,
      ...subscriptionPayload,
    };
    const { data: inserted, error: insertError } = await admin
      .from('user_subscriptions')
      .insert(insertPayload)
      .select('id')
      .single();
    if (insertError) {
      throw insertError;
    }
    subscriptionId = inserted.id;
  }

  if (!subscriptionId) {
    throw new Error('Unable to resolve subscription identifier.');
  }

  return {
    subscriptionId,
    transactionId,
  };
}

export async function verifyPaystackSignature(
  body: string,
  signature: string | null
): Promise<boolean> {
  const secret = Deno.env.get('PAYSTACK_SECRET_KEY') ?? '';
  if (!secret || !signature) return false;
  try {
    const encoder = new TextEncoder();
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-512' },
      false,
      ['sign']
    );
    const raw = await crypto.subtle.sign(
      'HMAC',
      cryptoKey,
      encoder.encode(body)
    );
    const expected = Array.from(new Uint8Array(raw))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    return expected === signature;
  } catch (_error) {
    return false;
  }
}
