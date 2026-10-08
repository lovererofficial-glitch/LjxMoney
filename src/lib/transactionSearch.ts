import { format, startOfMonth, subDays } from 'date-fns';

import type { Transaction, TransactionType } from '../features/finance/models.ts';

export type TransactionTypeFilter = 'all' | TransactionType;
export type TransactionDateFilter = 'all' | 'today' | 'last7Days' | 'thisMonth';
export type TransactionSortOrder = 'newest' | 'oldest';

export interface TransactionDateRange {
  from?: string;
  to?: string;
}

export interface TransactionSearchFilters {
  query?: string;
  type?: TransactionTypeFilter;
  walletId?: string;
  categoryId?: string;
  dateRange?: TransactionDateRange;
  sortOrder?: TransactionSortOrder;
}

export const normalizeTransactionSearch = (value: string) =>
  value
    .trim()
    .toLocaleLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd');

export const getTransactionDateRange = (
  filter: TransactionDateFilter,
  now = new Date(),
): TransactionDateRange => {
  const today = format(now, 'yyyy-MM-dd');
  switch (filter) {
    case 'today':
      return { from: today, to: today };
    case 'last7Days':
      return { from: format(subDays(now, 6), 'yyyy-MM-dd'), to: today };
    case 'thisMonth':
      return { from: format(startOfMonth(now), 'yyyy-MM-dd'), to: today };
    case 'all':
      return {};
  }
};

export const filterAndSortTransactions = (
  transactions: readonly Transaction[],
  filters: TransactionSearchFilters,
  walletNames: ReadonlyMap<string, string>,
  categoryNames: ReadonlyMap<string, string>,
): Transaction[] => {
  const query = normalizeTransactionSearch(filters.query ?? '');
  const type = filters.type ?? 'all';
  const sortOrder = filters.sortOrder ?? 'newest';
  const result = transactions.filter((transaction) => {
    if (type !== 'all' && transaction.type !== type) return false;
    if (filters.dateRange?.from && transaction.date < filters.dateRange.from) return false;
    if (filters.dateRange?.to && transaction.date > filters.dateRange.to) return false;

    if (filters.walletId) {
      const matchesWallet = transaction.type === 'transfer'
        ? (transaction.sourceWalletId ?? transaction.walletId) === filters.walletId ||
          transaction.destinationWalletId === filters.walletId
        : transaction.walletId === filters.walletId;
      if (!matchesWallet) return false;
    }

    if (filters.categoryId) {
      if (
        (transaction.type !== 'income' && transaction.type !== 'expense') ||
        transaction.categoryId !== filters.categoryId
      ) {
        return false;
      }
    }

    if (!query) return true;
    const searchableValues = [
      transaction.note,
      transaction.categoryId ? categoryNames.get(transaction.categoryId) : '',
      walletNames.get(transaction.walletId),
      transaction.sourceWalletId ? walletNames.get(transaction.sourceWalletId) : '',
      transaction.destinationWalletId ? walletNames.get(transaction.destinationWalletId) : '',
    ];
    return searchableValues.some((value) =>
      normalizeTransactionSearch(value ?? '').includes(query),
    );
  });

  result.sort((first, second) => {
    const comparison = `${first.date}T${first.time}`.localeCompare(`${second.date}T${second.time}`);
    return sortOrder === 'newest' ? -comparison : comparison;
  });
  return result;
};