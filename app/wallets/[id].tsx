import { useLocalSearchParams, router } from 'expo-router';
import { useMemo } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { calculateWalletBalance } from '../../src/features/finance/financeEngine';
import { useFinanceStore } from '../../src/store/financeStore';
import { localizeCategoryName, localizeWalletName, localizeWalletType, useI18n } from '../../src/i18n';
import { colors, radius, spacing, typography } from '../../src/theme/theme';

export default function WalletDetailScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { language, t } = useI18n();
  const insets = useSafeAreaInsets();

  const wallets = useFinanceStore((state) => state.wallets);
  const transactions = useFinanceStore((state) => state.transactions);
  const categories = useFinanceStore((state) => state.categories);
  const hasHydrated = useFinanceStore((state) => state.hasHydrated);

  const wallet = useMemo(
    () => (id ? wallets.find((item) => item.id === id) ?? null : null),
    [id, wallets],
  );

  const balance = useMemo(() => {
    if (!wallet) {
      return 0;
    }
    return calculateWalletBalance(wallet.id, transactions, wallets);
  }, [wallet, transactions, wallets]);

  const transactionsForWallet = useMemo(() => {
    if (!wallet) {
      return [] as typeof transactions;
    }
    return transactions.filter((transaction) => {
      return transaction.walletId === wallet.id ||
        transaction.sourceWalletId === wallet.id ||
        transaction.destinationWalletId === wallet.id;
    });
  }, [wallet, transactions]);

  if (!hasHydrated) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <Text style={styles.loading}>{t('common.loading')}</Text>
      </View>
    );
  }

  if (!wallet) {
    return (
      <View style={[styles.screen, styles.fullScreen, { paddingTop: insets.top }]}>
        <Text style={styles.error}>{t('wallet.unavailable')}</Text>
        <Pressable onPress={() => router.back()} style={styles.primaryButton}>
          <Text style={styles.primaryLabel}>{t('common.back')}</Text>
        </Pressable>
      </View>
    );
  }

  const archive = () => {
    Alert.alert(t('wallet.archiveConfirmation'), t('wallet.archiveWarning'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.archive'),
        style: 'destructive',
        onPress: () => {
          useFinanceStore.getState().archiveWallet(wallet.id);
          router.back();
        },
      },
    ]);
  };

  const restore = () => useFinanceStore.getState().restoreWallet(wallet.id);

  return (
    <ScrollView
      style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom + spacing.xl }]}
      contentContainerStyle={styles.content}
    >
      <View style={styles.headerRow}>
        <View style={[styles.colorBadge, { backgroundColor: wallet.color }]} />
        <View style={styles.headerContent}>
          <Text style={styles.title}>{localizeWalletName(wallet.id, wallet.name, t)}</Text>
          <Text style={styles.subtitle}>{localizeWalletType(wallet.type, t)}</Text>
        </View>
      </View>

      <View style={styles.balanceCard}>
        <Text style={styles.cardTitle}>{t('wallet.currentBalance')}</Text>
        <Text style={styles.balance}>{balance.toLocaleString(language === 'vi' ? 'vi-VN' : 'en-US', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 })}</Text>
        {!wallet.archivedAt ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push(`/wallets/adjust/${wallet.id}`)}
            style={({ pressed }) => [styles.adjustButton, pressed && styles.secondaryButtonPressed]}
          >
            <Text style={styles.adjustLabel}>{t('wallet.adjustBalance')}</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t('wallet.walletInformation')}</Text>
        <View style={styles.informationRow}>
          <Text style={styles.informationLabel}>{t('wallet.type')}</Text>
          <Text style={styles.informationValue}>{localizeWalletType(wallet.type, t)}</Text>
        </View>
        <View style={styles.informationRow}>
          <Text style={styles.informationLabel}>{t('wallet.name')}</Text>
          <Text style={styles.informationValue}>{localizeWalletName(wallet.id, wallet.name, t)}</Text>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t('wallet.history')}</Text>
        {transactionsForWallet.length === 0 ? (
          <Text style={styles.empty}>{t('wallet.noTransactions')}</Text>
        ) : (
          <View style={styles.list}>
            {transactionsForWallet.slice(0, 10).map((transaction) => (
              <Pressable
                key={transaction.id}
                onPress={transaction.type === 'adjustment'
                  ? () => router.push(`/wallets/adjust/${wallet.id}?transactionId=${transaction.id}`)
                  : undefined}
                disabled={transaction.type !== 'adjustment'}
                style={styles.row}
              >
                <Text style={styles.rowDate}>{transaction.date}</Text>
                <View style={styles.rowMeta}>
                  <Text style={styles.rowAction}>{t(`transaction.${transaction.type}`)}</Text>
                  <Text style={styles.rowCategory}>
                    {transaction.type === 'adjustment'
                      ? transaction.note || t('transaction.adjustment')
                      : localizeCategoryName(
                          transaction.categoryId,
                          categories.find((category) => category.id === transaction.categoryId)?.name ?? transaction.categoryId,
                          t,
                        )}
                  </Text>
                </View>
                <Text style={[
                  styles.rowAmount,
                  transaction.type === 'income' || (transaction.type === 'adjustment' && transaction.adjustmentDirection !== 'decrease')
                    ? styles.positive
                    : styles.negative,
                ]}>
                  {transaction.type === 'adjustment'
                    ? `${transaction.adjustmentDirection === 'decrease' ? '-' : '+'}`
                    : transaction.type === 'income' ? '+' : '-'}
                  {transaction.amount.toLocaleString(language === 'vi' ? 'vi-VN' : 'en-US', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 })}
                </Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>

      <View style={styles.actions}>
        {wallet.archivedAt ? (
          <Pressable onPress={restore} style={({ pressed }) => [styles.secondaryButton, pressed && styles.secondaryButtonPressed]}>
            <Text style={styles.secondaryLabel}>{t('wallet.restore')}</Text>
          </Pressable>
        ) : null}
        <Pressable onPress={() => router.push(`/wallets/new?id=${wallet.id}`)} style={({ pressed }) => [styles.secondaryButton, pressed && styles.secondaryButtonPressed]}>
          <Text style={styles.secondaryLabel}>{t('common.edit')}</Text>
        </Pressable>
        {!wallet.archivedAt ? (
          <Pressable onPress={archive} style={({ pressed }) => [styles.negativeButton, pressed && styles.negativeButtonPressed]}>
            <Text style={styles.negativeLabel}>{t('common.archive')}</Text>
          </Pressable>
        ) : null}
      </View>
    </ScrollView>
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
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  primaryLabel: {
    fontSize: typography.body,
    color: colors.background,
    fontWeight: '600',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  colorBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  headerContent: {
    flex: 1,
    marginLeft: spacing.md,
  },
  title: {
    fontSize: typography.title,
    color: colors.text,
  },
  subtitle: {
    fontSize: typography.body,
    color: colors.textSecondary,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  balanceCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  cardTitle: {
    fontSize: typography.body,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  balance: {
    fontSize: typography.headline,
    color: colors.text,
  },
  adjustButton: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: colors.accent,
    marginTop: spacing.md,
  },
  adjustLabel: {
    fontSize: typography.body,
    color: colors.background,
    fontWeight: '700',
  },
  informationRow: {
    minHeight: 36,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  informationLabel: {
    fontSize: typography.body,
    color: colors.textSecondary,
  },
  informationValue: {
    fontSize: typography.body,
    color: colors.text,
  },
  list: {
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowDate: {
    fontSize: typography.caption,
    color: colors.textSecondary,
  },
  rowMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  rowAction: {
    fontSize: typography.body,
    color: colors.text,
  },
  rowCategory: {
    fontSize: typography.caption,
    color: colors.textSecondary,
  },
  rowAmount: {
    fontSize: typography.body,
    fontWeight: '700',
  },
  positive: {
    color: colors.income,
  },
  negative: {
    color: colors.expense,
  },
  empty: {
    fontSize: typography.body,
    color: colors.textSecondary,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  secondaryButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  secondaryButtonPressed: {
    opacity: 0.85,
  },
  secondaryLabel: {
    fontSize: typography.body,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  negativeButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: radius.md,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  negativeButtonPressed: {
    opacity: 0.85,
  },
  negativeLabel: {
    fontSize: typography.body,
    color: colors.background,
    fontWeight: '600',
  },
});

