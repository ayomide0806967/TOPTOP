-- This migration adds the subscription_status column that was missing from the previous migration
-- The previous migration (20251118190000) was applied when the file was empty

-- Add subscription_status column to profiles table
alter table public.profiles
  add column if not exists subscription_status text default 'inactive';

-- Add index for faster lookups
create index if not exists profiles_subscription_status_idx
  on public.profiles (subscription_status);

-- Add comment
comment on column public.profiles.subscription_status is
  'Subscription status: inactive, pending_payment, active, trialing, expired, cancelled';

-- Also add the other missing columns from empty migrations
alter table public.questions
  add column if not exists image_url text;

alter table public.profiles
  add column if not exists department_id uuid references public.departments on delete set null;

create index if not exists profiles_department_id_idx
  on public.profiles (department_id);

comment on column public.questions.image_url is
  'Optional URL to an image associated with the question';

comment on column public.profiles.department_id is
  'The department/course the learner is studying';
