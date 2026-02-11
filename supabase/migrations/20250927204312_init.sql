-- Core schema for CBT Fast platform (idempotent)
-- Defines domain enums, helper functions, tables, RLS policies, analytics views,
-- and learner daily quiz workflow.

set check_function_bodies = off;

create extension if not exists "pgcrypto";

-------------------------------------------------------------------------------
-- Enums
-------------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'user_role') then
    create type public.user_role as enum ('admin', 'instructor', 'learner');
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'question_type') then
    create type public.question_type as enum (
      'multiple_choice_single',
      'multiple_choice_multiple',
      'true_false',
      'essay'
    );
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'subscription_status') then
    create type public.subscription_status as enum (
      'trialing',
      'active',
      'past_due',
      'canceled',
      'expired'
    );
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'daily_quiz_status') then
    create type public.daily_quiz_status as enum ('assigned', 'in_progress', 'completed');
  end if;
end
$$;

-------------------------------------------------------------------------------
-- Helper functions
-------------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
  );
$$;

-------------------------------------------------------------------------------
-- Core tables
-------------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  full_name text,
  role public.user_role not null default 'learner',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  last_seen_at timestamptz
);

create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique,
  color_theme text not null default 'nursing',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.courses (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments on delete cascade,
  name text not null,
  slug text not null,
  description text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint courses_unique_slug unique (department_id, slug)
);

create table if not exists public.topics (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses on delete cascade,
  name text not null,
  slug text not null,
  question_count integer not null default 0 check (question_count >= 0),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint topics_unique_slug unique (course_id, slug)
);

create table if not exists public.study_cycles (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments on delete cascade,
  title text not null,
  start_date date not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.study_cycle_weeks (
  id uuid primary key default gen_random_uuid(),
  study_cycle_id uuid not null references public.study_cycles on delete cascade,
  week_index integer not null check (week_index > 0),
  topic_id uuid references public.topics on delete set null,
  is_active boolean not null default false,
  participant_count integer not null default 0 check (participant_count >= 0),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint study_cycle_weeks_unique_week unique (study_cycle_id, week_index)
);

create table if not exists public.questions (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid not null references public.topics on delete cascade,
  question_type public.question_type not null default 'multiple_choice_single',
  stem text not null,
  explanation text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.question_options (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions on delete cascade,
  label text not null,
  content text not null,
  is_correct boolean not null default false,
  order_index integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint question_options_unique_label unique (question_id, label)
);

create table if not exists public.subscription_products (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  product_type text not null default 'cbt',
  description text,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.subscription_plans (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.subscription_products on delete cascade,
  code text not null,
  name text not null,
  price numeric(10,2) not null default 0,
  currency text not null default 'NGN',
  questions integer,
  quizzes integer,
  participants integer,
  metadata jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint subscription_plans_unique_per_product unique (product_id, code)
);

create table if not exists public.user_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles on delete cascade,
  plan_id uuid not null references public.subscription_plans on delete restrict,
  status public.subscription_status not null default 'active',
  started_at timestamptz not null default timezone('utc', now()),
  expires_at timestamptz,
  canceled_at timestamptz,
  price numeric(10,2),
  currency text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint user_subscriptions_unique_status unique (user_id, plan_id, status)
);

create table if not exists public.daily_quizzes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles on delete cascade,
  assigned_date date not null default current_date,
  status public.daily_quiz_status not null default 'assigned',
  total_questions integer not null default 0,
  correct_answers integer not null default 0,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint daily_quizzes_unique_assignment unique (user_id, assigned_date)
);

create table if not exists public.daily_quiz_questions (
  id uuid primary key default gen_random_uuid(),
  daily_quiz_id uuid not null references public.daily_quizzes on delete cascade,
  question_id uuid not null references public.questions on delete cascade,
  order_index integer not null default 0,
  selected_option_id uuid references public.question_options on delete set null,
  is_correct boolean,
  answered_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint daily_quiz_questions_unique unique (daily_quiz_id, question_id)
);

-------------------------------------------------------------------------------
-- Indexes
-------------------------------------------------------------------------------

create index if not exists courses_department_idx on public.courses (department_id);
create index if not exists topics_course_idx on public.topics (course_id);
create index if not exists study_cycles_department_idx on public.study_cycles (department_id);
create index if not exists study_cycle_weeks_cycle_idx on public.study_cycle_weeks (study_cycle_id);
create index if not exists study_cycle_weeks_topic_idx on public.study_cycle_weeks (topic_id);
create index if not exists questions_topic_idx on public.questions (topic_id);
create index if not exists question_options_question_idx on public.question_options (question_id);
create index if not exists subscription_plans_product_idx on public.subscription_plans (product_id);
create index if not exists user_subscriptions_user_idx on public.user_subscriptions (user_id);
create index if not exists user_subscriptions_plan_idx on public.user_subscriptions (plan_id);
create index if not exists daily_quizzes_user_date_idx on public.daily_quizzes (user_id, assigned_date);
create index if not exists daily_quiz_questions_quiz_idx on public.daily_quiz_questions (daily_quiz_id, order_index);

-------------------------------------------------------------------------------
-- Triggers (updated_at)
-------------------------------------------------------------------------------

drop trigger if exists set_timestamp_profiles on public.profiles;
create trigger set_timestamp_profiles
  before update on public.profiles
  for each row
  execute function public.set_updated_at();

drop trigger if exists set_timestamp_departments on public.departments;
create trigger set_timestamp_departments
  before update on public.departments
  for each row
  execute function public.set_updated_at();

drop trigger if exists set_timestamp_courses on public.courses;
create trigger set_timestamp_courses
  before update on public.courses
  for each row
  execute function public.set_updated_at();

drop trigger if exists set_timestamp_topics on public.topics;
create trigger set_timestamp_topics
  before update on public.topics
  for each row
  execute function public.set_updated_at();

drop trigger if exists set_timestamp_study_cycles on public.study_cycles;
create trigger set_timestamp_study_cycles
  before update on public.study_cycles
  for each row
  execute function public.set_updated_at();

drop trigger if exists set_timestamp_study_cycle_weeks on public.study_cycle_weeks;
create trigger set_timestamp_study_cycle_weeks
  before update on public.study_cycle_weeks
  for each row
  execute function public.set_updated_at();

drop trigger if exists set_timestamp_questions on public.questions;
create trigger set_timestamp_questions
  before update on public.questions
  for each row
  execute function public.set_updated_at();

drop trigger if exists set_timestamp_question_options on public.question_options;
create trigger set_timestamp_question_options
  before update on public.question_options
  for each row
  execute function public.set_updated_at();

drop trigger if exists set_timestamp_subscription_products on public.subscription_products;
create trigger set_timestamp_subscription_products
  before update on public.subscription_products
  for each row
  execute function public.set_updated_at();

drop trigger if exists set_timestamp_subscription_plans on public.subscription_plans;
create trigger set_timestamp_subscription_plans
  before update on public.subscription_plans
  for each row
  execute function public.set_updated_at();

drop trigger if exists set_timestamp_user_subscriptions on public.user_subscriptions;
create trigger set_timestamp_user_subscriptions
  before update on public.user_subscriptions
  for each row
  execute function public.set_updated_at();

drop trigger if exists set_timestamp_daily_quizzes on public.daily_quizzes;
create trigger set_timestamp_daily_quizzes
  before update on public.daily_quizzes
  for each row
  execute function public.set_updated_at();

drop trigger if exists set_timestamp_daily_quiz_questions on public.daily_quiz_questions;
create trigger set_timestamp_daily_quiz_questions
  before update on public.daily_quiz_questions
  for each row
  execute function public.set_updated_at();

-------------------------------------------------------------------------------
-- Row Level Security policies
-------------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.departments enable row level security;
alter table public.courses enable row level security;
alter table public.topics enable row level security;
alter table public.study_cycles enable row level security;
alter table public.study_cycle_weeks enable row level security;
alter table public.questions enable row level security;
alter table public.question_options enable row level security;
alter table public.subscription_products enable row level security;
alter table public.subscription_plans enable row level security;
alter table public.user_subscriptions enable row level security;
alter table public.daily_quizzes enable row level security;
alter table public.daily_quiz_questions enable row level security;

-- Profiles

drop policy if exists "Users can view own profile" on public.profiles;
create policy "Users can view own profile" on public.profiles
  for select
  using (auth.uid() = id);

drop policy if exists "Users can create own profile" on public.profiles;
create policy "Users can create own profile" on public.profiles
  for insert
  with check (auth.uid() = id and role <> 'admin');

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile" on public.profiles
  for update
  using (auth.uid() = id)
  with check (auth.uid() = id and role in ('learner', 'instructor'));

drop policy if exists "Admins manage profiles" on public.profiles;
create policy "Admins manage profiles" on public.profiles
  for all
  using (public.is_admin())
  with check (public.is_admin());

-- Department hierarchy managed by admins only

drop policy if exists "Admins manage departments" on public.departments;
create policy "Admins manage departments" on public.departments
  for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Admins manage courses" on public.courses;
create policy "Admins manage courses" on public.courses
  for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Admins manage topics" on public.topics;
create policy "Admins manage topics" on public.topics
  for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Admins manage study cycles" on public.study_cycles;
create policy "Admins manage study cycles" on public.study_cycles
  for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Admins manage cycle weeks" on public.study_cycle_weeks;
create policy "Admins manage cycle weeks" on public.study_cycle_weeks
  for all
  using (public.is_admin())
  with check (public.is_admin());

-- Question bank policies

drop policy if exists "Admins manage questions" on public.questions;
create policy "Admins manage questions" on public.questions
  for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Learners see assigned questions" on public.questions;
create policy "Learners see assigned questions" on public.questions
  for select
  using (
    exists (
      select 1
      from public.daily_quiz_questions dqq
      join public.daily_quizzes dq on dq.id = dqq.daily_quiz_id
      where dqq.question_id = public.questions.id
        and dq.user_id = auth.uid()
    )
  );

drop policy if exists "Admins manage question options" on public.question_options;
create policy "Admins manage question options" on public.question_options
  for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Learners see assigned options" on public.question_options;
create policy "Learners see assigned options" on public.question_options
  for select
  using (
    exists (
      select 1
      from public.daily_quiz_questions dqq
      join public.daily_quizzes dq on dq.id = dqq.daily_quiz_id
      where dqq.question_id = public.question_options.question_id
        and dq.user_id = auth.uid()
    )
  );

-- Subscription catalog policies (admin manage, everyone can view)

drop policy if exists "Admins manage subscription products" on public.subscription_products;
create policy "Admins manage subscription products" on public.subscription_products
  for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Public read subscription products" on public.subscription_products;
create policy "Public read subscription products" on public.subscription_products
  for select
  using (true);

drop policy if exists "Admins manage subscription plans" on public.subscription_plans;
create policy "Admins manage subscription plans" on public.subscription_plans
  for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Public read subscription plans" on public.subscription_plans;
create policy "Public read subscription plans" on public.subscription_plans
  for select
  using (true);

-- User subscriptions (admins manage, users view their own)

drop policy if exists "Admins manage user subscriptions" on public.user_subscriptions;
create policy "Admins manage user subscriptions" on public.user_subscriptions
  for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Users view their subscriptions" on public.user_subscriptions;
create policy "Users view their subscriptions" on public.user_subscriptions
  for select
  using (auth.uid() = user_id);

-- Daily quiz policies

drop policy if exists "Learners manage daily quizzes" on public.daily_quizzes;
create policy "Learners manage daily quizzes" on public.daily_quizzes
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Learners manage daily quiz questions" on public.daily_quiz_questions;
create policy "Learners manage daily quiz questions" on public.daily_quiz_questions
  using (
    exists (
      select 1 from public.daily_quizzes dq
      where dq.id = public.daily_quiz_questions.daily_quiz_id
        and dq.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.daily_quizzes dq
      where dq.id = public.daily_quiz_questions.daily_quiz_id
        and dq.user_id = auth.uid()
    )
  );

-------------------------------------------------------------------------------
-- Helper view(s)
-------------------------------------------------------------------------------

drop view if exists public.subscription_products_with_plans;
create view public.subscription_products_with_plans as
select
  p.id,
  p.code as product_code,
  p.name as product_name,
  p.product_type,
  p.description,
  p.is_active,
  pl.id as plan_id,
  pl.code as plan_code,
  coalesce(pl.name, pl.code) as plan_name,
  pl.price,
  pl.currency,
  pl.questions,
  pl.quizzes,
  pl.participants,
  pl.metadata,
  pl.is_active as plan_is_active
from public.subscription_products p
left join public.subscription_plans pl on pl.product_id = p.id
where p.is_active;

drop view if exists public.admin_dashboard_stats;
create view public.admin_dashboard_stats
with (security_invoker = true) as
	select
	  coalesce((select count(*) from public.profiles), 0) as total_users,
	  coalesce((select count(*) from public.user_subscriptions us where us.status = 'active'), 0) as active_subscriptions,
	  coalesce((select count(*) from public.questions), 0) as total_questions,
	  coalesce(
	    (
	      select sum(coalesce(us.price, sp.price))
	      from public.user_subscriptions us
	      join public.subscription_plans sp on sp.id = us.plan_id
	      where us.status = 'active'
	        and date_trunc('month', us.started_at) = date_trunc('month', timezone('utc', now()))
	    ),
	    0
	  ) as monthly_revenue
	where public.is_admin();

grant select on table public.admin_dashboard_stats to authenticated;

-------------------------------------------------------------------------------
-- Daily quiz generation helper
-------------------------------------------------------------------------------

create or replace function public.generate_daily_quiz(p_limit integer default 10)
returns table(daily_quiz_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  target_user uuid := auth.uid();
  quiz_id uuid;
begin
  if target_user is null then
    raise exception 'Authentication required';
  end if;

  select dq.id
  into quiz_id
  from public.daily_quizzes dq
  where dq.user_id = target_user
    and dq.assigned_date = current_date
  limit 1;

  if quiz_id is null then
    insert into public.daily_quizzes (user_id, assigned_date)
    values (target_user, current_date)
    returning id into quiz_id;
  else
    delete from public.daily_quiz_questions where daily_quiz_id = quiz_id;
  end if;

  insert into public.daily_quiz_questions (daily_quiz_id, question_id, order_index)
  select quiz_id, q.id, row_number() over ()
  from (
    select id
    from public.questions
    order by random()
    limit greatest(p_limit, 1)
  ) as q;

  update public.daily_quizzes
  set total_questions = (select count(*) from public.daily_quiz_questions where daily_quiz_id = quiz_id),
      correct_answers = 0,
      status = 'assigned',
      started_at = null,
      completed_at = null
  where id = quiz_id;

  return query select quiz_id;
end;
$$;

-------------------------------------------------------------------------------
-- Grants
-------------------------------------------------------------------------------

grant usage on schema public to authenticated, anon;

grant select, insert, update on table public.profiles to authenticated;

grant select on table public.departments to authenticated;
grant select on table public.courses to authenticated;
grant select on table public.topics to authenticated;
grant select on table public.study_cycles to authenticated;
grant select on table public.study_cycle_weeks to authenticated;
grant select on table public.questions to authenticated;
grant select on table public.question_options to authenticated;

grant select on table public.subscription_products to authenticated, anon;
grant select on table public.subscription_plans to authenticated, anon;
grant select on table public.subscription_products_with_plans to authenticated, anon;

grant select, insert, update on table public.daily_quizzes to authenticated;
grant select, insert, update on table public.daily_quiz_questions to authenticated;

grant select, insert, update, delete on table public.departments to authenticated;
grant select, insert, update, delete on table public.courses to authenticated;
grant select, insert, update, delete on table public.topics to authenticated;
grant select, insert, update, delete on table public.study_cycles to authenticated;
grant select, insert, update, delete on table public.study_cycle_weeks to authenticated;
grant select, insert, update, delete on table public.questions to authenticated;
grant select, insert, update, delete on table public.question_options to authenticated;
grant select, insert, update, delete on table public.subscription_products to authenticated;
grant select, insert, update, delete on table public.subscription_plans to authenticated;
grant select, insert, update, delete on table public.user_subscriptions to authenticated;

grant execute on function public.is_admin() to authenticated;
grant execute on function public.set_updated_at() to authenticated;
grant execute on function public.generate_daily_quiz(integer) to authenticated;
