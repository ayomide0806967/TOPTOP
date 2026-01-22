create or replace function public.generate_daily_quiz(p_limit integer default null)
returns table(daily_quiz_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  target_user uuid := auth.uid();
  plan_record record;
  slot_record record;
  subslot_record record;
  bucket_record record;
  quiz_id uuid;
  question_limit integer;
  questions_available integer;
  v_day_offset integer;
  time_limit integer := null;
begin
  if target_user is null then
    raise exception 'Authentication required';
  end if;

  select us.id as subscription_id,
         us.status as subscription_status,
         us.expires_at,
         sp.id as plan_id,
         sp.daily_question_limit,
         sp.duration_days,
         sp.plan_tier,
         sp.questions,
         sp.quiz_duration_minutes,
         p.department_id
    into plan_record
  from public.user_subscriptions us
  join public.subscription_plans sp on sp.id = us.plan_id
  join public.subscription_products p on p.id = sp.product_id
  where us.user_id = target_user
    and us.status = 'active'
    and (us.expires_at is null or us.expires_at >= timezone('utc', now()))
  order by coalesce(us.expires_at, timezone('utc', now()) + interval '100 years') desc, us.started_at desc
  limit 1;

  if plan_record.plan_id is null then
    -- Try to recover from mismatched subscription states by inspecting latest subscription
    select us.id as subscription_id,
           us.status as subscription_status,
           us.expires_at,
           sp.id as plan_id,
           sp.daily_question_limit,
           sp.duration_days,
           sp.plan_tier,
           sp.questions,
           sp.quiz_duration_minutes,
           p.department_id
      into plan_record
    from public.user_subscriptions us
    join public.subscription_plans sp on sp.id = us.plan_id
    join public.subscription_products p on p.id = sp.product_id
    where us.user_id = target_user
    order by
      case
        when us.status = 'active' and (us.expires_at is null or us.expires_at >= timezone('utc', now())) then 0
        when us.status in ('trialing', 'past_due')
          and (us.expires_at is null or us.expires_at >= timezone('utc', now())) then 1
        else 2
      end,
      coalesce(us.expires_at, timezone('utc', now()) + interval '100 years') desc,
      us.started_at desc
    limit 1;

    if plan_record.plan_id is null then
      select subscription_status into plan_record.subscription_status
      from public.profiles
      where id = target_user;

      if plan_record.subscription_status is not null
         and plan_record.subscription_status in ('active', 'trialing') then
        raise exception 'We could not locate the subscription record tied to this account. Please contact support to restore access.';
      end if;

      raise exception 'No active subscription found for this account.';
    end if;
  end if;

  if plan_record.subscription_status <> 'active' then
    if plan_record.subscription_status in ('trialing', 'past_due')
       and (plan_record.expires_at is null or plan_record.expires_at >= timezone('utc', now())) then
      update public.user_subscriptions
      set status = 'active',
          canceled_at = null,
          updated_at = timezone('utc', now())
      where id = plan_record.subscription_id;

      plan_record.subscription_status := 'active';

      update public.profiles
      set subscription_status = 'active',
          updated_at = timezone('utc', now())
      where id = target_user;
    else
      raise exception 'No active subscription found for this account.';
    end if;
  end if;

  if plan_record.expires_at is not null and plan_record.expires_at < timezone('utc', now()) then
    update public.profiles
    set subscription_status = 'expired',
        updated_at = timezone('utc', now())
    where id = target_user;

    raise exception 'This subscription expired on % and needs to be renewed before daily questions can be generated.',
      to_char(plan_record.expires_at::date, 'Mon DD, YYYY');
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
    raise exception 'No active study slot is scheduled for your department.';
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
    insert into public.daily_quizzes (user_id, assigned_date, time_limit_seconds)
    values (target_user, current_date, time_limit)
    returning id into quiz_id;
  else
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
      time_limit_seconds = time_limit,
      updated_at = timezone('utc', now())
  where id = quiz_id;

  if bucket_record.id is not null then
    update public.study_cycle_daily_buckets
    set status = case when status = 'ready' then 'published' else status end,
        updated_at = timezone('utc', now())
    where id = bucket_record.id;
  end if;

  return query select quiz_id;
end;
$$;
