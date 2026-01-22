set check_function_bodies = off;

------------------------------------------------------------------------------
-- Core quiz builder tables
------------------------------------------------------------------------------

create table if not exists public.quiz_blueprints (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  owner_user_id uuid references public.users(id) on delete set null,
  owner_id uuid references public.users(id) on delete set null,
  title text not null,
  description text,
  status text not null default 'draft',
  total_questions integer not null default 0,
  estimated_duration_seconds integer,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists quiz_blueprints_tenant_idx
  on public.quiz_blueprints (tenant_id);

drop trigger if exists set_timestamp_quiz_blueprints on public.quiz_blueprints;
create trigger set_timestamp_quiz_blueprints
  before update on public.quiz_blueprints
  for each row
  execute function public.set_updated_at();

alter table public.quiz_blueprints enable row level security;

drop policy if exists "Quiz blueprints tenant access" on public.quiz_blueprints;
create policy "Quiz blueprints tenant access" on public.quiz_blueprints
  for select
  using (
    tenant_id is null
    or tenant_id = public.get_current_user_tenant()
    or public.get_current_user_role() = 'super_admin'
  );

drop policy if exists "Quiz blueprints manage own" on public.quiz_blueprints;
create policy "Quiz blueprints manage own" on public.quiz_blueprints
  for all
  using (
    (tenant_id = public.get_current_user_tenant() and owner_user_id = auth.uid())
    or public.get_current_user_role() = 'super_admin'
  )
  with check (
    (tenant_id = public.get_current_user_tenant() and owner_user_id = auth.uid())
    or public.get_current_user_role() = 'super_admin'
  );

grant select, insert, update, delete on public.quiz_blueprints to authenticated;
