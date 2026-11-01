import type { NavigatorScreenParams } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { SetId } from '../data/puzzles';

export type TabParamList = { Home: undefined; Puzzles: undefined; Badges: undefined; Parents: undefined };

export type RootStackParamList = {
  Splash: undefined;
  ChildProfile: { mode: 'create' | 'edit'; childId?: string };
  ProfileCreated: { childId: string };
  MainTabs: NavigatorScreenParams<TabParamList> | undefined;
  AlphabetLevels: undefined;
  Numbers: undefined;
  PicturePuzzles: undefined;
  PuzzleSet: { setId: SetId };
  /** `fresh` ignores any saved session for this puzzle (Play Again). */
  PuzzleGameplay: { puzzleId: string; fresh?: boolean };
  PuzzleCompletion: { puzzleId: string; stars: number; coins: number; badgeId?: string };
  ParentZone: undefined;
};

export type RootProps<T extends keyof RootStackParamList> = NativeStackScreenProps<RootStackParamList, T>;

declare global {
  namespace ReactNavigation {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface RootParamList extends RootStackParamList {}
  }
}
