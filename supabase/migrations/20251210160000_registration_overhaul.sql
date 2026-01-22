-- Registration overhaul support columns
set check_function_bodies = off;

alter table public.profiles
  add column if not exists registration_stage text not null default 'profile_created',
  add column if not exists pending_plan_id uuid references public.subscription_plans on delete set null,
  add column if not exists pending_plan_snapshot jsonb,
  add column if not exists pending_checkout_reference text,
  add column if not exists pending_plan_selected_at timestamptz,
  add column if not exists pending_plan_expires_at timestamptz;

create index if not exists profiles_registration_stage_idx
  on public.profiles (registration_stage);

create index if not exists profiles_pending_plan_idx
  on public.profiles (pending_plan_id)
  where pending_plan_id is not null;

comment on column public.profiles.registration_stage is 'Tracks learner onboarding progress (profile_created, awaiting_payment, active, abandoned, etc).';
comment on column public.profiles.pending_plan_id is 'Selected plan awaiting payment activation.';
comment on column public.profiles.pending_plan_snapshot is 'Immutable snapshot of plan details used at checkout.';
comment on column public.profiles.pending_checkout_reference is 'Latest Paystack reference for pending plan payment.';
comment on column public.profiles.pending_plan_selected_at is 'Timestamp when learner selected the pending plan.';
comment on column public.profiles.pending_plan_expires_at is 'Optional expiry timestamp for pending plan checkout.';

-- Ensure normalize function keeps stage in sync when subscription activates
create or replace function public.touch_profile_subscription_status()
returns trigger
language plpgsql
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

create or replace function public.touch_profile_subscription_status_delete()
returns trigger
language plpgsql
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

-- existing triggers already reference these functions; definitions updated above
