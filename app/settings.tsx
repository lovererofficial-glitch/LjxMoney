import * as LocalAuthentication from 'expo-local-authentication';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useI18n } from '../src/i18n';
import { useLanguageStore } from '../src/i18n/runtime';
import type { Language } from '../src/i18n/types';
import { useAuthStore } from '../src/auth/authStore';
import { Avatar } from '../src/profile/Avatar';
import { resolveProfileDisplayName, useProfileAvatarStore } from '../src/profile/avatarStore';
import { colors, radius, spacing, typography } from '../src/theme/theme';
import { useSecurityStore } from '../src/security/securityStore';

const languageOptions: Language[] = ['vi', 'en'];

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { language, setLanguage, t } = useI18n();
  const hydrationError = useLanguageStore((state) => state.hydrationError);
  const authUser = useAuthStore((state) => state.user);
  const avatarUri = useProfileAvatarStore((state) => (authUser ? state.avatars[authUser.id] ?? null : null));
  const storedDisplayName = useProfileAvatarStore((state) => (authUser ? state.displayNames[authUser.id] ?? null : null));
  const displayName = resolveProfileDisplayName(storedDisplayName, authUser?.email, t('profile.fallbackName'));
  const isBalanceHidden = useSecurityStore((state) => state.isBalanceHidden);
  const toggleBalanceHidden = useSecurityStore((state) => state.toggleBalanceHidden);
  const appLockEnabled = useSecurityStore((state) => state.appLockEnabled);
  const setAppLockEnabled = useSecurityStore((state) => state.setAppLockEnabled);
  const setAppLocked = useSecurityStore((state) => state.setAppLocked);
  const [biometricAvailable, setBiometricAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    LocalAuthentication.getEnrolledLevelAsync().then((level) => {
      if (active) {
        setBiometricAvailable(level !== LocalAuthentication.SecurityLevel.NONE);
      }
    }).catch(() => {
      if (active) {
        setBiometricAvailable(false);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  const handleAppLockToggle = async (nextValue: boolean) => {
    if (!nextValue) {
      setAppLockEnabled(false);
      setAppLocked(false);
      return;
    }
    if (biometricAvailable === false) {
      return;
    }

    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: t('settings.appLockUnlockPrompt'),
        cancelLabel: t('settings.appLockCancel'),
      });
      if (result.success) {
        setAppLockEnabled(true);
        setAppLocked(true);
      }
    } catch {
      // No crash; keep security disabled unless biometric succeeds.
    }
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + 96 },
      ]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.back}>{t('common.back')}</Text>
        </Pressable>
        <Text style={styles.title}>{t('common.settings')}</Text>
        <View style={styles.backButton} />
      </View>

      <Pressable accessibilityRole="button" onPress={() => router.push('/profile')} style={styles.profileCard}>
        <Avatar
          userEmail={authUser?.email}
          sourceName={displayName}
          avatarUri={avatarUri}
          size={52}
          editable
        />
        <View style={styles.profileMeta}>
          <Text style={styles.profileName} numberOfLines={1}>{displayName}</Text>
          <Text style={styles.profileEmail}>{authUser?.email ?? 'ljxmoney'}</Text>
        </View>
      </Pressable>

      <Text style={styles.sectionHeading}>{t('settings.general')}</Text>
      <View style={styles.card}>
        <View style={styles.rowHeading}>
          <View>
            <Text style={styles.rowTitle}>{t('settings.language')}</Text>
            <Text style={styles.rowHint}>{t('settings.languageHint')}</Text>
          </View>
          <Text style={styles.currentLanguage}>
            {language === 'vi' ? t('settings.vietnamese') : t('settings.english')}
          </Text>
        </View>
        <View style={styles.divider} />
        {languageOptions.map((option) => (
          <Pressable
            accessibilityRole="radio"
            accessibilityState={{ selected: language === option }}
            key={option}
            onPress={() => setLanguage(option)}
            style={styles.option}
          >
            <Text style={styles.optionLabel}>
              {option === 'vi' ? t('settings.vietnamese') : t('settings.english')}
            </Text>
            <View style={[styles.radio, language === option && styles.radioSelected]}>
              {language === option ? <Text style={styles.checkmark}>✓</Text> : null}
            </View>
          </Pressable>
        ))}
      </View>

      <View style={[styles.card, styles.toggleCard]}>
        <View style={styles.rowHeading}>
          <View>
            <Text style={styles.rowTitle}>{t('settings.balancePrivacy')}</Text>
            <Text style={styles.rowHint}>{t('settings.balancePrivacyHint')}</Text>
          </View>
          <Switch
            value={isBalanceHidden}
            onValueChange={toggleBalanceHidden}
            accessibilityLabel={t('settings.balancePrivacy')}
          />
        </View>
      </View>

      <View style={[styles.card, styles.toggleCard]}>
        <View style={styles.rowHeading}>
          <View>
            <Text style={styles.rowTitle}>{t('settings.appLock')}</Text>
            <Text style={styles.rowHint}>{biometricAvailable === false ? t('settings.appLockUnavailable') : t('settings.appLockHint')}</Text>
          </View>
          <Switch
            value={appLockEnabled}
            onValueChange={handleAppLockToggle}
            disabled={biometricAvailable === false}
            accessibilityLabel={t('settings.appLockToggle')}
          />
        </View>
      </View>

      {hydrationError ? <Text accessibilityRole="alert" style={styles.error}>{t('settings.preferenceLoadError')}</Text> : null}
      <View style={[styles.card, styles.accountCard]}>
        <Pressable accessibilityRole="button" onPress={() => router.push('/account')}>
          <View style={styles.rowHeading}>
            <View>
              <Text style={styles.rowTitle}>{t('settings.account')}</Text>
              <Text style={styles.rowHint}>{t('settings.accountHint')}</Text>
            </View>
            <Text style={styles.currentLanguage}>›</Text>
          </View>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
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
  profileCard: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  profileAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  profileAvatarText: { color: colors.accent, fontSize: 18, fontWeight: '800' },
  profileMeta: { flex: 1 },
  profileName: { color: colors.text, fontSize: 18, fontWeight: '700' },
  profileEmail: { color: colors.textSecondary, fontSize: 12, marginTop: 4 },
  sectionHeading: { color: colors.textSecondary, fontSize: 14, fontWeight: '700', marginBottom: spacing.sm },
  card: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  rowHeading: { minHeight: 76, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  rowTitle: { color: colors.text, fontSize: 16, fontWeight: '700' },
  rowHint: { color: colors.textSecondary, fontSize: 12, marginTop: 4 },
  currentLanguage: { color: colors.accent, fontSize: 14, fontWeight: '700' },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  option: { minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  optionLabel: { color: colors.text, fontSize: 15, fontWeight: '600' },
  radio: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center', borderRadius: 12, borderWidth: 1, borderColor: colors.border },
  radioSelected: { borderColor: colors.accent, backgroundColor: colors.accent },
  checkmark: { color: colors.background, fontSize: 15, fontWeight: '900' },
  toggleCard: { marginTop: spacing.md },
  error: { color: colors.expense, fontSize: 13, lineHeight: 19, marginTop: spacing.md },
  accountCard: { marginTop: spacing.md },
});
