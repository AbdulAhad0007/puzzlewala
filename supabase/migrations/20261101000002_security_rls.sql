-- Row Level Security. Knowing a UUID or Child ID never grants access:
-- every check walks the database relationships back to auth.uid().

-- Helpers live outside the API-exposed schema, so they cannot be called as RPCs.
-- SECURITY DEFINER avoids policies re-entering each other's tables; each helper only ever
-- answers questions about the caller's own auth.uid().
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create function private.current_installation_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select id from public.app_installations where owner_user_id = (select auth.uid());
$$;

create function private.owns_child(p_child_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.child_profiles c
    join public.app_installations i on i.id = c.installation_id
    where c.id = p_child_id and i.owner_user_id = (select auth.uid())
  );
$$;

create function private.is_active_game(p_game_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.games where id = p_game_id and status = 'active');
$$;

-- Readable Child IDs. 32 symbols without the look-alikes 0/O and 1/I; 256 mod 32 = 0, so unbiased.
create function private.generate_display_id(p_prefix text) returns text
language plpgsql volatile set search_path = '' as $$
declare
  alphabet constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  bytes bytea := extensions.gen_random_bytes(6);
  body text := '';
begin
  for i in 0..5 loop
    body := body || substr(alphabet, (get_byte(bytes, i) % 32) + 1, 1);
  end loop;
  return p_prefix || '-' || body;
end;
$$;

-- Offline devices propose a Child ID; the database has the final word on uniqueness.
-- SECURITY DEFINER is required to see other installations' IDs. The caller only learns
-- the ID finally assigned to them, never whose ID collided.
create function private.assign_display_id() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  prefix text := coalesce(substring(new.display_id from '^[A-Z]{2}'), 'PW');
begin
  if new.display_id is null or new.display_id !~ '^[A-Z]{2}-[23456789A-HJ-NP-Z]{6}$' then
    new.display_id := private.generate_display_id(prefix);
  end if;
  while exists (select 1 from public.child_profiles where display_id = new.display_id) loop
    new.display_id := private.generate_display_id(prefix);
  end loop;
  return new;
end;
$$;

create function private.keep_display_id() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.display_id := old.display_id; -- A Child ID never changes once issued.
  return new;
end;
$$;

revoke all on all functions in schema private from public, anon;
grant execute on function private.current_installation_id() to authenticated;
grant execute on function private.owns_child(uuid) to authenticated;
grant execute on function private.is_active_game(uuid) to authenticated;

create trigger child_profiles_assign_display_id before insert on public.child_profiles
  for each row execute function private.assign_display_id();
create trigger child_profiles_keep_display_id before update on public.child_profiles
  for each row execute function private.keep_display_id();

-- Table privileges: nothing for signed-out callers, and the least needed for signed-in ones.
revoke all on
  public.games, public.app_installations, public.child_profiles, public.game_child_profiles,
  public.game_progress, public.game_settings, public.game_sessions, public.game_rewards
  from public, anon, authenticated;

grant select on public.games to authenticated;
grant select, insert, update on public.app_installations to authenticated;
grant select, insert, update, delete on
  public.child_profiles, public.game_child_profiles, public.game_progress,
  public.game_settings, public.game_sessions
  to authenticated;
grant select, insert, delete on public.game_rewards to authenticated; -- Rewards are never edited.

alter table public.games               enable row level security;
alter table public.app_installations   enable row level security;
alter table public.child_profiles      enable row level security;
alter table public.game_child_profiles enable row level security;
alter table public.game_progress       enable row level security;
alter table public.game_settings       enable row level security;
alter table public.game_sessions       enable row level security;
alter table public.game_rewards        enable row level security;

-- Registry: read-only for clients. No write policy or privilege exists.
create policy games_select on public.games
  for select to authenticated using (true);

-- Installations: only your own. No delete: it follows from deleting the auth user.
create policy installations_select on public.app_installations
  for select to authenticated using (owner_user_id = (select auth.uid()));
create policy installations_insert on public.app_installations
  for insert to authenticated with check (owner_user_id = (select auth.uid()));
create policy installations_update on public.app_installations
  for update to authenticated
  using (owner_user_id = (select auth.uid()))
  with check (owner_user_id = (select auth.uid()));

-- Child profiles: the installation is resolved from the login, never trusted from the client.
create policy child_profiles_select on public.child_profiles
  for select to authenticated using (installation_id = (select private.current_installation_id()));
create policy child_profiles_insert on public.child_profiles
  for insert to authenticated with check (installation_id = (select private.current_installation_id()));
create policy child_profiles_update on public.child_profiles
  for update to authenticated
  using (installation_id = (select private.current_installation_id()))
  with check (installation_id = (select private.current_installation_id()));
create policy child_profiles_delete on public.child_profiles
  for delete to authenticated using (installation_id = (select private.current_installation_id()));

-- Game tables: you must own the child, and may only write to an active game.
do $$
declare
  t text;
begin
  foreach t in array array['game_child_profiles', 'game_progress', 'game_settings', 'game_sessions', 'game_rewards'] loop
    execute format(
      'create policy %1$s_select on public.%1$I for select to authenticated using (private.owns_child(child_id))', t);
    execute format(
      'create policy %1$s_insert on public.%1$I for insert to authenticated with check (private.owns_child(child_id) and private.is_active_game(game_id))', t);
    execute format(
      'create policy %1$s_delete on public.%1$I for delete to authenticated using (private.owns_child(child_id))', t);
    if t <> 'game_rewards' then
      execute format(
        'create policy %1$s_update on public.%1$I for update to authenticated using (private.owns_child(child_id)) with check (private.owns_child(child_id) and private.is_active_game(game_id))', t);
    end if;
  end loop;
end;
$$;
