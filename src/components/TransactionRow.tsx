import { parseISO } from 'date-fns';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Transaction } from '../features/finance/models';
import { formatLocalizedCurrency, formatLocalizedDate } from '../i18n/formatting';
import { localizeCategoryName, localizeWalletName, useI18n } from '../i18n';
import type { TranslationKey } from '../i18n';
import { useFinanceStore } from '../store/financeStore';
import { colors, radius, spacing } from '../theme/theme';

interface TransactionRowProps {
  transaction: Transaction;
  onPress?: () => void;
  showDate?: boolean;
}

export const TransactionRow = ({
  transaction,
  onPress,
  showDate = true,
}: TransactionRowProps) => {
  const { language, t } = useI18n();
  const category = useFinanceStore((state) =>
    state.categories.find((item) => item.id === transaction.categoryId),
  );
  const wallet = useFinanceStore((state) =>
    state.wallets.find((item) => item.id === transaction.walletId),
  );
  const sourceWallet = useFinanceStore((state) =>
    state.wallets.find((item) => item.id === (transaction.sourceWalletId ?? transaction.walletId)),
  );
  const destinationWallet = useFinanceStore((state) =>
    state.wallets.find((item) => item.id === transaction.destinationWalletId),
  );
  const isPositive = transaction.type === 'income' ||
    (transaction.type === 'adjustment' && transaction.adjustmentDirection !== 'decrease');
  const typeLabel = t(
    transaction.type === 'adjustment'
      ? 'transaction.adjustment'
      : `transaction.${transaction.type}` as TranslationKey,
  );
  const categoryName = category ? localizeCategoryName(category.id, category.name, t) : '';
  const walletName = wallet ? localizeWalletName(wallet.id, wallet.name, t) : '';
  const sourceWalletName = sourceWallet
    ? localizeWalletName(sourceWallet.id, sourceWallet.name, t)
    : '';
  const destinationWalletName = destinationWallet
    ? localizeWalletName(destinationWallet.id, destinationWallet.name, t)
    : '';
  const titleText =
    transaction.type === 'transfer'
      ? `${sourceWalletName || t('transaction.from')} → ${destinationWalletName || t('transaction.to')}`
      : transaction.note.trim() || categoryName || t('transaction.transaction');
  const metaText =
    transaction.type === 'transfer'
      ? [sourceWalletName, destinationWalletName, showDate ? formatLocalizedDate(parseISO(transaction.date), 'dd MMM', language) : null]
          .filter(Boolean)
          .join(' · ')
      : [categoryName, walletName, showDate ? formatLocalizedDate(parseISO(transaction.date), 'dd MMM', language) : null]
          .filter(Boolean)
          .join(' · ');

  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={`${typeLabel}, ${formatLocalizedCurrency(transaction.amount, language)}, ${titleText}`}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && onPress ? styles.pressed : undefined]}
    >
      <View style={styles.leftGroup}>
        <View
          style={[
            styles.dot,
            {
              backgroundColor:
                transaction.type === 'transfer'
                  ? colors.accent
                  : category?.color ?? colors.textSecondary,
            },
          ]}
        />
        <View style={styles.description}>
          <Text style={styles.title} numberOfLines={1}>
            {titleText}
          </Text>
          <Text style={styles.meta} numberOfLines={1}>
            {metaText}
          </Text>
        </View>
      </View>

      <View style={styles.rightGroup}>
        <Text
          style={[
            styles.amount,
            transaction.type === 'transfer'
              ? styles.transfer
              : isPositive
                ? styles.positive
                : styles.negative,
          ]}
          numberOfLines={1}
        >
          {transaction.type === 'transfer'
            ? formatLocalizedCurrency(transaction.amount, language)
            : `${isPositive ? '+' : '-'}${formatLocalizedCurrency(transaction.amount, language)}`}
        </Text>
        <Text style={styles.type}>{typeLabel}</Text>
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  row: {
    minHeight: 72,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
  },
  pressed: {
    opacity: 0.78,
  },
  leftGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: spacing.sm,
  },
  description: {
    flex: 1,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: spacing.md,
  },
  title: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  meta: {
    color: colors.textSecondary,
    fontSize: 13,
    marginTop: 4,
  },
  rightGroup: {
    alignItems: 'flex-end',
    flexShrink: 0,
  },
  amount: {
    fontSize: 14,
    fontWeight: '700',
  },
  type: {
    fontSize: 12,
    color: colors.textSecondary,
    textTransform: 'capitalize',
    marginTop: 3,
  },
  positive: {
    color: colors.income,
  },
  negative: {
    color: colors.expense,
  },
  transfer: {
    color: colors.accent,
  },
});
