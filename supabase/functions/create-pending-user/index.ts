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
    // 1. Add explicit environment variable check
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    console.log('[create-pending-user] Environment check:', {
      hasUrl: !!supabaseUrl,
      hasKey: !!serviceKey,
    });

    if (!supabaseUrl || !serviceKey) {
      throw new Error('Missing environment variables: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceKey);
    
    const body = await req.json();
    console.log('[create-pending-user] Received body:', body);
    
    const { email, firstName, lastName, phone } = body;

    const normalizedEmail = String(email || '').trim().toLowerCase();
    const sanitizedFirstName = String(firstName || '').trim();
    const sanitizedLastName = String(lastName || '').trim();
    const sanitizedPhone = typeof phone === 'string' ? phone.trim() : '';
    const normalizedPhone = sanitizedPhone || null;

    if (!normalizedEmail || !sanitizedFirstName || !sanitizedLastName) {
      console.error('[create-pending-user] Missing required fields:', {
        email: !!normalizedEmail,
        firstName: !!sanitizedFirstName,
        lastName: !!sanitizedLastName,
      });
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    console.log('[create-pending-user] Checking existing records for email:', normalizedEmail);

    const ACTIVE_STATUSES = new Set(['active', 'trialing']);

    const { data: existingProfile, error: profileLookupError } = await supabaseAdmin
      .from('profiles')
      .select('id, subscription_status')
      .eq('email', normalizedEmail)
      .maybeSingle();

    if (profileLookupError && profileLookupError.code !== 'PGRST116') {
      console.error('[create-pending-user] Profile lookup error:', profileLookupError);
      throw profileLookupError;
    }

    if (existingProfile && ACTIVE_STATUSES.has(existingProfile.subscription_status || '')) {
      console.log('[create-pending-user] Email already tied to active subscription');
      return new Response(
        JSON.stringify({
          error:
            'An active subscription already exists for this email. Please sign in instead.',
        }),
        {
          status: 409,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    if (normalizedPhone) {
      const { data: phoneOwner, error: phoneLookupError } = await supabaseAdmin
        .from('profiles')
        .select('id, subscription_status')
        .eq('phone', normalizedPhone)
        .maybeSingle();

      if (phoneLookupError && phoneLookupError.code !== 'PGRST116') {
        console.error('[create-pending-user] Phone lookup error:', phoneLookupError);
        throw phoneLookupError;
      }

      if (
        phoneOwner &&
        phoneOwner.id !== existingProfile?.id &&
        ACTIVE_STATUSES.has(phoneOwner.subscription_status || '')
      ) {
        return new Response(
          JSON.stringify({
            error:
              'This phone number is already registered to another active account. Use a different number or contact support.',
          }),
          {
            status: 409,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }
    }

    console.log('[create-pending-user] Fetching auth user by email');
    const { data: existingUserData, error: fetchUserError } =
      await supabaseAdmin.auth.admin.getUserByEmail(normalizedEmail);

    if (fetchUserError && fetchUserError.message !== 'User not found') {
      console.error('[create-pending-user] getUserByEmail error:', fetchUserError);
      throw fetchUserError;
    }

    let userId: string;

    if (existingUserData?.user) {
      userId = existingUserData.user.id;
      console.log('[create-pending-user] Reusing existing auth user:', userId);

      const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
        userId,
        {
          email: normalizedEmail,
          user_metadata: {
            first_name: sanitizedFirstName,
            last_name: sanitizedLastName,
            phone: normalizedPhone,
          },
        }
      );

      if (updateError) {
        console.error('[create-pending-user] Error updating existing user:', updateError);
        throw updateError;
      }
    } else {
      console.log('[create-pending-user] Creating new auth user');
      const { data: newUser, error: createError } =
        await supabaseAdmin.auth.admin.createUser({
          email: normalizedEmail,
          email_confirm: true,
          user_metadata: {
            first_name: sanitizedFirstName,
            last_name: sanitizedLastName,
            phone: normalizedPhone,
          },
        });

      if (createError) {
        console.error('[create-pending-user] Error creating user:', createError);
        throw createError;
      }

      userId = newUser.user.id;
      console.log('[create-pending-user] New user created:', userId);
    }

    console.log('[create-pending-user] Upserting profile for user:', userId);
    const { error: profileError } = await supabaseAdmin.from('profiles').upsert(
      {
        id: userId,
        email: normalizedEmail,
        first_name: sanitizedFirstName,
        last_name: sanitizedLastName,
        phone: normalizedPhone,
        subscription_status: 'pending_payment',
      },
      { onConflict: 'id' }
    );

    if (profileError) {
      console.error('[create-pending-user] Error upserting profile:', profileError);
      throw profileError;
    }

    return new Response(JSON.stringify({ userId }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    // 2. Improve error response to include more detail
    console.error('[create-pending-user] Error:', error);
    return new Response(JSON.stringify({ 
      error: error.message || 'Unknown error occurred',
      details: error.toString(),
      stack: error.stack, // Include stack trace for better debugging
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
