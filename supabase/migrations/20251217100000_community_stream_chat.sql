-- Single-room community stream for simplified chat experience

create table if not exists public.community_stream_messages (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users on delete cascade,
  content text not null default '',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists community_stream_messages_author_idx
  on public.community_stream_messages (author_id, created_at desc);

create index if not exists community_stream_messages_created_idx
  on public.community_stream_messages (created_at desc);

create trigger set_timestamp_community_stream_messages
  before update on public.community_stream_messages
  for each row
  execute procedure public.set_updated_at();

comment on table public.community_stream_messages is
  'Flat community chat stream where every authenticated learner can post updates.';

alter table public.community_stream_messages enable row level security;

create policy "Learners read stream messages" on public.community_stream_messages
  for select using (
    auth.role() = 'authenticated'
    or public.is_admin()
  );

create policy "Learners create stream messages" on public.community_stream_messages
  for insert with check (auth.uid() = author_id);

create policy "Authors manage stream messages" on public.community_stream_messages
  for update using (auth.uid() = author_id or public.is_admin())
  with check (auth.uid() = author_id or public.is_admin());

create policy "Authors delete stream messages" on public.community_stream_messages
  for delete using (auth.uid() = author_id or public.is_admin());

create table if not exists public.community_stream_attachments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.community_stream_messages on delete cascade,
  storage_path text not null,
  file_name text not null,
  mime_type text,
  size_bytes integer not null default 0 check (size_bytes >= 0),
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists community_stream_attachments_message_idx
  on public.community_stream_attachments (message_id);

comment on table public.community_stream_attachments is
  'Attachments linked to single-room community stream messages.';

alter table public.community_stream_attachments enable row level security;

create policy "Learners read stream attachments" on public.community_stream_attachments
  for select using (
    auth.role() = 'authenticated'
    or public.is_admin()
  );

create policy "Authors add stream attachments" on public.community_stream_attachments
  for insert with check (
    exists (
      select 1
      from public.community_stream_messages m
      where m.id = message_id
        and (m.author_id = auth.uid() or public.is_admin())
    )
  );

create policy "Authors delete stream attachments" on public.community_stream_attachments
  for delete using (
    exists (
      select 1
      from public.community_stream_messages m
      where m.id = message_id
        and (m.author_id = auth.uid() or public.is_admin())
    )
  );
