insert into public."user" (id, name, email, "emailVerified", image, "createdAt", "updatedAt")
select
  au.id::text,
  coalesce(nullif(p.full_name, ''), au.email, au.id::text) as name,
  au.email,
  true,
  null,
  coalesce(au.created_at, now()),
  coalesce(au.updated_at, now())
from auth.users au
left join public.profiles p on p.id = au.id
where au.email is not null
on conflict (id) do update
set
  name = excluded.name,
  email = excluded.email,
  "updatedAt" = excluded."updatedAt";
