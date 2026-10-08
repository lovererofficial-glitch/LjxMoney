import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Wallet } from '../features/finance/models';
import { useI18n } from '../i18n';
import { colors, radius, spacing, typography } from '../theme/theme';

interface WalletFormProps {
  initial?: Wallet | null;
  onCancel: () => void;
  onSave: (wallet: Omit<Wallet, 'id' | 'createdAt' | 'updatedAt'>) => void;
}

const ICON_LABELS: Record<string, string> = {
  wallet: 'wallet',
  landmark: 'landmark',
  smartphone: 'smartphone',
  creditcard: 'creditcard',
  folder: 'folder',
  'dots-horizontal': 'dots',
};

const ICON_OPTIONS = ['wallet', 'landmark', 'smartphone', 'creditcard', 'folder', 'dots-horizontal'] as const;
type IconOption = (typeof ICON_OPTIONS)[number];

const COLOR_PALETTE: Wallet['color'][] = [
  '#68E1FD',
  '#3DD598',
  '#C084FC',
  '#FFB454',
  '#F472B6',
  '#FF6B6B',
  '#8EA0B9',
  '#A78BFA',
  '#E172B0',
  '#F7D794',
  '#B7C9F2',
  '#1F2937',
];

const WALLET_TYPES: Wallet['type'][] = ['cash', 'bank', 'ewallet', 'card', 'savings', 'other'];

export const WalletForm = ({ initial, onCancel, onSave }: WalletFormProps) => {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();

  const [name, setName] = useState(initial?.name ?? '');
  const [type, setType] = useState<Wallet['type']>(initial?.type ?? 'cash');
  const [icon, setIcon] = useState<IconOption>(
    ICON_OPTIONS.includes(initial?.icon as IconOption) ? (initial?.icon as IconOption) : 'wallet',
  );
  const [color, setColor] = useState<Wallet['color']>(initial?.color ?? '#68E1FD');
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError(t('validation.walletName'));
      return;
    }
    setError(null);
    onSave({
      name: trimmed,
      type,
      icon,
      color,
      initialBalance: initial?.initialBalance ?? 0,
      archivedAt: initial?.archivedAt ?? null,
    });
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom + spacing.xl }]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.title}>{initial ? t('wallet.editWallet') : t('wallet.addWallet')}</Text>
          <Text style={styles.subtitle}>{initial ? t('wallet.editWallet') : t('wallet.addWallet')}</Text>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.card}>
          <Text style={styles.label}>{t('wallet.name')}</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder={t('wallet.name')}
            placeholderTextColor={colors.textSecondary}
            autoCapitalize="words"
          />
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>{t('wallet.type')}</Text>
          <View style={styles.typeGrid}>
            {WALLET_TYPES.map((option) => (
              <Pressable
                key={option}
                style={({ pressed }) => [styles.typeButton, pressed && styles.buttonPressed, type === option && styles.typeButtonActive]}
                onPress={() => setType(option)}
              >
                <Text style={[styles.typeLabel, type === option && styles.typeLabelActive]}>{t(`wallet.${option}`)}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>{t('wallet.icon')}</Text>
          <View style={styles.iconRow}>
            {ICON_OPTIONS.map((option) => (
              <Pressable
                key={option}
                style={({ pressed }) => [styles.iconButton, pressed && styles.buttonPressed, icon === option && styles.iconButtonActive]}
                onPress={() => setIcon(option)}
              >
                <Text style={styles.iconLabel}>{ICON_LABELS[option]}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>{t('wallet.color')}</Text>
          <View style={styles.colorRow}>
            {COLOR_PALETTE.map((option) => (
              <Pressable
                key={option}
                style={({ pressed }) => [styles.colorButton, pressed && styles.buttonPressed, color === option && styles.colorButtonActive]}
                onPress={() => setColor(option)}
              >
                <View style={[styles.colorSwatch, { backgroundColor: option }]} />
              </Pressable>
            ))}
          </View>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Pressable onPress={onCancel} style={styles.cancelButton}>
          <Text style={styles.cancelLabel}>{t('common.cancel')}</Text>
        </Pressable>
        <Pressable onPress={submit} style={styles.saveButton}>
          <Text style={styles.saveLabel}>{t('common.save')}</Text>
        </Pressable>
      </View>
    </View>
  );
};




const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  buttonPressed: {
    opacity: 0.72,
  },
  content: {
    paddingHorizontal: spacing.xl,
  },
  header: {
    marginTop: spacing.xl,
    paddingBottom: spacing.md,
  },
  title: {
    fontSize: typography.title,
    color: colors.text,
  },
  subtitle: {
    fontSize: typography.body,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  error: {
    fontSize: typography.body,
    color: '#F87171',
    marginBottom: spacing.md,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  label: {
    fontSize: typography.body,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  input: {
    fontSize: typography.body,
    color: colors.text,
    backgroundColor: colors.background,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  typeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  typeButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  typeButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  typeLabel: {
    fontSize: typography.body,
    color: colors.textSecondary,
  },
  typeLabelActive: {
    color: colors.background,
  },
  iconRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  iconButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  iconLabel: {
    fontSize: typography.body,
    color: colors.textSecondary,
  },
  colorRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  colorButton: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  colorButtonActive: {
    borderColor: colors.primary,
  },
  colorSwatch: {
    width: 24,
    height: 24,
    borderRadius: 999,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xl,
  },
  cancelButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  cancelLabel: {
    fontSize: typography.body,
    color: colors.textSecondary,
  },
  saveButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
  },
  saveLabel: {
    fontSize: typography.body,
    color: colors.background,
    fontWeight: '600',
  },
});
