import { DatabaseSync } from 'node:sqlite';
import { isPrivilegedKey, parseBackendConfig } from '../constants/gameConfig';
import * as repo from '../services/gameRepository';
import { getDb, useDriverForTests, type SqlDriver } from '../services/storage/localDatabase';
import { SyncManager, type RemoteApi } from '../services/storage/syncManager';
import { backoffMs, MAX_ATTEMPTS, nextItem, queueCounts } from '../services/storage/syncQueue';
import { RemoteError, secureSessionStorage, toRemoteError } from '../services/supabase/client';
import { DEFAULT_SETTINGS } from '../types/game';

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
jest.mock('expo-secure-store', () => {
  const data = new Map<string, string>();
  return {
    getItemAsync: async (k: string) => data.get(k) ?? null,
    setItemAsync: async (k: string, v: string) => {
      if (v.length > 2048) throw new Error('value too large');
      data.set(k, v);
    },
    deleteItemAsync: async (k: string) => { data.delete(k); },
    __data: data,
  };
});

function sqliteDriver(): SqlDriver {
  const db = new DatabaseSync(':memory:');
  return {
    exec: async (sql) => { db.exec(sql); },
    run: async (sql, params) => { db.prepare(sql).run(...params); },
    all: async <T,>(sql: string, params: (string | number | null)[]) => db.prepare(sql).all(...params) as T[],
  };
}

const child = { nickname: 'Ahad', ageGroup: '4-5', gender: null, avatarId: null } as const;
const NETWORK_DOWN = new RemoteError('Network request failed', null, true);

/** A fake server that remembers what it received, in order. */
function fakeRemote(overrides: Partial<RemoteApi> = {}) {
  const calls: string[] = [];
  const log = (name: string) => async () => { calls.push(name); };
  const remote: RemoteApi = {
    ensureSession: async () => ({ status: 'ready', userId: 'user-1' }),
    registerInstallation: async () => { calls.push('install'); return 'install-id'; },
    pushProfile: async (p) => { calls.push(`profile:${p.p_nickname}`); return { display_id: p.p_display_id }; },
    joinCurrentGame: log('join'),
    pushProgress: async (p) => { calls.push(`progress:${p.p_level_id}:${p.p_stars}`); },
    pushSettings: log('settings'),
    pushSession: log('session'),
    pushReward: log('reward'),
    resetGameData: log('reset'),
    deleteProfile: log('delete'),
    fetchSnapshot: async () => { calls.push('pull'); return { profiles: [], progress: [], settings: [], sessions: [], rewards: [] }; },
    ...overrides,
  };
  return { remote, calls };
}

const completion = (childId: string, levelId = 'alphabet-A', stars = 3) => ({
  childId, category: 'alphabet', levelId, stars, coins: 50, questBonus: 0,
});

const forceDue = async () => {
  await (await getDb()).run('UPDATE sync_queue SET next_attempt_at = 0');
};

describe('offline-first sync', () => {
  beforeEach(() => useDriverForTests(sqliteDriver()));

  it('saves locally with no network and with no sync manager running', async () => {
    const p = await repo.createProfile(child);
    await repo.recordCompletion(completion(p.id));
    expect((await repo.loadChildState(p.id)).solved['alphabet-A']).toBe(3);
    expect((await queueCounts(await getDb())).pending).toBeGreaterThan(0);
  });

  it('sends in order: the profile always before its progress, then pulls', async () => {
    const p = await repo.createProfile(child);
    await repo.recordCompletion(completion(p.id));
    await repo.updateProfile(p.id, { ...child, nickname: 'Renamed' });
    const { remote, calls } = fakeRemote();
    await new SyncManager(remote, true).flush();
    expect(calls[0]).toBe('install');
    expect(calls[1]).toBe('profile:Renamed'); // Latest edit, still in first position.
    expect(calls.indexOf('profile:Renamed')).toBeLessThan(calls.indexOf('progress:alphabet-A:3'));
    expect(calls[calls.length - 1]).toBe('pull');
    expect((await queueCounts(await getDb())).pending).toBe(0);
  });

  it('keeps everything queued while offline, then delivers once connected', async () => {
    const p = await repo.createProfile(child);
    await repo.recordCompletion(completion(p.id));
    const before = await queueCounts(await getDb());
    const offline = fakeRemote({
      ensureSession: async () => ({ status: 'offline', message: 'no network' }),
    });
    const manager = new SyncManager(offline.remote, true);
    await manager.flush();
    manager.stop();
    expect(manager.getStatus().state).toBe('offline');
    expect(await queueCounts(await getDb())).toEqual(before);
    const online = fakeRemote();
    await new SyncManager(online.remote, true).flush();
    expect(online.calls).toContain('progress:alphabet-A:3');
    expect((await queueCounts(await getDb())).pending).toBe(0);
  });

  it('reports when anonymous sign-in is switched off, and keeps data safe', async () => {
    const p = await repo.createProfile(child);
    const { remote, calls } = fakeRemote({
      ensureSession: async () => ({ status: 'unavailable', message: 'Anonymous sign-ins are disabled' }),
    });
    const manager = new SyncManager(remote, true);
    await manager.flush();
    manager.stop();
    expect(manager.getStatus().state).toBe('sign-in-unavailable');
    expect(calls).toEqual([]);
    expect((await repo.listProfiles())[0].id).toBe(p.id);
  });

  it('survives being killed after the server applied a change but before it was confirmed', async () => {
    const p = await repo.createProfile(child);
    await repo.recordCompletion(completion(p.id));
    const received: string[] = [];
    // First run dies when the reward is sent; the server has already stored it.
    const dying = fakeRemote({
      pushReward: async (r) => { received.push(r.id); throw NETWORK_DOWN; },
    });
    const first = new SyncManager(dying.remote, true);
    await first.flush();
    first.stop();
    // The app restarts: a new manager on the same durable queue.
    await forceDue();
    const restarted = fakeRemote({ pushReward: async (r) => { received.push(r.id); } });
    await new SyncManager(restarted.remote, true).flush();
    expect(received).toHaveLength(2);
    expect(received[0]).toBe(received[1]); // The same id, so the server stores it only once.
    expect((await queueCounts(await getDb())).pending).toBe(0);
  });

  it('retries connection failures forever with growing delays, stopping to keep order', async () => {
    const p = await repo.createProfile(child);
    const { remote, calls } = fakeRemote({ pushProfile: async () => { throw NETWORK_DOWN; } });
    const manager = new SyncManager(remote, true);
    for (let i = 0; i < MAX_ATTEMPTS + 3; i++) {
      await forceDue();
      await manager.flush();
    }
    manager.stop();
    const db = await getDb();
    expect((await queueCounts(db)).failed).toBe(0);
    expect((await nextItem(db))?.attempts).toBe(MAX_ATTEMPTS + 3);
    expect(calls).not.toContain('join'); // Nothing overtook the failing profile.
    expect(backoffMs(1)).toBe(2_000);
    expect(backoffMs(3)).toBe(8_000);
    expect(backoffMs(100)).toBe(300_000);
    expect(p.id).toBeTruthy();
  });

  it('waits out the backoff delay instead of hammering the server', async () => {
    await repo.createProfile(child);
    let attempts = 0;
    const { remote } = fakeRemote({ pushProfile: async () => { attempts++; throw NETWORK_DOWN; } });
    const manager = new SyncManager(remote, true);
    await manager.flush();
    await manager.flush();
    await manager.flush();
    manager.stop();
    expect(attempts).toBe(1);
  });

  it('sets aside a change the server keeps refusing, so later changes still get through', async () => {
    const p = await repo.createProfile(child);
    await repo.saveSettings(p.id, DEFAULT_SETTINGS);
    const refused = new RemoteError('new row violates row-level security', '42501', false);
    const { remote, calls } = fakeRemote({ joinCurrentGame: async () => { throw refused; } });
    const manager = new SyncManager(remote, true);
    for (let i = 0; i <= MAX_ATTEMPTS; i++) {
      await forceDue();
      await manager.flush();
    }
    manager.stop();
    expect(calls).toContain('settings');
    expect((await queueCounts(await getDb())).failed).toBe(1);
    expect(manager.getStatus().failed).toBe(1);
  });

  it('a Retry gives set-aside changes another chance', async () => {
    await repo.createProfile(child);
    let refuse = true;
    const { remote, calls } = fakeRemote({
      joinCurrentGame: async () => {
        if (refuse) throw new RemoteError('nope', '42501', false);
        calls.push('join');
      },
    });
    const manager = new SyncManager(remote, true);
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      await forceDue();
      await manager.flush();
    }
    expect((await queueCounts(await getDb())).failed).toBe(1);
    refuse = false;
    await manager.retryNow();
    manager.stop();
    expect(calls).toContain('join');
    expect((await queueCounts(await getDb())).failed).toBe(0);
  });

  it('does not lose an edit made while the same record is being uploaded', async () => {
    const p = await repo.createProfile(child);
    const sent: string[] = [];
    const { remote } = fakeRemote({
      pushProfile: async (payload) => {
        sent.push(payload.p_nickname);
        if (sent.length === 1) await repo.updateProfile(p.id, { ...child, nickname: 'Edited' });
        return { display_id: payload.p_display_id };
      },
    });
    const manager = new SyncManager(remote, true);
    await manager.flush();
    manager.stop();
    await new SyncManager(remote, true).flush();
    expect(sent).toEqual(['Ahad', 'Edited']);
  });

  it('coalesces repeat saves of one record into a single upload', async () => {
    const p = await repo.createProfile(child);
    for (const stars of [1, 2, 3]) await repo.recordCompletion(completion(p.id, 'alphabet-A', stars));
    const { remote, calls } = fakeRemote();
    await new SyncManager(remote, true).flush();
    expect(calls.filter((c) => c.startsWith('progress:'))).toEqual(['progress:alphabet-A:3']);
    expect(calls.filter((c) => c === 'reward')).toHaveLength(3); // Each reward is real and separate.
  });

  it('a reset cannot be undone by older writes still in the queue', async () => {
    const p = await repo.createProfile(child);
    await repo.recordCompletion(completion(p.id));
    await repo.resetGameProgress(p.id);
    const { remote, calls } = fakeRemote();
    await new SyncManager(remote, true).flush();
    expect(calls).toContain('reset');
    expect(calls.some((c) => c.startsWith('progress:'))).toBe(false);
    expect((await repo.loadChildState(p.id)).solved).toEqual({});
  });

  it('play after a reset does reach the cloud', async () => {
    const p = await repo.createProfile(child);
    await repo.resetGameProgress(p.id);
    await repo.recordCompletion(completion(p.id, 'alphabet-B'));
    const { remote, calls } = fakeRemote();
    await new SyncManager(remote, true).flush();
    expect(calls.indexOf('reset')).toBeLessThan(calls.indexOf('progress:alphabet-B:3'));
  });

  it('deleting a child drops its queued work and deletes it remotely', async () => {
    const p = await repo.createProfile(child);
    await repo.recordCompletion(completion(p.id));
    await repo.deleteProfile(p.id);
    const { remote, calls } = fakeRemote();
    await new SyncManager(remote, true).flush();
    expect(calls).toEqual(['install', 'delete', 'pull']);
    expect(await repo.listProfiles()).toEqual([]);
    expect((await repo.loadChildState(p.id)).solved).toEqual({});
  });

  it('adopts a Child ID re-issued by the server after a collision', async () => {
    const p = await repo.createProfile(child);
    const changed = jest.fn();
    const { remote } = fakeRemote({ pushProfile: async () => ({ display_id: 'PW-NEW222' }) });
    const manager = new SyncManager(remote, true);
    manager.onDataChanged(changed);
    await manager.flush();
    expect((await repo.listProfiles())[0].displayId).toBe('PW-NEW222');
    expect(changed).toHaveBeenCalled();
    expect(p.displayId).not.toBe('PW-NEW222');
  });

  it('never pulls over unsent changes', async () => {
    const p = await repo.createProfile(child);
    const { remote, calls } = fakeRemote({ joinCurrentGame: async () => { throw NETWORK_DOWN; } });
    const manager = new SyncManager(remote, true);
    await manager.flush();
    manager.stop();
    expect(calls).not.toContain('pull');
    expect(p.id).toBeTruthy();
  });

  it('merges cloud data without losing newer local data or queueing it back up', async () => {
    const p = await repo.createProfile(child);
    await repo.recordCompletion(completion(p.id, 'alphabet-A', 3));
    await repo.saveSettings(p.id, { ...DEFAULT_SETTINGS, sound_enabled: false });
    const { gameConfig } = jest.requireActual('../constants/gameConfig');
    const game = gameConfig.gameId;
    const db = await getDb();
    await db.run('DELETE FROM sync_queue');
    await repo.applyRemoteSnapshot({
      profiles: [{
        id: p.id, installation_id: 'i', display_id: p.displayId, nickname: 'Stale', gender: null, date_of_birth: null,
        age_group: '4-5', avatar_id: null, created_at: p.createdAt, updated_at: '2020-01-01T00:00:00Z',
      }],
      progress: [
        { child_id: p.id, game_id: game, category: 'alphabet', level_id: 'alphabet-A', completed: false, stars: 1, attempts: 9, updated_at: '2020-01-01T00:00:00Z' },
        { child_id: p.id, game_id: game, category: 'alphabet', level_id: 'alphabet-B', completed: true, stars: 2, attempts: 1, updated_at: '2020-01-01T00:00:00Z' },
      ],
      settings: [{ child_id: p.id, game_id: game, settings: { sound_enabled: true }, updated_at: '2020-01-01T00:00:00Z' }],
      sessions: [],
      rewards: [{ id: 'r1', child_id: p.id, game_id: game, reward_type: 'coins', reward_data: { amount: 7 }, earned_at: '2020-01-01T00:00:00Z' }],
    });
    await repo.applyRemoteSnapshot({
      profiles: [], progress: [], settings: [], sessions: [],
      rewards: [{ id: 'r1', child_id: p.id, game_id: game, reward_type: 'coins', reward_data: { amount: 7 }, earned_at: '2020-01-01T00:00:00Z' }],
    });
    const state = await repo.loadChildState(p.id);
    expect((await repo.listProfiles())[0].nickname).toBe('Ahad'); // Older cloud edit ignored.
    expect(state.solved).toEqual({ 'alphabet-A': 3, 'alphabet-B': 2 }); // Best of both.
    expect(state.settings.sound_enabled).toBe(false); // Newer local setting kept.
    expect(state.coins).toBe(57); // Reward added exactly once.
    expect((await queueCounts(db)).pending).toBe(0);
  });

  it('keeps game data separate in local storage', async () => {
    const p = await repo.createProfile(child);
    const db = await getDb();
    await db.run(
      "INSERT INTO progress (child_id, game_id, category, level_id, completed, stars, attempts, updated_at) VALUES (?, 'other-game', 'alphabet', 'alphabet-Z', 1, 3, 1, '2026-01-01')",
      p.id,
    );
    expect((await repo.loadChildState(p.id)).solved).toEqual({});
  });

  it('with no backend configured it stays local-only and never calls out', async () => {
    await repo.createProfile(child);
    const { remote, calls } = fakeRemote();
    const manager = new SyncManager(remote, false);
    await manager.flush();
    expect(calls).toEqual([]);
    expect(manager.getStatus().state).toBe('local-only');
    expect(manager.getStatus().pending).toBeGreaterThan(0);
  });
});

describe('configuration safety', () => {
  const jwt = (role: string) => `eyJhbGciOiJIUzI1NiJ9.${btoa(JSON.stringify({ role }))}.sig`;
  const GOOD = '58ba888d-0743-42ac-8089-5e53abb1bcab';
  const URL = 'https://example.supabase.co';
  beforeEach(() => jest.spyOn(console, 'error').mockImplementation(() => undefined));
  afterEach(() => jest.restoreAllMocks());

  it('refuses privileged keys', () => {
    expect(isPrivilegedKey('sb_secret_abc')).toBe(true);
    expect(isPrivilegedKey(jwt('service_role'))).toBe(true);
    expect(isPrivilegedKey(jwt('anon'))).toBe(false);
    expect(isPrivilegedKey('sb_publishable_abc')).toBe(false);
    expect(parseBackendConfig(URL, 'sb_secret_abc', GOOD)).toBeNull();
    expect(parseBackendConfig(URL, jwt('service_role'), GOOD)).toBeNull();
  });

  it('needs every value, and valid ones', () => {
    expect(parseBackendConfig(URL, 'sb_publishable_abc', GOOD)).not.toBeNull();
    expect(parseBackendConfig(undefined, 'k', GOOD)).toBeNull();
    expect(parseBackendConfig(URL, undefined, GOOD)).toBeNull();
    expect(parseBackendConfig(URL, 'k', undefined)).toBeNull();
    expect(parseBackendConfig(URL, 'k', 'not-a-uuid')).toBeNull();
    expect(parseBackendConfig('http://insecure.example', 'k', GOOD)).toBeNull();
  });

  it('classifies errors: only definite database refusals are permanent', () => {
    expect(toRemoteError({ message: 'TypeError: Network request failed', code: '' }).transient).toBe(true);
    expect(toRemoteError({ message: 'JWT expired', code: 'PGRST301' }).transient).toBe(true);
    expect(toRemoteError({ message: 'too many connections', code: '53300' }).transient).toBe(true);
    expect(toRemoteError({ message: 'rls', code: '42501' }).transient).toBe(false);
    expect(toRemoteError({ message: 'check', code: '23514' }).transient).toBe(false);
  });
});

describe('secure session storage', () => {
  it('round-trips a session bigger than one secure-store entry, and cleans up', async () => {
    const big = 'x'.repeat(5000);
    await secureSessionStorage.setItem('session', big);
    expect(await secureSessionStorage.getItem('session')).toBe(big);
    await secureSessionStorage.setItem('session', 'short');
    expect(await secureSessionStorage.getItem('session')).toBe('short');
    const data = jest.requireMock('expo-secure-store').__data as Map<string, string>;
    expect([...data.keys()].filter((k) => k.startsWith('session.') && k !== 'session.chunks')).toEqual(['session.0']);
    await secureSessionStorage.removeItem('session');
    expect(await secureSessionStorage.getItem('session')).toBeNull();
    expect(data.size).toBe(0);
  });
});
