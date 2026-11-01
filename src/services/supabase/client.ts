import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { AppState, Platform } from 'react-native';
import { backendConfig } from '../../constants/gameConfig';

// SecureStore warns above ~2 KB and a session can exceed it, so long values span several entries.
const CHUNK_SIZE = 1800;
const countKey = (key: string) => `${key}.chunks`;
const chunkKey = (key: string, i: number) => `${key}.${i}`;

/** Keeps the session in the Android Keystore-backed secure store. */
export const secureSessionStorage = {
  async getItem(key: string): Promise<string | null> {
    const count = Number(await SecureStore.getItemAsync(countKey(key)));
    if (!count) return null;
    const parts = await Promise.all(
      Array.from({ length: count }, (_, i) => SecureStore.getItemAsync(chunkKey(key, i))),
    );
    return parts.some((p) => p === null) ? null : parts.join('');
  },
  async setItem(key: string, value: string): Promise<void> {
    const previous = Number(await SecureStore.getItemAsync(countKey(key))) || 0;
    const parts = value.match(new RegExp(`[\\s\\S]{1,${CHUNK_SIZE}}`, 'g')) ?? [''];
    await Promise.all(parts.map((p, i) => SecureStore.setItemAsync(chunkKey(key, i), p)));
    await SecureStore.setItemAsync(countKey(key), String(parts.length));
    for (let i = parts.length; i < previous; i++) await SecureStore.deleteItemAsync(chunkKey(key, i));
  },
  async removeItem(key: string): Promise<void> {
    const count = Number(await SecureStore.getItemAsync(countKey(key))) || 0;
    for (let i = 0; i < count; i++) await SecureStore.deleteItemAsync(chunkKey(key, i));
    await SecureStore.deleteItemAsync(countKey(key));
  },
};

let client: SupabaseClient | null = null;
let override: SupabaseClient | null = null;

/** Integration tests only. */
export const useClientForTests = (c: SupabaseClient | null) => { override = c; };

/** Null when the backend isn't configured. There is no fallback to a more privileged path. */
export function getSupabase(): SupabaseClient | null {
  if (override) return override;
  if (!backendConfig) return null;
  if (!client) {
    client = createClient(backendConfig.url, backendConfig.publishableKey, {
      auth: {
        // SecureStore is unavailable in the browser build, which exists only for development.
        storage: Platform.OS === 'web' ? AsyncStorage : secureSessionStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    });
    // Refresh tokens only while the app is on screen.
    AppState.addEventListener('change', (state) => {
      if (state === 'active') client?.auth.startAutoRefresh();
      else client?.auth.stopAutoRefresh();
    });
  }
  return client;
}

export function requireSupabase(): SupabaseClient {
  const c = getSupabase();
  if (!c) throw new Error('Supabase is not configured');
  return c;
}

/** Kept separate so sync can tell "try again later" from "the server refused this". */
export class RemoteError extends Error {
  constructor(message: string, readonly code: string | null, readonly transient: boolean) {
    super(message);
  }
}

const SQLSTATE = /^[0-9A-Z]{5}$/;

/** Only a definite answer from the database counts as permanent. Everything else is retried. */
export function toRemoteError(e: { message?: string; code?: string; status?: number } | null): RemoteError {
  const code = e?.code || null;
  const permanent = !!code && SQLSTATE.test(code) && !/^(08|53|57|58)/.test(code);
  return new RemoteError(e?.message ?? 'Unknown error', code, !permanent);
}
