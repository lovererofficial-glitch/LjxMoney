import { parseISO } from 'date-fns';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FinanceBarChart } from '../../src/components/FinanceBarChart';
import { TransactionRow } from '../../src/components/TransactionRow';
import { calculateBudgetSummary } from '../../src/features/finance/financeEngine';
import { formatLocalizedCurrency, formatLocalizedDate } from '../../src/i18n/formatting';
import { localizeCategoryName, useI18n } from '../../src/i18n';
import type { TranslationKey } from '../../src/i18n';
import { useFinanceStore } from '../../src/store/financeStore';
import { transactionDetailRoute } from '../../src/lib/transactionRoutes';
import { colors, radius, spacing } from '../../src/theme/theme';

export default function BudgetDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { language, t } = useI18n();
  const budget = useFinanceStore((state) => state.budgets.find((item) => item.id === id));
  const transactions = useFinanceStore((state) => state.transactions);
  const categories = useFinanceStore((state) => state.categories);
  const hasHydrated = useFinanceStore((state) => state.hasHydrated);
  const summary = useMemo(
    () => budget ? calculateBudgetSummary(budget, transactions) : null,
    [budget, transactions],
  );

  if (!hasHydrated) {
    return (
      <View style={[styles.screen, styles.centered, { paddingTop: insets.top }]}>
        <Text style={styles.meta}>{t('budget.loading')}</Text>
      </View>
    );
  }

  if (!budget || !summary) {
    return (
      <View style={[styles.screen, styles.centered, { paddingTop: insets.top }]}>
        <Text style={styles.title}>{t('budget.unavailable')}</Text>
        <Pressable onPress={() => router.back()}><Text style={styles.accent}>{t('common.back')}</Text></Pressable>
      </View>
    );
  }

  const selectedCategory = categories.find((category) => category.id === budget.categoryId);
  const categoryName = selectedCategory
    ? localizeCategoryName(selectedCategory.id, selectedCategory.name, t)
    : t('budget.archivedCategory');
  const chartDays = summary.dailySpending.slice(-31);

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
        <Pressable onPress={() => router.back()}><Text style={styles.accent}>{t('common.back')}</Text></Pressable>
        <Text style={styles.headerTitle}>{t('budget.detail')}</Text>
        <Pressable onPress={() => router.push('/budgets')}><Text style={styles.accent}>{t('common.manage')}</Text></Pressable>
      </View>
      <View style={styles.summary}>
        <Text style={styles.category}>{categoryName} · {t(`budget.${budget.period}` as TranslationKey)}</Text>
        <Text style={styles.title}>{budget.name}</Text>
        <Text style={[styles.status, summary.status === 'safe' ? styles.safe : summary.status === 'warning' ? styles.warning : styles.exceeded]}>
          {t(`budget.${summary.status}` as TranslationKey).toUpperCase()}
        </Text>
        <Text style={styles.spent}>{formatLocalizedCurrency(summary.spent, language)}</Text>
        <Text style={styles.meta}>{t('common.of')} {formatLocalizedCurrency(budget.amount, language)} · {summary.percentage.toFixed(1)}%</Text>
        <View style={styles.track}>
          <View style={[
            styles.fill,
            {
              width: `${Math.min(100, summary.percentage)}%`,
              backgroundColor: summary.status === 'safe' ? colors.income : summary.status === 'warning' ? colors.warning : colors.expense,
            },
          ]} />
        </View>
        <View style={styles.totals}>
          <Total label={t('budget.remaining')} value={formatLocalizedCurrency(summary.remaining, language)} />
          <Total label={t('budget.thisPeriod')} value={`${formatLocalizedDate(parseISO(summary.startDate), 'dd MMM', language)} – ${formatLocalizedDate(parseISO(summary.endDate), 'dd MMM yyyy', language)}`} />
        </View>
      </View>
      <FinanceBarChart
        title={t('budget.dailySpending')}
        points={chartDays.map((day) => ({ label: formatLocalizedDate(parseISO(day.date), 'd', language), value: day.amount }))}
        primaryColor={colors.expense}
        valueFormatter={(value) => formatLocalizedCurrency(value, language)}
      />
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('budget.dailyTotals')}</Text>
        {summary.dailySpending.map((day) => (
          <View key={day.date} style={styles.dailyRow}>
            <Text style={styles.meta}>{formatLocalizedDate(parseISO(day.date), 'EEE, dd MMM', language)}</Text>
            <Text style={styles.dailyAmount}>{formatLocalizedCurrency(day.amount, language)}</Text>
          </View>
        ))}
      </View>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('budget.relatedTransactions')}</Text>
        {summary.transactions.length ? summary.transactions.map((transaction) => (
          <TransactionRow
            key={transaction.id}
            transaction={transaction}
            onPress={() => router.push(transactionDetailRoute(transaction.id))}
          />
        )) : <Text style={styles.meta}>{t('budget.noSpending')}</Text>}
      </View>
    </ScrollView>
  );
}

const Total = ({ label, value }: { label: string; value: string }) => (
  <View style={styles.total}>
    <Text style={styles.meta}>{label}</Text>
    <Text style={styles.totalValue}>{value}</Text>
  </View>
);

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.lg },
  centered: { justifyContent: 'center', alignItems: 'center', gap: spacing.md },
  header: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerTitle: { color: colors.text, fontSize: 17, fontWeight: '700' },
  accent: { color: colors.accent, fontSize: 15, fontWeight: '600' },
  summary: { backgroundColor: colors.surface, borderRadius: radius.xl, padding: spacing.xl, alignItems: 'center', marginVertical: spacing.md },
  category: { color: colors.textSecondary, fontSize: 13, textTransform: 'capitalize' },
  title: { color: colors.text, fontSize: 22, fontWeight: '800', marginTop: spacing.xs },
  status: { fontSize: 12, fontWeight: '800', marginTop: spacing.md },
  safe: { color: colors.income },
  warning: { color: colors.warning },
  exceeded: { color: colors.expense },
  spent: { color: colors.text, fontSize: 30, fontWeight: '800', marginTop: spacing.lg },
  meta: { color: colors.textSecondary, fontSize: 13 },
  track: { width: '100%', height: 8, backgroundColor: colors.background, borderRadius: 5, overflow: 'hidden', marginTop: spacing.md },
  fill: { height: '100%', borderRadius: 5 },
  totals: { width: '100%', flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.lg },
  total: { flex: 1 },
  totalValue: { color: colors.text, fontSize: 14, fontWeight: '700', marginTop: 5 },
  section: { marginTop: spacing.md, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg },
  sectionTitle: { color: colors.text, fontSize: 17, fontWeight: '700', marginBottom: spacing.sm },
  dailyRow: { minHeight: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  dailyAmount: { color: colors.text, fontSize: 13, fontWeight: '600' },
});
