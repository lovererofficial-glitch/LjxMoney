import assert from 'node:assert/strict';
import test from 'node:test';

import type { Category, Transaction, Wallet } from '../features/finance/models.ts';
import { runSyncCycle, type SyncEngineDeps } from './syncEngine.ts';
import {
  classifySyncError,
  createEmptySyncMeta,
  type SyncCloudSnapshot,
  type SyncEntity,
  type SyncMeta,
  type SyncRepository,
  type SyncSnapshot,
} from './syncTypes.ts';

const NOW = '2026-10-07T12:00:00.000Z';
const OLDER = '2026-10-01T00:00:00.000Z';
const NEWER = '2026-10-06T00:00:00.000Z';

const emptySnapshot = (): SyncSnapshot => ({
  wallets: [],
  categories: [],
  transactions: [],
  budgets: [],
  goals: [],
  goalContributions: [],
  streak: { completionDates: [], manualCompletionDates: [], longestStreak: 0 },
});

const wallet = (id: string, updatedAt = OLDER): Wallet => ({
  id,
  name: id,
  color: '#D7B56D',
  type: 'cash',
  initialBalance: 0,
  archivedAt: null,
  createdAt: OLDER,
  updatedAt,
});

const category = (id: string, updatedAt = OLDER): Category => ({
  id,
  name: id,
  color: '#D7B56D',
  type: 'expense',
  archivedAt: null,
  createdAt: OLDER,
  updatedAt,
});

const transaction = (id: string, updatedAt = OLDER, amount = 1000): Transaction => ({
  id,
  type: 'expense',
  amount,
  categoryId: 'food',
  walletId: 'cash',
  date: '2026-10-02',
  time: '12:00',
  note: '',
  createdAt: OLDER,
  updatedAt,
});

interface CloudStore {
  tables: Record<Exclude<SyncEntity, never>, Map<string, unknown>>;
  streak: (SyncCloudSnapshot['streak'] & object) | null;
}

const makeCloud = () => {
  const tables = {
    wallets: new Map<string, Wallet>(),
    categories: new Map<string, Category>(),
    transactions: new Map<string, Transaction>(),
    budgets: new Map<string, SyncSnapshot['budgets'][number]>(),
    goals: new Map<string, SyncSnapshot['goals'][number]>(),
    goalContributions: new Map<string, SyncSnapshot['goalContributions'][number]>(),
  } satisfies CloudStore['tables'];
  let streak: CloudStore['streak'] = null;
  let offline = false;
  const guard = () => {
    if (offline) {
      throw new Error('Network request failed');
    }
  };
  const repo: SyncRepository = {
    fetchAll: async () => {
      guard();
      return {
        wallets: [...tables.wallets.values()],
        categories: [...tables.categories.values()],
        transactions: [...tables.transactions.values()],
        budgets: [...tables.budgets.values()],
        goals: [...tables.goals.values()],
        goalContributions: [...tables.goalContributions.values()],
        streak: streak ? { ...streak } : null,
      };
    },
    upsert: async (entity, rows) => {
      guard();
      for (const row of rows as { id: string }[]) {
        (tables[entity] as Map<string, unknown>).set(row.id, structuredClone(row));
      }
    },
    remove: async (entity, ids) => {
      guard();
      for (const id of ids) {
        (tables[entity] as Map<string, unknown>).delete(id);
      }
    },
    upsertStreak: async (value) => {
      guard();
      streak = { ...structuredClone(value), updatedAt: NOW };
    },
  };
  return {
    repo,
    tables,
    getStreak: () => streak,
    setOffline: (value: boolean) => {
      offline = value;
    },
    seedStreak: (value: NonNullable<CloudStore['streak']>) => {
      streak = value;
    },
  };
};

const makeHarness = () => {
  const cloud = makeCloud();
  let meta: SyncMeta = createEmptySyncMeta();
  let local: SyncSnapshot = emptySnapshot();
  let userId: string | null = 'user-1';

  const deps: SyncEngineDeps = {
    repo: cloud.repo,
    getUserId: () => userId,
    loadMeta: async () => structuredClone(meta),
    saveMeta: async (next) => {
      meta = structuredClone(next);
    },
    getSnapshot: () => structuredClone(local),
    applySnapshot: (snapshot) => {
      local = structuredClone(snapshot);
    },
    now: () => NOW,
  };

  return {
    deps,
    cloud,
    getMeta: () => meta,
    getLocal: () => local,
    setLocal: (next: SyncSnapshot) => {
      local = structuredClone(next);
    },
    setUserId: (id: string | null) => {
      userId = id;
    },
  };
};

const withBaseData = (snapshot: SyncSnapshot): SyncSnapshot => ({
  ...snapshot,
  wallets: [wallet('cash')],
  categories: [category('food')],
});

test('local data with a new account uploads everything to the cloud', async () => {
  const harness = makeHarness();
  const local = withBaseData(emptySnapshot());
  local.transactions = [transaction('txn-1'), transaction('txn-2', NEWER, 2000)];
  harness.setLocal(local);

  const result = await runSyncCycle(harness.deps);
  assert.equal(result, 'synced');
  assert.equal(harness.cloud.tables.wallets.size, 1);
  assert.equal(harness.cloud.tables.categories.size, 1);
  assert.equal(harness.cloud.tables.transactions.size, 2);
  assert.equal(harness.getMeta().ownerUserId, 'user-1');
  assert.ok(harness.getMeta().lastSyncedAt);
});

test('cloud data downloads to an empty device (new device restore)', async () => {
  const harness = makeHarness();
  harness.cloud.tables.wallets.set('cash', wallet('cash'));
  harness.cloud.tables.categories.set('food', category('food'));
  harness.cloud.tables.transactions.set('txn-1', transaction('txn-1'));

  const result = await runSyncCycle(harness.deps);
  assert.equal(result, 'synced');
  const local = harness.getLocal();
  assert.equal(local.wallets.length, 1);
  assert.equal(local.categories.length, 1);
  assert.equal(local.transactions.length, 1);
  assert.equal(local.transactions[0].id, 'txn-1');
});

test('offline changes keep local data untouched and fail as offline', async () => {
  const harness = makeHarness();
  harness.setLocal(withBaseData(emptySnapshot()));
  await runSyncCycle(harness.deps);

  // User adds a transaction while offline.
  const local = harness.getLocal();
  local.transactions.push(transaction('txn-offline', NOW));
  harness.setLocal(local);
  harness.cloud.setOffline(true);
  const metaBefore = structuredClone(harness.getMeta());

  await assert.rejects(() => runSyncCycle(harness.deps), (error: unknown) => {
    assert.equal(classifySyncError(error), 'offline');
    return true;
  });

  // Local write survives; cloud and sync metadata stay untouched.
  assert.equal(harness.getLocal().transactions.length, 1);
  assert.equal(harness.cloud.tables.transactions.size, 0);
  assert.deepEqual(harness.getMeta(), metaBefore);
});

test('reconnect syncs the offline change without duplicates', async () => {
  const harness = makeHarness();
  harness.setLocal(withBaseData(emptySnapshot()));
  await runSyncCycle(harness.deps);
  const local = harness.getLocal();
  local.transactions.push(transaction('txn-offline', NOW));
  harness.setLocal(local);
  harness.cloud.setOffline(true);
  await assert.rejects(() => runSyncCycle(harness.deps));

  harness.cloud.setOffline(false);
  await runSyncCycle(harness.deps);
  assert.equal(harness.cloud.tables.transactions.size, 1);

  // Running sync again must not duplicate anything.
  await runSyncCycle(harness.deps);
  assert.equal(harness.cloud.tables.transactions.size, 1);
  assert.equal(harness.getLocal().transactions.length, 1);
  assert.equal(harness.cloud.tables.wallets.size, 1);
});

test('wallet create, edit, archive, and restore sync through offline reconnect without duplicates', async () => {
  const harness = makeHarness();
  const local = withBaseData(emptySnapshot());
  harness.setLocal(local);
  await runSyncCycle(harness.deps);

  harness.cloud.setOffline(true);
  const offlineEdit = harness.getLocal();
  offlineEdit.wallets[0] = {
    ...offlineEdit.wallets[0]!,
    name: 'Cash updated',
    archivedAt: NOW,
    updatedAt: NOW,
  };
  offlineEdit.wallets.push({ ...wallet('savings-wallet', NOW), name: 'Savings', type: 'savings' });
  harness.setLocal(offlineEdit);
  await assert.rejects(() => runSyncCycle(harness.deps));

  harness.cloud.setOffline(false);
  await runSyncCycle(harness.deps);
  assert.equal(harness.cloud.tables.wallets.size, 2);
  assert.equal(harness.cloud.tables.wallets.get('cash')?.name, 'Cash updated');
  assert.equal(harness.cloud.tables.wallets.get('cash')?.archivedAt, NOW);

  const restore = harness.getLocal();
  restore.wallets[0] = { ...restore.wallets[0]!, archivedAt: null, updatedAt: '2026-10-07T12:00:01.000Z' };
  harness.setLocal(restore);
  await runSyncCycle(harness.deps);
  assert.equal(harness.cloud.tables.wallets.get('cash')?.archivedAt, null);
  await runSyncCycle(harness.deps);
  assert.equal(harness.cloud.tables.wallets.size, 2);
});

test('delete sync: offline deletion eventually removes the cloud row', async () => {
  const harness = makeHarness();
  const local = withBaseData(emptySnapshot());
  local.transactions = [transaction('txn-1')];
  harness.setLocal(local);
  await runSyncCycle(harness.deps);
  assert.equal(harness.cloud.tables.transactions.size, 1);

  // Local hard delete + tombstone (recorded by the deletion listener).
  const nextLocal = harness.getLocal();
  nextLocal.transactions = [];
  harness.setLocal(nextLocal);
  const meta = harness.getMeta();
  meta.tombstones.push({
    entity: 'transactions',
    id: 'txn-1',
    deletedAt: NOW,
  });
  await harness.deps.saveMeta(meta);

  // Offline: tombstone must survive until the cloud confirms the delete.
  harness.cloud.setOffline(true);
  await assert.rejects(() => runSyncCycle(harness.deps));
  assert.equal(harness.cloud.tables.transactions.size, 1);
  assert.equal(harness.getMeta().tombstones.length, 1);

  // Reconnect: cloud row deleted, tombstone cleared, no resurrection.
  harness.cloud.setOffline(false);
  await runSyncCycle(harness.deps);
  assert.equal(harness.cloud.tables.transactions.size, 0);
  assert.equal(harness.getMeta().tombstones.length, 0);
  await runSyncCycle(harness.deps);
  assert.equal(harness.getLocal().transactions.length, 0);
});

test('last-write-wins: newer local wins, newer cloud wins', async () => {
  const harness = makeHarness();
  const local = withBaseData(emptySnapshot());
  local.transactions = [transaction('txn-conflict', NEWER, 5000)];
  harness.setLocal(local);
  // Cloud has the same row but older (local edit should win).
  harness.cloud.tables.transactions.set(
    'txn-conflict',
    transaction('txn-conflict', OLDER, 1000),
  );
  harness.cloud.tables.wallets.set('cash', wallet('cash'));
  harness.cloud.tables.categories.set('food', category('food'));

  await runSyncCycle(harness.deps);
  assert.equal(harness.getLocal().transactions[0].amount, 5000);
  assert.equal(harness.cloud.tables.transactions.get('txn-conflict')?.amount, 5000);

  // Now the cloud row becomes newer (another device edited it).
  harness.cloud.tables.transactions.set('txn-conflict', transaction('txn-conflict', NOW, 7000));
  await runSyncCycle(harness.deps);
  assert.equal(harness.getLocal().transactions[0].amount, 7000);
  assert.equal(harness.cloud.tables.transactions.get('txn-conflict')?.amount, 7000);
});

test('a different account cannot sync over local data (blocked)', async () => {
  const harness = makeHarness();
  harness.setLocal(withBaseData(emptySnapshot()));
  await runSyncCycle(harness.deps);

  harness.setUserId('user-2');
  const result = await runSyncCycle(harness.deps);
  assert.equal(result, 'blocked');
  assert.equal(harness.getMeta().ownerUserId, 'user-1');
  assert.equal(harness.getLocal().wallets.length, 1);
});

test('orphan rows from the cloud are pruned and cleaned up remotely', async () => {
  const harness = makeHarness();
  harness.setLocal(withBaseData(emptySnapshot()));
  // Cloud transaction references a wallet that exists nowhere.
  const orphan = transaction('txn-orphan');
  orphan.walletId = 'ghost-wallet';
  harness.cloud.tables.transactions.set('txn-orphan', orphan);

  await runSyncCycle(harness.deps);
  assert.equal(harness.getLocal().transactions.some((row) => row.id === 'txn-orphan'), false);
  assert.equal(harness.cloud.tables.transactions.has('txn-orphan'), false);
  assert.equal(harness.getMeta().tombstones.length, 0);
});

test('streak completion dates merge as a union across devices', async () => {
  const harness = makeHarness();
  const local = withBaseData(emptySnapshot());
  local.streak = {
    completionDates: ['2026-10-01'],
    manualCompletionDates: ['2026-10-01'],
    longestStreak: 3,
  };
  harness.setLocal(local);
  harness.cloud.seedStreak({
    completionDates: ['2026-10-02'],
    manualCompletionDates: [],
    longestStreak: 5,
    updatedAt: NOW,
  });

  await runSyncCycle(harness.deps);
  const merged = harness.getLocal().streak;
  assert.deepEqual(merged.completionDates, ['2026-10-01', '2026-10-02']);
  assert.equal(merged.longestStreak, 5);
  assert.deepEqual(harness.cloud.getStreak()?.completionDates, ['2026-10-01', '2026-10-02']);
});

