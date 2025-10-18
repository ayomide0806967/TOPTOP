-- Extend extra question sets with assignment rules and attempt limits

alter table if exists public.extra_question_sets
  add column if not exists max_attempts_per_user integer check (max_attempts_per_user > 0),
  add column if not exists assignment_rules jsonb not null default '{"default":{"mode":"full_set","value":null},"overrides":[]}'::jsonb;

comment on column public.extra_question_sets.max_attempts_per_user is
  'Optional cap on how many times a learner can complete the set.';

comment on column public.extra_question_sets.assignment_rules is
  'Describes how questions should be allocated (full set, fixed count, percentage) with optional plan-specific overrides.';

create or replace function public.start_extra_question_attempt(p_set_id uuid)
returns public.extra_question_attempts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_set record;
  v_attempt public.extra_question_attempts;
  v_next_attempt_number integer;
  v_completed_count integer;
begin
  if p_set_id is null then
    raise exception using message = 'Practice set id is required.';
  end if;

  select
    s.id,
    s.question_count,
    s.is_active,
    s.starts_at,
    s.ends_at,
    s.visibility_rules,
    s.max_attempts_per_user
  into v_set
  from public.extra_question_sets s
  where s.id = p_set_id;

  if not found then
    raise exception using message = 'Extra question set not found.';
  end if;

  if not public.extra_question_visibility_allows_user(
    v_set.is_active,
    v_set.starts_at,
    v_set.ends_at,
    v_set.visibility_rules,
    auth.uid()
  ) then
    raise exception using message = 'You do not have access to this practice set.';
  end if;

  if v_set.max_attempts_per_user is not null then
    select count(*)
      into v_completed_count
      from public.extra_question_attempts
     where set_id = p_set_id
       and user_id = auth.uid()
       and status = 'completed';

    if v_completed_count >= v_set.max_attempts_per_user then
      raise exception using message = 'You have reached the maximum number of attempts for this practice set.';
    end if;
  end if;

  update public.extra_question_attempts
     set status = 'abandoned',
         completed_at = coalesce(completed_at, timezone('utc', now())),
         updated_at = timezone('utc', now())
   where set_id = p_set_id
     and user_id = auth.uid()
     and status = 'in_progress';

  select coalesce(max(attempt_number), 0) + 1
    into v_next_attempt_number
    from public.extra_question_attempts
   where set_id = p_set_id
     and user_id = auth.uid();

  insert into public.extra_question_attempts (
    user_id,
    set_id,
    status,
    attempt_number,
    started_at,
    total_questions,
    response_snapshot
  )
  values (
    auth.uid(),
    p_set_id,
    'in_progress',
    v_next_attempt_number,
    timezone('utc', now()),
    v_set.question_count,
    '{}'::jsonb
  )
  returning *
  into v_attempt;

  return v_attempt;
end;
$$;

create or replace function public.extra_question_visibility_allows_user(
  p_is_active boolean,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_visibility jsonb,
  p_user_id uuid
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  allow_all_departments boolean := coalesce((p_visibility->>'allowAllDepartments')::boolean, true);
  allow_all_plans boolean := coalesce((p_visibility->>'allowAllPlans')::boolean, true);
  department_allowed boolean := allow_all_departments;
  plan_allowed boolean := allow_all_plans;
  plan_id_list text[] := array[]::text[];
begin
  if not coalesce(p_is_active, false) then
    return false;
  end if;

  if p_starts_at is not null and p_starts_at > timezone('utc', now()) then
    return false;
  end if;

  if p_ends_at is not null and p_ends_at < timezone('utc', now()) then
    return false;
  end if;

  if p_user_id is null then
    return allow_all_departments and allow_all_plans;
  end if;

  if not allow_all_departments then
    select exists (
      select 1
      from public.profiles prof
      join lateral jsonb_array_elements_text(coalesce(p_visibility->'departmentIds', '[]'::jsonb)) dept(value) on true
      where prof.id = p_user_id
        and prof.department_id is not null
        and prof.department_id::text = dept.value
    )
    into department_allowed;
  end if;

  if not allow_all_plans then
    select exists (
      select 1
      from public.user_subscriptions us
      join public.subscription_plans sp on sp.id = us.plan_id
      join lateral jsonb_array_elements_text(coalesce(p_visibility->'planTiers', '[]'::jsonb)) tier(value) on true
      where us.user_id = p_user_id
        and us.status is not null
        and lower(us.status) in ('active', 'trialing')
        and (us.expires_at is null or us.expires_at >= timezone('utc', now()))
        and sp.plan_tier is not null
        and lower(sp.plan_tier::text) = lower(tier.value)
    )
    into plan_allowed;
  end if;

  if plan_allowed then
    select coalesce(array_agg(value), array[]::text[])
      into plan_id_list
      from jsonb_array_elements_text(coalesce(p_visibility->'planIds', '[]'::jsonb))
      as plan(value);

    if array_length(plan_id_list, 1) > 0 then
      select exists (
        select 1
        from public.user_subscriptions us
        where us.user_id = p_user_id
          and us.status is not null
          and lower(us.status) in ('active', 'trialing')
          and (us.expires_at is null or us.expires_at >= timezone('utc', now()))
          and us.plan_id::text = any(plan_id_list)
      )
      into plan_allowed;
    end if;
  end if;

  return department_allowed and plan_allowed;
end;
$$;
