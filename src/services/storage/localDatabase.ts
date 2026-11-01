/** Structured local storage. SQLite is the app's source of truth; the cloud is a synced copy. */
export type SqlValue = string | number | null;

export interface SqlDriver {
  exec(sql: string): Promise<void>;
  run(sql: string, params: SqlValue[]): Promise<void>;
  all<T>(sql: string, params: SqlValue[]): Promise<T[]>;
}

const SCHEMA_VERSION = 1;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY NOT NULL, display_id TEXT NOT NULL, nickname TEXT NOT NULL,
  gender TEXT, date_of_birth TEXT, age_group TEXT, avatar_id TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS progress (
  child_id TEXT NOT NULL, game_id TEXT NOT NULL, category TEXT NOT NULL, level_id TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0, stars INTEGER NOT NULL DEFAULT 0,
  attempts INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL,
  PRIMARY KEY (child_id, game_id, category, level_id)
);
CREATE TABLE IF NOT EXISTS settings (
  child_id TEXT NOT NULL, game_id TEXT NOT NULL, settings TEXT NOT NULL, updated_at TEXT NOT NULL,
  PRIMARY KEY (child_id, game_id)
);
CREATE TABLE IF NOT EXISTS sessions (
  child_id TEXT NOT NULL, game_id TEXT NOT NULL, session_data TEXT NOT NULL,
  is_completed INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL,
  PRIMARY KEY (child_id, game_id)
);
CREATE TABLE IF NOT EXISTS rewards (
  id TEXT PRIMARY KEY NOT NULL, child_id TEXT NOT NULL, game_id TEXT NOT NULL,
  reward_type TEXT NOT NULL, reward_data TEXT NOT NULL, earned_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS rewards_child_game ON rewards (child_id, game_id);
CREATE TABLE IF NOT EXISTS sync_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT, op TEXT NOT NULL, entity_key TEXT, child_id TEXT,
  payload TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1, attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at INTEGER NOT NULL DEFAULT 0, last_error TEXT, dead INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS sync_queue_entity ON sync_queue (entity_key);
CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
`;

export interface SqlOps {
  run(sql: string, ...params: SqlValue[]): Promise<void>;
  all<T>(sql: string, ...params: SqlValue[]): Promise<T[]>;
}

class LocalDb implements SqlOps {
  // One connection, one operation at a time, so a transaction can't interleave with other work.
  private tail: Promise<unknown> = Promise.resolve();

  constructor(private readonly driver: SqlDriver) {}

  private locked<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.tail.then(fn, fn);
    this.tail = result.catch(() => undefined);
    return result;
  }

  async init(): Promise<void> {
    await this.locked(async () => {
      await this.driver.exec(SCHEMA);
      await this.driver.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
    });
  }

  run(sql: string, ...params: SqlValue[]) {
    return this.locked(() => this.driver.run(sql, params));
  }

  all<T>(sql: string, ...params: SqlValue[]) {
    return this.locked(() => this.driver.all<T>(sql, params));
  }

  /** All-or-nothing, so data and its sync-queue entry can never disagree after a crash. */
  tx<T>(fn: (ops: SqlOps) => Promise<T>): Promise<T> {
    return this.locked(async () => {
      await this.driver.exec('BEGIN');
      try {
        const result = await fn({
          run: (sql, ...params) => this.driver.run(sql, params),
          all: <R,>(sql: string, ...params: SqlValue[]) => this.driver.all<R>(sql, params),
        });
        await this.driver.exec('COMMIT');
        return result;
      } catch (e) {
        await this.driver.exec('ROLLBACK');
        throw e;
      }
    });
  }
}

function expoDriver(): SqlDriver {
  // Required lazily, so tests can run the same SQL on another SQLite build.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const SQLite = require('expo-sqlite') as typeof import('expo-sqlite');
  // Opened asynchronously so startup never blocks the UI thread.
  const opening = SQLite.openDatabaseAsync('puzzlewala.db');
  return {
    exec: async (sql) => (await opening).execAsync(sql),
    run: async (sql, params) => {
      await (await opening).runAsync(sql, params);
    },
    all: async <T,>(sql: string, params: SqlValue[]) => (await opening).getAllAsync<T>(sql, params),
  };
}

let instance: LocalDb | null = null;
let ready: Promise<void> | null = null;
let driverOverride: SqlDriver | null = null;

/** Tests only: run against a different SQLite driver, starting from an empty instance. */
export function useDriverForTests(driver: SqlDriver) {
  driverOverride = driver;
  instance = null;
  ready = null;
}

export async function getDb(): Promise<LocalDb> {
  if (!instance) {
    instance = new LocalDb(driverOverride ?? expoDriver());
    ready = instance.init();
  }
  await ready;
  return instance;
}
