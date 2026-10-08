import { addDays, addMonths, addWeeks, addYears, format, parseISO } from 'date-fns';
import { router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FinanceBarChart, type FinanceChartPoint } from '../../src/components/FinanceBarChart';
import {
  calculateNetCashFlow,
  getCategoryIncome,
  getCategorySpending,
  getDailyBalanceSeries,
  getDailyExpenseSeries,
  getDailyIncomeSeries,
  getPeriodComparison,
  getPeriodDateRange,
  getStatisticsSummary,
  getTransactionsInDateRange,
  getWalletExpenseSpending,
  getWeekdaySpending,
} from '../../src/features/finance/financeEngine';
import type { StatisticsPeriod } from '../../src/features/finance/models';
import { formatLocalizedCurrency, formatLocalizedDate } from '../../src/i18n/formatting';
import { localizeCategoryName, localizeShortWeekday, useI18n } from '../../src/i18n';
import type { TranslationKey } from '../../src/i18n';
import { useFinanceStore } from '../../src/store/financeStore';
import { colors, radius, spacing, typography } from '../../src/theme/theme';

const periods: StatisticsPeriod[] = ['day', 'week', 'month', 'year'];

export default function StatsScreen() {
  const insets = useSafeAreaInsets();
  const { language, t } = useI18n();
  const [period, setPeriod] = useState<StatisticsPeriod>('month');
  const [anchorDate, setAnchorDate] = useState(() => new Date());
  const transactions = useFinanceStore((state) => state.transactions);
  const categories = useFinanceStore((state) => state.categories);
  const wallets = useFinanceStore((state) => state.wallets);
  const hasHydrated = useFinanceStore((state) => state.hasHydrated);
  const range = useMemo(() => getPeriodDateRange(period, anchorDate), [anchorDate, period]);
  const previousRange = useMemo(
    () => getPeriodDateRange(period, addDays(range.start, -1)),
    [period, range.start],
  );
  const startDate = format(range.start, 'yyyy-MM-dd');
  const endDate = format(range.end, 'yyyy-MM-dd');
  const periodTransactions = useMemo(
    () => getTransactionsInDateRange(transactions, range.start, range.end),
    [range.end, range.start, transactions],
  );
  const previousTransactions = useMemo(
    () => getTransactionsInDateRange(transactions, previousRange.start, previousRange.end),
    [previousRange.end, previousRange.start, transactions],
  );
  const summary = useMemo(() => getStatisticsSummary(periodTransactions), [periodTransactions]);
  const { income, expense, net } = summary;
  const comparison = useMemo(
    () => getPeriodComparison(periodTransactions, previousTransactions),
    [periodTransactions, previousTransactions],
  );
  const dailyIncome = useMemo(
    () => getDailyIncomeSeries(periodTransactions, startDate, endDate),
    [endDate, periodTransactions, startDate],
  );
  const dailyExpense = useMemo(
    () => getDailyExpenseSeries(periodTransactions, startDate, endDate),
    [endDate, periodTransactions, startDate],
  );
  const openingBalance = useMemo(() => {
    const priorTransactions = transactions.filter((transaction) => transaction.date < startDate);
    return (
      wallets.reduce((total, wallet) => total + wallet.initialBalance, 0) +
      calculateNetCashFlow(priorTransactions)
    );
  }, [startDate, transactions, wallets]);
  const dailyBalances = useMemo(
    () => getDailyBalanceSeries(periodTransactions, range.start, range.end, openingBalance),
    [openingBalance, periodTransactions, range.end, range.start],
  );
  const categorySpending = useMemo(
    () => getCategorySpending(periodTransactions, categories),
    [categories, periodTransactions],
  );
  const categoryIncome = useMemo(
    () => getCategoryIncome(periodTransactions, categories),
    [categories, periodTransactions],
  );
  const walletSpending = useMemo(
    () => getWalletExpenseSpending(periodTransactions, wallets),
    [periodTransactions, wallets],
  );
  const weekdaySpending = useMemo(
    () => getWeekdaySpending(periodTransactions),
    [periodTransactions],
  );
  const chartSeries = useMemo(() => {
    if (period === 'year') {
      const months = new Map<string, { income: number; expense: number; balance: number }>();
      dailyIncome.forEach((item, index) => {
        const month = item.date.slice(0, 7);
        const values = months.get(month) ?? { income: 0, expense: 0, balance: 0 };
        values.income += item.value;
        values.expense += dailyExpense[index]?.value ?? 0;
        values.balance = dailyBalances[index]?.closingBalance ?? values.balance;
        months.set(month, values);
      });
      return [...months.entries()].map(([month, values]) => ({
        label: month,
        ...values,
      }));
    }

    return dailyIncome.map((item, index) => ({
      label:
        dailyIncome.length > 14 && index % Math.ceil(dailyIncome.length / 7) !== 0
          ? ''
          : item.date,
      income: item.value,
      expense: dailyExpense[index]?.value ?? 0,
      balance: dailyBalances[index]?.closingBalance ?? 0,
    }));
  }, [dailyBalances, dailyExpense, dailyIncome, period]);
  const formatChartLabel = useCallback(
    (label: string) =>
      period === 'year'
        ? formatLocalizedDate(parseISO(`${label}-01`), 'MMM', language)
        : label
          ? formatLocalizedDate(parseISO(label), 'd', language)
          : '',
    [language, period],
  );
  const balancePoints = useMemo<FinanceChartPoint[]>(
    () => chartSeries.map((item) => ({ label: formatChartLabel(item.label), value: item.balance })),
    [chartSeries, formatChartLabel],
  );
  const cashFlowPoints = useMemo<FinanceChartPoint[]>(
    () => chartSeries.map((item) => ({ label: formatChartLabel(item.label), value: item.income - item.expense })),
    [chartSeries, formatChartLabel],
  );
  const pairedPoints = useMemo<FinanceChartPoint[]>(
    () => chartSeries.map((item) => ({
      label: formatChartLabel(item.label),
      value: item.income,
      secondaryValue: item.expense,
    })),
    [chartSeries, formatChartLabel],
  );
  const weekdayPoints = weekdaySpending.map((item) => ({
    label: localizeShortWeekday(item.day, t),
    value: item.total,
  }));
  const maxCategory = Math.max(...categorySpending.map((item) => item.total), 1);
  const maxWallet = Math.max(...walletSpending.map((item) => item.total), 1);

  const shiftPeriod = (direction: -1 | 1) => {
    setAnchorDate((current) => {
      switch (period) {
        case 'day':
          return addDays(current, direction);
        case 'week':
          return addWeeks(current, direction);
        case 'month':
          return addMonths(current, direction);
        case 'year':
          return addYears(current, direction);
      }
    });
  };

  const rangeLabel =
    period === 'day'
      ? formatLocalizedDate(range.start, 'EEEE, dd MMM yyyy', language)
      : period === 'week'
        ? `${formatLocalizedDate(range.start, 'dd MMM', language)} – ${formatLocalizedDate(range.end, 'dd MMM yyyy', language)}`
        : period === 'month'
          ? formatLocalizedDate(range.start, 'MMMM yyyy', language)
          : formatLocalizedDate(range.start, 'yyyy', language);

  if (!hasHydrated) {
    return (
      <View style={[styles.screen, styles.loading]}>
        <Text style={styles.loadingText}>{t('common.loading')}</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + 96 },
      ]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.eyebrow}>{t('statistics.overview')}</Text>
          <Text style={styles.title}>{t('statistics.title')}</Text>
        </View>
        <Pressable onPress={() => router.push('/tabs/wallets')} style={styles.secondaryButton}>
          <Text style={styles.secondaryLabel}>{t('wallet.wallets')}</Text>
        </Pressable>
      </View>
      <View style={styles.periodSwitch}>
        {periods.map((item) => (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: period === item }}
            key={item}
            onPress={() => setPeriod(item)}
            style={[styles.periodButton, period === item && styles.periodButtonActive]}
          >
            <Text style={[styles.periodText, period === item && styles.periodTextActive]}>
              {t(`statistics.${item}` as TranslationKey)}
            </Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.rangeNavigation}>
        <Pressable accessibilityLabel={t('statistics.previousPeriod')} onPress={() => shiftPeriod(-1)} style={styles.navButton}>
          <Text style={styles.navText}>‹</Text>
        </Pressable>
        <Text style={styles.rangeText}>{rangeLabel}</Text>
        <Pressable accessibilityLabel={t('statistics.nextPeriod')} onPress={() => shiftPeriod(1)} style={styles.navButton}>
          <Text style={styles.navText}>›</Text>
        </Pressable>
      </View>
      <View style={styles.summaryGrid}>
        <SummaryCard label={t('statistics.income')} value={income} tone="income" language={language} />
        <SummaryCard label={t('statistics.expense')} value={expense} tone="expense" language={language} />
        <SummaryCard label={t('statistics.net')} value={net} tone={net >= 0 ? 'income' : 'expense'} language={language} />
      </View>
      <View style={styles.activitySummary}>
        <ActivityMetric label={t('statistics.transfers')} value={formatLocalizedCurrency(summary.transferTotal, language)} />
        <ActivityMetric label={t('statistics.adjustments')} value={formatLocalizedCurrency(summary.adjustmentTotal, language)} />
        <ActivityMetric label={t('statistics.transactionCount')} value={String(summary.transactionCount)} />
      </View>
      <View style={styles.comparisonCard}>
        <Text style={styles.sectionTitle}>
          {t('statistics.comparison', { period: t(`statistics.${period}` as TranslationKey).toLowerCase() })}
        </Text>
        <ComparisonRow label={t('statistics.income')} value={comparison.incomeDelta} expense={false} />
        <ComparisonRow label={t('statistics.expense')} value={comparison.expenseDelta} expense />
        <ComparisonRow label={t('statistics.net')} value={comparison.netDelta} expense={false} />
      </View>

      <FinanceBarChart
        title={t('statistics.balanceOverTime')}
        points={balancePoints}
        primaryColor={colors.accent}
        valueFormatter={(value) => formatLocalizedCurrency(value, language)}
      />
      <FinanceBarChart
        title={t('statistics.incomeVsExpense')}
        points={pairedPoints}
        primaryColor={colors.income}
        secondaryColor={colors.expense}
        primaryLabel={t('statistics.income')}
        secondaryLabel={t('statistics.expense')}
      />
      <FinanceBarChart
        title={t('statistics.netCashFlow')}
        points={cashFlowPoints}
        primaryColor={colors.income}
        centerOnZero
      />

      <View style={styles.listCard}>
        <Text style={styles.sectionTitle}>{t('statistics.categorySpending')}</Text>
        {categorySpending.length ? categorySpending.map((category) => (
          <View key={category.id} style={styles.metricRow}>
            <View style={styles.metricHeader}>
              <View style={styles.nameWrap}>
                <View style={[styles.dot, { backgroundColor: category.color }]} />
                <Text style={styles.metricName}>{localizeCategoryName(category.id, category.name, t)}</Text>
              </View>
              <Text style={styles.metricValue}>{formatLocalizedCurrency(category.total, language)}</Text>
            </View>
            <View style={styles.track}>
              <View style={[styles.fill, { width: `${category.total / maxCategory * 100}%`, backgroundColor: category.color }]} />
            </View>
          </View>
        )) : <Text style={styles.emptyText}>{t('statistics.noExpense')}</Text>}
        </View>
      <View style={styles.listCard}>
        <Text style={styles.sectionTitle}>{t('statistics.incomeByCategory')}</Text>
        {categoryIncome.length ? categoryIncome.map((category) => (
          <View key={category.id} style={styles.metricRow}>
            <View style={styles.metricHeader}>
              <View style={styles.nameWrap}>
                <View style={[styles.dot, { backgroundColor: category.color }]} />
                <Text style={styles.metricName}>{localizeCategoryName(category.id, category.name, t)}</Text>
              </View>
              <Text style={styles.metricValue}>{formatLocalizedCurrency(category.total, language)}</Text>
            </View>
          </View>
        )) : <Text style={styles.emptyText}>{t('statistics.noIncomeCategory')}</Text>}
      </View>
      <View style={styles.listCard}>
        <Text style={styles.sectionTitle}>{t('statistics.walletSpending')}</Text>
        {walletSpending.length ? walletSpending.map((wallet) => (
          <View key={wallet.walletId} style={styles.metricRow}>
            <View style={styles.metricHeader}>
              <View style={styles.nameWrap}>
                <View style={[styles.dot, { backgroundColor: wallet.color }]} />
                <Text style={styles.metricName}>{wallet.name}</Text>
              </View>
              <Text style={styles.metricValue}>{formatLocalizedCurrency(wallet.total, language)}</Text>
            </View>
            <View style={styles.track}>
              <View style={[styles.fill, { width: `${wallet.total / maxWallet * 100}%`, backgroundColor: wallet.color }]} />
            </View>
          </View>
        )) : <Text style={styles.emptyText}>{t('statistics.noWalletSpending')}</Text>}
      </View>
      <FinanceBarChart
        title={t('statistics.weekdaySpending')}
        points={weekdayPoints}
        primaryColor={colors.expense}
      />
      <Text style={styles.footerNote}>{t('statistics.customRangeNote')}</Text>
    </ScrollView>
  );
}

const SummaryCard = ({
  label,
  value,
  tone,
  language,
}: {
  label: string;
  value: number;
  tone: 'income' | 'expense';
  language: 'vi' | 'en';
}) => (
  <View style={styles.summaryCard}>
    <Text style={styles.summaryLabel}>{label}</Text>
    <Text style={[styles.summaryValue, tone === 'income' ? styles.income : styles.expense]}>
      {formatLocalizedCurrency(value, language)}
    </Text>
  </View>
);

const ActivityMetric = ({ label, value }: { label: string; value: string }) => (
  <View style={styles.activityMetric}>
    <Text style={styles.activityLabel}>{label}</Text>
    <Text style={styles.activityValue} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
  </View>
);

const ComparisonRow = ({ label, value, expense }: { label: string; value: number | null; expense: boolean }) => {
  const favorable = value !== null && (expense ? value <= 0 : value >= 0);
  return (
    <View style={styles.comparisonRow}>
      <Text style={styles.comparisonLabel}>{label}</Text>
      <Text style={[
        styles.comparisonValue,
        value === null ? styles.neutral : favorable ? styles.income : styles.expense,
      ]}>
        {value === null ? '—' : `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  loading: { alignItems: 'center', justifyContent: 'center' },
  loadingText: { color: colors.textSecondary, fontSize: 15 },
  content: { paddingHorizontal: spacing.lg },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  eyebrow: { color: colors.textSecondary, fontSize: 13, marginBottom: 4 },
  title: { color: colors.text, fontSize: typography.title, fontWeight: '800' },
  secondaryButton: { minHeight: 40, justifyContent: 'center', paddingHorizontal: spacing.md, borderRadius: radius.md, backgroundColor: colors.surface },
  secondaryLabel: { color: colors.accent, fontSize: 14, fontWeight: '700' },
  periodSwitch: { flexDirection: 'row', gap: spacing.xs, backgroundColor: colors.surface, padding: 4, borderRadius: radius.md },
  periodButton: { flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm },
  periodButtonActive: { backgroundColor: colors.surfaceElevated },
  periodText: { color: colors.textSecondary, fontSize: 13, fontWeight: '600' },
  periodTextActive: { color: colors.text },
  rangeNavigation: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginVertical: spacing.md },
  navButton: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center', borderRadius: radius.md, backgroundColor: colors.surface },
  navText: { color: colors.accent, fontSize: 25, lineHeight: 28 },
  rangeText: { color: colors.text, fontSize: 15, fontWeight: '700' },
  summaryGrid: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  activitySummary: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  activityMetric: { flex: 1, minWidth: 0, minHeight: 70, justifyContent: 'center', backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.sm },
  activityLabel: { color: colors.textSecondary, fontSize: 11, marginBottom: spacing.xs },
  activityValue: { color: colors.text, fontSize: 13, fontWeight: '700' },
  summaryCard: { flex: 1, minHeight: 90, justifyContent: 'center', backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md },
  summaryLabel: { color: colors.textSecondary, fontSize: 12, marginBottom: spacing.xs },
  summaryValue: { fontSize: 15, fontWeight: '800' },
  income: { color: colors.income },
  expense: { color: colors.expense },
  neutral: { color: colors.textSecondary },
  comparisonCard: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.md },
  sectionTitle: { color: colors.text, fontSize: 17, fontWeight: '700', marginBottom: spacing.md },
  comparisonRow: { minHeight: 36, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  comparisonLabel: { color: colors.textSecondary, fontSize: 14 },
  comparisonValue: { fontSize: 14, fontWeight: '700' },
  listCard: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.md },
  metricRow: { marginBottom: spacing.md },
  metricHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.xs },
  nameWrap: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: spacing.sm },
  metricName: { color: colors.text, fontSize: 14, fontWeight: '600' },
  metricValue: { color: colors.textSecondary, fontSize: 13, fontWeight: '600' },
  track: { height: 7, backgroundColor: colors.background, borderRadius: 5, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 5 },
  emptyText: { color: colors.textSecondary, fontSize: 14 },
  footerNote: { color: colors.textSecondary, fontSize: 12, textAlign: 'center', marginBottom: spacing.md },
});
