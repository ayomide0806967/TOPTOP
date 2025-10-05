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
    const { email, firstName, lastName, phone, username, password } = body;

    const normalizedEmail = String(email || '').trim().toLowerCase();
    const sanitizedFirstName = String(firstName || '').trim();
    const sanitizedLastName = String(lastName || '').trim();
    const sanitizedPhone = typeof phone === 'string' ? phone.trim() : '';
    const normalizedPhone = sanitizedPhone || null;
    const normalizedUsername = String(username || '').trim().toLowerCase();
    const rawPassword = String(password || '');

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

    if (!normalizedUsername || !USERNAME_PATTERN.test(normalizedUsername)) {
      return new Response(
        JSON.stringify({
          error:
            'Invalid username supplied. Refresh the page to receive a new username and try again.',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    if (rawPassword.length < MIN_PASSWORD_LENGTH) {
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

    console.log('[create-pending-user] Checking existing records for email:', normalizedEmail);

    const ACTIVE_STATUSES = new Set(['active', 'trialing']);

    const { data: existingProfile, error: profileLookupError } = await supabaseAdmin
      .from('profiles')
      .select('id, subscription_status, username')
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

    const { data: usernameOwner, error: usernameLookupError } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('username', normalizedUsername)
      .maybeSingle();

    if (usernameLookupError && usernameLookupError.code !== 'PGRST116') {
      console.error('[create-pending-user] Username lookup error:', usernameLookupError);
      throw usernameLookupError;
    }

    if (usernameOwner && usernameOwner.id !== existingProfile?.id) {
      return new Response(
        JSON.stringify({
          error: 'This username is already taken. Refresh to receive a new username and try again.',
        }),
        {
          status: 409,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    console.log('[create-pending-user] Fetching auth user by email');
    // Query using filter instead of relying on first page of listUsers without filters
    const { data: userList, error: fetchUserError } =
      await supabaseAdmin.auth.admin.listUsers({
        page: 1,
        perPage: 200,
        filter: `email.eq.${normalizedEmail}`,
      });

    if (fetchUserError) {
      console.error('[create-pending-user] listUsers error:', fetchUserError);
      throw fetchUserError;
    }

    const authUser = userList?.users?.find(
      (user) => user.email?.toLowerCase() === normalizedEmail
    ) ?? null;

    let userId: string;

    if (authUser) {
      userId = authUser.id;
      console.log('[create-pending-user] Reusing existing auth user:', userId);

      const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
        userId,
        {
          email: normalizedEmail,
          password: rawPassword,
          user_metadata: {
            first_name: sanitizedFirstName,
            last_name: sanitizedLastName,
            phone: normalizedPhone,
            username: normalizedUsername,
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
          password: rawPassword,
          user_metadata: {
            first_name: sanitizedFirstName,
            last_name: sanitizedLastName,
            phone: normalizedPhone,
            username: normalizedUsername,
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
        username: normalizedUsername,
        full_name: `${sanitizedFirstName} ${sanitizedLastName}`.trim() || null,
        subscription_status: 'pending_payment',
      },
      { onConflict: 'id' }
    );

    if (profileError) {
      console.error('[create-pending-user] Error upserting profile:', profileError);
      throw profileError;
    }

    console.log('[create-pending-user] Prepared pending user', {
      userId,
      reuseProfile: !!existingProfile,
    });

    return new Response(JSON.stringify({ userId, username: normalizedUsername }), {
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
