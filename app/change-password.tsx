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

export default function ChangePasswordScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  const pending = useAuthStore((state) => state.pending);
  const error = useAuthStore((state) => state.error);
  const updatePassword = useAuthStore((state) => state.updatePassword);
  const clearError = useAuthStore((state) => state.clearError);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [localError, setLocalError] = useState('');
  const [updated, setUpdated] = useState(false);

  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/account');
    }
  };

  const submit = async () => {
    clearError();
    if (password.length < 6) {
      setLocalError(t('auth.passwordMin'));
      return;
    }
    if (password !== confirm) {
      setLocalError(t('auth.passwordMismatch'));
      return;
    }
    setLocalError('');
    if (await updatePassword(password)) {
      setUpdated(true);
      setPassword('');
      setConfirm('');
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
          <Text style={styles.title}>{t('auth.changePassword')}</Text>
          <View style={styles.backButton} />
        </View>

        {updated ? (
          <Text style={styles.success}>{t('auth.passwordUpdated')}</Text>
        ) : (
          <>
            <Text style={styles.fieldLabel}>{t('auth.newPassword')}</Text>
            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              onChangeText={setPassword}
              placeholder="••••••••"
              placeholderTextColor={colors.textSecondary}
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
              <Text style={styles.primaryLabel}>{pending ? t('common.loading') : t('common.save')}</Text>
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