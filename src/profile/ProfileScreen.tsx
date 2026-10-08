import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuthStore } from '../auth/authStore';
import { useI18n } from '../i18n';
import { colors, radius, spacing, typography } from '../theme/theme';
import { Avatar, AvatarLoading } from './Avatar';
import { resolveProfileDisplayName, useProfileAvatarStore } from './avatarStore';
import { requestProfileSyncNow } from './profileSync';
import { removeLocalProfileAvatar, saveProfileAvatarLocally } from './avatarAssets';

const smallAvatarSize = 120;

export function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  const user = useAuthStore((state) => state.user);
  const clearAvatarForUser = useProfileAvatarStore((state) => state.clearAvatarForUser);
  const setAvatarForUser = useProfileAvatarStore((state) => state.setAvatarForUser);
  const setDisplayNameForUser = useProfileAvatarStore((state) => state.setDisplayNameForUser);
  const avatars = useProfileAvatarStore((state) => state.avatars);
  const storedDisplayName = useProfileAvatarStore((state) => (user ? state.displayNames[user.id] ?? null : null));
  const [loading, setLoading] = useState(false);
  const [savingName, setSavingName] = useState(false);
  const [nameDraftState, setNameDraftState] = useState<{ userId: string; value: string } | null>(null);

  const userId = user?.id ?? null;
  const avatarUri = userId ? avatars[userId] ?? null : null;
  const displayName = resolveProfileDisplayName(storedDisplayName, user?.email, t('profile.fallbackName'));
  const nameDraft = userId && nameDraftState?.userId === userId
    ? nameDraftState.value
    : storedDisplayName ?? '';

  const saveDisplayName = async () => {
    if (!userId) {
      return;
    }
    setSavingName(true);
    try {
      await setDisplayNameForUser(userId, nameDraft);
      requestProfileSyncNow();
    } catch {
      Alert.alert(t('profile.nameSaveFailed'));
    } finally {
      setSavingName(false);
    }
  };

  const pickAvatar = async () => {
    if (!userId) {
      return;
    }

    try {
      const status = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!status.granted) {
        Alert.alert(t('profile.permissionDeniedTitle'), t('profile.permissionDeniedMessage'));
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.8,
        allowsEditing: true,
        aspect: [1, 1],
      });
      const asset = result.canceled ? null : result.assets?.[0];
      if (!asset) {
        return;
      }

      setLoading(true);
      const saved = await saveProfileAvatarLocally(userId, asset);
      const previousUri = avatarUri;
      await setAvatarForUser(userId, saved.uri);
      if (previousUri && previousUri !== saved.uri) {
        removeLocalProfileAvatar(userId, previousUri);
      }
      requestProfileSyncNow();
    } catch {
      Alert.alert(t('profile.uploadFailed'));
    } finally {
      setLoading(false);
    }
  };

  const removeAvatar = async () => {
    if (!userId) {
      return;
    }

    Alert.alert(t('profile.removeTitle'), t('profile.removeMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          setLoading(true);
          try {
            const previousUri = avatarUri;
            await clearAvatarForUser(userId);
            if (previousUri) {
              removeLocalProfileAvatar(userId, previousUri);
            }
            requestProfileSyncNow();
          } catch {
            Alert.alert(t('profile.uploadFailed'));
          } finally {
            setLoading(false);
          }
        },
      },
    ]);
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.xl }]}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.back}>{t('common.back')}</Text>
        </Pressable>
        <Text style={styles.title}>{t('profile.title')}</Text>
        <View style={styles.backButton} />
      </View>

      <View style={styles.card}>
        {loading ? (
          <AvatarLoading size={smallAvatarSize} />
        ) : (
          <Avatar
            userEmail={user?.email}
            sourceName={displayName}
            avatarUri={avatarUri}
            size={smallAvatarSize}
            editable
            onPress={pickAvatar}
          />
        )}

        <Text style={styles.name}>{displayName}</Text>
        <Text style={styles.email}>{user?.email || ''}</Text>

        <View style={styles.nameEditor}>
          <Text style={styles.fieldLabel}>{t('profile.displayName')}</Text>
          <TextInput
            autoCapitalize="words"
            onChangeText={(value) => userId && setNameDraftState({ userId, value })}
            placeholder={t('profile.displayName')}
            placeholderTextColor={colors.textSecondary}
            style={styles.input}
            value={nameDraft}
          />
          <Pressable
            accessibilityRole="button"
            disabled={savingName}
            onPress={saveDisplayName}
            style={[styles.primaryButton, savingName && styles.disabledButton]}
          >
            <Text style={styles.primaryLabel}>{t('common.save')}</Text>
          </Pressable>
        </View>

        <Pressable accessibilityRole="button" onPress={pickAvatar} style={styles.primaryButton}>
          <Text style={styles.primaryLabel}>{t('profile.changePhoto')}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={removeAvatar} style={styles.secondaryButton}>
          <Text style={styles.secondaryLabel}>{t('profile.removePhoto')}</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.lg },
  header: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.xl },
  backButton: { minWidth: 64 },
  back: { color: colors.accent, fontSize: 15, fontWeight: '600' },
  title: { color: colors.text, fontSize: typography.title, fontWeight: '800' },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.xl,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  name: { color: colors.text, fontSize: 22, fontWeight: '700', marginTop: spacing.md },
  email: { color: colors.textSecondary, fontSize: 13, marginTop: spacing.xs },
  nameEditor: { width: '100%', marginTop: spacing.xl },
  fieldLabel: { color: colors.textSecondary, fontSize: 13, fontWeight: '600', marginBottom: spacing.xs },
  input: {
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    color: colors.text,
    paddingHorizontal: spacing.md,
    fontSize: typography.body,
  },
  primaryButton: {
    marginTop: spacing.xl,
    width: '100%',
    minHeight: 48,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabledButton: { opacity: 0.65 },
  primaryLabel: { color: colors.background, fontSize: 15, fontWeight: '700' },
  secondaryButton: {
    width: '100%',
    minHeight: 48,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
  },
  secondaryLabel: { color: colors.text, fontSize: 15, fontWeight: '700' },
});
