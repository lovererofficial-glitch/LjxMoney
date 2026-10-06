import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors } from '../../src/theme/theme';
import { useI18n } from '../../src/i18n';

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const { t } = useI18n();

  return (
    <Tabs
      initialRouteName="home"
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.background,
          borderTopWidth: 0,
          height: 58 + Math.max(insets.bottom, 8),
          paddingBottom: Math.max(insets.bottom, 8),
          paddingTop: 8,
          borderTopColor: 'transparent',
          elevation: 0,
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedText,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '700',
        },
        sceneStyle: {
          backgroundColor: colors.background,
        },
      }}
    >
      <Tabs.Screen name="home" options={{ title: t('navigation.home') }} />
      <Tabs.Screen name="calendar" options={{ title: t('navigation.calendar') }} />
      <Tabs.Screen name="transactions" options={{ title: t('navigation.transactions') }} />
      <Tabs.Screen name="stats" options={{ title: t('navigation.statistics') }} />
    </Tabs>
  );
}
