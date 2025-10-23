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
  throw new Error(
    'Supabase credentials missing. Ensure APP_SUPABASE_URL/ANON/SERVICE keys are configured.'
  );
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

type TokenPayload = {
  userId: string;
  tenantId?: string;
  role: string;
  exp: number;
};

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

  const authHeader = req.headers.get('Authorization');
  const token = decodeToken(authHeader);

  if (!token?.userId || !token.tenantId) {
    return new Response(
      JSON.stringify({ message: 'Unauthorized', code: 'UNAUTHORIZED' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  if (!['instructor', 'super_admin'].includes(token.role)) {
    return new Response(
      JSON.stringify({ message: 'Forbidden', code: 'FORBIDDEN' }),
      { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const url = new URL(req.url);
  const path = url.pathname.replace('/api/instructor', '');

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
    global: { headers: authHeader ? { Authorization: authHeader } : {} },
  });

  const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  async function getSeatSummary() {
    const { data, error } = await userClient
      .from('quiz_subscription_summary')
      .select('*')
      .single();
    if (error) {
      return null;
    }
    return data;
  }

  switch (path) {
    case '/dashboard/metrics': {
      if (req.method !== 'GET') {
        return new Response('Method not allowed', {
          status: 405,
          headers: corsHeaders,
        });
      }

      const [
        quizCountResult,
        classroomResponse,
        attemptCountResult,
        seatSummary,
      ] = await Promise.all([
        serviceClient
          .from('quiz_blueprints')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', token.tenantId)
          .eq('owner_user_id', token.userId),
        serviceClient
          .from('classrooms')
          .select('status, active_participants')
          .eq('tenant_id', token.tenantId)
          .eq('owner_user_id', token.userId),
        serviceClient
          .from('quiz_attempts')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', token.tenantId),
        getSeatSummary(),
      ]);

      const classroomResult = classroomResponse.data;
      if (classroomResponse.error) {
        console.error('[Instructor] classroom fetch failed', classroomResponse.error);
      }
      if (quizCountResult.error) {
        console.error('[Instructor] quiz count failed', quizCountResult.error);
      }
      if (attemptCountResult.error) {
        console.error('[Instructor] attempt count failed', attemptCountResult.error);
      }

      const activeClassrooms =
        classroomResult?.filter((room) => room.status === 'active').length ||
        0;
      const totalStudents =
        classroomResult?.reduce(
          (sum, room) => sum + Number(room.active_participants ?? 0),
          0
        ) || 0;

      const metrics = {
        totalQuizzes: quizCountResult.count ?? 0,
        activeClassrooms,
        totalStudents,
        totalAttempts: attemptCountResult.count ?? 0,
        subscriptionUsage: seatSummary
          ? {
              maxStudents: seatSummary.seat_count ?? 0,
              maxClassrooms: 0,
              maxQuizzes: 0,
              currentStudents: seatSummary.seats_in_use ?? totalStudents,
              currentClassrooms: activeClassrooms,
              currentQuizzes: quizCountResult.count ?? 0,
              pricePerSeat: seatSummary.price_per_seat ?? 500,
              renewalDate: seatSummary.renewal_date ?? null,
            }
          : null,
      };

      return new Response(JSON.stringify(metrics), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    case '/activity/recent': {
      if (req.method !== 'GET') {
        return new Response('Method not allowed', {
          status: 405,
          headers: corsHeaders,
        });
      }

      const limit = Number(url.searchParams.get('limit') ?? 20);
      const { data, error } = await serviceClient
        .from('audit_logs')
        .select('*')
        .eq('user_id', token.userId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error && error.code !== 'PGRST116') {
        console.error('[Instructor] activity fetch failed', error);
        return new Response(
          JSON.stringify([]),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(JSON.stringify(data ?? []), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    case '/exams/upcoming': {
      if (req.method !== 'GET') {
        return new Response('Method not allowed', {
          status: 405,
          headers: corsHeaders,
        });
      }

      const { data, error } = await serviceClient
        .from('classroom_exams_view')
        .select('*')
        .eq('tenant_id', token.tenantId)
        .gte('starts_at', new Date().toISOString())
        .order('starts_at', { ascending: true })
        .limit(20);

      if (error && error.code !== 'PGRST116') {
        console.error('[Instructor] upcoming exams failed', error);
        return new Response(
          JSON.stringify([]),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(JSON.stringify(data ?? []), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    case '/quizzes': {
      if (req.method !== 'GET') {
        return new Response('Method not allowed', {
          status: 405,
          headers: corsHeaders,
        });
      }

      const { data, error } = await serviceClient
        .from('quiz_blueprints')
        .select('*')
        .eq('tenant_id', token.tenantId)
        .eq('owner_user_id', token.userId)
        .order('updated_at', { ascending: false })
        .limit(100);

      if (error && error.code !== 'PGRST116') {
        console.error('[Instructor] quizzes fetch failed', error);
        return new Response(
          JSON.stringify([]),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(JSON.stringify(data ?? []), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    case '/classrooms': {
      if (req.method !== 'GET') {
        return new Response('Method not allowed', {
          status: 405,
          headers: corsHeaders,
        });
      }

      const { data, error } = await serviceClient
        .from('classrooms')
        .select('*')
        .eq('tenant_id', token.tenantId)
        .eq('owner_user_id', token.userId)
        .order('created_at', { ascending: false })
        .limit(100);

      if (error && error.code !== 'PGRST116') {
        console.error('[Instructor] classrooms fetch failed', error);
        return new Response(
          JSON.stringify([]),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(JSON.stringify(data ?? []), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    case '/profile': {
      if (req.method !== 'GET') {
        return new Response('Method not allowed', {
          status: 405,
          headers: corsHeaders,
        });
      }

      const { data: user, error } = await serviceClient
        .from('users')
        .select('id, email, first_name, last_name, phone, role, tenant_id')
        .eq('id', token.userId)
        .single();

      if (error) {
        return new Response(
          JSON.stringify({ message: 'User not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const seatSummary = await getSeatSummary();

      return new Response(
        JSON.stringify({
          user,
          seatSummary,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    default:
      return new Response('Not found', { status: 404, headers: corsHeaders });
  }
});
