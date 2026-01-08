import { serve } from 'https://deno.land/std@0.223.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

const ACTIVE_STATUSES = new Set(['active', 'trialing']);
const RESUMABLE_STATUSES = new Set(['pending_payment', 'awaiting_setup']);

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !serviceKey) {
      throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    }

    const { username } = await req.json();
    const normalized = String(username || '')
      .trim()
      .toLowerCase();

    if (normalized.length < 3) {
      return new Response(
        JSON.stringify({
          error: 'Username must be at least 3 characters long.',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceKey);

    const { data, error } = await supabaseAdmin
      .from('profiles')
      .select('id, email, subscription_status')
      .ilike('username', normalized)
      .maybeSingle();

    if (error) {
      console.error('[lookup-username] Profile query failed:', error);
      throw error;
    }

    if (!data?.email) {
      return new Response(
        JSON.stringify({
          error:
            'Username not found. Please check your username and try again.',
        }),
        {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const subscriptionStatus = data.subscription_status || null;

    let latestPaymentReference: string | null = null;

    // Fetch latest successful payment reference to assist with resuming checkout
    try {
      const { data: transactions } = await supabaseAdmin
        .from('payment_transactions')
        .select('reference')
        .eq('user_id', data.id)
        .eq('provider', 'paystack')
        .eq('status', 'success')
        .order('paid_at', { ascending: false, nullsLast: false })
        .limit(1);

      latestPaymentReference = transactions?.[0]?.reference ?? null;
    } catch (txnError) {
      console.warn(
        '[lookup-username] Unable to fetch latest transaction',
        txnError
      );
    }

    const responsePayload = {
      email: data.email,
      userId: data.id,
      subscriptionStatus,
      pendingRegistration: subscriptionStatus
        ? RESUMABLE_STATUSES.has(subscriptionStatus)
        : false,
      needsSupport: subscriptionStatus === 'suspended',
      latestReference: latestPaymentReference,
    };

    return new Response(JSON.stringify(responsePayload), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[lookup-username] Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Unexpected error occurred.' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
