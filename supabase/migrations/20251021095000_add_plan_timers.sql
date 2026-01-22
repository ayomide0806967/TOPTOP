set check_function_bodies = off;

alter table public.subscription_plans
  add column if not exists quiz_duration_minutes integer;

alter table public.daily_quizzes
  add column if not exists time_limit_seconds integer;

create or replace view public.subscription_products_with_plans as
select
  p.id,
  p.code as product_code,
  p.name as product_name,
  p.product_type,
  p.description,
  p.is_active,
  p.department_id,
  d.name as department_name,
  d.slug as department_slug,
  d.color_theme,
  pl.id as plan_id,
  pl.code as plan_code,
  coalesce(pl.name, pl.code) as plan_name,
  pl.price,
  pl.currency,
  pl.questions,
  pl.quizzes,
  pl.participants,
  pl.metadata,
  pl.is_active as plan_is_active,
  pl.daily_question_limit,
  pl.duration_days,
  pl.plan_tier,
  pl.quiz_duration_minutes
from public.subscription_products p
left join public.subscription_plans pl on pl.product_id = p.id
left join public.departments d on d.id = p.department_id
where p.is_active;

drop function if exists public.generate_daily_quiz(integer);
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

  select sp.id as plan_id,
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
      and q.day_offset = v_day_offset
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

grant execute on function public.generate_daily_quiz(integer) to authenticated;

grant select on table public.subscription_products_with_plans to authenticated, anon;
