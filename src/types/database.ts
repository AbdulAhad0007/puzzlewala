/** Rows as Supabase returns them (snake_case), kept apart from the app's own models. */
export interface ChildProfileRow {
  id: string;
  installation_id: string;
  display_id: string;
  nickname: string;
  gender: string | null;
  date_of_birth: string | null;
  age_group: string | null;
  avatar_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface GameProgressRow {
  child_id: string;
  game_id: string;
  category: string;
  level_id: string;
  completed: boolean;
  stars: number;
  attempts: number;
  updated_at: string;
}

export interface GameSettingsRow {
  child_id: string;
  game_id: string;
  settings: Record<string, unknown>;
  updated_at: string;
}

export interface GameSessionRow {
  child_id: string;
  game_id: string;
  session_data: Record<string, unknown>;
  is_completed: boolean;
  updated_at: string;
}

export interface GameRewardRow {
  id: string;
  child_id: string;
  game_id: string;
  reward_type: string;
  reward_data: Record<string, unknown>;
  earned_at: string;
}
