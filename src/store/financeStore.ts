import AsyncStorage from '@react-native-async-storage/async-storage';

import { appStorage } from '../lib/storage';
import { createFinanceStore } from './financeStoreCore';
import { createOwnerScopedStorage, financeKeyForOwner, legacyFinanceKey, type FinanceOwnerId } from './financeOwnerStorage';

let activeOwner: FinanceOwnerId | null = null;

const ownerScopedStorage = createOwnerScopedStorage(appStorage, () => activeOwner);

export const useFinanceStore = createFinanceStore(ownerScopedStorage);

export const getFinanceOwner = (): FinanceOwnerId | null => activeOwner;

export const setFinanceOwner = (ownerId: FinanceOwnerId | null): void => {
  activeOwner = ownerId;
};

export const suspendFinancePersistence = (suspended: boolean): void => {
  ownerScopedStorage.suspendWrites(suspended);
};

const readRaw = async (key: string): Promise<string | null> => {
  try {
    return await AsyncStorage.getItem(key);
  } catch (error) {
    console.error(`Finance session could not read "${key}".`, error);
    return null;
  }
};

/** Raw access for one-time legacy migration during account switches. */
export const readLegacyFinanceSnapshot = (): Promise<string | null> => readRaw(legacyFinanceKey());

export const readOwnerFinanceSnapshot = (ownerId: FinanceOwnerId): Promise<string | null> =>
  readRaw(financeKeyForOwner(ownerId));

export const readGuestFinanceSnapshot = (): Promise<string | null> =>
  readRaw(financeKeyForOwner(null));

export const writeOwnerFinanceSnapshot = async (
  ownerId: FinanceOwnerId,
  raw: string,
): Promise<void> => {
  try {
    await AsyncStorage.setItem(financeKeyForOwner(ownerId), raw);
  } catch (error) {
    console.error('Finance session could not migrate legacy data.', error);
  }
};

export const removeLegacyFinanceSnapshot = async (): Promise<void> => {
  try {
    await AsyncStorage.removeItem(legacyFinanceKey());
  } catch (error) {
    console.error('Finance session could not clear legacy data.', error);
  }
};

export const removeGuestFinanceSnapshot = async (): Promise<void> => {
  try {
    await AsyncStorage.removeItem(financeKeyForOwner(null));
  } catch (error) {
    console.error('Finance session could not clear guest data.', error);
  }
};

export { getTotalsForRange, isApplyingSyncSnapshot, registerSyncDeletionListener } from './financeStoreCore';
