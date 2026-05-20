import { withTransaction } from '../../db/tx.js';
import { query } from '../../db/query.js';

async function withUserClaims(user, callback) {
  return withTransaction(async (client) => {
    await client.query(`select set_config('request.jwt.claim.sub', $1, true)`, [
      user.id,
    ]);
    await client.query(
      `select set_config('request.jwt.claim.role', 'authenticated', true)`
    );
    if (user.email) {
      await client.query(
        `select set_config('request.jwt.claim.email', $1, true)`,
        [user.email]
      );
    }
    return callback(client);
  });
}

export async function getActiveAnnouncement() {
  const result = await query(`
    select id, message, created_at
    from public.global_announcements
    where is_active = true
    order by created_at desc
    limit 1
  `);
  return result.rows[0] || null;
}

export async function getUserScheduleHealth(user) {
  return withUserClaims(user, async (client) => {
    const result = await client.query(
      `select public.get_user_schedule_health() as health`
    );
    return result.rows[0]?.health || null;
  });
}

export async function getUserSubscriptions(userId) {
  const result = await query(
    `
      select
        us.id,
        us.status,
        us.started_at,
        us.expires_at,
        us.purchased_at,
        us.quantity,
        us.renewed_from_subscription_id,
        jsonb_build_object(
          'id', sp.id,
          'name', sp.name,
          'duration_days', sp.duration_days,
          'price', sp.price,
          'currency', sp.currency,
          'daily_question_limit', sp.daily_question_limit,
          'plan_tier', sp.plan_tier,
          'metadata', coalesce(sp.metadata, '{}'::jsonb),
          'product', jsonb_build_object(
            'id', prod.id,
            'name', prod.name,
            'department_id', prod.department_id,
            'department', case
              when d.id is null then null
              else jsonb_build_object(
                'id', d.id,
                'name', d.name,
                'slug', d.slug,
                'color_theme', d.color_theme
              )
            end
          )
        ) as plan
      from public.user_subscriptions us
      join public.subscription_plans sp on sp.id = us.plan_id
      join public.subscription_products prod on prod.id = sp.product_id
      left join public.departments d on d.id = prod.department_id
      where us.user_id = $1
      order by us.expires_at asc nulls last, us.started_at asc
    `,
    [userId]
  );
  return result.rows;
}

export async function setDefaultSubscriptionForUser(user, subscriptionId) {
  return withUserClaims(user, async (client) => {
    const result = await client.query(
      `select public.set_default_subscription($1::uuid) as value`,
      [subscriptionId || null]
    );
    return result.rows[0]?.value || { default_subscription_id: subscriptionId };
  });
}

export async function getTodaysQuiz(userId) {
  const today = new Date().toISOString().slice(0, 10);
  const result = await query(
    `
      select
        id,
        status,
        total_questions,
        correct_answers,
        started_at,
        completed_at,
        assigned_date,
        subscription_id
      from public.daily_quizzes
      where user_id = $1
        and assigned_date = $2
      limit 1
    `,
    [userId, today]
  );
  return result.rows[0] || null;
}

export async function generateDailyQuizForUser(user, subscriptionId) {
  return withUserClaims(user, async (client) => {
    const result = await client.query(
      `select * from public.generate_daily_quiz($1::uuid, null::integer)`,
      [subscriptionId || null]
    );
    return {
      dailyQuizId: result.rows[0]?.daily_quiz_id || null,
    };
  });
}

export async function getQuizHistory(userId, limit = 30) {
  const result = await query(
    `
      select
        id,
        assigned_date,
        status,
        total_questions,
        correct_answers,
        completed_at
      from public.daily_quizzes
      where user_id = $1
      order by assigned_date desc
      limit $2
    `,
    [userId, limit]
  );
  return result.rows;
}
