-- Rebuilds the pricing view with department context + plan timers.
-- Run this in Supabase SQL Editor if pricing pages show product names instead of department names.

alter table public.subscription_plans
  add column if not exists quiz_duration_minutes integer;

drop view if exists public.subscription_products_with_plans;
create view public.subscription_products_with_plans as
select
  p.id,
  p.code as product_code,
  p.name as product_name,
  p.product_type,
  p.description,
  p.is_active,
  p.department_id,
  d.name as department_name,
  d.slug as department_slug,
  d.color_theme,
  pl.id as plan_id,
  pl.code as plan_code,
  coalesce(pl.name, pl.code) as plan_name,
  pl.price,
  pl.currency,
  pl.questions,
  pl.quizzes,
  pl.participants,
  pl.metadata,
  pl.is_active as plan_is_active,
  pl.daily_question_limit,
  pl.duration_days,
  pl.plan_tier,
  pl.quiz_duration_minutes
from public.subscription_products p
left join public.subscription_plans pl on pl.product_id = p.id
left join public.departments d on d.id = p.department_id
where p.is_active;

grant select on table public.subscription_products_with_plans to authenticated, anon;
