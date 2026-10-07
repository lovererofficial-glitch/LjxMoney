import { router } from 'expo-router';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuthStore } from '../src/auth/authStore';
import { translateAuthError, useI18n } from '../src/i18n';
import { colors, radius, spacing, typography } from '../src/theme/theme';

const goBack = () => {
  if (router.canGoBack()) {
    router.back();
  } else {
    router.replace('/account');
  }
};

export default function RegisterScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  const pending = useAuthStore((state) => state.pending);
  const error = useAuthStore((state) => state.error);
  const signUp = useAuthStore((state) => state.signUp);
  const clearError = useAuthStore((state) => state.clearError);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [localError, setLocalError] = useState('');
  const [confirmSent, setConfirmSent] = useState(false);

  const submit = async () => {
    clearError();
    const trimmedEmail = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setLocalError(t('auth.invalidEmail'));
      return;
    }
    if (password.length < 6) {
      setLocalError(t('auth.passwordMin'));
      return;
    }
    if (password !== confirm) {
      setLocalError(t('auth.passwordMismatch'));
      return;
    }
    setLocalError('');
    const result = await signUp(trimmedEmail, password);
    if (result === 'signed-in') {
      goBack();
    } else if (result === 'confirm-email') {
      setConfirmSent(true);
    }
  };

  const displayError = localError || translateAuthError(error, t);

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.xl },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Pressable accessibilityRole="button" onPress={goBack} style={styles.backButton}>
            <Text style={styles.back}>{t('common.back')}</Text>
          </Pressable>
          <Text style={styles.title}>{t('auth.signUp')}</Text>
          <View style={styles.backButton} />
        </View>

        {confirmSent ? (
          <View style={styles.confirmBox}>
            <Text style={styles.confirmText}>{t('auth.checkEmailConfirm')}</Text>
            <Pressable accessibilityRole="button" onPress={() => router.replace('/login')} style={styles.primaryButton}>
              <Text style={styles.primaryLabel}>{t('auth.backToLogin')}</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <Text style={styles.fieldLabel}>{t('auth.email')}</Text>
            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              onChangeText={setEmail}
              placeholder="you@example.com"
              placeholderTextColor={colors.textSecondary}
              returnKeyType="next"
              style={styles.input}
              value={email}
            />
            <Text style={styles.fieldLabel}>{t('auth.password')}</Text>
            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              onChangeText={setPassword}
              placeholder="••••••••"
              placeholderTextColor={colors.textSecondary}
              returnKeyType="next"
              secureTextEntry
              style={styles.input}
              value={password}
            />
            <Text style={styles.fieldLabel}>{t('auth.confirmPassword')}</Text>
            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              onChangeText={setConfirm}
              onSubmitEditing={submit}
              placeholder="••••••••"
              placeholderTextColor={colors.textSecondary}
              returnKeyType="done"
              secureTextEntry
              style={styles.input}
              value={confirm}
            />

            {displayError ? (
              <Text accessibilityRole="alert" style={styles.error}>
                {displayError}
              </Text>
            ) : null}

            <Pressable
              accessibilityRole="button"
              disabled={pending}
              onPress={submit}
              style={[styles.primaryButton, pending && styles.buttonDisabled]}
            >
              <Text style={styles.primaryLabel}>{pending ? t('common.loading') : t('auth.createAccount')}</Text>
            </Pressable>

            <View style={styles.footer}>
              <Text style={styles.muted}>{t('auth.hasAccount')}</Text>
              <Pressable accessibilityRole="button" onPress={() => router.replace('/login')}>
                <Text style={styles.link}>{t('auth.signIn')}</Text>
              </Pressable>
            </View>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.lg },
  header: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xl,
  },
  backButton: { minWidth: 64 },
  back: { color: colors.accent, fontSize: 15, fontWeight: '600' },
  title: { color: colors.text, fontSize: typography.title, fontWeight: '800' },
  fieldLabel: { color: colors.textSecondary, fontSize: 13, fontWeight: '600', marginTop: spacing.md },
  input: {
    minHeight: 50,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    color: colors.text,
    fontSize: 16,
    marginTop: spacing.xs,
  },
  error: { color: colors.expense, fontSize: 13, lineHeight: 19, marginTop: spacing.md },
  primaryButton: {
    minHeight: 52,
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.xl,
  },
  buttonDisabled: { opacity: 0.55 },
  primaryLabel: { color: colors.background, fontSize: 16, fontWeight: '800' },
  confirmBox: { marginTop: spacing.xl },
  confirmText: { color: colors.text, fontSize: 15, lineHeight: 22 },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    marginTop: spacing.xl,
  },
  muted: { color: colors.textSecondary, fontSize: 14 },
  link: { color: colors.accent, fontSize: 14, fontWeight: '700' },
});