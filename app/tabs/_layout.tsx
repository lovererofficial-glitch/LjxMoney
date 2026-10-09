import { Tabs } from 'expo-router';
import { StyleSheet, Text } from 'react-native';
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
          backgroundColor: 'rgba(17, 17, 17, 0.94)',
          borderTopWidth: 0,
          borderRadius: 24,
          marginHorizontal: 14,
          marginBottom: 10,
          height: 58 + Math.max(insets.bottom, 8),
          paddingBottom: Math.max(insets.bottom, 8),
          paddingTop: 10,
          borderTopColor: 'transparent',
          borderWidth: 1,
          borderColor: 'rgba(215, 181, 109, 0.12)',
          elevation: 0,
          shadowColor: '#000',
          shadowOpacity: 0.18,
          shadowRadius: 18,
          shadowOffset: { width: 0, height: 8 },
          position: 'absolute',
        },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '700',
        },
        sceneStyle: {
          backgroundColor: colors.background,
        },
      }}
    >
      <Tabs.Screen name="home" options={{
        title: t('navigation.home'),
        tabBarIcon: ({ color }) => <Text style={[styles.tabIcon, { color }]}>⌂</Text>,
      }} />
      <Tabs.Screen name="calendar" options={{
        title: t('navigation.calendar'),
        tabBarIcon: ({ color }) => <Text style={[styles.tabIcon, { color }]}>▦</Text>,
      }} />
      <Tabs.Screen name="transactions" options={{
        title: t('navigation.transactions'),
        tabBarIcon: ({ color }) => <Text style={[styles.tabIcon, { color }]}>↔</Text>,
      }} />
      <Tabs.Screen name="stats" options={{
        title: t('navigation.statistics'),
        tabBarIcon: ({ color }) => <Text style={[styles.tabIcon, { color }]}>▥</Text>,
      }} />
      <Tabs.Screen name="wallets" options={{
        title: t('wallet.wallets'),
        tabBarIcon: ({ color }) => <Text style={[styles.tabIcon, { color }]}>▣</Text>,
      }} />
      <Tabs.Screen name="settings" options={{
        title: t('common.settings'),
        tabBarIcon: ({ color }) => <Text style={[styles.tabIcon, { color }]}>⚙</Text>,
      }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabIcon: {
    fontSize: 18,
    lineHeight: 21,
    textAlign: 'center',
  },
});
