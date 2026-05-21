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

export async function findProfileByLoginIdentifier(identifier) {
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
        p.subscription_status,
        p.registration_stage,
        case
          when lower(coalesce(p.email, '')) = input.value then 'email'
          when lower(coalesce(p.username, '')) = input.value then 'username'
          when length(input.phone_digits) >= 5
            and regexp_replace(coalesce(p.phone, ''), '[^0-9]', '', 'g') = input.phone_digits
            then 'phone'
          else 'unknown'
        end as identifier_type,
        exists (
          select 1
          from public.account account
          where account."userId" = p.id
            and account."providerId" = 'credential'
            and account.password is not null
            and account.password <> ''
        ) as has_password
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
