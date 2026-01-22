set check_function_bodies = off;

------------------------------------------------------------------------------
-- Examination Hall: persist answers and expose review payload after submission.
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
  v_answers jsonb := coalesce(p_answers, '{}'::jsonb);
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
    from jsonb_each_text(v_answers)
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
    metadata = jsonb_set(coalesce(metadata, '{}'::jsonb), '{answers}', v_answers, true),
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

create or replace function public.get_exam_hall_review(p_attempt_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attempt public.exam_hall_attempts;
  v_quiz public.free_quizzes;
  v_answers jsonb;
  v_entries jsonb;
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

  if v_attempt.completed_at is null then
    raise exception 'Attempt not submitted yet';
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

  v_answers := coalesce(v_attempt.metadata->'answers', '{}'::jsonb);

  with q as (
    select
      fq.id,
      fq.prompt,
      fq.explanation,
      fq.image_url,
      fq.options,
      fq.correct_option,
      fq.order_index
    from public.free_quiz_questions fq
    where fq.free_quiz_id = v_quiz.id
    order by fq.order_index asc
  ),
  answer_map as (
    select key::uuid as question_id, value as answer
    from jsonb_each_text(v_answers)
  ),
  expanded as (
    select
      q.id,
      q.prompt,
      q.explanation,
      q.image_url,
      q.correct_option,
      q.order_index,
      am.answer as selected_raw,
      q.options as options_json
    from q
    left join answer_map am on am.question_id = q.id
  ),
  options_norm as (
    select
      e.*,
      public.normalize_option_key(e.correct_option) as correct_key,
      public.normalize_option_key(e.selected_raw) as selected_key
    from expanded e
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', o.id,
        'selected_option_id',
          coalesce(
            (
              select (opt->>'id')
              from jsonb_array_elements(coalesce(o.options_json, '[]'::jsonb)) opt
              where public.normalize_option_key(opt->>'id') = o.selected_key
                 or public.normalize_option_key(opt->>'label') = o.selected_key
              limit 1
            ),
            null
          ),
        'is_correct', (o.selected_key <> '' and o.selected_key = o.correct_key),
        'question', jsonb_build_object(
          'stem', o.prompt,
          'explanation', o.explanation,
          'image_url', o.image_url,
          'question_options',
            coalesce(
              (
                select jsonb_agg(
                  jsonb_build_object(
                    'id', opt->>'id',
                    'label', coalesce(opt->>'label', opt->>'id'),
                    'content', opt->>'content',
                    'is_correct',
                      (public.normalize_option_key(opt->>'id') = o.correct_key)
                      or (public.normalize_option_key(opt->>'label') = o.correct_key),
                    'order_index', coalesce((opt->>'order_index')::int, 0)
                  )
                  order by coalesce((opt->>'order_index')::int, 0), coalesce(opt->>'label', opt->>'id')
                )
                from jsonb_array_elements(coalesce(o.options_json, '[]'::jsonb)) opt
              ),
              '[]'::jsonb
            )
        )
      )
      order by o.order_index asc
    ),
    '[]'::jsonb
  )
  into v_entries
  from options_norm o;

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
    ),
    'entries', v_entries
  );
end;
$$;

grant execute on function public.get_exam_hall_review(uuid) to anon, authenticated;
