set check_function_bodies = off;

-------------------------------------------------------------------------------
-- Fix daily quiz cycle selection when cycles overlap
-- - Prefer cycles that have dated subslots for today (avoids "missing dates")
-- - Prefer active/scheduled cycles, then newest start_date
-------------------------------------------------------------------------------

create or replace function public.generate_daily_quiz(
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

  -- Prefer cycles that are already fully date-windowed for "today" (subslot exists).
  select sc.*, (current_date - sc.start_date) as day_number
    into slot_record
  from public.study_cycles sc
  where sc.department_id = plan_record.department_id
    and sc.start_date is not null
    and current_date >= sc.start_date
    and current_date < sc.start_date + sc.duration_days
    and sc.status not in ('completed'::public.slot_status, 'archived'::public.slot_status)
    and exists (
      select 1
      from public.study_cycle_weeks sw
      where sw.study_cycle_id = sc.id
        and sw.start_date is not null
        and current_date >= sw.start_date
        and current_date <= coalesce(sw.end_date, sw.start_date + sw.day_span - 1)
    )
  order by
    case sc.status
      when 'active'::public.slot_status then 0
      when 'scheduled'::public.slot_status then 1
      when 'draft'::public.slot_status then 2
      else 3
    end,
    sc.start_date desc
  limit 1;

  -- Fall back to "best" cycle even if it is missing subslot dates, so the
  -- user receives the more actionable "missing dates" error below.
  if slot_record.id is null then
    select sc.*, (current_date - sc.start_date) as day_number
      into slot_record
    from public.study_cycles sc
    where sc.department_id = plan_record.department_id
      and sc.start_date is not null
      and current_date >= sc.start_date
      and current_date < sc.start_date + sc.duration_days
      and sc.status not in ('completed'::public.slot_status, 'archived'::public.slot_status)
    order by
      case sc.status
        when 'active'::public.slot_status then 0
        when 'scheduled'::public.slot_status then 1
        when 'draft'::public.slot_status then 2
        else 3
      end,
      sc.start_date desc
    limit 1;
  end if;

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

    delete from public.daily_quiz_questions dqq where dqq.daily_quiz_id = quiz_id;
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

  return query select quiz_id as daily_quiz_id;
end;
$$;

-------------------------------------------------------------------------------
-- Align learner schedule-health selection with generate_daily_quiz
-------------------------------------------------------------------------------

create or replace function public.get_user_schedule_health()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_user uuid := auth.uid();
  plan_record record;
  cycle_record record;
  subslot_record record;
  bucket_record record;
  next_ready_date date;
  day_offset integer := 0;
  response jsonb := '{}'::jsonb;
begin
  if target_user is null then
    raise exception 'Authentication required';
  end if;

  select sp.id as plan_id,
         sp.daily_question_limit,
         p.department_id
    into plan_record
  from public.user_subscriptions us
  join public.subscription_plans sp on sp.id = us.plan_id
  join public.subscription_products p on p.id = sp.product_id
  where us.user_id = target_user
    and us.status in ('active', 'trialing', 'past_due')
    and (us.expires_at is null or us.expires_at >= timezone('utc', now()))
  order by coalesce(us.expires_at, timezone('utc', now()) + interval '100 years') desc, us.started_at desc
  limit 1;

  if plan_record.plan_id is null then
    return jsonb_build_object('status', 'no_subscription');
  end if;

  select sc.*, (current_date - sc.start_date) as day_number
    into cycle_record
  from public.study_cycles sc
  where sc.department_id = plan_record.department_id
    and sc.start_date is not null
    and current_date >= sc.start_date
    and current_date < sc.start_date + sc.duration_days
    and sc.status not in ('completed'::public.slot_status, 'archived'::public.slot_status)
    and exists (
      select 1
      from public.study_cycle_weeks sw
      where sw.study_cycle_id = sc.id
        and sw.start_date is not null
        and current_date >= sw.start_date
        and current_date <= coalesce(sw.end_date, sw.start_date + sw.day_span - 1)
    )
  order by
    case sc.status
      when 'active'::public.slot_status then 0
      when 'scheduled'::public.slot_status then 1
      when 'draft'::public.slot_status then 2
      else 3
    end,
    sc.start_date desc
  limit 1;

  if cycle_record.id is null then
    select sc.*, (current_date - sc.start_date) as day_number
      into cycle_record
    from public.study_cycles sc
    where sc.department_id = plan_record.department_id
      and sc.start_date is not null
      and current_date >= sc.start_date
      and current_date < sc.start_date + sc.duration_days
      and sc.status not in ('completed'::public.slot_status, 'archived'::public.slot_status)
    order by
      case sc.status
        when 'active'::public.slot_status then 0
        when 'scheduled'::public.slot_status then 1
        when 'draft'::public.slot_status then 2
        else 3
      end,
      sc.start_date desc
    limit 1;
  end if;

  if cycle_record.id is null then
    return jsonb_build_object(
      'status', 'no_active_cycle',
      'department_id', plan_record.department_id
    );
  end if;

  select sw.*, (current_date - sw.start_date) as current_day_offset
    into subslot_record
  from public.study_cycle_weeks sw
  where sw.study_cycle_id = cycle_record.id
    and sw.start_date is not null
    and current_date >= sw.start_date
    and current_date <= coalesce(sw.end_date, sw.start_date + sw.day_span - 1)
  order by sw.week_index asc
  limit 1;

  if subslot_record.id is null then
    return jsonb_build_object(
      'status', 'unscheduled',
      'cycle_id', cycle_record.id,
      'cycle_title', cycle_record.title,
      'starts_on', cycle_record.start_date
    );
  end if;

  if subslot_record.day_span is not null and subslot_record.day_span > 0 then
    day_offset := greatest(least(coalesce(subslot_record.current_day_offset, 0), subslot_record.day_span - 1), 0);
  end if;

  select db.*
    into bucket_record
  from public.study_cycle_daily_buckets db
  where db.subslot_id = subslot_record.id
    and db.day_offset = day_offset
  limit 1;

  select min(db.scheduled_date)
    into next_ready_date
  from public.study_cycle_daily_buckets db
  where db.cycle_id = cycle_record.id
    and db.status in ('ready', 'published')
    and (db.scheduled_date is null or db.scheduled_date >= current_date);

  response := jsonb_build_object(
    'status', coalesce((bucket_record.status)::text, 'planned'),
    'cycle_id', cycle_record.id,
    'cycle_title', cycle_record.title,
    'subslot_id', subslot_record.id,
    'day_offset', day_offset,
    'question_target', coalesce(bucket_record.question_target, subslot_record.question_target, 0),
    'question_count', coalesce(bucket_record.question_count, 0),
    'missing_questions', coalesce(
      bucket_record.missing_questions,
      greatest(coalesce(bucket_record.question_target, subslot_record.question_target, 0) - coalesce(bucket_record.question_count, 0), 0)
    ),
    'starts_on', subslot_record.start_date,
    'ends_on', subslot_record.end_date,
    'next_ready_date', next_ready_date
  );

  return response;
exception
  when others then
    return jsonb_build_object('status', 'error', 'message', SQLERRM);
end;
$$;

-------------------------------------------------------------------------------
-- Prevent overlapping "live" (scheduled/active) cycles per department
-------------------------------------------------------------------------------

create or replace function public.prevent_overlapping_live_cycles()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  conflict_id uuid;
  new_end date;
  new_id uuid := coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid);
begin
  if new.department_id is null or new.start_date is null then
    return new;
  end if;

  if new.status not in ('active'::public.slot_status, 'scheduled'::public.slot_status) then
    return new;
  end if;

  new_end := new.start_date + coalesce(new.duration_days, 0);

  select sc.id
    into conflict_id
  from public.study_cycles sc
  where sc.department_id = new.department_id
    and sc.id <> new_id
    and sc.start_date is not null
    and sc.status in ('active'::public.slot_status, 'scheduled'::public.slot_status)
    and sc.start_date < new_end
    and new.start_date < sc.start_date + sc.duration_days
  limit 1;

  if conflict_id is not null then
    raise exception 'Overlapping scheduled/active study cycles are not allowed for a department. Conflicts with cycle %.', conflict_id;
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_overlapping_live_cycles on public.study_cycles;
create trigger prevent_overlapping_live_cycles
  before insert or update of department_id, start_date, duration_days, status
  on public.study_cycles
  for each row
  execute function public.prevent_overlapping_live_cycles();
