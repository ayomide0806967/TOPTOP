-- Department-aware subscriptions and question slot scheduling overhaul
set check_function_bodies = off;

-------------------------------------------------------------------------------
-- Enums for slot and subslot lifecycle
-------------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'slot_status') then
    create type public.slot_status as enum ('draft', 'scheduled', 'active', 'completed', 'archived');
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'subslot_status') then
    create type public.subslot_status as enum ('draft', 'pending', 'ready', 'active', 'completed', 'archived');
  end if;
end
$$;

-------------------------------------------------------------------------------
-- Subscription catalogue enhancements
-------------------------------------------------------------------------------

alter table public.subscription_products
  add column if not exists department_id uuid references public.departments on delete set null;

create index if not exists subscription_products_department_idx
  on public.subscription_products (department_id);

alter table public.subscription_plans
  add column if not exists daily_question_limit integer not null default 0,
  add column if not exists duration_days integer not null default 30,
  add column if not exists plan_tier text;

-------------------------------------------------------------------------------
-- Question slot metadata (formerly study cycles)
-------------------------------------------------------------------------------

alter table public.study_cycles
  add column if not exists code text,
  add column if not exists status public.slot_status not null default 'draft',
  add column if not exists questions_per_day integer not null default 250,
  add column if not exists question_cap integer not null default 7000,
  add column if not exists duration_days integer not null default 30,
  add column if not exists source_cycle_id uuid references public.study_cycles on delete set null;

create unique index if not exists study_cycles_code_unique
  on public.study_cycles (code)
  where code is not null;

alter table public.study_cycle_weeks
  add column if not exists day_span integer not null default 7,
  add column if not exists start_date date,
  add column if not exists end_date date,
  add column if not exists question_target integer not null default 1750,
  add column if not exists question_count integer not null default 0,
  add column if not exists status public.subslot_status not null default 'draft',
  add column if not exists activated_at timestamptz,
  add column if not exists source_subslot_id uuid references public.study_cycle_weeks on delete set null;

-------------------------------------------------------------------------------
-- Subslot configuration tables
-------------------------------------------------------------------------------

create table if not exists public.study_cycle_subslot_topics (
  id uuid primary key default gen_random_uuid(),
  subslot_id uuid not null references public.study_cycle_weeks on delete cascade,
  topic_id uuid not null references public.topics on delete cascade,
  selection_mode text not null default 'random',
  question_count integer,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint study_cycle_subslot_topics_unique unique (subslot_id, topic_id)
);

create table if not exists public.study_cycle_subslot_questions (
  id uuid primary key default gen_random_uuid(),
  subslot_id uuid not null references public.study_cycle_weeks on delete cascade,
  question_id uuid not null references public.questions on delete cascade,
  order_index integer not null,
  day_offset integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint study_cycle_subslot_questions_unique unique (subslot_id, question_id)
);

create index if not exists study_cycle_subslot_questions_order_idx
  on public.study_cycle_subslot_questions (subslot_id, order_index);

-------------------------------------------------------------------------------
-- Deterministic daily scheduling engine metadata
-------------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'schedule_run_status') then
    create type public.schedule_run_status as enum ('pending', 'success', 'warning', 'failed');
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'daily_bucket_status') then
    create type public.daily_bucket_status as enum ('planned', 'ready', 'underfilled', 'published', 'completed');
  end if;
end
$$;

create table if not exists public.study_cycle_schedule_runs (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references public.study_cycles on delete cascade,
  run_type text not null default 'manual',
  triggered_by uuid,
  triggered_at timestamptz not null default timezone('utc', now()),
  completed_at timestamptz,
  status public.schedule_run_status not null default 'pending',
  detail jsonb,
  missing_days integer not null default 0,
  missing_questions integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.study_cycle_daily_buckets (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references public.study_cycles on delete cascade,
  subslot_id uuid not null references public.study_cycle_weeks on delete cascade,
  run_id uuid references public.study_cycle_schedule_runs on delete set null,
  scheduled_date date,
  day_offset integer not null,
  question_target integer not null,
  question_count integer not null default 0,
  missing_questions integer not null default 0,
  status public.daily_bucket_status not null default 'planned',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint study_cycle_daily_buckets_unique unique (subslot_id, day_offset)
);

create index if not exists study_cycle_daily_buckets_cycle_date_idx
  on public.study_cycle_daily_buckets (cycle_id, scheduled_date);

create index if not exists study_cycle_daily_buckets_status_idx
  on public.study_cycle_daily_buckets (status);

-------------------------------------------------------------------------------
-- Triggers for automatic timestamps
-------------------------------------------------------------------------------

drop trigger if exists set_timestamp_study_cycle_subslot_topics on public.study_cycle_subslot_topics;
create trigger set_timestamp_study_cycle_subslot_topics
  before update on public.study_cycle_subslot_topics
  for each row
  execute function public.set_updated_at();

drop trigger if exists set_timestamp_study_cycle_subslot_questions on public.study_cycle_subslot_questions;
create trigger set_timestamp_study_cycle_subslot_questions
  before update on public.study_cycle_subslot_questions
  for each row
  execute function public.set_updated_at();

drop trigger if exists set_timestamp_study_cycle_schedule_runs on public.study_cycle_schedule_runs;
create trigger set_timestamp_study_cycle_schedule_runs
  before update on public.study_cycle_schedule_runs
  for each row
  execute function public.set_updated_at();

drop trigger if exists set_timestamp_study_cycle_daily_buckets on public.study_cycle_daily_buckets;
create trigger set_timestamp_study_cycle_daily_buckets
  before update on public.study_cycle_daily_buckets
  for each row
  execute function public.set_updated_at();

-------------------------------------------------------------------------------
-- Row-Level Security and grants
-------------------------------------------------------------------------------

alter table public.study_cycle_subslot_topics enable row level security;
alter table public.study_cycle_subslot_questions enable row level security;
alter table public.study_cycle_schedule_runs enable row level security;
alter table public.study_cycle_daily_buckets enable row level security;

drop policy if exists "Admins manage subslot topics" on public.study_cycle_subslot_topics;
create policy "Admins manage subslot topics" on public.study_cycle_subslot_topics
  for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Admins manage subslot questions" on public.study_cycle_subslot_questions;
create policy "Admins manage subslot questions" on public.study_cycle_subslot_questions
  for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Admins manage schedule runs" on public.study_cycle_schedule_runs;
create policy "Admins manage schedule runs" on public.study_cycle_schedule_runs
  for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Admins manage daily buckets" on public.study_cycle_daily_buckets;
create policy "Admins manage daily buckets" on public.study_cycle_daily_buckets
  for all
  using (public.is_admin())
  with check (public.is_admin());

grant select, insert, update, delete on table public.study_cycle_subslot_topics to authenticated;
grant select, insert, update, delete on table public.study_cycle_subslot_questions to authenticated;
grant select on table public.study_cycle_schedule_runs to authenticated;
grant insert, update, delete on table public.study_cycle_schedule_runs to authenticated;
grant select, insert, update, delete on table public.study_cycle_daily_buckets to authenticated;

-------------------------------------------------------------------------------
-- Helper function to populate a subslot with curated questions
-------------------------------------------------------------------------------

drop function if exists public.fill_subslot_questions(uuid, jsonb, boolean);
create or replace function public.fill_subslot_questions(
  p_subslot_id uuid,
  p_requests jsonb,
  p_replace boolean default true
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  slot_record record;
  request jsonb;
  available_count integer;
  required_count integer;
  inserted_total integer := 0;
  base_index integer;
  questions_per_day integer;
  detail jsonb := '[]'::jsonb;
begin
  select sw.id as subslot_id, sw.day_span, sw.question_target, sc.questions_per_day
    into slot_record
  from public.study_cycle_weeks sw
  join public.study_cycles sc on sc.id = sw.study_cycle_id
  where sw.id = p_subslot_id;

  if slot_record.subslot_id is null then
    raise exception 'Subslot % not found', p_subslot_id;
  end if;

  questions_per_day := greatest(slot_record.questions_per_day, 1);

  if coalesce(p_replace, true) then
    delete from public.study_cycle_subslot_topics where subslot_id = p_subslot_id;
    delete from public.study_cycle_subslot_questions where subslot_id = p_subslot_id;
  end if;

  base_index := coalesce((select max(order_index) from public.study_cycle_subslot_questions where subslot_id = p_subslot_id), 0);

  for request in select * from jsonb_array_elements(coalesce(p_requests, '[]'::jsonb)) loop
    if request ->> 'topic_id' is null then
      continue;
    end if;

    required_count := coalesce((request ->> 'question_count')::integer, 0);

    select count(*)
      into available_count
    from public.questions q
    where q.topic_id = (request ->> 'topic_id')::uuid;

    if coalesce(request ->> 'selection_mode', 'random') = 'all' then
      required_count := available_count;
    end if;

    if required_count <= 0 then
      continue;
    end if;

    if available_count < required_count then
      raise exception 'Topic % only has % questions, but % requested.',
        request ->> 'topic_id', available_count, required_count;
    end if;

    insert into public.study_cycle_subslot_topics (subslot_id, topic_id, selection_mode, question_count)
    values (
      p_subslot_id,
      (request ->> 'topic_id')::uuid,
      coalesce(request ->> 'selection_mode', 'random'),
      required_count
    )
    on conflict (subslot_id, topic_id) do update
      set selection_mode = excluded.selection_mode,
          question_count = excluded.question_count,
          updated_at = timezone('utc', now());

    with sampled as (
      select q.id
      from public.questions q
      where q.topic_id = (request ->> 'topic_id')::uuid
      order by case when coalesce(request ->> 'selection_mode', 'random') = 'random' then random()::text else q.created_at::text end
      limit required_count
    ), numbered as (
      select id, row_number() over () as rn from sampled
    )
    insert into public.study_cycle_subslot_questions (subslot_id, question_id, order_index, day_offset)
    select
      p_subslot_id,
      numbered.id,
      base_index + numbered.rn,
      floor((base_index + numbered.rn - 1) / questions_per_day)::integer
    from numbered;

    base_index := base_index + required_count;
    inserted_total := inserted_total + required_count;

    detail := detail || jsonb_build_array(jsonb_build_object(
      'topic_id', request ->> 'topic_id',
      'questions_selected', required_count
    ));
  end loop;

  update public.study_cycle_weeks
  set question_count = (select count(*) from public.study_cycle_subslot_questions where subslot_id = p_subslot_id),
      updated_at = timezone('utc', now())
  where id = p_subslot_id;

  return jsonb_build_object(
    'questions_selected', inserted_total,
    'details', detail
  );
end;
$$;

grant execute on function public.fill_subslot_questions(uuid, jsonb, boolean) to authenticated;

-------------------------------------------------------------------------------
-- Deterministic daily scheduling routine
-------------------------------------------------------------------------------

drop function if exists public.refresh_cycle_daily_schedule(uuid, uuid, boolean);
create or replace function public.refresh_cycle_daily_schedule(
  p_cycle_id uuid,
  p_triggered_by uuid default null,
  p_replace boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  cycle_record record;
  subslot_record record;
  run_id uuid;
  day_target integer;
  ready_days integer := 0;
  underfilled_days integer := 0;
  empty_days integer := 0;
  unscheduled_days integer := 0;
  total_missing_questions integer := 0;
  total_days integer := 0;
  scheduled_date date;
  question_count integer;
  bucket_status public.daily_bucket_status;
  summary jsonb;
begin
  select sc.id,
         sc.department_id,
         sc.start_date,
         coalesce(sc.questions_per_day, 250) as per_day
    into cycle_record
  from public.study_cycles sc
  where sc.id = p_cycle_id;

  if cycle_record.id is null then
    raise exception 'Study cycle % not found.', p_cycle_id;
  end if;

  day_target := greatest(1, cycle_record.per_day);

  insert into public.study_cycle_schedule_runs (cycle_id, run_type, triggered_by, status)
  values (p_cycle_id, 'manual', p_triggered_by, 'pending'::public.schedule_run_status)
  returning id into run_id;

  begin
    if p_replace then
      delete from public.study_cycle_daily_buckets where cycle_id = p_cycle_id;
    end if;

    for subslot_record in
      select sw.id,
             sw.week_index,
             sw.day_span,
             sw.start_date,
             sw.question_target
        from public.study_cycle_weeks sw
        where sw.study_cycle_id = p_cycle_id
        order by sw.week_index nulls last, sw.id
    loop
      if subslot_record.day_span is null or subslot_record.day_span <= 0 then
        continue;
      end if;

      for loop_day_offset in 0 .. (subslot_record.day_span - 1) loop
        total_days := total_days + 1;
        scheduled_date := null;
        if subslot_record.start_date is not null then
          scheduled_date := subslot_record.start_date + loop_day_offset;
        else
          unscheduled_days := unscheduled_days + 1;
        end if;

        select count(*)
          into question_count
        from public.study_cycle_subslot_questions q
        where q.subslot_id = subslot_record.id
          and q.day_offset = loop_day_offset;

        if question_count >= day_target then
          bucket_status := 'ready';
          ready_days := ready_days + 1;
        elsif question_count > 0 then
          bucket_status := 'underfilled';
          underfilled_days := underfilled_days + 1;
        else
          bucket_status := 'planned';
          empty_days := empty_days + 1;
        end if;

        total_missing_questions := total_missing_questions + greatest(day_target - question_count, 0);

        insert into public.study_cycle_daily_buckets (
          cycle_id,
          subslot_id,
          run_id,
          scheduled_date,
          day_offset,
          question_target,
          question_count,
          missing_questions,
          status
        ) values (
          p_cycle_id,
          subslot_record.id,
          run_id,
          scheduled_date,
          loop_day_offset,
          day_target,
          question_count,
          greatest(day_target - question_count, 0),
          bucket_status
        )
        on conflict (subslot_id, day_offset) do update
        set run_id = excluded.run_id,
            scheduled_date = excluded.scheduled_date,
            question_target = excluded.question_target,
            question_count = excluded.question_count,
            missing_questions = excluded.missing_questions,
            status = excluded.status,
            updated_at = timezone('utc', now());
      end loop;
    end loop;

    summary := jsonb_build_object(
      'total_days', total_days,
      'ready_days', ready_days,
      'underfilled_days', underfilled_days,
      'empty_days', empty_days,
      'unscheduled_days', unscheduled_days,
      'missing_questions', total_missing_questions
    );

    update public.study_cycle_schedule_runs
    set completed_at = timezone('utc', now()),
        status = (
          case
            when total_days = 0 then 'warning'
            when unscheduled_days > 0 or empty_days > 0 or underfilled_days > 0 then 'warning'
            else 'success'
          end
        )::public.schedule_run_status,
        detail = summary,
        missing_days = empty_days + unscheduled_days,
        missing_questions = total_missing_questions,
        updated_at = timezone('utc', now())
    where id = run_id;

    return jsonb_build_object('run_id', run_id, 'summary', summary);
  exception
    when others then
      update public.study_cycle_schedule_runs
      set completed_at = timezone('utc', now()),
          status = 'failed'::public.schedule_run_status,
          detail = jsonb_build_object('error', SQLERRM),
          updated_at = timezone('utc', now())
      where id = run_id;
      raise;
  end;
end;
$$;

grant execute on function public.refresh_cycle_daily_schedule(uuid, uuid, boolean) to authenticated;

-------------------------------------------------------------------------------
-- Helper to clone an existing subslot configuration (topics + question pool)
-------------------------------------------------------------------------------

drop function if exists public.clone_subslot_pool(uuid, uuid, boolean);
create or replace function public.clone_subslot_pool(
  p_source_subslot uuid,
  p_target_subslot uuid,
  p_replace boolean default true
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  topics_copied integer := 0;
  questions_copied integer := 0;
begin
  if p_source_subslot is null or p_target_subslot is null then
    raise exception 'Source and destination subslots are required.';
  end if;

  if p_replace then
    delete from public.study_cycle_subslot_topics where subslot_id = p_target_subslot;
    delete from public.study_cycle_subslot_questions where subslot_id = p_target_subslot;
  end if;

  with inserted_topics as (
    insert into public.study_cycle_subslot_topics (id, subslot_id, topic_id, selection_mode, question_count)
    select
      gen_random_uuid(),
      p_target_subslot,
      topic_id,
      selection_mode,
      question_count
    from public.study_cycle_subslot_topics
    where subslot_id = p_source_subslot
    on conflict (subslot_id, topic_id) do update
      set selection_mode = excluded.selection_mode,
          question_count = excluded.question_count,
          updated_at = timezone('utc', now())
    returning 1
  )
  select count(*) into topics_copied from inserted_topics;

  with inserted_questions as (
    insert into public.study_cycle_subslot_questions (id, subslot_id, question_id, order_index, day_offset)
    select
      gen_random_uuid(),
      p_target_subslot,
      question_id,
      order_index,
      day_offset
    from public.study_cycle_subslot_questions
    where subslot_id = p_source_subslot
    on conflict (subslot_id, question_id) do update
      set order_index = excluded.order_index,
          day_offset = excluded.day_offset,
          updated_at = timezone('utc', now())
    returning 1
  )
  select count(*) into questions_copied from inserted_questions;

  update public.study_cycle_weeks
  set question_count = (select count(*) from public.study_cycle_subslot_questions where subslot_id = p_target_subslot),
      updated_at = timezone('utc', now())
  where id = p_target_subslot;

  return jsonb_build_object(
    'topics_copied', topics_copied,
    'questions_copied', questions_copied
  );
end;
$$;

grant execute on function public.clone_subslot_pool(uuid, uuid, boolean) to authenticated;

-------------------------------------------------------------------------------
-- Rebuild subscription_products_with_plans view with department context
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
  pl.plan_tier
from public.subscription_products p
left join public.subscription_plans pl on pl.product_id = p.id
left join public.departments d on d.id = p.department_id
where p.is_active;

-------------------------------------------------------------------------------
-- Daily quiz generation aligned with scheduled subslots
-------------------------------------------------------------------------------

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
  day_offset integer;
begin
  if target_user is null then
    raise exception 'Authentication required';
  end if;

  select sp.id as plan_id,
         sp.daily_question_limit,
         sp.duration_days,
         sp.plan_tier,
         sp.questions,
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

  day_offset := greatest(coalesce(subslot_record.day_offset, 0), 0);

  select db.*
    into bucket_record
  from public.study_cycle_daily_buckets db
  where db.subslot_id = subslot_record.id
    and db.day_offset = day_offset
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
      and q.day_offset = day_offset;
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
    insert into public.daily_quizzes (user_id, assigned_date)
    values (target_user, current_date)
    returning id into quiz_id;
  else
    delete from public.daily_quiz_questions where daily_quiz_id = quiz_id;
  end if;

  with todays_questions as (
    select question_id, order_index
    from public.study_cycle_subslot_questions q
    where q.subslot_id = subslot_record.id
      and q.day_offset = day_offset
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
