-- Add index to accelerate admin inactivity reporting
create index if not exists profiles_last_seen_idx on public.profiles (last_seen_at);
