import assert from 'node:assert/strict';
import test from 'node:test';

import type { Transaction } from '../features/finance/models.ts';
import {
  findTransactionById,
  firstRouteParam,
  legacyTransactionDetailRoute,
  transactionDetailRoute,
  transactionDetailRouteId,
} from './transactionRoutes.ts';

test('transaction detail route forwards the transaction ID as its dynamic route param', () => {
  assert.deepEqual(transactionDetailRoute('abc123'), {
    pathname: '/transaction/[id]',
    params: { id: 'abc123' },
  });
  assert.equal(firstRouteParam('abc123'), 'abc123');
  assert.equal(firstRouteParam(['abc123']), 'abc123');
  assert.equal(firstRouteParam(undefined), undefined);
  assert.deepEqual(legacyTransactionDetailRoute('abc123'), {
    pathname: '/transaction/id',
    params: { transactionId: 'abc123' },
  });
  assert.deepEqual(transactionDetailRoute('id'), {
    pathname: '/transaction/id',
    params: { transactionId: 'id' },
  });
  assert.equal(transactionDetailRouteId(transactionDetailRoute('abc123')), 'abc123');
  assert.equal(transactionDetailRouteId(transactionDetailRoute('id')), 'id');
});

test('transaction lookup returns the exact ID for every type and never falls back', () => {
  const transactions = (['income', 'expense', 'transfer', 'adjustment'] as const).map(
    (type, index): Transaction => ({
      id: `transaction-${type}-${index}`,
      type,
      amount: 100 + index,
      categoryId: type === 'transfer' || type === 'adjustment' ? '' : 'category',
      walletId: 'wallet',
      sourceWalletId: type === 'transfer' ? 'source' : undefined,
      destinationWalletId: type === 'transfer' ? 'destination' : undefined,
      date: '2026-10-08',
      time: '12:00',
      note: '',
      createdAt: '2026-10-08T12:00:00.000Z',
      updatedAt: '2026-10-08T12:00:00.000Z',
    }),
  );

  for (const transaction of transactions) {
    const routeId = transactionDetailRouteId(transactionDetailRoute(transaction.id));
    assert.equal(findTransactionById(transactions, firstRouteParam(routeId)), transaction);
  }
  assert.equal(findTransactionById(transactions, 'deleted-transaction'), undefined);
  assert.equal(findTransactionById(transactions, undefined), undefined);
});