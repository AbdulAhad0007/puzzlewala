import { Feather } from '@expo/vector-icons';
import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import type { LevelState, Puzzle } from '../data/puzzles';
import { useT } from '../hooks/useT';
import { colors, radii, shadow } from '../theme/colors';
import { Stars, Tap, Txt } from './ui';

/** One level: completed (check + stars), active (pulsing "Play!"), or locked (friendly silhouette). */
export function LevelTile({ puzzle, state, stars, caption, onPlay, style }: {
  puzzle: Puzzle; state: LevelState; stars: number; caption: string;
  onPlay: () => void; style?: object;
}) {
  const t = useT();
  const pulse = useSharedValue(1);
  useEffect(() => {
    if (state === 'active') pulse.value = withRepeat(withTiming(1.05, { duration: 650 }), -1, true);
    else pulse.value = 1;
  }, [state, pulse]);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));

  const locked = state === 'locked';
  const label = locked ? `${puzzle.title}, locked` : state === 'active' ? `${puzzle.title}, play` : `${puzzle.title}, ${stars} stars`;

  return (
    <Animated.View style={[style, animated]}>
      <Tap
        disabled={locked}
        onPress={onPlay}
        accessibilityLabel={label}
        accessibilityState={{ disabled: locked }}
        testID={`level-${puzzle.id}`}
        style={[
          styles.tile,
          state === 'completed' && styles.done,
          state === 'active' && styles.active,
          locked && styles.locked,
        ]}
      >
        {state === 'completed' ? (
          <View style={styles.check}><Feather name="check" size={14} color={colors.white} /></View>
        ) : null}
        {locked ? <View style={styles.check2}><Feather name="lock" size={13} color={colors.lockedText} /></View> : null}
        <Text style={[styles.emoji, locked && styles.silhouette]}>{puzzle.emoji}</Text>
        <Txt weight="black" size={caption.length > 3 ? 16 : 20} numberOfLines={1} adjustsFontSizeToFit
          color={locked ? colors.lockedText : colors.textDark}>
          {caption}
        </Txt>
        <View style={styles.foot}>
          {state === 'completed' ? <Stars count={stars} size={12} /> : null}
          {state === 'active' ? (
            <View style={styles.play}><Txt weight="black" size={13} color={colors.textDark}>{t('play')}</Txt></View>
          ) : null}
        </View>
      </Tap>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  tile: {
    minHeight: 124, borderRadius: radii.lg, alignItems: 'center', justifyContent: 'center', padding: 6, ...shadow,
  },
  done: { backgroundColor: colors.sunshineSoft, borderWidth: 2, borderColor: colors.sunshine },
  active: { backgroundColor: colors.candyPink, borderWidth: 3, borderColor: colors.candyPinkDark },
  locked: { backgroundColor: colors.locked, shadowOpacity: 0, elevation: 0 },
  check: {
    position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: 11,
    backgroundColor: colors.mintDark, alignItems: 'center', justifyContent: 'center',
  },
  check2: { position: 'absolute', top: 8, right: 8 },
  emoji: { fontSize: 34, lineHeight: 44 },
  silhouette: { opacity: 0.28 },
  foot: { height: 24, alignItems: 'center', justifyContent: 'center' },
  play: { backgroundColor: colors.white, borderRadius: radii.full, paddingHorizontal: 10 },
});
