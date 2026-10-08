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
