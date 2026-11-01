import { gameConfig } from '../../constants/gameConfig';
import type { ChildProfileRow } from '../../types/database';
import { requireSupabase, toRemoteError } from './client';

export interface ProfilePayload {
  p_id: string;
  p_display_id: string;
  p_nickname: string;
  p_gender: string | null;
  p_date_of_birth: string | null;
  p_age_group: string | null;
  p_avatar_id: string | null;
  p_created_at: string;
  p_updated_at: string;
}

/** Returns the stored row, whose Child ID the database may have re-issued. */
export async function pushProfile(payload: ProfilePayload): Promise<ChildProfileRow> {
  const { data, error } = await requireSupabase().rpc('sync_child_profile', payload);
  if (error) throw toRemoteError(error);
  return data as ChildProfileRow;
}

export async function joinCurrentGame(childId: string): Promise<void> {
  const { error } = await requireSupabase().rpc('join_game', { p_child_id: childId, p_game_id: gameConfig.gameId });
  if (error) throw toRemoteError(error);
}

export async function deleteRemoteProfile(id: string): Promise<void> {
  const { error } = await requireSupabase().from('child_profiles').delete().eq('id', id);
  if (error) throw toRemoteError(error);
}

/** RLS limits this to children of the signed-in installation. */
export async function fetchProfiles(): Promise<ChildProfileRow[]> {
  const { data, error } = await requireSupabase().from('child_profiles').select('*');
  if (error) throw toRemoteError(error);
  return data as ChildProfileRow[];
}
