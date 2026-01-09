-- Restores the admin dashboard stats view used by the admin panel.
-- Run this in Supabase SQL Editor if the view was dropped.

drop view if exists public.admin_dashboard_stats;
create view public.admin_dashboard_stats as
select
  coalesce((select count(*) from public.profiles), 0) as total_users,
  coalesce(
    (select count(*) from public.user_subscriptions us where us.status = 'active'),
    0
  ) as active_subscriptions,
  coalesce((select count(*) from public.questions), 0) as total_questions,
  coalesce(
    (
      select sum(coalesce(us.price, sp.price))
      from public.user_subscriptions us
      join public.subscription_plans sp on sp.id = us.plan_id
      where us.status = 'active'
        and date_trunc('month', us.started_at) = date_trunc('month', timezone('utc', now()))
    ),
    0
  ) as monthly_revenue;

grant select on table public.admin_dashboard_stats to authenticated;
