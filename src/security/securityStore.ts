import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { StateStorage } from 'zustand/middleware';

import { formatLocalizedCurrency } from '../i18n/formatting';

interface SecurityState {
  isBalanceHidden: boolean;
  appLockEnabled: boolean;
  isAppLocked: boolean;
  hasHydrated: boolean;
  hydrationError: string | null;
  lastUnlockAt: number | null;
  setBalanceHidden: (hidden: boolean) => void;
  toggleBalanceHidden: () => void;
  setAppLockEnabled: (enabled: boolean) => void;
  setAppLocked: (locked: boolean) => void;
  setHydrationState: (error?: unknown) => void;
  markUnlocked: () => void;
}

export const createSecurityStore = (storage: StateStorage) =>
  create<SecurityState>()(
    persist(
      (set) => ({
        isBalanceHidden: false,
        appLockEnabled: false,
        isAppLocked: false,
        hasHydrated: false,
        hydrationError: null,
        lastUnlockAt: null,
        setBalanceHidden: (hidden) => set({ isBalanceHidden: hidden }),
        toggleBalanceHidden: () => set((state) => ({ isBalanceHidden: !state.isBalanceHidden })),
        setAppLockEnabled: (enabled) => set({ appLockEnabled: enabled, isAppLocked: enabled ? false : false }),
        setAppLocked: (locked) => set({ isAppLocked: locked }),
        setHydrationState: (error) =>
          set({
            hasHydrated: true,
            hydrationError: error instanceof Error ? error.message : error ? 'Security preferences could not be loaded.' : null,
          }),
        markUnlocked: () => set({ isAppLocked: false, lastUnlockAt: Date.now() }),
      }),
      {
        name: 'ljxmoney.security',
        storage: createJSONStorage(() => storage),
        version: 1,
        partialize: (state) => ({
          isBalanceHidden: state.isBalanceHidden,
          appLockEnabled: state.appLockEnabled,
        }),
        onRehydrateStorage: () => (state, error) => {
          state?.setHydrationState(error);
        },
      },
    ),
  );

export const useSecurityStore = createSecurityStore(AsyncStorage);

export const getDisplayAmount = (
  amount: number,
  language: 'vi' | 'en',
  hidden: boolean,
) => (hidden ? '••••••' : formatLocalizedCurrency(amount, language));

export const getAmountDeltaText = (
  value: number,
  language: 'vi' | 'en',
  hidden: boolean,
) => {
  if (hidden) {
    return '••••••';
  }
  return `${value >= 0 ? '+' : '-'}${formatLocalizedCurrency(Math.abs(value), language)}`;
};
