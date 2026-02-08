import { serve } from 'https://deno.land/std@0.223.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

function json(status: number, payload: Record<string, unknown>) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function normalizeE164(phone: string) {
  const raw = String(phone || '').trim();
  if (!raw) return '';
  let cleaned = raw.replace(/[^\d+]/g, '');
  if (cleaned.startsWith('00')) cleaned = `+${cleaned.slice(2)}`;
  if (cleaned.startsWith('+')) {
    const digits = cleaned.slice(1).replace(/\D/g, '');
    return `+${digits}`;
  }
  const digits = cleaned.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('234')) return `+${digits}`;
  if (digits.startsWith('0')) return `+234${digits.slice(1)}`;
  if (digits.length === 10) return `+234${digits}`;
  return `+234${digits}`;
}

function isPlausibleE164(phone: string) {
  return /^\+[1-9][0-9]{8,14}$/.test(phone);
}

async function sendTwilioVerifyWhatsApp(toE164: string) {
  const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID') || '';
  const authToken = Deno.env.get('TWILIO_AUTH_TOKEN') || '';
  const verifyServiceSid = Deno.env.get('TWILIO_VERIFY_SERVICE_SID') || '';

  if (!accountSid || !authToken || !verifyServiceSid) {
    throw new Error(
      'WhatsApp OTP is not configured. Missing TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_VERIFY_SERVICE_SID.'
    );
  }

  const url = `https://verify.twilio.com/v2/Services/${verifyServiceSid}/Verifications`;
  const body = new URLSearchParams();
  body.set('To', toE164);
  body.set('Channel', 'whatsapp');

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || 'Failed to send WhatsApp code.');
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return json(405, { error: 'Method Not Allowed' });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    if (!supabaseUrl || !anonKey || !serviceKey) {
      return json(500, { error: 'Supabase environment is not configured.' });
    }

    const authHeader =
      req.headers.get('authorization') ||
      req.headers.get('Authorization') ||
      '';
    const supabase = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return json(401, { error: 'Unauthorized' });
    }

    const body = await req.json().catch(() => ({}));
    const normalizedPhone = normalizeE164(String(body.phone || ''));
    if (!normalizedPhone || !isPlausibleE164(normalizedPhone)) {
      return json(400, { error: 'Enter a valid phone number.' });
    }

    const admin = createClient(supabaseUrl, serviceKey);

    const { data: existing, error: lookupError } = await admin
      .from('profiles')
      .select('id')
      .eq('phone', normalizedPhone)
      .neq('id', user.id)
      .maybeSingle();
    if (lookupError && lookupError.code !== 'PGRST116') {
      throw lookupError;
    }
    if (existing?.id) {
      return json(409, {
        error:
          'This WhatsApp number is already linked to another account. Use a different number or contact support.',
      });
    }

    await sendTwilioVerifyWhatsApp(normalizedPhone);

    return json(200, { success: true });
  } catch (error) {
    console.error('[whatsapp-link-request] Unexpected error:', error);
    return json(500, {
      error: error?.message || 'Unable to send code right now.',
    });
  }
});
