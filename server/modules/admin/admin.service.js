import { randomBytes } from 'node:crypto';
import { auth } from '../../auth/betterAuth.js';
import { query } from '../../db/query.js';
import { withTransaction } from '../../db/tx.js';
import { badRequest, notFound } from '../../utils/httpError.js';
import { insertCompatAuthUser } from '../registration/registration.repo.js';

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function cleanText(value) {
  return typeof value === 'string' ? value.trim() : value;
}

function coerceBoolean(value, fallback = true) {
  return typeof value === 'boolean' ? value : fallback;
}

function readActiveFlag(payload, fallback = true) {
  if (typeof payload?.is_active === 'boolean') return payload.is_active;
  if (typeof payload?.isActive === 'boolean') return payload.isActive;
  return fallback;
}

function coerceNumber(value, fallback = null) {
  if (value === null || value === undefined || value === '') return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function generatePassword() {
  return randomBytes(9).toString('base64url');
}

async function refreshTopicQuestionCount(client, topicId) {
  await client.query(
    `
      update public.topics t
      set question_count = (
        select count(*)::integer
        from public.questions q
        where q.topic_id = t.id
      )
      where t.id = $1
    `,
    [topicId]
  );
}

async function getQuestionById(client, questionId) {
  const result = await client.query(
    `
      select
        q.*,
        coalesce(
          jsonb_agg(
            jsonb_build_object(
              'id', qo.id,
              'label', qo.label,
              'content', qo.content,
              'is_correct', qo.is_correct,
              'order_index', qo.order_index
            )
            order by qo.order_index asc, qo.label asc
          ) filter (where qo.id is not null),
          '[]'::jsonb
        ) as question_options
      from public.questions q
      left join public.question_options qo on qo.question_id = q.id
      where q.id = $1
      group by q.id
      limit 1
    `,
    [questionId]
  );
  return result.rows[0] || null;
}

function normalizeQuestionPayload(payload) {
  const stem = cleanText(payload?.stem);
  if (!stem) throw badRequest('Question stem is required.');

  const options = Array.isArray(payload?.options) ? payload.options : [];
  if (options.length < 2) {
    throw badRequest('At least two answer options are required.');
  }
  if (!options.some((option) => option?.isCorrect || option?.is_correct)) {
    throw badRequest('At least one answer option must be marked correct.');
  }

  return {
    stem,
    explanation: cleanText(payload?.explanation) || null,
    imageUrl:
      cleanText(payload?.image_url) || cleanText(payload?.imageUrl) || null,
    options: options.map((option, index) => ({
      label:
        cleanText(option.label) ||
        String.fromCharCode('A'.charCodeAt(0) + index),
      content: cleanText(option.content),
      isCorrect: Boolean(option.isCorrect || option.is_correct),
      orderIndex: Number.isFinite(Number(option.order ?? option.order_index))
        ? Number(option.order ?? option.order_index)
        : index,
    })),
  };
}

async function userTableExists(client) {
  const result = await client.query(
    'select to_regclass(\'public."user"\') as table_name'
  );
  return Boolean(result.rows[0]?.table_name);
}

export async function getAdminStats() {
  const result = await query(`
    select
      (select count(*)::integer from public.profiles) as total_users,
      (select count(*)::integer from public.user_subscriptions where status in ('active', 'trialing')) as active_subscriptions,
      (select count(*)::integer from public.questions) as total_questions,
      coalesce((
        select sum(coalesce(price, 0))::numeric
        from public.user_subscriptions
        where status in ('active', 'trialing')
          and purchased_at >= date_trunc('month', now())
      ), 0) as monthly_revenue
  `);
  return result.rows[0];
}

export async function listDepartments() {
  const result = await query(
    'select * from public.departments order by name asc'
  );
  return result.rows;
}

export async function createDepartment(payload) {
  const name = cleanText(payload?.name);
  if (!name) throw badRequest('Department name is required.');
  const result = await query(
    `
      insert into public.departments (name, slug, color_theme)
      values ($1, $2, $3)
      returning *
    `,
    [
      name,
      slugify(payload?.slug || name),
      cleanText(payload?.color) || 'nursing',
    ]
  );
  return result.rows[0];
}

export async function updateDepartment(id, payload) {
  const name = cleanText(payload?.name);
  if (!name) throw badRequest('Department name is required.');
  const result = await query(
    `
      update public.departments
      set name = $2, slug = $3, color_theme = $4, updated_at = now()
      where id = $1
      returning *
    `,
    [
      id,
      name,
      slugify(payload?.slug || name),
      cleanText(payload?.color) || 'nursing',
    ]
  );
  if (!result.rows[0]) throw notFound('Department was not found.');
  return result.rows[0];
}

export async function deleteDepartment(id) {
  await query('delete from public.departments where id = $1', [id]);
}

export async function listCourses(departmentId) {
  const result = await query(
    `
      select *
      from public.courses
      where ($1::uuid is null or department_id = $1)
      order by name asc
    `,
    [departmentId || null]
  );
  return result.rows;
}

export async function getCourse(id) {
  const result = await query('select * from public.courses where id = $1', [
    id,
  ]);
  if (!result.rows[0]) throw notFound('Course was not found.');
  return result.rows[0];
}

export async function createCourse(departmentId, payload) {
  const name = cleanText(payload?.name);
  if (!departmentId || !name)
    throw badRequest('Department and course name are required.');
  const result = await query(
    `
      insert into public.courses (department_id, name, slug, description)
      values ($1, $2, $3, $4)
      returning *
    `,
    [
      departmentId,
      name,
      slugify(payload?.slug || name),
      cleanText(payload?.description) || null,
    ]
  );
  return result.rows[0];
}

export async function updateCourse(id, payload) {
  const existing = await getCourse(id);
  const name = cleanText(payload?.name) || existing.name;
  const result = await query(
    `
      update public.courses
      set name = $2, slug = $3, description = $4, updated_at = now()
      where id = $1
      returning *
    `,
    [
      id,
      name,
      slugify(payload?.slug || name),
      cleanText(payload?.description) || null,
    ]
  );
  return result.rows[0];
}

export async function deleteCourse(id) {
  await query('delete from public.courses where id = $1', [id]);
}

export async function listTopics(courseId) {
  const result = await query(
    `
      select *
      from public.topics
      where ($1::uuid is null or course_id = $1)
      order by name asc
    `,
    [courseId || null]
  );
  return result.rows;
}

export async function getTopic(id) {
  const result = await query('select * from public.topics where id = $1', [id]);
  if (!result.rows[0]) throw notFound('Topic was not found.');
  return result.rows[0];
}

export async function createTopic(courseId, payload) {
  const name = cleanText(payload?.name);
  if (!courseId || !name)
    throw badRequest('Course and topic name are required.');
  const result = await query(
    `
      insert into public.topics (course_id, name, slug)
      values ($1, $2, $3)
      returning *
    `,
    [courseId, name, slugify(payload?.slug || name)]
  );
  return result.rows[0];
}

export async function updateTopic(id, payload) {
  const existing = await getTopic(id);
  const name = cleanText(payload?.name) || existing.name;
  const result = await query(
    `
      update public.topics
      set name = $2, slug = $3, updated_at = now()
      where id = $1
      returning *
    `,
    [id, name, slugify(payload?.slug || name)]
  );
  return result.rows[0];
}

export async function deleteTopic(id) {
  await query('delete from public.topics where id = $1', [id]);
}

export async function listQuestions(topicId) {
  const result = await query(
    `
      select
        q.*,
        q.metadata->>'image_url' as image_url,
        coalesce(
          jsonb_agg(
            jsonb_build_object(
              'id', qo.id,
              'label', qo.label,
              'content', qo.content,
              'is_correct', qo.is_correct,
              'order_index', qo.order_index
            )
            order by qo.order_index asc, qo.label asc
          ) filter (where qo.id is not null),
          '[]'::jsonb
        ) as question_options
      from public.questions q
      left join public.question_options qo on qo.question_id = q.id
      where q.topic_id = $1
      group by q.id
      order by q.created_at desc
    `,
    [topicId]
  );
  return result.rows;
}

export async function createQuestion(topicId, payload) {
  const normalized = normalizeQuestionPayload(payload);
  return withTransaction(async (client) => {
    const questionResult = await client.query(
      `
        insert into public.questions (topic_id, stem, explanation, metadata)
        values ($1, $2, $3, jsonb_strip_nulls(jsonb_build_object('image_url', $4::text)))
        returning *
      `,
      [topicId, normalized.stem, normalized.explanation, normalized.imageUrl]
    );
    const question = questionResult.rows[0];

    for (const option of normalized.options) {
      if (!option.content)
        throw badRequest('Answer option content is required.');
      await client.query(
        `
          insert into public.question_options (question_id, label, content, is_correct, order_index)
          values ($1, $2, $3, $4, $5)
        `,
        [
          question.id,
          option.label,
          option.content,
          option.isCorrect,
          option.orderIndex,
        ]
      );
    }

    await refreshTopicQuestionCount(client, topicId);
    return getQuestionById(client, question.id);
  });
}

export async function updateQuestion(questionId, payload) {
  const normalized = normalizeQuestionPayload(payload);
  return withTransaction(async (client) => {
    const current = await getQuestionById(client, questionId);
    if (!current) throw notFound('Question was not found.');

    await client.query(
      `
        update public.questions
        set stem = $2,
            explanation = $3,
            metadata = jsonb_strip_nulls(coalesce(metadata, '{}'::jsonb) || jsonb_build_object('image_url', $4::text)),
            updated_at = now()
        where id = $1
      `,
      [questionId, normalized.stem, normalized.explanation, normalized.imageUrl]
    );
    await client.query(
      'delete from public.question_options where question_id = $1',
      [questionId]
    );
    for (const option of normalized.options) {
      if (!option.content)
        throw badRequest('Answer option content is required.');
      await client.query(
        `
          insert into public.question_options (question_id, label, content, is_correct, order_index)
          values ($1, $2, $3, $4, $5)
        `,
        [
          questionId,
          option.label,
          option.content,
          option.isCorrect,
          option.orderIndex,
        ]
      );
    }
    await refreshTopicQuestionCount(client, current.topic_id);
    return getQuestionById(client, questionId);
  });
}

export async function deleteQuestion(questionId) {
  await withTransaction(async (client) => {
    const current = await getQuestionById(client, questionId);
    if (!current) return;
    await client.query('delete from public.questions where id = $1', [
      questionId,
    ]);
    await refreshTopicQuestionCount(client, current.topic_id);
  });
}

export async function listSubscriptionProductsDetailed() {
  const { rows: products } = await query(`
    select
      p.*,
      case when d.id is null then null else jsonb_build_object(
        'id', d.id,
        'name', d.name,
        'slug', d.slug,
        'color_theme', d.color_theme
      ) end as department
    from public.subscription_products p
    left join public.departments d on d.id = p.department_id
    order by p.name asc
  `);
  const { rows: plans } = await query(
    'select * from public.subscription_plans order by price asc, name asc'
  );
  const plansByProduct = new Map();
  for (const plan of plans) {
    const list = plansByProduct.get(plan.product_id) || [];
    list.push(plan);
    plansByProduct.set(plan.product_id, list);
  }
  return products.map((product) => ({
    ...product,
    subscription_plans: plansByProduct.get(product.id) || [],
  }));
}

export async function createSubscriptionProduct(payload) {
  const code = slugify(payload?.code);
  const name = cleanText(payload?.name);
  if (!code || !name) throw badRequest('Product code and name are required.');
  const result = await query(
    `
      insert into public.subscription_products
        (code, name, product_type, description, department_id, is_active)
      values ($1, $2, $3, $4, $5, $6)
      returning *
    `,
    [
      code,
      name,
      cleanText(payload?.product_type) || 'cbt',
      cleanText(payload?.description) || null,
      payload?.department_id || null,
      coerceBoolean(payload?.is_active, true),
    ]
  );
  return result.rows[0];
}

export async function updateSubscriptionProduct(id, payload) {
  const code = slugify(payload?.code);
  const name = cleanText(payload?.name);
  if (!code || !name) throw badRequest('Product code and name are required.');
  const result = await query(
    `
      update public.subscription_products
      set code = $2,
          name = $3,
          product_type = $4,
          description = $5,
          department_id = $6,
          is_active = $7,
          updated_at = now()
      where id = $1
      returning *
    `,
    [
      id,
      code,
      name,
      cleanText(payload?.product_type) || 'cbt',
      cleanText(payload?.description) || null,
      payload?.department_id || null,
      coerceBoolean(payload?.is_active, true),
    ]
  );
  if (!result.rows[0]) throw notFound('Subscription product was not found.');
  return result.rows[0];
}

export async function deleteSubscriptionProduct(id) {
  await query('delete from public.subscription_products where id = $1', [id]);
}

export async function createSubscriptionPlan(productId, payload) {
  const code = slugify(payload?.code);
  const name = cleanText(payload?.name);
  if (!productId || !code || !name) {
    throw badRequest('Product, plan code, and plan name are required.');
  }
  const result = await query(
    `
      insert into public.subscription_plans
        (product_id, code, name, price, currency, questions, quizzes, participants,
         is_active, daily_question_limit, duration_days, plan_tier, quiz_duration_minutes)
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      returning *
    `,
    [
      productId,
      code,
      name,
      coerceNumber(payload?.price, 0),
      cleanText(payload?.currency) || 'NGN',
      coerceNumber(payload?.questions),
      coerceNumber(payload?.quizzes),
      coerceNumber(payload?.participants),
      coerceBoolean(payload?.is_active, true),
      coerceNumber(payload?.daily_question_limit, 0),
      coerceNumber(payload?.duration_days, 30),
      cleanText(payload?.plan_tier) || null,
      coerceNumber(payload?.quiz_duration_minutes),
    ]
  );
  return result.rows[0];
}

export async function updateSubscriptionPlan(id, payload) {
  const code = slugify(payload?.code);
  const name = cleanText(payload?.name);
  if (!code || !name) throw badRequest('Plan code and name are required.');
  const result = await query(
    `
      update public.subscription_plans
      set code = $2,
          name = $3,
          price = $4,
          currency = $5,
          questions = $6,
          quizzes = $7,
          participants = $8,
          is_active = $9,
          daily_question_limit = $10,
          duration_days = $11,
          plan_tier = $12,
          quiz_duration_minutes = $13,
          updated_at = now()
      where id = $1
      returning *
    `,
    [
      id,
      code,
      name,
      coerceNumber(payload?.price, 0),
      cleanText(payload?.currency) || 'NGN',
      coerceNumber(payload?.questions),
      coerceNumber(payload?.quizzes),
      coerceNumber(payload?.participants),
      coerceBoolean(payload?.is_active, true),
      coerceNumber(payload?.daily_question_limit, 0),
      coerceNumber(payload?.duration_days, 30),
      cleanText(payload?.plan_tier) || null,
      coerceNumber(payload?.quiz_duration_minutes),
    ]
  );
  if (!result.rows[0]) throw notFound('Subscription plan was not found.');
  return result.rows[0];
}

export async function deleteSubscriptionPlan(id) {
  await query('delete from public.subscription_plans where id = $1', [id]);
}

export async function listProfiles() {
  const { rows: profiles } = await query(`
    select
      p.*,
      case when d.id is null then null else jsonb_build_object(
        'id', d.id,
        'name', d.name,
        'slug', d.slug,
        'color_theme', d.color_theme
      ) end as departments
    from public.profiles p
    left join public.departments d on d.id = p.department_id
    order by p.created_at desc
  `);

  if (!profiles.length) return [];

  const { rows: subscriptions } = await query(
    `
      select
        us.*,
        jsonb_build_object(
          'id', sp.id,
          'code', sp.code,
          'name', sp.name,
          'price', sp.price,
          'currency', sp.currency,
          'daily_question_limit', sp.daily_question_limit,
          'duration_days', sp.duration_days,
          'plan_tier', sp.plan_tier,
          'subscription_products', case when prod.id is null then null else jsonb_build_object(
            'id', prod.id,
            'name', prod.name,
            'code', prod.code,
            'department_id', prod.department_id,
            'departments', case when dept.id is null then null else jsonb_build_object(
              'id', dept.id,
              'name', dept.name,
              'slug', dept.slug,
              'color_theme', dept.color_theme
            ) end
          ) end
        ) as subscription_plans
      from public.user_subscriptions us
      left join public.subscription_plans sp on sp.id = us.plan_id
      left join public.subscription_products prod on prod.id = sp.product_id
      left join public.departments dept on dept.id = prod.department_id
      where us.user_id = any($1::uuid[])
      order by us.started_at desc
    `,
    [profiles.map((profile) => profile.id)]
  );

  const subscriptionsByUser = new Map();
  for (const subscription of subscriptions) {
    const list = subscriptionsByUser.get(subscription.user_id) || [];
    list.push(subscription);
    subscriptionsByUser.set(subscription.user_id, list);
  }

  return profiles.map((profile) => ({
    ...profile,
    user_subscriptions: subscriptionsByUser.get(profile.id) || [],
  }));
}

export async function listPlanLearners(planId) {
  const result = await query(
    `
      select
        us.*,
        jsonb_build_object(
          'id', p.id,
          'full_name', p.full_name,
          'email', p.email,
          'username', p.username,
          'last_seen_at', p.last_seen_at
        ) as profiles
      from public.user_subscriptions us
      left join public.profiles p on p.id = us.user_id
      where us.plan_id = $1
      order by us.started_at desc
    `,
    [planId]
  );
  return result.rows;
}

export async function updateUserProfileStatus(userId, status) {
  const normalized = cleanText(status);
  if (!normalized) throw badRequest('Status is required.');
  const result = await query(
    `
      update public.profiles
      set subscription_status = $2, updated_at = now()
      where id = $1
      returning *
    `,
    [userId, normalized]
  );
  if (!result.rows[0]) throw notFound('User profile was not found.');
  return result.rows[0];
}

export async function adminUpdateUser(payload) {
  if (payload?.password) {
    throw badRequest(
      'Password changes are not available in this admin release.'
    );
  }
  const userId = payload?.userId;
  if (!userId) throw badRequest('User ID is required.');

  return withTransaction(async (client) => {
    const fullName = cleanText(payload?.fullName);
    const username = cleanText(payload?.username);
    const email = cleanText(payload?.email);
    const departmentId = payload?.departmentId || null;

    const profileResult = await client.query(
      `
        update public.profiles
        set full_name = coalesce($2, full_name),
            username = coalesce($3, username),
            email = coalesce($4, email),
            department_id = $5,
            updated_at = now()
        where id = $1
        returning *
      `,
      [userId, fullName || null, username || null, email || null, departmentId]
    );
    if (!profileResult.rows[0]) throw notFound('User profile was not found.');

    if (email) {
      await client.query(
        'update auth.users set email = $2, updated_at = now() where id = $1',
        [userId, email]
      );
      if (await userTableExists(client)) {
        await client.query(
          'update public."user" set email = $2, "updatedAt" = now() where id = $1',
          [userId, email]
        );
      }
    }

    if (payload?.planId) {
      const plan = await client.query(
        'select * from public.subscription_plans where id = $1',
        [payload.planId]
      );
      if (!plan.rows[0]) throw notFound('Subscription plan was not found.');
      const expiresAt =
        cleanText(payload.planExpiresAt) ||
        new Date(
          Date.now() + Number(plan.rows[0].duration_days || 30) * 86400000
        ).toISOString();

      await client.query(
        `
          update public.user_subscriptions
          set status = 'canceled', canceled_at = now(), updated_at = now()
          where user_id = $1 and status in ('active', 'trialing', 'past_due')
        `,
        [userId]
      );
      const subscription = await client.query(
        `
          insert into public.user_subscriptions
            (user_id, plan_id, status, started_at, expires_at, purchased_at, price, currency)
          values ($1, $2, 'active', now(), $3, now(), $4, $5)
          returning *
        `,
        [
          userId,
          payload.planId,
          expiresAt,
          plan.rows[0].price,
          plan.rows[0].currency,
        ]
      );
      await client.query(
        `
          update public.profiles
          set default_subscription_id = $2,
              subscription_status = 'active',
              registration_stage = 'active',
              updated_at = now()
          where id = $1
        `,
        [userId, subscription.rows[0].id]
      );
    }

    return profileResult.rows[0];
  });
}

export async function deleteUser(userId) {
  await withTransaction(async (client) => {
    await client.query('delete from public.profiles where id = $1', [userId]);
    await client.query('delete from auth.users where id = $1', [userId]);
    if (await userTableExists(client)) {
      await client
        .query('delete from public.session where "userId" = $1', [userId])
        .catch(() => {});
      await client
        .query('delete from public.account where "userId" = $1', [userId])
        .catch(() => {});
      await client.query('delete from public."user" where id = $1', [userId]);
    }
  });
}

export async function generateBulkCredentials(payload, headers) {
  const count = Math.min(
    Math.max(Number(payload?.count || payload?.quantity || 1), 1),
    200
  );
  const usernamePrefix = slugify(payload?.usernamePrefix || 'learner');
  const planId = payload?.planId || null;
  const departmentId = payload?.departmentId || null;
  const planExpiresAt = cleanText(payload?.planExpiresAt || payload?.expiresAt);
  const accounts = [];

  for (let index = 0; index < count; index += 1) {
    const password = generatePassword();
    const username = `${usernamePrefix}-${Date.now().toString(36)}-${index + 1}`;
    const email = `${username}@bulk.local`;
    const name = cleanText(payload?.fullNamePrefix)
      ? `${cleanText(payload.fullNamePrefix)} ${index + 1}`
      : username;
    const signUpResult = await auth.api.signUpEmail({
      headers,
      body: {
        email,
        password,
        name,
        rememberMe: false,
      },
    });
    const userId = signUpResult?.user?.id;
    if (!userId) throw new Error('Better Auth did not return a user ID.');

    await insertCompatAuthUser({ id: userId, email });
    await query(
      `
        insert into public.profiles
          (id, full_name, email, username, role, department_id, subscription_status, registration_stage)
        values ($1, $2, $3, $4, 'learner', $5, $6, $7)
      `,
      [
        userId,
        name,
        email,
        username,
        departmentId,
        planId ? 'active' : 'inactive',
        planId ? 'active' : 'profile_created',
      ]
    );

    if (planId) {
      await adminUpdateUser({ userId, planId, departmentId, planExpiresAt });
    }

    accounts.push({
      id: userId,
      email,
      username,
      password,
      full_name: name,
      expiresAt: planExpiresAt || null,
    });
  }

  return accounts;
}

export async function listGlobalAnnouncements() {
  const result = await query(
    'select * from public.global_announcements order by created_at desc'
  );
  return result.rows;
}

export async function createGlobalAnnouncement(payload, adminUserId) {
  const message = cleanText(payload?.message);
  if (!message) throw badRequest('Announcement message is required.');
  const result = await query(
    `
      insert into public.global_announcements (message, is_active, created_by)
      values ($1, $2, $3)
      returning *
    `,
    [message, readActiveFlag(payload, true), adminUserId]
  );
  return result.rows[0];
}

export async function updateGlobalAnnouncement(id, payload) {
  const existing = await query(
    'select * from public.global_announcements where id = $1',
    [id]
  );
  if (!existing.rows[0]) throw notFound('Announcement was not found.');
  const message = cleanText(payload?.message) || existing.rows[0].message;
  const result = await query(
    `
      update public.global_announcements
      set message = $2, is_active = $3
      where id = $1
      returning *
    `,
    [id, message, readActiveFlag(payload, existing.rows[0].is_active)]
  );
  return result.rows[0];
}

export async function deleteGlobalAnnouncement(id) {
  await query('delete from public.global_announcements where id = $1', [id]);
}
