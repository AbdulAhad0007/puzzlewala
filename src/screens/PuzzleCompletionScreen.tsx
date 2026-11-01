import { Feather } from '@expo/vector-icons';
import { useEffect } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg from 'react-native-svg';
import { Confetti } from '../components/Confetti';
import { PuzzleArt } from '../components/PuzzleArt';
import { BigButton, Chip, Tap, Txt } from '../components/ui';
import { useActiveProfile, useAppStore } from '../context/useAppStore';
import { BADGES, getPuzzle, nextPuzzleInSet, type Puzzle } from '../data/puzzles';
import { useT } from '../hooks/useT';
import { withName } from '../i18n/strings';
import type { RootProps } from '../navigation/types';
import { SoundService } from '../services/SoundService';
import { colors, radii, shadow, spacing } from '../theme/colors';

const STAR_START_MS = 350;
const STAR_GAP_MS = 320;

function PopStar({ index, filled }: { index: number; filled: boolean }) {
  const scale = useSharedValue(0);
  useEffect(() => {
    const delay = STAR_START_MS + index * STAR_GAP_MS;
    scale.value = withDelay(delay, withSequence(withTiming(1.35, { duration: 180 }), withSpring(1, { damping: 8 })));
    if (!filled) return;
    const timer = setTimeout(() => SoundService.play('star'), delay);
    return () => clearTimeout(timer);
  }, [index, filled, scale]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Animated.View style={style}>
      <Text style={[styles.star, !filled && { opacity: 0.2 }]}>⭐</Text>
    </Animated.View>
  );
}

function sayItLine(puzzle: Puzzle) {
  return puzzle.phonic ? `${puzzle.title}! ${puzzle.phonic}` : `${puzzle.title}!`;
}

export function PuzzleCompletionScreen({ navigation, route }: RootProps<'PuzzleCompletion'>) {
  const t = useT();
  const { puzzleId, stars, coins, badgeId } = route.params;
  const puzzle = getPuzzle(puzzleId);
  const next = nextPuzzleInSet(puzzleId);
  const hindi = useAppStore((s) => s.language) === 'hi';
  const badge = BADGES.find((b) => b.id === badgeId);
  const { name } = useActiveProfile();

  useEffect(() => {
    SoundService.play('victory');
    SoundService.haptic('success');
    SoundService.instruct(`${withName(t('greatJob'), name)} ${puzzle.speak}`, puzzle.lang);
    return () => SoundService.stopSpeaking();
    // Celebrate once on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Txt weight="black" size={32} style={styles.center}>{t('amazing')}</Txt>
        <Txt testID="great-job" weight="bold" size={17} color={colors.textMuted} style={styles.center}>
          {withName(t('youCompleted'), name)}
        </Txt>
        <View style={styles.stars}>
          {[0, 1, 2].map((i) => <PopStar key={i} index={i} filled={i < stars} />)}
        </View>
        <View style={styles.art}>
          <Svg width={200} height={200}><PuzzleArt puzzle={puzzle} w={200} h={200} gradientId="done-art" /></Svg>
        </View>
        <Tap
          testID="say-it"
          sound={false}
          accessibilityLabel={`Say ${puzzle.title}`}
          onPress={() => SoundService.pronounce(puzzle.speak, puzzle.lang)}
          style={styles.say}
        >
          <Feather name="volume-2" size={24} color={colors.textDark} />
          <Txt weight="black" size={18} numberOfLines={1} adjustsFontSizeToFit style={{ flexShrink: 1 }}>{sayItLine(puzzle)}</Txt>
        </Tap>
        <View style={styles.rewards}>
          <Chip label={`🪙 +${coins} ${t('coinsBanked')}`} bg={colors.sunshineSoft} />
          {badge ? <Chip label={`${badge.emoji} ${t('badgeUnlocked')}: ${hindi ? badge.nameHi : badge.name}`} bg={colors.lavenderSoft} /> : null}
        </View>
        <BigButton
          label={next ? t('nextPuzzle') : t('backToLevels')}
          height={72}
          size={22}
          style={styles.cta}
          onPress={() => {
            if (next) navigation.replace('PuzzleGameplay', { puzzleId: next.id });
            else navigation.goBack();
          }}
        />
        <BigButton
          label={t('playAgain')}
          variant="blue"
          style={styles.cta}
          onPress={() => navigation.replace('PuzzleGameplay', { puzzleId, fresh: true })}
        />
      </ScrollView>
      <Confetti />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg, gap: spacing.md },
  center: { textAlign: 'center' },
  stars: { flexDirection: 'row', gap: spacing.sm },
  star: { fontSize: 52, lineHeight: 68 },
  art: { borderRadius: radii.xl, overflow: 'hidden', borderWidth: 5, borderColor: colors.white, ...shadow },
  say: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.skyBlueSoft,
    borderRadius: radii.full, paddingHorizontal: spacing.xl, minHeight: 56, maxWidth: '100%',
  },
  rewards: { gap: spacing.sm, alignItems: 'center' },
  cta: { width: '100%', maxWidth: 420 },
});
