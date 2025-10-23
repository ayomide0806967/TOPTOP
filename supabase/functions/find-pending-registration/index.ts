import { serve } from 'https://deno.land/std@0.223.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { email, firstName, lastName, phone } = await req.json();

    const normalizedEmail = String(email || '')
      .trim()
      .toLowerCase();
    const normalizedFirstName = String(firstName || '').trim();
    const normalizedLastName = String(lastName || '').trim();
    const normalizedPhone = String(phone || '').trim();

    if (
      !normalizedEmail ||
      !normalizedFirstName ||
      !normalizedLastName ||
      !normalizedPhone
    ) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    if (!supabaseUrl || !serviceRoleKey) {
      console.error(
        '[find-pending-registration] Missing Supabase environment configuration'
      );
      return new Response(
        JSON.stringify({
          error: 'Server configuration error. Please contact support.',
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const normalizeText = (value: string | null) =>
      (value || '').trim().toLowerCase();
    const digitsOnly = (value: string | null) =>
      (value || '').replace(/\D+/g, '');

    const stripAccents = (value: string) =>
      value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z\s]/gi, ' ');

    const sanitizeName = (value: string) =>
      stripAccents(value).toLowerCase().replace(/\s+/g, ' ').trim();

    const levenshtein = (a: string, b: string) => {
      if (a === b) return 0;
      if (!a.length) return b.length;
      if (!b.length) return a.length;

      const matrix: number[][] = [];

      for (let i = 0; i <= b.length; i += 1) {
        matrix[i] = [i];
      }

      for (let j = 0; j <= a.length; j += 1) {
        matrix[0][j] = j;
      }

      for (let i = 1; i <= b.length; i += 1) {
        for (let j = 1; j <= a.length; j += 1) {
          if (b.charAt(i - 1) === a.charAt(j - 1)) {
            matrix[i][j] = matrix[i - 1][j - 1];
          } else {
            matrix[i][j] = Math.min(
              matrix[i - 1][j] + 1,
              matrix[i][j - 1] + 1,
              matrix[i - 1][j - 1] + 1
            );
          }
        }
      }

      return matrix[b.length][a.length];
    };

    const tokens = (value: string) => value.split(' ').filter(Boolean);

    const withinTolerance = (distance: number, length: number) => {
      if (length <= 3) return distance <= 1;
      if (length <= 5) return distance <= 1;
      if (length <= 8) return distance <= 2;
      return distance <= 3;
    };

    const fuzzyMatch = (aRaw: string, bRaw: string) => {
      if (!aRaw || !bRaw) return false;
      if (aRaw === bRaw) return true;

      if (aRaw.includes(bRaw) || bRaw.includes(aRaw)) {
        return true;
      }

      if (
        withinTolerance(
          levenshtein(aRaw, bRaw),
          Math.max(aRaw.length, bRaw.length)
        )
      ) {
        return true;
      }

      const aTokens = tokens(aRaw);
      const bTokens = tokens(bRaw);

      for (const aToken of aTokens) {
        for (const bToken of bTokens) {
          if (
            withinTolerance(
              levenshtein(aToken, bToken),
              Math.max(aToken.length, bToken.length)
            )
          ) {
            return true;
          }
        }
      }

      return false;
    };

    const providedFirst = normalizeText(normalizedFirstName);
    const providedLast = normalizeText(normalizedLastName);
    const providedPhoneDigits = digitsOnly(normalizedPhone);

    let profile = null;
    let profileError = null;

    ({ data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('id, email, first_name, last_name, phone, subscription_status')
      .eq('email', normalizedEmail)
      .eq('subscription_status', 'pending_payment')
      .maybeSingle());

    if ((!profile || profileError?.code === 'PGRST116') && normalizedPhone) {
      ({ data: profile, error: profileError } = await supabaseAdmin
        .from('profiles')
        .select('id, email, first_name, last_name, phone, subscription_status')
        .eq('phone', normalizedPhone)
        .eq('subscription_status', 'pending_payment')
        .maybeSingle());
    }

    if (profileError && profileError.code !== 'PGRST116') {
      console.error(
        '[find-pending-registration] Profile lookup error',
        profileError
      );
      return new Response(
        JSON.stringify({
          error: 'Failed to lookup registration. Please try again later.',
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    if (!profile) {
      return new Response(
        JSON.stringify({ error: 'No matching pending registration found.' }),
        {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const profileFirst = sanitizeName(profile.first_name ?? '');
    const profileLast = sanitizeName(profile.last_name ?? '');
    const profilePhoneDigits = digitsOnly(profile.phone ?? '');

    const phoneMatches =
      !providedPhoneDigits ||
      !profilePhoneDigits ||
      providedPhoneDigits === profilePhoneDigits ||
      providedPhoneDigits.endsWith(profilePhoneDigits) ||
      profilePhoneDigits.endsWith(providedPhoneDigits);

    const sanitizedProvidedFirst = sanitizeName(providedFirst);
    const sanitizedProvidedLast = sanitizeName(providedLast);

    const firstMatches = fuzzyMatch(sanitizedProvidedFirst, profileFirst);
    const lastMatches = fuzzyMatch(sanitizedProvidedLast, profileLast);
    const swappedMatches =
      !firstMatches &&
      !lastMatches &&
      fuzzyMatch(sanitizedProvidedFirst, profileLast) &&
      fuzzyMatch(sanitizedProvidedLast, profileFirst);

    const emailMatches = normalizedEmail === normalizeText(profile.email ?? '');

    const strongMatches = (emailMatches ? 1 : 0) + (phoneMatches ? 1 : 0);
    const hasNameSupport = firstMatches || lastMatches || swappedMatches;
    const bothNamesMatch = (firstMatches && lastMatches) || swappedMatches;

    const isConfidentMatch =
      strongMatches >= 2 ||
      (strongMatches === 1 && hasNameSupport) ||
      (strongMatches === 0 && bothNamesMatch);

    if (!isConfidentMatch) {
      return new Response(
        JSON.stringify({
          error:
            'We could not confidently match your registration with the details provided. Please double-check your information and ensure at least two fields are correct.',
        }),
        {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const { data: transaction, error: transactionError } = await supabaseAdmin
      .from('payment_transactions')
      .select('reference')
      .eq('user_id', profile.id)
      .eq('status', 'success')
      .order('paid_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (transactionError && transactionError.code !== 'PGRST116') {
      console.error(
        '[find-pending-registration] payment_transactions lookup error',
        transactionError
      );
      return new Response(
        JSON.stringify({
          error:
            'Unable to fetch payment details right now. Please try again later.',
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    let reference = transaction?.reference ?? null;

    if (!reference) {
      const { data: legacyPayment, error: legacyError } = await supabaseAdmin
        .from('payments')
        .select('reference')
        .eq('user_id', profile.id)
        .eq('status', 'success')
        // Legacy payments records do not capture created_at, so rely on paid_at
        // to resolve the most recent successful charge.
        .order('paid_at', { ascending: false, nullsLast: true })
        .limit(1)
        .maybeSingle();

      if (legacyError && legacyError.code !== 'PGRST116') {
        console.error(
          '[find-pending-registration] Legacy payments lookup error',
          legacyError
        );
        return new Response(
          JSON.stringify({
            error:
              'Unable to fetch payment details right now. Please try again later.',
          }),
          {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      reference = legacyPayment?.reference ?? null;
    }

    if (!reference) {
      return new Response(
        JSON.stringify({
          error: 'No successful payment found for this registration.',
        }),
        {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    return new Response(
      JSON.stringify({
        reference,
        userId: profile.id,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
