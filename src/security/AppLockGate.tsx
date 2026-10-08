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
  const appLockEnabled = useSecurityStore((state) => state.appLockEnabled);
  const isAppLocked = useSecurityStore((state) => state.isAppLocked);
  const markUnlocked = useSecurityStore((state) => state.markUnlocked);
  const setAppLocked = useSecurityStore((state) => state.setAppLocked);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const appState = useRef(AppState.currentState);

  const authenticate = useCallback(async () => {
    if (!appLockEnabled || isAuthenticating) {
      return;
    }

    setAppLocked(true);
    setIsAuthenticating(true);
    try {
      const supported = await LocalAuthentication.getEnrolledLevelAsync();
      if (supported === LocalAuthentication.SecurityLevel.NONE) {
        setAppLocked(false);
        return;
      }

      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: t('settings.appLockUnlockPrompt'),
        cancelLabel: t('settings.appLockCancel'),
      });
      if (result.success) {
        markUnlocked();
      } else {
        setAppLocked(true);
      }
    } catch (error) {
      console.warn('Biometric app lock failed.', error);
      setAppLocked(true);
    } finally {
      setIsAuthenticating(false);
    }
  }, [appLockEnabled, isAuthenticating, markUnlocked, setAppLocked, t]);

  useEffect(() => {
    if (!appLockEnabled || isAppLocked) {
      return;
    }

    const startAuthentication = async () => {
      if (!appLockEnabled || isAppLocked) {
        return;
      }
      setAppLocked(true);
      setIsAuthenticating(true);
      try {
        const supported = await LocalAuthentication.getEnrolledLevelAsync();
        if (supported === LocalAuthentication.SecurityLevel.NONE) {
          setAppLocked(false);
          return;
        }

        const result = await LocalAuthentication.authenticateAsync({
          promptMessage: t('settings.appLockUnlockPrompt'),
          cancelLabel: t('settings.appLockCancel'),
        });
        if (result.success) {
          markUnlocked();
        } else {
          setAppLocked(true);
        }
      } catch (error) {
        console.warn('Biometric app lock failed.', error);
        setAppLocked(true);
      } finally {
        setIsAuthenticating(false);
      }
    };

    void startAuthentication();
  }, [appLockEnabled, isAppLocked, markUnlocked, setAppLocked, t]);

  useEffect(() => {
    const listener = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        if (appLockEnabled && appState.current !== 'active') {
          authenticate();
        }
      }
      appState.current = nextState;
    });

    return () => listener?.remove?.();
  }, [appLockEnabled, authenticate]);

  if (!appLockEnabled || !isAppLocked) {
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
