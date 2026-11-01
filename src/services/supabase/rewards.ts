import { gameConfig } from '../../constants/gameConfig';
import type { GameRewardRow } from '../../types/database';
import { requireSupabase, toRemoteError } from './client';

export interface RewardPayload {
  id: string;
  child_id: string;
  reward_type: string;
  reward_data: Record<string, unknown>;
  earned_at: string;
}

/** The app-generated id makes a retried upload a no-op instead of a second reward. */
export async function pushReward(payload: RewardPayload): Promise<void> {
  const { error } = await requireSupabase()
    .from('game_rewards')
    .upsert({ ...payload, game_id: gameConfig.gameId }, { onConflict: 'id', ignoreDuplicates: true });
  if (error) throw toRemoteError(error);
}

export async function fetchRewards(): Promise<GameRewardRow[]> {
  const { data, error } = await requireSupabase().from('game_rewards').select('*').eq('game_id', gameConfig.gameId);
  if (error) throw toRemoteError(error);
  return data as GameRewardRow[];
}
