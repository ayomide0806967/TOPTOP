set check_function_bodies = off;

-- Ensure the profile default subscription always points at an active plan when one exists.
-- This prevents "renewed but not reflected" cases where the old default expired and the UI
-- keeps selecting it even though a new active subscription record was created.

create or replace function public.refresh_profile_subscription_status(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recent_expired integer;
  v_current_status text;
  v_now timestamptz := timezone('utc', now());
  v_default uuid;
  v_default_is_active boolean := false;
  v_best_active uuid;
begin
  if p_user_id is null then
    return;
  end if;

  select subscription_status, default_subscription_id
    into v_current_status, v_default
  from public.profiles
  where id = p_user_id;

  -- Pick the "best" active subscription (soonest-expiring first; perpetual last).
  select us.id
    into v_best_active
  from public.user_subscriptions us
  where us.user_id = p_user_id
    and us.status in ('active', 'trialing', 'past_due')
    and (us.expires_at is null or us.expires_at >= v_now)
    and us.started_at <= v_now
  order by
    coalesce(us.expires_at, v_now + interval '100 years') asc,
    us.started_at asc
  limit 1;

  if v_best_active is not null then
    if v_default is not null then
      select exists (
        select 1
        from public.user_subscriptions us
        where us.id = v_default
          and us.user_id = p_user_id
          and us.status in ('active', 'trialing', 'past_due')
          and (us.expires_at is null or us.expires_at >= v_now)
          and us.started_at <= v_now
      )
      into v_default_is_active;
    end if;

    update public.profiles
    set subscription_status = 'active',
        default_subscription_id = case
          when v_default_is_active then v_default
          else v_best_active
        end,
        updated_at = v_now
    where id = p_user_id;
    return;
  end if;

  select count(*)
    into v_recent_expired
  from public.user_subscriptions us
  where us.user_id = p_user_id
    and (us.status = 'expired' or (us.expires_at is not null and us.expires_at < v_now));

  update public.profiles
  set subscription_status = case
      when v_recent_expired > 0 then 'expired'
      when lower(coalesce(v_current_status, '')) = 'pending_payment' then 'pending_payment'
      when lower(coalesce(v_current_status, '')) = 'awaiting_setup' then 'awaiting_setup'
      else 'inactive'
    end,
      updated_at = v_now
  where id = p_user_id;
end;
$$;

grant execute on function public.refresh_profile_subscription_status(uuid) to authenticated;
grant execute on function public.refresh_profile_subscription_status(uuid) to service_role;
