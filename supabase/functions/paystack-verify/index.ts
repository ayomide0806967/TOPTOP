import { serve } from 'https://deno.land/std@0.223.0/http/server.ts';
import {
  upsertPaymentAndSubscription,
} from '../_shared/paystack.ts';
import { getPaystackSecretKey } from '../_shared/paystackConfig.ts';

interface VerifyRequestBody {
  reference?: string;
}

// CORS helpers (mirrors paystack-initiate)
const corsHeaders = {
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers':
    'authorization,content-type,apikey,x-client-info',
  Vary: 'Origin',
};

const respond = (
  req: Request,
  body: BodyInit | null,
  init: ResponseInit = {}
) => {
  const origin = req.headers.get('origin') ?? '*';
  return new Response(body, {
    ...init,
    headers: {
      'Access-Control-Allow-Origin': origin,
      ...corsHeaders,
      ...(init.headers ?? {}),
    },
  });
};

const respondJson = (req: Request, payload: unknown, init: ResponseInit = {}) =>
  respond(req, JSON.stringify(payload), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });

const respondError = (
  req: Request,
  message: string,
  status: number,
  details?: unknown
) => respondJson(req, { error: message, details }, { status });

serve(async (req) => {
  const PAYSTACK_SECRET_KEY = getPaystackSecretKey();
  // Preflight
  if (req.method === 'OPTIONS') {
    return respond(req, null, { status: 204 });
  }

  if (req.method !== 'POST') {
    return respondError(req, 'Method Not Allowed', 405);
  }

  let body: VerifyRequestBody;
  try {
    body = await req.json();
  } catch (_error) {
    return respondError(req, 'Invalid JSON payload', 400);
  }

  const reference = body?.reference?.trim();
  if (!reference) {
    return respondError(req, 'Provide a transaction reference to verify.', 400);
  }

  const response = await fetch(
    `https://api.paystack.co/transaction/verify/${reference}`,
    {
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
        Accept: 'application/json',
      },
    }
  );

  const json = await response.json();
  if (!response.ok || !json?.status) {
    const message = json?.message || 'Unable to verify Paystack transaction.';
    return respondError(req, message, 502, json);
  }

  const data = json.data ?? {};
  const statusRaw = (data.status as string) || '';
  const normalizedStatus = statusRaw.toLowerCase();
  if (normalizedStatus !== 'success') {
    return respondError(req, 'Transaction is not successful yet.', 202);
  }

  const metadata = (data.metadata ?? {}) as Record<string, unknown>;
  const userId = metadata.user_id as string | undefined;
  const planId = metadata.plan_id as string | undefined;

  if (!userId) {
    return respondError(
      req,
      'Transaction metadata missing user information.',
      422
    );
  }

  if (!planId) {
    return respondError(
      req,
      'Transaction metadata missing subscription plan information.',
      422
    );
  }

  const amountKobo = Number(data.amount ?? 0);
  const currency = (data.currency as string) || 'NGN';
  const paidAt =
    (data.paid_at as string) ||
    (data.paidAt as string) ||
    new Date().toISOString();

  try {
    const result = await upsertPaymentAndSubscription({
      userId: userId,
      planId,
      reference,
      status: normalizedStatus,
      amountKobo,
      currency,
      paidAt,
      metadata,
      rawResponse: data,
    });

    return respondJson(
      req,
      {
        status: 'success',
        subscription_id: result.subscriptionId,
        transaction_id: result.transactionId,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error('[Paystack] Verification processing failed', err);
    return respondError(req, 'Failed to record payment.', 500);
  }
});
