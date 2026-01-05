import {
  createClient,
  SupabaseClient,
} from 'https://esm.sh/@supabase/supabase-js@2.45.1';
import { getPaystackSecretKey } from './paystackConfig.ts';

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
  startsAt: string | null
): string | null {
  if (!durationDays || durationDays <= 0) {
    return null;
  }
  const base = startsAt ? new Date(startsAt) : new Date();
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

  const { data: existingTransaction, error: existingTransactionError } =
    await admin
      .from('payment_transactions')
      .select('id, amount, currency, user_id, plan_id, status')
      .eq('provider', 'paystack')
      .eq('reference', reference)
      .maybeSingle();

  if (
    existingTransactionError &&
    existingTransactionError.code !== 'PGRST116'
  ) {
    throw existingTransactionError;
  }

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

  if (status.toLowerCase() !== 'success') {
    throw new Error(`Payment status is not successful (received: ${status}).`);
  }

  const planPrice = plan.price != null ? Number(plan.price) : null;
  const requestedQuantity = Number(metadata?.quantity ?? 1);
  if (!Number.isFinite(requestedQuantity) || requestedQuantity !== 1) {
    throw new Error('Invalid purchase quantity.');
  }

  if (planPrice != null) {
    const expectedAmountKobo = Math.round(planPrice * 100 * requestedQuantity);
    if (expectedAmountKobo !== amountKobo) {
      const existingAmount = existingTransaction?.amount;
      const existingAmountNumber =
        existingAmount == null ? null : Number(existingAmount);
      const existingExpectedKobo =
        existingAmountNumber == null || !Number.isFinite(existingAmountNumber)
          ? null
          : Math.round(existingAmountNumber * 100);

      if (existingExpectedKobo !== amountKobo) {
        throw new Error('Payment amount does not match the plan price.');
      }
    }
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

  const { data: latestActive, error: latestError } = await admin
    .from('user_subscriptions')
    .select('id, status, started_at, expires_at, quantity')
    .eq('user_id', userId)
    .eq('plan_id', planId)
    .in('status', ['active', 'trialing', 'past_due'])
    .order('expires_at', { ascending: false, nullsLast: false })
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestError && latestError.code !== 'PGRST116') {
    throw latestError;
  }

  const latestExpiresAt = latestActive?.expires_at
    ? new Date(latestActive.expires_at)
    : null;
  const purchaseDate = paidAt ? new Date(paidAt) : new Date();
  const startAnchor =
    latestExpiresAt &&
    !Number.isNaN(latestExpiresAt.getTime()) &&
    latestExpiresAt > purchaseDate
      ? latestExpiresAt
      : purchaseDate;
  const startsAtIso = startAnchor.toISOString();
  const expiresAt = computeExpiryDate(plan.duration_days, startsAtIso);

  const normalizedQuantity = 1; // quantity is fixed for now to avoid abuse

  let subscriptionId = latestActive?.id ?? null;

  if (latestActive?.id) {
    const newExpiresAt = expiresAt;
    const newQuantity = Number(latestActive.quantity ?? 1) + normalizedQuantity;
    const shouldResetStart =
      !latestExpiresAt ||
      latestExpiresAt <= purchaseDate ||
      !latestActive.started_at;

    const updatePayload: Record<string, unknown> = {
      status: 'active',
      canceled_at: null,
      expires_at: newExpiresAt,
      quantity: newQuantity,
    };

    if (shouldResetStart) {
      updatePayload.started_at = startsAtIso;
    }

    const { error: updateError } = await admin
      .from('user_subscriptions')
      .update(updatePayload)
      .eq('id', latestActive.id);

    if (updateError) {
      throw updateError;
    }

    subscriptionId = latestActive.id;
  } else {
    const insertPayload = {
      user_id: userId,
      plan_id: planId,
      status: 'active',
      started_at: startsAtIso,
      expires_at: expiresAt,
      price: amount,
      currency: currency || plan.currency || 'NGN',
      purchased_at: paidAt,
      payment_transaction_id: transactionId,
      quantity: normalizedQuantity,
      renewed_from_subscription_id: latestActive?.id ?? null,
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

  const { error: transactionLinkError } = await admin
    .from('payment_transactions')
    .update({ subscription_id: subscriptionId })
    .eq('id', transactionId);

  if (transactionLinkError && transactionLinkError.code !== 'PGRST116') {
    throw transactionLinkError;
  }

  const { data: profile } = await admin
    .from('profiles')
    .select('default_subscription_id')
    .eq('id', userId)
    .maybeSingle();

  if (!profile?.default_subscription_id) {
    await admin
      .from('profiles')
      .update({ default_subscription_id: subscriptionId })
      .eq('id', userId);
  }

  await admin.rpc('refresh_profile_subscription_status', { p_user_id: userId });

  return {
    subscriptionId,
    transactionId,
  };
}

export async function verifyPaystackSignature(
  body: string,
  signature: string | null
): Promise<boolean> {
  const secret = getPaystackSecretKey();
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
