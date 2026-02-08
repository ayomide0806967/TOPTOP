set check_function_bodies = off;

alter table public.profiles
  add column if not exists school_name text,
  add column if not exists phone_verified_at timestamptz;

create index if not exists profiles_phone_idx
  on public.profiles (phone)
  where phone is not null;

create or replace function public.prevent_profile_email_change()
returns trigger
language plpgsql
as $$
begin
  -- Allow service role / server-side updates (auth.uid() will be null).
  -- Prevent learners/instructors from changing email after it is set.
  if auth.uid() is not null and not public.is_admin() then
    if old.email is not null and new.email is distinct from old.email then
      raise exception 'Email cannot be changed.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_profile_email_change on public.profiles;
create trigger prevent_profile_email_change
  before update of email on public.profiles
  for each row
  execute function public.prevent_profile_email_change();
