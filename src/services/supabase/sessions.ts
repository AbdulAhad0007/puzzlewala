import { gameConfig } from '../../constants/gameConfig';
import type { GameSessionRow } from '../../types/database';
import { requireSupabase, toRemoteError } from './client';

export interface SessionPayload {
  p_child_id: string;
  p_session_data: Record<string, unknown>;
  p_is_completed: boolean;
  p_updated_at: string;
}

export async function pushSession(payload: SessionPayload): Promise<void> {
  const { error } = await requireSupabase().rpc('sync_game_session', { ...payload, p_game_id: gameConfig.gameId });
  if (error) throw toRemoteError(error);
}

export async function fetchSessions(): Promise<GameSessionRow[]> {
  const { data, error } = await requireSupabase().from('game_sessions').select('*').eq('game_id', gameConfig.gameId);
  if (error) throw toRemoteError(error);
  return data as GameSessionRow[];
}
