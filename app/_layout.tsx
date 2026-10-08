import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { colors } from '../src/theme/theme';
import { I18nGate } from '../src/i18n/I18nGate';
import { startSyncRuntime } from '../src/sync/syncRuntime';
import { useAuthStore } from '../src/auth/authStore';
import {
  readGuestFinanceSnapshot,
  readLegacyFinanceSnapshot,
  readOwnerFinanceSnapshot,
  removeGuestFinanceSnapshot,
  removeLegacyFinanceSnapshot,
  setFinanceOwner,
  getFinanceOwner,
  suspendFinancePersistence,
  useFinanceStore,
  writeOwnerFinanceSnapshot,
} from '../src/store/financeStore';
import { createFinanceSessionController } from '../src/store/financeSession';
import { AppLockGate } from '../src/security/AppLockGate';
import { startProfileRuntime } from '../src/profile/profileSync';

export default function RootLayout() {
  useEffect(() => {
    // Local-first: auth restore + sync start after mount and never block render.
    startSyncRuntime();
    startProfileRuntime();
    // Bind the in-memory finance dataset to the active account (guest/A/B).
    const stopSession = createFinanceSessionController({
      financeStore: useFinanceStore,
      authStore: useAuthStore,
      getFinanceOwner,
      setFinanceOwner,
      readLegacy: readLegacyFinanceSnapshot,
      readGuest: readGuestFinanceSnapshot,
      readOwner: readOwnerFinanceSnapshot,
      writeOwner: writeOwnerFinanceSnapshot,
      removeLegacy: removeLegacyFinanceSnapshot,
      removeGuest: removeGuestFinanceSnapshot,
      suspendFinanceWrites: suspendFinancePersistence,
    }).start();
    return stopSession;
  }, []);

  return (
    <SafeAreaProvider>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <I18nGate>
          <AppLockGate>
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: colors.background },
              }}
            />
          </AppLockGate>
        </I18nGate>
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
}
