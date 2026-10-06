import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BudgetForm } from '../src/components/BudgetForm';
import { calculateBudgetSummary } from '../src/features/finance/financeEngine';
import type { Budget } from '../src/features/finance/models';
import { formatLocalizedCurrency } from '../src/i18n/formatting';
import { localizeCategoryName, useI18n } from '../src/i18n';
import type { TranslationKey } from '../src/i18n';
import { useFinanceStore } from '../src/store/financeStore';
import { colors, radius, spacing } from '../src/theme/theme';

export default function BudgetsScreen() {
  const insets = useSafeAreaInsets();
  const { language, t } = useI18n();
  const budgets = useFinanceStore((state) => state.budgets);
  const transactions = useFinanceStore((state) => state.transactions);
  const categories = useFinanceStore((state) => state.categories);
  const addBudget = useFinanceStore((state) => state.addBudget);
  const updateBudget = useFinanceStore((state) => state.updateBudget);
  const archiveBudget = useFinanceStore((state) => state.archiveBudget);
  const hasHydrated = useFinanceStore((state) => state.hasHydrated);
  const [editingBudget, setEditingBudget] = useState<Budget | undefined>();
  const [formVisible, setFormVisible] = useState(false);
  const summaries = useMemo(
    () => new Map(budgets.map((budget) => [budget.id, calculateBudgetSummary(budget, transactions)])),
    [budgets, transactions],
  );
  const activeBudgets = budgets.filter((budget) => !budget.archivedAt);
  const archivedBudgets = budgets.filter((budget) => budget.archivedAt);

  if (!hasHydrated) {
    return (
      <View style={[styles.screen, styles.loading]}>
        <Text style={styles.meta}>{t('common.loading')}</Text>
      </View>
    );
  }

  const openForm = (budget?: Budget) => {
    setEditingBudget(budget);
    setFormVisible(true);
  };

  const saveBudget = (values: Omit<Budget, 'id' | 'createdAt' | 'updatedAt'>) => {
    const now = new Date().toISOString();
    if (editingBudget) {
      updateBudget(editingBudget.id, values);
    } else {
      addBudget({
        ...values,
        id: `budget-${Date.now()}`,
        createdAt: now,
        updatedAt: now,
      });
    }
    setFormVisible(false);
    setEditingBudget(undefined);
  };

  const closeForm = () => {
    setFormVisible(false);
    setEditingBudget(undefined);
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.md }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}><Text style={styles.back}>{t('common.back')}</Text></Pressable>
        <Text style={styles.title}>{t('budget.budgets')}</Text>
        <Pressable onPress={() => openForm()}><Text style={styles.add}>{t('common.add')}</Text></Pressable>
      </View>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]} showsVerticalScrollIndicator={false}>
        {activeBudgets.length ? activeBudgets.map((budget) => {
          const summary = summaries.get(budget.id);
          const category = categories.find((item) => item.id === budget.categoryId);
          const categoryName = category ? localizeCategoryName(category.id, category.name, t) : t('budget.archivedCategory');
          return (
            <View key={budget.id} style={styles.card}>
              <Pressable onPress={() => router.push({ pathname: '/budget/[id]', params: { id: budget.id } })}>
                <View style={styles.cardHeader}>
                  <View style={styles.flex}>
                    <Text style={styles.name}>{budget.name}</Text>
                    <Text style={styles.meta}>{categoryName} · {budget.period}</Text>
                  </View>
                  <Text style={[styles.status, summary?.status === 'safe' ? styles.safe : summary?.status === 'warning' ? styles.warning : styles.exceeded]}>
                    {summary?.status ? t(`budget.${summary.status}` as TranslationKey) : ''}
                  </Text>
                </View>
                <View style={styles.amountRow}>
                  <Text style={styles.amount}>{formatLocalizedCurrency(summary?.spent ?? 0, language)}</Text>
                  <Text style={styles.limit}>{t('common.of')} {formatLocalizedCurrency(budget.amount, language)}</Text>
                </View>
                <View style={styles.track}>
                  <View
                    style={[
                      styles.fill,
                      {
                        width: `${Math.min(100, summary?.percentage ?? 0)}%`,
                        backgroundColor:
                          summary?.status === 'safe' ? colors.income : summary?.status === 'warning' ? colors.warning : colors.expense,
                      },
                    ]}
                  />
                </View>
                <Text style={styles.remaining}>
                  {summary?.percentage !== undefined && summary.percentage >= 100
                    ? t('budget.used', { percentage: summary.percentage.toFixed(0) })
                    : t('budget.remainingPercent', {
                        amount: formatLocalizedCurrency(summary?.remaining ?? 0, language),
                        percentage: (summary?.percentage ?? 0).toFixed(0),
                      })}
                </Text>
              </Pressable>
              <View style={styles.actions}>
                <Pressable onPress={() => openForm(budget)} style={styles.actionButton}>
                  <Text style={styles.edit}>{t('common.edit')}</Text>
                </Pressable>
                <Pressable
                  onPress={() => Alert.alert(t('budget.archiveConfirmation'), t('budget.archiveWarning'), [
                    { text: t('common.cancel'), style: 'cancel' },
                    { text: t('common.archive'), style: 'destructive', onPress: () => archiveBudget(budget.id) },
                  ])}
                  style={styles.actionButton}
                >
                  <Text style={styles.archive}>{t('common.archive')}</Text>
                </Pressable>
              </View>
            </View>
          );
        }) : (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>{t('budget.noBudgets')}</Text>
            <Text style={styles.meta}>{t('budget.emptyMessage')}</Text>
            <Pressable onPress={() => openForm()} style={styles.createButton}>
              <Text style={styles.createLabel}>{t('budget.create')}</Text>
            </Pressable>
          </View>
        )}
        {archivedBudgets.length ? (
          <View style={styles.archivedSection}>
            <Text style={styles.sectionTitle}>{t('common.archived')}</Text>
            {archivedBudgets.map((budget) => (
              <View key={budget.id} style={styles.archivedRow}>
                <Text style={styles.archivedName}>{budget.name}</Text>
                <Pressable onPress={() => updateBudget(budget.id, { archivedAt: null })}>
                  <Text style={styles.restore}>{t('common.restore')}</Text>
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>
      <Modal visible={formVisible} animationType="slide" onRequestClose={closeForm}>
        <BudgetForm initialBudget={editingBudget} onCancel={closeForm} onSave={saveBudget} />
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  loading: { alignItems: 'center', justifyContent: 'center' },
  header: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, marginBottom: spacing.md },
  back: { color: colors.accent, fontSize: 15, fontWeight: '600' },
  title: { color: colors.text, fontSize: 19, fontWeight: '800' },
  add: { color: colors.accent, fontSize: 15, fontWeight: '700' },
  content: { paddingHorizontal: spacing.lg, gap: spacing.md },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg },
  flex: { flex: 1 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  name: { color: colors.text, fontSize: 16, fontWeight: '700' },
  meta: { color: colors.textSecondary, fontSize: 13, marginTop: 5 },
  status: { fontSize: 12, fontWeight: '700', textTransform: 'capitalize' },
  safe: { color: colors.income },
  warning: { color: colors.warning },
  exceeded: { color: colors.expense },
  amountRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.xs, marginTop: spacing.lg },
  amount: { color: colors.text, fontSize: 20, fontWeight: '800' },
  limit: { color: colors.textSecondary, fontSize: 13 },
  track: { height: 8, backgroundColor: colors.background, borderRadius: 5, overflow: 'hidden', marginTop: spacing.sm },
  fill: { height: '100%', borderRadius: 5 },
  remaining: { color: colors.textSecondary, fontSize: 12, marginTop: spacing.xs },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.lg, marginTop: spacing.sm },
  actionButton: { minHeight: 36, justifyContent: 'center' },
  edit: { color: colors.accent, fontSize: 13, fontWeight: '700' },
  archive: { color: colors.expense, fontSize: 13, fontWeight: '700' },
  empty: { alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.xl },
  emptyTitle: { color: colors.text, fontSize: 18, fontWeight: '700' },
  createButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.lg, borderRadius: radius.md, backgroundColor: colors.accent, marginTop: spacing.md },
  createLabel: { color: colors.background, fontWeight: '800' },
  archivedSection: { marginTop: spacing.lg },
  sectionTitle: { color: colors.text, fontSize: 17, fontWeight: '700', marginBottom: spacing.sm },
  archivedRow: { minHeight: 52, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.md, backgroundColor: colors.surface, borderRadius: radius.md, marginBottom: spacing.xs },
  archivedName: { color: colors.textSecondary, fontSize: 14 },
  restore: { color: colors.income, fontSize: 13, fontWeight: '700' },
});
