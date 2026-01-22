set check_function_bodies = off;

-------------------------------------------------------------------------------
-- Payment transactions audit table
-------------------------------------------------------------------------------

create table if not exists public.payment_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles on delete set null,
  plan_id uuid references public.subscription_plans on delete set null,
  provider text not null default 'paystack',
  reference text not null,
  status text not null default 'pending',
  amount numeric(12,2) not null default 0,
  currency text not null default 'NGN',
  paid_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  raw_response jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint payment_transactions_unique_ref unique (provider, reference)
);

create index if not exists payment_transactions_user_idx on public.payment_transactions (user_id);
create index if not exists payment_transactions_plan_idx on public.payment_transactions (plan_id);
create index if not exists payment_transactions_status_idx on public.payment_transactions (status);

drop trigger if exists set_timestamp_payment_transactions on public.payment_transactions;
create trigger set_timestamp_payment_transactions
  before update on public.payment_transactions
  for each row
  execute function public.set_updated_at();

alter table public.payment_transactions enable row level security;

drop policy if exists "Admins manage payment transactions" on public.payment_transactions;
create policy "Admins manage payment transactions" on public.payment_transactions
  for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Users view their transactions" on public.payment_transactions;
create policy "Users view their transactions" on public.payment_transactions
  for select
  using (auth.uid() = user_id);

grant select on table public.payment_transactions to authenticated;
