import { router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BalanceAdjustmentForm } from '../../../src/components/BalanceAdjustmentForm';
import { calculateBalanceAdjustment, calculateWalletBalance } from '../../../src/features/finance/financeEngine';
import type { Transaction } from '../../../src/features/finance/models';
import { useI18n } from '../../../src/i18n';
import { useFinanceStore } from '../../../src/store/financeStore';
import { colors, radius, spacing, typography } from '../../../src/theme/theme';

const createTransactionId = () => `adjustment-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export default function WalletBalanceAdjustmentScreen() {
  const { id, transactionId } = useLocalSearchParams<{ id: string; transactionId?: string }>();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const wallets = useFinanceStore((state) => state.wallets);
  const transactions = useFinanceStore((state) => state.transactions);
  const hasHydrated = useFinanceStore((state) => state.hasHydrated);
  const addTransaction = useFinanceStore((state) => state.addTransaction);
  const updateTransaction = useFinanceStore((state) => state.updateTransaction);
  const deleteTransaction = useFinanceStore((state) => state.deleteTransaction);

  const wallet = useMemo(() => wallets.find((item) => item.id === id) ?? null, [id, wallets]);
  const initialAdjustment = useMemo(() => {
    if (!transactionId) return undefined;
    return transactions.find((item) => item.id === transactionId && item.type === 'adjustment');
  }, [transactionId, transactions]);
  const validEdit = !transactionId || Boolean(initialAdjustment && initialAdjustment.walletId === id);
  const baselineTransactions = useMemo(
    () => transactions.filter((item) => item.id !== initialAdjustment?.id),
    [transactions, initialAdjustment],
  );
  const currentBalance = wallet
    ? calculateWalletBalance(wallet.id, baselineTransactions, wallets)
    : 0;
  const initialActualBalance = wallet
    ? calculateWalletBalance(wallet.id, transactions, wallets)
    : 0;

  const saveAdjustment = (values: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>) => {
    if (!wallet) return;
    const targetBalance = values.amount === 0 ? currentBalance :
      values.adjustmentDirection === 'decrease'
        ? currentBalance - values.amount
        : currentBalance + values.amount;
    const delta = calculateBalanceAdjustment(currentBalance, targetBalance);
    const now = new Date().toISOString();
    if (!delta) {
      if (initialAdjustment) deleteTransaction(initialAdjustment.id);
      router.back();
      return;
    }
    const transaction = {
      ...values,
      amount: delta.amount,
      adjustmentDirection: delta.adjustmentDirection,
      walletId: wallet.id,
      createdAt: initialAdjustment?.createdAt ?? now,
      updatedAt: now,
    };
    if (initialAdjustment) {
      updateTransaction(initialAdjustment.id, transaction);
    } else {
      addTransaction({ ...transaction, id: createTransactionId() });
    }
    router.back();
  };

  const confirmDeleteAdjustment = () => {
    if (!initialAdjustment) return;
    Alert.alert(t('transaction.deleteConfirmation'), t('transaction.deleteWarning'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () => {
          deleteTransaction(initialAdjustment.id);
          router.back();
        },
      },
    ]);
  };

  if (!hasHydrated) {
    return <View style={[styles.screen, { paddingTop: insets.top }]}><Text style={styles.message}>{t('common.loading')}</Text></View>;
  }
  if (!wallet || !validEdit) {
    return (
      <View style={[styles.screen, styles.unavailable, { paddingTop: insets.top }]}>
        <Text style={styles.message}>{t('wallet.adjustFailed')}</Text>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backLabel}>{t('common.back')}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <BalanceAdjustmentForm
      currentBalance={currentBalance}
      initialActualBalance={initialActualBalance}
      initialAdjustment={initialAdjustment}
      onCancel={() => router.back()}
      onSave={saveAdjustment}
      onDelete={initialAdjustment ? confirmDeleteAdjustment : undefined}
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  unavailable: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg },
  message: { color: colors.textSecondary, fontSize: typography.body, textAlign: 'center' },
  backButton: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    marginTop: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  backLabel: { color: colors.text, fontSize: typography.body },
});