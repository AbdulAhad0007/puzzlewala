import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Confetti } from '../../components/Confetti';
import { BigButton, Card, Txt } from '../../components/ui';
import { useAppStore } from '../../context/useAppStore';
import { avatarEmoji } from '../../data/avatars';
import { useT } from '../../hooks/useT';
import { withName } from '../../i18n/strings';
import type { RootProps } from '../../navigation/types';
import { SoundService } from '../../services/SoundService';
import { colors, radii, spacing } from '../../theme/colors';

export function ProfileCreatedScreen({ navigation, route }: RootProps<'ProfileCreated'>) {
  const t = useT();
  const child = useAppStore((s) => s.profiles[route.params.childId]);
  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.content}>
        <View style={styles.avatar}><Text style={styles.emoji}>{avatarEmoji(child?.avatarId ?? null)}</Text></View>
        <Txt testID="created-title" weight="black" size={30} style={styles.center}>
          {withName(t('hello'), child?.name ?? '')}
        </Txt>
        <Card style={styles.card}>
          <Txt size={15} color={colors.textMuted}>{t('childId')}</Txt>
          <Txt testID="child-id" weight="black" size={32}>{child?.displayId}</Txt>
          <Txt size={13} color={colors.textMuted} style={styles.center}>{t('childIdHelp')}</Txt>
        </Card>
        <BigButton
          testID="play-now"
          label={t('playNowCta')}
          height={72}
          size={22}
          style={styles.cta}
          onPress={() => {
            SoundService.unlock();
            navigation.reset({ index: 0, routes: [{ name: 'MainTabs' }] });
          }}
        />
      </View>
      <Confetti />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.lg },
  avatar: {
    width: 130, height: 130, borderRadius: radii.full, backgroundColor: colors.sunshineSoft,
    alignItems: 'center', justifyContent: 'center',
  },
  emoji: { fontSize: 72, lineHeight: 92 },
  center: { textAlign: 'center' },
  card: { width: '100%', maxWidth: 420, alignItems: 'center', gap: spacing.xs },
  cta: { width: '100%', maxWidth: 420 },
});
