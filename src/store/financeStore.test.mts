import assert from 'node:assert/strict';
import test from 'node:test';
import type { StateStorage } from 'zustand/middleware';

import {
  calculateBudgetSummary,
  calculateDailyBalance,
  calculateExpense,
  calculateGoalSummary,
  calculateIncome,
  calculateOpeningBalanceForDate,
  calculateStreakSummary,
  calculateTransferTotal,
  calculateWalletBalance,
  calculateWalletBalances,
  getStatisticsSummary,
} from '../features/finance/financeEngine.ts';
import type { Budget, GoalContribution, SavingsGoal, Transaction, Wallet } from '../features/finance/models.ts';
import { findTransactionById, transactionDetailRoute, transactionDetailRouteId } from '../lib/transactionRoutes.ts';
import { createFinanceStore as createEmptyFinanceStore, registerSyncDeletionListener } from './financeStoreCore.ts';
import {
  createWalletQrStore,
  walletQrNeedsRemoteRestore,
  walletQrWasRemovedRemotely,
} from '../wallets/walletQrStore.ts';

const createMemoryStorage = (): StateStorage => {
  const values = new Map<string, string>();
  return {
    getItem: (name) => values.get(name) ?? null,
    setItem: (name, value) => {
      values.set(name, value);
    },
    removeItem: (name) => {
      values.delete(name);
    },
  };
};

const makeTransaction = (
  id: string,
  type: Transaction['type'],
  amount: number,
  date: string,
  walletId = 'cash',
  categoryId = type === 'income' ? 'salary' : 'food',
): Transaction => ({
  id,
  type,
  amount,
  categoryId,
  walletId,
  date,
  time: '12:00',
  note: '',
  createdAt: `${date}T12:00:00.000Z`,
  updatedAt: `${date}T12:00:00.000Z`,
});

const makeAdjustment = (
  id: string,
  amount: number,
  date: string,
  adjustmentDirection: NonNullable<Transaction['adjustmentDirection']>,
  walletId = 'cash',
): Transaction => ({
  ...makeTransaction(id, 'adjustment', amount, date, walletId, ''),
  categoryId: '',
  adjustmentDirection,
});

const makeTransfer = (
  id: string,
  amount: number,
  date: string,
  sourceWalletId: string,
  destinationWalletId: string,
  time = '12:00',
): Transaction => ({
  ...makeTransaction(id, 'transfer', amount, date, sourceWalletId, ''),
  categoryId: '',
  sourceWalletId,
  destinationWalletId,
  time,
});

const makeWallet = (id: string, initialBalance = 0): Wallet => ({
  id,
  name: id,
  type: 'cash',
  color: '#D7B56D',
  initialBalance,
  archivedAt: null,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
});

const createFinanceStore = (storage: StateStorage) => {
  const store = createEmptyFinanceStore(storage);
  if (!store.getState().wallets.some((wallet) => wallet.id === 'cash')) {
    store.getState().addWallet(makeWallet('cash'));
  }
  if (!store.getState().wallets.some((wallet) => wallet.id === 'bank')) {
    store.getState().addWallet(makeWallet('bank'));
  }
  return store;
};

const makeBudget = (): Budget => ({
  id: 'food-budget',
  name: 'Food',
  categoryId: 'food',
  amount: 1_000,
  period: 'custom',
  startDate: '2026-10-01',
  endDate: '2026-10-31',
  archivedAt: null,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
});

const makeGoal = (): SavingsGoal => ({
  id: 'trip',
  name: 'Trip',
  targetAmount: 1_000,
  deadline: null,
  note: '',
  archivedAt: null,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
});

const makeContribution = (): GoalContribution => ({
  id: 'contribution',
  goalId: 'trip',
  amount: 500,
  date: '2026-10-01',
  note: 'First deposit',
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
});

test('wallet actions preserve initial balance and transaction history through archive and restore', () => {
  const store = createFinanceStore(createMemoryStorage());
  const wallet = { ...makeWallet('reserve', 1_000), paymentQrPath: 'user-1/reserve/payment-qr-v1' };
  store.getState().addWallet(wallet);
  store.getState().addTransaction(makeTransaction('income', 'income', 400, '2026-10-01', wallet.id));
  store.getState().addTransaction(makeTransaction('expense', 'expense', 150, '2026-10-02', wallet.id));

  assert.equal(calculateWalletBalance(wallet.id, store.getState().transactions, store.getState().wallets), 1_250);

  store.getState().archiveWallet(wallet.id);
  assert.ok(store.getState().wallets.find((item) => item.id === wallet.id)?.archivedAt);
  assert.equal(store.getState().wallets.find((item) => item.id === wallet.id)?.paymentQrPath, wallet.paymentQrPath);
  assert.equal(store.getState().transactions.length, 2);
  assert.equal(calculateWalletBalance(wallet.id, store.getState().transactions, store.getState().wallets), 1_250);

  store.getState().updateWallet(wallet.id, { archivedAt: null });
  assert.equal(store.getState().wallets.find((item) => item.id === wallet.id)?.archivedAt, null);
  assert.equal(store.getState().wallets.find((item) => item.id === wallet.id)?.paymentQrPath, wallet.paymentQrPath);
});

test('wallet CRUD trims names, rejects duplicates, persists, and keeps valid timestamps', () => {
  const storage = createMemoryStorage();
  const store = createFinanceStore(storage);
  store.getState().addWallet({ ...makeWallet('reserve'), name: '  Reserve  ' });

  const created = store.getState().wallets.find((item) => item.id === 'reserve');
  assert.equal(created?.name, 'Reserve');
  assert.ok(created?.createdAt && Number.isFinite(Date.parse(created.createdAt)));
  assert.ok(created?.updatedAt && Number.isFinite(Date.parse(created.updatedAt)));
  assert.throws(() => store.getState().addWallet({ ...makeWallet('reserve-2'), name: ' reserve ' }), /name already exists/i);
  store.getState().addWallet({ ...makeWallet('bad-dates'), createdAt: 'invalid', updatedAt: 'invalid' });
  const repairedDates = store.getState().wallets.find((item) => item.id === 'bad-dates');
  assert.ok(repairedDates?.createdAt && Number.isFinite(Date.parse(repairedDates.createdAt)));
  assert.ok(repairedDates?.updatedAt && Number.isFinite(Date.parse(repairedDates.updatedAt)));

  store.getState().updateWallet('reserve', { name: '  Emergency fund  ' });
  assert.equal(store.getState().wallets.find((item) => item.id === 'reserve')?.name, 'Emergency fund');
  assert.throws(() => store.getState().updateWallet('reserve', { name: '   ' }), /wallet name/i);

  const restoredFromStorage = createFinanceStore(storage);
  assert.equal(restoredFromStorage.getState().wallets.find((item) => item.id === 'reserve')?.name, 'Emergency fund');
});

test('new finance state starts with no wallets and keeps only manually added wallets after restore', () => {
  const storage = createMemoryStorage();
  const store = createEmptyFinanceStore(storage);
  assert.deepEqual(store.getState().wallets, []);

  store.getState().addWallet({ ...makeWallet('mb'), name: 'MB', type: 'bank' });
  assert.deepEqual(store.getState().wallets.map((wallet) => wallet.id), ['mb']);
  store.getState().addWallet({ ...makeWallet('momo'), name: 'MoMo', type: 'ewallet' });
  assert.deepEqual(store.getState().wallets.map((wallet) => wallet.id), ['mb', 'momo']);

  const restored = createEmptyFinanceStore(storage);
  assert.deepEqual(restored.getState().wallets.map((wallet) => wallet.id), ['mb', 'momo']);
});

test('legacy seed wallet is restored only when saved transaction history references it', async () => {
  const storage = createMemoryStorage();
  const transaction = makeTransaction('legacy-cash-expense', 'expense', 50, '2026-10-01');
  await storage.setItem('ljxmoney-finance-store', JSON.stringify({
    state: {
      transactions: [transaction],
      categories: [],
      wallets: [],
      budgets: [],
      goals: [],
      goalContributions: [],
      streak: { completionDates: [], manualCompletionDates: [], longestStreak: 0 },
    },
    version: 2,
  }));

  const restored = createEmptyFinanceStore(storage);
  await restored.persist.rehydrate();
  assert.deepEqual(restored.getState().wallets.map((wallet) => wallet.id), ['cash']);
  assert.equal(restored.getState().transactions[0]?.id, transaction.id);
});

test('custom wallet name stays independent from wallet type through hydration and edits', () => {
  const storage = createMemoryStorage();
  const store = createFinanceStore(storage);
  store.getState().addWallet({ ...makeWallet('wallet-mb'), name: 'MB', type: 'bank' });

  const hydratedStore = createFinanceStore(storage);
  const restored = hydratedStore.getState().wallets.find((wallet) => wallet.id === 'wallet-mb');
  assert.equal(restored?.name, 'MB');
  assert.equal(restored?.type, 'bank');

  hydratedStore.getState().updateWallet('wallet-mb', { type: 'ewallet' });
  const updated = createFinanceStore(storage).getState().wallets.find((wallet) => wallet.id === 'wallet-mb');
  assert.equal(updated?.name, 'MB');
  assert.equal(updated?.type, 'ewallet');
});

test('transaction detail resolves the exact transaction after hydration and not after deletion', () => {
  const storage = createMemoryStorage();
  const store = createFinanceStore(storage);
  const transaction = makeTransaction('detail-hydrated-id', 'income', 250, '2026-10-08');
  store.getState().addTransaction(transaction);

  const hydratedStore = createFinanceStore(storage);
  const routeId = transactionDetailRouteId(transactionDetailRoute(transaction.id));
  assert.equal(findTransactionById(hydratedStore.getState().transactions, routeId)?.id, transaction.id);

  hydratedStore.getState().deleteTransaction(transaction.id);
  assert.equal(findTransactionById(hydratedStore.getState().transactions, routeId), undefined);
  assert.equal(findTransactionById(hydratedStore.getState().transactions, 'different-id'), undefined);
});

test('derived Net Worth is restored from hydrated wallets and transactions without persisted balance state', () => {
  const storage = createMemoryStorage();
  const store = createFinanceStore(storage);
  store.getState().updateWallet('cash', { initialBalance: 1_000_000 });
  store.getState().updateWallet('bank', { initialBalance: 2_000_000 });
  store.getState().addTransaction(makeTransaction('net-worth-expense', 'expense', 600_000, '2026-10-08', 'cash'));
  store.getState().addTransaction(makeTransfer('net-worth-transfer', 400_000, '2026-10-08', 'bank', 'cash'));

  const restored = createFinanceStore(storage);
  const balances = calculateWalletBalances(restored.getState().transactions, restored.getState().wallets);
  assert.equal(Object.values(balances).reduce((total, balance) => total + balance, 0), 2_400_000);
  assert.equal(restored.getState().transactions.length, 2);
});

test('archived wallets reject new transactions but preserve historical edits and balances', () => {
  const store = createFinanceStore(createMemoryStorage());
  const wallet = makeWallet('archive-me', 2_000);
  store.getState().addWallet(wallet);
  store.getState().addTransaction(makeTransaction('historical-income', 'income', 500, '2026-10-01', wallet.id));
  store.getState().archiveWallet(wallet.id);

  assert.throws(
    () => store.getState().addTransaction(makeTransaction('new-expense', 'expense', 100, '2026-10-02', wallet.id)),
    /valid wallet/i,
  );
  store.getState().updateTransaction('historical-income', { date: '2026-10-03' });
  assert.equal(calculateWalletBalance(wallet.id, store.getState().transactions, store.getState().wallets), 2_500);
  assert.equal(store.getState().transactions.length, 1);

  store.getState().restoreWallet(wallet.id);
  assert.equal(store.getState().wallets.find((item) => item.id === wallet.id)?.archivedAt, null);
});

test('wallet balance follows transaction edits, wallet changes, and deletion', () => {
  const store = createFinanceStore(createMemoryStorage());
  store.getState().addWallet(makeWallet('secondary'));
  store.getState().addTransaction(makeTransaction('income', 'income', 1_000, '2026-10-01'));
  store.getState().addTransaction(makeTransaction('expense', 'expense', 200, '2026-10-02'));
  assert.equal(calculateWalletBalance('cash', store.getState().transactions, store.getState().wallets), 800);

  store.getState().updateTransaction('income', { walletId: 'secondary', date: '2026-10-04' });
  assert.equal(calculateWalletBalance('cash', store.getState().transactions, store.getState().wallets), -200);
  assert.equal(calculateWalletBalance('secondary', store.getState().transactions, store.getState().wallets), 1_000);
  store.getState().deleteTransaction('income');
  assert.equal(calculateWalletBalance('secondary', store.getState().transactions, store.getState().wallets), 0);
});

test('balance adjustments increase and decrease wallet balance without income or expense', () => {
  const store = createFinanceStore(createMemoryStorage());
  const wallet = makeWallet('cash', 1_000_000);
  store.getState().updateWallet('cash', { initialBalance: wallet.initialBalance });
  store.getState().addTransaction(makeAdjustment('adjust-up', 200_000, '2026-10-01', 'increase'));

  assert.equal(calculateWalletBalance('cash', store.getState().transactions, store.getState().wallets), 1_200_000);
  assert.equal(calculateIncome(store.getState().transactions), 0);
  assert.equal(calculateExpense(store.getState().transactions), 0);

  store.getState().addTransaction(makeAdjustment('adjust-down', 400_000, '2026-10-02', 'decrease'));
  assert.equal(calculateWalletBalance('cash', store.getState().transactions, store.getState().wallets), 800_000);
  assert.equal(calculateIncome(store.getState().transactions), 0);
  assert.equal(calculateExpense(store.getState().transactions), 0);
});

test('streak derives from transaction add, date edit, and deletion without check-in state', () => {
  const store = createFinanceStore(createMemoryStorage());
  const first = makeTransaction('streak-day-1', 'income', 100, '2026-10-01');
  const second = makeTransaction('streak-day-2', 'expense', 100, '2026-10-02');
  const third = makeTransaction('streak-day-3', 'expense', 100, '2026-10-03');

  store.getState().addTransaction(first);
  assert.equal(calculateStreakSummary(store.getState().streak, new Date(2026, 9, 1, 12)).currentStreak, 1);
  store.getState().addTransaction(second);
  assert.equal(calculateStreakSummary(store.getState().streak, new Date(2026, 9, 2, 12)).currentStreak, 2);
  store.getState().addTransaction(third);
  assert.equal(calculateStreakSummary(store.getState().streak, new Date(2026, 9, 4, 12)).currentStreak, 3);

  store.getState().updateTransaction(third.id, { date: '2026-10-05' });
  assert.equal(calculateStreakSummary(store.getState().streak, new Date(2026, 9, 5, 12)).currentStreak, 1);
  store.getState().updateTransaction(third.id, { date: '2026-10-03' });
  assert.equal(calculateStreakSummary(store.getState().streak, new Date(2026, 9, 5, 12)).currentStreak, 3);
  store.getState().deleteTransaction(third.id);
  assert.equal(calculateStreakSummary(store.getState().streak, new Date(2026, 9, 5, 12)).currentStreak, 2);
  store.getState().deleteTransaction(second.id);
  assert.equal(calculateStreakSummary(store.getState().streak, new Date(2026, 9, 5, 12)).currentStreak, 1);
});

test('wallet QR store keeps per-wallet images local and isolated by user', async () => {
  const storage = createMemoryStorage();
  const qrs = createWalletQrStore(storage);

  assert.equal(await qrs.getState().hydrateWalletQr('user-a', 'wallet-mb'), null);
  await qrs.getState().setQrForWallet('user-a', 'wallet-mb', 'file://user-a/mb.png');
  await qrs.getState().setQrForWallet('user-a', 'wallet-momo', 'file://user-a/momo.png');
  await qrs.getState().setQrForWallet('user-b', 'wallet-mb', 'file://user-b/mb.png');

  assert.equal(qrs.getState().walletQrs['user-a']?.['wallet-mb'], 'file://user-a/mb.png');
  assert.equal(qrs.getState().walletQrs['user-a']?.['wallet-momo'], 'file://user-a/momo.png');
  assert.equal(qrs.getState().walletQrs['user-b']?.['wallet-mb'], 'file://user-b/mb.png');

  await qrs.getState().setQrForWallet('user-a', 'wallet-mb', 'file://user-a/updated-mb.png');
  assert.equal(qrs.getState().walletQrs['user-a']?.['wallet-mb'], 'file://user-a/updated-mb.png');

  await qrs.getState().clearQrForWallet('user-a', 'wallet-mb');
  assert.equal(qrs.getState().walletQrs['user-a']?.['wallet-mb'], null);
  assert.equal(qrs.getState().walletQrs['user-b']?.['wallet-mb'], 'file://user-b/mb.png');

  await qrs.getState().queueQrDeletion('user-a', 'wallet-momo');
  qrs.getState().clearAll();
  assert.deepEqual(qrs.getState().walletQrs, {});

  const afterLogin = createWalletQrStore(storage);
  assert.equal(await afterLogin.getState().hydrateWalletQr('user-b', 'wallet-mb'), 'file://user-b/mb.png');
  assert.equal(await afterLogin.getState().hydrateWalletQr('user-a', 'wallet-mb'), null);
  assert.equal(await afterLogin.getState().hydrateWalletQr('user-a', 'wallet-momo'), 'file://user-a/momo.png');
  assert.equal(await afterLogin.getState().hasPendingQrDeletion('user-a', 'wallet-momo'), true);
  await afterLogin.getState().clearPendingQrDeletion('user-a', 'wallet-momo');
  assert.equal(await afterLogin.getState().hasPendingQrDeletion('user-a', 'wallet-momo'), false);
  await afterLogin.getState().queueQrUpload('user-a', 'wallet-momo');
  assert.equal(await afterLogin.getState().hasPendingQrUpload('user-a', 'wallet-momo'), true);
  await afterLogin.getState().setQrCloudPath('user-a', 'wallet-momo', 'user-a/wallet-momo/payment-qr-v1');
  assert.equal(await afterLogin.getState().getQrCloudPath('user-a', 'wallet-momo'), 'user-a/wallet-momo/payment-qr-v1');
  await afterLogin.getState().clearPendingQrUpload('user-a', 'wallet-momo');
  assert.equal(await afterLogin.getState().hasPendingQrUpload('user-a', 'wallet-momo'), false);
  await afterLogin.getState().setQrForWallet('user-a', 'wallet-momo', 'file://user-a/replacement.png');
  assert.equal(await afterLogin.getState().getQrCloudPath('user-a', 'wallet-momo'), null);
});

test('wallet QR sync restores missing remote bytes, replaces versions, and honors remote deletion', () => {
  assert.equal(walletQrNeedsRemoteRestore('user-a/mb/payment-qr-v2', null, null, false), true);
  assert.equal(walletQrNeedsRemoteRestore('user-a/mb/payment-qr-v2', 'file://old.png', 'user-a/mb/payment-qr-v1', false), true);
  assert.equal(walletQrNeedsRemoteRestore('user-a/mb/payment-qr-v1', 'file://current.png', 'user-a/mb/payment-qr-v1', false), false);
  assert.equal(walletQrNeedsRemoteRestore('user-a/mb/payment-qr-v1', null, null, true), true);
  assert.equal(walletQrNeedsRemoteRestore('user-a/mb/payment-qr-v1', 'file://pending.png', 'user-a/mb/payment-qr-v1', true), false);
  assert.equal(walletQrWasRemovedRemotely(null, 'user-a/mb/payment-qr-v1', false), true);
  assert.equal(walletQrWasRemovedRemotely(null, 'user-a/mb/payment-qr-v1', true), false);
  assert.equal(walletQrWasRemovedRemotely('user-a/mb/payment-qr-v2', 'user-a/mb/payment-qr-v1', false), false);
});

test('adjustment transactions persist locally and legacy rows retain increase semantics', () => {
  const storage = createMemoryStorage();
  const firstStore = createFinanceStore(storage);
  firstStore.getState().addTransaction(makeAdjustment('persisted-adjustment', 125_000, '2026-10-01', 'decrease'));

  const hydratedStore = createFinanceStore(storage);
  assert.equal(hydratedStore.getState().transactions[0]?.adjustmentDirection, 'decrease');
  assert.equal(
    calculateWalletBalance('cash', hydratedStore.getState().transactions, hydratedStore.getState().wallets),
    -125_000,
  );

  const legacyAdjustment = makeAdjustment('legacy-adjustment', 75_000, '2026-10-02', 'increase');
  delete legacyAdjustment.adjustmentDirection;
  const legacyStore = createFinanceStore(createMemoryStorage());
  legacyStore.getState().addTransaction(legacyAdjustment);
  assert.equal(
    calculateWalletBalance('cash', legacyStore.getState().transactions, legacyStore.getState().wallets),
    75_000,
  );
});

test('editing and deleting a dated balance adjustment recalculates historical balances', () => {
  const store = createFinanceStore(createMemoryStorage());
  store.getState().updateWallet('cash', { initialBalance: 1_000_000 });
  store.getState().addTransaction(makeAdjustment('adjustment', 100_000, '2026-10-01', 'increase'));
  store.getState().addTransaction(makeTransaction('later-income', 'income', 50_000, '2026-10-03'));
  assert.equal(store.getState().balances.at(-1)?.closingBalance, 1_150_000);

  store.getState().updateTransaction('adjustment', {
    amount: 25_000,
    adjustmentDirection: 'decrease',
    date: '2026-10-02',
    note: 'Counted cash again',
  });
  assert.deepEqual(
    store.getState().balances.map(({ date, closingBalance }) => [date, closingBalance]),
    [
      ['2026-10-02', 975_000],
      ['2026-10-03', 1_025_000],
    ],
  );
  assert.equal(calculateWalletBalance('cash', store.getState().transactions, store.getState().wallets), 1_025_000);

  store.getState().deleteTransaction('adjustment');
  assert.equal(store.getState().transactions.length, 1);
  assert.equal(store.getState().transactions[0]?.id, 'later-income');
  assert.equal(calculateWalletBalance('cash', store.getState().transactions, store.getState().wallets), 1_050_000);
});

test('transfer actions update both wallet balances without changing cash flow', () => {
  const store = createFinanceStore(createMemoryStorage());
  store.getState().addTransaction(makeTransaction('income', 'income', 1_000, '2026-10-01'));
  store.getState().addTransaction({
    ...makeTransaction('transfer', 'transfer', 500, '2026-10-02'),
    sourceWalletId: 'cash',
    destinationWalletId: 'bank',
  });

  assert.equal(calculateWalletBalance('cash', store.getState().transactions, store.getState().wallets), 500);
  assert.equal(calculateWalletBalance('bank', store.getState().transactions, store.getState().wallets), 500);
  assert.equal(store.getState().balances.at(-1)?.closingBalance, 1_000);

  store.getState().updateTransaction('transfer', { amount: 300, date: '2026-10-01' });
  assert.equal(calculateWalletBalance('cash', store.getState().transactions, store.getState().wallets), 700);
  assert.equal(calculateWalletBalance('bank', store.getState().transactions, store.getState().wallets), 300);
  assert.equal(store.getState().balances.at(-1)?.closingBalance, 1_000);

  store.getState().deleteTransaction('transfer');
  assert.equal(store.getState().transactions.length, 1);
  assert.equal(calculateWalletBalance('cash', store.getState().transactions, store.getState().wallets), 1_000);
  assert.equal(calculateWalletBalance('bank', store.getState().transactions, store.getState().wallets), 0);
});

test('transfer preserves total, hydrates, edits source/destination/date, and deletes cleanly', () => {
  const storage = createMemoryStorage();
  const store = createFinanceStore(storage);
  store.getState().updateWallet('cash', { initialBalance: 10_000_000 });
  store.getState().updateWallet('bank', { initialBalance: 1_000_000 });
  store.getState().addWallet(makeWallet('savings', 4_000_000));
  const before = store.getState().wallets.reduce((sum, wallet) => sum + wallet.initialBalance, 0);

  store.getState().addTransaction(makeTransfer('transfer-flow', 2_000_000, '2026-10-02', 'cash', 'bank'));
  let hydratedStore = createFinanceStore(storage);
  assert.equal(hydratedStore.getState().transactions[0]?.type, 'transfer');
  assert.equal(calculateWalletBalance('cash', hydratedStore.getState().transactions, hydratedStore.getState().wallets), 8_000_000);
  assert.equal(calculateWalletBalance('bank', hydratedStore.getState().transactions, hydratedStore.getState().wallets), 3_000_000);
  assert.equal(
    hydratedStore.getState().wallets.reduce(
      (sum, wallet) => sum + calculateWalletBalance(wallet.id, hydratedStore.getState().transactions, hydratedStore.getState().wallets),
      0,
    ),
    before,
  );
  assert.equal(calculateIncome(hydratedStore.getState().transactions), 0);
  assert.equal(calculateExpense(hydratedStore.getState().transactions), 0);

  hydratedStore.getState().updateTransaction('transfer-flow', {
    amount: 3_000_000,
    sourceWalletId: 'savings',
    destinationWalletId: 'bank',
    walletId: 'savings',
    date: '2026-10-05',
  });
  hydratedStore = createFinanceStore(storage);
  assert.equal(calculateWalletBalance('cash', hydratedStore.getState().transactions, hydratedStore.getState().wallets), 10_000_000);
  assert.equal(calculateWalletBalance('bank', hydratedStore.getState().transactions, hydratedStore.getState().wallets), 4_000_000);
  assert.equal(calculateWalletBalance('savings', hydratedStore.getState().transactions, hydratedStore.getState().wallets), 1_000_000);
  assert.deepEqual(hydratedStore.getState().balances.map((balance) => balance.date), ['2026-10-05']);

  hydratedStore.getState().deleteTransaction('transfer-flow');
  assert.equal(calculateWalletBalance('cash', hydratedStore.getState().transactions, hydratedStore.getState().wallets), 10_000_000);
  assert.equal(calculateWalletBalance('bank', hydratedStore.getState().transactions, hydratedStore.getState().wallets), 1_000_000);
  assert.equal(calculateWalletBalance('savings', hydratedStore.getState().transactions, hydratedStore.getState().wallets), 4_000_000);
  assert.deepEqual(hydratedStore.getState().transactions, []);
});

test('transfer rejects same, archived, and insufficient source wallets at the selected historical time', () => {
  const store = createFinanceStore(createMemoryStorage());
  store.getState().updateWallet('cash', { initialBalance: 1_000_000 });
  store.getState().addTransaction(makeTransaction('later-income', 'income', 1_000_000, '2026-10-05', 'cash'));

  assert.throws(
    () => store.getState().addTransaction(makeTransfer('overdraft-past', 1_500_000, '2026-10-02', 'cash', 'bank')),
    /Insufficient balance/i,
  );
  assert.throws(
    () => store.getState().addTransaction(makeTransfer('same-wallet', 100_000, '2026-10-06', 'cash', 'cash')),
    /different wallets/i,
  );

  store.getState().archiveWallet('bank');
  assert.throws(
    () => store.getState().addTransaction(makeTransfer('archived-destination', 100_000, '2026-10-06', 'cash', 'bank')),
    /valid source and destination/i,
  );
});

test('changing transfer to expense removes transfer-only fields and reverses the old wallet pair', () => {
  const store = createFinanceStore(createMemoryStorage());
  store.getState().updateWallet('cash', { initialBalance: 1_000_000 });
  store.getState().addTransaction(makeTransfer('change-type', 200_000, '2026-10-01', 'cash', 'bank'));

  store.getState().updateTransaction('change-type', {
    type: 'expense',
    amount: 100_000,
    categoryId: 'food',
    walletId: 'cash',
    sourceWalletId: undefined,
    destinationWalletId: undefined,
  });

  const updated = store.getState().transactions[0]!;
  assert.equal(updated.type, 'expense');
  assert.equal(updated.sourceWalletId, undefined);
  assert.equal(updated.destinationWalletId, undefined);
  assert.equal(calculateWalletBalance('cash', store.getState().transactions, store.getState().wallets), 900_000);
  assert.equal(calculateWalletBalance('bank', store.getState().transactions, store.getState().wallets), 0);
  assert.equal(calculateIncome(store.getState().transactions), 0);
  assert.equal(calculateExpense(store.getState().transactions), 100_000);
});

test('expense edits and deletes update Statistics, Budget, and Calendar from shared transactions', () => {
  const store = createFinanceStore(createMemoryStorage());
  store.getState().updateWallet('cash', { initialBalance: 1_000_000 });
  store.getState().addBudget(makeBudget());
  store.getState().addTransaction(makeTransaction('integration-expense', 'expense', 500_000, '2026-10-08'));
  store.getState().addTransaction(makeTransfer('integration-transfer', 200_000, '2026-10-08', 'cash', 'bank'));

  let transactions = store.getState().transactions;
  let stats = getStatisticsSummary(transactions);
  let budget = calculateBudgetSummary(store.getState().budgets[0]!, transactions, '2026-10-15');
  let opening = calculateOpeningBalanceForDate('2026-10-08', transactions, store.getState().wallets);
  let day = calculateDailyBalance('2026-10-08', transactions, opening);
  assert.equal(stats.expense, 500_000);
  assert.equal(stats.transferTotal, 200_000);
  assert.equal(budget.spent, 500_000);
  assert.equal(day.expense, 500_000);
  assert.equal(day.closingBalance, 500_000);
  assert.equal(calculateTransferTotal(transactions.filter((item) => item.date === '2026-10-08')), 200_000);

  store.getState().updateTransaction('integration-expense', { amount: 700_000, date: '2026-10-09' });
  transactions = store.getState().transactions;
  stats = getStatisticsSummary(transactions);
  budget = calculateBudgetSummary(store.getState().budgets[0]!, transactions, '2026-10-15');
  opening = calculateOpeningBalanceForDate('2026-10-09', transactions, store.getState().wallets);
  day = calculateDailyBalance('2026-10-09', transactions, opening);
  assert.equal(stats.expense, 700_000);
  assert.equal(stats.transferTotal, 200_000);
  assert.equal(budget.spent, 700_000);
  assert.equal(day.expense, 700_000);
  assert.equal(day.closingBalance, 300_000);

  store.getState().deleteTransaction('integration-expense');
  transactions = store.getState().transactions;
  stats = getStatisticsSummary(transactions);
  budget = calculateBudgetSummary(store.getState().budgets[0]!, transactions, '2026-10-15');
  opening = calculateOpeningBalanceForDate('2026-10-09', transactions, store.getState().wallets);
  day = calculateDailyBalance('2026-10-09', transactions, opening);
  assert.equal(stats.expense, 0);
  assert.equal(stats.transferTotal, 200_000);
  assert.equal(budget.spent, 0);
  assert.equal(day.expense, 0);
  assert.equal(day.closingBalance, 1_000_000);
});

test('budget and goal actions persist CRUD, archive, and contribution history across store hydration', () => {
  const storage = createMemoryStorage();
  const firstStore = createFinanceStore(storage);
  firstStore.getState().addBudget(makeBudget());
  firstStore.getState().addTransaction(makeTransaction('expense', 'expense', 400, '2026-10-02'));
  firstStore.getState().addGoal(makeGoal());
  firstStore.getState().addGoalContribution(makeContribution());
  firstStore.getState().updateGoalContribution('contribution', { amount: 750 });

  const hydratedStore = createFinanceStore(storage);
  assert.equal(hydratedStore.getState().hydrationError, null);
  assert.equal(hydratedStore.getState().hasHydrated, true);
  assert.equal(
    calculateBudgetSummary(
      hydratedStore.getState().budgets[0]!,
      hydratedStore.getState().transactions,
      '2026-10-15',
    ).spent,
    400,
  );
  assert.deepEqual(
    calculateGoalSummary(
      hydratedStore.getState().goals[0]!,
      hydratedStore.getState().goalContributions,
    ),
    { currentAmount: 750, remaining: 250, progress: 75 },
  );

  hydratedStore.getState().updateBudget('food-budget', { amount: 2_000 });
  hydratedStore.getState().archiveBudget('food-budget');
  hydratedStore.getState().deleteGoalContribution('contribution');
  const finalStore = createFinanceStore(storage);
  assert.equal(finalStore.getState().budgets[0]?.amount, 2_000);
  assert.ok(finalStore.getState().budgets[0]?.archivedAt);
  assert.equal(finalStore.getState().goalContributions.length, 0);
  assert.equal(finalStore.getState().transactions.length, 1);
});

test('budget can be deleted without deleting its historical expense transactions', () => {
  const store = createFinanceStore(createMemoryStorage());
  store.getState().addBudget(makeBudget());
  store.getState().addTransaction(makeTransaction('budget-expense', 'expense', 400, '2026-10-02'));

  store.getState().deleteBudget('food-budget');
  assert.equal(store.getState().budgets.length, 0);
  assert.equal(store.getState().transactions[0]?.id, 'budget-expense');
});

test('new budgets reject archived expense categories while an existing budget can retain one', () => {
  const store = createFinanceStore(createMemoryStorage());
  store.getState().addBudget(makeBudget());
  store.getState().archiveCategory('food');
  assert.throws(
    () => store.getState().addBudget({ ...makeBudget(), id: 'new-archived-category-budget' }),
    /expense category/i,
  );
  assert.doesNotThrow(() => store.getState().updateBudget('food-budget', { amount: 2_000 }));
});

test('applySyncSnapshot adopts cloud data, recalculates balances, and no-ops when unchanged', () => {
  const store = createFinanceStore(createMemoryStorage());
  store.getState().addTransaction(makeTransaction('local', 'expense', 100, '2026-10-01'));

  const snapshot = {
    wallets: store.getState().wallets,
    categories: store.getState().categories,
    transactions: [makeTransaction('cloud', 'income', 500, '2026-10-02')],
    budgets: [],
    goals: [],
    goalContributions: [],
    streak: store.getState().streak,
  };
  store.getState().applySyncSnapshot(snapshot);
  assert.deepEqual(
    store.getState().transactions.map((item) => item.id),
    ['cloud'],
  );
  const expectedClosing =
    store.getState().wallets.reduce((total, item) => total + item.initialBalance, 0) + 500;
  assert.equal(store.getState().balances.at(-1)?.closingBalance, expectedClosing);

  // Re-applying identical content must be a no-op (no echo loop).
  const before = store.getState().transactions;
  store.getState().applySyncSnapshot({ ...snapshot, transactions: [...snapshot.transactions] });
  assert.equal(store.getState().transactions, before);
});

test('hard deletions notify sync listeners only for the removed ids', () => {
  const store = createFinanceStore(createMemoryStorage());
  store.getState().addTransaction(makeTransaction('txn-a', 'expense', 100, '2026-10-01'));
  store.getState().addTransaction(makeTransaction('txn-b', 'expense', 200, '2026-10-01'));
  store.getState().addBudget(makeBudget());

  const seen: string[] = [];
  const unsubscribe = registerSyncDeletionListener((entity, id) => {
    seen.push(`${entity}:${id}`);
  });
  store.getState().deleteTransaction('txn-a');
  store.getState().deleteBudget('food-budget');
  unsubscribe();
  store.getState().deleteTransaction('txn-b');

  assert.deepEqual(seen, ['transactions:txn-a', 'budgets:food-budget']);
  assert.equal(store.getState().transactions.length, 0);
});
