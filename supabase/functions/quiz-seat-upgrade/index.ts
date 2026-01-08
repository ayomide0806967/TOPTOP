import { serve } from 'https://deno.land/std@0.223.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.1';
import {
  getPaystackPublicKey,
  getPaystackSecretKey,
} from '../_shared/paystackConfig.ts';

type UpgradeRequest = {
  additionalSeats?: number;
};

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

function json(req: Request, body: unknown, init: ResponseInit = {}) {
  const origin = req.headers.get('origin') ?? '*';
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': origin,
      ...cors,
      ...(init.headers ?? {}),
    },
  });
}

function empty(req: Request, init: ResponseInit = {}) {
  const origin = req.headers.get('origin') ?? '*';
  return new Response(null, {
    ...init,
    headers: {
      'Access-Control-Allow-Origin': origin,
      ...cors,
      ...(init.headers ?? {}),
    },
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return empty(req, { status: 204 });
  if (req.method !== 'POST')
    return json(req, { error: 'Method Not Allowed' }, { status: 405 });

  const secret = getPaystackSecretKey();
  const publicKey = getPaystackPublicKey();
  if (!secret || !publicKey)
    return json(req, { error: 'Paystack not configured' }, { status: 500 });

  // Resolve Supabase admin
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!SUPABASE_URL || !SERVICE_KEY)
    return json(req, { error: 'Supabase not configured' }, { status: 500 });
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false },
  });

  let body: UpgradeRequest;
  try {
    body = await req.json();
  } catch (_) {
    return json(req, { error: 'Invalid JSON payload' }, { status: 400 });
  }

  const additionalSeats = Number(body?.additionalSeats ?? 0);
  if (!Number.isFinite(additionalSeats) || additionalSeats <= 0) {
    return json(
      req,
      { error: 'additionalSeats must be a positive integer' },
      { status: 400 }
    );
  }

  // Identify user and tenant (best-effort). We accept either Supabase JWT or app token upstream.
  const auth =
    req.headers.get('authorization') || req.headers.get('Authorization') || '';
  let userId: string | null = null;
  try {
    // Try Supabase auth first
    if (auth && auth.startsWith('Bearer ')) {
      const supa = createClient(
        SUPABASE_URL,
        Deno.env.get('SUPABASE_ANON_KEY') || '',
        {
          global: { headers: { Authorization: auth } },
          auth: { persistSession: false },
        }
      );
      const { data } = await supa.auth.getUser();
      userId = data?.user?.id ?? null;
    }
  } catch (_) {
    // ignore
  }

  if (!userId && auth?.startsWith('Bearer ')) {
    // Fallback: decode app token format (base64 JSON { userId })
    try {
      const token = auth.substring('Bearer '.length).trim();
      const json = atob(token);
      const parsed = JSON.parse(json);
      if (parsed?.userId && typeof parsed.userId === 'string') {
        userId = parsed.userId;
      }
    } catch (_) {
      // ignore
    }
  }

  if (!userId) {
    return json(req, { error: 'Authentication required' }, { status: 401 });
  }

  // Lookup user + tenant + seat pricing
  const { data: userRow, error: userErr } = await admin
    .from('users')
    .select('id, email, tenant_id')
    .eq('id', userId)
    .maybeSingle();
  if (userErr || !userRow)
    return json(req, { error: 'User not found' }, { status: 404 });

  // Ensure subscription exists
  const { data: sub, error: subErr } = await admin.rpc(
    'ensure_quiz_seat_subscription',
    { p_tenant_id: userRow.tenant_id }
  );
  if (subErr || !sub)
    return json(
      req,
      { error: 'Unable to ensure seat subscription' },
      { status: 500 }
    );

  const pricePerSeat = Number(sub.price_per_seat ?? 500);
  const currency = (sub.currency as string) || 'NGN';

  // Create pending seat transaction
  const { data: txn, error: txnErr } = await admin
    .from('quiz_seat_transactions')
    .insert({
      tenant_id: userRow.tenant_id,
      seat_subscription_id: sub.id,
      user_id: userRow.id,
      additional_seats: additionalSeats,
      amount: pricePerSeat * additionalSeats,
      amount_kobo: Math.round(pricePerSeat * additionalSeats * 100),
      currency,
      status: 'pending',
    })
    .select('id')
    .single();
  if (txnErr || !txn)
    return json(
      req,
      { error: 'Failed to record transaction' },
      { status: 500 }
    );

  // Initialize Paystack checkout
  const reference = `QBSEAT_${txn.id}_${Date.now()}`;
  const payload = {
    email: userRow.email || `tenant-${userRow.tenant_id}@example.com`,
    amount: Math.round(pricePerSeat * additionalSeats * 100),
    currency,
    reference,
    metadata: {
      seat_upgrade_id: txn.id,
      additional_seats: additionalSeats,
      tenant_id: userRow.tenant_id,
    },
  };

  try {
    const resp = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secret}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    const data = await resp.json();
    if (!resp.ok || !data?.status) {
      console.error('[quiz-seat-upgrade] Paystack init failed:', data);
      return json(
        req,
        { error: 'Failed to initialize payment' },
        { status: 502 }
      );
    }

    // Persist reference and authorization URL
    await admin
      .from('quiz_seat_transactions')
      .update({
        paystack_reference: reference,
        paystack_authorization_url: data?.data?.authorization_url ?? null,
      })
      .eq('id', txn.id);

    return json(req, {
      checkoutUrl: data?.data?.authorization_url ?? null,
      reference,
      publicKey,
    });
  } catch (error) {
    console.error('[quiz-seat-upgrade] Unexpected error:', error);
    return json(req, { error: 'Unexpected error' }, { status: 500 });
  }
});
