import { format, parseISO } from 'date-fns';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TransactionRow } from '../../src/components/TransactionRow';
import {
  calculateDailyBalance,
  calculateOpeningBalanceForDate,
} from '../../src/features/finance/financeEngine';
import { formatLocalizedCurrency, formatLocalizedDate } from '../../src/i18n/formatting';
import { useI18n } from '../../src/i18n';
import { useFinanceStore } from '../../src/store/financeStore';
import { colors, radius, spacing, typography } from '../../src/theme/theme';

export default function DayDetailScreen() {
  const { date: routeDate } = useLocalSearchParams<{ date: string }>();
  const insets = useSafeAreaInsets();
  const { language, t } = useI18n();
  const transactions = useFinanceStore((state) => state.transactions);
  const wallets = useFinanceStore((state) => state.wallets);
  const hasHydrated = useFinanceStore((state) => state.hasHydrated);
  const date = typeof routeDate === 'string' ? routeDate : format(new Date(), 'yyyy-MM-dd');
  const dayTransactions = useMemo(
    () =>
      transactions
        .filter((transaction) => transaction.date === date)
        .sort((first, second) => first.time.localeCompare(second.time)),
    [date, transactions],
  );
  const dailyBalance = useMemo(
    () =>
      calculateDailyBalance(
        date,
        transactions,
        calculateOpeningBalanceForDate(date, transactions, wallets),
      ),
    [date, transactions, wallets],
  );

  if (!hasHydrated) {
    return (
      <View style={[styles.screen, styles.centered, { paddingTop: insets.top }]}>
        <Text style={styles.muted}>{t('day.loading')}</Text>
      </View>
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.sm, paddingBottom: insets.bottom + spacing.md }]}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backLabel}>{t('common.back')}</Text>
        </Pressable>
        <Text style={styles.headerTitle}>{t('day.detail')}</Text>
        <View style={styles.backButton} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.dateTitle}>{formatLocalizedDate(parseISO(date), 'EEEE, dd MMMM yyyy', language)}</Text>
        <View style={styles.balanceCard}>
          <Text style={styles.cardLabel}>{t('day.closing')}</Text>
          <Text style={styles.closingBalance}>{formatLocalizedCurrency(dailyBalance.closingBalance, language)}</Text>
          <View style={styles.summaryGrid}>
            <SummaryItem label={t('day.opening')} value={dailyBalance.openingBalance} language={language} />
            <SummaryItem label={t('home.income')} value={dailyBalance.income} tone="income" language={language} />
            <SummaryItem label={t('home.expense')} value={dailyBalance.expense} tone="expense" language={language} />
          </View>
        </View>

        <View style={styles.listHeader}>
          <Text style={styles.sectionTitle}>{t('day.transactions')}</Text>
          <Text style={styles.count}>{t(dayTransactions.length === 1 ? 'day.oneItem' : 'day.item', { count: dayTransactions.length })}</Text>
        </View>
        {dayTransactions.length ? (
          dayTransactions.map((transaction) => (
            <TransactionRow
              key={transaction.id}
              transaction={transaction}
              onPress={() =>
                router.push({ pathname: '/transaction/id', params: { id: transaction.id } })
              }
              showDate={false}
            />
          ))
        ) : (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>{t('day.noActivity')}</Text>
            <Text style={styles.muted}>{t('day.carryForward')}</Text>
          </View>
        )}
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push({ pathname: '/transaction/new', params: { date } })}
          style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}
        >
          <Text style={styles.addLabel}>{t('day.addTransaction')}</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const SummaryItem = ({
  label,
  value,
  tone,
  language,
}: {
  label: string;
  value: number;
  tone?: 'income' | 'expense';
  language: 'vi' | 'en';
}) => (
  <View style={styles.summaryItem}>
    <Text style={styles.cardLabel}>{label}</Text>
    <Text style={[styles.summaryValue, tone === 'income' && styles.income, tone === 'expense' && styles.expense]}>
      {formatLocalizedCurrency(value, language)}
    </Text>
  </View>
);

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, paddingHorizontal: spacing.lg },
  centered: { alignItems: 'center', justifyContent: 'center' },
  header: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backButton: { minWidth: 60 },
  backLabel: { color: colors.accent, fontSize: 15 },
  headerTitle: { color: colors.text, fontSize: 17, fontWeight: '700' },
  content: { paddingTop: spacing.lg, paddingBottom: spacing.xl },
  dateTitle: { color: colors.text, fontSize: 23, fontWeight: '800', marginBottom: spacing.lg },
  balanceCard: { backgroundColor: colors.surfaceElevated, borderRadius: radius.lg, padding: spacing.lg },
  cardLabel: { color: colors.textSecondary, fontSize: 12, fontWeight: '700', letterSpacing: 0.7 },
  closingBalance: { color: colors.text, fontSize: typography.headline, fontWeight: '800', marginTop: spacing.xs },
  summaryGrid: { flexDirection: 'row', marginTop: spacing.lg, gap: spacing.sm },
  summaryItem: { flex: 1 },
  summaryValue: { color: colors.text, fontSize: 14, fontWeight: '700', marginTop: 6 },
  income: { color: colors.income },
  expense: { color: colors.expense },
  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },
  sectionTitle: { color: colors.text, fontSize: 18, fontWeight: '700' },
  count: { color: colors.textSecondary, fontSize: 13 },
  emptyCard: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.lg, gap: spacing.xs },
  emptyTitle: { color: colors.text, fontSize: 16, fontWeight: '700' },
  muted: { color: colors.textSecondary, fontSize: 14 },
  addButton: {
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: colors.accent,
    marginTop: spacing.lg,
  },
  addLabel: { color: colors.background, fontSize: 15, fontWeight: '800' },
  pressed: { opacity: 0.75 },
});
