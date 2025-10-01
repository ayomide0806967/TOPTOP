import { serve } from 'https://deno.land/std@0.223.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

interface InitiateRequestBody {
  planId?: string;
  userId?: string;
  registration?: {
    first_name?: string;
    last_name?: string;
    phone?: string;
  };
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return respond(req, null, { status: 204 });
  }

  try {
    // Check environment variables inside the handler
    const PAYSTACK_SECRET_KEY = Deno.env.get('PAYSTACK_SECRET_KEY');
    const PAYSTACK_PUBLIC_KEY = Deno.env.get('PAYSTACK_PUBLIC_KEY');

    if (!PAYSTACK_SECRET_KEY || !PAYSTACK_PUBLIC_KEY) {
      console.error('[paystack-initiate] Missing Paystack credentials');
      return respondError(req, 'Paystack configuration is missing.', 500);
    }

    if (req.method !== 'POST') {
      return respondError(req, 'Method Not Allowed', 405);
    }

    let body: InitiateRequestBody;
    try {
      body = await req.json();
    } catch (_error) {
      return respondError(req, 'Invalid JSON payload', 400);
    }

    const { planId, userId, registration } = body;
    console.log('[paystack-initiate] Request body:', { planId, userId, registration });

    if (!planId || !userId) {
      return respondError(req, 'planId and userId are required.', 400);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !serviceKey) {
      console.error('[paystack-initiate] Missing Supabase credentials');
      return respondError(req, 'Database configuration is missing.', 500);
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceKey);

    console.log('[paystack-initiate] Fetching plan:', planId);
    const { data: plan, error: planError } = await supabaseAdmin
      .from('subscription_plans')
      .select('id, price, currency, metadata, name')
      .eq('id', planId)
      .single();

    if (planError || !plan) {
      console.error('[paystack-initiate] Plan not found:', planError);
      return respondError(req, 'Subscription plan not found.', 404, { planId, error: planError });
    }

    console.log('[paystack-initiate] Plan found:', { id: plan.id, price: plan.price, currency: plan.currency });

    console.log('[paystack-initiate] Fetching user:', userId);
    const { data: user, error: userError } = await supabaseAdmin
      .from('profiles')
      .select('email, first_name, last_name, phone')
      .eq('id', userId)
      .single();

    if (userError || !user) {
      console.error('[paystack-initiate] User not found:', userError);
      return respondError(req, 'User profile not found.', 404, { userId, error: userError });
    }

    console.log('[paystack-initiate] User found:', { email: user.email });

    // Validate price
    if (!plan.price || plan.price <= 0) {
      console.error('[paystack-initiate] Invalid plan price:', plan.price);
      return respondError(req, 'Plan has invalid price.', 400, { price: plan.price });
    }

    const amountKobo = Math.round(plan.price * 100);
    console.log('[paystack-initiate] Amount calculation:', { price: plan.price, amountKobo });

    // Generate a unique reference
    const reference = `CBT_${userId.substring(0, 8)}_${Date.now()}`;

    const metadata = {
      user_id: userId,
      plan_id: plan.id,
      plan_name: plan.name || plan.metadata?.name || 'CBT Practice',
      custom_fields: [
        {
          display_name: 'Plan',
          variable_name: 'plan_name',
          value: plan.name || plan.metadata?.name || 'CBT Practice',
        },
        {
          display_name: 'Full Name',
          variable_name: 'full_name',
          value: `${user.first_name || ''} ${user.last_name || ''}`.trim(),
        },
      ],
    };

    // Return data for client-side Paystack initialization
    const responseData = {
      publicKey: PAYSTACK_PUBLIC_KEY,
      email: user.email,
      amount: amountKobo,
      currency: plan.currency || 'NGN',
      reference: reference,
      metadata: metadata,
    };

    console.log('[paystack-initiate] Returning data for client:', JSON.stringify(responseData, null, 2));

    return respondJson(req, responseData);
  } catch (error) {
    console.error('[paystack-initiate] Unexpected error:', error);
    return respondError(req, error.message || 'Internal server error', 500, {
      details: error.toString(),
      stack: error.stack,
    });
  }
});
