set check_function_bodies = off;

drop function if exists public.generate_daily_quiz(uuid, integer);
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

grant execute on function public.generate_daily_quiz(uuid, integer) to authenticated;
