import { serve } from 'https://deno.land/std@0.223.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

const BULK_EMAIL_DOMAIN = 'bulk.academicnightingale.com';
const MAX_BULK_QUANTITY = 500;

const MAX_CREDENTIAL_LENGTH = 10;
const LOWERCASE_LETTERS = 'abcdefghijklmnopqrstuvwxyz';
const UPPERCASE_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const NUMERIC_DIGITS = '0123456789';

interface GenerateRequestBody {
  planId: string;
  departmentId?: string | null;
  quantity: number;
  expiresAt?: string | null;
  usernamePrefix?: string | null;
}

interface CreatedAccountRecord {
  userId: string;
  subscriptionId?: string | null;
}

function normalisePrefix(value?: string | null): string {
  if (!value) return 'learner';
  return (
    value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]/g, '')
      .slice(0, MAX_CREDENTIAL_LENGTH - 2) || 'learner'
  );
}

function randomInt(min: number, max: number): number {
  const buffer = new Uint32Array(1);
  crypto.getRandomValues(buffer);
  const span = max - min + 1;
  return min + (buffer[0] % span);
}

function randomCharacters(source: string, length: number): string {
  if (length <= 0) return '';
  const buffer = new Uint32Array(length);
  crypto.getRandomValues(buffer);
  let result = '';
  for (let i = 0; i < length; i += 1) {
    result += source[buffer[i] % source.length];
  }
  return result;
}

function shuffleCharacters(value: string): string {
  const characters = value.split('');
  for (let i = characters.length - 1; i > 0; i -= 1) {
    const j = randomInt(0, i);
    const temp = characters[i];
    characters[i] = characters[j];
    characters[j] = temp;
  }
  return characters.join('');
}

function randomAlphaNumericString(
  length: number,
  {
    lowercaseOnly = false,
    ensureLetter = false,
    ensureDigit = false,
  }: {
    lowercaseOnly?: boolean;
    ensureLetter?: boolean;
    ensureDigit?: boolean;
  } = {}
): string {
  if (length <= 0) return '';
  const requiredCharacters = (ensureLetter ? 1 : 0) + (ensureDigit ? 1 : 0);
  if (requiredCharacters > length) {
    throw new Error(
      'Cannot satisfy alphanumeric requirements with the allotted length.'
    );
  }
  const lettersPool = lowercaseOnly
    ? LOWERCASE_LETTERS
    : LOWERCASE_LETTERS + UPPERCASE_LETTERS;
  const combinedPool = lettersPool + NUMERIC_DIGITS;
  if (!combinedPool.length) {
    throw new Error('No characters available to generate credentials.');
  }

  const pieces: string[] = [];
  if (ensureLetter) {
    pieces.push(randomCharacters(lettersPool, 1));
  }
  if (ensureDigit) {
    pieces.push(randomCharacters(NUMERIC_DIGITS, 1));
  }
  while (pieces.join('').length < length) {
    pieces.push(randomCharacters(combinedPool, 1));
  }

  const initial = pieces.join('').slice(0, length);
  return shuffleCharacters(initial);
}

function ensureLetterPresence(value: string, lettersPool: string): string {
  if (/[a-z]/i.test(value)) return value;
  const pool = lettersPool || LOWERCASE_LETTERS + UPPERCASE_LETTERS;
  const index = value.length > 0 ? randomInt(0, value.length - 1) : 0;
  const replacement = randomCharacters(pool, 1);
  return value.slice(0, index) + replacement + value.slice(index + 1);
}

function ensureDigitPresence(value: string): string {
  if (/[0-9]/.test(value)) return value;
  const index = value.length > 0 ? randomInt(0, value.length - 1) : 0;
  const replacement = randomCharacters(NUMERIC_DIGITS, 1);
  return value.slice(0, index) + replacement + value.slice(index + 1);
}

function generatePassword(): string {
  let password = randomAlphaNumericString(MAX_CREDENTIAL_LENGTH, {
    lowercaseOnly: false,
    ensureLetter: true,
    ensureDigit: true,
  });
  password = ensureLetterPresence(
    password,
    LOWERCASE_LETTERS + UPPERCASE_LETTERS
  );
  password = ensureDigitPresence(password);
  return password;
}

async function generateUniqueUsername(
  supabaseAdmin: ReturnType<typeof createClient>,
  base: string,
  attempt = 0
): Promise<string> {
  const fallbackBase = 'learner';
  const sanitisedBase = base.replace(/[^a-z0-9]/gi, '').toLowerCase();
  let prefixSource = sanitisedBase || fallbackBase;

  if (!/[a-z]/.test(prefixSource)) {
    const lettersOnly = sanitisedBase.replace(/[^a-z]/g, '');
    prefixSource = lettersOnly || fallbackBase;
  }

  const maxPrefixLength = Math.max(1, MAX_CREDENTIAL_LENGTH - 3);
  let prefix = prefixSource.slice(0, maxPrefixLength);
  if (!prefix) {
    prefix = fallbackBase.slice(0, maxPrefixLength);
  }

  let candidate: string;

  if (attempt >= 25) {
    candidate = randomAlphaNumericString(MAX_CREDENTIAL_LENGTH, {
      lowercaseOnly: true,
      ensureLetter: true,
      ensureDigit: true,
    }).toLowerCase();
  } else {
    const suffixLength = MAX_CREDENTIAL_LENGTH - prefix.length;
    const suffix = randomAlphaNumericString(suffixLength, {
      lowercaseOnly: true,
      ensureLetter: prefix.length === 0,
      ensureDigit: true,
    }).toLowerCase();
    candidate = (prefix + suffix).slice(0, MAX_CREDENTIAL_LENGTH);
  }

  candidate = candidate.replace(/[^a-z0-9]/g, '').toLowerCase();
  candidate = ensureLetterPresence(candidate, LOWERCASE_LETTERS).toLowerCase();
  candidate = ensureDigitPresence(candidate);
  candidate = candidate.toLowerCase();

  if (candidate.length < 2) {
    candidate = randomAlphaNumericString(MAX_CREDENTIAL_LENGTH, {
      lowercaseOnly: true,
      ensureLetter: true,
      ensureDigit: true,
    }).toLowerCase();
    candidate = ensureLetterPresence(
      candidate,
      LOWERCASE_LETTERS
    ).toLowerCase();
    candidate = ensureDigitPresence(candidate);
    candidate = candidate.toLowerCase();
  }

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

  const durationDays = Number(
    plan?.duration_days ?? plan?.metadata?.duration_days
  );
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
    const rawDepartmentId =
      typeof body.departmentId === 'string'
        ? body.departmentId.trim()
        : (body.departmentId ?? '');
    const requestedDepartmentId = rawDepartmentId || null;
    const normalisedDepartmentId =
      requestedDepartmentId &&
      requestedDepartmentId.toLowerCase() !== 'null' &&
      requestedDepartmentId.toLowerCase() !== 'undefined'
        ? requestedDepartmentId
        : null;
    const customPrefix =
      typeof body.usernamePrefix === 'string'
        ? normalisePrefix(body.usernamePrefix)
        : null;

    if (!planId) {
      return new Response(JSON.stringify({ error: 'planId is required.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!Number.isInteger(quantity) || quantity <= 0) {
      return new Response(
        JSON.stringify({ error: 'quantity must be a positive integer.' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    if (quantity > MAX_BULK_QUANTITY) {
      return new Response(
        JSON.stringify({
          error: `Quantity exceeds limit. Generate up to ${MAX_BULK_QUANTITY} accounts at a time.`,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceKey);

    const { data: plan, error: planError } = await supabaseAdmin
      .from('subscription_plans')
      .select(
        `id, code, name, price, currency, duration_days, metadata,
         product:subscription_products!inner(id, department_id)`
      )
      .eq('id', planId)
      .maybeSingle();

    if (planError) throw planError;
    if (!plan) {
      return new Response(JSON.stringify({ error: 'Plan not found.' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const inheritedDepartmentId =
      (plan as any).department_id ?? plan.product?.department_id ?? null;

    if (
      normalisedDepartmentId &&
      inheritedDepartmentId &&
      inheritedDepartmentId !== normalisedDepartmentId
    ) {
      return new Response(
        JSON.stringify({
          error: 'Selected plan does not belong to the chosen department.',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const departmentId =
      normalisedDepartmentId || inheritedDepartmentId || null;
    let usernameBase = customPrefix || normalisePrefix(plan.code || plan.name);
    let departmentName: string | null = null;

    if (departmentId) {
      const { data: department, error: deptError } = await supabaseAdmin
        .from('departments')
        .select('id, slug, name')
        .eq('id', departmentId)
        .maybeSingle();
      if (deptError) throw deptError;
      if (department) {
        departmentName = department.name || null;
        if (!customPrefix) {
          usernameBase = normalisePrefix(department.slug || department.name);
        }
      }
    }

    if (!usernameBase) {
      usernameBase = 'learner';
    }

    const expiresAt = resolveExpiry(plan, body.expiresAt);
    const createdAccounts: CreatedAccountRecord[] = [];
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
        const username = await generateUniqueUsername(
          supabaseAdmin,
          usernameBase
        );
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
        const accountRecord: CreatedAccountRecord = { userId };
        createdAccounts.push(accountRecord);

        const profilePayload: Record<string, unknown> = {
          id: userId,
          email,
          username,
          role: 'learner',
        };

        if (departmentId) {
          profilePayload.department_id = departmentId;
        }

        const { error: profileError } = await supabaseAdmin
          .from('profiles')
          .upsert(profilePayload, { onConflict: 'id' });

        if (profileError) throw profileError;

        const nowIso = new Date().toISOString();
        const subscriptionPayload = {
          id: crypto.randomUUID(),
          user_id: userId,
          plan_id: planId,
          status: 'active',
          started_at: nowIso,
          expires_at: expiresAt,
          price: plan.price ?? 0,
          currency: plan.currency || 'NGN',
          purchased_at: nowIso,
          quantity: 1,
        };

        const { error: subscriptionError } = await supabaseAdmin
          .from('user_subscriptions')
          .insert(subscriptionPayload);

        if (subscriptionError) throw subscriptionError;

        accountRecord.subscriptionId = subscriptionPayload.id;

        const { error: defaultSubscriptionError } = await supabaseAdmin
          .from('profiles')
          .update({
            default_subscription_id: subscriptionPayload.id,
            updated_at: nowIso,
          })
          .eq('id', userId);

        if (defaultSubscriptionError) throw defaultSubscriptionError;

        await supabaseAdmin.rpc('refresh_profile_subscription_status', {
          p_user_id: userId,
        });

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
      console.error(
        '[generate-bulk-accounts] Generation failed, rolling back',
        generationError
      );
      for (const account of createdAccounts.reverse()) {
        try {
          if (account.subscriptionId) {
            const { error: subscriptionCleanupError } = await supabaseAdmin
              .from('user_subscriptions')
              .delete()
              .eq('id', account.subscriptionId);
            if (subscriptionCleanupError) {
              throw subscriptionCleanupError;
            }
          } else {
            const { error: genericSubscriptionCleanupError } =
              await supabaseAdmin
                .from('user_subscriptions')
                .delete()
                .eq('user_id', account.userId);
            if (genericSubscriptionCleanupError) {
              throw genericSubscriptionCleanupError;
            }
          }
        } catch (cleanupError) {
          console.error(
            '[generate-bulk-accounts] Failed to cleanup subscription',
            {
              userId: account.userId,
              cleanupError,
            }
          );
        }

        try {
          const { error: profileCleanupError } = await supabaseAdmin
            .from('profiles')
            .delete()
            .eq('id', account.userId);
          if (profileCleanupError) {
            throw profileCleanupError;
          }
        } catch (cleanupError) {
          console.error('[generate-bulk-accounts] Failed to cleanup profile', {
            userId: account.userId,
            cleanupError,
          });
        }

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
      }
    );
  }
});
