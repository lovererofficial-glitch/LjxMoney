import assert from 'node:assert/strict';
import test from 'node:test';

import type { Transaction } from '../features/finance/models.ts';
import {
  filterAndSortTransactions,
  getTransactionDateRange,
} from './transactionSearch.ts';

const makeTransaction = (
  id: string,
  type: Transaction['type'],
  overrides: Partial<Transaction> = {},
): Transaction => ({
  id,
  type,
  amount: 100,
  categoryId: type === 'income' ? 'salary' : type === 'expense' ? 'food' : '',
  walletId: 'cash',
  sourceWalletId: type === 'transfer' ? 'mb' : undefined,
  destinationWalletId: type === 'transfer' ? 'cash' : undefined,
  date: '2026-10-08',
  time: '12:00',
  note: '',
  createdAt: '2026-10-08T12:00:00.000Z',
  updatedAt: '2026-10-08T12:00:00.000Z',
  ...overrides,
});

const walletNames = new Map([
  ['cash', 'Tiền mặt'],
  ['mb', 'MB'],
  ['momo', 'MoMo'],
]);
const categoryNames = new Map([
  ['food', 'Ăn uống'],
  ['salary', 'Lương'],
]);

const sample = [
  makeTransaction('exp-food', 'expense', { note: 'Bữa trưa', walletId: 'mb', date: '2026-10-08', time: '13:00' }),
  makeTransaction('income-salary', 'income', { walletId: 'mb', note: 'Lương tháng', date: '2026-10-07' }),
  makeTransaction('transfer-mb-cash', 'transfer', { sourceWalletId: 'mb', destinationWalletId: 'cash', walletId: 'mb', note: 'Rút tiền', date: '2026-10-06' }),
  makeTransaction('transfer-momo-mb', 'transfer', { sourceWalletId: 'momo', destinationWalletId: 'mb', walletId: 'momo', date: '2026-10-05' }),
  makeTransaction('adjustment-cash', 'adjustment', { walletId: 'cash', note: 'Kiểm kê' , date: '2026-10-04' }),
];

const ids = (transactions: Transaction[]) => transactions.map((transaction) => transaction.id);

test('search matches note, localized category, wallet, and either transfer wallet case-insensitively', () => {
  assert.deepEqual(ids(filterAndSortTransactions(sample, { query: '  BỮA TRƯA ' }, walletNames, categoryNames)), ['exp-food']);
  assert.deepEqual(ids(filterAndSortTransactions(sample, { query: 'an uong' }, walletNames, categoryNames)), ['exp-food']);
  assert.deepEqual(ids(filterAndSortTransactions(sample, { query: 'mb' }, walletNames, categoryNames)), [
    'exp-food', 'income-salary', 'transfer-mb-cash', 'transfer-momo-mb',
  ]);
  assert.deepEqual(ids(filterAndSortTransactions(sample, { query: 'momo' }, walletNames, categoryNames)), ['transfer-momo-mb']);
  assert.deepEqual(ids(filterAndSortTransactions(sample, { query: '   ' }, walletNames, categoryNames)), [
    'exp-food', 'income-salary', 'transfer-mb-cash', 'transfer-momo-mb', 'adjustment-cash',
  ]);
});

test('type, wallet, category, date, and combined filters treat transfers separately', () => {
  assert.deepEqual(ids(filterAndSortTransactions(sample, { type: 'expense' }, walletNames, categoryNames)), ['exp-food']);
  assert.deepEqual(ids(filterAndSortTransactions(sample, { type: 'income' }, walletNames, categoryNames)), ['income-salary']);
  assert.deepEqual(ids(filterAndSortTransactions(sample, { type: 'transfer' }, walletNames, categoryNames)), ['transfer-mb-cash', 'transfer-momo-mb']);
  assert.deepEqual(ids(filterAndSortTransactions(sample, { type: 'adjustment' }, walletNames, categoryNames)), ['adjustment-cash']);
  assert.deepEqual(ids(filterAndSortTransactions(sample, { walletId: 'cash' }, walletNames, categoryNames)), [
    'transfer-mb-cash', 'adjustment-cash',
  ]);
  assert.deepEqual(ids(filterAndSortTransactions(sample, { walletId: 'mb', type: 'transfer' }, walletNames, categoryNames)), [
    'transfer-mb-cash', 'transfer-momo-mb',
  ]);
  const legacyTransfer = makeTransaction('legacy-transfer', 'transfer', {
    walletId: 'mb', sourceWalletId: undefined, destinationWalletId: 'cash',
  });
  assert.deepEqual(ids(filterAndSortTransactions([legacyTransfer], { walletId: 'mb' }, walletNames, categoryNames)), ['legacy-transfer']);
  assert.deepEqual(ids(filterAndSortTransactions(sample, { categoryId: 'food' }, walletNames, categoryNames)), ['exp-food']);
  assert.deepEqual(ids(filterAndSortTransactions(sample, { dateRange: { from: '2026-10-06', to: '2026-10-07' } }, walletNames, categoryNames)), [
    'income-salary', 'transfer-mb-cash',
  ]);
  assert.deepEqual(ids(filterAndSortTransactions(sample, {
    type: 'transfer',
    walletId: 'mb',
    dateRange: { from: '2026-10-06' },
  }, walletNames, categoryNames)), ['transfer-mb-cash']);
});

test('sorting uses transaction date and time and date presets use calendar dates', () => {
  assert.deepEqual(ids(filterAndSortTransactions(sample, { sortOrder: 'oldest' }, walletNames, categoryNames)), [
    'adjustment-cash', 'transfer-momo-mb', 'transfer-mb-cash', 'income-salary', 'exp-food',
  ]);
  assert.deepEqual(getTransactionDateRange('today', new Date(2026, 9, 8)), {
    from: '2026-10-08', to: '2026-10-08',
  });
  assert.deepEqual(getTransactionDateRange('last7Days', new Date(2026, 9, 8)), {
    from: '2026-10-02', to: '2026-10-08',
  });
  assert.deepEqual(getTransactionDateRange('thisMonth', new Date(2026, 9, 8)), {
    from: '2026-10-01', to: '2026-10-08',
  });
});