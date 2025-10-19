-- Remove legacy community tables and storage policies

drop view if exists public.community_thread_summaries;
drop function if exists public.community_mark_thread_read(uuid);

drop table if exists public.community_stream_attachments cascade;
drop table if exists public.community_stream_messages cascade;
drop table if exists public.community_thread_reads cascade;
drop table if exists public.community_post_attachments cascade;
drop table if exists public.community_posts cascade;
drop table if exists public.community_threads cascade;

drop policy if exists "Community attachments read" on storage.objects;
drop policy if exists "Community attachments insert" on storage.objects;
drop policy if exists "Community attachments update" on storage.objects;
drop policy if exists "Community attachments delete" on storage.objects;

delete from storage.objects where bucket_id = 'community-uploads';
delete from storage.buckets where id = 'community-uploads';

-- Global announcements for learner dashboard notifications

create table if not exists public.global_announcements (
  id uuid primary key default gen_random_uuid(),
  message text not null check (char_length(btrim(message)) > 0),
  created_at timestamptz not null default timezone('utc', now()),
  created_by uuid references auth.users on delete set null,
  is_active boolean not null default true
);

create index if not exists global_announcements_created_idx
  on public.global_announcements (created_at desc);

comment on table public.global_announcements is
  'Broadcast notifications authored by admins and shown on the learner dashboard.';

alter table public.global_announcements enable row level security;

create policy "Learners read global announcements" on public.global_announcements
  for select using (auth.role() = 'authenticated' or public.is_admin());

create policy "Admins insert global announcements" on public.global_announcements
  for insert with check (public.is_admin());

create policy "Admins update global announcements" on public.global_announcements
  for update using (public.is_admin()) with check (public.is_admin());

create policy "Admins delete global announcements" on public.global_announcements
  for delete using (public.is_admin());
