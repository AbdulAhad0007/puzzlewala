import { gameConfig, LOCAL_GAME_ID } from '../constants/gameConfig';
import type { GameProgressRow, GameRewardRow, GameSessionRow, GameSettingsRow, ChildProfileRow } from '../types/database';
import { DEFAULT_SETTINGS, type GameSettings } from '../types/game';
import type { AgeGroup, ChildProfileInput, ChildProfileRecord, Gender } from '../types/profile';
import type { PuzzleSessionData } from '../types/progress';
import { newDisplayId, newUuid } from '../utils/ids';
import { getDb, type SqlOps } from './storage/localDatabase';
import { enqueue, purgeForChild } from './storage/syncQueue';

/**
 * Every app write goes through here: it updates SQLite and queues the cloud change in a single
 * transaction, then tells the sync manager. Nothing here waits on the network.
 */
type Listener = () => void;
let onLocalWrite: Listener = () => undefined;
export const setLocalWriteListener = (fn: Listener) => { onLocalWrite = fn; };

const GAME = () => gameConfig.gameId;
const nowIso = () => new Date().toISOString();

interface LocalProfileRow {
  id: string; display_id: string; nickname: string; gender: string | null; date_of_birth: string | null;
  age_group: string | null; avatar_id: string | null; created_at: string; updated_at: string;
}

const toProfile = (r: LocalProfileRow): ChildProfileRecord => ({
  id: r.id,
  displayId: r.display_id,
  nickname: r.nickname,
  gender: r.gender as Gender | null,
  dateOfBirth: r.date_of_birth,
  ageGroup: r.age_group as AgeGroup | null,
  avatarId: r.avatar_id,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const profilePayload = (p: ChildProfileRecord) => ({
  p_id: p.id,
  p_display_id: p.displayId,
  p_nickname: p.nickname,
  p_gender: p.gender,
  p_date_of_birth: p.dateOfBirth,
  p_age_group: p.ageGroup,
  p_avatar_id: p.avatarId,
  p_created_at: p.createdAt,
  p_updated_at: p.updatedAt,
});

export async function listProfiles(): Promise<ChildProfileRecord[]> {
  const db = await getDb();
  return (await db.all<LocalProfileRow>('SELECT * FROM profiles ORDER BY created_at, id')).map(toProfile);
}

export async function createProfile(input: ChildProfileInput): Promise<ChildProfileRecord> {
  const db = await getDb();
  const now = nowIso();
  const profile: ChildProfileRecord = {
    id: newUuid(),
    displayId: newDisplayId(),
    nickname: input.nickname.trim(),
    gender: input.gender,
    dateOfBirth: null,
    ageGroup: input.ageGroup,
    avatarId: input.avatarId,
    createdAt: now,
    updatedAt: now,
  };
  await db.tx(async (ops) => {
    await ops.run(
      'INSERT INTO profiles (id, display_id, nickname, gender, date_of_birth, age_group, avatar_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      profile.id, profile.displayId, profile.nickname, profile.gender, null, profile.ageGroup, profile.avatarId, now, now,
    );
    await enqueue(ops, 'profile', profile.id, `profile:${profile.id}`, profilePayload(profile));
    await enqueue(ops, 'join_game', profile.id, `join:${profile.id}`, { p_child_id: profile.id });
  });
  onLocalWrite();
  return profile;
}

export async function updateProfile(id: string, input: ChildProfileInput): Promise<ChildProfileRecord> {
  const db = await getDb();
  const updated = await db.tx(async (ops) => {
    const [row] = await ops.all<LocalProfileRow>('SELECT * FROM profiles WHERE id = ?', id);
    if (!row) throw new Error('Profile not found');
    const next: ChildProfileRecord = {
      ...toProfile(row),
      nickname: input.nickname.trim(),
      gender: input.gender,
      ageGroup: input.ageGroup,
      avatarId: input.avatarId,
      updatedAt: nowIso(),
    };
    await ops.run(
      'UPDATE profiles SET nickname = ?, gender = ?, age_group = ?, avatar_id = ?, updated_at = ? WHERE id = ?',
      next.nickname, next.gender, next.ageGroup, next.avatarId, next.updatedAt, id,
    );
    await enqueue(ops, 'profile', id, `profile:${id}`, profilePayload(next));
    return next;
  });
  onLocalWrite();
  return updated;
}

/** Removes a child everywhere: locally now, and from the cloud with its cascade when online. */
export async function deleteProfile(id: string): Promise<void> {
  const db = await getDb();
  await db.tx(async (ops) => {
    for (const table of ['progress', 'settings', 'sessions', 'rewards']) {
      await ops.run(`DELETE FROM ${table} WHERE child_id = ?`, id);
    }
    await ops.run('DELETE FROM profiles WHERE id = ?', id);
    await purgeForChild(ops, id);
    await enqueue(ops, 'delete_profile', id, null, { id });
  });
  onLocalWrite();
}

export interface ChildGameState {
  /** level id -> best stars, for completed levels. */
  solved: Record<string, number>;
  coins: number;
  settings: GameSettings;
  session: PuzzleSessionData | null;
}

function parseSettings(json: string | undefined): GameSettings {
  if (!json) return DEFAULT_SETTINGS;
  try {
    const parsed = JSON.parse(json) as Partial<GameSettings>;
    return { ...DEFAULT_SETTINGS, ...parsed, curriculum: { ...DEFAULT_SETTINGS.curriculum, ...parsed.curriculum } };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function loadChildState(childId: string): Promise<ChildGameState> {
  const db = await getDb();
  const progress = await db.all<{ level_id: string; stars: number }>(
    'SELECT level_id, stars FROM progress WHERE child_id = ? AND game_id = ? AND completed = 1', childId, GAME(),
  );
  const rewards = await db.all<{ reward_data: string }>(
    "SELECT reward_data FROM rewards WHERE child_id = ? AND game_id = ? AND reward_type = 'coins'", childId, GAME(),
  );
  const [settings] = await db.all<{ settings: string }>(
    'SELECT settings FROM settings WHERE child_id = ? AND game_id = ?', childId, GAME(),
  );
  const [session] = await db.all<{ session_data: string }>(
    'SELECT session_data FROM sessions WHERE child_id = ? AND game_id = ? AND is_completed = 0', childId, GAME(),
  );
  const coins = rewards.reduce((sum, r) => {
    const amount = (JSON.parse(r.reward_data) as { amount?: number }).amount;
    return sum + (typeof amount === 'number' ? amount : 0);
  }, 0);
  const sessionData = session ? (JSON.parse(session.session_data) as PuzzleSessionData) : null;
  return {
    solved: Object.fromEntries(progress.map((p) => [p.level_id, p.stars])),
    coins,
    settings: parseSettings(settings?.settings),
    session: sessionData?.current_level ? sessionData : null,
  };
}

async function addReward(ops: SqlOps, childId: string, type: 'coins' | 'badge', data: Record<string, unknown>) {
  const reward = { id: newUuid(), earned_at: nowIso() };
  await ops.run(
    'INSERT INTO rewards (id, child_id, game_id, reward_type, reward_data, earned_at) VALUES (?, ?, ?, ?, ?, ?)',
    reward.id, childId, GAME(), type, JSON.stringify(data), reward.earned_at,
  );
  await enqueue(ops, 'reward', childId, null, { id: reward.id, child_id: childId, reward_type: type, reward_data: data, earned_at: reward.earned_at });
}

export interface CompletionInput {
  childId: string;
  category: string;
  levelId: string;
  stars: number;
  coins: number;
  questBonus: number;
  badgeId?: string;
}

/** A finished puzzle: progress, rewards and session change together or not at all. */
export async function recordCompletion(c: CompletionInput): Promise<void> {
  const db = await getDb();
  const now = nowIso();
  await db.tx(async (ops) => {
    await ops.run(
      `INSERT INTO progress (child_id, game_id, category, level_id, completed, stars, attempts, updated_at)
       VALUES (?, ?, ?, ?, 1, ?, 1, ?)
       ON CONFLICT (child_id, game_id, category, level_id) DO UPDATE SET
         completed = 1, stars = MAX(stars, excluded.stars), attempts = attempts + 1, updated_at = excluded.updated_at`,
      c.childId, GAME(), c.category, c.levelId, c.stars, now,
    );
    const [row] = await ops.all<{ completed: number; stars: number; attempts: number }>(
      'SELECT completed, stars, attempts FROM progress WHERE child_id = ? AND game_id = ? AND category = ? AND level_id = ?',
      c.childId, GAME(), c.category, c.levelId,
    );
    await enqueue(ops, 'progress', c.childId, `progress:${c.childId}:${c.category}:${c.levelId}`, {
      p_child_id: c.childId, p_category: c.category, p_level_id: c.levelId,
      p_completed: row.completed === 1, p_stars: row.stars, p_attempts: row.attempts, p_updated_at: now,
    });
    await addReward(ops, c.childId, 'coins', { amount: c.coins, source: 'puzzle', level_id: c.levelId });
    if (c.questBonus > 0) await addReward(ops, c.childId, 'coins', { amount: c.questBonus, source: 'daily_quest' });
    if (c.badgeId) await addReward(ops, c.childId, 'badge', { badge_id: c.badgeId, level_id: c.levelId });
    await writeSession(ops, c.childId, {}, true, now);
  });
  onLocalWrite();
}

async function writeSession(ops: SqlOps, childId: string, data: object, isCompleted: boolean, now: string) {
  await ops.run(
    `INSERT INTO sessions (child_id, game_id, session_data, is_completed, updated_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (child_id, game_id) DO UPDATE SET
       session_data = excluded.session_data, is_completed = excluded.is_completed, updated_at = excluded.updated_at`,
    childId, GAME(), JSON.stringify(data), isCompleted ? 1 : 0, now,
  );
  await enqueue(ops, 'session', childId, `session:${childId}`, {
    p_child_id: childId, p_session_data: data, p_is_completed: isCompleted, p_updated_at: now,
  });
}

/** Saved on every placed piece, so a closed app or dead battery loses nothing. */
export async function saveSession(childId: string, data: PuzzleSessionData): Promise<void> {
  const db = await getDb();
  await db.tx((ops) => writeSession(ops, childId, data, false, nowIso()));
  onLocalWrite();
}

export async function saveSettings(childId: string, settings: GameSettings): Promise<void> {
  const db = await getDb();
  const now = nowIso();
  await db.tx(async (ops) => {
    await ops.run(
      `INSERT INTO settings (child_id, game_id, settings, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT (child_id, game_id) DO UPDATE SET settings = excluded.settings, updated_at = excluded.updated_at`,
      childId, GAME(), JSON.stringify(settings), now,
    );
    await enqueue(ops, 'settings', childId, `settings:${childId}`, {
      p_child_id: childId, p_settings: settings, p_updated_at: now,
    });
  });
  onLocalWrite();
}

/** Clears this game only. Pending writes it supersedes are dropped so they can't undo it. */
export async function resetGameProgress(childId: string): Promise<void> {
  const db = await getDb();
  await db.tx(async (ops) => {
    for (const table of ['progress', 'sessions', 'rewards']) {
      await ops.run(`DELETE FROM ${table} WHERE child_id = ? AND game_id = ?`, childId, GAME());
    }
    await purgeForChild(ops, childId, ['progress', 'reward', 'session', 'reset']);
    await enqueue(ops, 'reset', childId, null, { p_child_id: childId });
  });
  onLocalWrite();
}

export async function getKv(key: string): Promise<string | null> {
  const db = await getDb();
  const [row] = await db.all<{ value: string }>('SELECT value FROM kv WHERE key = ?', key);
  return row?.value ?? null;
}

export async function setKv(key: string, value: string): Promise<void> {
  const db = await getDb();
  await db.run('INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value', key, value);
}

/** The installation's random identity. Unrelated to any hardware identifier. */
export async function getInstallationUuid(forceNew = false): Promise<string> {
  const existing = forceNew ? null : await getKv('installation_uuid');
  if (existing) return existing;
  const fresh = newUuid();
  await setKv('installation_uuid', fresh);
  return fresh;
}

/** Local rows made before a game UUID was configured belong to this app's game. */
export async function adoptLocalGameRows(): Promise<void> {
  if (GAME() === LOCAL_GAME_ID) return;
  const db = await getDb();
  await db.tx(async (ops) => {
    for (const table of ['progress', 'settings', 'sessions', 'rewards']) {
      await ops.run(`UPDATE OR IGNORE ${table} SET game_id = ? WHERE game_id = ?`, GAME(), LOCAL_GAME_ID);
    }
  });
}

// ---- Applying cloud data. These never queue anything: the data came from the cloud. ----

/** Adopts a Child ID the database re-issued after a collision. */
export async function applyServerDisplayId(id: string, displayId: string): Promise<boolean> {
  const db = await getDb();
  const [row] = await db.all<{ display_id: string }>('SELECT display_id FROM profiles WHERE id = ?', id);
  if (!row || row.display_id === displayId) return false;
  await db.run('UPDATE profiles SET display_id = ? WHERE id = ?', displayId, id);
  return true;
}

export interface RemoteSnapshot {
  profiles: ChildProfileRow[];
  progress: GameProgressRow[];
  settings: GameSettingsRow[];
  sessions: GameSessionRow[];
  rewards: GameRewardRow[];
}

/** Merges with the same rules as the server, so the local copy and the cloud converge. */
export async function applyRemoteSnapshot(s: RemoteSnapshot): Promise<void> {
  const db = await getDb();
  await db.tx(async (ops) => {
    for (const p of s.profiles) {
      await ops.run(
        `INSERT INTO profiles (id, display_id, nickname, gender, date_of_birth, age_group, avatar_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET
           display_id = excluded.display_id, nickname = excluded.nickname, gender = excluded.gender,
           date_of_birth = excluded.date_of_birth, age_group = excluded.age_group,
           avatar_id = excluded.avatar_id, updated_at = excluded.updated_at
         WHERE excluded.updated_at > profiles.updated_at`,
        p.id, p.display_id, p.nickname, p.gender, p.date_of_birth, p.age_group, p.avatar_id, p.created_at, p.updated_at,
      );
    }
    for (const p of s.progress) {
      await ops.run(
        `INSERT INTO progress (child_id, game_id, category, level_id, completed, stars, attempts, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (child_id, game_id, category, level_id) DO UPDATE SET
           completed = MAX(completed, excluded.completed), stars = MAX(stars, excluded.stars),
           attempts = MAX(attempts, excluded.attempts), updated_at = MAX(updated_at, excluded.updated_at)`,
        p.child_id, p.game_id, p.category, p.level_id, p.completed ? 1 : 0, p.stars, p.attempts, p.updated_at,
      );
    }
    for (const r of s.settings) {
      await ops.run(
        `INSERT INTO settings (child_id, game_id, settings, updated_at) VALUES (?, ?, ?, ?)
         ON CONFLICT (child_id, game_id) DO UPDATE SET settings = excluded.settings, updated_at = excluded.updated_at
         WHERE excluded.updated_at > settings.updated_at`,
        r.child_id, r.game_id, JSON.stringify(r.settings), r.updated_at,
      );
    }
    for (const r of s.sessions) {
      await ops.run(
        `INSERT INTO sessions (child_id, game_id, session_data, is_completed, updated_at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (child_id, game_id) DO UPDATE SET
           session_data = excluded.session_data, is_completed = excluded.is_completed, updated_at = excluded.updated_at
         WHERE excluded.updated_at > sessions.updated_at`,
        r.child_id, r.game_id, JSON.stringify(r.session_data), r.is_completed ? 1 : 0, r.updated_at,
      );
    }
    for (const r of s.rewards) {
      await ops.run(
        'INSERT OR IGNORE INTO rewards (id, child_id, game_id, reward_type, reward_data, earned_at) VALUES (?, ?, ?, ?, ?, ?)',
        r.id, r.child_id, r.game_id, r.reward_type, JSON.stringify(r.reward_data), r.earned_at,
      );
    }
  });
}
