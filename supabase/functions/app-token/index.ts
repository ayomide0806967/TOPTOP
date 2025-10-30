import { serve } from 'https://deno.land/std@0.223.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.1';

const SUPABASE_URL =
  Deno.env.get('APP_SUPABASE_URL') ?? Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY =
  Deno.env.get('APP_SUPABASE_ANON_KEY') ??
  Deno.env.get('SUPABASE_ANON_KEY') ??
  '';
const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get('APP_SUPABASE_SERVICE_ROLE_KEY') ??
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ??
  '';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Supabase credentials missing for app-token function');
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '')
    .slice(0, 40);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
      global: { headers: authHeader ? { Authorization: authHeader } : {} },
    });
    const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    // Verify Supabase session
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData?.user) {
      return new Response(
        JSON.stringify({ message: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const sbUser = userData.user;
    const email = (sbUser.email || '').toLowerCase();
    const firstName = sbUser.user_metadata?.given_name || sbUser.user_metadata?.name?.split(' ')[0] || '';
    const lastName = sbUser.user_metadata?.family_name || (sbUser.user_metadata?.name?.split(' ').slice(1).join(' ') || '');

    // Find existing app user
    const { data: existing, error: findErr } = await serviceClient
      .from('users')
      .select('id, email, first_name, last_name, role, tenant_id')
      .eq('email', email)
      .maybeSingle();
    if (findErr) {
      return new Response(
        JSON.stringify({ message: 'Failed to query user' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let appUser = existing;

    // Create tenant if needed
    async function ensureTenantFor(emailAddr: string) {
      const local = emailAddr.split('@')[0];
      let slug = slugify(`${local}-workspace`);
      // Ensure unique slug by appending random suffix if needed
      const suffix = Math.random().toString(36).slice(2, 6);
      const { data: t, error: terr } = await serviceClient
        .from('tenants')
        .insert({ name: `${local} Workspace`, slug: `${slug}-${suffix}`, is_active: true })
        .select('id')
        .single();
      if (terr || !t) throw terr || new Error('Tenant creation failed');
      return t.id as string;
    }

    // Create or update user
    if (!appUser) {
      const tenantId = await ensureTenantFor(email);
      const { data: created, error: createErr } = await serviceClient
        .from('users')
        .insert({
          email,
          first_name: firstName || email.split('@')[0],
          last_name: lastName || '',
          role: 'instructor',
          is_active: true,
          email_verified: true,
          tenant_id: tenantId,
        })
        .select('id, email, first_name, last_name, role, tenant_id')
        .single();
      if (createErr || !created) {
        return new Response(
          JSON.stringify({ message: 'Failed to create user' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      appUser = created;
    } else if (!appUser.tenant_id) {
      const tenantId = await ensureTenantFor(email);
      const { data: updated, error: updateErr } = await serviceClient
        .from('users')
        .update({ tenant_id: tenantId })
        .eq('id', appUser.id)
        .select('id, email, first_name, last_name, role, tenant_id')
        .single();
      if (updateErr || !updated) {
        return new Response(
          JSON.stringify({ message: 'Failed to assign tenant' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      appUser = updated;
    }

    // Build app token (base64 JSON as used elsewhere)
    const exp = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60; // 7 days
    const payload = {
      userId: appUser.id,
      tenantId: appUser.tenant_id,
      role: appUser.role,
      exp,
    };
    const token = btoa(JSON.stringify(payload));

    return new Response(
      JSON.stringify({
        token,
        user: {
          id: appUser.id,
          email: appUser.email,
          first_name: appUser.first_name,
          last_name: appUser.last_name,
          role: appUser.role,
          tenant: { id: appUser.tenant_id },
        },
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[app-token] unexpected error', error);
    return new Response(
      JSON.stringify({ message: 'Server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

