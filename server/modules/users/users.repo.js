import { oneOrNone } from '../../db/query.js';

export async function findProfileByUsername(username) {
  return oneOrNone(
    `
      select
        id,
        email,
        username,
        subscription_status
      from public.profiles
      where lower(username) = $1
      limit 1
    `,
    [username]
  );
}

export async function findProfileByEmail(email) {
  return oneOrNone(
    `
      select
        id,
        email,
        username,
        subscription_status
      from public.profiles
      where lower(email) = $1
      limit 1
    `,
    [email]
  );
}

export async function findProfileByPhone(phone) {
  return oneOrNone(
    `
      select
        id,
        phone,
        username,
        subscription_status
      from public.profiles
      where phone = $1
      limit 1
    `,
    [phone]
  );
}

export async function findLatestSuccessfulPaystackReference(userId) {
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
