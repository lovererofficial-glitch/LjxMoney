import { collectChangedRows, mergeSnapshots, normalizeSnapshot } from './syncMerge.ts';
import {
  SYNC_PUSH_ORDER,
  type SyncCycleResult,
  type SyncEntity,
  type SyncMeta,
  type SyncRepository,
  type SyncSnapshot,
  type SyncTombstone,
} from './syncTypes.ts';

export interface SyncEngineDeps {
  repo: SyncRepository;
  getUserId: () => string | null;
  loadMeta: () => Promise<SyncMeta>;
  saveMeta: (meta: SyncMeta) => Promise<void>;
  getSnapshot: () => SyncSnapshot;
  /** Synchronous local apply; must not lose writes that happen mid-cycle. */
  applySnapshot: (snapshot: SyncSnapshot) => void;
  now?: () => string;
}

const tombstoneKey = (item: SyncTombstone) => `${item.entity}:${item.id}`;

const groupTombstones = (items: SyncTombstone[]) => {
  const grouped = new Map<SyncEntity, string[]>();
  for (const item of items) {
    const ids = grouped.get(item.entity) ?? [];
    ids.push(item.id);
    grouped.set(item.entity, ids);
  }
  return grouped;
};

/**
 * One full sync cycle:
 *   pull -> merge (LWW by id) -> apply locally -> persist meta
 *   -> push tombstones (deletes) -> push changed rows -> push streak
 *
 * Meta is only advanced after remote confirmation, so a failure at any point
 * is retried on the next cycle without losing or duplicating data.
 */
export const runSyncCycle = async (deps: SyncEngineDeps): Promise<SyncCycleResult> => {
  const userId = deps.getUserId();
  if (!userId) {
    return 'blocked';
  }

  const loaded = await deps.loadMeta();
  if (loaded.ownerUserId && loaded.ownerUserId !== userId) {
    return 'blocked';
  }
  const ownerUserId = loaded.ownerUserId ?? userId;
  const now = deps.now ?? (() => new Date().toISOString());

  // 1) Pull the full cloud state (per-user via RLS) and reconcile locally.
  const cloud = await deps.repo.fetchAll();
  const local = normalizeSnapshot(deps.getSnapshot());
  const outcome = mergeSnapshots(
    local,
    cloud,
    { synced: loaded.synced, tombstones: loaded.tombstones },
    now(),
  );

  deps.applySnapshot(outcome.snapshot);

  // 2) Persist merged markers plus tombstones (surviving + newly pruned)
  //    BEFORE remote deletes, so a crash never resurrects deleted rows.
  const resolvedKeys = new Set(outcome.resolvedTombstones.map(tombstoneKey));
  const tombstones = [
    ...loaded.tombstones.filter((item) => !resolvedKeys.has(tombstoneKey(item))),
    ...outcome.pruned,
  ];
  let meta: SyncMeta = {
    version: 1,
    ownerUserId,
    lastSyncedAt: loaded.lastSyncedAt,
    synced: outcome.synced,
    tombstones,
  };
  await deps.saveMeta(meta);

  // 3) Push deletions (idempotent; retried until confirmed).
  if (meta.tombstones.length) {
    for (const [entity, ids] of groupTombstones(meta.tombstones)) {
      await deps.repo.remove(entity, ids);
    }
    const removedKeys = new Set(meta.tombstones.map(tombstoneKey));
    for (const item of meta.tombstones) {
      delete meta.synced[item.entity][item.id];
    }
    meta = { ...meta, tombstones: meta.tombstones.filter((item) => !removedKeys.has(tombstoneKey(item))) };
    await deps.saveMeta(meta);
  }

  // 4) Push local rows changed since the last observed cloud state.
  const snapshot = outcome.snapshot;
  for (const entity of SYNC_PUSH_ORDER) {
    const changed = collectChangedRows(entity, snapshot, meta.synced);
    if (changed.length) {
      await deps.repo.upsert(entity, changed);
      for (const row of changed as { id: string; updatedAt?: string }[]) {
        meta.synced[entity][row.id] = row.updatedAt ?? '';
      }
    }
  }
  await deps.repo.upsertStreak(snapshot.streak);

  meta = { ...meta, lastSyncedAt: now() };
  await deps.saveMeta(meta);
  return 'synced';
};
