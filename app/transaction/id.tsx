import { parseISO } from 'date-fns';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TransactionForm } from '../../src/components/TransactionForm';
import { formatLocalizedCurrency, formatLocalizedDate } from '../../src/i18n/formatting';
import { localizeCategoryName, localizeWalletName, translateFinanceError, useI18n } from '../../src/i18n';
import type { TranslationKey } from '../../src/i18n';
import { useFinanceStore } from '../../src/store/financeStore';
import { colors, radius, spacing, typography } from '../../src/theme/theme';
import { findTransactionById, firstRouteParam } from '../../src/lib/transactionRoutes';

export default function TransactionDetailScreen() {
  const { id: legacyId, transactionId: routeTransactionId } = useLocalSearchParams<{
    id?: string | string[];
    transactionId?: string | string[];
  }>();
  const id = firstRouteParam(routeTransactionId) ?? firstRouteParam(legacyId);
  const insets = useSafeAreaInsets();
  const { language, t } = useI18n();
  const [editing, setEditing] = useState(false);
  const transaction = useFinanceStore((state) =>
    findTransactionById(state.transactions, id),
  );
  const category = useFinanceStore((state) =>
    state.categories.find((item) => item.id === transaction?.categoryId),
  );
  const wallet = useFinanceStore((state) =>
    state.wallets.find((item) => item.id === transaction?.walletId),
  );
  const sourceWallet = useFinanceStore((state) =>
    state.wallets.find((item) => item.id === transaction?.sourceWalletId),
  );
  const destinationWallet = useFinanceStore((state) =>
    state.wallets.find((item) => item.id === transaction?.destinationWalletId),
  );
  const hasHydrated = useFinanceStore((state) => state.hasHydrated);
  const updateTransaction = useFinanceStore((state) => state.updateTransaction);
  const deleteTransaction = useFinanceStore((state) => state.deleteTransaction);

  if (editing && transaction) {
    return (
      <TransactionForm
        initialTransaction={transaction}
        onCancel={() => setEditing(false)}
        onSave={(values) => {
          updateTransaction(transaction.id, values);
          setEditing(false);
        }}
      />
    );
  }

  if (!hasHydrated) {
    return (
      <View style={[styles.screen, styles.centered, { paddingTop: insets.top }]}>
        <Text style={styles.muted}>{t('transaction.loading')}</Text>
      </View>
    );
  }

  if (!transaction) {
    return (
      <View style={[styles.screen, styles.centered, { paddingTop: insets.top }]}>
        <Text style={styles.title}>{t('transaction.unavailable')}</Text>
        <Text style={styles.muted}>{t('transaction.unavailableMessage')}</Text>
        <Pressable onPress={() => router.back()} style={styles.primaryButton}>
          <Text style={styles.primaryLabel}>{t('common.back')}</Text>
        </Pressable>
      </View>
    );
  }

  const positive = transaction.type === 'income' ||
    (transaction.type === 'adjustment' && transaction.adjustmentDirection !== 'decrease');
  const amountColor =
    transaction.type === 'transfer'
      ? colors.accent
      : positive
        ? colors.income
        : colors.expense;
  const typeLabel = t(
    transaction.type === 'adjustment'
      ? 'transaction.adjustment'
      : `transaction.${transaction.type}` as TranslationKey,
  );

  const confirmDelete = () => {
    Alert.alert(
      t('transaction.deleteConfirmation'),
      t('transaction.deleteWarning'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: () => {
            try {
              deleteTransaction(transaction.id);
              router.back();
            } catch (error) {
              Alert.alert(
                t('transaction.deleteFailed'),
                translateFinanceError(error, t, 'dialog.tryAgain'),
              );
            }
          },
        },
      ],
    );
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.sm, paddingBottom: insets.bottom + spacing.md }]}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.headerButton}>
          <Text style={styles.backLabel}>{t('common.back')}</Text>
        </Pressable>
        <Text style={styles.headerTitle}>{t('transaction.transaction')}</Text>
        <View style={styles.headerButton} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.summary}>
          <Text style={[styles.type, { color: amountColor }]}>{typeLabel.toUpperCase()}</Text>
          <Text style={[styles.amount, { color: amountColor }]} adjustsFontSizeToFit numberOfLines={1}>
            {transaction.type === 'transfer'
              ? formatLocalizedCurrency(transaction.amount, language)
              : `${positive ? '+' : '-'}${formatLocalizedCurrency(transaction.amount, language)}`}
          </Text>
          <Text style={styles.categoryName}>
            {transaction.type === 'transfer'
              ? `${sourceWallet ? localizeWalletName(sourceWallet.id, sourceWallet.name, t) : wallet ? localizeWalletName(wallet.id, wallet.name, t) : t('transaction.from')} → ${destinationWallet ? localizeWalletName(destinationWallet.id, destinationWallet.name, t) : t('transaction.to')}`
              : transaction.type === 'adjustment'
                ? transaction.note || typeLabel
              : category ? localizeCategoryName(category.id, category.name, t) : t('transaction.category')}
          </Text>
          {transaction.note ? <Text style={styles.note}>{transaction.note}</Text> : null}
        </View>

        <View style={styles.details}>
          <DetailRow label={t('transaction.date')} value={formatLocalizedDate(parseISO(transaction.date), 'dd MMMM yyyy', language)} />
          <DetailRow label={t('transaction.time')} value={transaction.time} />
          <DetailRow
            label={transaction.type === 'transfer' ? t('transaction.from') : t('transaction.wallet')}
            value={
              transaction.type === 'transfer'
                ? sourceWallet ? localizeWalletName(sourceWallet.id, sourceWallet.name, t) : wallet ? localizeWalletName(wallet.id, wallet.name, t) : t('transaction.wallet')
                : wallet ? localizeWalletName(wallet.id, wallet.name, t) : t('transaction.wallet')
            }
          />
          {transaction.type === 'transfer' ? (
            <DetailRow
              label={t('transaction.to')}
              value={destinationWallet ? localizeWalletName(destinationWallet.id, destinationWallet.name, t) : t('transaction.wallet')}
            />
          ) : null}
          {transaction.type === 'adjustment' ? (
            <DetailRow label={t('wallet.reason')} value={transaction.note || typeLabel} />
          ) : null}
        </View>

        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            onPress={() => transaction.type === 'adjustment'
              ? router.push(`/wallets/adjust/${transaction.walletId}?transactionId=${transaction.id}`)
              : setEditing(true)}
            style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
          >
            <Text style={styles.primaryLabel}>{t('transaction.editTransaction')}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={confirmDelete}
            style={({ pressed }) => [styles.deleteButton, pressed && styles.pressed]}
          >
            <Text style={styles.deleteLabel}>{t('transaction.deleteTransaction')}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const DetailRow = ({ label, value }: { label: string; value: string }) => (
  <View style={styles.detailRow}>
    <Text style={styles.detailLabel}>{label}</Text>
    <Text style={styles.detailValue}>{value}</Text>
  </View>
);

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, paddingHorizontal: spacing.lg },
  centered: { justifyContent: 'center', alignItems: 'center', gap: spacing.md },
  header: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerButton: { minWidth: 60 },
  backLabel: { color: colors.accent, fontSize: 15 },
  headerTitle: { color: colors.text, fontSize: 17, fontWeight: '700' },
  content: { flexGrow: 1, paddingTop: spacing.xl },
  summary: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.xl,
    alignItems: 'center',
  },
  type: { fontSize: 13, fontWeight: '800', letterSpacing: 1.2 },
  amount: {
    width: '100%',
    textAlign: 'center',
    fontSize: typography.display,
    fontWeight: '800',
    marginTop: spacing.md,
  },
  categoryName: { color: colors.text, fontSize: 18, fontWeight: '700', marginTop: spacing.md },
  note: { color: colors.textSecondary, fontSize: 15, marginTop: spacing.xs },
  details: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.lg,
  },
  detailRow: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  detailLabel: { color: colors.textSecondary, fontSize: 15 },
  detailValue: { color: colors.text, fontSize: 15, fontWeight: '600' },
  actions: { gap: spacing.sm, marginTop: spacing.xl },
  primaryButton: {
    minHeight: 54,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  primaryLabel: { color: colors.background, fontSize: 16, fontWeight: '800' },
  deleteButton: {
    minHeight: 54,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceElevated,
  },
  deleteLabel: { color: colors.expense, fontSize: 15, fontWeight: '700' },
  muted: { color: colors.textSecondary, fontSize: 15 },
  title: { color: colors.text, fontSize: 22, fontWeight: '700' },
  pressed: { opacity: 0.8 },
});
