import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuthStore } from '../auth/authStore';
import { useI18n } from '../i18n';
import { colors, radius, spacing, typography } from '../theme/theme';
import { Avatar, AvatarLoading } from './Avatar';
import { useProfileAvatarStore } from './avatarStore';

const smallAvatarSize = 120;

export function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  const user = useAuthStore((state) => state.user);
  const clearAvatarForUser = useProfileAvatarStore((state) => state.clearAvatarForUser);
  const setAvatarForUser = useProfileAvatarStore((state) => state.setAvatarForUser);
  const avatars = useProfileAvatarStore((state) => state.avatars);
  const [loading, setLoading] = useState(false);

  const userId = user?.id ?? null;
  const avatarUri = userId ? avatars[userId] ?? null : null;
  const displayName = useMemo(
    () => user?.email?.split('@')[0] || 'LjxMoney',
    [user],
  );

  const pickAvatar = async () => {
    if (!userId) {
      return;
    }

    const status = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status.status !== 'granted') {
      Alert.alert(
        t('profile.permissionDeniedTitle'),
        t('profile.permissionDeniedMessage'),
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
      allowsEditing: true,
      aspect: [1, 1],
    });

    if (result.canceled || !result.assets?.[0]?.uri) {
      return;
    }

    setLoading(true);
    try {
      await setAvatarForUser(userId, result.assets[0].uri);
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
            await clearAvatarForUser(userId);
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
        <Text style={styles.email}>{user?.email || 'ljxmoney'}</Text>

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
  primaryButton: {
    marginTop: spacing.xl,
    width: '100%',
    minHeight: 48,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
