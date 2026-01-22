set check_function_bodies = off;

------------------------------------------------------------------------------
-- Examination Hall (PIN + candidate whitelist)
-- Reuses free_quizzes + free_quiz_questions for authoring, but locks access.
------------------------------------------------------------------------------

alter table public.free_quizzes
  add column if not exists access_mode text not null default 'public'
    check (access_mode in ('public', 'exam_hall')),
  add column if not exists join_pin text,
  add column if not exists starts_at timestamptz,
  add column if not exists ends_at timestamptz,
  add column if not exists seat_limit integer check (seat_limit is null or seat_limit >= 0),
  add column if not exists pass_mark_percent numeric(5,2) not null default 50;

create unique index if not exists free_quizzes_exam_hall_pin_key
  on public.free_quizzes (join_pin)
  where access_mode = 'exam_hall' and join_pin is not null;

create index if not exists free_quizzes_access_mode_idx
  on public.free_quizzes (access_mode);

------------------------------------------------------------------------------
-- Candidate whitelist (admission number)
------------------------------------------------------------------------------

create table if not exists public.exam_hall_candidates (
  id uuid primary key default gen_random_uuid(),
  free_quiz_id uuid not null references public.free_quizzes on delete cascade,
  admission_no text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint exam_hall_candidates_unique unique (free_quiz_id, admission_no)
);

create index if not exists exam_hall_candidates_quiz_idx
  on public.exam_hall_candidates (free_quiz_id);

alter table public.exam_hall_candidates enable row level security;

create policy "Admins manage exam hall candidates" on public.exam_hall_candidates
  for all using (public.is_admin()) with check (public.is_admin());

create trigger set_timestamp_exam_hall_candidates
  before update on public.exam_hall_candidates
  for each row
  execute procedure public.set_updated_at();

------------------------------------------------------------------------------
-- Attempts (PII stored here; keep locked to admins except via RPC)
------------------------------------------------------------------------------

create table if not exists public.exam_hall_attempts (
  id uuid primary key default gen_random_uuid(),
  free_quiz_id uuid not null references public.free_quizzes on delete cascade,
  admission_no text not null,
  first_name text not null,
  last_name text not null,
  phone text not null,
  started_at timestamptz not null default timezone('utc', now()),
  completed_at timestamptz,
  duration_seconds integer,
  total_questions integer not null default 0,
  correct_count integer not null default 0,
  score_percent numeric(6,2),
  passed boolean,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint exam_hall_attempts_unique unique (free_quiz_id, admission_no)
);

create index if not exists exam_hall_attempts_quiz_idx
  on public.exam_hall_attempts (free_quiz_id, completed_at);

alter table public.exam_hall_attempts enable row level security;

create policy "Admins view exam hall attempts" on public.exam_hall_attempts
  for select using (public.is_admin());

create policy "Admins manage exam hall attempts" on public.exam_hall_attempts
  for all using (public.is_admin()) with check (public.is_admin());

create trigger set_timestamp_exam_hall_attempts
  before update on public.exam_hall_attempts
  for each row
  execute procedure public.set_updated_at();

------------------------------------------------------------------------------
-- Lock down free quiz public read to only access_mode='public'
------------------------------------------------------------------------------

drop policy if exists "Public read free quizzes" on public.free_quizzes;
create policy "Public read free quizzes" on public.free_quizzes
  for select using (access_mode = 'public' and is_active = true);

drop policy if exists "Public read free quiz questions" on public.free_quiz_questions;
create policy "Public read free quiz questions" on public.free_quiz_questions
  for select using (
    exists (
      select 1
      from public.free_quizzes fq
      where fq.id = free_quiz_questions.free_quiz_id
        and fq.access_mode = 'public'
        and fq.is_active = true
    )
  );

drop policy if exists "Anon view free quiz attempts" on public.free_quiz_attempts;
create policy "Anon view free quiz attempts" on public.free_quiz_attempts
  for select using (
    exists (
      select 1
      from public.free_quizzes fq
      where fq.id = free_quiz_attempts.free_quiz_id
        and fq.access_mode = 'public'
    )
  );

drop policy if exists "Anon record free quiz attempts" on public.free_quiz_attempts;
create policy "Anon record free quiz attempts" on public.free_quiz_attempts
  for insert with check (
    exists (
      select 1
      from public.free_quizzes fq
      where fq.id = free_quiz_attempts.free_quiz_id
        and fq.access_mode = 'public'
    )
  );

drop policy if exists "Anon update free quiz attempts" on public.free_quiz_attempts;
create policy "Anon update free quiz attempts" on public.free_quiz_attempts
  for update using (
    exists (
      select 1
      from public.free_quizzes fq
      where fq.id = free_quiz_attempts.free_quiz_id
        and fq.access_mode = 'public'
    )
  ) with check (
    exists (
      select 1
      from public.free_quizzes fq
      where fq.id = free_quiz_attempts.free_quiz_id
        and fq.access_mode = 'public'
    )
  );

------------------------------------------------------------------------------
-- Views
------------------------------------------------------------------------------

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
where fq.access_mode = 'public'
group by fq.id;

create or replace view public.exam_hall_metrics as
select
  fq.id,
  fq.title,
  fq.slug,
  fq.is_active,
  fq.join_pin,
  fq.starts_at,
  fq.ends_at,
  fq.seat_limit,
  fq.pass_mark_percent,
  fq.question_count,
  fq.time_limit_seconds,
  fq.created_at,
  fq.updated_at,
  coalesce(candidates.candidate_count, 0) as candidate_count,
  coalesce(attempts.attempt_count, 0) as attempt_count,
  coalesce(attempts.completed_count, 0) as completed_count,
  coalesce(attempts.average_score, 0) as average_score
from public.free_quizzes fq
left join (
  select free_quiz_id, count(*) as candidate_count
  from public.exam_hall_candidates
  group by free_quiz_id
) candidates on candidates.free_quiz_id = fq.id
left join (
  select
    free_quiz_id,
    count(*) as attempt_count,
    count(*) filter (where completed_at is not null) as completed_count,
    avg(score_percent) as average_score
  from public.exam_hall_attempts
  group by free_quiz_id
) attempts on attempts.free_quiz_id = fq.id
where fq.access_mode = 'exam_hall'
group by
  fq.id,
  candidates.candidate_count,
  attempts.attempt_count,
  attempts.completed_count,
  attempts.average_score;

------------------------------------------------------------------------------
-- Helpers
------------------------------------------------------------------------------

create or replace function public.normalize_admission_no(p_value text)
returns text
language sql
immutable
as $$
  select upper(trim(coalesce(p_value, '')));
$$;

create or replace function public.normalize_option_key(p_value text)
returns text
language sql
immutable
as $$
  select lower(regexp_replace(trim(coalesce(p_value, '')), '[^a-z0-9]+', '', 'g'));
$$;

create or replace function public.generate_numeric_pin(p_length integer default 6)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_len integer := coalesce(p_length, 6);
  v_pin text := '';
begin
  if v_len < 4 then v_len := 4; end if;
  if v_len > 8 then v_len := 8; end if;
  for i in 1..v_len loop
    v_pin := v_pin || floor(random() * 10)::int::text;
  end loop;
  return v_pin;
end;
$$;

------------------------------------------------------------------------------
-- RPC: start / resume exam hall attempt (anon allowed)
------------------------------------------------------------------------------

create or replace function public.start_exam_hall(
  p_pin text,
  p_admission_no text,
  p_first_name text,
  p_last_name text,
  p_phone text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quiz public.free_quizzes;
  v_attempt public.exam_hall_attempts;
  v_now timestamptz := timezone('utc', now());
  v_admission_no text := public.normalize_admission_no(p_admission_no);
  v_deadline timestamptz;
  v_limit_deadline timestamptz;
  v_answers_deadline timestamptz;
  v_questions jsonb;
begin
  if p_pin is null or length(trim(p_pin)) = 0 then
    raise exception 'PIN is required';
  end if;
  if v_admission_no is null or length(v_admission_no) = 0 then
    raise exception 'Admission number is required';
  end if;
  if p_first_name is null or length(trim(p_first_name)) = 0 then
    raise exception 'First name is required';
  end if;
  if p_last_name is null or length(trim(p_last_name)) = 0 then
    raise exception 'Last name is required';
  end if;
  if p_phone is null or length(trim(p_phone)) = 0 then
    raise exception 'Phone number is required';
  end if;

  select *
    into v_quiz
  from public.free_quizzes
  where access_mode = 'exam_hall'
    and is_active = true
    and join_pin = trim(p_pin)
  limit 1;

  if v_quiz.id is null then
    raise exception 'Invalid PIN';
  end if;

  if v_quiz.starts_at is not null and v_now < v_quiz.starts_at then
    raise exception 'Exam has not started yet';
  end if;
  if v_quiz.ends_at is not null and v_now > v_quiz.ends_at then
    raise exception 'Exam has ended';
  end if;

  if not exists (
    select 1
    from public.exam_hall_candidates c
    where c.free_quiz_id = v_quiz.id
      and c.admission_no = v_admission_no
      and c.is_active = true
  ) then
    raise exception 'Admission number not permitted for this exam';
  end if;

  select *
    into v_attempt
  from public.exam_hall_attempts
  where free_quiz_id = v_quiz.id
    and admission_no = v_admission_no
  limit 1;

  if v_attempt.id is not null then
    if v_attempt.completed_at is not null then
      raise exception 'Attempt already submitted';
    end if;
  else
    if v_quiz.seat_limit is not null then
      if (select count(*) from public.exam_hall_attempts a where a.free_quiz_id = v_quiz.id) >= v_quiz.seat_limit then
        raise exception 'Exam seat limit reached';
      end if;
    end if;

    insert into public.exam_hall_attempts (
      free_quiz_id,
      admission_no,
      first_name,
      last_name,
      phone,
      started_at,
      total_questions
    )
    values (
      v_quiz.id,
      v_admission_no,
      trim(p_first_name),
      trim(p_last_name),
      trim(p_phone),
      v_now,
      coalesce(v_quiz.question_count, 0)
    )
    returning * into v_attempt;
  end if;

  v_limit_deadline := case
    when v_quiz.time_limit_seconds is null or v_quiz.time_limit_seconds <= 0 then null
    else v_attempt.started_at + (v_quiz.time_limit_seconds::text || ' seconds')::interval
  end;

  v_answers_deadline := case
    when v_quiz.ends_at is null then v_limit_deadline
    when v_limit_deadline is null then v_quiz.ends_at
    else least(v_limit_deadline, v_quiz.ends_at)
  end;

  v_deadline := v_answers_deadline;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', q.id,
        'prompt', q.prompt,
        'image_url', q.image_url,
        'options', q.options,
        'order_index', q.order_index
      )
      order by q.order_index asc
    ),
    '[]'::jsonb
  )
  into v_questions
  from public.free_quiz_questions q
  where q.free_quiz_id = v_quiz.id;

  return jsonb_build_object(
    'quiz', jsonb_build_object(
      'id', v_quiz.id,
      'title', v_quiz.title,
      'description', v_quiz.description,
      'intro', v_quiz.intro,
      'time_limit_seconds', v_quiz.time_limit_seconds,
      'starts_at', v_quiz.starts_at,
      'ends_at', v_quiz.ends_at,
      'pass_mark_percent', v_quiz.pass_mark_percent
    ),
    'attempt', jsonb_build_object(
      'id', v_attempt.id,
      'started_at', v_attempt.started_at,
      'admission_no', v_attempt.admission_no
    ),
    'deadline_at', v_deadline,
    'questions', v_questions
  );
end;
$$;

create or replace function public.get_exam_hall_attempt(p_attempt_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attempt public.exam_hall_attempts;
  v_quiz public.free_quizzes;
  v_now timestamptz := timezone('utc', now());
  v_deadline timestamptz;
  v_limit_deadline timestamptz;
  v_questions jsonb;
begin
  if p_attempt_id is null then
    raise exception 'Attempt id required';
  end if;

  select *
    into v_attempt
  from public.exam_hall_attempts
  where id = p_attempt_id
  limit 1;

  if v_attempt.id is null then
    raise exception 'Attempt not found';
  end if;
  if v_attempt.completed_at is not null then
    raise exception 'Attempt already submitted';
  end if;

  select *
    into v_quiz
  from public.free_quizzes
  where id = v_attempt.free_quiz_id
    and access_mode = 'exam_hall'
    and is_active = true
  limit 1;

  if v_quiz.id is null then
    raise exception 'Exam not found';
  end if;

  if v_quiz.starts_at is not null and v_now < v_quiz.starts_at then
    raise exception 'Exam has not started yet';
  end if;
  if v_quiz.ends_at is not null and v_now > v_quiz.ends_at then
    raise exception 'Exam has ended';
  end if;

  v_limit_deadline := case
    when v_quiz.time_limit_seconds is null or v_quiz.time_limit_seconds <= 0 then null
    else v_attempt.started_at + (v_quiz.time_limit_seconds::text || ' seconds')::interval
  end;

  v_deadline := case
    when v_quiz.ends_at is null then v_limit_deadline
    when v_limit_deadline is null then v_quiz.ends_at
    else least(v_limit_deadline, v_quiz.ends_at)
  end;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', q.id,
        'prompt', q.prompt,
        'image_url', q.image_url,
        'options', q.options,
        'order_index', q.order_index
      )
      order by q.order_index asc
    ),
    '[]'::jsonb
  )
  into v_questions
  from public.free_quiz_questions q
  where q.free_quiz_id = v_quiz.id;

  return jsonb_build_object(
    'quiz', jsonb_build_object(
      'id', v_quiz.id,
      'title', v_quiz.title,
      'description', v_quiz.description,
      'intro', v_quiz.intro,
      'time_limit_seconds', v_quiz.time_limit_seconds,
      'starts_at', v_quiz.starts_at,
      'ends_at', v_quiz.ends_at,
      'pass_mark_percent', v_quiz.pass_mark_percent
    ),
    'attempt', jsonb_build_object(
      'id', v_attempt.id,
      'started_at', v_attempt.started_at,
      'admission_no', v_attempt.admission_no
    ),
    'deadline_at', v_deadline,
    'questions', v_questions
  );
end;
$$;

------------------------------------------------------------------------------
-- RPC: submit (server-side scoring)
-- p_answers format: {"<free_quiz_question_id>":"A", ...}
------------------------------------------------------------------------------

create or replace function public.submit_exam_hall_attempt(
  p_attempt_id uuid,
  p_answers jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attempt public.exam_hall_attempts;
  v_quiz public.free_quizzes;
  v_now timestamptz := timezone('utc', now());
  v_deadline timestamptz;
  v_limit_deadline timestamptz;
  v_effective_completed_at timestamptz;
  v_duration_seconds integer;
  v_total integer;
  v_correct integer;
  v_score numeric(6,2);
  v_passed boolean;
begin
  if p_attempt_id is null then
    raise exception 'Attempt id required';
  end if;

  select *
    into v_attempt
  from public.exam_hall_attempts
  where id = p_attempt_id
  limit 1;

  if v_attempt.id is null then
    raise exception 'Attempt not found';
  end if;

  select *
    into v_quiz
  from public.free_quizzes
  where id = v_attempt.free_quiz_id
    and access_mode = 'exam_hall'
  limit 1;

  if v_quiz.id is null then
    raise exception 'Exam not found';
  end if;

  if v_attempt.completed_at is not null then
    return jsonb_build_object(
      'attempt_id', v_attempt.id,
      'completed_at', v_attempt.completed_at,
      'duration_seconds', v_attempt.duration_seconds,
      'total_questions', v_attempt.total_questions,
      'correct_count', v_attempt.correct_count,
      'score_percent', v_attempt.score_percent,
      'passed', v_attempt.passed
    );
  end if;

  v_limit_deadline := case
    when v_quiz.time_limit_seconds is null or v_quiz.time_limit_seconds <= 0 then null
    else v_attempt.started_at + (v_quiz.time_limit_seconds::text || ' seconds')::interval
  end;

  v_deadline := case
    when v_quiz.ends_at is null then v_limit_deadline
    when v_limit_deadline is null then v_quiz.ends_at
    else least(v_limit_deadline, v_quiz.ends_at)
  end;

  v_effective_completed_at := case
    when v_deadline is null then v_now
    else least(v_now, v_deadline)
  end;

  v_duration_seconds := greatest(
    0,
    floor(extract(epoch from (v_effective_completed_at - v_attempt.started_at)))::int
  );

  with submitted as (
    select key::uuid as question_id, value as answer
    from jsonb_each_text(coalesce(p_answers, '{}'::jsonb))
  ),
  scored as (
    select
      q.id as question_id,
      q.free_quiz_id,
      public.normalize_option_key(q.correct_option) as correct_key,
      public.normalize_option_key(s.answer) as answer_key
    from public.free_quiz_questions q
    left join submitted s on s.question_id = q.id
    where q.free_quiz_id = v_quiz.id
  )
  select
    count(*)::int as total_questions,
    count(*) filter (where answer_key <> '' and answer_key = correct_key)::int as correct_count
  into v_total, v_correct
  from scored;

  v_score := case
    when v_total <= 0 then 0
    else round((v_correct::numeric / v_total::numeric) * 100, 2)
  end;

  v_passed := v_score >= coalesce(v_quiz.pass_mark_percent, 50);

  update public.exam_hall_attempts
  set
    completed_at = v_effective_completed_at,
    duration_seconds = v_duration_seconds,
    total_questions = v_total,
    correct_count = v_correct,
    score_percent = v_score,
    passed = v_passed,
    updated_at = timezone('utc', now())
  where id = v_attempt.id
  returning * into v_attempt;

  return jsonb_build_object(
    'attempt_id', v_attempt.id,
    'completed_at', v_attempt.completed_at,
    'duration_seconds', v_attempt.duration_seconds,
    'total_questions', v_attempt.total_questions,
    'correct_count', v_attempt.correct_count,
    'score_percent', v_attempt.score_percent,
    'passed', v_attempt.passed
  );
end;
$$;

create or replace function public.get_exam_hall_result(p_attempt_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attempt public.exam_hall_attempts;
  v_quiz public.free_quizzes;
begin
  if p_attempt_id is null then
    raise exception 'Attempt id required';
  end if;

  select *
    into v_attempt
  from public.exam_hall_attempts
  where id = p_attempt_id
  limit 1;

  if v_attempt.id is null then
    raise exception 'Attempt not found';
  end if;

  select *
    into v_quiz
  from public.free_quizzes
  where id = v_attempt.free_quiz_id
    and access_mode = 'exam_hall'
  limit 1;

  if v_quiz.id is null then
    raise exception 'Exam not found';
  end if;

  return jsonb_build_object(
    'quiz', jsonb_build_object(
      'id', v_quiz.id,
      'title', v_quiz.title,
      'time_limit_seconds', v_quiz.time_limit_seconds,
      'pass_mark_percent', v_quiz.pass_mark_percent
    ),
    'attempt', jsonb_build_object(
      'id', v_attempt.id,
      'completed_at', v_attempt.completed_at,
      'duration_seconds', v_attempt.duration_seconds,
      'total_questions', v_attempt.total_questions,
      'correct_count', v_attempt.correct_count,
      'score_percent', v_attempt.score_percent,
      'passed', v_attempt.passed
    )
  );
end;
$$;

grant execute on function public.start_exam_hall(text, text, text, text, text) to anon, authenticated;
grant execute on function public.get_exam_hall_attempt(uuid) to anon, authenticated;
grant execute on function public.submit_exam_hall_attempt(uuid, jsonb) to anon, authenticated;
grant execute on function public.get_exam_hall_result(uuid) to anon, authenticated;
