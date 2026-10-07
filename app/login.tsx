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

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  const pending = useAuthStore((state) => state.pending);
  const error = useAuthStore((state) => state.error);
  const signIn = useAuthStore((state) => state.signIn);
  const clearError = useAuthStore((state) => state.clearError);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [localError, setLocalError] = useState('');

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
    setLocalError('');
    if (await signIn(trimmedEmail, password)) {
      goBack();
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
          <Text style={styles.title}>{t('auth.signIn')}</Text>
          <View style={styles.backButton} />
        </View>

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
          onSubmitEditing={submit}
          placeholder="••••••••"
          placeholderTextColor={colors.textSecondary}
          returnKeyType="done"
          secureTextEntry
          style={styles.input}
          value={password}
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
          <Text style={styles.primaryLabel}>{pending ? t('common.loading') : t('auth.signIn')}</Text>
        </Pressable>

        <Pressable accessibilityRole="button" onPress={() => router.push('/forgot-password')} style={styles.centerLink}>
          <Text style={styles.link}>{t('auth.forgotPassword')}</Text>
        </Pressable>

        <View style={styles.footer}>
          <Text style={styles.muted}>{t('auth.noAccount')}</Text>
          <Pressable accessibilityRole="button" onPress={() => router.replace('/register')}>
            <Text style={styles.link}>{t('auth.createAccount')}</Text>
          </Pressable>
        </View>
        <Text style={styles.note}>{t('auth.localOnlyNote')}</Text>
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
  centerLink: { alignItems: 'center', marginTop: spacing.md },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    marginTop: spacing.xl,
  },
  muted: { color: colors.textSecondary, fontSize: 14 },
  link: { color: colors.accent, fontSize: 14, fontWeight: '700' },
  note: { color: colors.textSecondary, fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: spacing.lg },
});
