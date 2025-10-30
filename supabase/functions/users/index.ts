import { serve } from 'https://deno.land/std@0.223.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.1';

const SUPABASE_URL = Deno.env.get('APP_SUPABASE_URL') ?? Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('APP_SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get('APP_SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Supabase credentials missing for users function');
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type TokenPayload = { userId: string; tenantId?: string; role: string; exp: number };

function decodeToken(authHeader: string | null): TokenPayload | null {
  if (!authHeader?.startsWith('Bearer ')) return null;
  try {
    const payload = JSON.parse(atob(authHeader.replace('Bearer ', '')));
    if (payload.exp * 1000 < Date.now()) return null;
    return payload;
  } catch (_error) {
    return null;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const path = url.pathname.replace('/api/users', '');

  const authHeader = req.headers.get('Authorization');
  const token = decodeToken(authHeader);
  if (!token?.userId) {
    return new Response(JSON.stringify({ message: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  try {
    switch (path) {
      case '/tenant': {
        if (req.method !== 'GET') {
          return new Response('Method not allowed', { status: 405, headers: corsHeaders });
        }

        if (!token.tenantId) {
          return new Response(JSON.stringify({ tenant: null }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const { data: tenant, error } = await serviceClient
          .from('tenants')
          .select('id, name, slug, is_active')
          .eq('id', token.tenantId)
          .single();

        if (error) {
          return new Response(JSON.stringify({ message: error.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        return new Response(JSON.stringify({ tenant }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      default:
        return new Response('Not found', { status: 404, headers: corsHeaders });
    }
  } catch (error) {
    console.error('[users] unexpected error', error);
    return new Response(JSON.stringify({ message: 'Server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

