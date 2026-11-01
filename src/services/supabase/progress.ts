import { gameConfig } from '../../constants/gameConfig';
import type { GameProgressRow } from '../../types/database';
import { requireSupabase, toRemoteError } from './client';

export interface ProgressPayload {
  p_child_id: string;
  p_category: string;
  p_level_id: string;
  p_completed: boolean;
  p_stars: number;
  p_attempts: number;
  p_updated_at: string;
}

/** Monotonic server-side merge: safe to retry, safe in any order. */
export async function pushProgress(payload: ProgressPayload): Promise<void> {
  const { error } = await requireSupabase().rpc('merge_game_progress', { ...payload, p_game_id: gameConfig.gameId });
  if (error) throw toRemoteError(error);
}

export async function fetchProgress(): Promise<GameProgressRow[]> {
  const { data, error } = await requireSupabase().from('game_progress').select('*').eq('game_id', gameConfig.gameId);
  if (error) throw toRemoteError(error);
  return data as GameProgressRow[];
}

/** Clears this game's progress, rewards and session for one child. Other games keep theirs. */
export async function resetRemoteGameData(childId: string): Promise<void> {
  const { error } = await requireSupabase().rpc('reset_game_data', { p_child_id: childId, p_game_id: gameConfig.gameId });
  if (error) throw toRemoteError(error);
}
