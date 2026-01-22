alter table public.profiles
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists phone text,
  add column if not exists username text,
  add column if not exists email text;

create unique index if not exists profiles_username_key on public.profiles (username) where username is not null;
create unique index if not exists profiles_email_key on public.profiles (email) where email is not null;

update public.profiles p
set email = coalesce(p.email, u.email),
    first_name = coalesce(p.first_name, split_part(p.full_name, ' ', 1)),
    last_name = coalesce(p.last_name, nullif(split_part(p.full_name, ' ', 2), ''))
from auth.users u
where u.id = p.id;
