/*
Fix over-extended subscriptions caused by duplicate processing of the same
Paystack payment reference (e.g., webhook + verify + reconciliation).

What it does:
1) PREVIEW: shows active subscriptions whose expiry is extended beyond what a
   single successful Paystack payment should grant.
2) APPLY: updates those subscriptions so:
   - expires_at = (first successful paid_at) + plan.duration_days
   - quantity = 1

Notes:
- This only targets subscriptions with exactly 1 successful Paystack payment
  linked via payment_transactions.subscription_id.
- Run PREVIEW first. If it looks correct, run APPLY.
*/

/* -------------------------------------------------------------------------- */
/* PREVIEW (no writes)                                                        */
/* -------------------------------------------------------------------------- */

with txn as (
  select
    subscription_id,
    count(*) filter (where lower(status) = 'success') as success_txns,
    min(paid_at) filter (where lower(status) = 'success') as first_paid_at,
    max(reference) filter (where lower(status) = 'success') as any_reference
  from public.payment_transactions
  where subscription_id is not null
    and provider = 'paystack'
  group by subscription_id
),
scored as (
  select
    us.id as subscription_id,
    us.user_id,
    sp.name as plan_name,
    sp.duration_days,
    us.quantity,
    us.started_at,
    us.expires_at,
    coalesce(txn.first_paid_at, us.purchased_at, us.started_at) as base_paid_at,
    (coalesce(txn.first_paid_at, us.purchased_at, us.started_at) + make_interval(days => sp.duration_days)) as expected_expires_at,
    txn.success_txns,
    txn.any_reference
  from public.user_subscriptions us
  join public.subscription_plans sp on sp.id = us.plan_id
  left join txn on txn.subscription_id = us.id
  where us.status in ('active', 'trialing', 'past_due')
    and us.expires_at is not null
    and us.expires_at >= timezone('utc', now())
    and sp.duration_days is not null
    and sp.duration_days > 0
    and coalesce(txn.success_txns, 0) = 1
)
select
  subscription_id,
  user_id,
  plan_name,
  duration_days,
  quantity,
  started_at,
  expires_at,
  expected_expires_at,
  round(extract(epoch from (expires_at - expected_expires_at)) / 86400.0, 2) as extra_days,
  any_reference as paystack_reference
from scored
where base_paid_at is not null
  and expires_at > (expected_expires_at + interval '1 day')
order by extra_days desc nulls last;

/* -------------------------------------------------------------------------- */
/* APPLY (writes)                                                             */
/* -------------------------------------------------------------------------- */

with txn as (
  select
    subscription_id,
    count(*) filter (where lower(status) = 'success') as success_txns,
    min(paid_at) filter (where lower(status) = 'success') as first_paid_at
  from public.payment_transactions
  where subscription_id is not null
    and provider = 'paystack'
  group by subscription_id
),
candidates as (
  select
    us.id as subscription_id,
    us.user_id,
    us.expires_at as old_expires_at,
    coalesce(us.quantity, 1) as old_quantity,
    (coalesce(txn.first_paid_at, us.purchased_at, us.started_at) + make_interval(days => sp.duration_days)) as new_expires_at
  from public.user_subscriptions us
  join public.subscription_plans sp on sp.id = us.plan_id
  left join txn on txn.subscription_id = us.id
  where us.status in ('active', 'trialing', 'past_due')
    and us.expires_at is not null
    and us.expires_at >= timezone('utc', now())
    and sp.duration_days is not null
    and sp.duration_days > 0
    and coalesce(txn.success_txns, 0) = 1
    and coalesce(txn.first_paid_at, us.purchased_at, us.started_at) is not null
    and us.expires_at > (
      (coalesce(txn.first_paid_at, us.purchased_at, us.started_at) + make_interval(days => sp.duration_days))
      + interval '1 day'
    )
),
updated as (
  update public.user_subscriptions us
  set
    expires_at = c.new_expires_at,
    quantity = 1,
    updated_at = timezone('utc', now())
  from candidates c
  where us.id = c.subscription_id
  returning us.id as subscription_id
)
select
  c.subscription_id,
  c.user_id,
  c.old_expires_at,
  c.new_expires_at,
  c.old_quantity,
  1 as new_quantity
from candidates c
join updated u on u.subscription_id = c.subscription_id
order by c.old_expires_at desc;

