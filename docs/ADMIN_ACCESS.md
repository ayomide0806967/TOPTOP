# Admin access (Supabase)

The admin app (`apps/admin`) allows sign-in only when the signed-in user has `public.profiles.role = 'admin'`.

If you see logs like:

- `[AuthService] User has role: learner but admin role required`

…then the credentials are valid, but that account is not an admin yet.

## Promote a user to admin

Run one of the following in the Supabase SQL Editor (runs as `postgres`, bypassing RLS).

### By user id (UUID)

```sql
update public.profiles
set role = 'admin'
where id = 'PUT-USER-UUID-HERE';
```

### By email

```sql
update public.profiles p
set role = 'admin'
from auth.users u
where u.id = p.id
  and lower(u.email) = lower('PUT-EMAIL-HERE');
```

If the user exists in `auth.users` but has no row in `public.profiles`, insert it first:

```sql
insert into public.profiles (id, full_name, role)
select u.id, coalesce(u.raw_user_meta_data->>'full_name', u.email), 'admin'::public.user_role
from auth.users u
where lower(u.email) = lower('PUT-EMAIL-HERE')
on conflict (id) do update set role = excluded.role;
```

## Security advisor: `admin_dashboard_stats` is SECURITY DEFINER

This warning is separate from sign-in. The repo’s definition of `public.admin_dashboard_stats` is intended to be a _security invoker_ view.

To recreate it, run `supabase/restore_admin_dashboard_stats.sql` in Supabase SQL Editor.
