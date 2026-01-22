alter table public.extra_question_sets
  add column if not exists time_limit_seconds integer;
