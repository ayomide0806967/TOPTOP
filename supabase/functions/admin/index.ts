import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const url = new URL(req.url)
    const path = url.pathname.replace('/api/admin', '')

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    )

    // Helper function to verify super admin access
    async function verifySuperAdmin(token: string): Promise<{ userId: string; tenantId: string } | null> {
      try {
        const payload = JSON.parse(atob(token.replace('Bearer ', '')))
        if (payload.exp < Date.now() / 1000) return null
        if (payload.role !== 'super_admin') return null

        // Verify user still exists and is super admin
        const { data: user } = await supabaseClient
          .from('users')
          .select('id, tenant_id')
          .eq('id', payload.userId)
          .eq('role', 'super_admin')
          .single()

        return user ? { userId: user.id, tenantId: user.tenant_id } : null
      } catch {
        return null
      }
    }

    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ message: 'Unauthorized', code: 'UNAUTHORIZED' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const adminUser = await verifySuperAdmin(authHeader)
    if (!adminUser) {
      return new Response(
        JSON.stringify({ message: 'Insufficient permissions', code: 'INSUFFICIENT_PERMISSIONS' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    switch (path) {
      case '/tenants': {
        if (req.method === 'GET') {
          const { data: tenants, error } = await supabaseClient
            .from('tenants')
            .select(`
              *,
              users:users(count),
              subscriptions:subscriptions(*),
              quizzes:quiz_blueprints(count)
            `)
            .order('created_at', { ascending: false })

          if (error) {
            return new Response(
              JSON.stringify({ message: error.message }),
              { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
          }

          return new Response(
            JSON.stringify(tenants ?? []),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        if (req.method === 'POST') {
          const tenantData = await req.json()

          const { data: tenant, error } = await supabaseClient
            .from('tenants')
            .insert(tenantData)
            .select()
            .single()

          if (error) {
            return new Response(
              JSON.stringify({ message: error.message }),
              { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
          }

          return new Response(
            JSON.stringify(tenant),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        if (req.method === 'PUT') {
          const { id, ...updates } = await req.json()

          const { data: tenant, error } = await supabaseClient
            .from('tenants')
            .update(updates)
            .eq('id', id)
            .select()
            .single()

          if (error) {
            return new Response(
              JSON.stringify({ message: error.message }),
              { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
          }

          return new Response(
            JSON.stringify(tenant),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        if (req.method === 'DELETE') {
          const { searchParams } = new URL(req.url)
          const id = searchParams.get('id')

          if (!id) {
            return new Response(
              JSON.stringify({ message: 'Tenant ID required' }),
              { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
          }

          // Check if tenant has users
          const { data: users } = await supabaseClient
            .from('users')
            .select('count')
            .eq('tenant_id', id)
            .limit(1)

          if (users && users.length > 0) {
            return new Response(
              JSON.stringify({ message: 'Cannot delete tenant with active users' }),
              { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
          }

          const { error } = await supabaseClient
            .from('tenants')
            .delete()
            .eq('id', id)

          if (error) {
            return new Response(
              JSON.stringify({ message: error.message }),
              { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
          }

          return new Response(
            JSON.stringify({ message: 'Tenant deleted successfully' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        return new Response('Method not allowed', { status: 405, headers: corsHeaders })
      }

      case '/users': {
        if (req.method === 'GET') {
          const { searchParams } = new URL(req.url)
          const tenantId = searchParams.get('tenantId')
          const role = searchParams.get('role')

          let query = supabaseClient
            .from('users')
            .select(`
              *,
              tenant:tenant_id (*),
              subscription:subscriptions (*)
            `)

          if (tenantId) {
            query = query.eq('tenant_id', tenantId)
          }

          if (role) {
            query = query.eq('role', role)
          }

          const { data: users, error } = await query.order('created_at', { ascending: false })

          if (error) {
            return new Response(
              JSON.stringify({ message: error.message }),
              { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
          }

          return new Response(
            JSON.stringify(users ?? []),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        if (req.method === 'POST') {
          const userData = await req.json()

          const { data: user, error } = await supabaseClient
            .from('users')
            .insert(userData)
            .select()
            .single()

          if (error) {
            return new Response(
              JSON.stringify({ message: error.message }),
              { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
          }

          return new Response(
            JSON.stringify(user),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        if (req.method === 'PUT') {
          const updates = await req.json()

          const { data: user, error } = await supabaseClient
            .from('users')
            .update(updates)
            .eq('id', updates.id)
            .select()
            .single()

          if (error) {
            return new Response(
              JSON.stringify({ message: error.message }),
              { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
          }

          return new Response(
            JSON.stringify(user),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        if (req.method === 'DELETE') {
          const { searchParams } = new URL(req.url)
          const userId = searchParams.get('userId')

          if (!userId) {
            return new Response(
              JSON.stringify({ message: 'User ID required' }),
              { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
          }

          // Soft delete by updating status
          const { error } = await supabaseClient
            .from('users')
            .update({ status: 'deleted' })
            .eq('id', userId)

          if (error) {
            return new Response(
              JSON.stringify({ message: error.message }),
              { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
          }

          return new Response(
            JSON.stringify({ message: 'User deactivated successfully' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        return new Response('Method not allowed', { status: 405, headers: corsHeaders })
      }

      case '/subscriptions': {
        if (req.method === 'GET') {
          const { searchParams } = new URL(req.url)
          const status = searchParams.get('status')
          const planType = searchParams.get('planType')

          let query = supabaseClient
            .from('subscriptions')
            .select(`
              *,
              user:users(*),
              tenant:tenant_id (*)
            `)

          if (status) {
            query = query.eq('status', status)
          }

          if (planType) {
            query = query.eq('plan_type', planType)
          }

          const { data: subscriptions, error } = await query.order('created_at', { ascending: false })

          if (error) {
            return new Response(
              JSON.stringify({ message: error.message }),
              { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
          }

          return new Response(
            JSON.stringify(subscriptions ?? []),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        if (req.method === 'PUT') {
          const updates = await req.json()

          const { data: subscription, error } = await supabaseClient
            .from('subscriptions')
            .update(updates)
            .eq('id', updates.id)
            .select()
            .single()

          if (error) {
            return new Response(
              JSON.stringify({ message: error.message }),
              { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
          }

          return new Response(
            JSON.stringify(subscription),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        return new Response('Method not allowed', { status: 405, headers: corsHeaders })
      }

      case '/analytics': {
        if (req.method !== 'GET') {
          return new Response('Method not allowed', { status: 405, headers: corsHeaders })
        }

        // Get system-wide analytics
        const [
          { data: tenantCount },
          { data: userCount },
          { data: quizCount },
          { data: subscriptionCount },
          { data: revenueData }
        ] = await Promise.all([
          supabaseClient.from('tenants').select('count', { count: 'exact' }),
          supabaseClient.from('users').select('count', { count: 'exact' }),
          supabaseClient.from('quiz_blueprints').select('count', { count: 'exact' }),
          supabaseClient.from('subscriptions').select('count', { count: 'exact' }),
          supabaseClient
            .from('subscriptions')
            .select('plan_type, amount')
            .eq('status', 'active')
        ])

        const monthlyRevenue = revenueData?.reduce((sum, sub) => sum + (sub.amount || 0), 0) || 0

        const analytics = {
          totalTenants: tenantCount?.[0]?.count || 0,
          totalUsers: userCount?.[0]?.count || 0,
          totalQuizzes: quizCount?.[0]?.count || 0,
          totalSubscriptions: subscriptionCount?.[0]?.count || 0,
          monthlyRevenue,
          revenueByPlan: revenueData?.reduce((acc, sub) => {
            acc[sub.plan_type] = (acc[sub.plan_type] || 0) + (sub.amount || 0)
            return acc
          }, {})
        }

        return new Response(
          JSON.stringify({ analytics }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      case '/dashboard/metrics': {
        if (req.method !== 'GET') {
          return new Response('Method not allowed', { status: 405, headers: corsHeaders })
        }

        const [
          { data: tenantCount },
          { data: userCount },
          { data: quizCount },
          { data: activeSubscriptions },
        ] = await Promise.all([
          supabaseClient.from('tenants').select('count', { count: 'exact' }),
          supabaseClient.from('users').select('count', { count: 'exact' }),
          supabaseClient.from('quiz_blueprints').select('count', { count: 'exact' }),
          supabaseClient
            .from('subscriptions')
            .select('amount')
            .eq('status', 'active'),
        ]);

        const metrics = {
          totalTenants: tenantCount?.[0]?.count || 0,
          totalUsers: userCount?.[0]?.count || 0,
          totalQuizzes: quizCount?.[0]?.count || 0,
          monthlyRevenue:
            activeSubscriptions?.reduce(
              (sum, sub) => sum + Number(sub.amount || 0),
              0,
            ) || 0,
        };

        return new Response(
          JSON.stringify(metrics),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case '/activity': {
        if (req.method !== 'GET') {
          return new Response('Method not allowed', { status: 405, headers: corsHeaders })
        }

        const { searchParams } = new URL(req.url)
        const limit = parseInt(searchParams.get('limit') || '50')

        // Get recent activity across the system
        const { data: activities, error } = await supabaseClient
          .from('audit_logs')
          .select(`
            *,
            user:users(email, first_name, last_name)
          `)
          .order('created_at', { ascending: false })
          .limit(limit)

        if (error) {
          return new Response(
            JSON.stringify({ message: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        return new Response(
          JSON.stringify({ activities }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      case '/activity/recent': {
        if (req.method !== 'GET') {
          return new Response('Method not allowed', { status: 405, headers: corsHeaders })
        }

        const { searchParams } = new URL(req.url)
        const limit = parseInt(searchParams.get('limit') || '20')

        const { data: activities, error } = await supabaseClient
          .from('audit_logs')
          .select(`
            *,
            user:users(email, first_name, last_name)
          `)
          .order('created_at', { ascending: false })
          .limit(limit)

        if (error) {
          return new Response(
            JSON.stringify({ message: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        return new Response(
          JSON.stringify(activities ?? []),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      default:
        return new Response('Endpoint not found', { status: 404, headers: corsHeaders })
    }
  } catch (error) {
    console.error('Admin API error:', error)
    return new Response(
      JSON.stringify({ message: 'Internal server error', code: 'INTERNAL_ERROR' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
