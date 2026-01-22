-- Improve cascading deletes for topics by adding supporting indexes
set check_function_bodies = off;

create index if not exists study_cycle_subslot_topics_topic_idx
  on public.study_cycle_subslot_topics (topic_id);

create index if not exists study_cycle_subslot_questions_question_idx
  on public.study_cycle_subslot_questions (question_id);
