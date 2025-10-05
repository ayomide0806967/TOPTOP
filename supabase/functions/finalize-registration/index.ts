import { serve } from 'https://deno.land/std@0.223.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ALLOWED_ORIGINS = (Deno.env.get('REGISTRATION_ALLOWED_ORIGINS') || '')
  .split(',')
  .map((entry) => entry.trim())
  .filter(Boolean);

const BASE_CORS_HEADERS = {
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  Vary: 'Origin',
} as const;

const USERNAME_PATTERN = /^[a-z0-9_-]{3,}$/;
const MIN_PASSWORD_LENGTH = 8;

function resolveOrigin(origin: string | null): string | null {
  if (!ALLOWED_ORIGINS.length) {
    return origin ?? '*';
  }
  if (!origin) return null;
  return ALLOWED_ORIGINS.includes(origin) ? origin : null;
}

function buildCorsHeaders(origin: string | null) {
  const resolved = resolveOrigin(origin);
  if (!resolved) return null;
  return {
    ...BASE_CORS_HEADERS,
    'Access-Control-Allow-Origin': resolved,
  } as const;
}

function jsonResponse(
  status: number,
  origin: string | null,
  payload: Record<string, unknown>,
) {
  const headers = buildCorsHeaders(origin);
  if (!headers) {
    return new Response(JSON.stringify({ error: 'Origin not allowed' }), {
      status: 403,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': 'null',
        Vary: 'Origin',
      },
    });
  }

  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' },
  });
}

async function hashToken(token: string) {
  const encoder = new TextEncoder();
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(token));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

serve(async (req) => {
  const origin = req.headers.get('origin') || req.headers.get('Origin');
  const corsHeaders = buildCorsHeaders(origin);

  if (!corsHeaders) {
    return jsonResponse(403, null, { error: 'Origin not allowed' });
  }

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !serviceKey) {
      throw new Error('Missing environment variables');
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceKey);

    const payload = await req.json();
    const userId = String(payload.userId || '').trim();
    const rawUsername = String(payload.username || '').trim();
    const normalizedUsername = rawUsername.toLowerCase();
    const password = String(payload.password || '');
    const registrationToken = String(payload.registrationToken || '').trim();
    const sanitizedFirstName =
      typeof payload.firstName === 'string' ? payload.firstName.trim() : null;
    const sanitizedLastName =
      typeof payload.lastName === 'string' ? payload.lastName.trim() : null;
    const normalizedEmail =
      typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : null;
    const sanitizedPhone =
      typeof payload.phone === 'string' ? payload.phone.trim() : null;

    if (!userId || !normalizedUsername || !password || !registrationToken) {
      return jsonResponse(400, origin, { error: 'Missing required fields' });
    }

    if (!USERNAME_PATTERN.test(normalizedUsername)) {
      return jsonResponse(400, origin, {
        error:
          'Username must be at least 3 characters and use only letters, numbers, hyphens, or underscores.',
      });
    }

    if (password.length < MIN_PASSWORD_LENGTH) {
      return jsonResponse(400, origin, {
        error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters long.`,
      });
    }

    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('id, registration_token, registration_token_expires_at, username')
      .eq('id', userId)
      .maybeSingle();

    if (profileError && profileError.code !== 'PGRST116') {
      throw profileError;
    }

    if (!profile) {
      return jsonResponse(404, origin, { error: 'Profile not found for this user' });
    }

    if (!profile.registration_token) {
      return jsonResponse(409, origin, {
        error: 'Registration has already been finalized or the token is missing.',
      });
    }

    const hashedProvidedToken = await hashToken(registrationToken);
    if (hashedProvidedToken !== profile.registration_token) {
      return jsonResponse(403, origin, { error: 'Invalid registration token.' });
    }

    if (profile.registration_token_expires_at) {
      const expiresAt = new Date(profile.registration_token_expires_at);
      if (Number.isFinite(expiresAt.getTime()) && Date.now() > expiresAt.getTime()) {
        return jsonResponse(410, origin, {
          error: 'Registration token has expired. Restart the registration process.',
        });
      }
    }

    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      password,
      user_metadata: {
        username: normalizedUsername,
        first_name: sanitizedFirstName,
        last_name: sanitizedLastName,
        phone: sanitizedPhone,
      },
    });

    if (updateError) {
      throw updateError;
    }

    const fullName = [sanitizedFirstName, sanitizedLastName]
      .filter(Boolean)
      .join(' ')
      .trim();

    const { error: profileUpsertError } = await supabaseAdmin
      .from('profiles')
      .upsert(
        {
          id: userId,
          username: normalizedUsername,
          full_name: fullName || null,
          first_name: sanitizedFirstName || null,
          last_name: sanitizedLastName || null,
          phone: sanitizedPhone || null,
          email: normalizedEmail || null,
          registration_token: null,
          registration_token_expires_at: null,
        },
        { onConflict: 'id' },
      );

    if (profileUpsertError) {
      throw profileUpsertError;
    }

    await supabaseAdmin.rpc('refresh_profile_subscription_status', {
      p_user_id: userId,
    });

    return jsonResponse(200, origin, { success: true });
  } catch (error) {
    console.error('[finalize-registration] Error:', error);
    return jsonResponse(500, origin, {
      error: error.message || 'Unknown error occurred',
      details: error.toString(),
    });
  }
});
