import { format, parseISO } from 'date-fns';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Budget, BudgetPeriod } from '../features/finance/models';
import { formatVndInput, parseVndInput } from '../lib/formatters';
import { localizeCategoryName, translateFinanceError, useI18n } from '../i18n';
import type { TranslationKey } from '../i18n';
import { useFinanceStore } from '../store/financeStore';
import { colors, radius, spacing } from '../theme/theme';

interface BudgetFormProps {
  initialBudget?: Budget;
  onCancel: () => void;
  onSave: (budget: Omit<Budget, 'id' | 'createdAt' | 'updatedAt'>) => void;
}

const budgetPeriods: BudgetPeriod[] = ['weekly', 'monthly', 'yearly', 'custom'];

export const BudgetForm = ({ initialBudget, onCancel, onSave }: BudgetFormProps) => {
  const insets = useSafeAreaInsets();
  const { language, t } = useI18n();
  const today = format(new Date(), 'yyyy-MM-dd');
  const categories = useFinanceStore((state) => state.categories);
  const availableCategories = categories.filter(
    (category) =>
      category.type === 'expense' &&
      (!category.archivedAt || category.id === initialBudget?.categoryId),
  );
  const [name, setName] = useState(initialBudget?.name ?? '');
  const [categoryId, setCategoryId] = useState(initialBudget?.categoryId ?? availableCategories[0]?.id ?? '');
  const [amountText, setAmountText] = useState(
    initialBudget ? formatVndInput(initialBudget.amount, language) : '',
  );
  const [period, setPeriod] = useState<BudgetPeriod>(initialBudget?.period ?? 'monthly');
  const [startDate, setStartDate] = useState(initialBudget?.startDate ?? today);
  const [endDate, setEndDate] = useState(initialBudget?.endDate ?? '2099-12-31');
  const [error, setError] = useState('');

  const selectPeriod = (nextPeriod: BudgetPeriod) => {
    setPeriod(nextPeriod);
  };

  const save = () => {
    const amount = parseVndInput(amountText);
    if (!name.trim()) {
      setError(t('validation.budgetName'));
      return;
    }
    if (amount === null || amount <= 0) {
      setError(t('validation.budgetAmount'));
      return;
    }
    if (!categoryId) {
      setError(t('validation.budgetCategory'));
      return;
    }
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(startDate) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(endDate) ||
      Number.isNaN(parseISO(startDate).getTime()) ||
      Number.isNaN(parseISO(endDate).getTime()) ||
      endDate < startDate
    ) {
      setError(t('validation.budgetDates'));
      return;
    }
    try {
      onSave({
        name: name.trim(),
        categoryId,
        amount,
        period,
        startDate,
        endDate,
        archivedAt: initialBudget?.archivedAt ?? null,
      });
      setError('');
    } catch (saveError) {
      setError(translateFinanceError(saveError, t, 'validation.budgetSaveFailed'));
    }
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.container}>
        <View style={[styles.header, { paddingTop: insets.top }]}>
          <Pressable onPress={onCancel}><Text style={styles.cancel}>{t('common.cancel')}</Text></Pressable>
          <Text style={styles.title}>{initialBudget ? t('budget.edit') : t('budget.new')}</Text>
          <View style={styles.headerSpace} />
        </View>
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]} keyboardShouldPersistTaps="handled">
          <FieldLabel label={t('goal.name')} />
          <TextInput value={name} onChangeText={setName} placeholder={t('budget.name')} placeholderTextColor={colors.textSecondary} style={styles.input} />
          <FieldLabel label={t('budget.limit')} />
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
          <FieldLabel label={t('budget.category')} />
          <View style={styles.options}>
            {availableCategories.map((category) => (
              <Choice
                key={category.id}
                label={localizeCategoryName(category.id, category.name, t)}
                selected={category.id === categoryId}
                onPress={() => setCategoryId(category.id)}
              />
            ))}
          </View>
          <FieldLabel label={t('budget.period')} />
          <View style={styles.options}>
            {budgetPeriods.map((item) => (
              <Choice
                key={item}
                label={t(`budget.${item}` as TranslationKey)}
                selected={period === item}
                onPress={() => selectPeriod(item)}
              />
            ))}
          </View>
          <FieldLabel label={t('budget.activeDates')} />
          <View style={styles.dateRow}>
            <TextInput value={startDate} onChangeText={setStartDate} autoCapitalize="none" style={[styles.input, styles.dateInput]} />
            <Text style={styles.dateDash}>–</Text>
            <TextInput value={endDate} onChangeText={setEndDate} autoCapitalize="none" style={[styles.input, styles.dateInput]} />
          </View>
          {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
          <Pressable onPress={save} style={styles.saveButton}>
            <Text style={styles.saveLabel}>{initialBudget ? t('common.saveChanges') : t('budget.create')}</Text>
          </Pressable>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
};

const FieldLabel = ({ label }: { label: string }) => <Text style={styles.fieldLabel}>{label}</Text>;

const Choice = ({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) => (
  <Pressable onPress={onPress} style={[styles.choice, selected && styles.choiceSelected]}>
    <Text style={[styles.choiceLabel, selected && styles.choiceLabelSelected]}>{label}</Text>
  </Pressable>
);

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: colors.background },
  header: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg },
  cancel: { color: colors.accent, fontSize: 15 },
  title: { color: colors.text, fontSize: 17, fontWeight: '700' },
  headerSpace: { width: 45 },
  content: { padding: spacing.lg, paddingBottom: spacing.xl },
  fieldLabel: { color: colors.textSecondary, fontSize: 13, fontWeight: '600', marginTop: spacing.md },
  input: { minHeight: 50, backgroundColor: colors.surface, borderRadius: radius.md, paddingHorizontal: spacing.md, color: colors.text, marginTop: spacing.xs },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.sm },
  choice: { minHeight: 40, justifyContent: 'center', paddingHorizontal: spacing.md, borderRadius: radius.sm, backgroundColor: colors.surface },
  choiceSelected: { backgroundColor: `${colors.accent}30` },
  choiceLabel: { color: colors.textSecondary, fontSize: 13, fontWeight: '600' },
  choiceLabelSelected: { color: colors.accent },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  dateInput: { flex: 1, paddingHorizontal: spacing.sm, fontSize: 12 },
  dateDash: { color: colors.textSecondary },
  error: { color: colors.expense, fontSize: 13, marginTop: spacing.md },
  saveButton: { minHeight: 52, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, backgroundColor: colors.accent, marginTop: spacing.xl },
  saveLabel: { color: colors.background, fontSize: 15, fontWeight: '800' },
});
