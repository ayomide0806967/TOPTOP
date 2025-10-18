-- Learner community forum (threads, posts, attachments, read tracking)

create table if not exists public.community_threads (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) > 0),
  created_by uuid not null references auth.users on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.community_posts (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.community_threads on delete cascade,
  author_id uuid not null references auth.users on delete cascade,
  content text not null default '',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.community_post_attachments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts on delete cascade,
  storage_path text not null,
  file_name text not null,
  mime_type text,
  size_bytes integer not null default 0 check (size_bytes >= 0),
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.community_thread_reads (
  user_id uuid not null references auth.users on delete cascade,
  thread_id uuid not null references public.community_threads on delete cascade,
  last_read_at timestamptz not null default timezone('utc', now()),
  last_read_post_id uuid,
  primary key (user_id, thread_id)
);

create index if not exists community_threads_created_by_idx
  on public.community_threads (created_by);

create index if not exists community_posts_thread_idx
  on public.community_posts (thread_id, created_at desc);

create index if not exists community_posts_author_idx
  on public.community_posts (author_id, created_at desc);

create index if not exists community_post_attachments_post_idx
  on public.community_post_attachments (post_id);

create index if not exists community_thread_reads_thread_idx
  on public.community_thread_reads (thread_id);

comment on table public.community_threads is
  'Top-level learner community conversations.';

comment on table public.community_posts is
  'Messages within a community thread.';

comment on table public.community_post_attachments is
  'Metadata for files/images attached to community posts.';

comment on table public.community_thread_reads is
  'Tracks the last read position per user per thread.';

create trigger set_timestamp_community_threads
  before update on public.community_threads
  for each row
  execute procedure public.set_updated_at();

create trigger set_timestamp_community_posts
  before update on public.community_posts
  for each row
  execute procedure public.set_updated_at();

alter table public.community_threads enable row level security;
alter table public.community_posts enable row level security;
alter table public.community_post_attachments enable row level security;
alter table public.community_thread_reads enable row level security;

create policy "Learners read community threads" on public.community_threads
  for select using (
    auth.role() = 'authenticated'
    or public.is_admin()
  );

create policy "Learners create community threads" on public.community_threads
  for insert with check (auth.uid() = created_by);

create policy "Authors manage community threads" on public.community_threads
  for update using (auth.uid() = created_by or public.is_admin())
  with check (auth.uid() = created_by or public.is_admin());

create policy "Admins delete community threads" on public.community_threads
  for delete using (public.is_admin());

create policy "Learners read community posts" on public.community_posts
  for select using (
    auth.role() = 'authenticated'
    or public.is_admin()
  );

create policy "Learners create community posts" on public.community_posts
  for insert with check (auth.uid() = author_id);

create policy "Authors manage community posts" on public.community_posts
  for update using (auth.uid() = author_id or public.is_admin())
  with check (auth.uid() = author_id or public.is_admin());

create policy "Authors delete community posts" on public.community_posts
  for delete using (auth.uid() = author_id or public.is_admin());

create policy "Learners read community attachments" on public.community_post_attachments
  for select using (
    auth.role() = 'authenticated'
    or public.is_admin()
  );

create policy "Authors manage community attachments" on public.community_post_attachments
  for insert with check (
    auth.role() = 'authenticated'
    and exists (
      select 1
      from public.community_posts p
      where p.id = post_id
        and (p.author_id = auth.uid() or public.is_admin())
    )
  );

create policy "Authors delete community attachments" on public.community_post_attachments
  for delete using (
    exists (
      select 1
      from public.community_posts p
      where p.id = post_id
        and (p.author_id = auth.uid() or public.is_admin())
    )
  );

create policy "Learners read community thread reads" on public.community_thread_reads
  for select using (auth.uid() = user_id or public.is_admin());

create policy "Learners upsert community thread reads" on public.community_thread_reads
  for insert with check (auth.uid() = user_id);

create policy "Learners update community thread reads" on public.community_thread_reads
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Learners delete community thread reads" on public.community_thread_reads
  for delete using (auth.uid() = user_id);

create or replace view public.community_thread_summaries
with (security_invoker = on)
as
select
  t.id,
  t.title,
  t.created_by,
  t.created_at,
  t.updated_at,
  coalesce(
    (
      select p.created_at
      from public.community_posts p
      where p.thread_id = t.id
      order by p.created_at desc
      limit 1
    ),
    t.created_at
  ) as last_posted_at,
  (
    select p.author_id
    from public.community_posts p
    where p.thread_id = t.id
    order by p.created_at desc
    limit 1
  ) as last_post_author_id,
  (
    select left(btrim(p.content), 160)
    from public.community_posts p
    where p.thread_id = t.id
    order by p.created_at desc
    limit 1
  ) as last_post_excerpt,
  (
    select count(*)
    from public.community_posts p
    where p.thread_id = t.id
  ) as post_count
from public.community_threads t;

comment on view public.community_thread_summaries is
  'Aggregated metadata for community threads, including last activity details.';

create or replace function public.community_mark_thread_read(p_thread_id uuid)
returns public.community_thread_reads
language plpgsql
security definer
set search_path = public
as $$
declare
  v_latest_post timestamptz;
  v_latest_post_id uuid;
  v_read public.community_thread_reads;
begin
  if p_thread_id is null then
    raise exception using message = 'Thread id is required.';
  end if;

  select p.created_at, p.id
    into v_latest_post, v_latest_post_id
  from public.community_posts p
  where p.thread_id = p_thread_id
  order by p.created_at desc
  limit 1;

  insert into public.community_thread_reads (user_id, thread_id, last_read_at, last_read_post_id)
  values (
    auth.uid(),
    p_thread_id,
    coalesce(v_latest_post, timezone('utc', now())),
    v_latest_post_id
  )
  on conflict (user_id, thread_id)
  do update set
    last_read_at = excluded.last_read_at,
    last_read_post_id = coalesce(excluded.last_read_post_id, public.community_thread_reads.last_read_post_id)
  returning *
  into v_read;

  return v_read;
end;
$$;

grant execute on function public.community_mark_thread_read(uuid) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'community-uploads',
  'community-uploads',
  false,
  5 * 1024 * 1024,
  array[
    'image/*',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain'
  ]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "Community attachments read" on storage.objects
  for select using (
    bucket_id = 'community-uploads'
    and auth.role() = 'authenticated'
  );

create policy "Community attachments insert" on storage.objects
  for insert with check (
    bucket_id = 'community-uploads'
    and auth.role() = 'authenticated'
    and (owner = auth.uid() or owner is null)
  );

create policy "Community attachments update" on storage.objects
  for update using (
    bucket_id = 'community-uploads'
    and auth.uid() = owner
  ) with check (
    bucket_id = 'community-uploads'
    and auth.uid() = owner
  );

create policy "Community attachments delete" on storage.objects
  for delete using (
    bucket_id = 'community-uploads'
    and (auth.uid() = owner or public.is_admin())
  );
