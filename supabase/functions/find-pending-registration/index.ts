import { serve } from 'https://deno.land/std@0.223.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { email, firstName, lastName, phone } = await req.json();

    const normalizedEmail = String(email || '').trim().toLowerCase();
    const normalizedFirstName = String(firstName || '').trim();
    const normalizedLastName = String(lastName || '').trim();
    const normalizedPhone = String(phone || '').trim();

    if (!normalizedEmail || !normalizedFirstName || !normalizedLastName || !normalizedPhone) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    if (!supabaseUrl || !serviceRoleKey) {
      console.error('[find-pending-registration] Missing Supabase environment configuration');
      return new Response(
        JSON.stringify({ error: 'Server configuration error. Please contact support.' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const normalizeText = (value: string | null) => (value || '').trim().toLowerCase();
    const digitsOnly = (value: string | null) => (value || '').replace(/\D+/g, '');

    const providedFirst = normalizeText(normalizedFirstName);
    const providedLast = normalizeText(normalizedLastName);
    const providedPhoneDigits = digitsOnly(normalizedPhone);

    let profile = null;
    let profileError = null;

    ({ data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('id, email, first_name, last_name, phone, subscription_status')
      .eq('email', normalizedEmail)
      .eq('subscription_status', 'pending_payment')
      .maybeSingle());

    if ((!profile || profileError?.code === 'PGRST116') && normalizedPhone) {
      ({ data: profile, error: profileError } = await supabaseAdmin
        .from('profiles')
        .select('id, email, first_name, last_name, phone, subscription_status')
        .eq('phone', normalizedPhone)
        .eq('subscription_status', 'pending_payment')
        .maybeSingle());
    }

    if (profileError && profileError.code !== 'PGRST116') {
      console.error('[find-pending-registration] Profile lookup error', profileError);
      return new Response(
        JSON.stringify({ error: 'Failed to lookup registration. Please try again later.' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    if (!profile) {
      return new Response(JSON.stringify({ error: 'No matching pending registration found.' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const profileFirst = normalizeText(profile.first_name ?? '');
    const profileLast = normalizeText(profile.last_name ?? '');
    const profilePhoneDigits = digitsOnly(profile.phone ?? '');

    const phoneMatches =
      !providedPhoneDigits ||
      !profilePhoneDigits ||
      providedPhoneDigits === profilePhoneDigits ||
      providedPhoneDigits.endsWith(profilePhoneDigits) ||
      profilePhoneDigits.endsWith(providedPhoneDigits);

    if (
      profileFirst !== providedFirst ||
      profileLast !== providedLast ||
      !phoneMatches
    ) {
      return new Response(JSON.stringify({ error: 'No matching pending registration found.' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: transaction, error: transactionError } = await supabaseAdmin
      .from('payment_transactions')
      .select('reference')
      .eq('user_id', profile.id)
      .eq('status', 'success')
      .order('paid_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (transactionError && transactionError.code !== 'PGRST116') {
      console.error('[find-pending-registration] payment_transactions lookup error', transactionError);
      return new Response(
        JSON.stringify({ error: 'Unable to fetch payment details right now. Please try again later.' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    let reference = transaction?.reference ?? null;

    if (!reference) {
      const { data: legacyPayment, error: legacyError } = await supabaseAdmin
        .from('payments')
        .select('reference')
        .eq('user_id', profile.id)
        .eq('status', 'success')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (legacyError && legacyError.code !== 'PGRST116') {
        console.error('[find-pending-registration] Legacy payments lookup error', legacyError);
        return new Response(
          JSON.stringify({ error: 'Unable to fetch payment details right now. Please try again later.' }),
          {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          },
        );
      }

      reference = legacyPayment?.reference ?? null;
    }

    if (!reference) {
      return new Response(
        JSON.stringify({ error: 'No successful payment found for this registration.' }),
        {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    return new Response(
      JSON.stringify({
        reference,
        userId: profile.id,
      }),
      {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
