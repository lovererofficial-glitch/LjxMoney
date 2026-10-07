import { appStorage } from '../lib/storage';
import { createFinanceStore } from './financeStoreCore';

export const useFinanceStore = createFinanceStore(appStorage);
export { getTotalsForRange, isApplyingSyncSnapshot, registerSyncDeletionListener } from './financeStoreCore';
