import { AppState } from 'react-native';
import { isCloudConfigured } from '../../constants/gameConfig';
import {
  applyRemoteSnapshot, applyServerDisplayId, setLocalWriteListener, type RemoteSnapshot,
} from '../gameRepository';
import { ensureSession, registerInstallation, type AuthOutcome } from '../supabase/auth';
import { RemoteError } from '../supabase/client';
import { deleteRemoteProfile, fetchProfiles, joinCurrentGame, pushProfile, type ProfilePayload } from '../supabase/profiles';
import { fetchProgress, pushProgress, resetRemoteGameData, type ProgressPayload } from '../supabase/progress';
import { fetchRewards, pushReward, type RewardPayload } from '../supabase/rewards';
import { fetchSessions, pushSession, type SessionPayload } from '../supabase/sessions';
import { fetchSettings, pushSettings, type SettingsPayload } from '../supabase/settings';
import { getDb } from './localDatabase';
import { markDone, markFailed, nextItem, queueCounts, reviveFailed, type QueueItem } from './syncQueue';

/**
 * Pushes the local queue to the cloud in order, then merges cloud data back down.
 *
 * Guarantees:
 *  - Gameplay never waits on this: all writes land in SQLite first.
 *  - Being killed at any point is safe. An item leaves the queue only after the server confirmed
 *    it, and every server write is idempotent, so a repeat send changes nothing.
 *  - Items go strictly in order, so a child's profile always exists before its progress.
 *  - Cloud data is pulled only when the queue is empty, so a pull can't undo an unsent change.
 */
export type SyncState = 'local-only' | 'idle' | 'syncing' | 'offline' | 'sign-in-unavailable' | 'error';

export interface SyncStatus {
  state: SyncState;
  pending: number;
  failed: number;
  lastSyncedAt: string | null;
  lastError: string | null;
}

/** The cloud side, swappable so failure handling can be tested without a network. */
export interface RemoteApi {
  ensureSession(): Promise<AuthOutcome>;
  registerInstallation(): Promise<string>;
  pushProfile(p: ProfilePayload): Promise<{ display_id: string }>;
  joinCurrentGame(childId: string): Promise<void>;
  pushProgress(p: ProgressPayload): Promise<void>;
  pushSettings(p: SettingsPayload): Promise<void>;
  pushSession(p: SessionPayload): Promise<void>;
  pushReward(p: RewardPayload): Promise<void>;
  resetGameData(childId: string): Promise<void>;
  deleteProfile(id: string): Promise<void>;
  fetchSnapshot(): Promise<RemoteSnapshot>;
}

export const supabaseRemote: RemoteApi = {
  ensureSession,
  registerInstallation,
  pushProfile,
  joinCurrentGame,
  pushProgress,
  pushSettings,
  pushSession,
  pushReward,
  resetGameData: resetRemoteGameData,
  deleteProfile: deleteRemoteProfile,
  fetchSnapshot: async () => {
    const [profiles, progress, settings, sessions, rewards] = await Promise.all([
      fetchProfiles(), fetchProgress(), fetchSettings(), fetchSessions(), fetchRewards(),
    ]);
    return { profiles, progress, settings, sessions, rewards };
  },
};

const WRITE_DEBOUNCE_MS = 800;
const AUTH_RETRY_MS = 60_000;

export class SyncManager {
  private status: SyncStatus = { state: 'idle', pending: 0, failed: 0, lastSyncedAt: null, lastError: null };
  private listeners = new Set<(s: SyncStatus) => void>();
  private dataListeners = new Set<() => void>();
  private running: Promise<void> | null = null;
  private rerun = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private registeredFor: string | null = null;
  private wantPull = true;
  private stopFns: (() => void)[] = [];

  constructor(
    private readonly remote: RemoteApi = supabaseRemote,
    private readonly enabled: boolean = isCloudConfigured,
  ) {
    if (!enabled) this.status.state = 'local-only';
  }

  getStatus = () => this.status;

  subscribe(fn: (s: SyncStatus) => void) {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }

  /** Fires when cloud data changed local rows, so the UI should reload. */
  onDataChanged(fn: () => void) {
    this.dataListeners.add(fn);
    return () => { this.dataListeners.delete(fn); };
  }

  private setStatus(patch: Partial<SyncStatus>) {
    this.status = { ...this.status, ...patch };
    this.listeners.forEach((fn) => fn(this.status));
  }

  private async refreshCounts() {
    const counts = await queueCounts(await getDb());
    this.setStatus(counts);
    return counts;
  }

  /** Begins syncing and starts listening for moments worth retrying. */
  start() {
    setLocalWriteListener(() => this.schedule(WRITE_DEBOUNCE_MS));
    if (this.stopFns.length) return;
    const appState = AppState.addEventListener('change', (s) => {
      if (s === 'active') this.schedule(0);
    });
    this.stopFns.push(() => appState.remove());
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Network = require('expo-network') as typeof import('expo-network');
      const sub = Network.addNetworkStateListener((n) => {
        if (n.isConnected !== false && n.isInternetReachable !== false) this.schedule(0);
      });
      this.stopFns.push(() => sub.remove());
    } catch {
      // Retries still happen on backoff timers and when the app returns to the foreground.
    }
    this.schedule(0);
  }

  stop() {
    this.stopFns.forEach((fn) => fn());
    this.stopFns = [];
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  schedule(delayMs: number) {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      this.flush().catch(() => undefined);
    }, delayMs);
  }

  /** A parent pressed Retry: also revive anything set aside. */
  async retryNow() {
    await reviveFailed(await getDb());
    this.wantPull = true;
    await this.flush();
  }

  requestPull() {
    this.wantPull = true;
  }

  /** One sync pass. Concurrent calls join the running pass and trigger one more after it. */
  flush(): Promise<void> {
    if (!this.running) {
      this.running = this.pass().finally(() => {
        this.running = null;
        if (this.rerun) {
          this.rerun = false;
          this.schedule(0);
        }
      });
    } else {
      this.rerun = true;
    }
    return this.running;
  }

  private async pass() {
    if (!this.enabled) {
      await this.refreshCounts();
      this.setStatus({ state: 'local-only' });
      return;
    }
    const db = await getDb();
    this.setStatus({ state: 'syncing' });

    let auth: AuthOutcome;
    try {
      auth = await this.remote.ensureSession();
    } catch (e) {
      auth = { status: 'offline', message: (e as Error).message };
    }
    if (auth.status !== 'ready') {
      await this.refreshCounts();
      this.setStatus({
        state: auth.status === 'offline' ? 'offline' : 'sign-in-unavailable',
        lastError: auth.message,
      });
      this.schedule(AUTH_RETRY_MS);
      return;
    }

    try {
      if (this.registeredFor !== auth.userId) {
        await this.remote.registerInstallation();
        this.registeredFor = auth.userId;
        this.wantPull = true;
      }

      for (;;) {
        const item = await nextItem(db);
        if (!item) break;
        const wait = item.next_attempt_at - Date.now();
        if (wait > 0) {
          await this.refreshCounts();
          this.setStatus({ state: item.attempts ? 'error' : 'idle' });
          this.schedule(wait);
          return;
        }
        try {
          await this.send(item);
          await markDone(db, item);
        } catch (e) {
          const err = e instanceof RemoteError ? e : new RemoteError((e as Error).message, null, true);
          await markFailed(db, item, err.message, err.transient);
          this.setStatus({ lastError: err.message });
          // Stop here to keep order. nextItem's backoff check decides when to resume.
          this.schedule(0);
          return;
        }
      }

      if (this.wantPull) {
        const snapshot = await this.remote.fetchSnapshot();
        await applyRemoteSnapshot(snapshot);
        this.wantPull = false;
        this.dataListeners.forEach((fn) => fn());
      }
      await this.refreshCounts();
      this.setStatus({ state: 'idle', lastSyncedAt: new Date().toISOString(), lastError: null });
    } catch (e) {
      const err = e as RemoteError;
      await this.refreshCounts();
      this.setStatus({ state: err.transient === false ? 'error' : 'offline', lastError: err.message });
      this.schedule(AUTH_RETRY_MS);
    }
  }

  private async send(item: QueueItem) {
    const payload = JSON.parse(item.payload);
    switch (item.op) {
      case 'profile': {
        const row = await this.remote.pushProfile(payload as ProfilePayload);
        if (await applyServerDisplayId((payload as ProfilePayload).p_id, row.display_id)) {
          this.dataListeners.forEach((fn) => fn());
        }
        return;
      }
      case 'join_game':
        return this.remote.joinCurrentGame((payload as { p_child_id: string }).p_child_id);
      case 'progress':
        return this.remote.pushProgress(payload as ProgressPayload);
      case 'settings':
        return this.remote.pushSettings(payload as SettingsPayload);
      case 'session':
        return this.remote.pushSession(payload as SessionPayload);
      case 'reward':
        return this.remote.pushReward(payload as RewardPayload);
      case 'reset':
        return this.remote.resetGameData((payload as { p_child_id: string }).p_child_id);
      case 'delete_profile':
        return this.remote.deleteProfile((payload as { id: string }).id);
    }
  }
}

export const syncManager = new SyncManager();
