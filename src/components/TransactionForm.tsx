import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { format, parseISO } from 'date-fns';
import * as Haptics from 'expo-haptics';
import { useRef, useState } from 'react';
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
import { calculateWalletBalanceAt } from '../features/finance/financeEngine';
import { formatVndInput, parseVndInput } from '../lib/formatters';
import { formatLocalizedCurrency, formatLocalizedDate } from '../i18n/formatting';
import { localizeCategoryName, localizeWalletName, translateFinanceError, useI18n } from '../i18n';
import { useFinanceStore } from '../store/financeStore';
import { colors, radius, spacing, typography } from '../theme/theme';

interface TransactionFormProps {
  initialTransaction?: Transaction;
  initialDate?: string;
  initialType?: 'income' | 'expense' | 'transfer';
  onCancel: () => void;
  onSave: (transaction: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>) => void;
}

const getDefaultDate = () => new Date();

const selectionFeedback = () => {
  Haptics.selectionAsync().catch((error: unknown) => {
    console.warn('Could not play selection haptic feedback.', error);
  });
};

const makeTransactionDate = (date: string, time: string) => {
  const parsedDate = parseISO(date);
  const [hours, minutes] = time.split(':').map(Number);
  parsedDate.setHours(hours, minutes, 0, 0);
  return parsedDate;
};

export const TransactionForm = ({
  initialTransaction,
  initialDate,
  initialType,
  onCancel,
  onSave,
}: TransactionFormProps) => {
  const insets = useSafeAreaInsets();
  const { language, t } = useI18n();
  const categories = useFinanceStore((state) => state.categories);
  const wallets = useFinanceStore((state) => state.wallets);
  const transactions = useFinanceStore((state) => state.transactions);
  const activeWallets = wallets.filter((wallet) => !wallet.archivedAt);
  const selectableWallets = wallets.filter(
    (wallet) =>
      !wallet.archivedAt ||
      wallet.id === initialTransaction?.walletId ||
      wallet.id === initialTransaction?.sourceWalletId ||
      wallet.id === initialTransaction?.destinationWalletId,
  );
  const initialAmount = initialTransaction?.amount ?? 0;
  const [type, setType] = useState<'income' | 'expense' | 'transfer'>(
    initialType ??
      (initialTransaction?.type === 'transfer'
        ? 'transfer'
        : initialTransaction?.type === 'income'
          ? 'income'
          : 'expense'),
  );
          const transferWallets = type === 'transfer' ? activeWallets : selectableWallets;
  const [amountText, setAmountText] = useState(initialAmount ? formatVndInput(initialAmount, language) : '');
  const [categoryId, setCategoryId] = useState(initialTransaction?.categoryId ?? '');
  const [walletId, setWalletId] = useState(
    initialTransaction?.walletId ?? initialTransaction?.sourceWalletId ?? selectableWallets[0]?.id ?? '',
  );
  const initialSourceWallet = initialTransaction?.sourceWalletId ?? initialTransaction?.walletId ?? selectableWallets[0]?.id ?? '';
  const initialDestinationWallet =
    initialTransaction?.destinationWalletId ?? selectableWallets.find((wallet) => wallet.id !== initialSourceWallet)?.id ?? '';
  const [sourceWalletId, setSourceWalletId] = useState(initialSourceWallet);
  const [destinationWalletId, setDestinationWalletId] = useState(initialDestinationWallet);
  const [date, setDate] = useState(
    initialTransaction?.date ?? initialDate ?? format(getDefaultDate(), 'yyyy-MM-dd'),
  );
  const [time, setTime] = useState(
    initialTransaction?.time ?? format(getDefaultDate(), 'HH:mm'),
  );
  const [note, setNote] = useState(initialTransaction?.note ?? '');
  const [pickerMode, setPickerMode] = useState<'date' | 'time' | null>(null);
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const saveLock = useRef(false);
  const selectedAmount = parseVndInput(amountText);
  const isTransfer = type === 'transfer';
  const availableCategories = categories.filter(
    (category) =>
      category.type === type &&
      (!category.archivedAt || category.id === initialTransaction?.categoryId),
  );
  const selectedCategory = availableCategories.find((category) => category.id === categoryId);
  const selectedWallet = selectableWallets.find((wallet) => wallet.id === walletId);
  const selectedSourceWallet = transferWallets.find((wallet) => wallet.id === sourceWalletId);
  const selectedDestinationWallet = transferWallets.find((wallet) => wallet.id === destinationWalletId);
  const pickerValue = makeTransactionDate(date, time);
  const validTransferDate = /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    !Number.isNaN(parseISO(date).getTime()) &&
    format(parseISO(date), 'yyyy-MM-dd') === date;
  const validTransferTime = /^([01]\d|2[0-3]):[0-5]\d$/.test(time);
  const sourceAvailableBalance = selectedSourceWallet && validTransferDate && validTransferTime
    ? calculateWalletBalanceAt(
        selectedSourceWallet.id,
        transactions,
        wallets,
        date,
        time,
        initialTransaction?.type === 'transfer' ? initialTransaction.id : undefined,
      )
    : 0;

  const save = (
    values: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>,
    fallback: 'validation.transferSaveFailed' | 'validation.transactionSaveFailed',
  ) => {
    if (saveLock.current) return;
    saveLock.current = true;
    setIsSaving(true);
    try {
      onSave(values);
    } catch (saveError) {
      saveLock.current = false;
      setIsSaving(false);
      setError(translateFinanceError(saveError, t, fallback));
    }
  };

  const handleTypeChange = (nextType: 'income' | 'expense' | 'transfer') => {
    selectionFeedback();
    setType(nextType);
    if (nextType !== 'transfer') {
      const currentCategory = categories.find((category) => category.id === categoryId);
      if (currentCategory?.type !== nextType) {
        setCategoryId('');
      }
    }
    setError('');
  };

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

  const handleSave = () => {
    if (selectedAmount === null) {
      setError(t('validation.amountTooLarge'));
      return;
    }
    if (selectedAmount <= 0) {
      setError(t('validation.amountPositive'));
      return;
    }
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      Number.isNaN(parseISO(date).getTime()) ||
      format(parseISO(date), 'yyyy-MM-dd') !== date
    ) {
      setError(t('validation.validTransactionDate'));
      return;
    }
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
      setError(t('validation.validTime'));
      return;
    }

    if (isTransfer) {
      if (activeWallets.length < 2) {
        setError(t('transfer.needTwoActiveWallets'));
        return;
      }
      if (!selectedSourceWallet) {
        setError(t('validation.validSource'));
        return;
      }
      if (!selectedDestinationWallet) {
        setError(t('validation.validDestination'));
        return;
      }
      if (selectedSourceWallet.id === selectedDestinationWallet.id) {
        setError(t('validation.differentWallets'));
        return;
      }
      if (selectedAmount > sourceAvailableBalance) {
        setError(t('validation.insufficientBalance'));
        return;
      }

      setError('');
      save({
          type: 'transfer',
          amount: selectedAmount,
          categoryId: '',
          walletId: selectedSourceWallet.id,
          sourceWalletId: selectedSourceWallet.id,
          destinationWalletId: selectedDestinationWallet.id,
          date,
          time,
          note: note.trim(),
        }, 'validation.transferSaveFailed');
      return;
    }

    if (!selectedCategory) {
      setError(t('validation.chooseCategory'));
      return;
    }
    if (!selectedWallet) {
      setError(t('validation.chooseWallet'));
      return;
    }

    setError('');
    save({
        type,
        amount: selectedAmount,
        categoryId: selectedCategory.id,
        walletId: selectedWallet.id,
        date,
        time,
        note: note.trim(),
      }, 'validation.transactionSaveFailed');
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.screen, { paddingTop: insets.top + spacing.sm }]}>
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('transaction.cancelTransaction')}
            onPress={onCancel}
            style={styles.headerAction}
          >
            <Text style={styles.cancelText}>{t('common.cancel')}</Text>
          </Pressable>
          <Text style={styles.headerTitle}>
            {initialTransaction?.type === 'transfer'
              ? t('transfer.edit')
              : initialTransaction
                ? t('transaction.editTransaction')
                : isTransfer ? t('transfer.create') : t('transaction.newTransaction')}
          </Text>
          <View style={styles.headerAction} />
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.typeSwitch}>
            <TypeButton
              label={t('transaction.expense')}
              active={type === 'expense'}
              color={colors.expense}
              onPress={() => handleTypeChange('expense')}
            />
            <TypeButton
              label={t('transaction.income')}
              active={type === 'income'}
              color={colors.income}
              onPress={() => handleTypeChange('income')}
            />
            <TypeButton
              label={t('transaction.transfer')}
              active={type === 'transfer'}
              color={colors.accent}
              onPress={() => handleTypeChange('transfer')}
            />
          </View>

          <Text style={styles.label}>{isTransfer ? t('transfer.amount') : t('transaction.amount')}</Text>
          <View style={styles.amountField}>
            <TextInput
              accessibilityLabel={t('transaction.amountAccessibility')}
              value={amountText}
              onChangeText={(value) => {
                setAmountText(value.replace(/\D/g, ''));
                setError('');
              }}
              keyboardType="number-pad"
              placeholder="0"
              placeholderTextColor={colors.textSecondary}
              returnKeyType="done"
              style={styles.amountInput}
              maxLength={16}
            />
            <Text style={styles.currency}>₫</Text>
          </View>
          {selectedAmount !== null && selectedAmount > 0 ? (
            <Text style={styles.amountHint}>            {formatLocalizedCurrency(selectedAmount, language)}</Text>
          ) : null}

          {isTransfer ? (
            <>
              {activeWallets.length < 2 ? (
                <Text style={styles.transferNotice}>
                  {activeWallets.length === 0 ? t('transfer.noActiveWallet') : t('transfer.needTwoActiveWallets')}
                </Text>
              ) : null}
              <Text style={styles.label}>{t('transfer.from')}</Text>
              <View style={styles.walletList}>
                {transferWallets.map((wallet) => (
                  <OptionButton
                    key={wallet.id}
                    label={localizeWalletName(wallet.id, wallet.name, t)}
                    color={wallet.color}
                    selected={wallet.id === sourceWalletId}
                    onPress={() => {
                      selectionFeedback();
                      setSourceWalletId(wallet.id);
                      setError('');
                    }}
                  />
                ))}
              </View>

              <Text style={styles.label}>{t('transfer.to')}</Text>
              <View style={styles.walletList}>
                {transferWallets.map((wallet) => (
                  <OptionButton
                    key={wallet.id}
                    label={localizeWalletName(wallet.id, wallet.name, t)}
                    color={wallet.color}
                    selected={wallet.id === destinationWalletId}
                    onPress={() => {
                      selectionFeedback();
                      setDestinationWalletId(wallet.id);
                      setError('');
                    }}
                  />
                ))}
              </View>
            </>
          ) : (
            <>
              <Text style={styles.label}>{t('transaction.category')}</Text>
              <View style={styles.optionGrid}>
                {availableCategories.map((category) => (
                  <OptionButton
                    key={category.id}
                    label={localizeCategoryName(category.id, category.name, t)}
                    color={category.color}
                    selected={category.id === categoryId}
                    onPress={() => {
                      selectionFeedback();
                      setCategoryId(category.id);
                      setError('');
                    }}
                  />
                ))}
              </View>

              <Text style={styles.label}>{t('transaction.wallet')}</Text>
              <View style={styles.walletList}>
                {selectableWallets.map((wallet) => (
                  <OptionButton
                    key={wallet.id}
                    label={localizeWalletName(wallet.id, wallet.name, t)}
                    color={wallet.color}
                    selected={wallet.id === walletId}
                    onPress={() => {
                      selectionFeedback();
                      setWalletId(wallet.id);
                      setError('');
                    }}
                  />
                ))}
              </View>
            </>
          )}

          <Text style={styles.label}>{t('transaction.dateTime')}</Text>
          <View style={styles.dateTimeRow}>
            <Pressable
              accessibilityRole="button"
              onPress={() => setPickerMode('date')}
              style={styles.dateTimeButton}
            >
              <Text style={styles.dateTimeLabel}>{t('transaction.date')}</Text>
              <Text style={styles.dateTimeValue}>{formatLocalizedDate(parseISO(date), 'dd MMM yyyy', language)}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => setPickerMode('time')}
              style={styles.dateTimeButton}
            >
              <Text style={styles.dateTimeLabel}>{t('transaction.time')}</Text>
              <Text style={styles.dateTimeValue}>{time}</Text>
            </Pressable>
          </View>

          <Text style={styles.label}>{t('transaction.note')}</Text>
          <TextInput
            accessibilityLabel={t('transaction.noteAccessibility')}
            value={note}
            onChangeText={setNote}
            placeholder={t('transaction.addNote')}
            placeholderTextColor={colors.textSecondary}
            returnKeyType="done"
            style={styles.noteInput}
            maxLength={120}
          />

          {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: isSaving || (isTransfer && activeWallets.length < 2) }}
            disabled={isSaving || (isTransfer && activeWallets.length < 2)}
            onPress={handleSave}
            style={({ pressed }) => [
              styles.saveButton,
              pressed && styles.pressed,
              (isSaving || (isTransfer && activeWallets.length < 2)) && styles.saveDisabled,
            ]}
          >
            <Text style={styles.saveLabel}>
              {isSaving
                ? t('common.loading')
                : isTransfer
                  ? t('transfer.submit')
                  : initialTransaction ? t('common.saveChanges') : t('transaction.saveTransaction')}
            </Text>
          </Pressable>
        </ScrollView>
      </View>

      {Platform.OS === 'android' && pickerMode ? (
        <DateTimePicker
          value={pickerValue}
          mode={pickerMode}
          display="default"
          onChange={handlePickerChange}
        />
      ) : null}

      {Platform.OS === 'ios' ? (
        <Modal
          visible={pickerMode !== null}
          transparent
          animationType="slide"
          onRequestClose={() => setPickerMode(null)}
        >
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
    </KeyboardAvoidingView>
  );
};

const TypeButton = ({
  label,
  active,
  color,
  onPress,
}: {
  label: string;
  active: boolean;
  color: string;
  onPress: () => void;
}) => (
  <Pressable
    accessibilityRole="button"
    accessibilityState={{ selected: active }}
    onPress={onPress}
    style={[styles.typeButton, active && { backgroundColor: `${color}18`, borderColor: color }]}
  >
    <Text style={[styles.typeLabel, active && { color }]}>{label}</Text>
  </Pressable>
);

const OptionButton = ({
  label,
  color,
  selected,
  onPress,
}: {
  label: string;
  color: string;
  selected: boolean;
  onPress: () => void;
}) => (
  <Pressable
    accessibilityRole="button"
    accessibilityState={{ selected }}
    onPress={onPress}
    style={[styles.optionButton, selected && { backgroundColor: `${color}18`, borderColor: color }]}
  >
    <View style={[styles.optionDot, { backgroundColor: color }]} />
    <Text style={[styles.optionLabel, selected && { color }]}>{label}</Text>
  </Pressable>
);

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: colors.background },
  header: {
    minHeight: 48,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerAction: { minWidth: 62 },
  cancelText: { color: colors.textSecondary, fontSize: 15 },
  headerTitle: { color: colors.text, fontSize: 17, fontWeight: '700' },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl * 2,
  },
  typeSwitch: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  typeButton: {
    flex: 1,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  typeLabel: { color: colors.textSecondary, fontSize: 15, fontWeight: '700' },
  label: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: spacing.sm,
    marginTop: spacing.md,
  },
  amountField: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  amountInput: {
    flex: 1,
    color: colors.text,
    fontSize: typography.display,
    fontWeight: '700',
    paddingVertical: spacing.sm,
  },
  currency: { color: colors.textSecondary, fontSize: 20, fontWeight: '600', marginLeft: spacing.sm },
  amountHint: { color: colors.textSecondary, fontSize: 13, marginTop: spacing.xs },
  optionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  walletList: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  optionButton: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
  },
  optionDot: { width: 8, height: 8, borderRadius: 4, marginRight: spacing.sm },
  optionLabel: { color: colors.textSecondary, fontSize: 14, fontWeight: '600' },
  dateTimeRow: { flexDirection: 'row', gap: spacing.sm },
  dateTimeButton: {
    flex: 1,
    minHeight: 62,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
  },
  dateTimeLabel: { color: colors.textSecondary, fontSize: 12, marginBottom: 4 },
  dateTimeValue: { color: colors.text, fontSize: 15, fontWeight: '600' },
  noteInput: {
    minHeight: 52,
    paddingHorizontal: spacing.md,
    color: colors.text,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    fontSize: 15,
  },
  error: { color: colors.expense, fontSize: 14, marginTop: spacing.md },
  transferNotice: {
    color: colors.warning,
    fontSize: 14,
    marginBottom: spacing.sm,
    marginTop: spacing.xs,
  },
  saveButton: {
    minHeight: 54,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    marginTop: spacing.xl,
  },
  saveLabel: { color: colors.background, fontSize: 16, fontWeight: '800' },
  saveDisabled: { opacity: 0.45 },
  pressed: { opacity: 0.8 },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: colors.overlay },
  pickerSheet: {
    backgroundColor: colors.surfaceElevated,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  pickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  pickerTitle: { color: colors.text, fontSize: 16, fontWeight: '700' },
  pickerDone: { color: colors.accent, fontSize: 16, fontWeight: '700', padding: spacing.sm },
});
