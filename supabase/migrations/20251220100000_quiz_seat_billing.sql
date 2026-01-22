set check_function_bodies = off;

------------------------------------------------------------------------------
-- Quiz builder seat-based subscriptions
------------------------------------------------------------------------------

create table if not exists public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  description text,
  logo_url text,
  settings jsonb default '{}'::jsonb,
  is_active boolean default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  first_name text,
  last_name text,
  role text not null default 'instructor',
  phone text,
  is_active boolean default true,
  email_verified boolean default false,
  tenant_id uuid references public.tenants(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  last_login_at timestamptz
);

create table if not exists public.classrooms (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  owner_user_id uuid references public.users(id) on delete set null,
  name text not null,
  purpose text,
  access_mode text default 'invite_only',
  seat_quota integer default 0,
  active_participants integer default 0,
  pending_invites integer default 0,
  status text default 'active',
  scheduled_exam_count integer default 0,
  next_exam_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.quiz_seat_subscriptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'suspended', 'past_due', 'cancelled')),
  seat_quota integer not null default 0,
  paid_seats integer not null default 0,
  free_tier_seats integer not null default 0,
  price_per_seat numeric(12,2) not null default 500,
  currency text not null default 'NGN',
  billing_cycle_start timestamptz not null default timezone('utc', now()),
  billing_cycle_end timestamptz not null default (timezone('utc', now()) + interval '30 days'),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint quiz_seat_subscriptions_unique_tenant unique (tenant_id)
);

create table if not exists public.quiz_seat_transactions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  seat_subscription_id uuid not null references public.quiz_seat_subscriptions(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  additional_seats integer not null check (additional_seats > 0),
  amount numeric(12,2) not null,
  amount_kobo bigint not null,
  currency text not null default 'NGN',
  status text not null default 'pending' check (status in ('pending', 'paid', 'failed', 'cancelled')),
  paystack_reference text,
  paystack_authorization_url text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists quiz_seat_transactions_tenant_idx
  on public.quiz_seat_transactions (tenant_id, status);

create index if not exists quiz_seat_transactions_ref_idx
  on public.quiz_seat_transactions (paystack_reference);

------------------------------------------------------------------------------
-- Helper functions
------------------------------------------------------------------------------

create or replace function public.ensure_quiz_seat_subscription(p_tenant_id uuid)
returns public.quiz_seat_subscriptions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_record public.quiz_seat_subscriptions;
begin
  if p_tenant_id is null then
    raise exception 'Tenant id is required';
  end if;

  select *
    into v_record
  from public.quiz_seat_subscriptions
  where tenant_id = p_tenant_id;

  if v_record.id is null then
    insert into public.quiz_seat_subscriptions (tenant_id, free_tier_seats, seat_quota)
    values (p_tenant_id, 5, 5)
    returning * into v_record;
  end if;

  return v_record;
end;
$$;

create or replace function public.apply_quiz_seat_credit(
  p_subscription_id uuid,
  p_additional integer
)
returns public.quiz_seat_subscriptions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_record public.quiz_seat_subscriptions;
begin
  if p_subscription_id is null then
    raise exception 'Subscription id required';
  end if;
  if p_additional is null or p_additional <= 0 then
    raise exception 'Additional seats must be positive';
  end if;

  update public.quiz_seat_subscriptions
  set
    paid_seats = paid_seats + p_additional,
    seat_quota = free_tier_seats + paid_seats + p_additional,
    updated_at = timezone('utc', now())
  where id = p_subscription_id
  returning * into v_record;

  if v_record.id is null then
    raise exception 'Seat subscription not found';
  end if;

  return v_record;
end;
$$;

create or replace function public.create_quiz_seat_subscription_for_tenant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.ensure_quiz_seat_subscription(new.id);
  return new;
end;
$$;

drop trigger if exists tenants_quiz_seat_subscription on public.tenants;
create trigger tenants_quiz_seat_subscription
  after insert on public.tenants
  for each row
  execute function public.create_quiz_seat_subscription_for_tenant();

insert into public.quiz_seat_subscriptions (tenant_id, free_tier_seats, seat_quota)
select t.id, 5, 5
from public.tenants t
left join public.quiz_seat_subscriptions s on s.tenant_id = t.id
where s.id is null;

------------------------------------------------------------------------------
-- Seat usage view
------------------------------------------------------------------------------

drop view if exists public.quiz_subscription_summary;
create or replace view public.quiz_subscription_summary as
with usage as (
  select
    c.tenant_id,
    coalesce(sum(c.active_participants), 0) as seats_in_use
  from public.classrooms c
  group by c.tenant_id
)
select
  s.id,
  s.tenant_id,
  s.status,
  s.seat_quota as seat_count,
  s.paid_seats,
  s.free_tier_seats,
  s.price_per_seat,
  s.currency,
  s.billing_cycle_start,
  s.billing_cycle_end as renewal_date,
  coalesce(u.seats_in_use, 0) as seats_in_use,
greatest(s.seat_quota - coalesce(u.seats_in_use, 0), 0) as seats_available
from public.quiz_seat_subscriptions s
left join usage u on u.tenant_id = s.tenant_id;

------------------------------------------------------------------------------
-- Auth helper functions (created here if missing)
------------------------------------------------------------------------------

create or replace function public.get_current_user_role()
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  return coalesce(
    (select role from public.users where id = auth.uid()),
    'anonymous'
  );
end;
$$;

create or replace function public.get_current_user_tenant()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  return (
    select tenant_id
    from public.users
    where id = auth.uid()
  );
end;
$$;

------------------------------------------------------------------------------
-- RLS
------------------------------------------------------------------------------

alter table public.quiz_seat_subscriptions enable row level security;
alter table public.quiz_seat_transactions enable row level security;

drop policy if exists "Tenants manage quiz seat subscription" on public.quiz_seat_subscriptions;
create policy "Tenants manage quiz seat subscription" on public.quiz_seat_subscriptions
  using (tenant_id = get_current_user_tenant())
  with check (tenant_id = get_current_user_tenant());

drop policy if exists "Tenants view quiz seat subscription" on public.quiz_seat_subscriptions;
create policy "Tenants view quiz seat subscription" on public.quiz_seat_subscriptions
  for select
  using (tenant_id = get_current_user_tenant() or get_current_user_role() = 'super_admin');

drop policy if exists "Tenants insert seat transactions" on public.quiz_seat_transactions;
create policy "Tenants insert seat transactions" on public.quiz_seat_transactions
  for insert
  with check (tenant_id = get_current_user_tenant());

drop policy if exists "Tenants view seat transactions" on public.quiz_seat_transactions;
create policy "Tenants view seat transactions" on public.quiz_seat_transactions
  for select
  using (tenant_id = get_current_user_tenant() or get_current_user_role() = 'super_admin');

drop policy if exists "Tenants update pending seat transactions" on public.quiz_seat_transactions;
create policy "Tenants update pending seat transactions" on public.quiz_seat_transactions
  for update
  using (tenant_id = get_current_user_tenant() or get_current_user_role() = 'super_admin');

------------------------------------------------------------------------------
-- Grants
------------------------------------------------------------------------------

grant select, insert, update on public.quiz_seat_subscriptions to authenticated;
grant select, insert, update on public.quiz_seat_transactions to authenticated;
grant select on public.quiz_subscription_summary to authenticated;
