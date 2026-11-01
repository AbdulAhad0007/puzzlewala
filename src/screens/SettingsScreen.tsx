import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { AppLogo } from '../components/AppLogo';
import { ParentMathGate } from '../components/ParentMathGate';
import { Card, Header, Screen, Segmented, Tap, ToggleRow, Txt } from '../components/ui';
import { useAppStore, type Language } from '../context/useAppStore';
import { useT } from '../hooks/useT';
import { colors, MIN_TOUCH, radii, spacing } from '../theme/colors';

export function SettingsScreen() {
  const t = useT();
  const navigation = useNavigation();
  const [gate, setGate] = useState(false);
  const { sfx, music, voice, language, setPref } = useAppStore();

  return (
    <Screen edges={['top', 'left', 'right']}>
      <AppLogo />
      <Header title={t('settingsTitle')} />
      <Card>
        <ToggleRow icon="volume-2" label={t('soundEffects')} value={sfx} onChange={(v) => setPref({ sfx: v })} />
        <ToggleRow icon="music" label={t('backgroundMusic')} value={music} onChange={(v) => setPref({ music: v })} />
        <ToggleRow icon="mic" label={t('voiceInstructions')} value={voice} onChange={(v) => setPref({ voice: v })} />
      </Card>
      <Card style={{ gap: spacing.sm }}>
        <Txt weight="bold" size={17}>{t('language')}</Txt>
        <Segmented<Language>
          options={[{ value: 'en', label: 'English' }, { value: 'hi', label: 'हिंदी' }]}
          value={language}
          onChange={(v) => setPref({ language: v })}
        />
      </Card>
      <Tap testID="parent-zone" accessibilityLabel={t('parentZone')} onPress={() => setGate(true)} style={styles.gated}>
        <View style={styles.lock}><Feather name="lock" size={24} color={colors.textDark} /></View>
        <View style={{ flex: 1 }}>
          <Txt weight="black" size={19}>{t('parentZone')}</Txt>
          <Txt size={14} color={colors.textMuted}>{t('parentZoneSub')}</Txt>
        </View>
        <Feather name="chevron-right" size={28} color={colors.textDark} />
      </Tap>
      <ParentMathGate
        visible={gate}
        onCancel={() => setGate(false)}
        onPass={() => {
          setGate(false);
          navigation.navigate('ParentZone');
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  gated: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.lavenderSoft,
    borderRadius: radii.lg, padding: spacing.lg, minHeight: MIN_TOUCH + 24,
  },
  lock: { width: 52, height: 52, borderRadius: radii.full, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
});
