import { router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TransactionRow } from '../../src/components/TransactionRow';
import { calculateWalletBalance } from '../../src/features/finance/financeEngine';
import { formatLocalizedCurrency } from '../../src/i18n/formatting';
import { localizeWalletName, localizeWalletType, useI18n } from '../../src/i18n';
import { useFinanceStore } from '../../src/store/financeStore';
import { colors, radius, spacing, typography } from '../../src/theme/theme';

export default function WalletDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { language, t } = useI18n();
  const wallet = useFinanceStore((state) => state.wallets.find((item) => item.id === id));
  const wallets = useFinanceStore((state) => state.wallets);
  const transactions = useFinanceStore((state) => state.transactions);
  const hasHydrated = useFinanceStore((state) => state.hasHydrated);
  const relatedTransactions = useMemo(
    () =>
      transactions
        .filter((transaction) =>
          transaction.type === 'transfer'
            ? (transaction.sourceWalletId ?? transaction.walletId) === id ||
              transaction.destinationWalletId === id
            : transaction.walletId === id,
        )
        .sort((first, second) =>
          `${second.date}T${second.time}`.localeCompare(`${first.date}T${first.time}`),
        ),
    [id, transactions],
  );

  if (!hasHydrated) {
    return (
      <View style={[styles.screen, styles.centered, { paddingTop: insets.top }]}>
        <Text style={styles.caption}>{t('wallet.loadingOne')}</Text>
      </View>
    );
  }

  if (!wallet) {
    return (
      <View style={[styles.screen, styles.centered, { paddingTop: insets.top }]}>
        <Text style={styles.headerTitle}>{t('wallet.unavailable')}</Text>
        <Pressable onPress={() => router.back()} style={styles.action}>
          <Text style={styles.actionText}>{t('common.back')}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + spacing.xl },
      ]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}><Text style={styles.back}>{t('common.back')}</Text></Pressable>
        <Text style={styles.headerTitle}>{t('wallet.wallet')}</Text>
        <Pressable onPress={() => router.push('/wallets')}><Text style={styles.back}>{t('common.manage')}</Text></Pressable>
      </View>
      <View style={styles.card}>
        <View style={[styles.dot, { backgroundColor: wallet.color }]} />
        <Text style={styles.walletName}>{localizeWalletName(wallet.id, wallet.name, t)}</Text>
        <Text style={styles.walletType}>{localizeWalletType(wallet.type, t)}{wallet.archivedAt ? ` · ${t('common.archived')}` : ''}</Text>
        <Text style={styles.balance}>{formatLocalizedCurrency(calculateWalletBalance(wallet.id, transactions, wallets), language)}</Text>
        <Text style={styles.caption}>{t('wallet.currentBalance')}</Text>
      </View>
      <Text style={styles.sectionTitle}>{t('wallet.history')}</Text>
      {relatedTransactions.length ? relatedTransactions.map((transaction) => (
        <TransactionRow
          key={transaction.id}
          transaction={transaction}
          onPress={() => router.push({ pathname: '/transaction/[id]', params: { id: transaction.id } })}
        />
      )) : (
        <View style={styles.empty}>
          <Text style={styles.caption}>{t('wallet.noTransactions')}</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.lg },
  centered: { justifyContent: 'center', alignItems: 'center', gap: spacing.md },
  header: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerTitle: { color: colors.text, fontSize: 17, fontWeight: '700' },
  back: { color: colors.accent, fontSize: 15, fontWeight: '600' },
  card: { backgroundColor: colors.surface, borderRadius: radius.xl, padding: spacing.xl, alignItems: 'center', marginVertical: spacing.lg },
  dot: { width: 12, height: 12, borderRadius: 6 },
  walletName: { color: colors.text, fontSize: 22, fontWeight: '800', marginTop: spacing.md },
  walletType: { color: colors.textSecondary, fontSize: 13, textTransform: 'capitalize', marginTop: spacing.xs },
  balance: { color: colors.text, fontSize: typography.display, fontWeight: '800', marginTop: spacing.xl },
  caption: { color: colors.textSecondary, fontSize: 13, marginTop: spacing.xs },
  sectionTitle: { color: colors.text, fontSize: 18, fontWeight: '700', marginBottom: spacing.md },
  empty: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg },
  action: { minHeight: 44, justifyContent: 'center' },
  actionText: { color: colors.accent, fontWeight: '700' },
});
