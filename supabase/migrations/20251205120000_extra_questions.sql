-- Extra question sets for targeted practice

create table if not exists public.extra_question_sets (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  visibility_rules jsonb not null default '{"allowAllDepartments": true, "departmentIds": [], "allowAllPlans": true, "planTiers": []}'::jsonb,
  starts_at timestamptz,
  ends_at timestamptz,
  is_active boolean not null default false,
  question_count integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.extra_questions (
  id uuid primary key default gen_random_uuid(),
  set_id uuid not null references public.extra_question_sets on delete cascade,
  stem text not null,
  explanation text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.extra_question_options (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.extra_questions on delete cascade,
  label text not null,
  content text not null,
  is_correct boolean not null default false,
  order_index integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists extra_questions_set_id_idx
  on public.extra_questions (set_id);

create index if not exists extra_question_options_question_id_idx
  on public.extra_question_options (question_id);

create trigger set_timestamp_extra_question_sets
  before update on public.extra_question_sets
  for each row
  execute procedure public.set_updated_at();

create trigger set_timestamp_extra_questions
  before update on public.extra_questions
  for each row
  execute procedure public.set_updated_at();

create trigger set_timestamp_extra_question_options
  before update on public.extra_question_options
  for each row
  execute procedure public.set_updated_at();

create or replace function public.refresh_extra_question_set_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.extra_question_sets s
  set question_count = (
      select count(*)
      from public.extra_questions q
      where q.set_id = coalesce(new.set_id, old.set_id)
    ),
    updated_at = timezone('utc', now())
  where s.id = coalesce(new.set_id, old.set_id);
  return null;
end;
$$;

drop trigger if exists refresh_extra_question_set_count_on_insert on public.extra_questions;
drop trigger if exists refresh_extra_question_set_count_on_delete on public.extra_questions;
drop trigger if exists refresh_extra_question_set_count_on_update on public.extra_questions;

create trigger refresh_extra_question_set_count_on_insert
  after insert on public.extra_questions
  for each row
  execute function public.refresh_extra_question_set_count();

create trigger refresh_extra_question_set_count_on_delete
  after delete on public.extra_questions
  for each row
  execute function public.refresh_extra_question_set_count();

create trigger refresh_extra_question_set_count_on_update
  after update on public.extra_questions
  for each row
  execute function public.refresh_extra_question_set_count();

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

  return department_allowed and plan_allowed;
end;
$$;

grant execute on function public.extra_question_visibility_allows_user(boolean, timestamptz, timestamptz, jsonb, uuid) to authenticated;

grant execute on function public.extra_question_visibility_allows_user(boolean, timestamptz, timestamptz, jsonb, uuid) to anon;

alter table public.extra_question_sets enable row level security;
alter table public.extra_questions enable row level security;
alter table public.extra_question_options enable row level security;

create policy "Admins manage extra question sets" on public.extra_question_sets
  for all using (public.is_admin()) with check (public.is_admin());

create policy "Admins manage extra questions" on public.extra_questions
  for all using (public.is_admin()) with check (public.is_admin());

create policy "Admins manage extra question options" on public.extra_question_options
  for all using (public.is_admin()) with check (public.is_admin());

create policy "Learners view extra question sets" on public.extra_question_sets
  for select using (
    public.is_admin()
    or public.extra_question_visibility_allows_user(
      is_active,
      starts_at,
      ends_at,
      visibility_rules,
      auth.uid()
    )
  );

create policy "Learners view extra questions" on public.extra_questions
  for select using (
    public.is_admin()
    or exists (
      select 1
      from public.extra_question_sets s
      where s.id = extra_questions.set_id
        and public.extra_question_visibility_allows_user(
          s.is_active,
          s.starts_at,
          s.ends_at,
          s.visibility_rules,
          auth.uid()
        )
    )
  );

create policy "Learners view extra question options" on public.extra_question_options
  for select using (
    public.is_admin()
    or exists (
      select 1
      from public.extra_questions q
      join public.extra_question_sets s on s.id = q.set_id
      where q.id = extra_question_options.question_id
        and public.extra_question_visibility_allows_user(
          s.is_active,
          s.starts_at,
          s.ends_at,
          s.visibility_rules,
          auth.uid()
        )
    )
  );
