import { query, oneOrNone } from '../../db/query.js';

const ACTIVE_STATUSES = ['active', 'trialing'];

export async function findActiveProfileByEmail(email) {
  return oneOrNone(
    `
      select id, subscription_status
      from public.profiles
      where lower(email) = $1
        and subscription_status = any($2)
      limit 1
    `,
    [email, ACTIVE_STATUSES]
  );
}

export async function findActiveProfileByPhone(phone) {
  if (!phone) return null;
  return oneOrNone(
    `
      select id, subscription_status
      from public.profiles
      where phone = $1
        and subscription_status = any($2)
      limit 1
    `,
    [phone, ACTIVE_STATUSES]
  );
}

export async function findProfileByUsername(username) {
  return oneOrNone(
    `
      select id
      from public.profiles
      where lower(username) = $1
      limit 1
    `,
    [username]
  );
}

export async function findPlanSnapshot(planId) {
  if (!planId) return null;

  return oneOrNone(
    `
      select
        sp.id,
        sp.code,
        sp.name,
        sp.price,
        sp.currency,
        sp.questions,
        sp.quizzes,
        sp.participants,
        sp.daily_question_limit,
        sp.duration_days,
        jsonb_build_object(
          'id', prod.id,
          'code', prod.code,
          'name', prod.name,
          'department_id', prod.department_id,
          'department', case
            when dept.id is null then null
            else jsonb_build_object(
              'id', dept.id,
              'name', dept.name,
              'slug', dept.slug
            )
          end
        ) as product
      from public.subscription_plans sp
      left join public.subscription_products prod on prod.id = sp.product_id
      left join public.departments dept on dept.id = prod.department_id
      where sp.id = $1
      limit 1
    `,
    [planId]
  );
}

export async function insertCompatAuthUser({ id, email }) {
  await query(
    `
      insert into auth.users (id, email, raw_user_meta_data, raw_app_meta_data)
      values ($1, $2, '{}'::jsonb, '{}'::jsonb)
      on conflict (id) do update
      set email = excluded.email,
          updated_at = now()
    `,
    [id, email]
  );
}

export async function upsertPendingProfile({
  userId,
  email,
  firstName,
  lastName,
  phone,
  username,
  planId,
  planSnapshot,
  registrationTokenHash,
  registrationTokenExpiresAt,
}) {
  const fullName = `${firstName} ${lastName}`.trim();
  const selectedAt = new Date();
  const pendingExpiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000);

  const result = await query(
    `
      insert into public.profiles (
        id,
        email,
        first_name,
        last_name,
        phone,
        username,
        full_name,
        subscription_status,
        registration_token,
        registration_token_expires_at,
        registration_stage,
        pending_plan_id,
        pending_plan_snapshot,
        pending_plan_selected_at,
        pending_plan_expires_at
      )
      values (
        $1, $2, $3, $4, $5, $6, $7,
        'pending_payment',
        $8, $9,
        'awaiting_payment',
        $10, $11::jsonb, $12, $13
      )
      on conflict (id) do update
      set email = excluded.email,
          first_name = excluded.first_name,
          last_name = excluded.last_name,
          phone = excluded.phone,
          username = excluded.username,
          full_name = excluded.full_name,
          subscription_status = excluded.subscription_status,
          registration_token = excluded.registration_token,
          registration_token_expires_at = excluded.registration_token_expires_at,
          registration_stage = excluded.registration_stage,
          pending_plan_id = excluded.pending_plan_id,
          pending_plan_snapshot = excluded.pending_plan_snapshot,
          pending_plan_selected_at = excluded.pending_plan_selected_at,
          pending_plan_expires_at = excluded.pending_plan_expires_at,
          updated_at = now()
      returning id, username, pending_plan_id, pending_plan_snapshot, registration_stage
    `,
    [
      userId,
      email,
      firstName,
      lastName,
      phone || null,
      username,
      fullName || null,
      registrationTokenHash,
      registrationTokenExpiresAt,
      planId || null,
      planSnapshot ? JSON.stringify(planSnapshot) : null,
      selectedAt,
      pendingExpiresAt,
    ]
  );

  return result.rows[0];
}

export async function deleteBetterAuthUser(userId) {
  await query('delete from public."user" where id = $1', [userId]);
}

export async function deleteCompatAuthUser(userId) {
  await query('delete from auth.users where id = $1', [userId]);
}

export async function findRegistrationStatus(userId) {
  return oneOrNone(
    `
      select
        id,
        subscription_status,
        registration_stage,
        pending_checkout_reference,
        pending_plan_id
      from public.profiles
      where id = $1
      limit 1
    `,
    [userId]
  );
}
