-- Daily quiz retention + cleanup helpers
-- - Adds a safe, parameterized cleanup function for daily quizzes/questions
-- - Provides an optional pg_cron schedule (if extension available) to run nightly

set check_function_bodies = off;

-- Cleanup function: deletes quizzes (and their questions) older than keep-days.
-- p_dry_run=true returns counts only without deleting.
create or replace function public.cleanup_old_daily_quizzes(
  p_keep_days integer default 90,
  p_dry_run boolean default false
)
returns table(
  deleted_quizzes integer,
  deleted_questions bigint,
  deleted_orphans bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cutoff date := current_date - make_interval(days => p_keep_days);
  v_deleted_quizzes integer := 0;
  v_deleted_questions bigint := 0;
  v_deleted_orphans bigint := 0;
begin
  if p_dry_run then
    return query
      select 0::integer,
             (
               select count(*)
               from public.daily_quiz_questions dqq
               join public.daily_quizzes dq on dq.id = dqq.daily_quiz_id
               where dq.assigned_date < v_cutoff
             )::bigint,
             (
               select count(*)
               from public.daily_quiz_questions d
               where not exists (
                 select 1 from public.daily_quizzes q where q.id = d.daily_quiz_id
               )
             )::bigint;
    return;
  end if;

  -- Delete child rows first for better performance (parent has cascade too)
  delete from public.daily_quiz_questions dqq
  using public.daily_quizzes dq
  where dqq.daily_quiz_id = dq.id
    and dq.assigned_date < v_cutoff;
  get diagnostics v_deleted_questions = row_count;

  -- Delete old quizzes
  delete from public.daily_quizzes dq
  where dq.assigned_date < v_cutoff;
  get diagnostics v_deleted_quizzes = row_count;

  -- Safety: remove any orphaned question rows
  delete from public.daily_quiz_questions d
  where not exists (
    select 1 from public.daily_quizzes q where q.id = d.daily_quiz_id
  );
  get diagnostics v_deleted_orphans = row_count;

  return query select v_deleted_quizzes, v_deleted_questions, v_deleted_orphans;
end;
$$;

grant execute on function public.cleanup_old_daily_quizzes(integer, boolean) to authenticated;

-- Optional: schedule nightly cleanup via pg_cron at 03:30 UTC if available.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;

    -- Create schema alias if needed (handled by extension install), then schedule.
    -- If a job with the same name exists, ignore errors.
    begin
      perform cron.schedule(
        'daily_quiz_cleanup_90d',
        '30 3 * * *',
        $job$select public.cleanup_old_daily_quizzes(90, false);$job$
      );
    exception when others then
      -- Ignore scheduling errors (e.g., duplicate job names) to keep migration idempotent
      null;
    end;
  end if;
end
$$;

-- Note: Maintenance commands like VACUUM/REINDEX cannot run inside migrations.
-- Run them manually after a large purge if needed.
