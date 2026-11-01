export interface ProgressRecord {
  childId: string;
  category: string;
  levelId: string;
  completed: boolean;
  stars: number;
  attempts: number;
  updatedAt: string;
}

export interface RewardRecord {
  id: string;
  childId: string;
  rewardType: 'coins' | 'badge';
  rewardData: Record<string, unknown>;
  earnedAt: string;
}

/** Enough to resume an unfinished puzzle. Never holds media. */
export interface PuzzleSessionData {
  current_category: string;
  current_level: string;
  placed_piece_ids: number[];
  remaining_piece_ids: number[];
  puzzle_progress: number;
  current_score: number;
  misses: number;
  cols: number;
  rows: number;
}

export interface SessionRecord {
  childId: string;
  data: PuzzleSessionData | Record<string, never>;
  isCompleted: boolean;
  updatedAt: string;
}
