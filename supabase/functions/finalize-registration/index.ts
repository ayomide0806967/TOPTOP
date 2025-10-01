import { serve } from 'https://deno.land/std@0.223.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const USERNAME_PATTERN = /^[a-z0-9_-]{3,}$/;
const MIN_PASSWORD_LENGTH = 8;

serve(async (req) => {
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
    const sanitizedFirstName =
      typeof payload.firstName === 'string' ? payload.firstName.trim() : null;
    const sanitizedLastName =
      typeof payload.lastName === 'string' ? payload.lastName.trim() : null;
    const normalizedEmail =
      typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : null;
    const sanitizedPhone =
      typeof payload.phone === 'string' ? payload.phone.trim() : null;

    if (!userId || !normalizedUsername || !password) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!USERNAME_PATTERN.test(normalizedUsername)) {
      return new Response(
        JSON.stringify({
          error:
            'Username must be at least 3 characters and use only letters, numbers, hyphens, or underscores.',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    if (password.length < MIN_PASSWORD_LENGTH) {
      return new Response(
        JSON.stringify({
          error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters long.`,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    console.log('[finalize-registration] Finalizing registration for user:', userId);

    // Check if username is available (normalized to lowercase)
    const { data: existingUser, error: checkError } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('username', normalizedUsername)
      .maybeSingle();

    if (checkError) throw checkError;

    if (existingUser && existingUser.id !== userId) {
      return new Response(
        JSON.stringify({ error: 'This username is already taken. Please choose another.' }),
        {
          status: 409,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Update user password and metadata
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      userId,
      {
        password,
        user_metadata: {
          username: normalizedUsername,
          first_name: sanitizedFirstName,
          last_name: sanitizedLastName,
          phone: sanitizedPhone,
        },
      }
    );

    if (updateError) throw updateError;

    // Update profile
    const fullName = [sanitizedFirstName, sanitizedLastName]
      .filter(Boolean)
      .join(' ')
      .trim();

    const { error: profileError } = await supabaseAdmin
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
          subscription_status: 'active',
        },
        { onConflict: 'id' }
      );

    if (profileError) throw profileError;

    console.log('[finalize-registration] Registration finalized successfully');

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[finalize-registration] Error:', error);
    return new Response(JSON.stringify({ 
      error: error.message || 'Unknown error occurred',
      details: error.toString(),
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
