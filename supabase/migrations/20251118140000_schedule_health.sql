set check_function_bodies = off;

-------------------------------------------------------------------------------
-- Admin audit logging for critical scheduling operations
-------------------------------------------------------------------------------

create table if not exists public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.admin_audit_logs enable row level security;

drop policy if exists "Admins manage admin audit logs" on public.admin_audit_logs;
create policy "Admins manage admin audit logs" on public.admin_audit_logs
  for all
  using (public.is_admin())
  with check (public.is_admin());

grant select, insert on table public.admin_audit_logs to authenticated;

drop function if exists public.log_admin_audit_event(text, text, uuid, jsonb);
create or replace function public.log_admin_audit_event(
  p_action text,
  p_entity_type text,
  p_entity_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  log_id uuid := gen_random_uuid();
begin
  insert into public.admin_audit_logs (id, actor_id, action, entity_type, entity_id, metadata)
  values (
    log_id,
    auth.uid(),
    coalesce(p_action, 'unknown_action'),
    coalesce(p_entity_type, 'unspecified'),
    p_entity_id,
    coalesce(p_metadata, '{}'::jsonb)
  );
  return log_id;
end;
$$;

grant execute on function public.log_admin_audit_event(text, text, uuid, jsonb) to authenticated;

-------------------------------------------------------------------------------
-- Deterministic schedule health reporting for admin dashboards
-------------------------------------------------------------------------------

drop function if exists public.get_cycle_schedule_health(uuid);
create or replace function public.get_cycle_schedule_health(p_department_id uuid)
returns table (
  cycle_id uuid,
  cycle_title text,
  cycle_status text,
  last_run_status public.schedule_run_status,
  last_run_completed_at timestamptz,
  total_days integer,
  ready_days integer,
  underfilled_days integer,
  empty_days integer,
  unscheduled_days integer,
  missing_questions integer,
  bucket_ready integer,
  bucket_underfilled integer,
  bucket_planned integer,
  bucket_published integer,
  alerts text[]
)
language sql
security definer
set search_path = public
as $$
  with cycles as (
    select sc.id, sc.title, sc.status, sc.start_date
      from public.study_cycles sc
     where sc.department_id = p_department_id
  ),
  run_summary as (
    select
      c.id as cycle_id,
      sr.id as run_id,
      sr.status as run_status,
      sr.completed_at,
      (sr.detail ->> 'total_days')::integer as total_days,
      (sr.detail ->> 'ready_days')::integer as ready_days,
      (sr.detail ->> 'underfilled_days')::integer as underfilled_days,
      (sr.detail ->> 'empty_days')::integer as empty_days,
      (sr.detail ->> 'unscheduled_days')::integer as unscheduled_days,
      (sr.detail ->> 'missing_questions')::integer as missing_questions
    from cycles c
    left join lateral (
      select *
        from public.study_cycle_schedule_runs sr
       where sr.cycle_id = c.id
       order by sr.completed_at desc nulls last, sr.created_at desc
       limit 1
    ) sr on true
  ),
  bucket_totals as (
    select
      c.id as cycle_id,
      count(*) filter (where b.status = 'ready') as ready_count,
      count(*) filter (where b.status = 'underfilled') as underfilled_count,
      count(*) filter (where b.status = 'planned') as planned_count,
      count(*) filter (where b.status = 'published') as published_count
    from cycles c
    left join public.study_cycle_daily_buckets b
      on b.cycle_id = c.id
    group by c.id
  )
  select
    c.id,
    c.title,
    c.status,
    rs.run_status,
    rs.completed_at,
    coalesce(rs.total_days, 0),
    coalesce(rs.ready_days, 0),
    coalesce(rs.underfilled_days, 0),
    coalesce(rs.empty_days, 0),
    coalesce(rs.unscheduled_days, 0),
    coalesce(rs.missing_questions, 0),
    coalesce(bt.ready_count, 0),
    coalesce(bt.underfilled_count, 0),
    coalesce(bt.planned_count, 0),
    coalesce(bt.published_count, 0),
    array_remove(array[
      case when rs.run_id is null then 'no_runs' end,
      case when rs.run_status = 'failed' then 'last_run_failed' end,
      case when coalesce(rs.unscheduled_days, 0) > 0 then 'unscheduled_days' end,
      case when coalesce(rs.empty_days, 0) > 0 then 'empty_days' end,
      case when coalesce(rs.underfilled_days, 0) > 0 then 'underfilled_days' end,
      case when coalesce(rs.missing_questions, 0) > 0 then 'missing_questions' end,
      case when coalesce(bt.underfilled_count, 0) > 0 then 'bucket_underfilled' end,
      case when coalesce(bt.planned_count, 0) > 0 then 'bucket_planned' end
    ], null) as alerts
  from cycles c
  left join run_summary rs on rs.cycle_id = c.id
  left join bucket_totals bt on bt.cycle_id = c.id
  order by c.start_date nulls last, c.title;
$$;

grant execute on function public.get_cycle_schedule_health(uuid) to authenticated;

-------------------------------------------------------------------------------
-- Learner-facing schedule health snapshot to surface messaging in dashboards
-------------------------------------------------------------------------------

drop function if exists public.get_user_schedule_health();
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
     and us.status = 'active'
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
   order by sc.start_date asc
   limit 1;

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

grant execute on function public.get_user_schedule_health() to authenticated;
