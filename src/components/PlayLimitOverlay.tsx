import { useEffect, useState } from 'react';
import { BackHandler, StyleSheet, View } from 'react-native';
import { endPlaySession } from '../../modules/device-lock';
import { useAppStore } from '../context/useAppStore';
import { useIsOverPlayLimit } from '../hooks/usePlaytime';
import { useT } from '../hooks/useT';
import { colors, radii, spacing } from '../theme/colors';
import { Mascot } from './Mascot';
import { ParentMathGate } from './ParentMathGate';
import { BigButton, Txt } from './ui';

/** Time for the child to read the goodbye, and for a nearby parent to add time. */
const GOODBYE_SECONDS = 10;

/**
 * Once today's limit is reached: says goodbye, then closes the app and locks the phone.
 * Reopening today runs this again, so a parent still gets a window to add time.
 */
export function PlayLimitOverlay() {
  const over = useIsOverPlayLimit();
  return over ? <Goodbye /> : null;
}

function Goodbye() {
  const t = useT();
  const grantBonusTime = useAppStore((s) => s.grantBonusTime);
  const [gate, setGate] = useState(false);
  const [left, setLeft] = useState(GOODBYE_SECONDS);

  // The countdown waits while a parent is answering the math gate.
  useEffect(() => {
    if (gate) return;
    const timer = setInterval(() => setLeft((s) => Math.max(s - 1, 0)), 1000);
    return () => clearInterval(timer);
  }, [gate]);

  useEffect(() => {
    if (left === 0 && !gate) void endPlaySession();
  }, [left, gate]);

  // The back button must not be a way around the break.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, []);

  return (
    <View style={styles.cover} testID="play-limit">
      <View style={styles.card}>
        <Mascot size={110} />
        <Txt weight="black" size={28} style={styles.center}>{t('breakTitle')}</Txt>
        <Txt size={18} color={colors.textMuted} style={styles.center}>{t('breakSub')}</Txt>
        <Txt testID="closing-in" weight="bold" size={16} style={styles.center}>{t('closingIn').replace('{n}', String(left))}</Txt>
        <BigButton testID="add-time" label={t('breakParent')} variant="blue" size={16} height={56} onPress={() => setGate(true)} />
      </View>
      <ParentMathGate
        visible={gate}
        onCancel={() => {
          setGate(false);
          setLeft(GOODBYE_SECONDS);
        }}
        onPass={() => {
          setGate(false);
          grantBonusTime();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  cover: {
    ...StyleSheet.absoluteFill, backgroundColor: colors.skyBlueSoft, alignItems: 'center', justifyContent: 'center',
    padding: spacing.xl, zIndex: 1000, elevation: 1000,
  },
  card: { backgroundColor: colors.card, borderRadius: radii.xl, padding: spacing.xl, alignItems: 'center', gap: spacing.md, maxWidth: 420 },
  center: { textAlign: 'center' },
});
