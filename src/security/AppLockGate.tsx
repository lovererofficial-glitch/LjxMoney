import * as LocalAuthentication from 'expo-local-authentication';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useI18n } from '../i18n';
import { colors, radius, spacing, typography } from '../theme/theme';
import { useSecurityStore } from './securityStore';

export const AppLockGate = ({ children }: { children: React.ReactNode }) => {
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  const hasHydrated = useSecurityStore((state) => state.hasHydrated);
  const appLockEnabled = useSecurityStore((state) => state.appLockEnabled);
  const isAppLocked = useSecurityStore((state) => state.isAppLocked);
  const markUnlocked = useSecurityStore((state) => state.markUnlocked);
  const setAppLocked = useSecurityStore((state) => state.setAppLocked);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const authInFlightRef = useRef(false);
  const foregroundUnlockedRef = useRef(false);
  const previousAppStateRef = useRef(AppState.currentState);

  const authenticate = useCallback(async () => {
    if (!hasHydrated || !appLockEnabled || authInFlightRef.current || isAppLocked) {
      return;
    }

    authInFlightRef.current = true;
    setAppLocked(true);
    setIsAuthenticating(true);

    try {
      const enrolledLevel = await LocalAuthentication.getEnrolledLevelAsync();
      if (enrolledLevel === LocalAuthentication.SecurityLevel.NONE) {
        setAppLocked(false);
        return;
      }

      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: t('settings.appLockUnlockPrompt'),
        cancelLabel: t('settings.appLockCancel'),
      });

      if (result.success) {
        foregroundUnlockedRef.current = true;
        markUnlocked();
      } else {
        setAppLocked(true);
      }
    } catch (error) {
      console.warn('Biometric app lock failed.', error);
      setAppLocked(true);
    } finally {
      authInFlightRef.current = false;
      setIsAuthenticating(false);
    }
  }, [appLockEnabled, hasHydrated, isAppLocked, markUnlocked, setAppLocked, t]);

  useEffect(() => {
    if (!hasHydrated || !appLockEnabled || isAppLocked || authInFlightRef.current || foregroundUnlockedRef.current) {
      return;
    }

    void authenticate();
  }, [appLockEnabled, authenticate, hasHydrated, isAppLocked]);

  useEffect(() => {
    const listener = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'background' || nextState === 'inactive') {
        foregroundUnlockedRef.current = false;
        return;
      }

      if (nextState !== 'active') {
        return;
      }

      if (!hasHydrated || !appLockEnabled || authInFlightRef.current || isAppLocked || foregroundUnlockedRef.current) {
        return;
      }

      if (previousAppStateRef.current !== 'active') {
        void authenticate();
      }

      previousAppStateRef.current = nextState;
    });

    return () => listener?.remove?.();
  }, [appLockEnabled, authenticate, hasHydrated, isAppLocked]);

  if (!appLockEnabled || !isAppLocked || !hasHydrated) {
    return <>{children}</>;
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.lg }]}>
      <View style={styles.card}>
        <Text style={styles.title}>{t('settings.appLock')}</Text>
        <Text style={styles.subtitle}>{t('settings.appLockHint')}</Text>
        <Pressable accessibilityRole="button" disabled={isAuthenticating} onPress={authenticate} style={({ pressed }) => [styles.button, pressed && styles.buttonPressed, isAuthenticating && styles.buttonDisabled]}>
          <Text style={styles.buttonText}>{isAuthenticating ? t('common.loading') : t('settings.appLockToggle')}</Text>
        </Pressable>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background, paddingHorizontal: spacing.lg },
  card: { width: '100%', maxWidth: 420, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.xl },
  title: { color: colors.text, fontSize: typography.title, fontWeight: '800', marginBottom: spacing.sm },
  subtitle: { color: colors.textSecondary, fontSize: 14, lineHeight: 20, marginBottom: spacing.lg },
  button: {
    minHeight: 52,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
  },
  buttonPressed: { opacity: 0.8 },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: colors.background, fontSize: 15, fontWeight: '800' },
});
