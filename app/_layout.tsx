import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { colors } from '../src/theme/theme';
import { I18nGate } from '../src/i18n/I18nGate';
import { startSyncRuntime } from '../src/sync/syncRuntime';

export default function RootLayout() {
  useEffect(() => {
    // Local-first: auth restore + sync start after mount and never block render.
    startSyncRuntime();
  }, []);

  return (
    <SafeAreaProvider>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <I18nGate>
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: colors.background },
            }}
          />
        </I18nGate>
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
}
