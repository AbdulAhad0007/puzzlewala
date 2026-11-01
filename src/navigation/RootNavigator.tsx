import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { AlphabetLevelsScreen } from '../screens/AlphabetLevelsScreen';
import { NumbersCategoryScreen } from '../screens/NumbersCategoryScreen';
import { ChildProfileScreen } from '../screens/onboarding/ChildProfileScreen';
import { ProfileCreatedScreen } from '../screens/onboarding/ProfileCreatedScreen';
import { ParentZoneScreen } from '../screens/ParentZoneScreen';
import { PicturePuzzlesScreen } from '../screens/PicturePuzzlesScreen';
import { PuzzleCompletionScreen } from '../screens/PuzzleCompletionScreen';
import { PuzzleGameplayScreen } from '../screens/PuzzleGameplayScreen';
import { PuzzleSetScreen } from '../screens/PuzzleSetScreen';
import { SplashScreen } from '../screens/SplashScreen';
import { MainTabs } from './MainTabs';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  return (
    <Stack.Navigator initialRouteName="Splash" screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <Stack.Screen name="Splash" component={SplashScreen} />
      <Stack.Screen name="ChildProfile" component={ChildProfileScreen} />
      <Stack.Screen name="ProfileCreated" component={ProfileCreatedScreen} options={{ gestureEnabled: false }} />
      <Stack.Screen name="MainTabs" component={MainTabs} />
      <Stack.Screen name="AlphabetLevels" component={AlphabetLevelsScreen} />
      <Stack.Screen name="Numbers" component={NumbersCategoryScreen} />
      <Stack.Screen name="PicturePuzzles" component={PicturePuzzlesScreen} />
      <Stack.Screen name="PuzzleSet" component={PuzzleSetScreen} />
      {/* Swiping back would fight with dragging pieces. */}
      <Stack.Screen name="PuzzleGameplay" component={PuzzleGameplayScreen} options={{ gestureEnabled: false }} />
      <Stack.Screen name="PuzzleCompletion" component={PuzzleCompletionScreen} options={{ animation: 'fade', gestureEnabled: false }} />
      <Stack.Screen name="ParentZone" component={ParentZoneScreen} />
    </Stack.Navigator>
  );
}
