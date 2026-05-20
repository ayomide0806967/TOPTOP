import { withTransaction } from '../../db/tx.js';
import { query } from '../../db/query.js';
import { forbidden, notFound } from '../../utils/httpError.js';

export async function resetTodaysDailyQuiz(userId) {
  return withTransaction(async (client) => {
    await client.query(`select set_config('request.jwt.claim.sub', $1, true)`, [
      userId,
    ]);
    await client.query(
      `select set_config('request.jwt.claim.role', 'authenticated', true)`
    );

    const today = new Date().toISOString().slice(0, 10);
    const { rows: quizzes } = await client.query(
      `
        select id
        from public.daily_quizzes
        where user_id = $1
          and assigned_date = $2
      `,
      [userId, today]
    );

    const quizIds = quizzes.map((quiz) => quiz.id);
    if (quizIds.length) {
      await client.query(
        `
          delete from public.daily_quiz_questions
          where daily_quiz_id = any($1::uuid[])
        `,
        [quizIds]
      );
      await client.query(
        `
          delete from public.daily_quizzes
          where id = any($1::uuid[])
        `,
        [quizIds]
      );
    }

    const { rows } = await client.query(
      `select * from public.generate_daily_quiz(null::uuid, null::integer)`
    );

    return {
      dailyQuizId: rows?.[0]?.daily_quiz_id || null,
    };
  });
}

export async function getDailyQuizForUser(userId, quizId) {
  const params = quizId ? [userId, quizId] : [userId];
  const result = await query(
    quizId
      ? `
          select
            id,
            status,
            total_questions,
            correct_answers,
            started_at,
            completed_at,
            assigned_date,
            time_limit_seconds,
            user_id,
            subscription_id
          from public.daily_quizzes
          where user_id = $1
            and id = $2
          limit 1
        `
      : `
          select
            id,
            status,
            total_questions,
            correct_answers,
            started_at,
            completed_at,
            assigned_date,
            time_limit_seconds,
            user_id,
            subscription_id
          from public.daily_quizzes
          where user_id = $1
            and assigned_date = current_date
          limit 1
        `,
    params
  );
  return result.rows[0] || null;
}

export async function getDailyQuizQuestionsForUser(userId, quizId) {
  const quiz = await getDailyQuizForUser(userId, quizId);
  if (!quiz) throw notFound('Quiz not found.');

  const result = await query(
    `
      select
        dqq.id,
        dqq.daily_quiz_id,
        dqq.order_index,
        dqq.selected_option_id,
        dqq.is_correct,
        dqq.answered_at,
        jsonb_build_object(
          'id', q.id,
          'stem', q.stem,
          'explanation', q.explanation,
          'question_options', coalesce(
            (
              select jsonb_agg(
                jsonb_build_object(
                  'id', qo.id,
                  'label', qo.label,
                  'content', qo.content,
                  'is_correct', qo.is_correct,
                  'order_index', qo.order_index
                )
                order by qo.order_index asc nulls last, qo.label asc
              )
              from public.question_options qo
              where qo.question_id = q.id
            ),
            '[]'::jsonb
          )
        ) as question
      from public.daily_quiz_questions dqq
      join public.questions q on q.id = dqq.question_id
      where dqq.daily_quiz_id = $1
      order by dqq.order_index asc
    `,
    [quizId]
  );

  return {
    quiz,
    questions: result.rows,
  };
}

export async function startDailyQuizForUser(userId, quizId) {
  const startedAt = new Date().toISOString();
  const result = await query(
    `
      update public.daily_quizzes
      set
        status = case when status = 'assigned' then 'in_progress' else status end,
        started_at = coalesce(started_at, $3::timestamptz)
      where id = $1
        and user_id = $2
      returning
        id,
        status,
        total_questions,
        correct_answers,
        started_at,
        completed_at,
        assigned_date,
        time_limit_seconds,
        user_id,
        subscription_id
    `,
    [quizId, userId, startedAt]
  );
  const quiz = result.rows[0];
  if (!quiz) throw notFound('Quiz not found.');
  return quiz;
}

export async function recordDailyQuizAnswer(userId, entryId, optionId) {
  const result = await query(
    `
      update public.daily_quiz_questions dqq
      set
        selected_option_id = $2,
        is_correct = coalesce(qo.is_correct, false),
        answered_at = $3::timestamptz
      from public.daily_quizzes dq,
        public.question_options qo
      where dqq.id = $1
        and dqq.daily_quiz_id = dq.id
        and dq.user_id = $4
        and qo.id = $2
        and qo.question_id = dqq.question_id
      returning
        dqq.id,
        dqq.selected_option_id,
        dqq.is_correct,
        dqq.answered_at
    `,
    [entryId, optionId, new Date().toISOString(), userId]
  );
  const answer = result.rows[0];
  if (!answer) throw forbidden('Unable to update this quiz answer.');
  return answer;
}

export async function submitDailyQuizForUser(userId, quizId, payload = {}) {
  const completedAt = payload.completedAt || new Date().toISOString();
  const result = await query(
    `
      with stats as (
        select
          count(*)::integer as total_questions,
          count(*) filter (where is_correct = true)::integer as correct_answers
        from public.daily_quiz_questions
        where daily_quiz_id = $1
      )
      update public.daily_quizzes
      set
        status = 'completed',
        correct_answers = stats.correct_answers,
        total_questions = stats.total_questions,
        completed_at = $3::timestamptz
      from stats
      where id = $1
        and user_id = $2
      returning
        id,
        status,
        total_questions,
        correct_answers,
        started_at,
        completed_at,
        assigned_date,
        time_limit_seconds,
        user_id,
        subscription_id
    `,
    [quizId, userId, completedAt]
  );
  const quiz = result.rows[0];
  if (!quiz) throw notFound('Quiz not found.');
  return quiz;
}
