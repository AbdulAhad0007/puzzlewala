import { gameConfig } from '../../constants/gameConfig';
import type { GameRecord } from '../../types/game';
import { requireSupabase, toRemoteError } from './client';

/** Confirms the configured game UUID exists in the registry. */
export async function fetchCurrentGame(): Promise<GameRecord | null> {
  const { data, error } = await requireSupabase()
    .from('games')
    .select('id, name, slug, status, version')
    .eq('id', gameConfig.gameId)
    .maybeSingle();
  if (error) throw toRemoteError(error);
  return data as GameRecord | null;
}
