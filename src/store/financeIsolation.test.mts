import assert from 'node:assert/strict';
import test from 'node:test';
import type { StateStorage } from 'zustand/middleware';

import type { AuthState } from '../auth/authTypes.ts';
import type { Transaction, Wallet } from '../features/finance/models.ts';
import { createFinanceStore } from './financeStoreCore.ts';
import { createOwnerScopedStorage, financeKeyForOwner } from './financeOwnerStorage.ts';
import { createFinanceSessionController } from './financeSession.ts';
import { pruneEmptyLegacyWalletSeeds } from './financeMigration.ts';

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

const addCashWallet = (store: ReturnType<typeof createFinanceStore>) => {
  const now = '2026-10-01T00:00:00.000Z';
  store.getState().addWallet({
    id: 'cash',
    name: 'Cash',
    type: 'cash',
    color: '#68E1FD',
    initialBalance: 0,
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
  });
};

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
  addCashWallet(harness.financeStore);
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
  addCashWallet(harness.financeStore);
  harness.financeStore.getState().addTransaction(makeTransaction('txn-a', 1000));
  await flush();

  harness.setAuth({ status: 'unauthenticated', user: null });
  await flush();
  harness.setAuth(loginAs('user-b', 'b@example.com'));
  await flush();

  assert.deepEqual(harness.financeStore.getState().wallets, []);
  assert.deepEqual(harness.financeStore.getState().streak.completionDates, []);
  assert.deepEqual(
    harness.financeStore.getState().transactions.map((item) => item.id),
    [],
  );

  addCashWallet(harness.financeStore);
  harness.financeStore.getState().addTransaction(makeTransaction('txn-b', 500));
  await flush();
  const aRaw = await harness.storage.getItem(financeKeyForOwner('user-a'));
  const bRaw = await harness.storage.getItem(financeKeyForOwner('user-b'));
  assert.ok(aRaw?.includes('txn-a'));
  assert.ok(!aRaw?.includes('txn-b'));
  assert.ok(bRaw?.includes('txn-b'));
  assert.ok(!bRaw?.includes('txn-a'));
});

test('wallets remain scoped to their owner across logout and account switches', async () => {
  const harness = makeHarness();
  await harness.financeStore.persist.rehydrate();
  harness.setAuth(loginAs('user-a', 'a@example.com'));
  await flush();
  const wallet: Wallet = {
    id: 'wallet-a',
    name: 'Wallet A',
    type: 'cash',
    color: '#D7B56D',
    initialBalance: 0,
    archivedAt: null,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
  };
  harness.financeStore.getState().addWallet(wallet);
  harness.financeStore.getState().addTransaction({
    id: 'adjustment-a',
    type: 'adjustment',
    amount: 250,
    adjustmentDirection: 'decrease',
    categoryId: '',
    walletId: wallet.id,
    date: '2026-10-01',
    time: '12:00',
    note: 'Cash count',
    createdAt: '2026-10-01T12:00:00.000Z',
    updatedAt: '2026-10-01T12:00:00.000Z',
  });
  await flush();

  harness.setAuth({ status: 'unauthenticated', user: null });
  await flush();
  harness.setAuth(loginAs('user-b', 'b@example.com'));
  await flush();
  assert.ok(!harness.financeStore.getState().wallets.some((item) => item.id === wallet.id));
  assert.ok(!harness.financeStore.getState().transactions.some((item) => item.id === 'adjustment-a'));
  assert.deepEqual(harness.financeStore.getState().streak.completionDates, []);

  harness.setAuth({ status: 'unauthenticated', user: null });
  await flush();
  harness.setAuth(loginAs('user-a', 'a@example.com'));
  await flush();
  assert.ok(harness.financeStore.getState().wallets.some((item) => item.id === wallet.id));
  assert.ok(harness.financeStore.getState().transactions.some((item) => item.id === 'adjustment-a'));
  assert.deepEqual(harness.financeStore.getState().streak.completionDates, ['2026-10-01']);
});

test('deleting a wallet affects only its owner and stays deleted after re-login', async () => {
  const harness = makeHarness();
  await harness.financeStore.persist.rehydrate();
  harness.setAuth(loginAs('user-a', 'a@example.com'));
  await flush();
  harness.financeStore.getState().addWallet({
    id: 'shared-local-id',
    name: 'A wallet',
    type: 'cash',
    color: '#D7B56D',
    initialBalance: 0,
    archivedAt: null,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
  });
  harness.financeStore.getState().deleteWallet('shared-local-id');
  await flush();
  assert.ok(!harness.financeStore.getState().wallets.some((wallet) => wallet.id === 'shared-local-id'));

  harness.setAuth({ status: 'unauthenticated', user: null });
  await flush();
  harness.setAuth(loginAs('user-b', 'b@example.com'));
  await flush();
  harness.financeStore.getState().addWallet({
    id: 'shared-local-id',
    name: 'B wallet',
    type: 'bank',
    color: '#3DD598',
    initialBalance: 0,
    archivedAt: null,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
  });
  assert.equal(harness.financeStore.getState().wallets.find((wallet) => wallet.id === 'shared-local-id')?.name, 'B wallet');

  harness.setAuth({ status: 'unauthenticated', user: null });
  await flush();
  harness.setAuth(loginAs('user-a', 'a@example.com'));
  await flush();
  assert.ok(!harness.financeStore.getState().wallets.some((wallet) => wallet.id === 'shared-local-id'));
});

test('user A cannot create a transfer to a wallet that belongs to user B', async () => {
  const harness = makeHarness();
  await harness.financeStore.persist.rehydrate();
  harness.setAuth(loginAs('user-a', 'a@example.com'));
  await flush();
  harness.financeStore.getState().addWallet({
    id: 'wallet-a-source', name: 'A source', type: 'cash', color: '#000000', initialBalance: 1_000,
  });

  harness.setAuth({ status: 'unauthenticated', user: null });
  await flush();
  harness.setAuth(loginAs('user-b', 'b@example.com'));
  await flush();
  harness.financeStore.getState().addWallet({
    id: 'wallet-b-destination', name: 'B destination', type: 'bank', color: '#000000', initialBalance: 0,
  });

  harness.setAuth({ status: 'unauthenticated', user: null });
  await flush();
  harness.setAuth(loginAs('user-a', 'a@example.com'));
  await flush();
  assert.throws(() => harness.financeStore.getState().addTransaction({
    id: 'cross-user-transfer',
    type: 'transfer',
    amount: 100,
    categoryId: '',
    walletId: 'wallet-a-source',
    sourceWalletId: 'wallet-a-source',
    destinationWalletId: 'wallet-b-destination',
    date: '2026-10-01',
    time: '12:00',
    note: '',
    createdAt: '2026-10-01T12:00:00.000Z',
    updatedAt: '2026-10-01T12:00:00.000Z',
  }), /valid source and destination/i);
  assert.ok(!harness.financeStore.getState().transactions.some((item) => item.id === 'cross-user-transfer'));
});

test('budgets remain private across account switches', async () => {
  const harness = makeHarness();
  await harness.financeStore.persist.rehydrate();
  harness.setAuth(loginAs('user-a', 'a@example.com'));
  await flush();
  harness.financeStore.getState().addBudget({
    id: 'budget-a',
    name: 'A food limit',
    categoryId: 'food',
    amount: 10_000,
    period: 'monthly',
    startDate: '2026-10-01',
    endDate: '2026-10-31',
    archivedAt: null,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
  });
  await flush();

  harness.setAuth({ status: 'unauthenticated', user: null });
  await flush();
  harness.setAuth(loginAs('user-b', 'b@example.com'));
  await flush();
  assert.ok(!harness.financeStore.getState().budgets.some((budget) => budget.id === 'budget-a'));
});

test('guest data migrates to first account once, never leaks to second', async () => {
  const harness = makeHarness();
  await harness.financeStore.persist.rehydrate();
  addCashWallet(harness.financeStore);
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
});

test('guest migration prunes only empty legacy wallet seeds and keeps data-backed wallets', async () => {
  const harness = makeHarness();
  await harness.financeStore.persist.rehydrate();
  const guestSnapshot = JSON.stringify({
    state: {
      transactions: [],
      categories: [],
      wallets: [
        { id: 'cash', name: 'Cash', type: 'cash', color: '#68E1FD', initialBalance: 0 },
        { id: 'bank', name: 'Bank', type: 'bank', color: '#3DD598', initialBalance: 0 },
        { id: 'momo', name: 'MoMo', type: 'ewallet', color: '#C084FC', initialBalance: 0, paymentQrPath: 'user-a/momo/payment-qr-v1' },
        { id: 'custom', name: 'Custom', type: 'other', color: '#D7B56D', initialBalance: 0 },
      ],
      budgets: [],
      goals: [],
      goalContributions: [],
      streak: { completionDates: [], manualCompletionDates: [], longestStreak: 0 },
    },
    version: 2,
  });
  const pruned = JSON.parse(pruneEmptyLegacyWalletSeeds(guestSnapshot)) as {
    state: { wallets: Wallet[] };
  };
  assert.deepEqual(pruned.state.wallets.map((wallet) => wallet.id), ['momo', 'custom']);

  await harness.storage.setItem(financeKeyForOwner(null), guestSnapshot);
  harness.setAuth(loginAs('user-a', 'a@example.com'));
  await flush();
  assert.deepEqual(harness.financeStore.getState().wallets.map((wallet) => wallet.id), ['momo', 'custom']);
  assert.equal(harness.financeStore.getState().wallets.find((wallet) => wallet.id === 'momo')?.paymentQrPath, 'user-a/momo/payment-qr-v1');
});

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