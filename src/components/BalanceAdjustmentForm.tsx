import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { format, isValid, parseISO } from 'date-fns';
import { useState } from 'react';
import {
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

import type { Transaction } from '../features/finance/models';
import { calculateBalanceAdjustment } from '../features/finance/financeEngine';
import { formatVndInput, parseVndInput } from '../lib/formatters';
import { formatLocalizedCurrency, formatLocalizedDate } from '../i18n/formatting';
import { useI18n } from '../i18n';
import { colors, radius, spacing, typography } from '../theme/theme';

interface BalanceAdjustmentFormProps {
  currentBalance: number;
  initialActualBalance: number;
  initialAdjustment?: Transaction;
  onCancel: () => void;
  onSave: (values: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onDelete?: () => void;
}

export const BalanceAdjustmentForm = ({
  currentBalance,
  initialActualBalance,
  initialAdjustment,
  onCancel,
  onSave,
  onDelete,
}: BalanceAdjustmentFormProps) => {
  const { language, t } = useI18n();
  const insets = useSafeAreaInsets();
  const [actualText, setActualText] = useState(() => formatVndInput(Math.max(0, initialActualBalance), language));
  const [note, setNote] = useState(initialAdjustment?.note ?? '');
  const [date, setDate] = useState(initialAdjustment?.date ?? format(new Date(), 'yyyy-MM-dd'));
  const [time, setTime] = useState(initialAdjustment?.time ?? format(new Date(), 'HH:mm'));
  const [pickerMode, setPickerMode] = useState<'date' | 'time' | null>(null);
  const [error, setError] = useState('');

  const actualBalance = actualText.trim() ? parseVndInput(actualText) : null;
  let difference = 0;
  if (actualBalance !== null && Number.isSafeInteger(currentBalance)) {
    difference = actualBalance - currentBalance;
  }
  const differenceLabel = actualBalance === null || !Number.isSafeInteger(difference)
    ? '—'
    : `${difference > 0 ? '+' : difference < 0 ? '-' : ''}${formatLocalizedCurrency(Math.abs(difference), language)}`;

  const pickerValue = parseISO(date);
  const [hours, minutes] = time.split(':').map(Number);
  pickerValue.setHours(hours, minutes, 0, 0);

  const handlePickerChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    if (event.type === 'set' && selectedDate) {
      if (pickerMode === 'date') {
        setDate(format(selectedDate, 'yyyy-MM-dd'));
      } else if (pickerMode === 'time') {
        setTime(format(selectedDate, 'HH:mm'));
      }
    }
    if (Platform.OS !== 'ios') {
      setPickerMode(null);
    }
  };

  const submit = () => {
    if (
      actualBalance === null ||
      !Number.isSafeInteger(actualBalance) ||
      actualBalance < 0 ||
      !Number.isSafeInteger(currentBalance)
    ) {
      setError(t('wallet.invalidBalance'));
      return;
    }
    const parsedDate = parseISO(date);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !isValid(parsedDate) || format(parsedDate, 'yyyy-MM-dd') !== date) {
      setError(t('validation.validTransactionDate'));
      return;
    }
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
      setError(t('validation.validTime'));
      return;
    }

    try {
      const adjustment = calculateBalanceAdjustment(currentBalance, actualBalance);
      setError('');
      onSave({
        type: 'adjustment',
        amount: adjustment?.amount ?? 0,
        adjustmentDirection: adjustment?.adjustmentDirection ?? 'increase',
        categoryId: '',
        walletId: initialAdjustment?.walletId ?? '',
        date,
        time,
        note: note.trim(),
      });
    } catch {
      setError(t('wallet.adjustFailed'));
    }
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.screen, { paddingTop: insets.top + spacing.sm }]}>
        <View style={styles.header}>
          <Pressable accessibilityRole="button" onPress={onCancel} style={styles.headerAction}>
            <Text style={styles.cancelLabel}>{t('common.cancel')}</Text>
          </Pressable>
          <Text style={styles.headerTitle}>{t('wallet.adjustBalance')}</Text>
          <View style={styles.headerAction} />
        </View>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.balanceBlock}>
            <Text style={styles.label}>{t('wallet.currentBalance')}</Text>
            <Text style={styles.currentBalance}>{formatLocalizedCurrency(currentBalance, language)}</Text>
          </View>

          <Text style={styles.label}>{t('wallet.actualBalance')}</Text>
          <View style={styles.amountField}>
            <TextInput
              accessibilityLabel={t('wallet.actualBalance')}
              value={actualText}
              onChangeText={(value) => {
                setActualText(value.replace(/\D/g, ''));
                setError('');
              }}
              keyboardType="number-pad"
              placeholder="0"
              placeholderTextColor={colors.textSecondary}
              style={styles.amountInput}
              maxLength={16}
            />
            <Text style={styles.currency}>₫</Text>
          </View>
          <View style={styles.differenceRow}>
            <Text style={styles.label}>{t('wallet.difference')}</Text>
            <Text style={[
              styles.difference,
              difference > 0 ? styles.positive : difference < 0 ? styles.negative : null,
            ]}>{differenceLabel}</Text>
          </View>

          <Text style={styles.label}>{t('wallet.reason')}</Text>
          <TextInput
            accessibilityLabel={t('wallet.reason')}
            value={note}
            onChangeText={setNote}
            placeholder={t('wallet.adjustmentReasonPlaceholder')}
            placeholderTextColor={colors.textSecondary}
            style={styles.noteInput}
            maxLength={240}
          />

          <Text style={styles.label}>{t('transaction.dateTime')}</Text>
          <View style={styles.dateTimeRow}>
            <Pressable accessibilityRole="button" onPress={() => setPickerMode('date')} style={styles.dateTimeButton}>
              <Text style={styles.dateTimeCaption}>{t('transaction.date')}</Text>
              <Text style={styles.dateTimeValue}>{formatLocalizedDate(parseISO(date), 'dd MMM yyyy', language)}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => setPickerMode('time')} style={styles.dateTimeButton}>
              <Text style={styles.dateTimeCaption}>{t('transaction.time')}</Text>
              <Text style={styles.dateTimeValue}>{time}</Text>
            </Pressable>
          </View>
          {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
          {initialAdjustment && onDelete ? (
            <Pressable accessibilityRole="button" onPress={onDelete} style={({ pressed }) => [styles.deleteButton, pressed && styles.pressed]}>
              <Text style={styles.deleteLabel}>{t('common.delete')}</Text>
            </Pressable>
          ) : null}
          <Pressable accessibilityRole="button" onPress={submit} style={({ pressed }) => [styles.saveButton, pressed && styles.pressed]}>
            <Text style={styles.saveLabel}>{t('wallet.saveAdjustment')}</Text>
          </Pressable>
        </View>

        {Platform.OS === 'android' && pickerMode ? (
          <DateTimePicker value={pickerValue} mode={pickerMode} display="default" onChange={handlePickerChange} />
        ) : null}
        {Platform.OS === 'ios' ? (
          <Modal visible={pickerMode !== null} transparent animationType="slide" onRequestClose={() => setPickerMode(null)}>
            <Pressable style={styles.modalBackdrop} onPress={() => setPickerMode(null)}>
              <Pressable style={[styles.pickerSheet, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]} onPress={() => undefined}>
                <View style={styles.pickerHeader}>
                  <Text style={styles.pickerTitle}>{pickerMode === 'date' ? t('transaction.chooseDate') : t('transaction.chooseTime')}</Text>
                  <Pressable accessibilityRole="button" onPress={() => setPickerMode(null)}>
                    <Text style={styles.pickerDone}>{t('common.confirm')}</Text>
                  </Pressable>
                </View>
                {pickerMode ? (
                  <DateTimePicker
                    value={pickerValue}
                    mode={pickerMode}
                    display="spinner"
                    locale={language === 'vi' ? 'vi-VN' : 'en-US'}
                    onChange={handlePickerChange}
                    themeVariant="dark"
                    textColor={colors.text}
                  />
                ) : null}
              </Pressable>
            </Pressable>
          </Modal>
        ) : null}
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: colors.background },
  header: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
  },
  headerAction: { width: 72 },
  headerTitle: { color: colors.text, fontSize: typography.body, fontWeight: '700' },
  cancelLabel: { color: colors.textSecondary, fontSize: typography.body },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.xl },
  balanceBlock: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  label: { color: colors.textSecondary, fontSize: typography.caption, marginBottom: spacing.sm },
  currentBalance: { color: colors.text, fontSize: typography.title, fontWeight: '700' },
  amountField: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: colors.accent,
    marginBottom: spacing.lg,
  },
  amountInput: { flex: 1, color: colors.text, fontSize: typography.title, paddingVertical: spacing.sm },
  currency: { color: colors.textSecondary, fontSize: typography.headline },
  differenceRow: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    marginBottom: spacing.lg,
  },
  difference: { color: colors.text, fontSize: typography.body, fontWeight: '700' },
  positive: { color: colors.income },
  negative: { color: colors.expense },
  noteInput: {
    minHeight: 48,
    color: colors.text,
    fontSize: typography.body,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    marginBottom: spacing.lg,
  },
  dateTimeRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  dateTimeButton: {
    flex: 1,
    minHeight: 58,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  dateTimeCaption: { color: colors.textSecondary, fontSize: typography.caption },
  dateTimeValue: { color: colors.text, fontSize: typography.body, marginTop: 4 },
  error: { color: colors.danger, fontSize: typography.body, marginBottom: spacing.md },
  footer: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  deleteButton: {
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.danger,
  },
  deleteLabel: { color: colors.danger, fontSize: typography.body, fontWeight: '700' },
  saveButton: {
    flex: 1,
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: colors.accent,
  },
  pressed: { opacity: 0.78 },
  saveLabel: { color: colors.background, fontSize: typography.body, fontWeight: '700' },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: colors.overlay },
  pickerSheet: { backgroundColor: colors.surfaceElevated, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg },
  pickerHeader: {
    minHeight: 52,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  pickerTitle: { color: colors.text, fontSize: typography.body, fontWeight: '600' },
  pickerDone: { color: colors.accent, fontSize: typography.body, fontWeight: '700' },
});