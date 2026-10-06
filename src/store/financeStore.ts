import AsyncStorage from '@react-native-async-storage/async-storage';

import { createFinanceStore } from './financeStoreCore';

export const useFinanceStore = createFinanceStore(AsyncStorage);
export { getTotalsForRange } from './financeStoreCore';
