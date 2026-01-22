create or replace function public.impersonate(user_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  new_token text;
begin
  if not is_admin() then
    raise exception 'Only admins can impersonate users.';
  end if;

  select sign(auth.jwt(), json_build_object('sub', user_id::text, 'role', 'authenticated'))
  into new_token;

  return json_build_object('access_token', new_token);
end;
$$;

grant execute on function public.impersonate(uuid) to authenticated;
