/**
 * The one place that knows which game this app is, and which backend it talks to.
 * EXPO_PUBLIC_ values must be read as literal process.env.X for Expo to compile them in.
 */
import packageJson from '../../package.json';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Local rows use this when no game UUID is configured; they are adopted once one is. */
export const LOCAL_GAME_ID = '00000000-0000-0000-0000-000000000000';

/** True for keys that bypass Row Level Security and must never ship in an app. */
export function isPrivilegedKey(key: string): boolean {
  if (key.startsWith('sb_secret_')) return true;
  if (!key.startsWith('eyJ')) return false;
  try {
    const payload = key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return (JSON.parse(atob(payload)) as { role?: string }).role === 'service_role';
  } catch {
    return false;
  }
}

export interface BackendConfig {
  url: string;
  publishableKey: string;
  gameId: string;
}

/** Returns null unless all values are valid. The app then runs local-only, never insecurely. */
export function parseBackendConfig(
  url: string | undefined,
  key: string | undefined,
  gameId: string | undefined,
): BackendConfig | null {
  if (!url || !key || !gameId) return null;
  if (isPrivilegedKey(key)) {
    console.error('A privileged Supabase key was configured for the app. Cloud sync is disabled.');
    return null;
  }
  if (!UUID_RE.test(gameId) || !/^https:\/\//.test(url)) {
    console.error('Invalid EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_GAME_UUID. Cloud sync is disabled.');
    return null;
  }
  return { url, publishableKey: key, gameId };
}

export const backendConfig = parseBackendConfig(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  process.env.EXPO_PUBLIC_GAME_UUID,
);

export const gameConfig = {
  slug: 'puzzlewala',
  /** Prefix of human-readable Child IDs, e.g. PW-7K92X4. */
  displayIdPrefix: 'PW',
  appVersion: packageJson.version,
  platform: 'android',
  /** Every local and remote game-specific query filters by this. */
  gameId: backendConfig?.gameId ?? LOCAL_GAME_ID,
} as const;

export const isCloudConfigured = backendConfig !== null;
