alter table public.profiles
  add column if not exists registration_token text,
  add column if not exists registration_token_expires_at timestamptz;

create index if not exists profiles_registration_token_idx
  on public.profiles (registration_token);
