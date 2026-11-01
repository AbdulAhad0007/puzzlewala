import { useActiveProfile, useAppStore } from '../context/useAppStore';
import { countStars } from '../data/puzzles';

export function useGameProgress() {
  const { solved, coins, session } = useActiveProfile();
  const completePuzzle = useAppStore((s) => s.completePuzzle);
  const savePuzzleSession = useAppStore((s) => s.savePuzzleSession);
  return {
    solved,
    coins,
    session,
    stars: countStars(solved),
    completedCount: Object.keys(solved).length,
    completePuzzle,
    savePuzzleSession,
  };
}
