import { serve } from 'https://deno.land/std@0.223.0/http/server.ts';
import { getAuthenticatedUser, getServiceClient } from '../_shared/paystack.ts';

const PAYSTACK_SECRET_KEY = Deno.env.get('PAYSTACK_SECRET_KEY');
const PAYSTACK_PUBLIC_KEY = Deno.env.get('PAYSTACK_PUBLIC_KEY');
const PAYSTACK_CALLBACK_URL = Deno.env.get('PAYSTACK_CALLBACK_URL');

if (!PAYSTACK_SECRET_KEY) {
  throw new Error('PAYSTACK_SECRET_KEY is required for Paystack integration.');
}

interface InitiateRequestBody {
  planId?: string;
  registration?: {
    first_name?: string;
    last_name?: string;
    phone?: string;
  };
}

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
  const PAYSTACK_SECRET_KEY = Deno.env.get('PAYSTACK_SECRET_KEY');
  if (!PAYSTACK_SECRET_KEY) {
    return respondError(
      req,
      'PAYSTACK_SECRET_KEY is not set in the Supabase project.',
      500
    );
  }
  if (req.method === 'OPTIONS') {
    return respond(req, null, { status: 204 });
  }

  if (req.method !== 'POST') {
    return respondError(req, 'Method Not Allowed', 405);
  }

  const authHeader = req.headers.get('authorization');
  const { user, error } = await getAuthenticatedUser(authHeader);
  if (error || !user) {
    return respondError(req, 'Unauthorized', 401);
  }

  let body: InitiateRequestBody;
  try {
    body = await req.json();
  } catch (_error) {
    return respondError(req, 'Invalid JSON payload', 400);
  }

  const planId = body?.planId;
  const registration = body?.registration ?? {};
  if (!planId) {
    return respondError(
      req,
      'Provide a planId to initialise Paystack checkout.',
      400
    );
  }

  const admin = getServiceClient();
  const { data: plan, error: planError } = await admin
    .from('subscription_plans')
    .select(
      'id, name, plan_tier, price, currency, product:subscription_products(name)'
    )
    .eq('id', planId)
    .maybeSingle();

  if (planError || !plan) {
    return respondError(req, 'Subscription plan not found.', 404);
  }

  const amountKobo = Math.round(Number(plan.price || 0) * 100);
  if (!amountKobo || amountKobo <= 0) {
    return respondError(
      req,
      'This plan is not configured with a valid price.',
      422
    );
  }

  const email = user.email;
  if (!email) {
    return respondError(
      req,
      'User account missing email address required for checkout.',
      400
    );
  }

  const sanitizedRegistration: Record<string, string> = {};
  const regFirstName =
    typeof registration.first_name === 'string'
      ? registration.first_name.trim()
      : '';
  const regLastName =
    typeof registration.last_name === 'string'
      ? registration.last_name.trim()
      : '';
  const regPhone =
    typeof registration.phone === 'string' ? registration.phone.trim() : '';

  if (regFirstName) sanitizedRegistration.first_name = regFirstName;
  if (regLastName) sanitizedRegistration.last_name = regLastName;
  if (regPhone) sanitizedRegistration.phone = regPhone;

  const metadata = {
    user_id: user.id,
    plan_id: plan.id,
    plan_name: plan.name,
    plan_tier: plan.plan_tier,
    registration: sanitizedRegistration,
  };

  const payload = {
    email,
    amount: amountKobo,
    currency: plan.currency || 'NGN',
    metadata,
    channels: ['card', 'bank', 'ussd', 'bank_transfer'],
    callback_url: PAYSTACK_CALLBACK_URL || undefined,
  };

  const response = await fetch(
    'https://api.paystack.co/transaction/initialize',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
    }
  );

  const json = await response.json();
  if (!response.ok || !json?.status) {
    console.error('[Paystack] Initialization failed', json);
    const message =
      json?.message || 'Unable to initialise Paystack transaction.';
    return respondError(req, message, 502, json);
  }

  const data = json.data ?? {};
  const reference = data.reference as string | undefined;
  if (!reference) {
    return respondError(
      req,
      'Paystack did not return a transaction reference.',
      502
    );
  }

  const transactionRecord = {
    user_id: user.id,
    plan_id: plan.id,
    provider: 'paystack',
    reference,
    status: 'pending',
    amount: Number(plan.price || 0),
    currency: plan.currency || 'NGN',
    metadata,
    raw_response: data,
  };

  await admin
    .from('payment_transactions')
    .upsert(transactionRecord, { onConflict: 'provider,reference' });

  const responseBody = {
    reference,
    access_code: data.access_code,
    authorization_url: data.authorization_url,
    amount: amountKobo,
    currency: plan.currency || 'NGN',
    email,
    metadata,
    plan: {
      id: plan.id,
      name: plan.name,
      plan_tier: plan.plan_tier,
      product_name: plan.product?.name ?? null,
    },
    paystack_public_key: PAYSTACK_PUBLIC_KEY || null,
  };

  return respondJson(req, responseBody, { status: 200 });
});
