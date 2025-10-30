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
    const path = url.pathname.replace('/api/subscription', '')

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    )

    // Helper function to get user from token
    async function getUserFromToken(token: string): Promise<any> {
      try {
        const payload = JSON.parse(atob(token.replace('Bearer ', '')))
        if (payload.exp < Date.now() / 1000) return null

        const { data: user } = await supabaseClient
          .from('users')
          .select(`
            *,
            subscription:subscriptions (*)
          `)
          .eq('id', payload.userId)
          .single()

        return user
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

    const user = await getUserFromToken(authHeader)
    if (!user) {
      return new Response(
        JSON.stringify({ message: 'Invalid token', code: 'INVALID_TOKEN' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    switch (path) {
      case '/status': {
        if (req.method !== 'GET') {
          return new Response('Method not allowed', { status: 405, headers: corsHeaders })
        }

        const { data: subscription, error } = await supabaseClient
          .from('subscriptions')
          .select('*')
          .eq('user_id', user.id)
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (error) {
          return new Response(
            JSON.stringify({ message: error.message, code: 'STATUS_ERROR' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        return new Response(
          JSON.stringify({ subscription }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      case '/usage': {
        if (req.method !== 'GET') {
          return new Response('Method not allowed', { status: 405, headers: corsHeaders })
        }

        const tenantId = user.tenant_id
        const planType = user.subscription?.plan_type || 'basic'

        // Get current usage statistics
        const [
          { count: quizCount },
          { count: classroomCount },
          { count: studentCount },
          { data: quizAttempts },
          { data: recentExports }
        ] = await Promise.all([
          supabaseClient
            .from('quiz_blueprints')
            .select('count', { count: 'exact' })
            .eq('tenant_id', tenantId)
            .eq('owner_user_id', user.id),

          supabaseClient
            .from('classrooms')
            .select('count', { count: 'exact' })
            .eq('tenant_id', tenantId)
            .eq('owner_user_id', user.id),

          supabaseClient
            .from('classroom_members')
            .select('count', { count: 'exact', head: true })
            .eq('classroom:classrooms.tenant_id', tenantId)
            .eq('role', 'student'),

          supabaseClient
            .from('quiz_attempts')
            .select('created_at')
            .eq('quiz:quiz_blueprints.tenant_id', tenantId)
            .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()),

          supabaseClient
            .from('audit_logs')
            .select('created_at')
            .eq('user_id', user.id)
            .eq('action', 'export_quiz')
            .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
        ])

        const usage = {
          quizzes: quizCount || 0,
          classrooms: classroomCount || 0,
          students: studentCount || 0,
          monthlyQuizAttempts: quizAttempts?.length || 0,
          monthlyExports: recentExports?.length || 0,
          plan: planType,
          limits: getPlanLimits(planType)
        }

        return new Response(
          JSON.stringify({ usage }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      case '/plans': {
        if (req.method !== 'GET') {
          return new Response('Method not allowed', { status: 405, headers: corsHeaders })
        }

        const plans = {
          basic: {
            id: 'basic',
            name: 'Basic',
            price: 0,
            interval: 'month',
            features: [
              'Create up to 10 quizzes',
              'Manage up to 3 classrooms',
              'Up to 50 students',
              'Basic analytics',
              'Email support'
            ],
            limits: {
              quizzes: 10,
              classrooms: 3,
              students: 50,
              questionsPerQuiz: 20,
              fileSize: 5 * 1024 * 1024,
              monthlyExports: 5
            }
          },
          pro: {
            id: 'pro',
            name: 'Professional',
            price: 2999,
            interval: 'month',
            features: [
              'Create up to 100 quizzes',
              'Manage up to 20 classrooms',
              'Up to 500 students',
              'Advanced analytics',
              'Quiz export functionality',
              'Media upload support',
              'Scheduled exams',
              'Priority email support'
            ],
            limits: {
              quizzes: 100,
              classrooms: 20,
              students: 500,
              questionsPerQuiz: 50,
              fileSize: 10 * 1024 * 1024,
              monthlyExports: 50
            }
          },
          enterprise: {
            id: 'enterprise',
            name: 'Enterprise',
            price: 9999,
            interval: 'month',
            features: [
              'Unlimited quizzes',
              'Unlimited classrooms',
              'Unlimited students',
              'All features included',
              'Custom branding',
              'API access',
              'Priority phone support',
              'Dedicated account manager',
              'Advanced security features'
            ],
            limits: {
              quizzes: -1,
              classrooms: -1,
              students: -1,
              questionsPerQuiz: -1,
              fileSize: 50 * 1024 * 1024,
              monthlyExports: -1
            }
          }
        }

        return new Response(
          JSON.stringify({ plans }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      case '/upgrade': {
        if (req.method !== 'POST') {
          return new Response('Method not allowed', { status: 405, headers: corsHeaders })
        }

        const { planId, paymentMethodId } = await req.json()

        if (!planId) {
          return new Response(
            JSON.stringify({ message: 'Plan ID required', code: 'MISSING_PLAN_ID' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        const plans = ['basic', 'pro', 'enterprise']
        if (!plans.includes(planId)) {
          return new Response(
            JSON.stringify({ message: 'Invalid plan', code: 'INVALID_PLAN' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        // Get plan pricing
        const planPricing = {
          basic: 0,
          pro: 2999,
          enterprise: 9999
        }

        const amount = planPricing[planId]

        try {
          // Create or update subscription
          const subscriptionData = {
            user_id: user.id,
            tenant_id: user.tenant_id,
            plan_type: planId,
            status: amount > 0 ? 'pending' : 'active',
            amount,
            currency: 'NGN',
            interval: 'month',
            current_period_start: new Date().toISOString(),
            current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
          }

          let subscription

          if (user.subscription) {
            // Update existing subscription
            const { data: updatedSubscription, error } = await supabaseClient
              .from('subscriptions')
              .update({
                ...subscriptionData,
                updated_at: new Date().toISOString()
              })
              .eq('id', user.subscription.id)
              .select()
              .single()

            if (error) throw error
            subscription = updatedSubscription
          } else {
            // Create new subscription
            const { data: newSubscription, error } = await supabaseClient
              .from('subscriptions')
              .insert(subscriptionData)
              .select()
              .single()

            if (error) throw error
            subscription = newSubscription
          }

          // If payment required, initiate payment with Paystack
          if (amount > 0) {
            const paystackResponse = await fetch('https://api.paystack.co/transaction/initialize', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${Deno.env.get('PAYSTACK_SECRET_KEY')}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                email: user.email,
                amount: amount * 100, // Paystack expects amount in kobo
                currency: 'NGN',
                reference: `sub_${subscription.id}_${Date.now()}`,
                callback_url: `${req.headers.get('origin')}/subscription/success`,
                metadata: {
                  subscription_id: subscription.id,
                  user_id: user.id,
                  plan_type: planId
                }
              })
            })

            const paystackData = await paystackResponse.json()

            if (!paystackData.status) {
              throw new Error('Payment initialization failed')
            }

            return new Response(
              JSON.stringify({
                subscription,
                paymentUrl: paystackData.data.authorization_url,
                reference: paystackData.data.reference
              }),
              { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
          }

          // Free plan activation
          return new Response(
            JSON.stringify({
              subscription,
              message: 'Subscription updated successfully'
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )

        } catch (error) {
          console.error('Subscription upgrade error:', error)
          return new Response(
            JSON.stringify({ message: 'Failed to upgrade subscription', code: 'UPGRADE_ERROR' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }
      }

      case '/cancel': {
        if (req.method !== 'POST') {
          return new Response('Method not allowed', { status: 405, headers: corsHeaders })
        }

        if (!user.subscription) {
          return new Response(
            JSON.stringify({ message: 'No active subscription', code: 'NO_SUBSCRIPTION' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        const { atPeriodEnd = true } = await req.json()

        const { data: subscription, error } = await supabaseClient
          .from('subscriptions')
          .update({
            cancel_at_period_end: atPeriodEnd,
            updated_at: new Date().toISOString()
          })
          .eq('id', user.subscription.id)
          .select()
          .single()

        if (error) {
          return new Response(
            JSON.stringify({ message: error.message, code: 'CANCEL_ERROR' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        return new Response(
          JSON.stringify({
            subscription,
            message: atPeriodEnd ? 'Subscription will be cancelled at period end' : 'Subscription cancelled immediately'
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      case '/reactivate': {
        if (req.method !== 'POST') {
          return new Response('Method not allowed', { status: 405, headers: corsHeaders })
        }

        if (!user.subscription) {
          return new Response(
            JSON.stringify({ message: 'No subscription found', code: 'NO_SUBSCRIPTION' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        const { data: subscription, error } = await supabaseClient
          .from('subscriptions')
          .update({
            cancel_at_period_end: false,
            status: 'active',
            updated_at: new Date().toISOString()
          })
          .eq('id', user.subscription.id)
          .select()
          .single()

        if (error) {
          return new Response(
            JSON.stringify({ message: error.message, code: 'REACTIVATE_ERROR' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        return new Response(
          JSON.stringify({
            subscription,
            message: 'Subscription reactivated successfully'
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      default:
        return new Response('Endpoint not found', { status: 404, headers: corsHeaders })
    }
  } catch (error) {
    console.error('Subscription API error:', error)
    return new Response(
      JSON.stringify({ message: 'Internal server error', code: 'INTERNAL_ERROR' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

// Helper function to get plan limits
function getPlanLimits(planType: string) {
  const limits = {
    basic: {
      maxQuizzes: 10,
      maxClassrooms: 3,
      maxStudents: 50,
      maxQuestionsPerQuiz: 20,
      maxFileSize: 5 * 1024 * 1024,
      maxMonthlyExports: 5
    },
    pro: {
      maxQuizzes: 100,
      maxClassrooms: 20,
      maxStudents: 500,
      maxQuestionsPerQuiz: 50,
      maxFileSize: 10 * 1024 * 1024,
      maxMonthlyExports: 50
    },
    enterprise: {
      maxQuizzes: -1,
      maxClassrooms: -1,
      maxStudents: -1,
      maxQuestionsPerQuiz: -1,
      maxFileSize: 50 * 1024 * 1024,
      maxMonthlyExports: -1
    }
  }

  return limits[planType] || limits.basic
}
