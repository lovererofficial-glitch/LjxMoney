import type { StateStorage } from 'zustand/middleware';

const LEGACY_FINANCE_KEY = 'ljxmoney-finance-store';
const FINANCE_KEY_PREFIX = 'ljxmoney-finance-store:';
const GUEST_OWNER = 'guest';

export type FinanceOwnerId = string;

/** Owner-scoped persistence key: guest + each account get their own dataset. */
export const financeKeyForOwner = (ownerId: FinanceOwnerId | null): string =>
  `${FINANCE_KEY_PREFIX}${ownerId ?? GUEST_OWNER}`;

export const legacyFinanceKey = (): string => LEGACY_FINANCE_KEY;

/**
 * Owner-routing storage for the finance store. The zustand `persist` layer
 * always reads/writes one fixed `name`; routing by active owner gives every
 * account (and guest) an isolated AsyncStorage dataset without touching
 * any other app keys (settings/i18n stay global).
 */
export const createOwnerScopedStorage = (
  storage: StateStorage,
  getOwnerId: () => FinanceOwnerId | null,
): StateStorage & { suspendWrites: (suspended: boolean) => void } => {
  let writesSuspended = false;
  return {
    suspendWrites: (suspended: boolean) => {
      writesSuspended = suspended;
    },
    getItem: (name) => storage.getItem(financeKeyForOwner(getOwnerId())),
    setItem: (name, value) => {
      if (writesSuspended) {
        return Promise.resolve();
      }
      return storage.setItem(financeKeyForOwner(getOwnerId()), value);
    },
    removeItem: (name) => storage.removeItem(financeKeyForOwner(getOwnerId())),
  };
};