import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius } from '../theme/theme';
import { getAvatarInitials } from './avatarStore';

interface AvatarProps {
  userEmail?: string | null;
  sourceName?: string | null;
  avatarUri?: string | null;
  size?: number;
  onPress?: () => void;
  editable?: boolean;
  fallbackText?: string;
}

export const Avatar = ({
  userEmail,
  sourceName,
  avatarUri,
  size = 48,
  onPress,
  editable = false,
  fallbackText,
}: AvatarProps) => {
  const [imageFailed, setImageFailed] = useState(false);
  const initials = useMemo(
    () => getAvatarInitials(userEmail, sourceName) || fallbackText || 'LM',
    [fallbackText, sourceName, userEmail],
  );

  const content = avatarUri && !imageFailed ? (
    <Image
      source={{ uri: avatarUri }}
      style={[styles.image, { width: size, height: size, borderRadius: size / 2 }]}
      onError={() => setImageFailed(true)}
    />
  ) : (
    <View style={[styles.fallback, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={[styles.initials, { fontSize: Math.max(12, size / 2.5) }]}>{initials}</Text>
    </View>
  );

  if (!onPress) {
    return <View style={styles.wrapper}>{content}</View>;
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={editable ? 'Change profile photo' : 'Profile avatar'}
      onPress={onPress}
      style={({ pressed }) => [styles.wrapper, { transform: [{ scale: pressed ? 0.98 : 1 }] }]}
    >
      {content}
      {editable ? <View style={styles.editBadge}><Text style={styles.editBadgeText}>+</Text></View> : null}
    </Pressable>
  );
};

export const AvatarLoading = ({ size = 48 }: { size?: number }) => (
  <View style={[styles.loadingShell, { width: size, height: size, borderRadius: size / 2 }]}>
    <ActivityIndicator size="small" color={colors.accent} />
  </View>
);

const styles = StyleSheet.create({
  wrapper: {
    position: 'relative',
    alignSelf: 'center',
    borderRadius: radius.pill,
    overflow: 'visible',
  },
  image: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  fallback: {
    backgroundColor: 'rgba(215, 181, 109, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(215, 181, 109, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: {
    color: colors.accent,
    fontWeight: '800',
  },
  editBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.background,
  },
  editBadgeText: {
    color: colors.background,
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 14,
  },
  loadingShell: {
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
