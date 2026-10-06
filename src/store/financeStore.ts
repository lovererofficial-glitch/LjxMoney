import { appStorage } from '../lib/storage';
import { createFinanceStore } from './financeStoreCore';

export const useFinanceStore = createFinanceStore(appStorage);
export { getTotalsForRange } from './financeStoreCore';
