import type { Transaction } from '../features/finance/models.ts';

export type RouteParam = string | string[] | undefined;

export const firstRouteParam = (value: RouteParam): string | undefined =>
  Array.isArray(value) ? value[0] : value;

export const legacyTransactionDetailRoute = (id: string) => ({
  pathname: '/transaction/id' as const,
  params: { transactionId: id },
});

export const transactionDetailRoute = (id: string) => id === 'id'
  ? legacyTransactionDetailRoute(id)
  : {
      pathname: '/transaction/[id]' as const,
      params: { id },
    };

export const transactionDetailRouteId = (route: ReturnType<typeof transactionDetailRoute>) =>
  'id' in route.params ? route.params.id : route.params.transactionId;

export const findTransactionById = (
  transactions: readonly Transaction[],
  id: string | undefined,
) => id ? transactions.find((transaction) => transaction.id === id) : undefined;