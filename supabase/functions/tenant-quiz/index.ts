import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-tenant-id, x-user-id, x-user-role',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const url = new URL(req.url)
    const path = url.pathname.replace('/api/quizzes', '')

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    )

    // Helper function to verify user access
    async function verifyQuizAccess(quizId: string, userId: string, tenantId: string, userRole: string, action: string = 'read'): Promise<boolean> {
      // Super admins can access everything
      if (userRole === 'super_admin') return true

      const { data: quiz, error } = await supabaseClient
        .from('quiz_blueprints')
        .select('tenant_id, owner_user_id, status')
        .eq('id', quizId)
        .single()

      if (error || !quiz) return false

      // Instructors can only access their own tenant's quizzes
      if (userRole === 'instructor') {
        if (quiz.tenant_id !== tenantId) return false
        if (action !== 'read' && quiz.owner_user_id !== userId) return false
        return quiz.tenant_id === tenantId
      }

      // Students can only read published quizzes from their tenant
      if (userRole === 'student') {
        return quiz.tenant_id === tenantId && quiz.status === 'published' && action === 'read'
      }

      return false
    }

    // Helper function to get user context from headers
    function getUserContext(req: Request): { userId: string; tenantId: string; userRole: string } | null {
      const userId = req.headers.get('X-User-ID')
      const tenantId = req.headers.get('X-Tenant-ID')
      const userRole = req.headers.get('X-User-Role')

      if (!userId || !tenantId || !userRole) return null

      return { userId, tenantId, userRole }
    }

    const userContext = getUserContext(req)
    if (!userContext) {
      return new Response(
        JSON.stringify({ message: 'User context required', code: 'NO_CONTEXT' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { userId, tenantId, userRole } = userContext

    switch (path) {
      case '': {
        if (req.method === 'GET') {
          // List quizzes with tenant isolation
          let query = supabaseClient
            .from('quiz_blueprints')
            .select(`
              *,
              owner:owner_user_id (first_name, last_name, email),
              _count:quiz_attempts(count)
            `)

          // Apply tenant filtering
          if (userRole !== 'super_admin') {
            query = query.eq('tenant_id', tenantId)
          }

          // Instructors only see their own quizzes
          if (userRole === 'instructor') {
            query = query.eq('owner_user_id', userId)
          }

          // Students only see published quizzes
          if (userRole === 'student') {
            query = query.eq('status', 'published')
          }

          const { data: quizzes, error } = await query.order('created_at', { ascending: false })

          if (error) {
            return new Response(
              JSON.stringify({ message: error.message }),
              { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
          }

          return new Response(
            JSON.stringify({ quizzes }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        if (req.method === 'POST') {
          if (userRole === 'student') {
            return new Response(
              JSON.stringify({ message: 'Students cannot create quizzes', code: 'INSUFFICIENT_PERMISSIONS' }),
              { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
          }

          const quizData = await req.json()

          // Ensure tenant isolation
          const quizWithTenant = {
            ...quizData,
            tenant_id: userRole === 'super_admin' ? quizData.tenant_id : tenantId,
            owner_user_id: userRole === 'super_admin' ? quizData.owner_user_id : userId
          }

          const { data: quiz, error } = await supabaseClient
            .from('quiz_blueprints')
            .insert(quizWithTenant)
            .select()
            .single()

          if (error) {
            return new Response(
              JSON.stringify({ message: error.message }),
              { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
          }

          return new Response(
            JSON.stringify({ quiz }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        return new Response('Method not allowed', { status: 405, headers: corsHeaders })
      }

      case `/${path.split('/')[1]}`: {
        const quizId = path.split('/')[1]

        if (req.method === 'GET') {
          const hasAccess = await verifyQuizAccess(quizId, userId, tenantId, userRole, 'read')
          if (!hasAccess) {
            return new Response(
              JSON.stringify({ message: 'Access denied', code: 'ACCESS_DENIED' }),
              { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
          }

          const { data: quiz, error } = await supabaseClient
            .from('quiz_blueprints')
            .select(`
              *,
              owner:owner_user_id (first_name, last_name, email),
              questions:quiz_questions (*)
            `)
            .eq('id', quizId)
            .single()

          if (error) {
            return new Response(
              JSON.stringify({ message: error.message }),
              { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
          }

          return new Response(
            JSON.stringify({ quiz }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        if (req.method === 'PUT') {
          const hasAccess = await verifyQuizAccess(quizId, userId, tenantId, userRole, 'write')
          if (!hasAccess) {
            return new Response(
              JSON.stringify({ message: 'Access denied', code: 'ACCESS_DENIED' }),
              { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
          }

          const updates = await req.json()

          const { data: quiz, error } = await supabaseClient
            .from('quiz_blueprints')
            .update(updates)
            .eq('id', quizId)
            .select()
            .single()

          if (error) {
            return new Response(
              JSON.stringify({ message: error.message }),
              { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
          }

          return new Response(
            JSON.stringify({ quiz }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        if (req.method === 'DELETE') {
          const hasAccess = await verifyQuizAccess(quizId, userId, tenantId, userRole, 'delete')
          if (!hasAccess) {
            return new Response(
              JSON.stringify({ message: 'Access denied', code: 'ACCESS_DENIED' }),
              { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
          }

          const { error } = await supabaseClient
            .from('quiz_blueprints')
            .delete()
            .eq('id', quizId)

          if (error) {
            return new Response(
              JSON.stringify({ message: error.message }),
              { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
          }

          return new Response(
            JSON.stringify({ message: 'Quiz deleted successfully' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        return new Response('Method not allowed', { status: 405, headers: corsHeaders })
      }

      case `/${path.split('/')[1]}/verify-access`: {
        if (req.method !== 'POST') {
          return new Response('Method not allowed', { status: 405, headers: corsHeaders })
        }

        const quizId = path.split('/')[1]
        const { action = 'read' } = await req.json()

        const hasAccess = await verifyQuizAccess(quizId, userId, tenantId, userRole, action)

        return new Response(
          JSON.stringify({ hasAccess }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      case `/${path.split('/')[1]}/duplicate`: {
        if (req.method !== 'POST') {
          return new Response('Method not allowed', { status: 405, headers: corsHeaders })
        }

        if (userRole === 'student') {
          return new Response(
            JSON.stringify({ message: 'Students cannot duplicate quizzes', code: 'INSUFFICIENT_PERMISSIONS' }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        const quizId = path.split('/')[1]
        const hasAccess = await verifyQuizAccess(quizId, userId, tenantId, userRole, 'read')
        if (!hasAccess) {
          return new Response(
            JSON.stringify({ message: 'Access denied', code: 'ACCESS_DENIED' }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        // Get original quiz
        const { data: originalQuiz, error: fetchError } = await supabaseClient
          .from('quiz_blueprints')
          .select(`
            *,
            questions:quiz_questions (*)
          `)
          .eq('id', quizId)
          .single()

        if (fetchError || !originalQuiz) {
          return new Response(
            JSON.stringify({ message: 'Quiz not found' }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        // Create duplicate
        const { data: newQuiz, error: createError } = await supabaseClient
          .from('quiz_blueprints')
          .insert({
            title: `${originalQuiz.title} (Copy)`,
            description: originalQuiz.description,
            tenant_id: userRole === 'super_admin' ? originalQuiz.tenant_id : tenantId,
            owner_user_id: userRole === 'super_admin' ? originalQuiz.owner_user_id : userId,
            status: 'draft',
            settings: originalQuiz.settings
          })
          .select()
          .single()

        if (createError) {
          return new Response(
            JSON.stringify({ message: createError.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        // Duplicate questions
        if (originalQuiz.questions && originalQuiz.questions.length > 0) {
          const questionsToInsert = originalQuiz.questions.map(q => ({
            quiz_blueprint_id: newQuiz.id,
            question_type: q.question_type,
            question_text: q.question_text,
            options: q.options,
            correct_answer: q.correct_answer,
            points: q.points,
            explanation: q.explanation,
            media_url: q.media_url,
            order_index: q.order_index
          }))

          await supabaseClient
            .from('quiz_questions')
            .insert(questionsToInsert)
        }

        return new Response(
          JSON.stringify({ quiz: newQuiz }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      case `/${path.split('/')[1]}/publish`: {
        if (req.method !== 'POST') {
          return new Response('Method not allowed', { status: 405, headers: corsHeaders })
        }

        if (userRole === 'student') {
          return new Response(
            JSON.stringify({ message: 'Students cannot publish quizzes', code: 'INSUFFICIENT_PERMISSIONS' }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        const quizId = path.split('/')[1]
        const hasAccess = await verifyQuizAccess(quizId, userId, tenantId, userRole, 'write')
        if (!hasAccess) {
          return new Response(
            JSON.stringify({ message: 'Access denied', code: 'ACCESS_DENIED' }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        const { data: quiz, error } = await supabaseClient
          .from('quiz_blueprints')
          .update({ status: 'published' })
          .eq('id', quizId)
          .select()
          .single()

        if (error) {
          return new Response(
            JSON.stringify({ message: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        return new Response(
          JSON.stringify({ quiz }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      default:
        return new Response('Endpoint not found', { status: 404, headers: corsHeaders })
    }
  } catch (error) {
    console.error('Quiz API error:', error)
    return new Response(
      JSON.stringify({ message: 'Internal server error', code: 'INTERNAL_ERROR' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})