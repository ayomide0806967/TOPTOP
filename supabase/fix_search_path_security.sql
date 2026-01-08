-- Fix Function Search Path Mutable security warnings
-- These functions need SET search_path = '' to prevent SQL injection attacks
-- Run this in Supabase SQL Editor

-- ============================================================================
-- Fix 1: set_updated_at function
-- ============================================================================
create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

-- ============================================================================
-- Fix 2: touch_profile_subscription_status function
-- ============================================================================
create or replace function public.touch_profile_subscription_status()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform public.refresh_profile_subscription_status(new.user_id);
  update public.profiles
  set registration_stage = case
    when subscription_status in ('active', 'trialing') then 'active'
    when subscription_status in ('pending_payment', 'awaiting_setup') then 'awaiting_payment'
    else coalesce(registration_stage, 'profile_created')
  end,
  pending_plan_id = case
    when subscription_status in ('active', 'trialing') then null
    else pending_plan_id
  end,
  pending_plan_snapshot = case
    when subscription_status in ('active', 'trialing') then null
    else pending_plan_snapshot
  end,
  pending_checkout_reference = case
    when subscription_status in ('active', 'trialing') then null
    else pending_checkout_reference
  end,
  pending_plan_selected_at = case
    when subscription_status in ('active', 'trialing') then null
    else pending_plan_selected_at
  end,
  pending_plan_expires_at = case
    when subscription_status in ('active', 'trialing') then null
    else pending_plan_expires_at
  end
  where id = new.user_id;
  return new;
end;
$$;

-- ============================================================================
-- Fix 3: touch_profile_subscription_status_delete function
-- ============================================================================
create or replace function public.touch_profile_subscription_status_delete()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform public.refresh_profile_subscription_status(old.user_id);
  update public.profiles
  set registration_stage = case
    when subscription_status in ('active', 'trialing') then 'active'
    when subscription_status in ('pending_payment', 'awaiting_setup') then 'awaiting_payment'
    else coalesce(registration_stage, 'profile_created')
  end
  where id = old.user_id;
  return old;
end;
$$;

-- ============================================================================
-- Verification
-- ============================================================================
select 'Security fixes applied successfully!' as status;
