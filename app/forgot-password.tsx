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

export default function ForgotPasswordScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  const pending = useAuthStore((state) => state.pending);
  const error = useAuthStore((state) => state.error);
  const sendPasswordReset = useAuthStore((state) => state.sendPasswordReset);
  const clearError = useAuthStore((state) => state.clearError);
  const [email, setEmail] = useState('');
  const [localError, setLocalError] = useState('');
  const [sent, setSent] = useState(false);

  const submit = async () => {
    clearError();
    const trimmedEmail = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setLocalError(t('auth.invalidEmail'));
      return;
    }
    setLocalError('');
    if (await sendPasswordReset(trimmedEmail)) {
      setSent(true);
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
          <Pressable
            accessibilityRole="button"
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/login'))}
            style={styles.backButton}
          >
            <Text style={styles.back}>{t('common.back')}</Text>
          </Pressable>
          <Text style={styles.title}>{t('auth.resetPassword')}</Text>
          <View style={styles.backButton} />
        </View>

        {sent ? (
          <Text style={styles.success}>{t('auth.resetSent')}</Text>
        ) : (
          <>
            <Text style={styles.fieldLabel}>{t('auth.email')}</Text>
            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              onChangeText={setEmail}
              onSubmitEditing={submit}
              placeholder="you@example.com"
              placeholderTextColor={colors.textSecondary}
              returnKeyType="done"
              style={styles.input}
              value={email}
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
              <Text style={styles.primaryLabel}>{pending ? t('common.loading') : t('auth.sendResetLink')}</Text>
            </Pressable>
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
  success: { color: colors.income, fontSize: 15, lineHeight: 22, marginTop: spacing.lg },
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
});