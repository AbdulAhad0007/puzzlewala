-- Multi-game core schema shared by every game in the ecosystem.
--
-- Ownership chain, the only path to any child's data:
--   auth.users -> app_installations.owner_user_id -> child_profiles.installation_id
--              -> game_* tables via child_id, isolated per game via game_id
--
-- Deletion behaviour:
--   * Deleting an auth user or a child removes that child's data (parent-controlled deletion).
--   * Deleting a game is RESTRICTed while any child data references it. Retire a game by
--     setting games.status instead, so children's records are never lost by accident.

create table public.games (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(name) between 1 and 100),
  slug        text unique not null check (slug ~ '^[a-z0-9][a-z0-9-]{1,48}$'),
  description text,
  version     text,
  status      text not null default 'active' check (status in ('active', 'inactive', 'retired')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.app_installations (
  id                uuid primary key default gen_random_uuid(),
  -- Added to the base spec: the trusted link between an installation and its authenticated owner.
  owner_user_id     uuid not null unique default auth.uid() references auth.users (id) on delete cascade,
  -- Random value created by the app. Never derived from hardware identifiers.
  installation_uuid uuid unique not null,
  created_at        timestamptz not null default now(),
  last_seen_at      timestamptz not null default now(),
  platform          text not null default 'android' check (length(platform) <= 20),
  app_version       text check (length(app_version) <= 30)
);

create table public.child_profiles (
  -- The app may supply this id: profiles can be created offline and synced later.
  id              uuid primary key default gen_random_uuid(),
  installation_id uuid not null references public.app_installations (id) on delete cascade,
  display_id      text unique not null check (display_id ~ '^[A-Z]{2}-[23456789A-HJ-NP-Z]{6}$'),
  nickname        text not null check (length(btrim(nickname)) between 1 and 30),
  gender          text check (gender in ('girl', 'boy', 'other')),
  date_of_birth   date check (date_of_birth <= current_date),
  age_group       text check (age_group in ('3-4', '4-5', '5-6')),
  avatar_id       text check (length(avatar_id) <= 40),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table public.game_child_profiles (
  id             uuid primary key default gen_random_uuid(),
  child_id       uuid not null references public.child_profiles (id) on delete cascade,
  game_id        uuid not null references public.games (id) on delete restrict,
  joined_at      timestamptz not null default now(),
  last_played_at timestamptz,
  unique (child_id, game_id)
);

create table public.game_progress (
  id         uuid primary key default gen_random_uuid(),
  child_id   uuid not null references public.child_profiles (id) on delete cascade,
  game_id    uuid not null references public.games (id) on delete restrict,
  category   text not null check (length(category) between 1 and 60),
  level_id   text not null check (length(level_id) between 1 and 100),
  completed  boolean not null default false,
  stars      integer not null default 0 check (stars between 0 and 5),
  attempts   integer not null default 0 check (attempts >= 0),
  updated_at timestamptz not null default now(),
  unique (child_id, game_id, category, level_id)
);

create table public.game_settings (
  id         uuid primary key default gen_random_uuid(),
  child_id   uuid not null references public.child_profiles (id) on delete cascade,
  game_id    uuid not null references public.games (id) on delete restrict,
  settings   jsonb not null default '{}'::jsonb
             check (jsonb_typeof(settings) = 'object' and pg_column_size(settings) <= 16384),
  updated_at timestamptz not null default now(),
  unique (child_id, game_id)
);

-- One resumable session per child per game: the puzzle the child most recently left unfinished.
create table public.game_sessions (
  id           uuid primary key default gen_random_uuid(),
  child_id     uuid not null references public.child_profiles (id) on delete cascade,
  game_id      uuid not null references public.games (id) on delete restrict,
  -- The size limit keeps media out: images and audio belong in bundled assets or Storage.
  session_data jsonb not null default '{}'::jsonb
               check (jsonb_typeof(session_data) = 'object' and pg_column_size(session_data) <= 65536),
  is_completed boolean not null default false,
  updated_at   timestamptz not null default now(),
  unique (child_id, game_id)
);

create table public.game_rewards (
  -- The app supplies this id so a retried sync can never award the same reward twice.
  id          uuid primary key default gen_random_uuid(),
  child_id    uuid not null references public.child_profiles (id) on delete cascade,
  game_id     uuid not null references public.games (id) on delete restrict,
  reward_type text not null check (length(reward_type) between 1 and 40),
  reward_data jsonb not null default '{}'::jsonb
              check (jsonb_typeof(reward_data) = 'object' and pg_column_size(reward_data) <= 8192),
  earned_at   timestamptz not null default now()
);

-- Unique constraints above already index (child_id, game_id, ...) lookups.
create index child_profiles_installation_idx on public.child_profiles (installation_id);
create index game_child_profiles_game_idx on public.game_child_profiles (game_id);
create index game_progress_game_idx on public.game_progress (game_id);
create index game_progress_child_game_category_idx on public.game_progress (child_id, game_id, category);
create index game_settings_game_idx on public.game_settings (game_id);
create index game_sessions_game_idx on public.game_sessions (game_id);
create index game_sessions_open_idx on public.game_sessions (child_id, game_id) where not is_completed;
create index game_rewards_child_game_idx on public.game_rewards (child_id, game_id, earned_at desc);
create index game_rewards_game_idx on public.game_rewards (game_id);

create function public.touch_games_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
revoke execute on function public.touch_games_updated_at() from public, anon, authenticated;

create trigger games_touch_updated_at before update on public.games
  for each row execute function public.touch_games_updated_at();
