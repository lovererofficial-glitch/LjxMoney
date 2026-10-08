import { useLocalSearchParams, router } from 'expo-router';
import { useMemo } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFinanceStore } from '../../src/store/financeStore';
import { useI18n } from '../../src/i18n';
import { colors, radius, spacing, typography } from '../../src/theme/theme';
import { WalletForm } from '../../src/components/WalletForm';

export default function WalletEditorScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();

  const wallets = useFinanceStore((state) => state.wallets);
  const addWallet = useFinanceStore((state) => state.addWallet);
  const updateWallet = useFinanceStore((state) => state.updateWallet);
  const hasHydrated = useFinanceStore((state) => state.hasHydrated);

  const initial = useMemo(() => {
    if (!id) {
      return null;
    }
    return wallets.find((wallet) => wallet.id === id) ?? null;
  }, [id, wallets]);

  if (!hasHydrated) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <Text style={styles.loading}>{t('common.loading')}</Text>
      </View>
    );
  }

  if (id && !initial) {
    return (
      <View style={[styles.screen, styles.fullScreen, { paddingTop: insets.top }]}>
        <Text style={styles.error}>{t('wallet.unavailable')}</Text>
        <Pressable onPress={() => router.back()} style={styles.primaryButton}>
          <Text style={styles.primaryLabel}>{t('common.back')}</Text>
        </Pressable>
      </View>
    );
  }

  const handleSave = (wallet: Omit<import('../../src/features/finance/models').Wallet, 'id' | 'createdAt' | 'updatedAt'>) => {
    try {
      if (initial) {
        updateWallet(initial.id, {
          name: wallet.name,
          type: wallet.type,
          color: wallet.color,
          icon: wallet.icon,
          initialBalance: wallet.initialBalance,
        });
      } else {
        const now = new Date().toISOString();
        addWallet({
          id: `wallet-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          name: wallet.name,
          type: wallet.type,
          color: wallet.color,
          icon: wallet.icon,
          initialBalance: wallet.initialBalance,
          archivedAt: null,
          createdAt: now,
          updatedAt: now,
        });
      }
    } catch (saveError) {
      const duplicate = saveError instanceof Error && saveError.message.includes('already exists');
      Alert.alert(
        duplicate ? t('wallet.duplicateNameTitle') : t('wallet.saveFailedTitle'),
        duplicate ? t('wallet.duplicateName') : t('validation.walletSaveFailed'),
        [
        { text: t('common.cancel'), style: 'cancel' },
        ],
      );
      return;
    }
    router.back();
  };

  return (
    <WalletForm
      initial={initial}
      onCancel={() => router.back()}
      onSave={handleSave}
    />
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  fullScreen: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
  },
  loading: {
    fontSize: typography.body,
    color: colors.textSecondary,
  },
  error: {
    fontSize: typography.body,
    color: colors.danger,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  primaryButton: {
    minHeight: 44,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    paddingHorizontal: spacing.md,
  },
  primaryLabel: {
    fontSize: typography.body,
    color: colors.background,
    fontWeight: '600',
  },
});
