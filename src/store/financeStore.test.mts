import assert from 'node:assert/strict';
import test from 'node:test';
import type { StateStorage } from 'zustand/middleware';

import {
  calculateBudgetSummary,
  calculateExpense,
  calculateGoalSummary,
  calculateIncome,
  calculateWalletBalance,
} from '../features/finance/financeEngine.ts';
import type { Budget, GoalContribution, SavingsGoal, Transaction, Wallet } from '../features/finance/models.ts';
import { createFinanceStore, registerSyncDeletionListener } from './financeStoreCore.ts';

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
  const wallet = makeWallet('reserve', 1_000);
  store.getState().addWallet(wallet);
  store.getState().addTransaction(makeTransaction('income', 'income', 400, '2026-10-01', wallet.id));
  store.getState().addTransaction(makeTransaction('expense', 'expense', 150, '2026-10-02', wallet.id));

  assert.equal(calculateWalletBalance(wallet.id, store.getState().transactions, store.getState().wallets), 1_250);

  store.getState().archiveWallet(wallet.id);
  assert.ok(store.getState().wallets.find((item) => item.id === wallet.id)?.archivedAt);
  assert.equal(store.getState().transactions.length, 2);
  assert.equal(calculateWalletBalance(wallet.id, store.getState().transactions, store.getState().wallets), 1_250);

  store.getState().updateWallet(wallet.id, { archivedAt: null });
  assert.equal(store.getState().wallets.find((item) => item.id === wallet.id)?.archivedAt, null);
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

  const seen: string[] = [];
  const unsubscribe = registerSyncDeletionListener((entity, id) => {
    seen.push(`${entity}:${id}`);
  });
  store.getState().deleteTransaction('txn-a');
  unsubscribe();
  store.getState().deleteTransaction('txn-b');

  assert.deepEqual(seen, ['transactions:txn-a']);
  assert.equal(store.getState().transactions.length, 0);
});
