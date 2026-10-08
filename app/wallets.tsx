import { router } from 'expo-router';
import { useMemo } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { calculateWalletBalance } from '../src/features/finance/financeEngine';
import { useFinanceStore } from '../src/store/financeStore';
import { localizeWalletName, localizeWalletType, useI18n } from '../src/i18n';
import { colors, radius, spacing, typography } from '../src/theme/theme';

const WALLET_GLYPHS: Record<string, string> = {
  wallet: '$',
  landmark: 'B',
  smartphone: 'M',
  creditcard: 'C',
  folder: 'S',
  'dots-horizontal': '...',
};

export default function WalletsScreen() {
  const { language, t } = useI18n();
  const insets = useSafeAreaInsets();

  const wallets = useFinanceStore((state) => state.wallets);
  const transactions = useFinanceStore((state) => state.transactions);
  const hasHydrated = useFinanceStore((state) => state.hasHydrated);

  const activeWallets = useMemo(() => wallets.filter((wallet) => !wallet.archivedAt), [wallets]);
  const archivedWallets = useMemo(() => wallets.filter((wallet) => wallet.archivedAt), [wallets]);

  const totalBalance = useMemo(() => {
    let total = 0;
    for (const wallet of wallets) {
      total += calculateWalletBalance(wallet.id, transactions, wallets);
    }
    return total;
  }, [wallets, transactions]);

  if (!hasHydrated) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <Text style={styles.loading}>{t('common.loading')}</Text>
      </View>
    );
  }

  const openEdit = (wallet: (typeof wallets)[number]) => {
    router.push(`/wallets/new?id=${wallet.id}`);
  };

  const archive = (wallet: (typeof wallets)[number]) => {
    Alert.alert(t('wallet.archiveConfirmation'), t('wallet.archiveWarning'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.archive'),
        style: 'destructive',
        onPress: () => {
          useFinanceStore.getState().archiveWallet(wallet.id);
        },
      },
    ]);
  };

  const restore = (wallet: (typeof wallets)[number]) => {
    useFinanceStore.getState().restoreWallet(wallet.id);
  };

  const renderWallet = (wallet: (typeof wallets)[number], archived = false) => (
    <View key={wallet.id} style={[styles.row, archived && styles.archivedRow]}>
      <View style={[styles.walletIcon, { backgroundColor: `${wallet.color}24`, borderColor: `${wallet.color}80` }]}>
        <Text style={[styles.walletGlyph, { color: wallet.color }]}>{WALLET_GLYPHS[wallet.icon ?? 'wallet'] ?? '$'}</Text>
      </View>
      <View style={styles.rowContent}>
        <Text numberOfLines={1} style={styles.rowName}>{localizeWalletName(wallet.type, wallet.name, t)}</Text>
        <Text style={styles.rowType}>{localizeWalletType(wallet.type, t)}{archived ? ` · ${t('wallet.archived')}` : ''}</Text>
      </View>
      <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.rowBalance, archived && styles.rowBalanceDisabled]}>
        {calculateWalletBalance(wallet.id, transactions, wallets).toLocaleString(language === 'vi' ? 'vi-VN' : 'en-US', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 })}
      </Text>
      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${t('common.edit')} ${wallet.name}`}
          onPress={() => openEdit(wallet)}
          style={({ pressed }) => [styles.iconAction, pressed && styles.actionPressed]}
        >
          <Text style={styles.actionGlyph}>...</Text>
        </Pressable>
        {archived ? (
          <Pressable onPress={() => restore(wallet)} style={({ pressed }) => [styles.textAction, pressed && styles.actionPressed]}>
            <Text style={styles.restoreLabel}>{t('wallet.restore')}</Text>
          </Pressable>
        ) : (
          <Pressable onPress={() => archive(wallet)} style={({ pressed }) => [styles.textAction, pressed && styles.actionPressed]}>
            <Text style={styles.actionLabel}>{t('common.archive')}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );

  return (
    <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom + spacing.xl }]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.totalBlock}>
          <Text style={styles.totalLabel}>{t('wallet.totalBalance')}</Text>
          <Text style={styles.totalValue}>{totalBalance.toLocaleString(language === 'vi' ? 'vi-VN' : 'en-US', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 })}</Text>
          <View style={styles.totalRule} />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('wallet.active')}</Text>
          <View style={styles.list}>
            {activeWallets.length ? activeWallets.map((wallet) => renderWallet(wallet)) : (
              <Text style={styles.emptyText}>{t('wallet.noActiveWallets')}</Text>
            )}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('wallet.archived')}</Text>
          <View style={styles.list}>
            {archivedWallets.length ? archivedWallets.map((wallet) => renderWallet(wallet, true)) : (
              <Text style={styles.emptyText}>{t('wallet.noArchivedWallets')}</Text>
            )}
          </View>
        </View>
      </ScrollView>

      <Pressable
        onPress={() => router.push('/wallets/new')}
        accessibilityRole="button"
        style={({ pressed }) => [styles.addButton, pressed && styles.fabPressed]}
      >
        <Text style={styles.fabIcon}>{t('wallet.addAction')}</Text>
      </Pressable>
    </View>
  );
}


const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingHorizontal: spacing.xl,
  },
  loading: {
    fontSize: typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  totalBlock: {
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
    marginBottom: spacing.md,
  },
  totalLabel: {
    fontSize: typography.caption,
    color: colors.textSecondary,
    letterSpacing: 1,
    marginBottom: spacing.sm,
  },
  totalValue: {
    fontSize: typography.display,
    color: colors.text,
    fontWeight: '700',
  },
  totalRule: {
    height: 1,
    backgroundColor: colors.border,
    marginTop: spacing.xl,
  },
  empty: {
    paddingVertical: spacing.md,
  },
  emptyText: {
    fontSize: typography.body,
    color: colors.textSecondary,
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    fontSize: typography.headline,
    color: colors.text,
    fontWeight: '600',
    marginBottom: spacing.sm,
  },
  list: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 76,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  archivedRow: {
    opacity: 0.7,
  },
  walletIcon: {
    width: 42,
    height: 42,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  walletGlyph: {
    fontSize: typography.headline,
    fontWeight: '700',
  },
  rowContent: {
    flex: 1,
    minWidth: 60,
    gap: 4,
  },
  rowName: {
    fontSize: typography.body,
    color: colors.text,
    fontWeight: '600',
  },
  rowNameDisabled: {
    color: colors.textSecondary,
  },
  rowType: {
    fontSize: typography.caption,
    color: colors.textSecondary,
  },
  rowTypeDisabled: {
    color: colors.mutedText,
  },
  rowBalance: {
    fontSize: typography.body,
    color: colors.text,
    fontWeight: '600',
    maxWidth: 110,
  },
  rowBalanceDisabled: {
    color: colors.textSecondary,
  },
  actions: {
    alignItems: 'flex-end',
    gap: spacing.xs,
  },
  iconAction: {
    width: 28,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textAction: {
    minHeight: 28,
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
  },
  actionPressed: {
    opacity: 0.7,
  },
  actionLabel: {
    fontSize: typography.caption,
    color: colors.textSecondary,
  },
  restoreLabel: {
    fontSize: typography.caption,
    color: colors.income,
    fontWeight: '600',
  },
  actionGlyph: {
    fontSize: typography.caption,
    color: colors.textSecondary,
  },
  addButton: {
    position: 'absolute',
    bottom: spacing.xl,
    left: spacing.xl,
    right: spacing.xl,
    height: 52,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  fabPressed: {
    opacity: 0.82,
  },
  fabIcon: {
    fontSize: typography.body,
    color: colors.background,
    fontWeight: '700',
  },
});