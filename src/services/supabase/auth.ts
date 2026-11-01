import { gameConfig } from '../../constants/gameConfig';
import { getInstallationUuid } from '../gameRepository';
import { requireSupabase, toRemoteError } from './client';

export type AuthOutcome =
  | { status: 'ready'; userId: string }
  | { status: 'offline'; message: string }
  /** The project's "Anonymous sign-ins" setting is off, or sign-in was refused. */
  | { status: 'unavailable'; message: string };

/** Restores the saved anonymous session, or creates one on first launch. */
export async function ensureSession(): Promise<AuthOutcome> {
  const supabase = requireSupabase();
  const { data: existing } = await supabase.auth.getSession();
  if (existing.session?.user) return { status: 'ready', userId: existing.session.user.id };

  const { data, error } = await supabase.auth.signInAnonymously();
  if (data.user) return { status: 'ready', userId: data.user.id };
  const status = (error as { status?: number } | null)?.status ?? 0;
  const message = error?.message ?? 'Sign-in failed';
  // Status 0 or 5xx means we never got a real answer. A 4xx is the server refusing.
  return status >= 400 && status < 500 ? { status: 'unavailable', message } : { status: 'offline', message };
}

/**
 * Links this login to its one installation row. The server derives the owner from the login,
 * so this call can't attach to someone else's installation.
 */
export async function registerInstallation(): Promise<string> {
  const supabase = requireSupabase();
  const call = async (uuid: string) =>
    supabase.rpc('ensure_installation', {
      p_installation_uuid: uuid,
      p_app_version: gameConfig.appVersion,
      p_platform: gameConfig.platform,
    });
  let { data, error } = await call(await getInstallationUuid());
  if (error?.code === '23505') {
    // Another login already holds this random id, e.g. after restored app data. Take a new one.
    ({ data, error } = await call(await getInstallationUuid(true)));
  }
  if (error) throw toRemoteError(error);
  return data as string;
}
