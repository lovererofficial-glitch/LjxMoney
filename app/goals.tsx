import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GoalForm } from '../src/components/GoalForm';
import { calculateGoalSummary } from '../src/features/finance/financeEngine';
import type { SavingsGoal } from '../src/features/finance/models';
import { formatLocalizedCurrency, formatLocalizedDate } from '../src/i18n/formatting';
import { useI18n } from '../src/i18n';
import { useFinanceStore } from '../src/store/financeStore';
import { colors, radius, spacing } from '../src/theme/theme';

export default function GoalsScreen() {
  const insets = useSafeAreaInsets();
  const { language, t } = useI18n();
  const goals = useFinanceStore((state) => state.goals);
  const contributions = useFinanceStore((state) => state.goalContributions);
  const addGoal = useFinanceStore((state) => state.addGoal);
  const updateGoal = useFinanceStore((state) => state.updateGoal);
  const archiveGoal = useFinanceStore((state) => state.archiveGoal);
  const hasHydrated = useFinanceStore((state) => state.hasHydrated);
  const [editingGoal, setEditingGoal] = useState<SavingsGoal | undefined>();
  const [formVisible, setFormVisible] = useState(false);
  const summaries = useMemo(
    () => new Map(goals.map((goal) => [goal.id, calculateGoalSummary(goal, contributions)])),
    [contributions, goals],
  );
  const activeGoals = goals.filter((goal) => !goal.archivedAt);
  const archivedGoals = goals.filter((goal) => goal.archivedAt);

  if (!hasHydrated) {
    return (
      <View style={[styles.screen, styles.loading]}>
        <Text style={styles.emptyText}>{t('common.loading')}</Text>
      </View>
    );
  }

  const openForm = (goal?: SavingsGoal) => {
    setEditingGoal(goal);
    setFormVisible(true);
  };
  const saveGoal = (values: Omit<SavingsGoal, 'id' | 'createdAt' | 'updatedAt'>) => {
    const now = new Date().toISOString();
    if (editingGoal) {
      updateGoal(editingGoal.id, values);
    } else {
      addGoal({ ...values, id: `goal-${Date.now()}`, createdAt: now, updatedAt: now });
    }
    setFormVisible(false);
    setEditingGoal(undefined);
  };
  const closeForm = () => {
    setFormVisible(false);
    setEditingGoal(undefined);
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.md }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}><Text style={styles.back}>{t('common.back')}</Text></Pressable>
        <Text style={styles.title}>{t('goal.goals')}</Text>
        <Pressable onPress={() => openForm()}><Text style={styles.add}>{t('common.add')}</Text></Pressable>
      </View>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]} showsVerticalScrollIndicator={false}>
        {activeGoals.length ? activeGoals.map((goal) => {
          const summary = summaries.get(goal.id);
          const progress = summary?.progress ?? 0;
          return (
            <View key={goal.id} style={styles.card}>
              <Pressable onPress={() => router.push({ pathname: '/goal/[id]', params: { id: goal.id } })}>
                <View style={styles.titleRow}>
                  <Text style={styles.name}>{goal.name}</Text>
                  <Text style={styles.percentage}>{progress.toFixed(0)}%</Text>
                </View>
                <View style={styles.amountRow}>
                  <Text style={styles.current}>{formatLocalizedCurrency(summary?.currentAmount ?? 0, language)}</Text>
                  <Text style={styles.target}>{t('common.of')} {formatLocalizedCurrency(goal.targetAmount, language)}</Text>
                </View>
                <View style={styles.track}>
                  <View style={[styles.fill, { width: `${progress}%` }]} />
                </View>
                <Text style={styles.remaining}>
                  {goal.deadline
                    ? t('goal.remainingBy', {
                        amount: formatLocalizedCurrency(summary?.remaining ?? 0, language),
                        date: formatLocalizedDate(new Date(`${goal.deadline}T00:00:00`), 'PP', language),
                      })
                    : t('goal.remainingAmount', {
                        amount: formatLocalizedCurrency(summary?.remaining ?? 0, language),
                      })}
                </Text>
              </Pressable>
              <View style={styles.actions}>
                <Pressable onPress={() => openForm(goal)} style={styles.actionButton}>
                  <Text style={styles.edit}>{t('common.edit')}</Text>
                </Pressable>
                <Pressable
                  onPress={() => Alert.alert(t('goal.archiveConfirmation'), t('goal.archiveWarning'), [
                    { text: t('common.cancel'), style: 'cancel' },
                    { text: t('common.archive'), style: 'destructive', onPress: () => archiveGoal(goal.id) },
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
            <Text style={styles.emptyTitle}>{t('goal.noGoals')}</Text>
            <Text style={styles.emptyText}>{t('goal.emptyMessage')}</Text>
            <Pressable onPress={() => openForm()} style={styles.createButton}>
              <Text style={styles.createLabel}>{t('goal.create')}</Text>
            </Pressable>
          </View>
        )}
        {archivedGoals.length ? (
          <View style={styles.archivedSection}>
            <Text style={styles.sectionTitle}>{t('common.archived')}</Text>
            {archivedGoals.map((goal) => (
              <View key={goal.id} style={styles.archivedRow}>
                <Text style={styles.archivedName}>{goal.name}</Text>
                <Pressable onPress={() => updateGoal(goal.id, { archivedAt: null })}>
                  <Text style={styles.restore}>{t('common.restore')}</Text>
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>
      <Modal visible={formVisible} animationType="slide" onRequestClose={closeForm}>
        <GoalForm initialGoal={editingGoal} onCancel={closeForm} onSave={saveGoal} />
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
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  name: { color: colors.text, fontSize: 16, fontWeight: '700', flex: 1 },
  percentage: { color: colors.accent, fontSize: 14, fontWeight: '800' },
  amountRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.xs, marginTop: spacing.md },
  current: { color: colors.text, fontSize: 20, fontWeight: '800' },
  target: { color: colors.textSecondary, fontSize: 13 },
  track: { height: 8, backgroundColor: colors.background, borderRadius: 5, overflow: 'hidden', marginTop: spacing.sm },
  fill: { height: '100%', borderRadius: 5, backgroundColor: colors.accent },
  remaining: { color: colors.textSecondary, fontSize: 12, marginTop: spacing.xs },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.lg, marginTop: spacing.sm },
  actionButton: { minHeight: 36, justifyContent: 'center' },
  edit: { color: colors.accent, fontSize: 13, fontWeight: '700' },
  archive: { color: colors.expense, fontSize: 13, fontWeight: '700' },
  empty: { alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.xl },
  emptyTitle: { color: colors.text, fontSize: 18, fontWeight: '700' },
  emptyText: { color: colors.textSecondary, fontSize: 14, marginTop: spacing.xs, textAlign: 'center' },
  createButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.lg, borderRadius: radius.md, backgroundColor: colors.accent, marginTop: spacing.md },
  createLabel: { color: colors.background, fontWeight: '800' },
  archivedSection: { marginTop: spacing.lg },
  sectionTitle: { color: colors.text, fontSize: 17, fontWeight: '700', marginBottom: spacing.sm },
  archivedRow: { minHeight: 52, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.md, backgroundColor: colors.surface, borderRadius: radius.md, marginBottom: spacing.xs },
  archivedName: { color: colors.textSecondary, fontSize: 14 },
  restore: { color: colors.income, fontSize: 13, fontWeight: '700' },
});
