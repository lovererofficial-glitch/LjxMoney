import { router } from 'expo-router';
import { useMemo } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { calculateWalletBalance } from '../src/features/finance/financeEngine';
import { useFinanceStore } from '../src/store/financeStore';
import { localizeWalletName, localizeWalletType, useI18n } from '../src/i18n';
import { getDisplayAmount, useSecurityStore } from '../src/security/securityStore';
import { colors, radius, spacing, typography } from '../src/theme/theme';

const WALLET_GLYPHS: Record<string, string> = {
  wallet: '$',
  landmark: 'B',
  smartphone: 'M',
  creditcard: 'C',
  folder: 'S',
  'dots-horizontal': '...',
};

export default function WalletsScreen() {
  const { language, t } = useI18n();
  const insets = useSafeAreaInsets();
  // Top edge of the absolute tab bar (tab bar: marginBottom 10 + height 58 + max(insets.bottom, 8)),
  // plus a small gap so the FAB floats fully above it and inside the safe area.
  const fabBottom = 68 + Math.max(insets.bottom, 8) + spacing.sm;

  const wallets = useFinanceStore((state) => state.wallets);
  const transactions = useFinanceStore((state) => state.transactions);
  const hasHydrated = useFinanceStore((state) => state.hasHydrated);
  const isBalanceHidden = useSecurityStore((state) => state.isBalanceHidden);
  const toggleBalanceHidden = useSecurityStore((state) => state.toggleBalanceHidden);

  const activeWallets = useMemo(() => wallets.filter((wallet) => !wallet.archivedAt), [wallets]);
  const archivedWallets = useMemo(() => wallets.filter((wallet) => wallet.archivedAt), [wallets]);
  const hasNoWallets = activeWallets.length === 0 && archivedWallets.length === 0;

  const totalBalance = useMemo(() => {
    let total = 0;
    for (const wallet of wallets) {
      total += calculateWalletBalance(wallet.id, transactions, wallets);
    }
    return total;
  }, [wallets, transactions]);

  if (!hasHydrated) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <Text style={styles.loading}>{t('common.loading')}</Text>
      </View>
    );
  }

  const archive = (wallet: (typeof wallets)[number]) => {
    Alert.alert(t('wallet.archiveConfirmation'), t('wallet.archiveWarning'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.archive'),
        style: 'destructive',
        onPress: () => {
          useFinanceStore.getState().archiveWallet(wallet.id);
        },
      },
    ]);
  };

  const restore = (wallet: (typeof wallets)[number]) => {
    useFinanceStore.getState().restoreWallet(wallet.id);
  };

  const renderWallet = (wallet: (typeof wallets)[number], archived = false) => (
    <View key={wallet.id} style={[styles.row, archived && styles.archivedRow]}>
      <View style={[styles.walletIcon, { backgroundColor: `${wallet.color}24`, borderColor: `${wallet.color}80` }]}>
        <Text style={[styles.walletGlyph, { color: wallet.color }]}>{WALLET_GLYPHS[wallet.icon ?? 'wallet'] ?? '$'}</Text>
      </View>
      <View style={styles.rowContent}>
        <Text numberOfLines={1} style={styles.rowName}>{localizeWalletName(wallet.id, wallet.name, t)}</Text>
        <Text style={styles.rowType}>{localizeWalletType(wallet.type, t)}{archived ? ` · ${t('wallet.archived')}` : ''}</Text>
      </View>
      <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.rowBalance, archived && styles.rowBalanceDisabled]}>
        {getDisplayAmount(calculateWalletBalance(wallet.id, transactions, wallets), language, isBalanceHidden)}
      </Text>
      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${t('wallet.viewWallet')}: ${wallet.name}`}
          onPress={() => router.push(`/wallets/${wallet.id}`)}
          style={({ pressed }) => [styles.viewWalletAction, pressed && styles.actionPressed]}
        >
          <Text numberOfLines={1} style={styles.viewWalletLabel}>{t('wallet.viewWallet')}</Text>
        </Pressable>
        {archived ? (
          <Pressable accessibilityRole="button" onPress={() => restore(wallet)} style={({ pressed }) => [styles.textAction, pressed && styles.actionPressed]}>
            <Text style={styles.restoreLabel}>{t('wallet.restore')}</Text>
          </Pressable>
        ) : (
          <Pressable accessibilityRole="button" onPress={() => archive(wallet)} style={({ pressed }) => [styles.textAction, pressed && styles.actionPressed]}>
            <Text style={styles.actionLabel}>{t('common.archive')}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );

  return (
    <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom + 96 }]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.totalBlock}>
          <View style={styles.totalHeader}>
            <Text style={styles.totalLabel}>{t('wallet.totalBalance')}</Text>
            <Pressable accessibilityRole="switch" accessibilityLabel={isBalanceHidden ? t('common.showBalance') : t('common.hideBalance')} accessibilityState={{ checked: !isBalanceHidden }} onPress={toggleBalanceHidden} style={styles.eyeButton}>
              <Text style={styles.eyeText}>{isBalanceHidden ? '◉' : '◌'}</Text>
            </Pressable>
          </View>
          <Text numberOfLines={1} adjustsFontSizeToFit style={styles.totalValue}>{getDisplayAmount(totalBalance, language, isBalanceHidden)}</Text>
          <View style={styles.totalRule} />
        </View>

        {hasNoWallets ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyMark}><Text style={styles.emptyMarkText}>+</Text></View>
            <Text style={styles.emptyTitle}>{t('wallet.emptyTitle')}</Text>
            <Text style={styles.emptyDescription}>{t('wallet.emptyDescription')}</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/wallets/new')}
              style={({ pressed }) => [styles.emptyAddButton, pressed && styles.actionPressed]}
            >
              <Text style={styles.emptyAddLabel}>+ {t('wallet.addWallet')}</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{t('wallet.active')}</Text>
              <View style={styles.list}>
                {activeWallets.length ? activeWallets.map((wallet) => renderWallet(wallet)) : (
                  <Text style={styles.emptyText}>{t('wallet.noActiveWallets')}</Text>
                )}
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{t('wallet.archived')}</Text>
              <View style={styles.list}>
                {archivedWallets.length ? archivedWallets.map((wallet) => renderWallet(wallet, true)) : (
                  <Text style={styles.emptyText}>{t('wallet.noArchivedWallets')}</Text>
                )}
              </View>
            </View>
          </>
        )}
      </ScrollView>

      {!hasNoWallets ? (
        <Pressable
          onPress={() => router.push('/wallets/new')}
          accessibilityRole="button"
          style={({ pressed }) => [styles.addButton, { bottom: fabBottom }, pressed && styles.fabPressed]}
        >
          <Text style={styles.fabIcon}>{t('wallet.addAction')}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}


const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingHorizontal: spacing.xl,
  },
  loading: {
    fontSize: typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  totalBlock: {
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
    marginBottom: spacing.md,
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 3,
  },
  totalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  totalLabel: {
    fontSize: typography.caption,
    color: colors.textSecondary,
    letterSpacing: 1,
  },
  eyeButton: {
    width: 30,
    height: 30,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eyeText: { color: colors.text, fontSize: 14, fontWeight: '700' },
  totalValue: {
    fontSize: typography.display,
    color: colors.text,
    fontWeight: '700',
  },
  totalRule: {
    height: 1,
    backgroundColor: colors.border,
    marginTop: spacing.xl,
  },
  empty: {
    paddingVertical: spacing.md,
  },
  emptyText: {
    fontSize: typography.body,
    color: colors.textSecondary,
  },
  emptyState: {
    alignItems: 'center',
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xxl,
    marginTop: spacing.md,
  },
  emptyMark: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.lg,
  },
  emptyMarkText: { color: colors.accent, fontSize: 28, fontWeight: '500' },
  emptyTitle: { color: colors.text, fontSize: typography.headline, fontWeight: '700', textAlign: 'center' },
  emptyDescription: { color: colors.textSecondary, fontSize: typography.body, lineHeight: 22, textAlign: 'center', marginTop: spacing.sm },
  emptyAddButton: {
    minHeight: 48,
    alignSelf: 'stretch',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: radius.md,
    backgroundColor: colors.accent,
    marginTop: spacing.xl,
  },
  emptyAddLabel: { color: colors.background, fontSize: typography.body, fontWeight: '700' },
  section: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    fontSize: typography.headline,
    color: colors.text,
    fontWeight: '600',
    marginBottom: spacing.sm,
  },
  list: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 76,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  archivedRow: {
    opacity: 0.7,
  },
  walletIcon: {
    width: 42,
    height: 42,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  walletGlyph: {
    fontSize: typography.headline,
    fontWeight: '700',
  },
  rowContent: {
    flex: 1,
    minWidth: 60,
    gap: 4,
  },
  rowName: {
    fontSize: typography.body,
    color: colors.text,
    fontWeight: '600',
  },
  rowNameDisabled: {
    color: colors.textSecondary,
  },
  rowType: {
    fontSize: typography.caption,
    color: colors.textSecondary,
  },
  rowTypeDisabled: {
    color: colors.mutedText,
  },
  rowBalance: {
    fontSize: typography.body,
    color: colors.text,
    fontWeight: '600',
    maxWidth: 110,
  },
  rowBalanceDisabled: {
    color: colors.textSecondary,
  },
  actions: {
    alignItems: 'flex-end',
    gap: spacing.xs,
  },
  viewWalletAction: {
    minHeight: 40,
    minWidth: 74,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceElevated,
  },
  textAction: {
    minHeight: 28,
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
  },
  actionPressed: {
    opacity: 0.7,
  },
  actionLabel: {
    fontSize: typography.caption,
    color: colors.textSecondary,
  },
  restoreLabel: {
    fontSize: typography.caption,
    color: colors.income,
    fontWeight: '600',
  },
  viewWalletLabel: {
    fontSize: typography.caption,
    color: colors.accent,
    fontWeight: '600',
  },
  addButton: {
    position: 'absolute',
    left: spacing.xl,
    right: spacing.xl,
    height: 52,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  fabPressed: {
    opacity: 0.82,
  },
  fabIcon: {
    fontSize: typography.body,
    color: colors.background,
    fontWeight: '700',
  },
});