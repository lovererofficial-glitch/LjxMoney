import type {
  Budget,
  Category,
  GoalContribution,
  SavingsGoal,
  StreakState,
  Transaction,
  Wallet,
} from '../features/finance/models';
import type {
  SyncCloudSnapshot,
  SyncEntity,
  SyncMeta,
  SyncSnapshot,
  SyncTombstone,
} from './syncTypes';

const EPOCH = '1970-01-01T00:00:00.000Z';

const isNewer = (a: string, b: string) => {
  const left = Date.parse(a);
  const right = Date.parse(b);
  if (Number.isNaN(left) || Number.isNaN(right)) {
    return false;
  }
  return left > right;
};

type StampedRow = { id: string; updatedAt?: string; createdAt?: string };

const stamp = <T extends StampedRow>(row: T): T & { updatedAt: string } => ({
  ...row,
  updatedAt: row.updatedAt ?? row.createdAt ?? EPOCH,
});

export const normalizeSnapshot = (snapshot: SyncSnapshot): SyncSnapshot => ({
  wallets: snapshot.wallets.map((row) => stamp(row)),
  categories: snapshot.categories.map((row) => stamp(row)),
  transactions: snapshot.transactions.map((row) => stamp(row)),
  budgets: snapshot.budgets.map((row) => stamp(row)),
  goals: snapshot.goals.map((row) => stamp(row)),
  goalContributions: snapshot.goalContributions.map((row) => stamp(row)),
  streak: snapshot.streak,
});

/**
 * Id-based last-write-wins reconciliation for one collection:
 * - cloud newer than local -> cloud row wins
 * - local newer than cloud -> local row kept (pushed in the push phase)
 * - synced marker exists but row is gone from cloud -> cloud-side deletion
 * - synced marker missing and row is local-only -> never pushed, keep
 * - id in `deletedIds` -> tombstone wins, cloud row does not resurrect
 */
const mergeCollection = <T extends StampedRow>(
  localRows: T[],
  cloudRows: T[],
  synced: Record<string, string>,
  deletedIds: Set<string>,
): { rows: (T & { updatedAt: string })[]; synced: Record<string, string> } => {
  const cloudMap = new Map(cloudRows.map((row) => [row.id, row]));
  const localIds = new Set(localRows.map((row) => row.id));
  const rows: (T & { updatedAt: string })[] = [];
  const nextSynced: Record<string, string> = {};

  for (const localRaw of localRows) {
    const local = stamp(localRaw);
    const cloudRaw = cloudMap.get(local.id);
    if (cloudRaw) {
      const cloud = stamp(cloudRaw);
      if (isNewer(cloud.updatedAt, local.updatedAt)) {
        rows.push(cloud);
      } else {
        rows.push(local);
      }
      nextSynced[local.id] = cloud.updatedAt;
      continue;
    }
    if (synced[local.id] !== undefined) {
      // Previously seen in the cloud but now absent: deleted elsewhere.
      continue;
    }
    rows.push(local);
  }

  for (const cloudRaw of cloudRows) {
    if (localIds.has(cloudRaw.id) || deletedIds.has(cloudRaw.id)) {
      continue;
    }
    const cloud = stamp(cloudRaw);
    rows.push(cloud);
    nextSynced[cloud.id] = cloud.updatedAt;
  }

  return { rows, synced: nextSynced };
};

/** Streak has no per-row timestamps; dates are additive, so union-merge. */
export const mergeStreak = (
  local: StreakState,
  cloud: (StreakState & { updatedAt: string }) | null,
): StreakState => {
  if (!cloud) {
    return local;
  }
  const union = (left: string[], right: string[]) => [...new Set([...(left ?? []), ...(right ?? [])])].sort();
  return {
    completionDates: union(local.completionDates, cloud.completionDates),
    manualCompletionDates: union(local.manualCompletionDates, cloud.manualCompletionDates),
    longestStreak: Math.max(local.longestStreak ?? 0, cloud.longestStreak ?? 0),
  };
};

export interface MergeOutcome {
  snapshot: SyncSnapshot;
  synced: Record<SyncEntity, Record<string, string>>;
  /** Tombstones dropped because the cloud row changed after the deletion. */
  resolvedTombstones: SyncTombstone[];
  /** Rows removed locally because they reference missing parents. */
  pruned: SyncTombstone[];
}

const pruneOrphans = (
  snapshot: SyncSnapshot,
  now: string,
): { snapshot: SyncSnapshot; pruned: SyncTombstone[] } => {
  const walletIds = new Set(snapshot.wallets.map((row) => row.id));
  const categoryIds = new Set(snapshot.categories.map((row) => row.id));
  const goalIds = new Set(snapshot.goals.map((row) => row.id));
  const pruned: SyncTombstone[] = [];

  const transactions = snapshot.transactions.filter((row) => {
    const walletsOk =
      walletIds.has(row.walletId) &&
      (row.type !== 'transfer' ||
        (row.sourceWalletId !== undefined &&
          row.destinationWalletId !== undefined &&
          walletIds.has(row.sourceWalletId) &&
          walletIds.has(row.destinationWalletId)));
    const categoryOk = row.type === 'transfer' || categoryIds.has(row.categoryId);
    if (walletsOk && categoryOk) {
      return true;
    }
    pruned.push({ entity: 'transactions', id: row.id, deletedAt: now });
    return false;
  });

  const budgets = snapshot.budgets.filter((row) => {
    if (categoryIds.has(row.categoryId)) {
      return true;
    }
    pruned.push({ entity: 'budgets', id: row.id, deletedAt: now });
    return false;
  });

  const goalContributions = snapshot.goalContributions.filter((row) => {
    if (goalIds.has(row.goalId)) {
      return true;
    }
    pruned.push({ entity: 'goalContributions', id: row.id, deletedAt: now });
    return false;
  });

  return { snapshot: { ...snapshot, transactions, budgets, goalContributions }, pruned };
};

/**
 * Full reconcile of local state against a cloud snapshot. Pure function: the
 * engine reads local state, merges and applies within a single tick so
 * concurrent edits cannot be lost between read and write.
 */
export const mergeSnapshots = (
  local: SyncSnapshot,
  cloud: SyncCloudSnapshot,
  meta: Pick<SyncMeta, 'synced' | 'tombstones'>,
  now: string,
): MergeOutcome => {
  const remaining: SyncTombstone[] = [];
  const resolved: SyncTombstone[] = [];
  const deletedIds: Record<SyncEntity, Set<string>> = {
    wallets: new Set(),
    categories: new Set(),
    transactions: new Set(),
    budgets: new Set(),
    goals: new Set(),
    goalContributions: new Set(),
  };

  const cloudById: Record<SyncEntity, Map<string, { updatedAt: string }>> = {
    wallets: new Map(cloud.wallets.map((row) => [row.id, stamp(row)])),
    categories: new Map(cloud.categories.map((row) => [row.id, stamp(row)])),
    transactions: new Map(cloud.transactions.map((row) => [row.id, stamp(row)])),
    budgets: new Map(cloud.budgets.map((row) => [row.id, stamp(row)])),
    goals: new Map(cloud.goals.map((row) => [row.id, stamp(row)])),
    goalContributions: new Map(cloud.goalContributions.map((row) => [row.id, stamp(row)])),
  };

  for (const tombstone of meta.tombstones) {
    const cloudRow = cloudById[tombstone.entity].get(tombstone.id);
    if (cloudRow && isNewer(cloudRow.updatedAt, tombstone.deletedAt)) {
      resolved.push(tombstone);
      continue;
    }
    remaining.push(tombstone);
    deletedIds[tombstone.entity].add(tombstone.id);
  }

  const merge = <E extends SyncEntity>(entity: E) => deletedIds[entity];

  const wallets = mergeCollection<Wallet>(
    local.wallets,
    cloud.wallets,
    meta.synced.wallets ?? {},
    merge('wallets'),
  );
  const categories = mergeCollection<Category>(
    local.categories,
    cloud.categories,
    meta.synced.categories ?? {},
    merge('categories'),
  );
  const transactions = mergeCollection<Transaction>(
    local.transactions,
    cloud.transactions,
    meta.synced.transactions ?? {},
    merge('transactions'),
  );
  const budgets = mergeCollection<Budget>(
    local.budgets,
    cloud.budgets,
    meta.synced.budgets ?? {},
    merge('budgets'),
  );
  const goals = mergeCollection<SavingsGoal>(
    local.goals,
    cloud.goals,
    meta.synced.goals ?? {},
    merge('goals'),
  );
  const goalContributions = mergeCollection<GoalContribution>(
    local.goalContributions,
    cloud.goalContributions,
    meta.synced.goalContributions ?? {},
    merge('goalContributions'),
  );

  const merged: SyncSnapshot = {
    wallets: wallets.rows,
    categories: categories.rows,
    transactions: transactions.rows,
    budgets: budgets.rows,
    goals: goals.rows,
    goalContributions: goalContributions.rows,
    streak: mergeStreak(local.streak, cloud.streak),
  };

  const { snapshot: prunedSnapshot, pruned } = pruneOrphans(merged, now);

  const prunedById: Record<SyncEntity, Set<string>> = {
    wallets: new Set(),
    categories: new Set(),
    transactions: new Set(),
    budgets: new Set(),
    goals: new Set(),
    goalContributions: new Set(),
  };
  for (const item of pruned) {
    prunedById[item.entity].add(item.id);
  }
  const dropPruned = (entity: SyncEntity, markers: Record<string, string>) => {
    for (const id of prunedById[entity]) {
      delete markers[id];
    }
    return markers;
  };

  return {
    snapshot: prunedSnapshot,
    synced: {
      wallets: dropPruned('wallets', wallets.synced),
      categories: dropPruned('categories', categories.synced),
      transactions: dropPruned('transactions', transactions.synced),
      budgets: dropPruned('budgets', budgets.synced),
      goals: dropPruned('goals', goals.synced),
      goalContributions: dropPruned('goalContributions', goalContributions.synced),
    },
    resolvedTombstones: resolved,
    pruned,
  };
};

/** Local rows whose updatedAt no longer matches what the cloud has. */
export const collectChangedRows = <E extends SyncEntity>(
  entity: E,
  snapshot: SyncSnapshot,
  synced: Record<SyncEntity, Record<string, string>>,
): SyncSnapshot[E] => {
  const markers = synced[entity] ?? {};
  return (snapshot[entity] as readonly StampedRow[]).filter(
    (row) => markers[row.id] !== row.updatedAt,
  ) as SyncSnapshot[E];
};
