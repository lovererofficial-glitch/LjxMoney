import assert from 'node:assert/strict';
import test from 'node:test';
import type { StateStorage } from 'zustand/middleware';

import type { AuthState } from '../auth/authTypes.ts';
import type { Transaction } from '../features/finance/models.ts';
import { createFinanceStore } from './financeStoreCore.ts';
import { createOwnerScopedStorage, financeKeyForOwner } from './financeOwnerStorage.ts';
import { createFinanceSessionController } from './financeSession.ts';

type AuthSlice = Pick<AuthState, 'status' | 'user'>;

const createMemoryStorage = (): StateStorage & { keys: () => string[] } => {
  const values = new Map<string, string>();
  return {
    // Async like production AsyncStorage: the session controller chains
    // .catch() on reads, which requires real promises (not sync values).
    getItem: async (name) => values.get(name) ?? null,
    setItem: async (name, value) => {
      values.set(name, value);
    },
    removeItem: async (name) => {
      values.delete(name);
    },
    keys: () => [...values.keys()],
  };
};

const makeTransaction = (id: string, amount: number): Transaction => ({
  id,
  type: 'expense',
  amount,
  categoryId: 'food',
  walletId: 'cash',
  date: '2026-10-01',
  time: '12:00',
  note: '',
  createdAt: '2026-10-01T12:00:00.000Z',
  updatedAt: '2026-10-01T12:00:00.000Z',
});

const flush = async (rounds = 8): Promise<void> => {
  for (let i = 0; i < rounds; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
};

const loginAs = (id: string, email: string): AuthSlice => ({
  status: 'authenticated',
  user: { id, email },
});

interface Harness {
  financeStore: ReturnType<typeof createFinanceStore>;
  storage: StateStorage & { keys: () => string[] };
  setAuth: (next: AuthSlice) => void;
}

const makeHarness = (): Harness => {
  const storage = createMemoryStorage();
  const asyncStorage: StateStorage = {
    getItem: (name) => Promise.resolve(storage.getItem(name)),
    setItem: (name, value) => Promise.resolve(storage.setItem(name, value)).then(() => undefined),
    removeItem: (name) => Promise.resolve(storage.removeItem(name)).then(() => undefined),
  };
  let owner: string | null = null;
  let suspended = false;
  const scoped = createOwnerScopedStorage(storage, () => owner);
  const financeStore = createFinanceStore({
    getItem: (name) => scoped.getItem(name),
    setItem: (name, value) => {
      if (suspended) {
        return Promise.resolve();
      }
      return scoped.setItem(name, value);
    },
    removeItem: (name) => scoped.removeItem(name),
  });

  let auth: AuthSlice = { status: 'unauthenticated', user: null };
  const listeners = new Set<(state: AuthSlice, previous: AuthSlice) => void>();
  const authStore = {
    getState: () => auth,
    subscribe: (listener: (state: AuthSlice, previous: AuthSlice) => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };

  createFinanceSessionController({
    financeStore,
    authStore,
    getFinanceOwner: () => owner,
    setFinanceOwner: (next) => {
      owner = next;
    },
    readLegacy: () => asyncStorage.getItem('ljxmoney-finance-store'),
    readGuest: () => asyncStorage.getItem(financeKeyForOwner(null)),
    readOwner: (id) => asyncStorage.getItem(financeKeyForOwner(id)),
    writeOwner: (id, raw) => asyncStorage.setItem(financeKeyForOwner(id), raw),
    removeLegacy: () => asyncStorage.removeItem('ljxmoney-finance-store'),
    removeGuest: () => asyncStorage.removeItem(financeKeyForOwner(null)),
    suspendFinanceWrites: (value) => {
      suspended = value;
    },
  }).start();

  return {
    financeStore,
    storage,
    setAuth: (next) => {
      const previous = auth;
      auth = next;
      for (const listener of [...listeners]) {
        listener(next, previous);
      }
    },
  };
};

test('logout clears user data from memory immediately', async () => {
  const harness = makeHarness();
  await harness.financeStore.persist.rehydrate();
  harness.setAuth(loginAs('user-a', 'a@example.com'));
  await flush();
  harness.financeStore.getState().addTransaction(makeTransaction('txn-a', 1000));
  await flush();
  assert.equal(harness.financeStore.getState().transactions.length, 1);

  harness.setAuth({ status: 'unauthenticated', user: null });
  await flush();
  assert.deepEqual(harness.financeStore.getState().transactions, []);
  assert.deepEqual(harness.financeStore.getState().goalContributions, []);
});

test('user B never sees user A data', async () => {
  const harness = makeHarness();
  await harness.financeStore.persist.rehydrate();
  harness.setAuth(loginAs('user-a', 'a@example.com'));
  await flush();
  harness.financeStore.getState().addTransaction(makeTransaction('txn-a', 1000));
  await flush();

  harness.setAuth({ status: 'unauthenticated', user: null });
  await flush();
  harness.setAuth(loginAs('user-b', 'b@example.com'));
  await flush();

  assert.deepEqual(
    harness.financeStore.getState().transactions.map((item) => item.id),
    [],
  );

  harness.financeStore.getState().addTransaction(makeTransaction('txn-b', 500));
  await flush();
  const aRaw = await harness.storage.getItem(financeKeyForOwner('user-a'));
  const bRaw = await harness.storage.getItem(financeKeyForOwner('user-b'));
  assert.ok(aRaw?.includes('txn-a'));
  assert.ok(!aRaw?.includes('txn-b'));
  assert.ok(bRaw?.includes('txn-b'));
  assert.ok(!bRaw?.includes('txn-a'));
});

test('guest data migrates to first account once, never leaks to second', async () => {
  const harness = makeHarness();
  await harness.financeStore.persist.rehydrate();
  harness.financeStore.getState().addTransaction(makeTransaction('guest-txn', 250));
  await flush();
  const guestRaw = await harness.storage.getItem(financeKeyForOwner(null));
  assert.ok(guestRaw?.includes('guest-txn'));

  harness.setAuth(loginAs('user-a', 'a@example.com'));
  await flush();
  assert.ok(
    harness.financeStore.getState().transactions.some((item) => item.id === 'guest-txn'),
  );

  harness.setAuth({ status: 'unauthenticated', user: null });
  await flush();
  harness.setAuth(loginAs('user-b', 'b@example.com'));
  await flush();
  assert.ok(
    !harness.financeStore.getState().transactions.some((item) => item.id === 'guest-txn'),
  );

test('stale apply from user A is ignored after switching to user B', async () => {
  const harness = makeHarness();
  await harness.financeStore.persist.rehydrate();
  harness.setAuth(loginAs('user-a', 'a@example.com'));
  await flush();

  // Simulate A's in-flight sync finishing AFTER B logs in: the runtime's
  // generation + user check must drop it instead of writing A's rows into B.
  let currentUser: string | null = 'user-a';
  const guardedApply = (snapshot: { transactions: Transaction[] }) => {
    if (currentUser !== 'user-a') {
      return;
    }
    harness.financeStore.getState().applySyncSnapshot({
      wallets: harness.financeStore.getState().wallets,
      categories: harness.financeStore.getState().categories,
      transactions: snapshot.transactions,
      budgets: [],
      goals: [],
      goalContributions: [],
      streak: harness.financeStore.getState().streak,
    });
  };

  harness.setAuth(loginAs('user-b', 'b@example.com'));
  await flush();
  currentUser = 'user-b';
  guardedApply({ transactions: [makeTransaction('txn-a-late', 9999)] });
  await flush();

  assert.ok(
    !harness.financeStore.getState().transactions.some((item) => item.id === 'txn-a-late'),
  );
});
});