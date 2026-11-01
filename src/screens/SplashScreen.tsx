import { Feather } from '@expo/vector-icons';
import { useEffect } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BigButton, Txt } from '../components/ui';
import { useAppStore } from '../context/useAppStore';
import { useT } from '../hooks/useT';
import type { RootProps } from '../navigation/types';
import { SoundService } from '../services/SoundService';
import { colors, radii, spacing } from '../theme/colors';

export function SplashScreen({ navigation }: RootProps<'Splash'>) {
  const t = useT();
  const hasProfile = useAppStore((s) => s.activeProfileId !== null);
  const bounce = useSharedValue(0);
  useEffect(() => {
    bounce.value = withRepeat(withTiming(1, { duration: 600 }), -1, true);
  }, [bounce]);
  const bouncing = useAnimatedStyle(() => ({ transform: [{ translateY: -10 * bounce.value }] }));

  return (
    <SafeAreaView style={styles.content}>
      <View style={styles.badge}>
        <Feather name="volume-2" size={16} color={colors.mintDark} />
        <Txt weight="bold" size={14}>{t('audioReady')}</Txt>
      </View>
      <Image
        source={require('../../assets/logos/main-logo.png')}
        style={styles.logo}
        resizeMode="contain"
        accessibilityLabel={`PuzzleWala. ${t('tagline')}`}
      />
      <Animated.View style={[styles.cta, bouncing]}>
        <BigButton
          label={t('tapToPlay')}
          height={76}
          size={24}
          onPress={() => {
            SoundService.unlock();
            if (hasProfile) navigation.replace('MainTabs');
            else navigation.replace('ChildProfile', { mode: 'create' });
          }}
        />
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  // White, to match the logo and continue seamlessly from the system splash screen.
  content: { flex: 1, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'space-between', padding: spacing.xl },
  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.mintSoft, paddingHorizontal: spacing.md, paddingVertical: 2, borderRadius: radii.full,
  },
  logo: { width: '100%', maxWidth: 420, flex: 1, marginVertical: spacing.lg },
  cta: { width: '100%', maxWidth: 420, marginBottom: spacing.xl },
});
