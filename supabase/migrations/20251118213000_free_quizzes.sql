-- Free quiz feature schema

create table if not exists public.free_quizzes (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text not null unique,
  description text,
  intro text,
  is_active boolean not null default true,
  time_limit_seconds integer,
  question_count integer not null default 0,
  total_attempts integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.free_quiz_questions (
  id uuid primary key default gen_random_uuid(),
  free_quiz_id uuid not null references public.free_quizzes on delete cascade,
  question_id uuid references public.questions on delete set null,
  prompt text not null,
  explanation text,
  image_url text,
  options jsonb not null,
  correct_option text not null,
  order_index integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.free_quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  free_quiz_id uuid not null references public.free_quizzes on delete cascade,
  profile_id uuid references public.profiles on delete set null,
  started_at timestamptz not null default timezone('utc', now()),
  completed_at timestamptz,
  duration_seconds integer,
  total_questions integer not null default 0,
  correct_count integer not null default 0,
  score numeric(6,2),
  metadata jsonb not null default '{}'::jsonb
);

-- helper to refresh counts
create or replace function public.refresh_free_quiz_question_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.free_quizzes fq
  set question_count = (
      select count(*)
      from public.free_quiz_questions fqq
      where fqq.free_quiz_id = coalesce(new.free_quiz_id, old.free_quiz_id)
    ),
    updated_at = timezone('utc', now())
  where fq.id = coalesce(new.free_quiz_id, old.free_quiz_id);
  return null;
end;
$$;

create or replace function public.refresh_free_quiz_attempts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.free_quizzes fq
  set total_attempts = (
      select count(*)
      from public.free_quiz_attempts fqa
      where fqa.free_quiz_id = coalesce(new.free_quiz_id, old.free_quiz_id)
    ),
    updated_at = timezone('utc', now())
  where fq.id = coalesce(new.free_quiz_id, old.free_quiz_id);
  return null;
end;
$$;

create trigger set_timestamp_free_quizzes
  before update on public.free_quizzes
  for each row
  execute procedure public.set_updated_at();

create trigger set_timestamp_free_quiz_questions
  before update on public.free_quiz_questions
  for each row
  execute procedure public.set_updated_at();

create trigger set_timestamp_free_quiz_attempts
  before update on public.free_quiz_attempts
  for each row
  execute procedure public.set_updated_at();

create trigger refresh_free_quiz_question_count_on_insert
  after insert on public.free_quiz_questions
  for each row
  execute function public.refresh_free_quiz_question_count();

create trigger refresh_free_quiz_question_count_on_delete
  after delete on public.free_quiz_questions
  for each row
  execute function public.refresh_free_quiz_question_count();

create trigger refresh_free_quiz_question_count_on_update
  after update on public.free_quiz_questions
  for each row
  execute function public.refresh_free_quiz_question_count();

create trigger refresh_free_quiz_attempts_on_insert
  after insert on public.free_quiz_attempts
  for each row
  execute function public.refresh_free_quiz_attempts();

create trigger refresh_free_quiz_attempts_on_delete
  after delete on public.free_quiz_attempts
  for each row
  execute function public.refresh_free_quiz_attempts();

-- RLS configuration
alter table public.free_quizzes enable row level security;
alter table public.free_quiz_questions enable row level security;
alter table public.free_quiz_attempts enable row level security;

create policy "Admins manage free quizzes" on public.free_quizzes
  for all using (public.is_admin()) with check (public.is_admin());

create policy "Admins manage free quiz questions" on public.free_quiz_questions
  for all using (public.is_admin()) with check (public.is_admin());

create policy "Admins view free quiz attempts" on public.free_quiz_attempts
  for select using (public.is_admin());

create policy "Public read free quizzes" on public.free_quizzes
  for select using (true);

create policy "Public read free quiz questions" on public.free_quiz_questions
  for select using (true);

create policy "Anon record free quiz attempts" on public.free_quiz_attempts
  for insert with check (true);

create policy "Anon update free quiz attempts" on public.free_quiz_attempts
  for update using (true) with check (true);

create policy "Anon view free quiz attempts" on public.free_quiz_attempts
  for select using (true);

create or replace view public.free_quiz_metrics as
select
  fq.id,
  fq.title,
  fq.slug,
  fq.is_active,
  fq.question_count,
  fq.total_attempts,
  fq.time_limit_seconds,
  fq.created_at,
  fq.updated_at,
  coalesce(avg(fqa.score), 0) as average_score,
  coalesce(avg(fqa.duration_seconds), 0) as average_duration_seconds
from public.free_quizzes fq
left join public.free_quiz_attempts fqa on fqa.free_quiz_id = fq.id
group by fq.id;
