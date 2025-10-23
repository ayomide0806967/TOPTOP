import { serve } from 'https://deno.land/std@0.223.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

interface UpdateRequestBody {
  userId: string;
  email?: string | null;
  username?: string | null;
  password?: string | null;
  departmentId?: string | null;
  planId?: string | null;
  planExpiresAt?: string | null;
  fullName?: string | null;
}

function normaliseUsername(value?: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return null;
  if (!/^[a-z0-9_-]{3,}$/.test(trimmed)) {
    throw new Error(
      'Username must be at least 3 characters and contain only letters, numbers, hyphens, or underscores.'
    );
  }
  return trimmed;
}

function resolvePlanExpiry(plan: any, override?: string | null): string | null {
  if (override) {
    const parsed = new Date(override);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
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

    const body = (await req.json()) as UpdateRequestBody;
    const userId = String(body.userId || '').trim();

    if (!userId) {
      return new Response(JSON.stringify({ error: 'userId is required.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceKey);

    const updates: {
      email?: string;
      password?: string;
      user_metadata?: Record<string, unknown>;
    } = {};

    if (body.email) {
      const email = String(body.email).trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        return new Response(
          JSON.stringify({ error: 'Invalid email address.' }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }
      updates.email = email;
    }

    let normalizedUsername: string | null = null;
    try {
      normalizedUsername = normaliseUsername(body.username);
    } catch (validationError) {
      return new Response(
        JSON.stringify({ error: (validationError as Error).message }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    if (normalizedUsername) {
      updates.user_metadata = {
        ...(updates.user_metadata || {}),
        username: normalizedUsername,
      };
    }

    if (body.password) {
      const password = String(body.password);
      if (password.length < 8) {
        return new Response(
          JSON.stringify({
            error: 'Password must be at least 8 characters long.',
          }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }
      updates.password = password;
    }

    if (Object.keys(updates).length > 0) {
      const { error: updateError } =
        await supabaseAdmin.auth.admin.updateUserById(userId, updates);
      if (updateError) throw updateError;
    }

    // Ensure username uniqueness if provided
    if (normalizedUsername) {
      const { data: existing, error: usernameError } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('username', normalizedUsername)
        .neq('id', userId)
        .maybeSingle();

      if (usernameError && usernameError.code !== 'PGRST116') {
        throw usernameError;
      }
      if (existing) {
        return new Response(
          JSON.stringify({
            error: 'This username is already in use by another account.',
          }),
          {
            status: 409,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }
    }

    const profilePayload: Record<string, unknown> = {};
    if (updates.email) {
      profilePayload.email = updates.email;
    }
    if (normalizedUsername) {
      profilePayload.username = normalizedUsername;
    }
    if (body.departmentId !== undefined) {
      profilePayload.department_id = body.departmentId || null;
    }

    if (body.fullName !== undefined) {
      profilePayload.full_name = body.fullName || null;
    }

    if (Object.keys(profilePayload).length > 0) {
      profilePayload.id = userId;
      const { error: profileError } = await supabaseAdmin
        .from('profiles')
        .upsert(profilePayload, { onConflict: 'id' });
      if (profileError) throw profileError;
    }

    let planResult: unknown = null;
    if (body.planId) {
      const planId = body.planId;
      const { data: plan, error: planError } = await supabaseAdmin
        .from('subscription_plans')
        .select('id, name, price, currency, duration_days, metadata')
        .eq('id', planId)
        .maybeSingle();
      if (planError) throw planError;
      if (!plan) {
        return new Response(
          JSON.stringify({ error: 'Selected plan not found.' }),
          {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      // Cancel existing active subscriptions
      const { data: activeSubscriptions, error: activeError } =
        await supabaseAdmin
          .from('user_subscriptions')
          .select('id, plan_id')
          .eq('user_id', userId)
          .eq('status', 'active');
      if (activeError) throw activeError;

      if (Array.isArray(activeSubscriptions) && activeSubscriptions.length) {
        const activePlanIds = activeSubscriptions
          .map((sub) => sub.plan_id)
          .filter((value): value is string => Boolean(value));

        if (activePlanIds.length) {
          // Ensure legacy canceled rows do not block the status update unique constraint
          const { error: cleanupError } = await supabaseAdmin
            .from('user_subscriptions')
            .delete()
            .eq('user_id', userId)
            .eq('status', 'canceled')
            .in('plan_id', activePlanIds);
          if (cleanupError) throw cleanupError;
        }

        const { error: cancelError } = await supabaseAdmin
          .from('user_subscriptions')
          .update({ status: 'canceled', canceled_at: new Date().toISOString() })
          .in(
            'id',
            activeSubscriptions.map((sub) => sub.id)
          );
        if (cancelError) throw cancelError;
      }

      const expiresAt = resolvePlanExpiry(plan, body.planExpiresAt);
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

      const { data: createdSubscription, error: subscriptionError } =
        await supabaseAdmin
          .from('user_subscriptions')
          .insert(subscriptionPayload)
          .select('*, subscription_plans(name)')
          .single();
      if (subscriptionError) throw subscriptionError;
      planResult = createdSubscription;

      const { error: defaultUpdateError } = await supabaseAdmin
        .from('profiles')
        .update({
          default_subscription_id: createdSubscription.id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', userId);
      if (defaultUpdateError) throw defaultUpdateError;

      await supabaseAdmin.rpc('refresh_profile_subscription_status', {
        p_user_id: userId,
      });
    } else if (body.planExpiresAt) {
      const overrideDate = new Date(body.planExpiresAt);
      if (Number.isNaN(overrideDate.getTime())) {
        return new Response(
          JSON.stringify({ error: 'Invalid plan expiry date provided.' }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      const overrideIso = overrideDate.toISOString();

      const { data: activeSubscriptions, error: activeFetchError } =
        await supabaseAdmin
          .from('user_subscriptions')
          .select('id')
          .eq('user_id', userId)
          .eq('status', 'active');

      if (activeFetchError) throw activeFetchError;

      if (
        !Array.isArray(activeSubscriptions) ||
        activeSubscriptions.length === 0
      ) {
        return new Response(
          JSON.stringify({
            error: 'No active subscription to update. Assign a plan first.',
          }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      const activeIds = activeSubscriptions.map((sub) => sub.id);

      const { error: expiryUpdateError } = await supabaseAdmin
        .from('user_subscriptions')
        .update({ expires_at: overrideIso })
        .in('id', activeIds);

      if (expiryUpdateError) throw expiryUpdateError;

      await supabaseAdmin.rpc('refresh_profile_subscription_status', {
        p_user_id: userId,
      });
    }

    const { data: profile, error: profileFetchError } = await supabaseAdmin
      .from('profiles')
      .select(
        `
        *,
        departments (name),
        user_subscriptions!user_subscriptions_user_id_fkey (
          id,
          status,
          started_at,
          expires_at,
          purchased_at,
          quantity,
          renewed_from_subscription_id,
          subscription_plans (
            id,
            name,
            code,
            price,
            currency,
            daily_question_limit,
            duration_days,
            plan_tier
          )
        )
      `
      )
      .eq('id', userId)
      .maybeSingle();

    if (profileFetchError) throw profileFetchError;

    return new Response(
      JSON.stringify({
        success: true,
        profile,
        subscription: planResult,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('[admin-update-user] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Unexpected error occurred.' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
