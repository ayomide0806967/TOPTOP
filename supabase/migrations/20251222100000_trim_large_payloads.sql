-- Reduce DB size by trimming heavy JSON payloads kept for history
-- Safe to run multiple times (idempotent effects).

-- 1) Shrink old extra practice snapshots: keep only minimal/empty JSON after 30 days
update public.extra_question_attempts
   set response_snapshot = '{}'::jsonb,
       updated_at = timezone('utc', now())
 where status = 'completed'
   and started_at < (timezone('utc', now()) - interval '30 days')
   and response_snapshot is not null
   and response_snapshot::text <> '{}';

-- 2) Drop old payment provider payloads to free space
update public.payment_transactions
   set raw_response = null,
       updated_at = timezone('utc', now())
 where created_at < (timezone('utc', now()) - interval '30 days')
   and raw_response is not null;

-- 3) Optional: keep only the latest 3 attempts per user/set when older than 90 days
delete from public.extra_question_attempts a
using (
  select id
  from (
    select id,
           row_number() over (
             partition by user_id, set_id
             order by attempt_number desc, started_at desc
           ) as rn,
           started_at
    from public.extra_question_attempts
  ) t
  where t.rn > 3
    and t.started_at < (timezone('utc', now()) - interval '90 days')
) old
where a.id = old.id;

-- Note: After large updates/deletes, consider running VACUUM (FULL) during
-- off-hours on the biggest tables to reclaim disk immediately.
