import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuthStore } from '../../src/auth/authStore';
import { calculateWalletBalance } from '../../src/features/finance/financeEngine';
import { localizeCategoryName, localizeWalletName, localizeWalletType, useI18n } from '../../src/i18n';
import { transactionDetailRoute } from '../../src/lib/transactionRoutes';
import { getDisplayAmount, useSecurityStore } from '../../src/security/securityStore';
import { requestSyncNow } from '../../src/sync/syncRuntime';
import { useFinanceStore } from '../../src/store/financeStore';
import { getWalletDeleteBlocker } from '../../src/store/walletDeletion';
import { colors, radius, spacing, typography } from '../../src/theme/theme';
import {
  useWalletQrStore,
  walletQrNeedsRemoteRestore,
  walletQrWasRemovedRemotely,
} from '../../src/wallets/walletQrStore';
import {
  deleteWalletQrFromCloud,
  downloadWalletQr,
  isWalletQrFileAvailable,
  removeLocalWalletQr,
  saveWalletQrLocally,
  uploadWalletQr,
} from '../../src/wallets/walletQrAssets';

export default function WalletDetailScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { language, t } = useI18n();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const user = useAuthStore((state) => state.user);
  const hydrateWalletQr = useWalletQrStore((state) => state.hydrateWalletQr);
  const getQrCloudPath = useWalletQrStore((state) => state.getQrCloudPath);
  const setQrCloudPath = useWalletQrStore((state) => state.setQrCloudPath);
  const hasPendingQrUpload = useWalletQrStore((state) => state.hasPendingQrUpload);
  const hasPendingQrDeletion = useWalletQrStore((state) => state.hasPendingQrDeletion);
  const setQrForWallet = useWalletQrStore((state) => state.setQrForWallet);
  const clearQrForWallet = useWalletQrStore((state) => state.clearQrForWallet);
  const queueQrDeletion = useWalletQrStore((state) => state.queueQrDeletion);
  const clearPendingQrDeletion = useWalletQrStore((state) => state.clearPendingQrDeletion);
  const queueQrUpload = useWalletQrStore((state) => state.queueQrUpload);
  const clearPendingQrUpload = useWalletQrStore((state) => state.clearPendingQrUpload);
  const walletQrMap = useWalletQrStore((state) => state.walletQrs);
  const [qrPreviewVisible, setQrPreviewVisible] = useState(false);
  const [loadingQr, setLoadingQr] = useState(false);

  const wallets = useFinanceStore((state) => state.wallets);
  const transactions = useFinanceStore((state) => state.transactions);
  const categories = useFinanceStore((state) => state.categories);
  const hasHydrated = useFinanceStore((state) => state.hasHydrated);
  const isBalanceHidden = useSecurityStore((state) => state.isBalanceHidden);
  const toggleBalanceHidden = useSecurityStore((state) => state.toggleBalanceHidden);

  const wallet = useMemo(
    () => (id ? wallets.find((item) => item.id === id) ?? null : null),
    [id, wallets],
  );

  const walletDisplayName = wallet ? localizeWalletName(wallet.id, wallet.name, t) : '';
  const walletTypeLabel = wallet ? localizeWalletType(wallet.type, t) : '';
  const walletId = wallet?.id;
  const paymentQrPath = wallet?.paymentQrPath;
  const userId = user?.id;
  const walletPaymentQr = useMemo(() => {
    if (!wallet || !user?.id) {
      return null;
    }
    return walletQrMap[user.id]?.[wallet.id] ?? null;
  }, [user?.id, wallet, walletQrMap]);

  useEffect(() => {
    if (!walletId || !userId) {
      return;
    }
    let cancelled = false;
    const loadWalletQr = async () => {
      let localUri = await hydrateWalletQr(userId, walletId);
      const localCloudPath = await getQrCloudPath(userId, walletId);
      const uploadPending = await hasPendingQrUpload(userId, walletId);
      if (localUri && !isWalletQrFileAvailable(localUri)) {
        await clearQrForWallet(userId, walletId);
        localUri = null;
      }
      if (walletQrWasRemovedRemotely(paymentQrPath, localCloudPath, uploadPending) && localUri) {
        removeLocalWalletQr(userId, walletId, localUri);
        await clearQrForWallet(userId, walletId);
        return;
      }
      if (
        cancelled ||
        !paymentQrPath ||
        !walletQrNeedsRemoteRestore(paymentQrPath, localUri, localCloudPath, uploadPending)
      ) {
        return;
      }
      try {
        const downloadedUri = await downloadWalletQr(userId, walletId, paymentQrPath);
        if (!cancelled && useAuthStore.getState().user?.id === userId) {
          await setQrForWallet(userId, walletId, downloadedUri);
          await setQrCloudPath(userId, walletId, paymentQrPath);
          if (localUri && localUri !== downloadedUri) {
            removeLocalWalletQr(userId, walletId, localUri);
          }
        }
      } catch {
        // A cloud image that is temporarily unavailable must not block the wallet.
      }
    };
    void loadWalletQr();
    return () => {
      cancelled = true;
    };
  }, [clearQrForWallet, getQrCloudPath, hasPendingQrUpload, hydrateWalletQr, paymentQrPath, setQrCloudPath, setQrForWallet, userId, walletId]);

  const balance = useMemo(() => {
    if (!wallet) {
      return 0;
    }
    return calculateWalletBalance(wallet.id, transactions, wallets);
  }, [wallet, transactions, wallets]);

  const transactionsForWallet = useMemo(() => {
    if (!wallet) {
      return [] as typeof transactions;
    }
    return transactions.filter((transaction) => {
      return transaction.walletId === wallet.id ||
        transaction.sourceWalletId === wallet.id ||
        transaction.destinationWalletId === wallet.id;
    });
  }, [wallet, transactions]);

  const pickWalletQr = async () => {
    if (!wallet || !user?.id) {
      return;
    }

    setLoadingQr(true);
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(t('wallet.permissionDeniedTitle'), t('wallet.permissionDeniedMessage'));
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 1,
      });
      const asset = result.canceled ? null : result.assets?.[0];
      if (!asset) {
        return;
      }

      const saved = await saveWalletQrLocally(user.id, wallet.id, asset);
      const previousUri = walletPaymentQr;
      await clearPendingQrDeletion(user.id, wallet.id);
      await queueQrUpload(user.id, wallet.id);
      await setQrForWallet(user.id, wallet.id, saved.uri);
      if (previousUri && previousUri !== saved.uri) {
        removeLocalWalletQr(user.id, wallet.id, previousUri);
      }
      setLoadingQr(false);

      try {
        const paymentQrPath = await uploadWalletQr(user.id, wallet.id, saved.uri, saved.mimeType);
        if (useAuthStore.getState().user?.id === user.id) {
          useFinanceStore.getState().updateWallet(wallet.id, { paymentQrPath });
          await setQrCloudPath(user.id, wallet.id, paymentQrPath);
          await clearPendingQrUpload(user.id, wallet.id);
        }
      } catch {
        requestSyncNow();
      }
    } catch {
      Alert.alert(t('wallet.invalidQrTitle'), t('wallet.invalidQrMessage'));
    } finally {
      setLoadingQr(false);
    }
  };

  const removeWalletQr = async () => {
    if (!wallet || !user?.id) {
      return;
    }

    Alert.alert(t('wallet.removeConfirmationTitle'), t('wallet.removeConfirmationMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('wallet.removeQr'),
        style: 'destructive',
        onPress: async () => {
          setLoadingQr(true);
          try {
            await queueQrDeletion(user.id, wallet.id);
            if (walletPaymentQr) {
              removeLocalWalletQr(user.id, wallet.id, walletPaymentQr);
            }
            await clearQrForWallet(user.id, wallet.id);
            await clearPendingQrUpload(user.id, wallet.id);
            useFinanceStore.getState().updateWallet(wallet.id, { paymentQrPath: null });
            setQrPreviewVisible(false);
            requestSyncNow();
            try {
              await deleteWalletQrFromCloud(user.id, wallet.id);
              await clearPendingQrDeletion(user.id, wallet.id);
            } catch {
              // The persisted deletion marker is retried by the next sync.
            }
          } catch {
            Alert.alert(t('wallet.uploadFailed'));
          } finally {
            setLoadingQr(false);
          }
        },
      },
    ]);
  };

  if (!hasHydrated) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <Text style={styles.loading}>{t('common.loading')}</Text>
      </View>
    );
  }

  if (!wallet) {
    return (
      <View style={[styles.screen, styles.fullScreen, { paddingTop: insets.top }]}>
        <Text style={styles.error}>{t('wallet.unavailable')}</Text>
        <Pressable onPress={() => router.back()} style={styles.primaryButton}>
          <Text style={styles.primaryLabel}>{t('common.back')}</Text>
        </Pressable>
      </View>
    );
  }

  const archiveWalletNow = () => {
    useFinanceStore.getState().archiveWallet(wallet.id);
    router.back();
  };

  const archive = () => {
    Alert.alert(t('wallet.archiveConfirmation'), t('wallet.archiveWarning'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.archive'), style: 'destructive', onPress: archiveWalletNow },
    ]);
  };

  const restore = () => useFinanceStore.getState().restoreWallet(wallet.id);

  const inspectDeleteBlocker = async (targetWallet: typeof wallet) => {
    if (!targetWallet) {
      return 'history';
    }

    const finance = useFinanceStore.getState();
    const qrStore = useWalletQrStore.getState();
    let localQr = userId ? await qrStore.hydrateWalletQr(userId, targetWallet.id) : null;
    if (localQr && !isWalletQrFileAvailable(localQr)) {
      await qrStore.clearQrForWallet(userId!, targetWallet.id);
      localQr = null;
    }
    const [pendingUpload, pendingDelete, localCloudPath] = userId
      ? await Promise.all([
          hasPendingQrUpload(userId, targetWallet.id),
          hasPendingQrDeletion(userId, targetWallet.id),
          getQrCloudPath(userId, targetWallet.id),
        ])
      : [false, false, null] as const;
    return getWalletDeleteBlocker(targetWallet, finance.transactions, {
      hasLocalQr: Boolean(localQr),
      pendingUpload,
      pendingDelete,
      localCloudPath,
    });
  };

  const showDeleteBlockedMessage = (blocker: NonNullable<Awaited<ReturnType<typeof inspectDeleteBlocker>>>) => {
    if (blocker === 'history') {
      Alert.alert(t('wallet.deleteWalletBlockedTitle'), t('wallet.deleteWalletHistoryMessage'), [
        { text: t('common.cancel'), style: 'cancel' },
        wallet.archivedAt
          ? { text: t('common.restore'), onPress: restore }
          : { text: t('common.archive'), onPress: archiveWalletNow },
      ]);
      return;
    }
    const message = blocker === 'qr'
      ? t('wallet.deleteWalletQrMessage')
      : t('wallet.deleteWalletQrCleanupMessage');
    const buttons = blocker === 'qr'
      ? [
          { text: t('common.cancel'), style: 'cancel' as const },
          { text: t('wallet.removeQr'), style: 'destructive' as const, onPress: removeWalletQr },
        ]
      : [{ text: t('common.close'), style: 'cancel' as const }];
    Alert.alert(t('wallet.deleteWalletBlockedTitle'), message, buttons);
  };

  const requestWalletDelete = async () => {
    if (loadingQr) {
      return;
    }
    if (!wallet) {
      return;
    }
    const blocker = await inspectDeleteBlocker(wallet);
    if (blocker) {
      showDeleteBlockedMessage(blocker);
      return;
    }

    const ownerId = userId ?? null;
    const confirmDelete = async () => {
      if ((useAuthStore.getState().user?.id ?? null) !== ownerId) {
        return;
      }
      const latestWallet = useFinanceStore.getState().wallets.find((item) => item.id === wallet.id);
      if (!latestWallet) {
        router.back();
        return;
      }
      const currentBlocker = await inspectDeleteBlocker(latestWallet);
      if (currentBlocker) {
        showDeleteBlockedMessage(currentBlocker);
        return;
      }
      try {
        useFinanceStore.getState().deleteWallet(wallet.id);
        if (ownerId) {
          await clearQrForWallet(ownerId, wallet.id);
          await clearPendingQrUpload(ownerId, wallet.id);
          await clearPendingQrDeletion(ownerId, wallet.id);
        }
        router.back();
      } catch {
        Alert.alert(t('wallet.deleteWalletBlockedTitle'), t('wallet.deleteWalletFailed'));
      }
    };

    Alert.alert(
      t('wallet.deleteWalletConfirmTitle'),
      t('wallet.deleteWalletConfirmMessage', { name: walletDisplayName }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('wallet.deleteWallet'), style: 'destructive', onPress: () => { void confirmDelete(); } },
      ],
    );
  };

  return (
    <ScrollView
      style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom + spacing.xl }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.headerRow}>
        <View style={[styles.colorBadge, { backgroundColor: wallet.color }]} />
        <View style={styles.headerContent}>
          <Text style={styles.title}>{walletDisplayName}</Text>
          <Text style={styles.subtitle}>{walletTypeLabel}</Text>
        </View>
      </View>

      <View style={styles.balanceCard}>
        <View style={styles.balanceHeader}>
          <Text style={styles.cardTitle}>{t('wallet.currentBalance')}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={isBalanceHidden ? 'Show balance' : 'Hide balance'}
            onPress={toggleBalanceHidden}
            style={styles.eyeButton}
          >
            <Text style={styles.eyeText}>{isBalanceHidden ? '◉' : '◌'}</Text>
          </Pressable>
        </View>
        <Text style={styles.balance}>{getDisplayAmount(balance, language, isBalanceHidden)}</Text>
        {!wallet.archivedAt ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push(`/wallets/adjust/${wallet.id}`)}
            style={({ pressed }) => [styles.adjustButton, pressed && styles.secondaryButtonPressed]}
          >
            <Text style={styles.adjustLabel}>{t('wallet.adjustBalance')}</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.qrCard}>
        <Text style={styles.cardTitle}>{t('wallet.paymentQr')}</Text>
        <Text style={styles.qrHint}>{t('wallet.paymentQrDescription')}</Text>

        {walletPaymentQr ? (
          <>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('wallet.previewQr')}
              onPress={() => setQrPreviewVisible(true)}
              style={styles.qrPreviewButton}
            >
              <View style={styles.qrFrame}>
                <Image source={{ uri: walletPaymentQr }} style={styles.qrImage} resizeMode="contain" />
              </View>
            </Pressable>

            <Text style={styles.qrLabel}>{t('wallet.scanToPay')}</Text>
            <View style={styles.qrActions}>
              <Pressable
                accessibilityRole="button"
                onPress={pickWalletQr}
                disabled={loadingQr}
                style={({ pressed }) => [styles.primaryQrButton, pressed && styles.secondaryButtonPressed, loadingQr && styles.disabledButton]}
              >
                <Text style={styles.primaryQrLabel}>{t('wallet.changeQr')}</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={removeWalletQr}
                disabled={loadingQr}
                style={({ pressed }) => [styles.secondaryQrButton, pressed && styles.secondaryButtonPressed, loadingQr && styles.disabledButton]}
              >
                <Text style={styles.secondaryQrLabel}>{t('wallet.removeQr')}</Text>
              </Pressable>
            </View>
          </>
        ) : (
          <Pressable
            accessibilityRole="button"
            onPress={pickWalletQr}
            disabled={loadingQr}
            style={({ pressed }) => [styles.emptyQrButton, pressed && styles.secondaryButtonPressed, loadingQr && styles.disabledButton]}
          >
            <Text style={styles.emptyQrLabel}>+ {t('wallet.addQr')}</Text>
          </Pressable>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t('wallet.walletInformation')}</Text>
        <View style={styles.informationRow}>
          <Text style={styles.informationLabel}>{t('wallet.type')}</Text>
          <Text style={styles.informationValue}>{walletTypeLabel}</Text>
        </View>
        <View style={styles.informationRow}>
          <Text style={styles.informationLabel}>{t('wallet.name')}</Text>
          <Text style={styles.informationValue}>{walletDisplayName}</Text>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t('wallet.history')}</Text>
        {transactionsForWallet.length === 0 ? (
          <Text style={styles.empty}>{t('wallet.noTransactions')}</Text>
        ) : (
          <View style={styles.list}>
            {transactionsForWallet.slice(0, 10).map((transaction) => (
              <Pressable
                key={transaction.id}
                onPress={transaction.type === 'adjustment'
                  ? () => router.push(`/wallets/adjust/${wallet.id}?transactionId=${transaction.id}`)
                  : () => router.push(transactionDetailRoute(transaction.id))}
                style={styles.row}
              >
                <Text style={styles.rowDate}>{transaction.date}</Text>
                <View style={styles.rowMeta}>
                  <Text style={styles.rowAction}>{t(`transaction.${transaction.type}`)}</Text>
                  <Text style={styles.rowCategory}>
                    {transaction.type === 'adjustment'
                      ? transaction.note || t('transaction.adjustment')
                      : transaction.type === 'transfer'
                        ? `${localizeWalletName(transaction.sourceWalletId ?? transaction.walletId, wallets.find((item) => item.id === (transaction.sourceWalletId ?? transaction.walletId))?.name ?? t('transaction.from'), t)} → ${localizeWalletName(transaction.destinationWalletId ?? '', wallets.find((item) => item.id === transaction.destinationWalletId)?.name ?? t('transaction.to'), t)}`
                        : localizeCategoryName(
                            transaction.categoryId,
                            categories.find((category) => category.id === transaction.categoryId)?.name ?? transaction.categoryId,
                            t,
                          )}
                  </Text>
                </View>
                <Text style={[
                  styles.rowAmount,
                  transaction.type === 'transfer'
                    ? styles.transferAmount
                    : transaction.type === 'income' || (transaction.type === 'adjustment' && transaction.adjustmentDirection !== 'decrease')
                      ? styles.positive
                      : styles.negative,
                ]}>
                  {transaction.type === 'transfer'
                    ? ''
                    : transaction.type === 'adjustment'
                      ? `${transaction.adjustmentDirection === 'decrease' ? '-' : '+'}`
                      : transaction.type === 'income' ? '+' : '-'}
                  {transaction.amount.toLocaleString(language === 'vi' ? 'vi-VN' : 'en-US', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 })}
                </Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>

      <View style={styles.actions}>
        {wallet.archivedAt ? (
          <Pressable onPress={restore} style={({ pressed }) => [styles.secondaryButton, pressed && styles.secondaryButtonPressed]}>
            <Text style={styles.secondaryLabel}>{t('wallet.restore')}</Text>
          </Pressable>
        ) : null}
        <Pressable onPress={() => router.push(`/wallets/new?id=${wallet.id}`)} style={({ pressed }) => [styles.secondaryButton, pressed && styles.secondaryButtonPressed]}>
          <Text style={styles.secondaryLabel}>{t('common.edit')}</Text>
        </Pressable>
        {!wallet.archivedAt ? (
          <Pressable onPress={archive} style={({ pressed }) => [styles.negativeButton, pressed && styles.negativeButtonPressed]}>
            <Text style={styles.negativeLabel}>{t('common.archive')}</Text>
          </Pressable>
        ) : null}
      </View>

      <Pressable
        accessibilityRole="button"
        disabled={loadingQr}
        onPress={() => { void requestWalletDelete(); }}
        style={({ pressed }) => [styles.deleteWalletButton, pressed && styles.negativeButtonPressed, loadingQr && styles.disabledButton]}
      >
        <Text style={styles.deleteWalletLabel}>{t('wallet.deleteWallet')}</Text>
      </Pressable>

      <Modal
        visible={qrPreviewVisible && Boolean(walletPaymentQr)}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setQrPreviewVisible(false)}
      >
        <View style={[styles.modalOverlay, { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.xl }]}>
          <Pressable style={styles.modalBackdrop} onPress={() => setQrPreviewVisible(false)} />
          <View style={styles.modalContent}>
            <View style={styles.modalHeading}>
              <View style={[styles.modalColorBadge, { backgroundColor: wallet.color }]} />
              <Text style={styles.modalTitle}>{walletDisplayName}</Text>
              <Text style={styles.modalSubtitle}>{walletTypeLabel}</Text>
            </View>
            <View style={[styles.modalQrFrame, { width: Math.min(screenWidth - spacing.xl * 2, 420) }]}>
              {walletPaymentQr ? (
                <Image source={{ uri: walletPaymentQr }} style={styles.modalQrImage} resizeMode="contain" />
              ) : null}
            </View>
            <Text style={styles.modalHint}>{t('wallet.scanToPay')}</Text>
            <Pressable onPress={() => setQrPreviewVisible(false)} style={styles.modalCloseButton}>
              <Text style={styles.modalCloseLabel}>{t('common.close')}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </ScrollView>
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
  fullScreen: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
  },
  loading: {
    fontSize: typography.body,
    color: colors.textSecondary,
  },
  error: {
    fontSize: typography.body,
    color: colors.danger,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  primaryButton: {
    minHeight: 44,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  primaryLabel: {
    fontSize: typography.body,
    color: colors.background,
    fontWeight: '600',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  colorBadge: { width: 44, height: 44, borderRadius: 22 },
  headerContent: { flex: 1, marginLeft: spacing.md },
  title: { fontSize: typography.title, color: colors.text },
  subtitle: { fontSize: typography.body, color: colors.textSecondary },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  qrCard: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.xl,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  balanceCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  balanceHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  eyeButton: {
    width: 30,
    height: 30,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eyeText: { color: colors.text, fontSize: 14, fontWeight: '700' },
  cardTitle: {
    fontSize: typography.body,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  qrHint: { color: colors.textSecondary, fontSize: 13, lineHeight: 18, marginBottom: spacing.md },
  qrPreviewButton: { marginBottom: spacing.md },
  qrFrame: {
    width: '100%',
    minHeight: 220,
    backgroundColor: '#ffffff',
    borderRadius: radius.lg,
    padding: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.08)',
  },
  qrImage: {
    width: '100%',
    height: 220,
    borderRadius: radius.md,
    backgroundColor: '#ffffff',
  },
  qrLabel: { color: colors.accent, fontSize: 14, fontWeight: '700', textAlign: 'center', marginBottom: spacing.md },
  qrActions: { gap: spacing.sm },
  primaryQrButton: {
    minHeight: 46,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  primaryQrLabel: { color: colors.background, fontSize: 15, fontWeight: '700' },
  secondaryQrButton: {
    minHeight: 46,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  secondaryQrLabel: { color: colors.text, fontSize: 15, fontWeight: '700' },
  emptyQrButton: {
    minHeight: 108,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyQrLabel: { color: colors.accent, fontSize: 16, fontWeight: '700' },
  disabledButton: { opacity: 0.7 },
  balance: {
    fontSize: typography.headline,
    color: colors.text,
  },
  adjustButton: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: colors.accent,
    marginTop: spacing.md,
  },
  adjustLabel: {
    fontSize: typography.body,
    color: colors.background,
    fontWeight: '700',
  },
  informationRow: {
    minHeight: 36,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  informationLabel: {
    fontSize: typography.body,
    color: colors.textSecondary,
  },
  informationValue: {
    fontSize: typography.body,
    color: colors.text,
  },
  list: {
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowDate: {
    fontSize: typography.caption,
    color: colors.textSecondary,
  },
  rowMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  rowAction: {
    fontSize: typography.body,
    color: colors.text,
  },
  rowCategory: {
    fontSize: typography.caption,
    color: colors.textSecondary,
  },
  rowAmount: {
    fontSize: typography.body,
    fontWeight: '700',
  },
  positive: {
    color: colors.income,
  },
  negative: {
    color: colors.expense,
  },
  transferAmount: {
    color: colors.accent,
  },
  empty: {
    fontSize: typography.body,
    color: colors.textSecondary,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  deleteWalletButton: {
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 102, 114, 0.35)',
    backgroundColor: 'rgba(255, 102, 114, 0.08)',
    marginTop: spacing.sm,
  },
  deleteWalletLabel: { color: colors.danger, fontSize: typography.body, fontWeight: '700' },
  secondaryButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  secondaryButtonPressed: {
    opacity: 0.85,
  },
  secondaryLabel: {
    fontSize: typography.body,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  negativeButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: radius.md,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  negativeButtonPressed: {
    opacity: 0.85,
  },
  negativeLabel: {
    fontSize: typography.body,
    color: colors.background,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: '#080A0B',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#080A0B',
  },
  modalContent: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xl,
  },
  modalHeading: { alignItems: 'center', gap: spacing.xs },
  modalColorBadge: { width: 8, height: 8, borderRadius: 4, marginBottom: spacing.xs },
  modalTitle: { color: '#FFFFFF', fontSize: 27, fontWeight: '800', textAlign: 'center' },
  modalSubtitle: { color: '#B2B7B6', fontSize: 13, fontWeight: '700', textAlign: 'center', textTransform: 'uppercase' },
  modalQrFrame: {
    aspectRatio: 1,
    backgroundColor: '#ffffff',
    borderRadius: 4,
    padding: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#D7B56D',
    shadowOpacity: 0.16,
    shadowRadius: 32,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
  modalQrImage: {
    width: '100%',
    height: '100%',
    backgroundColor: '#ffffff',
  },
  modalHint: { color: '#E6E8E7', fontSize: 16, fontWeight: '700', textAlign: 'center' },
  modalCloseButton: {
    minHeight: 48,
    minWidth: 160,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  modalCloseLabel: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
});

