import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

interface User {
  id: string;
  email: string;
  role: string;
  tenant_id?: string;
  subscription?: {
    plan_type: string;
    status: string;
  };
}

interface LoginRequest {
  email: string;
  password: string;
}

interface RegisterRequest {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone?: string;
  tenantSlug?: string;
  planType?: string;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const url = new URL(req.url)
    const path = url.pathname.replace(/^\/(api\/)?auth/, '')

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    )

    // Helper function to get user with tenant and subscription info
    async function getUserWithDetails(userId: string): Promise<User | null> {
      const { data: user, error } = await supabaseClient
        .from('users')
        .select(`
          *,
          tenant:tenant_id (*),
          subscription:subscriptions (*)
        `)
        .eq('id', userId)
        .single()

      if (error || !user) return null

      return {
        id: user.id,
        email: user.email,
        role: user.role,
        tenant_id: user.tenant_id,
        subscription: user.subscription
      }
    }

    // Helper function to create JWT token with user info
    function createToken(user: User): string {
      const payload = {
        userId: user.id,
        email: user.email,
        role: user.role,
        tenantId: user.tenant_id,
        planType: user.subscription?.plan_type || 'basic',
        exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60) // 24 hours
      }

      // This is a simplified token - in production, use proper JWT signing
      return btoa(JSON.stringify(payload))
    }

    // Helper function to validate token
    function validateToken(token: string): any {
      try {
        const payload = JSON.parse(atob(token))
        if (payload.exp < Date.now() / 1000) {
          throw new Error('Token expired')
        }
        return payload
      } catch {
        return null
      }
    }

    switch (path) {
      case '/login': {
        if (req.method !== 'POST') {
          return new Response('Method not allowed', { status: 405, headers: corsHeaders })
        }

        const { email, password }: LoginRequest = await req.json()

        if (!email || !password) {
          return new Response(
            JSON.stringify({ message: 'Email and password are required', code: 'MISSING_CREDENTIALS' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        // Authenticate user with Supabase Auth
        const { data: authData, error: authError } = await supabaseClient.auth.signInWithPassword({
          email,
          password,
        })

        if (authError || !authData.user) {
          return new Response(
            JSON.stringify({ message: 'Invalid credentials', code: 'INVALID_CREDENTIALS' }),
            { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        // Get user details including role and tenant
        const user = await getUserWithDetails(authData.user.id)
        if (!user) {
          return new Response(
            JSON.stringify({ message: 'User not found', code: 'USER_NOT_FOUND' }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        const token = createToken(user)

        return new Response(
          JSON.stringify({
            token,
            user: {
              id: user.id,
              email: user.email,
              role: user.role,
              tenant_id: user.tenant_id,
              subscription: user.subscription
            }
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      case '/register': {
        if (req.method !== 'POST') {
          return new Response('Method not allowed', { status: 405, headers: corsHeaders })
        }

        const { email, password, firstName, lastName, phone, tenantSlug, planType = 'basic' }: RegisterRequest = await req.json()

        if (!email || !password || !firstName || !lastName) {
          return new Response(
            JSON.stringify({ message: 'All required fields must be provided', code: 'MISSING_FIELDS' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        if (password.length < 8) {
          return new Response(
            JSON.stringify({ message: 'Password must be at least 8 characters', code: 'WEAK_PASSWORD' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        // Start a transaction for user creation
        const { data: authData, error: authError } = await supabaseClient.auth.signUp({
          email,
          password,
        })

        if (authError || !authData.user) {
          return new Response(
            JSON.stringify({ message: authError?.message || 'Registration failed', code: 'REGISTRATION_ERROR' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        let tenantId = null

        // Handle tenant creation or joining
        if (tenantSlug) {
          // Try to join existing tenant
          const { data: existingTenant } = await supabaseClient
            .from('tenants')
            .select('id')
            .eq('slug', tenantSlug)
            .single()

          if (existingTenant) {
            tenantId = existingTenant.id
          }
        }

        // If no tenant specified or found, create new tenant for instructors
        if (!tenantId && planType !== 'basic') {
          const { data: newTenant } = await supabaseClient
            .from('tenants')
            .insert({
              name: `${firstName} ${lastName}'s Organization`,
              slug: `${email.split('@')[0]}-${Date.now()}`,
              settings: {}
            })
            .select()
            .single()

          tenantId = newTenant.id
        }

        // Create user record
        const { data: user, error: userError } = await supabaseClient
          .from('users')
          .insert({
            id: authData.user.id,
            email,
            first_name: firstName,
            last_name: lastName,
            phone,
            role: planType === 'enterprise' ? 'super_admin' : 'instructor',
            tenant_id: tenantId,
            subscription_id: null // Will be set after payment
          })
          .select()
          .single()

        if (userError) {
          // Rollback auth user if user creation fails
          await supabaseClient.auth.admin.deleteUser(authData.user.id)
          return new Response(
            JSON.stringify({ message: userError.message, code: 'USER_CREATION_FAILED' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        const token = createToken({
          id: user.id,
          email: user.email,
          role: user.role,
          tenant_id: user.tenant_id,
          subscription: null
        })

        return new Response(
          JSON.stringify({
            token,
            user: {
              id: user.id,
              email: user.email,
              role: user.role,
              tenant_id: user.tenant_id,
              subscription: null
            },
            message: 'Registration successful'
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      case '/validate': {
        if (req.method !== 'GET') {
          return new Response('Method not allowed', { status: 405, headers: corsHeaders })
        }

        const authHeader = req.headers.get('Authorization')
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          return new Response(
            JSON.stringify({ message: 'Invalid token', code: 'INVALID_TOKEN' }),
            { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        const token = authHeader.replace('Bearer ', '')
        const payload = validateToken(token)

        if (!payload) {
          return new Response(
            JSON.stringify({ message: 'Invalid or expired token', code: 'INVALID_TOKEN' }),
            { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        // Get fresh user data
        const user = await getUserWithDetails(payload.userId)
        if (!user) {
          return new Response(
            JSON.stringify({ message: 'User not found', code: 'USER_NOT_FOUND' }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        return new Response(
          JSON.stringify({ user }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      case '/logout': {
        if (req.method !== 'POST') {
          return new Response('Method not allowed', { status: 405, headers: corsHeaders })
        }

        // In a real implementation, you would invalidate the token here
        // For now, we'll just return success
        return new Response(
          JSON.stringify({ message: 'Logged out successfully' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      case '/profile': {
        if (req.method === 'GET') {
          const authHeader = req.headers.get('Authorization')
          if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return new Response(
              JSON.stringify({ message: 'Invalid token', code: 'INVALID_TOKEN' }),
              { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
          }

          const token = authHeader.replace('Bearer ', '')
          const payload = validateToken(token)

          if (!payload) {
            return new Response(
              JSON.stringify({ message: 'Invalid or expired token', code: 'INVALID_TOKEN' }),
              { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
          }

          const user = await getUserWithDetails(payload.userId)
          if (!user) {
            return new Response(
              JSON.stringify({ message: 'User not found', code: 'USER_NOT_FOUND' }),
              { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
          }

          return new Response(
            JSON.stringify({ user }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        if (req.method === 'PUT') {
          const authHeader = req.headers.get('Authorization')
          if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return new Response(
              JSON.stringify({ message: 'Invalid token', code: 'INVALID_TOKEN' }),
              { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
          }

          const token = authHeader.replace('Bearer ', '')
          const payload = validateToken(token)

          if (!payload) {
            return new Response(
              JSON.stringify({ message: 'Invalid or expired token', code: 'INVALID_TOKEN' }),
              { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
          }

          const updates = await req.json()

          const { data: user, error } = await supabaseClient
            .from('users')
            .update(updates)
            .eq('id', payload.userId)
            .select()
            .single()

          if (error) {
            return new Response(
              JSON.stringify({ message: error.message, code: 'UPDATE_FAILED' }),
              { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
          }

          return new Response(
            JSON.stringify({ user }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        return new Response('Method not allowed', { status: 405, headers: corsHeaders })
      }

      case '/change-password': {
        if (req.method !== 'POST') {
          return new Response('Method not allowed', { status: 405, headers: corsHeaders })
        }

        const authHeader = req.headers.get('Authorization')
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          return new Response(
            JSON.stringify({ message: 'Invalid token', code: 'INVALID_TOKEN' }),
            { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        const token = authHeader.replace('Bearer ', '')
        const payload = validateToken(token)

        if (!payload) {
          return new Response(
            JSON.stringify({ message: 'Invalid or expired token', code: 'INVALID_TOKEN' }),
            { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        const { currentPassword, newPassword } = await req.json()

        if (!currentPassword || !newPassword) {
          return new Response(
            JSON.stringify({ message: 'Current password and new password are required', code: 'MISSING_PASSWORDS' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        if (newPassword.length < 8) {
          return new Response(
            JSON.stringify({ message: 'New password must be at least 8 characters', code: 'WEAK_PASSWORD' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        // Verify current password
        const { error: verifyError } = await supabaseClient.auth.signInWithPassword({
          email: payload.email,
          password: currentPassword,
        })

        if (verifyError) {
          return new Response(
            JSON.stringify({ message: 'Current password is incorrect', code: 'INVALID_CURRENT_PASSWORD' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        // Update password
        const { error: updateError } = await supabaseClient.auth.updateUser({
          password: newPassword
        })

        if (updateError) {
          return new Response(
            JSON.stringify({ message: updateError.message, code: 'PASSWORD_UPDATE_FAILED' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        return new Response(
          JSON.stringify({ message: 'Password updated successfully' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      default:
        return new Response('Endpoint not found', { status: 404, headers: corsHeaders })
    }
  } catch (error) {
    console.error('Auth API error:', error)
    return new Response(
      JSON.stringify({ message: 'Internal server error', code: 'INTERNAL_ERROR' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
