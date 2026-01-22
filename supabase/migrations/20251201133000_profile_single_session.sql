set check_function_bodies = off;

-------------------------------------------------------------------------------
-- Single-session enforcement support
-------------------------------------------------------------------------------

alter table public.profiles
  add column if not exists session_fingerprint text,
  add column if not exists session_refreshed_at timestamptz;

-------------------------------------------------------------------------------
-- Session synchronisation helpers
-------------------------------------------------------------------------------

drop function if exists public.sync_profile_session(text, timestamptz);
create function public.sync_profile_session(
  p_session_fingerprint text,
  p_session_refreshed_at timestamptz default timezone('utc', now())
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;

  update public.profiles
  set session_fingerprint = p_session_fingerprint,
      session_refreshed_at = p_session_refreshed_at,
      updated_at = timezone('utc', now())
  where id = v_user;

  return jsonb_build_object(
    'session_fingerprint', p_session_fingerprint,
    'session_refreshed_at', p_session_refreshed_at
  );
end;
$$;

drop function if exists public.validate_profile_session(text);
create function public.validate_profile_session(p_session_fingerprint text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_profile record;
  v_valid boolean := true;
  v_reason text := null;
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;

  select session_fingerprint, session_refreshed_at
    into v_profile
  from public.profiles
  where id = v_user;

  if not found then
    return jsonb_build_object('valid', false, 'reason', 'profile_not_found');
  end if;

  if v_profile.session_fingerprint is null or v_profile.session_fingerprint = '' then
    return jsonb_build_object('valid', true);
  end if;

  v_valid := v_profile.session_fingerprint = p_session_fingerprint;
  if not v_valid then
    v_reason := 'session_conflict';
  end if;

  return jsonb_build_object(
    'valid', v_valid,
    'reason', v_reason,
    'session_refreshed_at', v_profile.session_refreshed_at
  );
end;
$$;

grant execute on function public.sync_profile_session(text, timestamptz) to authenticated;
grant execute on function public.validate_profile_session(text) to authenticated;
