import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { SavingsGoal } from '../features/finance/models';
import { formatVndInput, parseVndInput } from '../lib/formatters';
import { translateFinanceError, useI18n } from '../i18n';
import { colors, radius, spacing } from '../theme/theme';

interface GoalFormProps {
  initialGoal?: SavingsGoal;
  onCancel: () => void;
  onSave: (goal: Omit<SavingsGoal, 'id' | 'createdAt' | 'updatedAt'>) => void;
}

export const GoalForm = ({ initialGoal, onCancel, onSave }: GoalFormProps) => {
  const insets = useSafeAreaInsets();
  const { language, t } = useI18n();
  const [name, setName] = useState(initialGoal?.name ?? '');
  const [targetText, setTargetText] = useState(
    initialGoal ? formatVndInput(initialGoal.targetAmount, language) : '',
  );
  const [deadline, setDeadline] = useState(initialGoal?.deadline ?? '');
  const [note, setNote] = useState(initialGoal?.note ?? '');
  const [error, setError] = useState('');

  const save = () => {
    const targetAmount = parseVndInput(targetText);
    if (!name.trim()) {
      setError(t('validation.goalName'));
      return;
    }
    if (targetAmount === null || targetAmount <= 0) {
      setError(t('validation.goalTarget'));
      return;
    }
    if (deadline && (!/^\d{4}-\d{2}-\d{2}$/.test(deadline) || Number.isNaN(Date.parse(`${deadline}T00:00:00`)))) {
      setError(t('validation.goalDeadline'));
      return;
    }
    try {
      onSave({
        name: name.trim(),
        targetAmount,
        deadline: deadline.trim() || null,
        note: note.trim(),
        archivedAt: initialGoal?.archivedAt ?? null,
      });
      setError('');
    } catch (saveError) {
      setError(translateFinanceError(saveError, t, 'validation.goalSaveFailed'));
    }
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.container}>
        <View style={[styles.header, { paddingTop: insets.top }]}>
          <Pressable onPress={onCancel}><Text style={styles.cancel}>{t('common.cancel')}</Text></Pressable>
          <Text style={styles.title}>{initialGoal ? t('goal.edit') : t('goal.new')}</Text>
          <View style={styles.headerSpace} />
        </View>
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]} keyboardShouldPersistTaps="handled">
          <Text style={styles.label}>{t('goal.name')}</Text>
          <TextInput value={name} onChangeText={setName} placeholder={t('goal.name')} placeholderTextColor={colors.textSecondary} style={styles.input} />
          <Text style={styles.label}>{t('goal.target')}</Text>
          <TextInput
            value={targetText}
            onChangeText={(value) => {
              const amount = parseVndInput(value);
              setTargetText(amount === null ? value : amount ? formatVndInput(amount, language) : '');
            }}
            keyboardType="number-pad"
            placeholder="0"
            placeholderTextColor={colors.textSecondary}
            style={styles.input}
          />
          <Text style={styles.label}>{t('goal.optionalDate')}</Text>
          <TextInput value={deadline} onChangeText={setDeadline} placeholder="2026-12-31" placeholderTextColor={colors.textSecondary} autoCapitalize="none" style={styles.input} />
          <Text style={styles.label}>{t('goal.note')}</Text>
          <TextInput value={note} onChangeText={setNote} placeholder={t('goal.notePlaceholder')} placeholderTextColor={colors.textSecondary} multiline style={[styles.input, styles.note]} />
          {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
          <Pressable onPress={save} style={styles.saveButton}>
            <Text style={styles.saveLabel}>{initialGoal ? t('common.saveChanges') : t('goal.create')}</Text>
          </Pressable>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: colors.background },
  header: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg },
  cancel: { color: colors.accent, fontSize: 15 },
  title: { color: colors.text, fontSize: 17, fontWeight: '700' },
  headerSpace: { width: 45 },
  content: { padding: spacing.lg, paddingBottom: spacing.xl },
  label: { color: colors.textSecondary, fontSize: 13, fontWeight: '600', marginTop: spacing.md },
  input: { minHeight: 50, backgroundColor: colors.surface, borderRadius: radius.md, paddingHorizontal: spacing.md, color: colors.text, marginTop: spacing.xs },
  note: { minHeight: 100, paddingTop: spacing.md, textAlignVertical: 'top' },
  error: { color: colors.expense, fontSize: 13, marginTop: spacing.md },
  saveButton: { minHeight: 52, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, backgroundColor: colors.accent, marginTop: spacing.xl },
  saveLabel: { color: colors.background, fontSize: 15, fontWeight: '800' },
});
