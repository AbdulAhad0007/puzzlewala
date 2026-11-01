import { gameConfig } from '../../constants/gameConfig';
import type { GameSettingsRow } from '../../types/database';
import { requireSupabase, toRemoteError } from './client';

export interface SettingsPayload {
  p_child_id: string;
  p_settings: Record<string, unknown>;
  p_updated_at: string;
}

export async function pushSettings(payload: SettingsPayload): Promise<void> {
  const { error } = await requireSupabase().rpc('sync_game_settings', { ...payload, p_game_id: gameConfig.gameId });
  if (error) throw toRemoteError(error);
}

export async function fetchSettings(): Promise<GameSettingsRow[]> {
  const { data, error } = await requireSupabase().from('game_settings').select('*').eq('game_id', gameConfig.gameId);
  if (error) throw toRemoteError(error);
  return data as GameSettingsRow[];
}
