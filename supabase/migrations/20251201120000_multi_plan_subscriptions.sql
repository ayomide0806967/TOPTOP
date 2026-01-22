set check_function_bodies = off;

-------------------------------------------------------------------------------
-- Subscription stacking support & profile preferences
-------------------------------------------------------------------------------

alter table public.user_subscriptions
  drop constraint if exists user_subscriptions_unique_status;

alter table public.user_subscriptions
  add column if not exists purchased_at timestamptz not null default timezone('utc', now()),
  add column if not exists payment_transaction_id uuid references public.payment_transactions on delete set null,
  add column if not exists quantity integer not null default 1,
  add column if not exists renewed_from_subscription_id uuid references public.user_subscriptions on delete set null;

create index if not exists user_subscriptions_active_idx
  on public.user_subscriptions (user_id, status, started_at, expires_at desc);

alter table public.payment_transactions
  add column if not exists subscription_id uuid references public.user_subscriptions on delete set null;

alter table public.profiles
  add column if not exists default_subscription_id uuid references public.user_subscriptions on delete set null;

alter table public.daily_quizzes
  add column if not exists subscription_id uuid references public.user_subscriptions on delete set null;

create index if not exists user_subscriptions_payment_tx_idx
  on public.user_subscriptions (payment_transaction_id);

create index if not exists payment_transactions_subscription_idx
  on public.payment_transactions (subscription_id);

create index if not exists profiles_default_subscription_idx
  on public.profiles (default_subscription_id);

-------------------------------------------------------------------------------
-- Helper view for reporting active learner plans
-------------------------------------------------------------------------------

drop view if exists public.active_user_plans;
create view public.active_user_plans as
select
  us.id as subscription_id,
  us.user_id,
  us.plan_id,
  us.status,
  us.started_at,
  us.expires_at,
  us.purchased_at,
  us.quantity,
  us.renewed_from_subscription_id,
  sp.name as plan_name,
  sp.duration_days,
  sp.daily_question_limit,
  sp.plan_tier,
  sp.price,
  sp.currency,
  sp.metadata,
  prod.id as product_id,
  prod.name as product_name,
  prod.department_id,
  dept.name as department_name,
  dept.slug as department_slug
from public.user_subscriptions us
join public.subscription_plans sp on sp.id = us.plan_id
left join public.subscription_products prod on prod.id = sp.product_id
left join public.departments dept on dept.id = prod.department_id;

-------------------------------------------------------------------------------
-- Subscription status maintenance
-------------------------------------------------------------------------------

drop function if exists public.refresh_profile_subscription_status(uuid);
create function public.refresh_profile_subscription_status(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_active_count integer;
  v_recent_expired integer;
  v_current_status text;
begin
  if p_user_id is null then
    return;
  end if;

  select subscription_status
    into v_current_status
  from public.profiles
  where id = p_user_id;

  select count(*)
    into v_active_count
  from public.user_subscriptions us
  where us.user_id = p_user_id
    and us.status in ('active', 'trialing', 'past_due')
    and (us.expires_at is null or us.expires_at >= timezone('utc', now()))
    and us.started_at <= timezone('utc', now());

  if v_active_count > 0 then
    update public.profiles
    set subscription_status = 'active',
        updated_at = timezone('utc', now())
    where id = p_user_id;
    return;
  end if;

  select count(*)
    into v_recent_expired
  from public.user_subscriptions us
  where us.user_id = p_user_id
    and (us.status = 'expired' or (us.expires_at is not null and us.expires_at < timezone('utc', now())));

  update public.profiles
  set subscription_status = case
      when v_recent_expired > 0 then 'expired'
      when lower(coalesce(v_current_status, '')) = 'pending_payment' then 'pending_payment'
      else 'inactive'
    end,
      updated_at = timezone('utc', now())
  where id = p_user_id;
end;
$$;

drop function if exists public.normalize_subscription_status();
create function public.normalize_subscription_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := timezone('utc', now());
begin
  if new.started_at is null then
    new.started_at := v_now;
  end if;

  if new.purchased_at is null then
    new.purchased_at := v_now;
  end if;

  if new.status in ('active', 'trialing', 'past_due')
     and new.expires_at is not null
     and new.expires_at < v_now then
    new.status := 'expired';
  end if;

  return new;
end;
$$;

drop trigger if exists normalize_subscription_status on public.user_subscriptions;
create trigger normalize_subscription_status
  before insert or update on public.user_subscriptions
  for each row
  execute function public.normalize_subscription_status();


drop function if exists public.touch_profile_subscription_status();
create function public.touch_profile_subscription_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.refresh_profile_subscription_status(new.user_id);
  return new;
end;
$$;


create or replace function public.touch_profile_subscription_status_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.refresh_profile_subscription_status(old.user_id);
  return old;
end;
$$;

drop trigger if exists user_subscriptions_after_write on public.user_subscriptions;
create trigger user_subscriptions_after_write
  after insert or update on public.user_subscriptions
  for each row
  execute function public.touch_profile_subscription_status();

drop trigger if exists user_subscriptions_after_delete on public.user_subscriptions;
create trigger user_subscriptions_after_delete
  after delete on public.user_subscriptions
  for each row
  execute function public.touch_profile_subscription_status_delete();

-------------------------------------------------------------------------------
-- Default subscription selection RPC
-------------------------------------------------------------------------------

drop function if exists public.set_default_subscription(uuid);
create function public.set_default_subscription(p_subscription_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_subscription record;
  v_now timestamptz := timezone('utc', now());
begin
  if v_user_id is null then
    raise exception 'Authentication required.';
  end if;

  if p_subscription_id is null then
    update public.profiles
    set default_subscription_id = null,
        updated_at = v_now
    where id = v_user_id;

    perform public.refresh_profile_subscription_status(v_user_id);
    return jsonb_build_object('default_subscription_id', null);
  end if;

  select us.id,
         us.status,
         us.started_at,
         us.expires_at
    into v_subscription
  from public.user_subscriptions us
  where us.id = p_subscription_id
    and us.user_id = v_user_id
  limit 1;

  if not found then
    raise exception 'Subscription not found for this account.';
  end if;

  if v_subscription.status not in ('active', 'trialing', 'past_due') then
    raise exception 'Only active subscriptions can be selected as default.';
  end if;

  if v_subscription.started_at > v_now then
    raise exception 'This plan will activate on %, please wait until it starts before selecting it.',
      to_char(v_subscription.started_at, 'Mon DD, YYYY');
  end if;

  if v_subscription.expires_at is not null and v_subscription.expires_at < v_now then
    raise exception 'This plan expired on % and cannot be selected.',
      to_char(v_subscription.expires_at, 'Mon DD, YYYY');
  end if;

  update public.profiles
  set default_subscription_id = v_subscription.id,
      updated_at = v_now
  where id = v_user_id;

  perform public.refresh_profile_subscription_status(v_user_id);

  return jsonb_build_object('default_subscription_id', v_subscription.id);
end;
$$;

grant execute on function public.set_default_subscription(uuid) to authenticated;
grant execute on function public.set_default_subscription(uuid) to service_role;

grant execute on function public.refresh_profile_subscription_status(uuid) to authenticated;
grant execute on function public.refresh_profile_subscription_status(uuid) to service_role;

-------------------------------------------------------------------------------
-- Updated quiz generation to honour selected subscription
-------------------------------------------------------------------------------

drop function if exists public.generate_daily_quiz(uuid, integer);
drop function if exists public.generate_daily_quiz(integer);
create function public.generate_daily_quiz(
  p_subscription_id uuid default null,
  p_limit integer default null
)
returns table(daily_quiz_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  target_user uuid := auth.uid();
  v_now timestamptz := timezone('utc', now());
  plan_record record;
  slot_record record;
  subslot_record record;
  bucket_record record;
  quiz_id uuid;
  question_limit integer;
  questions_available integer;
  v_day_offset integer;
  time_limit integer := null;
  subscription_query text;
  preferred_subscription uuid;
begin
  if target_user is null then
    raise exception 'Authentication required';
  end if;

  perform public.refresh_profile_subscription_status(target_user);

  if p_subscription_id is not null then
    preferred_subscription := p_subscription_id;
  else
    select default_subscription_id
      into preferred_subscription
    from public.profiles
    where id = target_user;
  end if;

  select us.id as subscription_id,
         us.status as subscription_status,
         us.started_at,
         us.expires_at,
         us.plan_id,
         sp.daily_question_limit,
         sp.duration_days,
         sp.plan_tier,
         sp.questions,
         sp.quiz_duration_minutes,
         prod.department_id,
         sp.name as plan_name
    into plan_record
  from public.user_subscriptions us
  join public.subscription_plans sp on sp.id = us.plan_id
  join public.subscription_products prod on prod.id = sp.product_id
  where us.user_id = target_user
    and us.status in ('active', 'trialing', 'past_due')
    and us.started_at <= v_now
    and (us.expires_at is null or us.expires_at >= v_now)
    and (preferred_subscription is null or us.id = preferred_subscription)
  order by
    case when preferred_subscription is not null and us.id = preferred_subscription then 0 else 1 end,
    coalesce(us.expires_at, v_now + interval '100 years') asc,
    us.started_at asc
  limit 1;

  if plan_record.subscription_id is null then
    if preferred_subscription is not null then
      raise exception 'The selected subscription is no longer active. Choose a different plan to continue.';
    end if;

    raise exception 'No active subscription found for this account.';
  end if;

  if plan_record.quiz_duration_minutes is not null and plan_record.quiz_duration_minutes > 0 then
    time_limit := plan_record.quiz_duration_minutes * 60;
  end if;

  question_limit := coalesce(plan_record.daily_question_limit, p_limit, 10);
  if p_limit is not null and p_limit > 0 then
    question_limit := p_limit;
  end if;

  select sc.*, (current_date - sc.start_date) as day_number
    into slot_record
  from public.study_cycles sc
  where sc.department_id = plan_record.department_id
    and sc.start_date is not null
    and current_date >= sc.start_date
    and current_date < sc.start_date + sc.duration_days
  order by sc.start_date asc
  limit 1;

  if slot_record.id is null then
    raise exception 'No active study slot is scheduled for your department (%).',
      coalesce(plan_record.plan_name, 'selected plan');
  end if;

  select sw.*, (current_date - sw.start_date) as day_offset
    into subslot_record
  from public.study_cycle_weeks sw
  where sw.study_cycle_id = slot_record.id
    and sw.start_date is not null
    and current_date >= sw.start_date
    and current_date <= coalesce(sw.end_date, sw.start_date + sw.day_span - 1)
  order by sw.week_index asc
  limit 1;

  if subslot_record.id is null then
    raise exception 'Subslot configuration is incomplete for the current slot (missing dates).';
  end if;

  v_day_offset := greatest(coalesce(subslot_record.day_offset, 0), 0);

  select db.*
    into bucket_record
  from public.study_cycle_daily_buckets db
  where db.subslot_id = subslot_record.id
    and db.day_offset = v_day_offset
  limit 1;

  if bucket_record.question_target is not null then
    question_limit := least(question_limit, bucket_record.question_target);
  end if;

  if bucket_record.question_count is not null then
    questions_available := bucket_record.question_count;
  else
    select count(*)
      into questions_available
    from public.study_cycle_subslot_questions q
    where q.subslot_id = subslot_record.id
      and q.day_offset = v_day_offset;
  end if;

  if questions_available < question_limit then
    if bucket_record.status is not null then
      raise exception 'Daily bucket status % lacks questions for today (% available, % needed).',
        bucket_record.status, questions_available, question_limit;
    else
      raise exception 'Configured subslot does not have enough questions for today (% available, % needed).',
        questions_available, question_limit;
    end if;
  end if;

  select dq.id
    into quiz_id
  from public.daily_quizzes dq
  where dq.user_id = target_user
    and dq.assigned_date = current_date
  limit 1;

  if quiz_id is null then
    insert into public.daily_quizzes (user_id, assigned_date, time_limit_seconds, subscription_id)
    values (target_user, current_date, time_limit, plan_record.subscription_id)
    returning id into quiz_id;
  else
    update public.daily_quizzes
    set time_limit_seconds = time_limit,
        subscription_id = plan_record.subscription_id,
        updated_at = v_now
    where id = quiz_id;

    delete from public.daily_quiz_questions where daily_quiz_id = quiz_id;
  end if;

  with todays_questions as (
    select question_id, order_index
    from public.study_cycle_subslot_questions q
    where q.subslot_id = subslot_record.id
      and q.day_offset = v_day_offset
    order by q.order_index
    limit question_limit
  )
  insert into public.daily_quiz_questions (daily_quiz_id, question_id, order_index)
  select
    quiz_id,
    tq.question_id,
    row_number() over (order by tq.order_index)
  from todays_questions tq;

  update public.daily_quizzes
  set total_questions = question_limit,
      correct_answers = 0,
      status = 'assigned',
      started_at = null,
      completed_at = null,
      updated_at = v_now
  where id = quiz_id;

  update public.profiles
  set default_subscription_id = plan_record.subscription_id
  where id = target_user
    and (default_subscription_id is null or default_subscription_id <> plan_record.subscription_id);

  perform public.refresh_profile_subscription_status(target_user);

  return query select quiz_id;
end;
$$;

grant execute on function public.generate_daily_quiz(uuid, integer) to authenticated;

-------------------------------------------------------------------------------
-- Backfill existing data
-------------------------------------------------------------------------------

with latest_sub as (
  select distinct on (user_id)
    id,
    user_id
  from public.user_subscriptions
  where status in ('active', 'trialing', 'past_due')
    and (expires_at is null or expires_at >= timezone('utc', now()))
  order by user_id,
           coalesce(expires_at, timezone('utc', now()) + interval '100 years') asc,
           started_at asc
)
update public.profiles p
set default_subscription_id = ls.id
from latest_sub ls
where p.id = ls.user_id
  and p.default_subscription_id is null;

update public.user_subscriptions
set purchased_at = coalesce(purchased_at, started_at, created_at)
where purchased_at is null;

-- Refresh profile subscription flags for all learners
update public.profiles p
set subscription_status = case
  when exists (
    select 1
    from public.user_subscriptions us
    where us.user_id = p.id
      and us.status in ('active', 'trialing', 'past_due')
      and us.started_at <= timezone('utc', now())
      and (us.expires_at is null or us.expires_at >= timezone('utc', now()))
  ) then 'active'
  when exists (
    select 1
    from public.user_subscriptions us
    where us.user_id = p.id
      and (us.status = 'expired' or (us.expires_at is not null and us.expires_at < timezone('utc', now()))))
  then 'expired'
  else 'inactive'
end;
