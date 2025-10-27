import { serve } from 'https://deno.land/std@0.223.0/http/server.ts';
import { upsertPaymentAndSubscription } from '../_shared/paystack.ts';
import { getPaystackSecretKey } from '../_shared/paystackConfig.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.1';

type Target = {
  id: string;
  pending_checkout_reference: string | null;
  pending_plan_id: string | null;
};

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const PAYSTACK_SECRET_KEY = getPaystackSecretKey();
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    if (!PAYSTACK_SECRET_KEY || !supabaseUrl || !serviceKey) {
      return new Response(JSON.stringify({ error: 'Server configuration missing' }), {
        status: 500,
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey);

    let onlyUserId: string | null = null;
    if (req.method === 'POST') {
      try {
        const body = await req.json();
        if (body?.userId && typeof body.userId === 'string') {
          onlyUserId = body.userId;
        }
      } catch (_) {}
    }

    if (onlyUserId) {
      const { data, error } = await admin
        .from('profiles')
        .select('id, pending_checkout_reference, pending_plan_id')
        .eq('id', onlyUserId)
        .maybeSingle();
      if (error || !data) {
        return new Response(JSON.stringify({ processed: 0, activated: 0, results: [] }), {
          status: 200,
          headers: { ...cors, 'Content-Type': 'application/json' },
        });
      }
      const targets: Target[] = [data as Target];
      const result = await processTargets(targets, admin, PAYSTACK_SECRET_KEY);
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    const { data: list, error } = await admin
      .from('profiles')
      .select('id, pending_checkout_reference, pending_plan_id')
      .eq('subscription_status', 'pending_payment')
      .neq('pending_checkout_reference', null)
      .neq('pending_plan_id', null)
      .order('pending_plan_selected_at', { ascending: false })
      .limit(50);

    const targets: Target[] = Array.isArray(list) ? (list as Target[]) : [];
    const result = await processTargets(targets, admin, PAYSTACK_SECRET_KEY);
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
});

async function processTargets(targets: Target[], admin: any, PAYSTACK_SECRET_KEY: string) {
  let processed = 0;
  let activated = 0;
  const results: Record<string, unknown>[] = [];

  for (const t of targets) {
    if (!t?.pending_checkout_reference || !t?.pending_plan_id) continue;
    processed += 1;
    const reference = t.pending_checkout_reference;

    const response = await fetch(`https://api.paystack.co/transaction/verify/${reference}` as string, {
      headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`, Accept: 'application/json' },
    });
    const json = await response.json();
    const ok = response.ok && json?.status && json?.data?.status?.toLowerCase() === 'success';
    if (!ok) {
      results.push({ userId: t.id, reference, status: 'not_success', paystack: json?.data?.status });
      continue;
    }

    const data = json.data ?? {};
    const currency = (data.currency as string) || 'NGN';
    const amountKobo = Number(data.amount ?? 0);
    const paidAt = (data.paid_at as string) || new Date().toISOString();
    try {
      await upsertPaymentAndSubscription({
        userId: t.id,
        planId: t.pending_plan_id!,
        reference,
        status: 'success',
        amountKobo,
        currency,
        paidAt,
        metadata: data.metadata ?? {},
        rawResponse: data,
      });
      activated += 1;
      results.push({ userId: t.id, reference, status: 'activated' });
    } catch (err) {
      results.push({ userId: t.id, reference, status: 'error', error: String(err) });
    }
  }

  // refresh statuses for processed users
  for (const t of targets) {
    if (!t?.id) continue;
    try {
      await admin.rpc('refresh_profile_subscription_status', { p_user_id: t.id });
    } catch (_) {}
  }

  return { processed, activated, results };
}

