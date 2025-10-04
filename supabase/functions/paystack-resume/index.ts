import { serve } from 'https://deno.land/std@0.223.0/http/server.ts';
import { getServiceClient, upsertPaymentAndSubscription } from '../_shared/paystack.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ResumeRequest {
  userId?: string;
  email?: string;
  reference?: string;
}

function ok(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders,
      ...(init.headers ?? {}),
    },
  });
}

function errorResponse(message: string, status = 400, details?: unknown) {
  return ok({ error: message, details }, { status });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', 405);
  }

  try {
    const payload = (await req.json()) as ResumeRequest;
    const userId = (payload.userId || '').trim();
    const email = (payload.email || '').trim().toLowerCase();
    const reference = (payload.reference || '').trim();

    if (!userId && !email) {
      return errorResponse('Provide a userId or email to resume the subscription.', 400);
    }

    const admin = getServiceClient();

    // Resolve profile
    const { data: profile, error: profileError } = await admin
      .from('profiles')
      .select('id, email, subscription_status')
      .eq(userId ? 'id' : 'email', userId || email)
      .maybeSingle();

    if (profileError) {
      throw profileError;
    }

    if (!profile) {
      return errorResponse('Learner profile not found.', 404);
    }

    const resolvedUserId = profile.id;

    // Quick check: does learner already have an active subscription?
    const { data: activeSub, error: activeError } = await admin
      .from('user_subscriptions')
      .select('id, status, plan_id')
      .eq('user_id', resolvedUserId)
      .in('status', ['active', 'trialing', 'past_due'])
      .maybeSingle();

    if (activeError) {
      throw activeError;
    }

    if (activeSub) {
      return ok({ status: 'active', subscriptionId: activeSub.id });
    }

    // Find latest successful Paystack transaction
    const transactionQuery = admin
      .from('payment_transactions')
      .select('id, plan_id, reference, amount, currency, paid_at, metadata, raw_response')
      .eq('user_id', resolvedUserId)
      .eq('provider', 'paystack')
      .eq('status', 'success')
      .order('paid_at', { ascending: false, nullsLast: false })
      .limit(1);

    if (reference) {
      transactionQuery.eq('reference', reference);
    }

    const { data: transactions, error: txnError } = await transactionQuery;
    if (txnError) {
      throw txnError;
    }

    const transaction = transactions?.[0];

    if (!transaction) {
      return ok({ status: 'noop', reason: 'no_successful_payment' });
    }

    if (!transaction.plan_id) {
      return ok({ status: 'noop', reason: 'missing_plan', reference: transaction.reference });
    }

    const amountNumeric = Number(transaction.amount ?? 0);
    const amountKobo = Number.isFinite(amountNumeric) ? Math.round(amountNumeric * 100) : 0;

    if (!amountKobo || amountKobo <= 0) {
      return ok({ status: 'noop', reason: 'invalid_amount', reference: transaction.reference });
    }

    const metadata = (transaction.metadata ?? {}) as Record<string, unknown>;

    const upsertResult = await upsertPaymentAndSubscription({
      userId: resolvedUserId,
      planId: transaction.plan_id,
      reference: transaction.reference,
      status: 'success',
      amountKobo,
      currency: (transaction.currency as string) || 'NGN',
      paidAt: transaction.paid_at,
      metadata,
      rawResponse: transaction.raw_response,
    });

    return ok({
      status: 'restored',
      subscriptionId: upsertResult.subscriptionId,
      transactionId: upsertResult.transactionId,
      reference: transaction.reference,
    });
  } catch (error) {
    console.error('[paystack-resume] Unexpected error', error);
    return errorResponse(error?.message || 'Unable to resume subscription.', 500, {
      details: error?.toString?.(),
    });
  }
});
