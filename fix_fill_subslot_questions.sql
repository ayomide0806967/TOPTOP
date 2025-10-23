DROP FUNCTION if exists public.fill_subslot_questions(uuid, jsonb, boolean);

create or replace function public.fill_subslot_questions(
  p_subslot_id uuid,
  p_requests jsonb,
  p_replace boolean default true
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  slot_record record;
  request jsonb;
  available_count integer;
  required_count integer;
  inserted_total integer := 0;
  base_index integer;
  questions_per_day integer;
  detail jsonb := '[]'::jsonb;
begin
  select sw.id as subslot_id, sw.day_span, sw.question_target, sc.questions_per_day
    into slot_record
  from public.study_cycle_weeks sw
  join public.study_cycles sc on sc.id = sw.study_cycle_id
  where sw.id = p_subslot_id;

  if slot_record.subslot_id is null then
    raise exception 'Subslot % not found', p_subslot_id;
  end if;

  questions_per_day := greatest(slot_record.questions_per_day, 1);

  if coalesce(p_replace, true) then
    delete from public.study_cycle_subslot_topics where subslot_id = p_subslot_id;
    delete from public.study_cycle_subslot_questions where subslot_id = p_subslot_id;
  end if;

  base_index := coalesce((select max(order_index) from public.study_cycle_subslot_questions where subslot_id = p_subslot_id), 0);

  for request in select * from jsonb_array_elements(coalesce(p_requests, '[]'::jsonb)) loop
    if request ->> 'topic_id' is null then
      continue;
    end if;

    required_count := coalesce((request ->> 'question_count')::integer, 0);

    select count(*)
      into available_count
    from public.questions q
    where q.topic_id = (request ->> 'topic_id')::uuid;

    if coalesce(request ->> 'selection_mode', 'random') = 'all' then
      required_count := available_count;
    end if;

    if required_count <= 0 then
      continue;
    end if;

    if available_count < required_count then
      raise exception 'Topic % only has % questions, but % requested.',
        request ->> 'topic_id', available_count, required_count;
    end if;

    insert into public.study_cycle_subslot_topics (subslot_id, topic_id, selection_mode, question_count)
    values (
      p_subslot_id,
      (request ->> 'topic_id')::uuid,
      coalesce(request ->> 'selection_mode', 'random'),
      required_count
    )
    on conflict (subslot_id, topic_id) do update
      set selection_mode = excluded.selection_mode,
          question_count = excluded.question_count,
          updated_at = timezone('utc', now());

    with sampled as (
      select q.id
      from public.questions q
      where q.topic_id = (request ->> 'topic_id')::uuid
      order by case when coalesce(request ->> 'selection_mode', 'random') = 'random' then random()::text else q.created_at::text end
      limit required_count
    ), numbered as (
      select id, row_number() over () as rn from sampled
    )
    insert into public.study_cycle_subslot_questions (subslot_id, question_id, order_index, day_offset)
    select
      p_subslot_id,
      numbered.id,
      base_index + numbered.rn,
      floor((base_index + numbered.rn - 1) / questions_per_day)::integer
    from numbered;

    base_index := base_index + required_count;
    inserted_total := inserted_total + required_count;

    detail := detail || jsonb_build_array(jsonb_build_object(
      'topic_id', request ->> 'topic_id',
      'questions_selected', required_count
    ));
  end loop;

  update public.study_cycle_weeks
  set question_count = (select count(*) from public.study_cycle_subslot_questions where subslot_id = p_subslot_id),
      updated_at = timezone('utc', now())
  where id = p_subslot_id;

  return jsonb_build_object(
    'questions_selected', inserted_total,
    'details', detail
  );
end;
$$;
