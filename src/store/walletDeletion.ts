import type { Transaction, Wallet } from '../features/finance/models.ts';

export type WalletDeleteBlocker = 'history' | 'qr' | 'qr-cleanup' | null;

export interface WalletQrDeletionState {
  hasLocalQr?: boolean;
  pendingUpload?: boolean;
  pendingDelete?: boolean;
  localCloudPath?: string | null;
}

export const getWalletDeleteBlocker = (
  wallet: Wallet,
  transactions: Transaction[],
  qr: WalletQrDeletionState = {},
): WalletDeleteBlocker => {
  const hasHistory = transactions.some((transaction) =>
    transaction.walletId === wallet.id ||
    transaction.sourceWalletId === wallet.id ||
    transaction.destinationWalletId === wallet.id,
  );
  if (hasHistory) {
    return 'history';
  }
  if (wallet.paymentQrPath || qr.hasLocalQr || qr.pendingUpload) {
    return 'qr';
  }
  if (qr.pendingDelete || qr.localCloudPath) {
    return 'qr-cleanup';
  }
  return null;
};
