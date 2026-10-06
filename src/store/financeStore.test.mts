import assert from 'node:assert/strict';
import test from 'node:test';
import type { StateStorage } from 'zustand/middleware';

import { calculateBudgetSummary, calculateGoalSummary, calculateWalletBalance } from '../features/finance/financeEngine.ts';
import type { Budget, GoalContribution, SavingsGoal, Transaction, Wallet } from '../features/finance/models.ts';
import { createFinanceStore } from './financeStoreCore.ts';

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
