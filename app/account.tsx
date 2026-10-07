import { format } from 'date-fns';
import { router } from 'expo-router';
import { Suspense, use, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuthStore } from '../src/auth/authStore';
import { translateAuthError, useI18n } from '../src/i18n';
import type { TranslationKey } from '../src/i18n';
import { fetchProfile, saveProfileDisplayName } from '../src/lib/profiles';
import { getSupabaseClient, isSupabaseConfigured } from '../src/lib/supabase';
import { requestSyncNow } from '../src/sync/syncRuntime';
import { useSyncStatusStore, type SyncPhase } from '../src/sync/syncStatusStore';
import { useFinanceStore } from '../src/store/financeStore';
import { colors, radius, spacing, typography } from '../src/theme/theme';

const phaseKeys: Record<SyncPhase, TranslationKey> = {
  'signed-out': 'sync.statusSignedOut',
  idle: 'sync.statusIdle',
  syncing: 'sync.statusSyncing',
  synced: 'sync.statusSynced',
  offline: 'sync.statusOffline',
  failed: 'sync.statusFailed',
  blocked: 'sync.statusBlocked',
};

const loadProfileName = (userId: string): Promise<string> => {
  const client = getSupabaseClient();
  if (!client) {
    return Promise.resolve('');
  }
  return fetchProfile(client, userId)
    .then((profile) => profile.displayName ?? '')
    .catch((error) => {
      console.error('Profile could not be loaded.', error);
      return '';
    });
};

const profileNameCache = new Map<string, Promise<string>>();

const getProfileName = (userId: string): Promise<string> => {
  const cached = profileNameCache.get(userId);
  if (cached) {
    return cached;
  }
  const pending = loadProfileName(userId);
  profileNameCache.set(userId, pending);
  return pending;
};

function ProfileNameCard({ userId, email }: { userId: string; email: string }) {
  const { t } = useI18n();
  const initialName = use(getProfileName(userId));
  const [nameDraft, setNameDraft] = useState(initialName);
  const [savedName, setSavedName] = useState(initialName);
  const [profileError, setProfileError] = useState('');

  const saveName = async () => {
    const client = getSupabaseClient();
    if (!client) {
      return;
    }
    try {
      setProfileError('');
      await saveProfileDisplayName(client, userId, nameDraft.trim());
      setSavedName(nameDraft.trim());
    } catch (error) {
      console.error('Display name could not be saved.', error);
      setProfileError(translateAuthError('unknown', t));
    }
  };

  const shownName = savedName || email;

  return (
    <View style={styles.card}>
      <View style={styles.profileRow}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{shownName.charAt(0).toUpperCase()}</Text>
        </View>
        <View style={styles.profileText}>
          <Text style={styles.cardTitle}>{shownName}</Text>
          <Text style={styles.cardHint}>{email}</Text>
        </View>
      </View>
      <Text style={styles.fieldLabel}>{t('auth.displayName')}</Text>
      <View style={styles.nameRow}>
        <TextInput
          autoCapitalize="none"
          onChangeText={setNameDraft}
          placeholder={t('auth.displayName')}
          placeholderTextColor={colors.textSecondary}
          style={styles.input}
          value={nameDraft}
        />
        <Pressable accessibilityRole="button" onPress={saveName} style={styles.saveButton}>
          <Text style={styles.saveLabel}>{t('common.save')}</Text>
        </Pressable>
      </View>
      {profileError ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {profileError}
        </Text>
      ) : null}
    </View>
  );
}

export default function AccountScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  const status = useAuthStore((state) => state.status);
  const user = useAuthStore((state) => state.user);
  const authError = useAuthStore((state) => state.error);
  const signOut = useAuthStore((state) => state.signOut);
  const syncPhase = useSyncStatusStore((state) => state.phase);
  const lastSyncedAt = useSyncStatusStore((state) => state.lastSyncedAt);
  const syncErrorDetail = useSyncStatusStore((state) => state.errorDetail);

  const handleSignOut = async () => {
    await signOut();
  };

  const exportData = async () => {
    try {
      const state = useFinanceStore.getState();
      const payload = JSON.stringify({
        exportedAt: new Date().toISOString(),
        transactions: state.transactions,
        categories: state.categories,
        wallets: state.wallets,
        budgets: state.budgets,
        goals: state.goals,
        goalContributions: state.goalContributions,
        streak: state.streak,
      });
      await Share.share({ message: payload, title: 'LjxMoney export' });
    } catch (error) {
      console.error('Data export failed.', error);
    }
  };

  return (
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
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/settings'))}
          style={styles.backButton}
        >
          <Text style={styles.back}>{t('common.back')}</Text>
        </Pressable>
        <Text style={styles.title}>{t('settings.account')}</Text>
        <View style={styles.backButton} />
      </View>

      {status === 'bootstrapping' ? (
        <ActivityIndicator color={colors.accent} style={styles.loader} />
      ) : null}

      {!isSupabaseConfigured ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('auth.notConfigured')}</Text>
          <Text style={styles.cardHint}>{t('auth.localOnlyNote')}</Text>
        </View>
      ) : null}

      {isSupabaseConfigured && status === 'unauthenticated' && !user ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('settings.account')}</Text>
          <Text style={styles.cardHint}>{t('auth.localOnlyNote')}</Text>
          <Pressable accessibilityRole="button" onPress={() => router.push('/login')} style={styles.primaryButton}>
            <Text style={styles.primaryLabel}>{t('auth.signIn')}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => router.push('/register')} style={styles.secondaryButton}>
            <Text style={styles.secondaryLabel}>{t('auth.createAccount')}</Text>
          </Pressable>
          {authError ? (
            <Text accessibilityRole="alert" style={styles.error}>
              {translateAuthError(authError, t)}
            </Text>
          ) : null}
        </View>
      ) : null}

      {user ? (
        <>
          <Suspense fallback={<ActivityIndicator color={colors.accent} style={styles.loader} />}>
            <ProfileNameCard userId={user.id} email={user.email} />
          </Suspense>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t('sync.cloud')}</Text>
            <Text style={styles.syncStatus}>{t(phaseKeys[syncPhase])}</Text>
            {syncPhase === 'failed' && syncErrorDetail ? (
              <Text style={styles.error}>
                {t('sync.details')} {syncErrorDetail}
              </Text>
            ) : null}
            {lastSyncedAt ? (
              <Text style={styles.cardHint}>
                {t('sync.lastSynced', { time: format(new Date(lastSyncedAt), 'HH:mm dd/MM/yyyy') })}
              </Text>
            ) : null}
            <Pressable
              accessibilityRole="button"
              disabled={syncPhase === 'syncing'}
              onPress={requestSyncNow}
              style={[styles.secondaryButton, syncPhase === 'syncing' && styles.buttonDisabled]}
            >
              <Text style={styles.secondaryLabel}>
                {t(syncPhase === 'failed' ? 'sync.retry' : 'sync.syncNow')}
              </Text>
            </Pressable>
          </View>

          <View style={styles.card}>
            <Pressable accessibilityRole="button" onPress={() => router.push('/change-password')}>
              <Text style={styles.row}>{t('auth.changePassword')}</Text>
            </Pressable>
            <View style={styles.divider} />
            <Pressable accessibilityRole="button" onPress={exportData}>
              <Text style={styles.row}>{t('auth.exportData')}</Text>
            </Pressable>
            <Text style={styles.cardHint}>{t('auth.exportHint')}</Text>
          </View>

          <Pressable accessibilityRole="button" onPress={handleSignOut} style={styles.signOutButton}>
            <Text style={styles.signOutLabel}>{t('auth.signOut')}</Text>
          </Pressable>
        </>
      ) : null}
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
  loader: { marginTop: spacing.xl },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  cardTitle: { color: colors.text, fontSize: 16, fontWeight: '700' },
  cardHint: { color: colors.textSecondary, fontSize: 13, lineHeight: 19, marginTop: 4 },
  profileRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.sm },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: colors.accent, fontSize: 22, fontWeight: '800' },
  profileText: { flex: 1 },
  fieldLabel: { color: colors.textSecondary, fontSize: 13, fontWeight: '600', marginTop: spacing.md },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs },
  input: {
    flex: 1,
    minHeight: 46,
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    color: colors.text,
    fontSize: 16,
  },
  saveButton: {
    minHeight: 46,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveLabel: { color: colors.background, fontSize: 14, fontWeight: '800' },
  syncStatus: { color: colors.accent, fontSize: 15, fontWeight: '700', marginTop: spacing.xs },
  row: { color: colors.text, fontSize: 15, fontWeight: '600', paddingVertical: spacing.sm },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  primaryButton: {
    minHeight: 50,
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.md,
  },
  primaryLabel: { color: colors.background, fontSize: 16, fontWeight: '800' },
  secondaryButton: {
    minHeight: 50,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
  },
  secondaryLabel: { color: colors.accent, fontSize: 16, fontWeight: '700' },
  buttonDisabled: { opacity: 0.55 },
  signOutButton: {
    minHeight: 50,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
  },
  signOutLabel: { color: colors.danger, fontSize: 16, fontWeight: '700' },
  error: { color: colors.expense, fontSize: 13, lineHeight: 19, marginTop: spacing.sm },
});

