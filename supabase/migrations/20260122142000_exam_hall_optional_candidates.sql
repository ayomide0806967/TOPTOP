set check_function_bodies = off;

------------------------------------------------------------------------------
-- Examination Hall: allow open entry when no candidates are configured.
-- If candidates exist for a quiz, enforce admission_no membership.
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
  v_candidate_count integer := 0;
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

  select count(*)::int
    into v_candidate_count
  from public.exam_hall_candidates c
  where c.free_quiz_id = v_quiz.id
    and c.is_active = true;

  if v_candidate_count > 0 then
    if not exists (
      select 1
      from public.exam_hall_candidates c
      where c.free_quiz_id = v_quiz.id
        and c.admission_no = v_admission_no
        and c.is_active = true
    ) then
      raise exception 'Admission number not permitted for this exam';
    end if;
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
