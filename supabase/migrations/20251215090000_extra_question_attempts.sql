-- Track learner attempts for extra (bonus) question sets

create table if not exists public.extra_question_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  set_id uuid not null references public.extra_question_sets on delete cascade,
  status text not null default 'in_progress' check (
    status in ('in_progress', 'completed', 'abandoned')
  ),
  attempt_number integer not null default 1 check (attempt_number > 0),
  started_at timestamptz not null default timezone('utc', now()),
  completed_at timestamptz,
  duration_seconds integer,
  total_questions integer,
  correct_answers integer,
  score_percent numeric(5, 2),
  response_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists extra_question_attempts_user_idx
  on public.extra_question_attempts (user_id, set_id);

create index if not exists extra_question_attempts_set_idx
  on public.extra_question_attempts (set_id, status);

create unique index if not exists extra_question_attempts_unique_attempt
  on public.extra_question_attempts (user_id, set_id, attempt_number);

comment on table public.extra_question_attempts is
  'Stores each learner attempt for bonus/extra question sets.';

comment on column public.extra_question_attempts.status is
  'Attempt lifecycle state: in_progress, completed, or abandoned.';

comment on column public.extra_question_attempts.response_snapshot is
  'Cached payload of the completed attempt used for result review.';

create trigger set_timestamp_extra_question_attempts
  before update on public.extra_question_attempts
  for each row
  execute procedure public.set_updated_at();

alter table public.extra_question_attempts enable row level security;

create policy "Learners read extra attempts" on public.extra_question_attempts
  for select using (
    auth.uid() = user_id
    or public.is_admin()
  );

create policy "Learners insert extra attempts" on public.extra_question_attempts
  for insert with check (auth.uid() = user_id);

create policy "Learners update extra attempts" on public.extra_question_attempts
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

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
    s.visibility_rules
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

grant execute on function public.start_extra_question_attempt(uuid) to authenticated;
grant execute on function public.start_extra_question_attempt(uuid) to anon;
