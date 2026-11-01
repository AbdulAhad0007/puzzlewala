import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { JigsawBoard } from '../components/JigsawBoard';
import { Mascot } from '../components/Mascot';
import { RoundButton, Tap, Txt } from '../components/ui';
import { useActiveProfile, useAppStore } from '../context/useAppStore';
import { getPuzzle } from '../data/puzzles';
import { useT } from '../hooks/useT';
import { withName } from '../i18n/strings';
import type { RootProps } from '../navigation/types';
import { SoundService } from '../services/SoundService';
import { colors, radii, shadow, spacing } from '../theme/colors';
import { difficultyFor, starsForMisses } from '../utils/jigsaw';

const CLUE_MS = 3000;

export function PuzzleGameplayScreen({ navigation, route }: RootProps<'PuzzleGameplay'>) {
  const t = useT();
  const { puzzleId } = route.params;
  const puzzle = getPuzzle(puzzleId);
  const profile = useActiveProfile();
  const language = useAppStore((s) => s.language);
  const completePuzzle = useAppStore((s) => s.completePuzzle);
  const savePuzzleSession = useAppStore((s) => s.savePuzzleSession);
  const voiceLang = language === 'hi' ? 'hi-IN' : 'en-IN';

  // Worked out once per puzzle: settings or new saves mustn't rearrange a board in progress.
  const [start] = useState(() => {
    const difficulty = difficultyFor(profile.ageTier);
    const saved = profile.session;
    if (saved?.current_level === puzzleId && !route.params.fresh) {
      return {
        grid: { cols: saved.cols, rows: saved.rows },
        placed: saved.placed_piece_ids,
        misses: saved.misses,
      };
    }
    return { grid: difficulty.grid, placed: difficulty.prefilled, misses: 0 };
  });

  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState(t('hintDrag'));
  const [showClue, setShowClue] = useState(false);
  const clueTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    SoundService.instruct(`${puzzle.speak}. ${t('hintDrag')}`, language === 'hi' ? 'hi-IN' : puzzle.lang);
    return () => {
      SoundService.stopSpeaking();
      if (clueTimer.current) clearTimeout(clueTimer.current);
    };
    // Speak once when the puzzle opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puzzleId]);

  const giveClue = () => {
    setShowClue(true);
    setMessage(t('hintShown'));
    SoundService.pronounce(t('hintShown'), voiceLang);
    if (clueTimer.current) clearTimeout(clueTimer.current);
    clueTimer.current = setTimeout(() => {
      setShowClue(false);
      setMessage(t('hintDrag'));
    }, CLUE_MS);
  };

  const onProgress = useCallback((placed: number[], total: number, misses: number) => {
    setProgress(placed.length / total);
    // Nothing to save until the child has done something, or once the puzzle is finished.
    if (placed.length <= start.placed.length || placed.length === total) return;
    savePuzzleSession({
      current_category: puzzle.setId,
      current_level: puzzleId,
      placed_piece_ids: placed,
      remaining_piece_ids: Array.from({ length: total }, (_, i) => i).filter((i) => !placed.includes(i)),
      puzzle_progress: placed.length / total,
      current_score: starsForMisses(misses),
      misses,
      cols: start.grid.cols,
      rows: start.grid.rows,
    });
  }, [puzzle.setId, puzzleId, savePuzzleSession, start]);

  const onMiss = useCallback(() => setMessage(withName(t('tryAgainNudge'), profile.name)), [t, profile.name]);
  const onComplete = useCallback((misses: number) => {
    const result = completePuzzle(puzzleId, starsForMisses(misses));
    navigation.replace('PuzzleCompletion', {
      puzzleId, stars: result.stars, coins: result.coins, badgeId: result.newBadgeId,
    });
  }, [completePuzzle, navigation, puzzleId]);

  const earned = Math.floor(progress * 3 + 1e-6);

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.top}>
        <RoundButton icon="arrow-left" label="Back" onPress={navigation.goBack} />
        <Mascot size={44} />
        <View style={{ flex: 1 }}>
          <Txt weight="black" size={20} numberOfLines={1} adjustsFontSizeToFit>{puzzle.title}</Txt>
          <View style={styles.stars} accessibilityLabel={`${earned} of 3 stars so far`}>
            {[1, 2, 3].map((i) => (
              <Text key={i} style={{ fontSize: 14, opacity: i <= earned ? 1 : 0.22 }}>⭐</Text>
            ))}
          </View>
        </View>
        <RoundButton
          icon="volume-2"
          label={`Say ${puzzle.title}`}
          bg={colors.sunshine}
          onPress={() => SoundService.pronounce(puzzle.speak, puzzle.lang)}
        />
      </View>
      <JigsawBoard
        key={`${puzzleId}-${start.grid.cols}`}
        puzzle={puzzle}
        grid={start.grid}
        prefilled={start.placed}
        initialMisses={start.misses}
        showClue={showClue}
        onProgress={onProgress}
        onMiss={onMiss}
        onComplete={onComplete}
        hint={(
          <Tap testID="hint" sound={false} onPress={giveClue} accessibilityLabel={`Clue. ${message}`} style={styles.hint}>
            <Mascot size={52} />
            <Txt weight="bold" size={15} style={{ flex: 1 }} numberOfLines={2}>{message}</Txt>
            <Text style={{ fontSize: 24 }}>💡</Text>
          </Tap>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.backgroundAlt },
  top: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingTop: spacing.xs },
  stars: { flexDirection: 'row' },
  hint: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.card, borderRadius: radii.lg,
    paddingHorizontal: spacing.md, minHeight: 64, ...shadow,
  },
});
