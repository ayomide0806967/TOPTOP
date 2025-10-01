import { serve } from 'https://deno.land/std@0.223.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BULK_EMAIL_DOMAIN = 'bulk.academicnightingale.com';
const MAX_BULK_QUANTITY = 500;

interface GenerateRequestBody {
  planId: string;
  departmentId?: string | null;
  quantity: number;
  expiresAt?: string | null;
  usernamePrefix?: string | null;
}

function normalisePrefix(value?: string | null): string {
  if (!value) return 'learner';
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 12) || 'learner';
}

function generatePassword(): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnopqrstuvwxyz';
  const digits = '23456789';
  const symbols = '!@#$%';
  const all = upper + lower + digits + symbols;

  const pick = (set: string) => set[Math.floor(Math.random() * set.length)];

  let password = [pick(upper), pick(lower), pick(digits), pick(symbols)];
  for (let i = 0; i < 8; i += 1) {
    password.push(pick(all));
  }

  // Shuffle using Fisher-Yates
  for (let i = password.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [password[i], password[j]] = [password[j], password[i]];
  }

  return password.join('');
}

async function generateUniqueUsername(
  supabaseAdmin: ReturnType<typeof createClient>,
  base: string,
  attempt = 0,
): Promise<string> {
  const suffix = attempt === 0 ? '' : `-${attempt}`;
  const candidate = `${base}-${crypto.randomUUID().slice(0, 6)}${suffix}`
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30);

  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('username', candidate)
    .maybeSingle();

  if (error && error.code !== 'PGRST116') {
    throw error;
  }

  if (data) {
    return generateUniqueUsername(supabaseAdmin, base, attempt + 1);
  }

  return candidate;
}

function resolveExpiry(plan: any, override?: string | null): string | null {
  if (override) {
    const overridesDate = new Date(override);
    if (!Number.isNaN(overridesDate.getTime())) {
      return overridesDate.toISOString();
    }
  }

  const durationDays = Number(plan?.duration_days ?? plan?.metadata?.duration_days);
  if (Number.isFinite(durationDays) && durationDays > 0) {
    const expires = new Date();
    expires.setUTCDate(expires.getUTCDate() + durationDays);
    return expires.toISOString();
  }

  return null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !serviceKey) {
      throw new Error('Missing service configuration for Supabase.');
    }

    const body = (await req.json()) as GenerateRequestBody;

    const planId = String(body.planId || '').trim();
    const quantity = Number(body.quantity ?? 0);

    if (!planId) {
      return new Response(JSON.stringify({ error: 'planId is required.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!Number.isInteger(quantity) || quantity <= 0) {
      return new Response(JSON.stringify({ error: 'quantity must be a positive integer.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (quantity > MAX_BULK_QUANTITY) {
      return new Response(
        JSON.stringify({
          error: `Quantity exceeds limit. Generate up to ${MAX_BULK_QUANTITY} accounts at a time.`,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceKey);

    const { data: plan, error: planError } = await supabaseAdmin
      .from('subscription_plans')
      .select('id, name, price, currency, duration_days, metadata, department_id')
      .eq('id', planId)
      .maybeSingle();

    if (planError) throw planError;
    if (!plan) {
      return new Response(JSON.stringify({ error: 'Plan not found.' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const departmentId = body.departmentId || plan.department_id || null;
    let departmentSlug = normalisePrefix(body.usernamePrefix || undefined);
    let departmentName: string | null = null;

    if (departmentId) {
      const { data: department, error: deptError } = await supabaseAdmin
        .from('departments')
        .select('id, slug, name')
        .eq('id', departmentId)
        .maybeSingle();
      if (deptError) throw deptError;
      if (department) {
        departmentSlug = normalisePrefix(department.slug || department.name);
        departmentName = department.name || null;
      }
    }

    const expiresAt = resolveExpiry(plan, body.expiresAt);
    const createdAccounts: Array<{ userId: string }> = [];
    const results: Array<{
      username: string;
      password: string;
      email: string;
      expiresAt: string | null;
      departmentName: string | null;
      planName: string;
    }> = [];

    try {
      for (let i = 0; i < quantity; i += 1) {
        const username = await generateUniqueUsername(supabaseAdmin, departmentSlug);
        const password = generatePassword();
        const email = `${username}@${BULK_EMAIL_DOMAIN}`;

        const { data: newUser, error: createError } =
          await supabaseAdmin.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            user_metadata: {
              username,
              bulk_generated: true,
              source_plan: planId,
            },
          });

        if (createError) throw createError;
        if (!newUser?.user) {
          throw new Error('Auth user creation did not return a user record.');
        }

        const userId = newUser.user.id;
        createdAccounts.push({ userId });

        const profilePayload: Record<string, unknown> = {
          id: userId,
          email,
          username,
          subscription_status: 'active',
          role: 'learner',
        };

        if (departmentId) {
          profilePayload.department_id = departmentId;
        }

        const { error: profileError } = await supabaseAdmin
          .from('profiles')
          .upsert(profilePayload, { onConflict: 'id' });

        if (profileError) throw profileError;

        const subscriptionPayload = {
          id: crypto.randomUUID(),
          user_id: userId,
          plan_id: planId,
          status: 'active',
          started_at: new Date().toISOString(),
          expires_at: expiresAt,
          price: plan.price ?? 0,
          currency: plan.currency || 'NGN',
        };

        const { error: subscriptionError } = await supabaseAdmin
          .from('user_subscriptions')
          .insert(subscriptionPayload);

        if (subscriptionError) throw subscriptionError;

        results.push({
          username,
          password,
          email,
          expiresAt,
          departmentName,
          planName: plan.name,
        });
      }
    } catch (generationError) {
      console.error('[generate-bulk-accounts] Generation failed, rolling back', generationError);
      for (const account of createdAccounts) {
        try {
          await supabaseAdmin.auth.admin.deleteUser(account.userId);
        } catch (cleanupError) {
          console.error('[generate-bulk-accounts] Failed to cleanup user', {
            userId: account.userId,
            cleanupError,
          });
        }
      }
      throw generationError;
    }

    return new Response(JSON.stringify({ accounts: results }), {
      status: 201,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[generate-bulk-accounts] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Unexpected error occurred.' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  }
});
