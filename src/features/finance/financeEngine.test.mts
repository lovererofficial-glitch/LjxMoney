import assert from 'node:assert/strict';
import test from 'node:test';

import {
  calculateAdjustment,
  calculateExpense,
  calculateIncome,
  calculateWalletBalance,
  calculateBalanceAdjustment,
  getCategorySpending,
  getDailyBalanceSeries,
  getWalletSpending,
  recalculateBalances,
} from './financeEngine.ts';
import type { Transaction } from './models.ts';

const transaction = (
  id: string,
  type: Transaction['type'],
  amount: number,
  date: string,
): Transaction => ({
  id,
  type,
  amount,
  categoryId: type === 'income' ? 'salary' : 'food',
  walletId: 'cash',
  date,
  time: '12:00',
  note: '',
  createdAt: '2026-10-01T12:00:00.000Z',
  updatedAt: '2026-10-01T12:00:00.000Z',
});

test('past edits recalculate every following balance', () => {
  const initial = [
    transaction('expense-1', 'expense', 100_000, '2026-10-01'),
    transaction('expense-2', 'expense', 200_000, '2026-10-02'),
    transaction('income-3', 'income', 500_000, '2026-10-03'),
  ];
  const edited = initial.map((item) =>
    item.id === 'expense-1' ? { ...item, amount: 300_000 } : item,
  );

  assert.deepEqual(
    recalculateBalances(edited, 5_000_000).map(({ date, closingBalance }) => [
      date,
      closingBalance,
    ]),
    [
      ['2026-10-01', 4_700_000],
      ['2026-10-02', 4_500_000],
      ['2026-10-03', 5_000_000],
    ],
  );
});

test('includes zero-transaction days in the balance chain', () => {
  const balances = recalculateBalances(
    [
      transaction('expense-1', 'expense', 100_000, '2026-10-01'),
      transaction('expense-3', 'expense', 100_000, '2026-10-03'),
    ],
    5_000_000,
  );

  assert.deepEqual(
    balances.map(({ date, openingBalance, closingBalance }) => [
      date,
      openingBalance,
      closingBalance,
    ]),
    [
      ['2026-10-01', 5_000_000, 4_900_000],
      ['2026-10-02', 4_900_000, 4_900_000],
      ['2026-10-03', 4_900_000, 4_800_000],
    ],
  );
});

test('deleting a transaction recalculates the following days', () => {
  const transactions = [
    transaction('expense-1', 'expense', 100_000, '2026-10-01'),
    transaction('expense-2', 'expense', 200_000, '2026-10-02'),
    transaction('income-3', 'income', 500_000, '2026-10-03'),
  ].filter((item) => item.id !== 'expense-2');

  assert.deepEqual(
    recalculateBalances(transactions, 5_000_000).map((balance) => balance.closingBalance),
    [4_900_000, 4_900_000, 5_400_000],
  );
});

test('adding a transaction to an earlier date recalculates the whole chain', () => {
  const balances = recalculateBalances(
    [
      transaction('expense-2', 'expense', 200_000, '2026-10-02'),
      transaction('income-3', 'income', 500_000, '2026-10-03'),
      transaction('expense-1', 'expense', 100_000, '2026-10-01'),
    ],
    5_000_000,
  );

  assert.deepEqual(
    balances.map((balance) => balance.closingBalance),
    [4_900_000, 4_700_000, 5_200_000],
  );
});

test('moving a transaction to another date updates both sides of the date range', () => {
  const transactions = [
    transaction('expense-1', 'expense', 100_000, '2026-10-01'),
    transaction('expense-2', 'expense', 200_000, '2026-10-02'),
    { ...transaction('income-3', 'income', 500_000, '2026-10-03'), date: '2026-10-02' },
  ];

  assert.deepEqual(
    recalculateBalances(transactions, 5_000_000).map(({ date, closingBalance }) => [
      date,
      closingBalance,
    ]),
    [
      ['2026-10-01', 4_900_000],
      ['2026-10-02', 5_200_000],
    ],
  );
});

test('transfer updates wallet balances without affecting income or expense totals', () => {
  const transfer = {
    id: 'transfer-1',
    type: 'transfer' as const,
    amount: 200_000,
    categoryId: '',
    walletId: 'cash',
    sourceWalletId: 'cash',
    destinationWalletId: 'bank',
    date: '2026-10-02',
    time: '09:00',
    note: 'Move money',
    createdAt: '2026-10-02T09:00:00.000Z',
    updatedAt: '2026-10-02T09:00:00.000Z',
  };

  assert.equal(calculateIncome([transfer]), 0);
  assert.equal(calculateExpense([transfer]), 0);
  assert.equal(
    getWalletSpending([transfer]).find((entry) => entry.walletId === 'cash')?.net,
    -200_000,
  );
  assert.equal(
    getWalletSpending([transfer]).find((entry) => entry.walletId === 'bank')?.net,
    200_000,
  );
});

test('balance adjustments use signed amounts without changing income or expense totals', () => {
  const decrease: Transaction = {
    ...transaction('adjustment-down', 'adjustment', 200_000, '2026-10-02'),
    categoryId: '',
    adjustmentDirection: 'decrease',
  };
  const increase: Transaction = {
    ...transaction('adjustment-up', 'adjustment', 50_000, '2026-10-03'),
    categoryId: '',
  };
  const transactions = [decrease, increase];

  assert.equal(calculateWalletBalance('cash', transactions, [{
    id: 'cash', name: 'Cash', type: 'cash', color: '#000000', initialBalance: 1_000_000,
  }]), 850_000);
  assert.equal(calculateAdjustment(transactions), -150_000);
  assert.equal(calculateIncome(transactions), 0);
  assert.equal(calculateExpense(transactions), 0);
  assert.deepEqual(
    recalculateBalances(transactions, 1_000_000).map((balance) => balance.closingBalance),
    [800_000, 850_000],
  );
});

test('balance adjustment helper returns direction and skips unchanged targets', () => {
  assert.deepEqual(calculateBalanceAdjustment(1_000_000, 1_200_000), {
    amount: 200_000,
    adjustmentDirection: 'increase',
  });
  assert.deepEqual(calculateBalanceAdjustment(1_000_000, 800_000), {
    amount: 200_000,
    adjustmentDirection: 'decrease',
  });
  assert.equal(calculateBalanceAdjustment(1_000_000, 1_000_000), null);
  assert.throws(() => calculateBalanceAdjustment(1_000_000, -1), /Target balance must/i);
  assert.deepEqual(calculateBalanceAdjustment(-500, 0), {
    amount: 500,
    adjustmentDirection: 'increase',
  });
});

test('daily balance series includes zero-transaction dates across a range', () => {
  const balances = getDailyBalanceSeries(
    [
      transaction('expense-1', 'expense', 100_000, '2026-10-01'),
      transaction('income-3', 'income', 500_000, '2026-10-03'),
    ],
    '2026-10-01',
    '2026-10-03',
    5_000_000,
  );

  assert.deepEqual(
    balances.map((balance) => [balance.date, balance.openingBalance, balance.closingBalance]),
    [
      ['2026-10-01', 5_000_000, 4_900_000],
      ['2026-10-02', 4_900_000, 4_900_000],
      ['2026-10-03', 4_900_000, 5_400_000],
    ],
  );
});

test('category spending excludes transfers and keeps ordered totals', () => {
  const categories = [
    { id: 'food', name: 'Food', type: 'expense' as const, color: '#ff0000' },
    { id: 'salary', name: 'Salary', type: 'income' as const, color: '#00ff00' },
  ];

  const transactions = [
    { ...transaction('expense-1', 'expense', 100_000, '2026-10-01'), categoryId: 'food' },
    { ...transaction('expense-2', 'expense', 300_000, '2026-10-02'), categoryId: 'food' },
    {
      id: 'transfer-1',
      type: 'transfer' as const,
      amount: 50_000,
      categoryId: '',
      walletId: 'cash',
      sourceWalletId: 'cash',
      destinationWalletId: 'bank',
      date: '2026-10-03',
      time: '10:00',
      note: 'Transfer',
      createdAt: '2026-10-03T10:00:00.000Z',
      updatedAt: '2026-10-03T10:00:00.000Z',
    },
  ];

  assert.deepEqual(
    getCategorySpending(transactions, categories),
    [{ ...categories[0], total: 400_000 }],
  );
});
