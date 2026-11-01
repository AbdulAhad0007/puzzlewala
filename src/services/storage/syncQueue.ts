import type { SqlOps } from './localDatabase';

/** The durable list of changes waiting to reach the cloud. It survives the app being killed. */
export type SyncOp =
  | 'profile' | 'join_game' | 'progress' | 'settings' | 'session' | 'reward' | 'reset' | 'delete_profile';

export interface QueueItem {
  id: number;
  op: SyncOp;
  entity_key: string | null;
  child_id: string | null;
  payload: string;
  revision: number;
  attempts: number;
  next_attempt_at: number;
  last_error: string | null;
  dead: number;
}

export const MAX_ATTEMPTS = 8;
const BASE_DELAY_MS = 2_000;
const MAX_DELAY_MS = 5 * 60_000;

/** Exponential backoff: 2s, 4s, 8s, up to 5 minutes. */
export const backoffMs = (attempts: number) =>
  Math.min(BASE_DELAY_MS * 2 ** Math.max(attempts - 1, 0), MAX_DELAY_MS);

/**
 * Adds a change. Changes with an `entityKey` are full snapshots, so a newer one replaces the
 * pending one in place: it keeps its queue position, so a profile always syncs before the
 * progress that depends on it.
 */
export async function enqueue(
  ops: SqlOps,
  op: SyncOp,
  childId: string | null,
  entityKey: string | null,
  payload: unknown,
): Promise<void> {
  const json = JSON.stringify(payload);
  if (entityKey) {
    const [existing] = await ops.all<{ id: number }>(
      'SELECT id FROM sync_queue WHERE entity_key = ? AND dead = 0 LIMIT 1', entityKey,
    );
    if (existing) {
      await ops.run(
        'UPDATE sync_queue SET payload = ?, revision = revision + 1, attempts = 0, next_attempt_at = 0, last_error = NULL WHERE id = ?',
        json, existing.id,
      );
      return;
    }
  }
  await ops.run(
    'INSERT INTO sync_queue (op, entity_key, child_id, payload, created_at) VALUES (?, ?, ?, ?, ?)',
    op, entityKey, childId, json, new Date().toISOString(),
  );
}

/** Drops a child's pending changes that a later reset or delete makes pointless. */
export async function purgeForChild(ops: SqlOps, childId: string, only?: SyncOp[]): Promise<void> {
  if (!only) {
    await ops.run('DELETE FROM sync_queue WHERE child_id = ?', childId);
    return;
  }
  await ops.run(
    `DELETE FROM sync_queue WHERE child_id = ? AND op IN (${only.map(() => '?').join(',')})`,
    childId, ...only,
  );
}

export async function nextItem(ops: SqlOps): Promise<QueueItem | null> {
  const [item] = await ops.all<QueueItem>('SELECT * FROM sync_queue WHERE dead = 0 ORDER BY id LIMIT 1');
  return item ?? null;
}

/** Removes a sent item, unless a newer change replaced its payload while it was in flight. */
export async function markDone(ops: SqlOps, item: QueueItem): Promise<void> {
  await ops.run('DELETE FROM sync_queue WHERE id = ? AND revision = ?', item.id, item.revision);
}

/**
 * Records a failure. Connection problems retry forever. A change the server keeps rejecting is
 * set aside after MAX_ATTEMPTS, so it can't block every later change; local data keeps it.
 */
export async function markFailed(
  ops: SqlOps,
  item: QueueItem,
  error: string,
  transient: boolean,
  now: number = Date.now(),
): Promise<void> {
  const attempts = item.attempts + 1;
  const dead = !transient && attempts >= MAX_ATTEMPTS ? 1 : 0;
  await ops.run(
    'UPDATE sync_queue SET attempts = ?, next_attempt_at = ?, last_error = ?, dead = ? WHERE id = ? AND revision = ?',
    attempts, now + backoffMs(attempts), error.slice(0, 300), dead, item.id, item.revision,
  );
}

export async function queueCounts(ops: SqlOps): Promise<{ pending: number; failed: number }> {
  const [row] = await ops.all<{ pending: number; failed: number }>(
    'SELECT COALESCE(SUM(dead = 0), 0) AS pending, COALESCE(SUM(dead = 1), 0) AS failed FROM sync_queue',
  );
  return row;
}

/** Gives set-aside changes another chance when a parent presses Retry. */
export async function reviveFailed(ops: SqlOps): Promise<void> {
  await ops.run('UPDATE sync_queue SET dead = 0, attempts = 0, next_attempt_at = 0 WHERE dead = 1');
}
