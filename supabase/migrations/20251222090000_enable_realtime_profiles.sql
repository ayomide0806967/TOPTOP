-- Enable Supabase Realtime for profile entitlement fields
-- This ensures dashboard subscriptions update instantly when webhooks land.

-- Send complete row data on UPDATE so the client receives all fields
alter table if exists public.profiles replica identity full;

-- Add profiles to the default realtime publication
do $$
begin
  perform 1 from pg_publication where pubname = 'supabase_realtime';
  if found then
    begin
      execute 'alter publication supabase_realtime add table public.profiles';
    exception when duplicate_object then
      -- already added
      null;
    end;
  end if;
end $$;

comment on table public.profiles is 'Replicated via supabase_realtime for subscription status updates.';
