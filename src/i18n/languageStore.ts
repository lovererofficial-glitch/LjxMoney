import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { StateStorage } from 'zustand/middleware';

import type { Language } from './types';

interface LanguageState {
  language: Language;
  hasHydrated: boolean;
  hydrationError: string | null;
  setLanguage: (language: Language) => void;
  finishHydration: (error?: unknown) => void;
}

export const createLanguageStore = (storage: StateStorage) =>
  create<LanguageState>()(
    persist(
      (set) => ({
        language: 'vi',
        hasHydrated: false,
        hydrationError: null,
        setLanguage: (language) => set({ language }),
        finishHydration: (error) =>
          set({
            hasHydrated: true,
            hydrationError:
              error instanceof Error ? error.message : error ? 'Language preference could not be loaded.' : null,
          }),
      }),
      {
        name: 'ljxmoney.language',
        storage: createJSONStorage(() => storage),
        version: 1,
        partialize: (state) => ({ language: state.language }),
        merge: (persisted, current) => {
          const storedLanguage =
            typeof persisted === 'object' && persisted !== null && 'language' in persisted
              ? persisted.language
              : undefined;
          return {
            ...current,
            language: storedLanguage === 'en' || storedLanguage === 'vi' ? storedLanguage : 'vi',
          };
        },
        onRehydrateStorage: () => (state, error) => {
          state?.finishHydration(error);
        },
      },
    ),
  );
