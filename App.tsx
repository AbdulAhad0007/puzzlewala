import {
  Baloo2_400Regular, Baloo2_600SemiBold, Baloo2_700Bold, Baloo2_800ExtraBold, useFonts,
} from '@expo-google-fonts/baloo-2';
import { DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { PlayLimitOverlay } from './src/components/PlayLimitOverlay';
import { Txt } from './src/components/ui';
import { useAppStore } from './src/context/useAppStore';
import { useKioskMode } from './src/hooks/useKioskMode';
import { usePlaytimeTracker } from './src/hooks/usePlaytime';
import { RootNavigator } from './src/navigation/RootNavigator';
import { colors } from './src/theme/colors';

const navTheme = { ...DefaultTheme, colors: { ...DefaultTheme.colors, background: colors.background } };

/** Loads saved device state, then local profiles. Runs once. */
function useAppLoaded() {
  const loaded = useAppStore((s) => s.loaded);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const boot = () => {
      useAppStore.getState().bootstrap().catch((e) => {
        console.error('Could not open local storage:', e);
        setFailed(true);
      });
    };
    if (useAppStore.persist.hasHydrated()) boot();
    else return useAppStore.persist.onFinishHydration(boot);
  }, []);
  return { loaded, failed };
}

export default function App() {
  const [fontsLoaded, fontError] = useFonts({
    Baloo2_400Regular, Baloo2_600SemiBold, Baloo2_700Bold, Baloo2_800ExtraBold,
  });
  const { loaded, failed } = useAppLoaded();
  usePlaytimeTracker();
  useKioskMode();

  // A font failure falls back to system fonts rather than leaving the child on a blank screen.
  const ready = (fontsLoaded || fontError) && loaded;

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <StatusBar style="dark" />
        {ready ? (
          <View style={styles.root}>
            <NavigationContainer theme={navTheme}>
              <RootNavigator />
            </NavigationContainer>
            <PlayLimitOverlay />
          </View>
        ) : failed ? (
          <View style={styles.message}>
            <Txt weight="bold" size={18} style={{ textAlign: 'center' }}>
              Something went wrong opening the game. Please close it and try again.
            </Txt>
          </View>
        ) : (
          <View style={styles.message}>
            <Image
              source={require('./assets/logos/main-logo.png')}
              style={styles.logo}
              resizeMode="contain"
              accessibilityLabel="PuzzleWala"
            />
          </View>
        )}
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white },
  message: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  logo: { width: '100%', maxWidth: 420, height: 240 },
});
