import { useLocalSearchParams, router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { TransactionForm } from '../../src/components/TransactionForm';
import { useFinanceStore } from '../../src/store/financeStore';
import type { Transaction } from '../../src/features/finance/models';
import { colors } from '../../src/theme/theme';
import { useI18n } from '../../src/i18n';

export default function NewTransactionScreen() {
  const { t } = useI18n();
  const { date, type } = useLocalSearchParams<{
    date?: string;
    type?: 'income' | 'expense' | 'transfer';
  }>();
  const hasHydrated = useFinanceStore((state) => state.hasHydrated);
  const addTransaction = useFinanceStore((state) => state.addTransaction);

  const handleSave = (values: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>) => {
    const now = new Date().toISOString();
    addTransaction({
      ...values,
      id: `txn-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      createdAt: now,
      updatedAt: now,
    });
    router.back();
  };

  if (!hasHydrated) {
    return (
      <View style={styles.loading}>
        <Text style={styles.loadingText}>{t('common.loading')}</Text>
      </View>
    );
  }

  return (
    <TransactionForm
      initialDate={typeof date === 'string' ? date : undefined}
      initialType={typeof type === 'string' ? type : undefined}
      onCancel={() => router.back()}
      onSave={handleSave}
    />
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  loadingText: { color: colors.textSecondary, fontSize: 15 },
});
