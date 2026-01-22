-- Add subscription_status column to profiles table
alter table public.profiles
  add column if not exists subscription_status text default 'inactive';

-- Add index for faster lookups
create index if not exists profiles_subscription_status_idx
  on public.profiles (subscription_status);

-- Add comment
comment on column public.profiles.subscription_status is
  'Subscription status: inactive, pending_payment, active, trialing, expired, cancelled';
