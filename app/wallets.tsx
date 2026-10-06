import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import {
  calculateWalletBalance,
} from '../src/features/finance/financeEngine';
import type { Wallet } from '../src/features/finance/models';
import { formatVndInput, parseVndInput } from '../src/lib/formatters';
import { formatLocalizedCurrency } from '../src/i18n/formatting';
import { localizeWalletName, localizeWalletType, translateFinanceError, useI18n } from '../src/i18n';
import { useFinanceStore } from '../src/store/financeStore';
import { colors, radius, spacing, typography } from '../src/theme/theme';

const walletTypes: Wallet['type'][] = ['cash', 'bank', 'ewallet', 'card', 'savings', 'other'];

export default function WalletsScreen() {
  const insets = useSafeAreaInsets();
  const { language, t } = useI18n();
  const wallets = useFinanceStore((state) => state.wallets);
  const transactions = useFinanceStore((state) => state.transactions);
  const hasHydrated = useFinanceStore((state) => state.hasHydrated);
  const addWallet = useFinanceStore((state) => state.addWallet);
  const updateWallet = useFinanceStore((state) => state.updateWallet);
  const archiveWallet = useFinanceStore((state) => state.archiveWallet);
  const [name, setName] = useState('');
  const [type, setType] = useState<Wallet['type']>('cash');
  const [initialBalance, setInitialBalance] = useState('0');
  const [editingWallet, setEditingWallet] = useState<Wallet | null>(null);
  const [error, setError] = useState('');

  const activeWallets = useMemo(
    () =>
      wallets
        .filter((wallet) => !wallet.archivedAt)
        .map((wallet) => ({
          ...wallet,
          balance: calculateWalletBalance(wallet.id, transactions, wallets),
        })),
    [transactions, wallets],
  );
  const archivedWallets = wallets.filter((wallet) => wallet.archivedAt);

  if (!hasHydrated) {
    return (
      <View style={[styles.screen, styles.loading]}>
        <Text style={styles.walletType}>{t('wallet.loading')}</Text>
      </View>
    );
  }

  const handleSave = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError(t('validation.walletName'));
      return;
    }
    const normalizedAmount = parseVndInput(initialBalance);
    if (normalizedAmount === null || normalizedAmount < 0) {
      setError(t('validation.validOpeningBalance'));
      return;
    }
    try {
      if (editingWallet) {
        updateWallet(editingWallet.id, {
          name: trimmed,
          type,
          initialBalance: normalizedAmount,
          icon: type,
        });
        setEditingWallet(null);
      } else {
        addWallet({
          id: `wallet-${Date.now()}`,
          name: trimmed,
          color: '#D7B56D',
          type,
          icon: type,
          initialBalance: normalizedAmount,
          archivedAt: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }
    } catch (saveError) {
      setError(translateFinanceError(saveError, t, 'validation.walletSaveFailed'));
      return;
    }
    setName('');
    setType('cash');
    setInitialBalance('0');
    setError('');
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.md }]}>
      <View style={styles.headerRow}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backLabel}>{t('common.back')}</Text>
        </Pressable>
        <Text style={styles.title}>{t('wallet.wallets')}</Text>
        <View style={styles.backButton} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{editingWallet ? t('wallet.editWallet') : t('wallet.newWallet')}</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder={t('wallet.name')}
            placeholderTextColor={colors.textSecondary}
            style={styles.input}
          />

          <Text style={styles.sectionLabel}>{t('wallet.type')}</Text>
          <View style={styles.typeRow}>
            {walletTypes.map((option) => (
              <Pressable
                key={option}
                onPress={() => setType(option)}
                style={[styles.typeButton, option === type && styles.typeButtonActive]}
              >
                <Text style={[styles.typeLabel, option === type && styles.typeLabelActive]}>
                  {localizeWalletType(option, t)}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.sectionLabel}>{t('wallet.initialBalance')}</Text>
          <TextInput
            value={initialBalance}
            onChangeText={(value) => {
              const amount = parseVndInput(value);
              setInitialBalance(amount === null ? value : amount ? formatVndInput(amount, language) : '');
            }}
            keyboardType="number-pad"
            placeholder="0"
            placeholderTextColor={colors.textSecondary}
            style={styles.input}
          />

          {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
          <Pressable onPress={handleSave} style={styles.primaryButton}>
            <Text style={styles.primaryLabel}>{editingWallet ? t('common.saveChanges') : t('wallet.addWallet')}</Text>
          </Pressable>
          {editingWallet ? (
            <Pressable
              onPress={() => {
                setEditingWallet(null);
                setName('');
                setType('cash');
                setInitialBalance('0');
                setError('');
              }}
              style={styles.cancelButton}
            >
              <Text style={styles.cancelLabel}>{t('common.cancel')}</Text>
            </Pressable>
          ) : null}
        </View>

        <View style={styles.listWrap}>
          <Text style={styles.sectionTitle}>{t('wallet.active')}</Text>
          {activeWallets.map((wallet) => (
            <View key={wallet.id} style={styles.walletRow}>
              <Pressable
                onPress={() => router.push({ pathname: '/wallet/[id]', params: { id: wallet.id } })}
                style={styles.walletMeta}
              >
                <View style={[styles.dot, { backgroundColor: wallet.color }]} />
                <View>
                  <Text style={styles.walletName}>{localizeWalletName(wallet.id, wallet.name, t)}</Text>
                  <Text style={styles.walletType}>{localizeWalletType(wallet.type, t)}</Text>
                </View>
              </Pressable>
              <View style={styles.walletBalanceWrap}>
                <Text style={styles.walletBalance}>{formatLocalizedCurrency(wallet.balance, language)}</Text>
                <Pressable
                  onPress={() => {
                    setEditingWallet(wallet);
                    setName(wallet.name);
                    setType(wallet.type);
                    setInitialBalance(formatVndInput(wallet.initialBalance, language));
                    setError('');
                  }}
                  style={styles.archiveButton}
                >
                  <Text style={styles.editText}>{t('common.edit')}</Text>
                </Pressable>
                <Pressable
                  onPress={() =>
                    Alert.alert(t('wallet.archiveConfirmation'), t('wallet.archiveWarning'), [
                      { text: t('common.cancel'), style: 'cancel' },
                      { text: t('common.archive'), style: 'destructive', onPress: () => archiveWallet(wallet.id) },
                    ])
                  }
                  style={styles.archiveButton}
                >
                  <Text style={styles.archiveText}>{t('common.archive')}</Text>
                </Pressable>
              </View>
            </View>
          ))}
        </View>

        {archivedWallets.length ? (
          <View style={styles.listWrap}>
            <Text style={styles.sectionTitle}>{t('common.archived')}</Text>
            {archivedWallets.map((wallet) => (
              <View key={wallet.id} style={styles.walletRowMuted}>
                <Pressable
                  onPress={() => router.push({ pathname: '/wallet/[id]', params: { id: wallet.id } })}
                  style={styles.walletMeta}
                >
                  <View>
                    <Text style={styles.walletName}>{localizeWalletName(wallet.id, wallet.name, t)}</Text>
                    <Text style={styles.walletBalanceSmall}>
                      {formatLocalizedCurrency(calculateWalletBalance(wallet.id, transactions, wallets), language)}
                    </Text>
                  </View>
                </Pressable>
                <Pressable onPress={() => updateWallet(wallet.id, { archivedAt: null })} style={styles.restoreButton}>
                  <Text style={styles.restoreText}>{t('common.restore')}</Text>
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  loading: { alignItems: 'center', justifyContent: 'center' },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  backButton: { minWidth: 60 },
  backLabel: { color: colors.accent, fontSize: 15 },
  title: { color: colors.text, fontSize: typography.title, fontWeight: '800' },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  cardTitle: { color: colors.text, fontSize: 18, fontWeight: '700', marginBottom: spacing.md },
  sectionLabel: { color: colors.textSecondary, fontSize: 13, fontWeight: '600', marginTop: spacing.md },
  input: {
    minHeight: 52,
    borderRadius: radius.md,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    paddingHorizontal: spacing.md,
    marginTop: spacing.sm,
  },
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  typeButton: {
    paddingHorizontal: spacing.md,
    minHeight: 40,
    borderRadius: radius.sm,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
  },
  typeButtonActive: { backgroundColor: `${colors.accent}22`, borderColor: colors.accent },
  typeLabel: { color: colors.textSecondary, fontSize: 13, fontWeight: '700' },
  typeLabelActive: { color: colors.accent },
  primaryButton: {
    minHeight: 54,
    marginTop: spacing.lg,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
  },
  primaryLabel: { color: colors.background, fontSize: 15, fontWeight: '800' },
  error: { color: colors.expense, fontSize: 13, marginTop: spacing.md },
  cancelButton: { minHeight: 44, justifyContent: 'center', alignItems: 'center', marginTop: spacing.xs },
  cancelLabel: { color: colors.textSecondary, fontSize: 14, fontWeight: '600' },
  listWrap: { marginBottom: spacing.lg },
  sectionTitle: { color: colors.text, fontSize: 18, fontWeight: '700', marginBottom: spacing.md },
  walletRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  walletRowMuted: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    opacity: 0.7,
    marginBottom: spacing.sm,
  },
  walletMeta: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  dot: { width: 10, height: 10, borderRadius: 5, marginRight: spacing.sm },
  walletName: { color: colors.text, fontSize: 15, fontWeight: '700' },
  walletType: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
  walletBalanceWrap: { alignItems: 'flex-end' },
  walletBalance: { color: colors.text, fontSize: 14, fontWeight: '700' },
  walletBalanceSmall: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
  archiveButton: { marginTop: spacing.xs, marginLeft: spacing.md },
  editText: { color: colors.accent, fontSize: 12, fontWeight: '700' },
  archiveText: { color: colors.expense, fontSize: 12, fontWeight: '700' },
  restoreButton: { marginLeft: spacing.sm },
  restoreText: { color: colors.income, fontSize: 12, fontWeight: '700' },
});
