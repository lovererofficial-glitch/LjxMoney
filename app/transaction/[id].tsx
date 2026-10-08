import { Redirect, useLocalSearchParams } from 'expo-router';

import { firstRouteParam, legacyTransactionDetailRoute } from '../../src/lib/transactionRoutes';

export default function TransactionIdRoute() {
  const { id: routeId } = useLocalSearchParams<{ id?: string | string[] }>();
  const id = firstRouteParam(routeId);

  if (!id) {
    return <Redirect href="/tabs/transactions" />;
  }

  return <Redirect href={legacyTransactionDetailRoute(id)} />;
}