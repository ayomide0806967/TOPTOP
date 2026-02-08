import { serve } from 'https://deno.land/std@0.223.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ALLOWED_ORIGINS = (Deno.env.get('REGISTRATION_ALLOWED_ORIGINS') || '')
  .split(',')
  .map((entry) => entry.trim())
  .filter(Boolean);

const BASE_CORS_HEADERS = {
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  Vary: 'Origin',
} as const;

const USERNAME_PATTERN = /^[a-z0-9_-]{3,}$/;
const MIN_PASSWORD_LENGTH = 8;
const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

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
  payload: Record<string, unknown>
): Response {
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

function generateRegistrationToken(): string {
  return `${crypto.randomUUID()}${crypto.randomUUID()}`.replace(/-/g, '');
}

async function hashToken(token: string): Promise<string> {
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

  // Manual registration is deprecated. New learners must use Google or WhatsApp.
  if (req.method === 'POST') {
    return jsonResponse(410, origin, {
      error:
        'Manual registration is disabled. Please use Google sign-in or WhatsApp OTP.',
    });
  }

  return jsonResponse(405, origin, { error: 'Method Not Allowed' });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !serviceKey) {
      throw new Error(
        'Missing environment variables: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY'
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceKey);

    const body = await req.json();
    const { email, firstName, lastName, phone, username, password, planId } =
      body ?? {};

    const normalizedEmail = String(email || '')
      .trim()
      .toLowerCase();
    const sanitizedFirstName = String(firstName || '').trim();
    const sanitizedLastName = String(lastName || '').trim();
    const sanitizedPhone = typeof phone === 'string' ? phone.trim() : '';
    const normalizedPhone = sanitizedPhone || null;
    const normalizedUsername = String(username || '')
      .trim()
      .toLowerCase();
    const normalizedPlanId = typeof planId === 'string' ? planId.trim() : '';
    const rawPassword = String(password || '');

    if (!normalizedEmail || !sanitizedFirstName || !sanitizedLastName) {
      return jsonResponse(400, origin, { error: 'Missing required fields' });
    }

    if (!normalizedUsername || !USERNAME_PATTERN.test(normalizedUsername)) {
      return jsonResponse(400, origin, {
        error:
          'Invalid username supplied. Refresh the page to receive a new username and try again.',
      });
    }

    if (rawPassword.length < MIN_PASSWORD_LENGTH) {
      return jsonResponse(400, origin, {
        error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters long.`,
      });
    }

    const ACTIVE_STATUSES = new Set(['active', 'trialing']);

    const { data: existingProfile, error: profileLookupError } =
      await supabaseAdmin
        .from('profiles')
        .select('id, subscription_status')
        .eq('email', normalizedEmail)
        .maybeSingle();

    if (profileLookupError && profileLookupError.code !== 'PGRST116') {
      throw profileLookupError;
    }

    if (
      existingProfile &&
      ACTIVE_STATUSES.has(existingProfile.subscription_status || '')
    ) {
      return jsonResponse(409, origin, {
        error:
          'An active subscription already exists for this email. Please sign in instead.',
      });
    }

    if (normalizedPhone) {
      const { data: phoneOwner, error: phoneLookupError } = await supabaseAdmin
        .from('profiles')
        .select('id, subscription_status')
        .eq('phone', normalizedPhone)
        .maybeSingle();

      if (phoneLookupError && phoneLookupError.code !== 'PGRST116') {
        throw phoneLookupError;
      }

      if (
        phoneOwner &&
        phoneOwner.id !== existingProfile?.id &&
        ACTIVE_STATUSES.has(phoneOwner.subscription_status || '')
      ) {
        return jsonResponse(409, origin, {
          error:
            'This phone number is already registered to another active account. Use a different number or contact support.',
        });
      }
    }

    const { data: usernameOwner, error: usernameLookupError } =
      await supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('username', normalizedUsername)
        .maybeSingle();

    if (usernameLookupError && usernameLookupError.code !== 'PGRST116') {
      throw usernameLookupError;
    }

    if (usernameOwner && usernameOwner.id !== existingProfile?.id) {
      return jsonResponse(409, origin, {
        error:
          'This username is already taken. Refresh to receive a new username and try again.',
      });
    }

    const { data: userList, error: fetchUserError } =
      await supabaseAdmin.auth.admin.listUsers({
        page: 1,
        perPage: 200,
        filter: `email.eq.${normalizedEmail}`,
      });

    if (fetchUserError) {
      throw fetchUserError;
    }

    const authUser = userList?.users?.find(
      (user) => user.email?.toLowerCase() === normalizedEmail
    );

    if (authUser) {
      return jsonResponse(409, origin, {
        error:
          'An account already exists for this email. Please sign in instead.',
      });
    }

    const { data: newUser, error: createError } =
      await supabaseAdmin.auth.admin.createUser({
        email: normalizedEmail,
        email_confirm: true,
        password: rawPassword,
        user_metadata: {
          first_name: sanitizedFirstName,
          last_name: sanitizedLastName,
          phone: normalizedPhone,
          username: normalizedUsername,
        },
      });

    if (createError) {
      throw createError;
    }

    const userId = newUser?.user?.id;
    if (!userId) {
      throw new Error('Failed to create auth user');
    }

    const registrationToken = generateRegistrationToken();
    const hashedToken = await hashToken(registrationToken);
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MS).toISOString();

    let planSnapshot: Record<string, unknown> | null = null;

    if (normalizedPlanId) {
      const { data: planRecord, error: planError } = await supabaseAdmin
        .from('subscription_plans')
        .select(
          `
            id,
            code,
            name,
            price,
            currency,
            questions,
            quizzes,
            participants,
            daily_question_limit,
            duration_days,
            product:subscription_products!subscription_plans_product_id_fkey(
              id,
              code,
              name,
              department_id,
              department:departments(id, name, slug)
            )
          `
        )
        .eq('id', normalizedPlanId)
        .maybeSingle();

      if (planError && planError.code !== 'PGRST116') {
        throw planError;
      }

      if (planRecord) {
        planSnapshot = {
          id: planRecord.id,
          code: planRecord.code,
          name: planRecord.name,
          price: planRecord.price,
          currency: planRecord.currency,
          questions: planRecord.questions,
          quizzes: planRecord.quizzes,
          participants: planRecord.participants,
          daily_question_limit: planRecord.daily_question_limit,
          duration_days: planRecord.duration_days,
          product: planRecord.product
            ? {
                id: planRecord.product.id,
                code: planRecord.product.code,
                name: planRecord.product.name,
                department_id: planRecord.product.department_id,
                department: planRecord.product.department
                  ? {
                      id: planRecord.product.department.id,
                      name: planRecord.product.department.name,
                      slug: planRecord.product.department.slug,
                    }
                  : null,
              }
            : null,
        };
      }
    }

    const { error: profileError } = await supabaseAdmin.from('profiles').upsert(
      {
        id: userId,
        email: normalizedEmail,
        first_name: sanitizedFirstName,
        last_name: sanitizedLastName,
        phone: normalizedPhone,
        username: normalizedUsername,
        full_name: `${sanitizedFirstName} ${sanitizedLastName}`.trim() || null,
        subscription_status: 'pending_payment',
        registration_token: hashedToken,
        registration_token_expires_at: expiresAt,
        registration_stage: 'awaiting_payment',
        pending_plan_id: normalizedPlanId || null,
        pending_plan_snapshot: planSnapshot,
        pending_plan_selected_at: new Date().toISOString(),
        pending_plan_expires_at: new Date(
          Date.now() + 72 * 60 * 60 * 1000
        ).toISOString(),
      },
      { onConflict: 'id' }
    );

    if (profileError) {
      throw profileError;
    }

    return jsonResponse(200, origin, {
      userId,
      username: normalizedUsername,
      registrationToken,
      registrationStage: 'awaiting_payment',
      pendingPlanId: normalizedPlanId || null,
      pendingPlanSnapshot: planSnapshot,
    });
  } catch (error) {
    console.error('[create-pending-user] Error:', error);
    return jsonResponse(500, origin, {
      error: error.message || 'Unknown error occurred',
      details: error.toString(),
    });
  }
});
