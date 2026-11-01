-- Idempotent sync endpoints. All are SECURITY INVOKER, so RLS applies exactly as for a direct
-- query. No function takes an installation id: it always comes from the caller's login.
--
-- Merge strategy:
--   game_progress    field-wise and monotonic: completed = OR, stars and attempts = MAX,
--                    updated_at = MAX. Replays and any arrival order give the same result.
--   profile/settings/session    last write wins by client timestamp. Older writes are ignored.
--   game_rewards     insert-only, keyed by a client-generated id.
--
-- Client timestamps are capped at server time + 5 minutes, so a device with a wrong clock
-- cannot stay "newest" and permanently beat real updates.

create function private.clamp_ts(p_ts timestamptz) returns timestamptz
language sql stable set search_path = '' as $$
  select least(coalesce(p_ts, now()), now() + interval '5 minutes');
$$;
revoke all on function private.clamp_ts(timestamptz) from public, anon;
grant execute on function private.clamp_ts(timestamptz) to authenticated;

create function public.ensure_installation(
  p_installation_uuid uuid,
  p_app_version text default null,
  p_platform text default 'android'
) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  v_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  insert into public.app_installations (owner_user_id, installation_uuid, app_version, platform)
  values ((select auth.uid()), p_installation_uuid, p_app_version, p_platform)
  on conflict (owner_user_id) do update
    set last_seen_at = now(), app_version = excluded.app_version
  returning id into v_id;
  return v_id;
end;
$$;

create function public.sync_child_profile(
  p_id uuid,
  p_display_id text,
  p_nickname text,
  p_gender text,
  p_date_of_birth date,
  p_age_group text,
  p_avatar_id text,
  p_created_at timestamptz,
  p_updated_at timestamptz
) returns public.child_profiles
language plpgsql security invoker set search_path = '' as $$
declare
  v_installation uuid := private.current_installation_id();
  v_row public.child_profiles;
begin
  if v_installation is null then
    raise exception 'installation not registered' using errcode = '42501';
  end if;
  insert into public.child_profiles as c
    (id, installation_id, display_id, nickname, gender, date_of_birth, age_group, avatar_id, created_at, updated_at)
  values
    (p_id, v_installation, p_display_id, p_nickname, p_gender, p_date_of_birth, p_age_group, p_avatar_id,
     private.clamp_ts(p_created_at), private.clamp_ts(p_updated_at))
  on conflict (id) do update set
    nickname = excluded.nickname,
    gender = excluded.gender,
    date_of_birth = excluded.date_of_birth,
    age_group = excluded.age_group,
    avatar_id = excluded.avatar_id,
    updated_at = excluded.updated_at
  where excluded.updated_at > c.updated_at
  returning * into v_row;

  if v_row.id is null then -- The stored row was newer, so nothing changed.
    select * into strict v_row from public.child_profiles where id = p_id;
  end if;
  return v_row;
end;
$$;

create function public.join_game(p_child_id uuid, p_game_id uuid) returns void
language sql security invoker set search_path = '' as $$
  insert into public.game_child_profiles (child_id, game_id)
  values (p_child_id, p_game_id)
  on conflict (child_id, game_id) do nothing;
$$;

create function public.merge_game_progress(
  p_child_id uuid,
  p_game_id uuid,
  p_category text,
  p_level_id text,
  p_completed boolean,
  p_stars integer,
  p_attempts integer,
  p_updated_at timestamptz
) returns void
language plpgsql security invoker set search_path = '' as $$
declare
  v_ts timestamptz := private.clamp_ts(p_updated_at);
begin
  insert into public.game_progress as g
    (child_id, game_id, category, level_id, completed, stars, attempts, updated_at)
  values (p_child_id, p_game_id, p_category, p_level_id, p_completed, p_stars, p_attempts, v_ts)
  on conflict (child_id, game_id, category, level_id) do update set
    completed = g.completed or excluded.completed,
    stars = greatest(g.stars, excluded.stars),
    attempts = greatest(g.attempts, excluded.attempts),
    updated_at = greatest(g.updated_at, excluded.updated_at);

  insert into public.game_child_profiles as j (child_id, game_id, last_played_at)
  values (p_child_id, p_game_id, v_ts)
  on conflict (child_id, game_id) do update
    set last_played_at = greatest(j.last_played_at, excluded.last_played_at);
end;
$$;

create function public.sync_game_settings(
  p_child_id uuid, p_game_id uuid, p_settings jsonb, p_updated_at timestamptz
) returns void
language sql security invoker set search_path = '' as $$
  insert into public.game_settings as s (child_id, game_id, settings, updated_at)
  values (p_child_id, p_game_id, p_settings, private.clamp_ts(p_updated_at))
  on conflict (child_id, game_id) do update
    set settings = excluded.settings, updated_at = excluded.updated_at
    where excluded.updated_at > s.updated_at;
$$;

create function public.sync_game_session(
  p_child_id uuid, p_game_id uuid, p_session_data jsonb, p_is_completed boolean, p_updated_at timestamptz
) returns void
language sql security invoker set search_path = '' as $$
  insert into public.game_sessions as s (child_id, game_id, session_data, is_completed, updated_at)
  values (p_child_id, p_game_id, p_session_data, p_is_completed, private.clamp_ts(p_updated_at))
  on conflict (child_id, game_id) do update
    set session_data = excluded.session_data, is_completed = excluded.is_completed, updated_at = excluded.updated_at
    where excluded.updated_at > s.updated_at;
$$;

-- Clears one game's learning data for one child. Other games' data and settings are untouched.
create function public.reset_game_data(p_child_id uuid, p_game_id uuid) returns void
language plpgsql security invoker set search_path = '' as $$
begin
  delete from public.game_progress where child_id = p_child_id and game_id = p_game_id;
  delete from public.game_rewards  where child_id = p_child_id and game_id = p_game_id;
  delete from public.game_sessions where child_id = p_child_id and game_id = p_game_id;
end;
$$;

revoke execute on function
  public.ensure_installation(uuid, text, text),
  public.sync_child_profile(uuid, text, text, text, date, text, text, timestamptz, timestamptz),
  public.join_game(uuid, uuid),
  public.merge_game_progress(uuid, uuid, text, text, boolean, integer, integer, timestamptz),
  public.sync_game_settings(uuid, uuid, jsonb, timestamptz),
  public.sync_game_session(uuid, uuid, jsonb, boolean, timestamptz),
  public.reset_game_data(uuid, uuid)
  from public, anon;

grant execute on function
  public.ensure_installation(uuid, text, text),
  public.sync_child_profile(uuid, text, text, text, date, text, text, timestamptz, timestamptz),
  public.join_game(uuid, uuid),
  public.merge_game_progress(uuid, uuid, text, text, boolean, integer, integer, timestamptz),
  public.sync_game_settings(uuid, uuid, jsonb, timestamptz),
  public.sync_game_session(uuid, uuid, jsonb, boolean, timestamptz),
  public.reset_game_data(uuid, uuid)
  to authenticated;
