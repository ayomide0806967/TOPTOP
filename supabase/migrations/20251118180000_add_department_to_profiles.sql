-- Add department_id column to profiles table
alter table public.profiles
  add column if not exists department_id uuid references public.departments on delete set null;

-- Add index for faster lookups
create index if not exists profiles_department_id_idx
  on public.profiles (department_id);

-- Add comment
comment on column public.profiles.department_id is
  'The department/course the learner is studying';
