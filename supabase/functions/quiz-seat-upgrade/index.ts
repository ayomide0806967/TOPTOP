import { serve } from 'https://deno.land/std@0.223.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.1';
import {
  getPaystackPublicKey,
  getPaystackSecretKey,
} from '../_shared/paystackConfig.ts';

const SUPABASE_URL =
  Deno.env.get('APP_SUPABASE_URL') ?? Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get('APP_SUPABASE_SERVICE_ROLE_KEY') ??
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ??
  '';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    'Supabase credentials missing. Ensure APP_SUPABASE_URL and APP_SUPABASE_SERVICE_ROLE_KEY are set.'
  );
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

type SeatUpgradePayload = {
  additionalSeats: number;
};

type TokenPayload = {
  userId: string;
  tenantId?: string;
  role: string;
  exp: number;
  email?: string;
};

function decodeToken(authHeader: string | null): TokenPayload | null {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.replace('Bearer ', '');
  try {
    const payload = JSON.parse(atob(token));
    if (!payload || payload.exp * 1000 < Date.now()) {
      return null;
    }
    return payload;
  } catch (_error) {
    return null;
  }
}

function computeProratedAmount(
  pricePerSeat: number,
  additionalSeats: number,
  billingCycleEnd: Date
): { amount: number; amountKobo: number; daysRemaining: number } {
  const now = new Date();
  const msDiff = billingCycleEnd.getTime() - now.getTime();
  const dayMs = 1000 * 60 * 60 * 24;
  const rawDays = Math.max(msDiff / dayMs, 0);
  const daysRemaining = Math.max(1, Math.ceil(rawDays));
  const prorateFactor = Math.min(1, daysRemaining / 30);
  const amount = Number(
    (pricePerSeat * additionalSeats * prorateFactor).toFixed(2)
  );
  const amountKobo = Math.max(Math.round(amount * 100), 100);
  return { amount, amountKobo, daysRemaining };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', {
      status: 405,
      headers: corsHeaders,
    });
  }

  const authHeader = req.headers.get('Authorization');
  const token = decodeToken(authHeader);
  if (!token?.userId || !token.tenantId) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized', code: 'UNAUTHORIZED' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const { additionalSeats }: SeatUpgradePayload = await req.json().catch(() => ({
    additionalSeats: 0,
  }));

  if (!additionalSeats || !Number.isFinite(additionalSeats) || additionalSeats <= 0) {
    return new Response(
      JSON.stringify({ error: 'additionalSeats must be greater than zero.' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  // Ensure the tenant has a seat subscription
  const { data: ensureResult, error: ensureError } = await serviceClient.rpc(
    'ensure_quiz_seat_subscription',
    { p_tenant_id: token.tenantId }
  );
  if (ensureError) {
    console.error('[quiz-seat-upgrade] ensure subscription failed', ensureError);
    return new Response(
      JSON.stringify({ error: 'Unable to load seat subscription.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  let subscription = ensureResult as {
    id: string;
    seat_quota: number;
    paid_seats: number;
    free_tier_seats: number;
    price_per_seat: number;
    currency: string;
    billing_cycle_start: string;
    billing_cycle_end: string;
    status: string;
  };

  if (!subscription) {
    return new Response(
      JSON.stringify({ error: 'Subscription record not available.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const now = new Date();
  let billingCycleEnd = new Date(subscription.billing_cycle_end);
  if (!subscription.billing_cycle_end || Number.isNaN(billingCycleEnd.getTime()) || billingCycleEnd <= now) {
    const start = now;
    const end = new Date(start.getTime() + 30 * 24 * 60 * 60 * 1000);
    const { data: refreshed, error: refreshError } = await serviceClient
      .from('quiz_seat_subscriptions')
      .update({
        billing_cycle_start: start.toISOString(),
        billing_cycle_end: end.toISOString(),
        updated_at: now.toISOString(),
        seat_quota: (subscription.free_tier_seats ?? 0) + (subscription.paid_seats ?? 0),
      })
      .eq('id', subscription.id)
      .select('*')
      .single();
    if (refreshError) {
      console.error('[quiz-seat-upgrade] failed to refresh billing cycle', refreshError);
      return new Response(
        JSON.stringify({ error: 'Unable to refresh billing cycle.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    subscription = refreshed;
    billingCycleEnd = new Date(refreshed.billing_cycle_end);
  }

  const pricePerSeat = Number(subscription.price_per_seat ?? 500);
  const { amount, amountKobo, daysRemaining } = computeProratedAmount(
    pricePerSeat,
    additionalSeats,
    billingCycleEnd
  );

  if (!Number.isFinite(amount) || amount <= 0) {
    return new Response(
      JSON.stringify({ error: 'Calculated amount is invalid.' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const { data: userRow, error: userError } = await serviceClient
    .from('users')
    .select('id, email, first_name, last_name')
    .eq('id', token.userId)
    .single();
  if (userError || !userRow?.email) {
    console.error('[quiz-seat-upgrade] failed to fetch user email', userError);
    return new Response(
      JSON.stringify({ error: 'Unable to resolve user email for billing.' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const { data: transactionRow, error: transactionError } = await serviceClient
    .from('quiz_seat_transactions')
    .insert({
      tenant_id: token.tenantId,
      seat_subscription_id: subscription.id,
      user_id: token.userId,
      additional_seats: additionalSeats,
      amount,
      amount_kobo: amountKobo,
      currency: subscription.currency || 'NGN',
      metadata: {
        days_remaining: daysRemaining,
        price_per_seat: pricePerSeat,
        billing_cycle_end: subscription.billing_cycle_end,
      },
    })
    .select('*')
    .single();

  if (transactionError || !transactionRow) {
    console.error('[quiz-seat-upgrade] failed to create transaction', transactionError);
    return new Response(
      JSON.stringify({ error: 'Unable to start seat upgrade transaction.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const PAYSTACK_SECRET_KEY = getPaystackSecretKey();
  const PAYSTACK_PUBLIC_KEY = getPaystackPublicKey();
  if (!PAYSTACK_SECRET_KEY || !PAYSTACK_PUBLIC_KEY) {
    console.error('[quiz-seat-upgrade] Missing Paystack credentials');
    return new Response(
      JSON.stringify({ error: 'Paystack configuration missing.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const reference = `SEAT_${transactionRow.id.slice(0, 8)}_${Date.now()}`;

  const metadata = {
    user_id: token.userId,
    tenant_id: token.tenantId,
    seat_upgrade_id: transactionRow.id,
    additional_seats: additionalSeats,
    billing_cycle_end: subscription.billing_cycle_end,
    upgrade_type: 'seat_top_up',
  };

  const paystackResponse = await fetch(
    'https://api.paystack.co/transaction/initialize',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: amountKobo,
        currency: subscription.currency || 'NGN',
        email: userRow.email,
        reference,
        metadata,
        callback_url:
          Deno.env.get('PAYSTACK_SEAT_CALLBACK_URL') ??
          Deno.env.get('PAYSTACK_CALLBACK_URL') ??
          null,
      }),
    }
  );

  const paystackJson = await paystackResponse.json().catch(() => null);
  if (!paystackResponse.ok || !paystackJson?.status) {
    console.error('[quiz-seat-upgrade] Paystack init failed', paystackJson);
    await serviceClient
      .from('quiz_seat_transactions')
      .update({ status: 'failed', updated_at: new Date().toISOString() })
      .eq('id', transactionRow.id);
    return new Response(
      JSON.stringify({
        error: 'Unable to initialize Paystack checkout.',
        details: paystackJson?.message || 'paystack_error',
      }),
      { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const authorizationUrl = paystackJson?.data?.authorization_url;

  await serviceClient
    .from('quiz_seat_transactions')
    .update({
      paystack_reference: paystackJson?.data?.reference ?? reference,
      paystack_authorization_url: authorizationUrl ?? null,
      metadata: {
        ...transactionRow.metadata,
        paystack_response: paystackJson?.data ?? null,
      },
      updated_at: new Date().toISOString(),
    })
    .eq('id', transactionRow.id);

  return new Response(
    JSON.stringify({
      checkoutUrl: authorizationUrl,
      reference: paystackJson?.data?.reference ?? reference,
      amount,
      amountKobo,
      additionalSeats,
      currency: subscription.currency || 'NGN',
      publicKey: PAYSTACK_PUBLIC_KEY,
      daysRemaining,
      renewalDate: subscription.billing_cycle_end,
    }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
});
