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

    if (!email || !firstName || !lastName || !phone) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('email', email)
      .eq('first_name', firstName)
      .eq('last_name', lastName)
      .eq('phone', phone)
      .eq('subscription_status', 'pending_payment')
      .single();

    if (profileError || !profile) {
      return new Response(JSON.stringify({ error: 'No matching pending registration found.' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: payment, error: paymentError } = await supabaseAdmin
      .from('payments')
      .select('reference')
      .eq('user_id', profile.id)
      .eq('status', 'success')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (paymentError || !payment) {
      return new Response(JSON.stringify({ error: 'No successful payment found for this registration.' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ 
      reference: payment.reference,
      userId: profile.id 
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
