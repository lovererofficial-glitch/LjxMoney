import { format, parseISO } from 'date-fns';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { calculateGoalSummary } from '../../src/features/finance/financeEngine';
import type { GoalContribution } from '../../src/features/finance/models';
import { formatVndInput, parseVndInput } from '../../src/lib/formatters';
import { formatLocalizedCurrency, formatLocalizedDate } from '../../src/i18n/formatting';
import { translateFinanceError, useI18n } from '../../src/i18n';
import { useFinanceStore } from '../../src/store/financeStore';
import { colors, radius, spacing } from '../../src/theme/theme';

export default function GoalDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { language, t } = useI18n();
  const goal = useFinanceStore((state) => state.goals.find((item) => item.id === id));
  const allContributions = useFinanceStore((state) => state.goalContributions);
  const addContribution = useFinanceStore((state) => state.addGoalContribution);
  const updateContribution = useFinanceStore((state) => state.updateGoalContribution);
  const deleteContribution = useFinanceStore((state) => state.deleteGoalContribution);
  const hasHydrated = useFinanceStore((state) => state.hasHydrated);
  const contributions = useMemo(
    () =>
      allContributions
        .filter((item) => item.goalId === id)
        .sort((first, second) =>
          `${second.date}T${second.createdAt}`.localeCompare(`${first.date}T${first.createdAt}`),
        ),
    [allContributions, id],
  );
  const summary = useMemo(
    () => goal ? calculateGoalSummary(goal, contributions) : null,
    [contributions, goal],
  );
  const [modalVisible, setModalVisible] = useState(false);
  const [editingContribution, setEditingContribution] = useState<GoalContribution | null>(null);
  const [amountText, setAmountText] = useState('');
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  if (!hasHydrated) {
    return (
      <View style={[styles.screen, styles.centered, { paddingTop: insets.top }]}>
        <Text style={styles.meta}>{t('goal.loading')}</Text>
      </View>
    );
  }

  if (!goal || !summary) {
    return (
      <View style={[styles.screen, styles.centered, { paddingTop: insets.top }]}>
        <Text style={styles.title}>{t('goal.unavailable')}</Text>
        <Pressable onPress={() => router.back()}><Text style={styles.accent}>{t('common.back')}</Text></Pressable>
      </View>
    );
  }

  const openContribution = (contribution?: GoalContribution) => {
    setEditingContribution(contribution ?? null);
    setAmountText(contribution ? formatVndInput(contribution.amount, language) : '');
    setDate(contribution?.date ?? format(new Date(), 'yyyy-MM-dd'));
    setNote(contribution?.note ?? '');
    setError('');
    setModalVisible(true);
  };
  const closeContribution = () => {
    setModalVisible(false);
    setEditingContribution(null);
    setError('');
  };
  const saveContribution = () => {
    const amount = parseVndInput(amountText);
    if (amount === null || amount < 0) {
      setError(t('validation.contributionAmount'));
      return;
    }
    const now = new Date().toISOString();
    try {
      if (editingContribution) {
        updateContribution(editingContribution.id, { amount, date, note: note.trim() });
      } else {
        addContribution({
          id: `contribution-${Date.now()}`,
          goalId: goal.id,
          amount,
          date,
          note: note.trim(),
          createdAt: now,
          updatedAt: now,
        });
      }
      closeContribution();
    } catch (saveError) {
      setError(translateFinanceError(saveError, t, 'validation.contributionSaveFailed'));
    }
  };

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
        <Text style={styles.headerTitle}>{t('goal.detail')}</Text>
        <Pressable onPress={() => router.push('/goals')}><Text style={styles.accent}>{t('common.manage')}</Text></Pressable>
      </View>
      <View style={styles.summaryCard}>
        <Text style={styles.title}>{goal.name}</Text>
        {goal.note ? <Text style={styles.note}>{goal.note}</Text> : null}
        <Text style={styles.current}>{formatLocalizedCurrency(summary.currentAmount, language)}</Text>
        <Text style={styles.meta}>{t('common.of')} {formatLocalizedCurrency(goal.targetAmount, language)}</Text>
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${summary.progress}%` }]} />
        </View>
        <View style={styles.totals}>
          <Metric label={t('goal.remaining')} value={formatLocalizedCurrency(summary.remaining, language)} />
          <Metric label={t('goal.progress')} value={`${summary.progress.toFixed(1)}%`} />
        </View>
        <Text style={styles.deadline}>
          {goal.deadline
            ? `${t('goal.deadline')} · ${formatLocalizedDate(parseISO(goal.deadline), 'dd MMM yyyy', language)}`
            : t('goal.noDeadline')}
        </Text>
        <Pressable onPress={() => openContribution()} style={styles.addButton}>
          <Text style={styles.addLabel}>{t('goal.addContribution')}</Text>
        </Pressable>
      </View>
      <View style={styles.history}>
        <Text style={styles.sectionTitle}>{t('goal.history')}</Text>
        {contributions.length ? contributions.map((contribution) => (
          <View key={contribution.id} style={styles.contributionRow}>
            <Pressable onPress={() => openContribution(contribution)} style={styles.contributionInfo}>
              <Text style={styles.contributionAmount}>{formatLocalizedCurrency(contribution.amount, language)}</Text>
              <Text style={styles.meta}>
                {formatLocalizedDate(parseISO(contribution.date), 'dd MMM yyyy', language)}
                {contribution.note ? ` · ${contribution.note}` : ''}
              </Text>
            </Pressable>
            <Pressable
              accessibilityLabel={t('goal.deleteContribution')}
              onPress={() => Alert.alert(t('goal.deleteConfirmation'), t('goal.deleteWarning'), [
                { text: t('common.cancel'), style: 'cancel' },
                { text: t('common.delete'), style: 'destructive', onPress: () => deleteContribution(contribution.id) },
              ])}
              style={styles.deleteButton}
            >
              <Text style={styles.deleteLabel}>{t('common.delete')}</Text>
            </Pressable>
          </View>
        )) : (
          <Text style={styles.meta}>{t('goal.noContributions')}</Text>
        )}
      </View>
      <Modal visible={modalVisible} animationType="slide" onRequestClose={closeContribution}>
        <KeyboardAvoidingView style={[styles.modal, { paddingTop: insets.top }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.modalHeader}>
            <Pressable onPress={closeContribution}><Text style={styles.accent}>{t('common.cancel')}</Text></Pressable>
            <Text style={styles.headerTitle}>{editingContribution ? t('goal.editContribution') : t('goal.contribution')}</Text>
            <View style={styles.headerSpace} />
          </View>
          <ScrollView contentContainerStyle={[styles.modalContent, { paddingBottom: insets.bottom + spacing.xl }]} keyboardShouldPersistTaps="handled">
            <Text style={styles.fieldLabel}>{t('transaction.amount')}</Text>
            <TextInput
              value={amountText}
              onChangeText={(value) => {
                const amount = parseVndInput(value);
                setAmountText(amount === null ? value : amount ? formatVndInput(amount, language) : '');
              }}
              keyboardType="number-pad"
              placeholder="0"
              placeholderTextColor={colors.textSecondary}
              style={styles.input}
            />
            <Text style={styles.fieldLabel}>{t('transaction.date')} (YYYY-MM-DD)</Text>
            <TextInput value={date} onChangeText={setDate} autoCapitalize="none" style={styles.input} />
            <Text style={styles.fieldLabel}>{t('goal.note')}</Text>
            <TextInput value={note} onChangeText={setNote} placeholder={t('transaction.addNote')} placeholderTextColor={colors.textSecondary} style={styles.input} />
            {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
            <Pressable onPress={saveContribution} style={styles.addButton}>
              <Text style={styles.addLabel}>{editingContribution ? t('common.saveChanges') : t('common.save')}</Text>
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </ScrollView>
  );
}

const Metric = ({ label, value }: { label: string; value: string }) => (
  <View style={styles.metric}>
    <Text style={styles.meta}>{label}</Text>
    <Text style={styles.metricValue}>{value}</Text>
  </View>
);

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.lg },
  centered: { justifyContent: 'center', alignItems: 'center', gap: spacing.md },
  header: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerTitle: { color: colors.text, fontSize: 17, fontWeight: '700' },
  accent: { color: colors.accent, fontSize: 15, fontWeight: '600' },
  title: { color: colors.text, fontSize: 22, fontWeight: '800' },
  summaryCard: { backgroundColor: colors.surface, borderRadius: radius.xl, padding: spacing.xl, marginVertical: spacing.md },
  note: { color: colors.textSecondary, fontSize: 14, marginTop: spacing.xs },
  current: { color: colors.text, fontSize: 30, fontWeight: '800', marginTop: spacing.xl },
  meta: { color: colors.textSecondary, fontSize: 13 },
  track: { height: 8, backgroundColor: colors.background, borderRadius: 5, overflow: 'hidden', marginTop: spacing.md },
  fill: { height: '100%', borderRadius: 5, backgroundColor: colors.accent },
  totals: { flexDirection: 'row', marginTop: spacing.lg },
  metric: { flex: 1 },
  metricValue: { color: colors.text, fontSize: 15, fontWeight: '700', marginTop: 5 },
  deadline: { color: colors.textSecondary, fontSize: 13, marginTop: spacing.md },
  addButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, backgroundColor: colors.accent, marginTop: spacing.lg },
  addLabel: { color: colors.background, fontSize: 15, fontWeight: '800' },
  history: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg },
  sectionTitle: { color: colors.text, fontSize: 17, fontWeight: '700', marginBottom: spacing.md },
  contributionRow: { minHeight: 64, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  contributionInfo: { flex: 1, justifyContent: 'center', minHeight: 56 },
  contributionAmount: { color: colors.text, fontSize: 15, fontWeight: '700' },
  deleteButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.sm },
  deleteLabel: { color: colors.expense, fontSize: 13, fontWeight: '700' },
  modal: { flex: 1, backgroundColor: colors.background },
  modalHeader: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg },
  headerSpace: { width: 45 },
  modalContent: { padding: spacing.lg },
  fieldLabel: { color: colors.textSecondary, fontSize: 13, fontWeight: '600', marginTop: spacing.md },
  input: { minHeight: 50, backgroundColor: colors.surface, borderRadius: radius.md, paddingHorizontal: spacing.md, color: colors.text, marginTop: spacing.xs },
  error: { color: colors.expense, fontSize: 13, marginTop: spacing.md },
});
