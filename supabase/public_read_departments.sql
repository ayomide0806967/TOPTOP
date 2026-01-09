-- Allow learners/pricing to read departments for display names.
-- Without this, `subscription_products_with_plans` joins return NULL department fields under RLS.

drop policy if exists "Public read departments" on public.departments;
create policy "Public read departments" on public.departments
  for select
  using (true);

grant select on table public.departments to anon, authenticated;
