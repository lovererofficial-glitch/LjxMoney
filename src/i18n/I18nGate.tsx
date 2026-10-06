import { useEffect } from 'react';
import { View } from 'react-native';

import { useLanguageStore } from './runtime';
import { colors } from '../theme/theme';

export const I18nGate = ({ children }: { children: React.ReactNode }) => {
  const hasHydrated = useLanguageStore((state) => state.hasHydrated);
  const hydrationError = useLanguageStore((state) => state.hydrationError);

  useEffect(() => {
    if (hydrationError) {
      console.error('Language preference could not be loaded.', hydrationError);
    }
  }, [hydrationError]);

  if (!hasHydrated) {
    return <View style={{ flex: 1, backgroundColor: colors.background }} />;
  }

  return children;
};
