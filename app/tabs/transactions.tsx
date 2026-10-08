import { parseISO } from 'date-fns';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TransactionRow } from '../../src/components/TransactionRow';
import { formatLocalizedDate } from '../../src/i18n/formatting';
import { useI18n } from '../../src/i18n';
import { useFinanceStore } from '../../src/store/financeStore';
import { colors, radius, spacing, typography } from '../../src/theme/theme';

export default function TransactionsScreen() {
  const insets = useSafeAreaInsets();
  const { language, t } = useI18n();
  const transactions = useFinanceStore((state) => state.transactions);
  const hasHydrated = useFinanceStore((state) => state.hasHydrated);
  const orderedTransactions = useMemo(
    () =>
      [...transactions].sort((first, second) =>
        `${second.date}T${second.time}`.localeCompare(`${first.date}T${first.time}`),
      ),
    [transactions],
  );

  if (!hasHydrated) {
    return (
      <View style={[styles.screen, styles.centered, { paddingTop: insets.top }]}>
        <Text style={styles.muted}>{t('common.loading')}</Text>
      </View>
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.lg }]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>{t('transaction.activity')}</Text>
          <Text style={styles.subtitle}>
            {t('common.transactions', { count: transactions.length })}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/transaction/new')}
          style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}
        >
          <Text style={styles.addLabel}>+ {t('common.add')}</Text>
        </Pressable>
      </View>

      {orderedTransactions.length ? (
        <FlatList
          data={orderedTransactions}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 96 }]}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <View style={styles.transactionWrap}>
              <Text style={styles.dateTag}>{formatLocalizedDate(parseISO(item.date), 'dd MMM yyyy', language)}</Text>
              <TransactionRow
                transaction={item}
                onPress={() =>
                  router.push({ pathname: '/transaction/id', params: { id: item.id } })
                }
                showDate={false}
              />
            </View>
          )}
        />
      ) : (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>{t('empty.noTransactions')}</Text>
          <Text style={styles.emptyCopy}>{t('empty.incomeExpenseAppear')}</Text>
          <Pressable onPress={() => router.push('/transaction/new')} style={styles.emptyButton}>
            <Text style={styles.emptyButtonLabel}>{t('empty.addTransaction')}</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, paddingHorizontal: spacing.lg },
  centered: { alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  title: { color: colors.text, fontSize: typography.title, fontWeight: '800' },
  subtitle: { color: colors.textSecondary, fontSize: 14, marginTop: 3 },
  addButton: {
    minHeight: 46,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceElevated,
  },
  addLabel: { color: colors.accent, fontSize: 15, fontWeight: '700' },
  listContent: { flexGrow: 1 },
  transactionWrap: { marginBottom: spacing.xs },
  dateTag: { color: colors.textSecondary, fontSize: 13, marginBottom: spacing.xs, marginLeft: 3 },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xl * 2,
  },
  emptyTitle: { color: colors.text, fontSize: 19, fontWeight: '700' },
  emptyCopy: { color: colors.textSecondary, fontSize: 15, textAlign: 'center', lineHeight: 22, marginTop: spacing.sm },
  emptyButton: {
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
    marginTop: spacing.lg,
  },
  emptyButtonLabel: { color: colors.background, fontSize: 15, fontWeight: '800' },
  muted: { color: colors.textSecondary, fontSize: 15 },
  pressed: { opacity: 0.75 },
});
