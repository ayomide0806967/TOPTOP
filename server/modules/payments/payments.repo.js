import { query, oneOrNone } from '../../db/query.js';

function runner(client) {
  return client || { query };
}

export async function findPlanForPayment(planId, client) {
  const result = await runner(client).query(
    `
      select id, price, currency, metadata, name, duration_days
      from public.subscription_plans
      where id = $1
      limit 1
    `,
    [planId]
  );
  return result.rows[0] || null;
}

export async function findProfileForPayment(userId, client) {
  const result = await runner(client).query(
    `
      select id, email, first_name, last_name, phone, pending_plan_id, pending_checkout_reference
      from public.profiles
      where id = $1
      limit 1
    `,
    [userId]
  );
  return result.rows[0] || null;
}

export async function upsertPendingTransaction(
  { userId, planId, reference, amount, currency, metadata },
  client
) {
  await runner(client).query(
    `
      insert into public.payment_transactions (
        user_id,
        plan_id,
        provider,
        reference,
        status,
        amount,
        currency,
        metadata,
        paid_at,
        raw_response
      )
      values ($1, $2, 'paystack', $3, 'pending', $4, $5, $6::jsonb, null, null)
      on conflict (provider, reference) do update
      set user_id = excluded.user_id,
          plan_id = excluded.plan_id,
          status = case
            when public.payment_transactions.status = 'success' then public.payment_transactions.status
            else excluded.status
          end,
          amount = excluded.amount,
          currency = excluded.currency,
          metadata = excluded.metadata,
          updated_at = now()
    `,
    [
      userId,
      planId,
      reference,
      amount,
      currency,
      JSON.stringify(metadata || {}),
    ]
  );
}

export async function updateProfilePendingCheckout(
  { userId, planId, reference },
  client
) {
  await runner(client).query(
    `
      update public.profiles
      set pending_checkout_reference = $2,
          pending_plan_id = $3,
          registration_stage = 'awaiting_payment',
          subscription_status = 'pending_payment',
          pending_plan_selected_at = now(),
          updated_at = now()
      where id = $1
    `,
    [userId, reference, planId]
  );
}

export async function findPaymentTransactionByReference(reference, client) {
  const result = await runner(client).query(
    `
      select id, amount, currency, user_id, plan_id, status, subscription_id
      from public.payment_transactions
      where provider = 'paystack'
        and reference = $1
      limit 1
    `,
    [reference]
  );
  return result.rows[0] || null;
}

export async function resolvePendingPaymentByReference(reference, client) {
  const transaction = await findPaymentTransactionByReference(
    reference,
    client
  );
  if (transaction?.user_id && transaction?.plan_id) {
    return {
      userId: transaction.user_id,
      planId: transaction.plan_id,
    };
  }

  const result = await runner(client).query(
    `
      select id, pending_plan_id
      from public.profiles
      where pending_checkout_reference = $1
      limit 1
    `,
    [reference]
  );

  const profile = result.rows[0] || null;
  if (!profile?.id || !profile?.pending_plan_id) {
    return { userId: null, planId: null };
  }

  return {
    userId: profile.id,
    planId: profile.pending_plan_id,
  };
}

export async function upsertSuccessfulTransaction(
  {
    userId,
    planId,
    reference,
    amount,
    currency,
    paidAt,
    metadata,
    rawResponse,
  },
  client
) {
  const result = await runner(client).query(
    `
      insert into public.payment_transactions (
        user_id,
        plan_id,
        provider,
        reference,
        status,
        amount,
        currency,
        paid_at,
        metadata,
        raw_response
      )
      values ($1, $2, 'paystack', $3, 'success', $4, $5, $6, $7::jsonb, $8::jsonb)
      on conflict (provider, reference) do update
      set user_id = excluded.user_id,
          plan_id = excluded.plan_id,
          status = excluded.status,
          amount = excluded.amount,
          currency = excluded.currency,
          paid_at = excluded.paid_at,
          metadata = excluded.metadata,
          raw_response = excluded.raw_response,
          updated_at = now()
      returning id, subscription_id
    `,
    [
      userId,
      planId,
      reference,
      amount,
      currency,
      paidAt,
      JSON.stringify(metadata || {}),
      JSON.stringify(rawResponse || {}),
    ]
  );

  return result.rows[0];
}

export async function findSubscriptionByPaymentTransaction(
  transactionId,
  client
) {
  const result = await runner(client).query(
    `
      select id
      from public.user_subscriptions
      where payment_transaction_id = $1
      limit 1
    `,
    [transactionId]
  );
  return result.rows[0] || null;
}

export async function findLatestActiveSubscription(userId, planId, client) {
  const result = await runner(client).query(
    `
      select id, status, started_at, expires_at, quantity
      from public.user_subscriptions
      where user_id = $1
        and plan_id = $2
        and status = any($3)
        and started_at <= now()
        and (expires_at is null or expires_at >= now())
      order by expires_at desc nulls last, started_at desc
      limit 1
    `,
    [userId, planId, ['active', 'trialing', 'past_due']]
  );
  return result.rows[0] || null;
}

export async function updateExistingSubscription(
  {
    subscriptionId,
    startsAt,
    expiresAt,
    paidAt,
    transactionId,
    amount,
    currency,
    quantity,
  },
  client
) {
  await runner(client).query(
    `
      update public.user_subscriptions
      set status = 'active',
          canceled_at = null,
          started_at = coalesce(started_at, $2),
          expires_at = $3,
          purchased_at = $4,
          payment_transaction_id = $5,
          price = $6,
          currency = $7,
          quantity = $8,
          updated_at = now()
      where id = $1
    `,
    [
      subscriptionId,
      startsAt,
      expiresAt,
      paidAt,
      transactionId,
      amount,
      currency,
      quantity,
    ]
  );
}

export async function insertSubscription(
  {
    userId,
    planId,
    startsAt,
    expiresAt,
    paidAt,
    transactionId,
    amount,
    currency,
  },
  client
) {
  const result = await runner(client).query(
    `
      insert into public.user_subscriptions (
        user_id,
        plan_id,
        status,
        started_at,
        expires_at,
        price,
        currency,
        purchased_at,
        payment_transaction_id,
        quantity
      )
      values ($1, $2, 'active', $3, $4, $5, $6, $7, $8, 1)
      returning id
    `,
    [
      userId,
      planId,
      startsAt,
      expiresAt,
      amount,
      currency,
      paidAt,
      transactionId,
    ]
  );
  return result.rows[0];
}

export async function linkTransactionToSubscription(
  { transactionId, subscriptionId },
  client
) {
  await runner(client).query(
    `
      update public.payment_transactions
      set subscription_id = $2,
          updated_at = now()
      where id = $1
    `,
    [transactionId, subscriptionId]
  );
}

export async function updateDefaultSubscription(
  userId,
  subscriptionId,
  client
) {
  await runner(client).query(
    `
      update public.profiles
      set default_subscription_id = coalesce(default_subscription_id, $2),
          updated_at = now()
      where id = $1
    `,
    [userId, subscriptionId]
  );
}

export async function refreshProfileSubscriptionStatus(userId, client) {
  await runner(client).query(
    'select public.refresh_profile_subscription_status($1)',
    [userId]
  );
}

export async function clearPendingCheckout(userId, client) {
  await runner(client).query(
    `
      update public.profiles
      set registration_stage = 'active',
          pending_plan_id = null,
          pending_plan_snapshot = null,
          pending_checkout_reference = null,
          pending_plan_selected_at = null,
          pending_plan_expires_at = null,
          updated_at = now()
      where id = $1
    `,
    [userId]
  );
}

export async function findPendingPaymentTargets(userId) {
  if (userId) {
    const row = await oneOrNone(
      `
        select id, pending_checkout_reference, pending_plan_id
        from public.profiles
        where id = $1
      `,
      [userId]
    );
    return row ? [row] : [];
  }

  const result = await query(
    `
      select id, pending_checkout_reference, pending_plan_id
      from public.profiles
      where subscription_status = 'pending_payment'
        and pending_checkout_reference is not null
        and pending_plan_id is not null
      order by pending_plan_selected_at desc nulls last
      limit 50
    `
  );

  return result.rows;
}
