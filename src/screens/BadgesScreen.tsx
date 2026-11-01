import { Feather } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { AppLogo } from '../components/AppLogo';
import { Header, Screen, Txt } from '../components/ui';
import { useActiveProfile, useAppStore } from '../context/useAppStore';
import { BADGES } from '../data/puzzles';
import { useT } from '../hooks/useT';
import { colors, radii, shadow, spacing } from '../theme/colors';

export function BadgesScreen() {
  const t = useT();
  const { solved } = useActiveProfile();
  const hindi = useAppStore((s) => s.language) === 'hi';
  return (
    <Screen edges={['top', 'left', 'right']}>
      <AppLogo />
      <Header title={t('badgesTitle')} sub={t('badgesSub')} />
      <View style={styles.grid}>
        {BADGES.map((b) => {
          const on = b.earned(solved);
          return (
            <View
              key={b.id}
              testID={`badge-${b.id}-${on ? 'on' : 'off'}`}
              style={[styles.sticker, on ? styles.on : styles.off]}
            >
              {on ? null : <View style={styles.lock}><Feather name="lock" size={15} color={colors.lockedText} /></View>}
              <Text style={[styles.emoji, !on && { opacity: 0.3 }]}>{b.emoji}</Text>
              <Txt weight="black" size={16} style={styles.center} color={on ? colors.textDark : colors.textMuted}>
                {hindi ? b.nameHi : b.name}
              </Txt>
              <Txt size={13} style={styles.center} color={colors.textMuted}>{hindi ? b.goalHi : b.goal}</Txt>
            </View>
          );
        })}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: spacing.md },
  sticker: { width: '48.5%', minHeight: 170, borderRadius: radii.lg, padding: spacing.md, alignItems: 'center', justifyContent: 'center' },
  on: { backgroundColor: colors.sunshineSoft, borderWidth: 3, borderColor: colors.sunshine, ...shadow },
  off: { backgroundColor: colors.locked },
  lock: { position: 'absolute', top: 10, right: 10 },
  emoji: { fontSize: 52, lineHeight: 68 },
  center: { textAlign: 'center' },
});
