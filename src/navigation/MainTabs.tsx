import { Feather } from '@expo/vector-icons';
import { createBottomTabNavigator, type BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Tap, Txt } from '../components/ui';
import { useT } from '../hooks/useT';
import type { StringKey } from '../i18n/strings';
import { BadgesScreen } from '../screens/BadgesScreen';
import { CategoriesScreen } from '../screens/CategoriesScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { colors, MIN_TOUCH, radii, shadow } from '../theme/colors';
import type { TabParamList } from './types';

const Tab = createBottomTabNavigator<TabParamList>();

const TABS: Record<keyof TabParamList, { icon: keyof typeof Feather.glyphMap; label: StringKey }> = {
  Home: { icon: 'home', label: 'tabHome' },
  Puzzles: { icon: 'grid', label: 'tabPuzzles' },
  Badges: { icon: 'award', label: 'tabBadges' },
  Parents: { icon: 'settings', label: 'tabParents' },
};

/** Height the bar takes over content, so screens can leave room for it. */
export const TAB_BAR_SPACE = 88;

function LargeTabBar({ state, navigation }: BottomTabBarProps) {
  const t = useT();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bar, { marginBottom: Math.max(insets.bottom, 12) }]} accessibilityRole="tablist">
      {state.routes.map((route, index) => {
        const on = state.index === index;
        const tab = TABS[route.name as keyof TabParamList];
        return (
          <Tap
            key={route.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={t(tab.label)}
            testID={`tab-${route.name}`}
            onPress={() => {
              if (!on) navigation.navigate(route.name);
            }}
            style={[styles.tab, on && styles.tabOn]}
          >
            <Feather name={tab.icon} size={24} color={on ? colors.textDark : colors.textMuted} />
            <Txt weight="bold" size={13} color={on ? colors.textDark : colors.textMuted} numberOfLines={1}>{t(tab.label)}</Txt>
          </Tap>
        );
      })}
    </View>
  );
}

export function MainTabs() {
  return (
    <Tab.Navigator
      tabBar={(props) => <LargeTabBar {...props} />}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.background } }}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Puzzles" component={CategoriesScreen} />
      <Tab.Screen name="Badges" component={BadgesScreen} />
      <Tab.Screen name="Parents" component={SettingsScreen} />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row', backgroundColor: colors.card, borderRadius: radii.xl, marginHorizontal: 12, marginTop: 4, padding: 6, gap: 4, ...shadow,
  },
  tab: { flex: 1, minHeight: MIN_TOUCH + 8, borderRadius: radii.lg, alignItems: 'center', justifyContent: 'center' },
  tabOn: { backgroundColor: colors.sunshine },
});
