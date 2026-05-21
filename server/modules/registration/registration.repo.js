import { query, oneOrNone } from '../../db/query.js';
import { withTransaction } from '../../db/tx.js';

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

export async function findMigratedProfileForClaim({
  identifier,
  email,
  username,
}) {
  if (identifier) {
    return oneOrNone(
      `
        with input as (
          select
            lower($1::text) as value,
            regexp_replace($1::text, '[^0-9]', '', 'g') as phone_digits
        )
        select
          p.id,
          p.email,
          p.username,
          p.phone,
          p.full_name,
          p.first_name,
          p.last_name,
          p.subscription_status,
          p.registration_stage,
          case
            when lower(coalesce(p.email, '')) = input.value then 'email'
            when lower(coalesce(p.username, '')) = input.value then 'username'
            when length(input.phone_digits) >= 5
              and regexp_replace(coalesce(p.phone, ''), '[^0-9]', '', 'g') = input.phone_digits
              then 'phone'
            else 'unknown'
          end as identifier_type
        from public.profiles p
        cross join input
        where lower(coalesce(p.email, '')) = input.value
           or lower(coalesce(p.username, '')) = input.value
           or (
             length(input.phone_digits) >= 5
             and regexp_replace(coalesce(p.phone, ''), '[^0-9]', '', 'g') = input.phone_digits
           )
        order by
          case
            when lower(coalesce(p.email, '')) = input.value then 1
            when lower(coalesce(p.username, '')) = input.value then 2
            else 3
          end,
          p.updated_at desc nulls last
        limit 1
      `,
      [identifier]
    );
  }

  return oneOrNone(
    `
      select
        p.id,
        p.email,
        p.username,
        p.phone,
        p.full_name,
        p.first_name,
        p.last_name,
        p.subscription_status,
        p.registration_stage,
        'legacy' as identifier_type
      from public.profiles p
      where lower(p.email) = $1
        and lower(p.username) = $2
      limit 1
    `,
    [email, username]
  );
}

export async function findLatestSuccessfulPaymentReference(userId) {
  const row = await oneOrNone(
    `
      select reference
      from public.payment_transactions
      where user_id = $1
        and provider = 'paystack'
        and status = 'success'
      order by paid_at desc nulls last, created_at desc
      limit 1
    `,
    [userId]
  );
  return row?.reference || null;
}

export async function claimMigratedProfileCredentials({
  profile,
  passwordHash,
}) {
  const email =
    profile.email ||
    `${String(profile.username || profile.id).toLowerCase()}@migrated.academicnightingale.local`;
  const fullName =
    profile.full_name ||
    [profile.first_name, profile.last_name].filter(Boolean).join(' ') ||
    profile.username ||
    email;

  return withTransaction(async (client) => {
    await client.query(
      `
        insert into auth.users (id, email, raw_user_meta_data, raw_app_meta_data)
        values ($1, $2, '{}'::jsonb, '{}'::jsonb)
        on conflict (id) do update
        set email = excluded.email,
            updated_at = now()
      `,
      [profile.id, email]
    );

    await client.query(
      `
        insert into public."user" (id, name, email, "emailVerified", image, "createdAt", "updatedAt")
        values ($1, $2, $3, true, null, now(), now())
        on conflict (id) do update
        set name = excluded.name,
            email = excluded.email,
            "updatedAt" = now()
      `,
      [profile.id, fullName, email]
    );

    const accountUpdate = await client.query(
      `
        update public.account
        set password = $2,
            "accountId" = $1::text,
            "updatedAt" = now()
        where "userId" = $1::uuid
          and "providerId" = 'credential'
      `,
      [profile.id, passwordHash]
    );

    if (!accountUpdate.rowCount) {
      await client.query(
        `
          insert into public.account (
            id,
            "accountId",
            "providerId",
            "userId",
            password,
            "createdAt",
            "updatedAt"
          )
          values (gen_random_uuid(), $1::text, 'credential', $1::uuid, $2, now(), now())
        `,
        [profile.id, passwordHash]
      );
    }

    await client.query(
      `
        update public.profiles
        set email = $2,
            registration_stage = case
              when registration_stage is null or registration_stage = 'profile_created' then 'active'
              else registration_stage
            end,
            updated_at = now()
        where id = $1
      `,
      [profile.id, email]
    );

    const sessionTable = await client.query(
      "select to_regclass('public.session') as table_name"
    );
    if (sessionTable.rows[0]?.table_name) {
      await client.query('delete from public.session where "userId" = $1', [
        profile.id,
      ]);
    }
  });
}
