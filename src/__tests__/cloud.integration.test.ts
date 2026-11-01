/**
 * End-to-end against the real Supabase project, with real logins and real RLS.
 * Skipped unless asked for:   npm run test:cloud
 *
 * It creates temporary test users and a temporary game, and removes them afterwards. The admin
 * key is read from .env.local only by this test, to create and clean up those records. All the
 * code under test uses the publishable key, exactly like the app.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomBytes, randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import { DatabaseSync } from 'node:sqlite';
import { join } from 'path';
import { runInThisContext } from 'vm';

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('expo-crypto', () => ({
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  randomUUID: () => require('crypto').randomUUID(),
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  getRandomBytes: (n: number) => require('crypto').randomBytes(n),
}));

const RUN = process.env.RUN_CLOUD_TESTS === '1';
// jest-expo replaces fetch with a stub. This reaches Node's real one, outside the test sandbox.
const realFetch = runInThisContext('fetch') as typeof fetch;
const env: Record<string, string> = {};
if (RUN) {
  for (const line of readFileSync(join(__dirname, '..', '..', '.env.local'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m) env[m[1]] = m[2].trim().replace(/^"|"$/g, '');
  }
  Object.assign(process.env, {
    EXPO_PUBLIC_SUPABASE_URL: env.EXPO_PUBLIC_SUPABASE_URL,
    EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    EXPO_PUBLIC_GAME_UUID: env.EXPO_PUBLIC_GAME_UUID,
  });
}

// Required after the environment is set, because gameConfig reads it on load.
/* eslint-disable @typescript-eslint/no-require-imports */
const load = () => ({
  repo: require('../services/gameRepository') as typeof import('../services/gameRepository'),
  db: require('../services/storage/localDatabase') as typeof import('../services/storage/localDatabase'),
  sync: require('../services/storage/syncManager') as typeof import('../services/storage/syncManager'),
  queue: require('../services/storage/syncQueue') as typeof import('../services/storage/syncQueue'),
  client: require('../services/supabase/client') as typeof import('../services/supabase/client'),
  auth: require('../services/supabase/auth') as typeof import('../services/supabase/auth'),
  games: require('../services/supabase/games') as typeof import('../services/supabase/games'),
});
/* eslint-enable @typescript-eslint/no-require-imports */

const newDriver = () => {
  const db = new DatabaseSync(':memory:');
  return {
    exec: async (sql: string) => { db.exec(sql); },
    run: async (sql: string, params: (string | number | null)[]) => { db.prepare(sql).run(...params); },
    all: async <T,>(sql: string, params: (string | number | null)[]) => db.prepare(sql).all(...params) as T[],
  };
};

(RUN ? describe : describe.skip)('real Supabase project', () => {
  const m = RUN ? load() : ({} as ReturnType<typeof load>);
  const GAME = () => env.EXPO_PUBLIC_GAME_UUID;
  const child = { nickname: 'Integration', ageGroup: '4-5', gender: null, avatarId: 'lion' } as const;

  let admin: SupabaseClient;
  let userA: SupabaseClient;
  let userB: SupabaseClient;
  const createdUsers: string[] = [];
  let otherGameId: string | null = null;
  let online = true;

  const appClient = () =>
    createClient(env.EXPO_PUBLIC_SUPABASE_URL, env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        // Stands in for the radio being off: the real request never leaves.
        fetch: (input, init) => (online ? realFetch(input, init) : Promise.reject(new TypeError('Network request failed'))),
      },
    });

  const signedIn = async () => {
    const email = `pw-test-${randomUUID()}@example.invalid`;
    const password = randomBytes(24).toString('base64url');
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw error;
    createdUsers.push(data.user.id);
    const c = appClient();
    const { error: signInError } = await c.auth.signInWithPassword({ email, password });
    if (signInError) throw signInError;
    return c;
  };

  beforeAll(async () => {
    admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: realFetch },
    });
    userA = await signedIn();
    userB = await signedIn();
  }, 30000);

  afterAll(async () => {
    m.client.useClientForTests(null);
    for (const id of createdUsers) await admin.auth.admin.deleteUser(id);
    if (otherGameId) await admin.from('games').delete().eq('id', otherGameId);
    const { count } = await admin.from('child_profiles').select('*', { count: 'exact', head: true }).eq('nickname', child.nickname);
    expect(count).toBe(0);
  }, 30000);

  beforeEach(() => {
    online = true;
    m.db.useDriverForTests(newDriver());
    m.client.useClientForTests(userA);
  });

  const manager = () => new m.sync.SyncManager(m.sync.supabaseRemote, true);
  const flush = async () => {
    const s = manager();
    await s.flush();
    s.stop();
    return s;
  };

  it('finds the PuzzleWala game in the registry, active', async () => {
    const game = await m.games.fetchCurrentGame();
    expect(game?.slug).toBe('puzzlewala');
    expect(game?.status).toBe('active');
  });

  it('plays offline, then syncs everything when the network returns', async () => {
    online = false;
    const p = await m.repo.createProfile(child);
    await m.repo.saveSettings(p.id, { ...require('../types/game').DEFAULT_SETTINGS, fullscreen_enabled: true });
    await m.repo.recordCompletion({ childId: p.id, category: 'alphabet', levelId: 'alphabet-A', stars: 3, coins: 50, questBonus: 0, badgeId: 'first' });
    const offline = await flush();
    expect(offline.getStatus().state).toBe('offline');
    expect(offline.getStatus().pending).toBeGreaterThan(0);
    expect((await m.repo.loadChildState(p.id)).solved['alphabet-A']).toBe(3);

    online = true;
    await (await m.db.getDb()).run('UPDATE sync_queue SET next_attempt_at = 0');
    const after = await flush();
    expect(after.getStatus()).toMatchObject({ state: 'idle', pending: 0, failed: 0 });

    const { data: profile } = await userA.from('child_profiles').select('*').eq('id', p.id).single();
    expect(profile.nickname).toBe('Integration');
    expect(profile.display_id).toBe(p.displayId);
    const { data: progress } = await userA.from('game_progress').select('*').eq('child_id', p.id).eq('game_id', GAME());
    expect(progress).toHaveLength(1);
    expect(progress![0]).toMatchObject({ level_id: 'alphabet-A', stars: 3, completed: true, attempts: 1 });
    const { data: rewards } = await userA.from('game_rewards').select('*').eq('child_id', p.id);
    expect(rewards!.map((r) => r.reward_type).sort()).toEqual(['badge', 'coins']);
    const { data: settings } = await userA.from('game_settings').select('*').eq('child_id', p.id).single();
    expect(settings.settings.fullscreen_enabled).toBe(true);
    const { data: join } = await userA.from('game_child_profiles').select('*').eq('child_id', p.id);
    expect(join).toHaveLength(1);
  }, 30000);

  it('a resent upload after a lost response creates no duplicates', async () => {
    const p = await m.repo.createProfile(child);
    await m.repo.recordCompletion({ childId: p.id, category: 'alphabet', levelId: 'alphabet-B', stars: 2, coins: 50, questBonus: 0 });
    const db = await m.db.getDb();
    const queued = await db.all<{ op: string; entity_key: string | null; child_id: string | null; payload: string }>('SELECT op, entity_key, child_id, payload FROM sync_queue');
    await flush();
    // As if the app died before recording success: the identical queue is sent again.
    for (const q of queued) {
      await db.run('INSERT INTO sync_queue (op, entity_key, child_id, payload, created_at) VALUES (?, ?, ?, ?, ?)', q.op, q.entity_key, q.child_id, q.payload, 'now');
    }
    const again = await flush();
    expect(again.getStatus()).toMatchObject({ pending: 0, failed: 0 });
    const { data: progress } = await userA.from('game_progress').select('stars, attempts').eq('child_id', p.id);
    expect(progress).toEqual([{ stars: 2, attempts: 1 }]);
    const { data: rewards } = await userA.from('game_rewards').select('id').eq('child_id', p.id);
    expect(rewards).toHaveLength(1);
  }, 30000);

  it('an older write arriving late does not overwrite newer cloud data', async () => {
    const p = await m.repo.createProfile(child);
    await flush();
    await m.repo.updateProfile(p.id, { ...child, nickname: 'Newer' });
    await flush();
    const { error } = await userA.rpc('sync_child_profile', {
      p_id: p.id, p_display_id: p.displayId, p_nickname: 'Older', p_gender: null, p_date_of_birth: null,
      p_age_group: '4-5', p_avatar_id: null, p_created_at: p.createdAt, p_updated_at: '2020-01-01T00:00:00Z',
    });
    expect(error).toBeNull();
    const { data } = await userA.from('child_profiles').select('nickname').eq('id', p.id).single();
    expect(data!.nickname).toBe('Newer');
    await m.repo.updateProfile(p.id, child);
    await flush();
  }, 30000);

  it('restores a wiped device from the cloud, including an unfinished puzzle', async () => {
    const p = await m.repo.createProfile(child);
    await m.repo.recordCompletion({ childId: p.id, category: 'numbers', levelId: 'numbers-1', stars: 3, coins: 50, questBonus: 30 });
    const session = {
      current_category: 'numbers', current_level: 'numbers-2', placed_piece_ids: [0], remaining_piece_ids: [1, 2, 3],
      puzzle_progress: 0.25, current_score: 3, misses: 0, cols: 2, rows: 2,
    };
    await m.repo.saveSession(p.id, session);
    await flush();

    m.db.useDriverForTests(newDriver()); // A new empty local database, same login.
    expect(await m.repo.listProfiles()).toEqual([]);
    await flush();
    const restored = (await m.repo.listProfiles()).find((x) => x.id === p.id);
    expect(restored?.displayId).toBe(p.displayId);
    const state = await m.repo.loadChildState(p.id);
    expect(state.solved).toEqual({ 'numbers-1': 3 });
    expect(state.coins).toBe(80);
    expect(state.session).toEqual(session);
  }, 30000);

  it('never lets another user read or change this data', async () => {
    const p = await m.repo.createProfile(child);
    await m.repo.recordCompletion({ childId: p.id, category: 'alphabet', levelId: 'alphabet-C', stars: 3, coins: 50, questBonus: 0 });
    await flush();

    for (const table of ['game_progress', 'game_rewards', 'game_settings', 'game_sessions', 'game_child_profiles']) {
      const { data } = await userB.from(table).select('*').eq('child_id', p.id);
      expect(data).toEqual([]);
    }
    const { data: byId } = await userB.from('child_profiles').select('*').eq('id', p.id);
    expect(byId).toEqual([]);
    const { data: byChildId } = await userB.from('child_profiles').select('*').eq('display_id', p.displayId);
    expect(byChildId).toEqual([]);

    const { error: writeError } = await userB.rpc('merge_game_progress', {
      p_child_id: p.id, p_game_id: GAME(), p_category: 'alphabet', p_level_id: 'alphabet-Z',
      p_completed: true, p_stars: 3, p_attempts: 1, p_updated_at: new Date().toISOString(),
    });
    expect(writeError?.code).toBe('42501');
    await userB.from('child_profiles').delete().eq('id', p.id);
    const { data: stillThere } = await userA.from('child_profiles').select('id').eq('id', p.id);
    expect(stillThere).toHaveLength(1);
  }, 30000);

  it('signed-out callers and client registry writes are refused', async () => {
    const anon = createClient(env.EXPO_PUBLIC_SUPABASE_URL, env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false }, global: { fetch: realFetch } });
    const { error: readError } = await anon.from('child_profiles').select('*');
    expect(readError).not.toBeNull();
    const { error: insertError } = await userA.from('games').insert({ name: 'Hack', slug: 'hack-game' });
    expect(insertError?.code).toBe('42501');
  }, 30000);

  it('isolates games: another game\'s data is never pulled, and survives a reset here', async () => {
    const p = await m.repo.createProfile(child);
    await m.repo.recordCompletion({ childId: p.id, category: 'alphabet', levelId: 'alphabet-D', stars: 3, coins: 50, questBonus: 0 });
    await flush();

    const { data: game, error: gameError } = await admin.from('games')
      .insert({ name: 'Integration Game', slug: `pw-test-${Date.now()}` }).select('id').single();
    expect(gameError).toBeNull();
    otherGameId = game!.id;
    const { error: otherError } = await userA.rpc('merge_game_progress', {
      p_child_id: p.id, p_game_id: otherGameId, p_category: 'other', p_level_id: 'other-1',
      p_completed: true, p_stars: 1, p_attempts: 1, p_updated_at: new Date().toISOString(),
    });
    expect(otherError).toBeNull();

    m.db.useDriverForTests(newDriver());
    await flush();
    expect((await m.repo.loadChildState(p.id)).solved).toEqual({ 'alphabet-D': 3 });
    const db = await m.db.getDb();
    expect(await db.all('SELECT 1 FROM progress WHERE game_id = ?', otherGameId)).toEqual([]);

    await m.repo.resetGameProgress(p.id);
    await flush();
    const { data: here } = await userA.from('game_progress').select('id').eq('child_id', p.id).eq('game_id', GAME());
    const { data: there } = await userA.from('game_progress').select('id').eq('child_id', p.id).eq('game_id', otherGameId);
    expect(here).toEqual([]);
    expect(there).toHaveLength(1);
  }, 30000);

  it('deleting a child removes it and its data from the cloud', async () => {
    const p = await m.repo.createProfile(child);
    await m.repo.recordCompletion({ childId: p.id, category: 'alphabet', levelId: 'alphabet-E', stars: 3, coins: 50, questBonus: 0 });
    await flush();
    await m.repo.deleteProfile(p.id);
    const s = await flush();
    expect(s.getStatus()).toMatchObject({ pending: 0, failed: 0 });
    const { data: profile } = await admin.from('child_profiles').select('id').eq('id', p.id);
    const { data: progress } = await admin.from('game_progress').select('id').eq('child_id', p.id);
    expect(profile).toEqual([]);
    expect(progress).toEqual([]);
  }, 30000);

  it('anonymous sign-in: reports the project setting honestly', async () => {
    const fresh = appClient();
    m.client.useClientForTests(fresh);
    const outcome = await m.auth.ensureSession();
    if (outcome.status === 'ready') {
      createdUsers.push(outcome.userId);
      const { data } = await admin.auth.admin.getUserById(outcome.userId);
      expect(data.user?.is_anonymous).toBe(true);
      // The saved session is reused rather than creating another user.
      expect(await m.auth.ensureSession()).toEqual(outcome);
      const installation = await m.auth.registerInstallation();
      const { data: row } = await admin.from('app_installations').select('owner_user_id').eq('id', installation).single();
      expect(row!.owner_user_id).toBe(outcome.userId);
      console.log('Anonymous sign-in: ENABLED and working');
    } else {
      expect(outcome.status).toBe('unavailable');
      console.log('Anonymous sign-in: DISABLED in the project ->', outcome.message);
    }
  }, 30000);
});
