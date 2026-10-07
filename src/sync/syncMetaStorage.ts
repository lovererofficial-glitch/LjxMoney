import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  createEmptySynced,
  createEmptySyncMeta,
  type SyncEntity,
  type SyncMeta,
  type SyncTombstone,
} from './syncTypes.ts';

const LEGACY_SYNC_META_KEY = 'ljxmoney-sync-meta';
const SYNC_META_KEY_PREFIX = 'ljxmoney-sync-meta:';
const GUEST_SYNC_OWNER = 'guest';

/** Owner-scoped sync metadata key: each account tracks its own cloud markers. */
export const syncMetaKeyForOwner = (ownerId: string | null): string =>
  `${SYNC_META_KEY_PREFIX}${ownerId ?? GUEST_SYNC_OWNER}`;

/** Single-writer queue so concurrent read-modify-write never loses updates. */
let queue: Promise<unknown> = Promise.resolve();
const enqueue = <T>(task: () => Promise<T>): Promise<T> => {
  const result = queue.then(task, task);
  queue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
};

const isEntity = (value: unknown): value is SyncEntity =>
  value === 'wallets' ||
  value === 'categories' ||
  value === 'transactions' ||
  value === 'budgets' ||
  value === 'goals' ||
  value === 'goalContributions';

const sanitize = (value: unknown): SyncMeta => {
  const fallback = createEmptySyncMeta();
  if (typeof value !== 'object' || value === null) {
    return fallback;
  }
  const raw = value as Partial<SyncMeta>;
  if (raw.version !== 1) {
    return fallback;
  }
  const synced = createEmptySynced();
  if (typeof raw.synced === 'object' && raw.synced !== null) {
    for (const entity of Object.keys(synced) as SyncEntity[]) {
      const bucket = (raw.synced as Record<string, unknown>)[entity];
      if (typeof bucket === 'object' && bucket !== null) {
        for (const [id, updatedAt] of Object.entries(bucket)) {
          if (typeof updatedAt === 'string') {
            synced[entity][id] = updatedAt;
          }
        }
      }
    }
  }
  const tombstones: SyncTombstone[] = Array.isArray(raw.tombstones)
    ? raw.tombstones.filter(
        (item): item is SyncTombstone =>
          typeof item === 'object' &&
          item !== null &&
          isEntity((item as SyncTombstone).entity) &&
          typeof (item as SyncTombstone).id === 'string' &&
          typeof (item as SyncTombstone).deletedAt === 'string',
      )
    : [];
  return {
    version: 1,
    ownerUserId: typeof raw.ownerUserId === 'string' ? raw.ownerUserId : null,
    lastSyncedAt: typeof raw.lastSyncedAt === 'string' ? raw.lastSyncedAt : null,
    synced,
    tombstones,
  };
};

export const loadSyncMeta = (ownerId: string | null = null): Promise<SyncMeta> =>
  enqueue(async () => {
    try {
      const raw = await AsyncStorage.getItem(syncMetaKeyForOwner(ownerId));
      if (!raw && ownerId) {
        // First login after the guest era: inherit the shared markers once so
        // the first upload does not duplicate rows already pushed as guest.
        const legacyRaw = await AsyncStorage.getItem(LEGACY_SYNC_META_KEY);
        if (legacyRaw) {
          await AsyncStorage.setItem(syncMetaKeyForOwner(ownerId), legacyRaw);
          await AsyncStorage.removeItem(LEGACY_SYNC_META_KEY);
          return sanitize(JSON.parse(legacyRaw));
        }
      }
      if (!raw) {
        return createEmptySyncMeta();
      }
      return sanitize(JSON.parse(raw));
    } catch (error) {
      // Corrupt metadata must never brick sync: a fresh meta only causes
      // idempotent re-upserts; local data is untouched.
      console.error('Sync metadata could not be read; starting fresh.', error);
      return createEmptySyncMeta();
    }
  });

export const saveSyncMeta = (meta: SyncMeta, ownerId: string | null = null): Promise<void> =>
  enqueue(async () => {
    try {
      await AsyncStorage.setItem(syncMetaKeyForOwner(ownerId), JSON.stringify(meta));
    } catch (error) {
      console.error('Sync metadata could not be saved.', error);
    }
  });

/** Atomic read-modify-write used by the deletion listener. */
export const updateSyncMeta = (
  mutate: (meta: SyncMeta) => SyncMeta | null,
  ownerId: string | null = null,
): Promise<void> =>
  enqueue(async () => {
    try {
      const raw = await AsyncStorage.getItem(syncMetaKeyForOwner(ownerId));
      const current = raw ? sanitize(JSON.parse(raw)) : createEmptySyncMeta();
      const next = mutate(current);
      if (next) {
        await AsyncStorage.setItem(syncMetaKeyForOwner(ownerId), JSON.stringify(next));
      }
    } catch (error) {
      console.error('Sync metadata could not be updated.', error);
    }
  });
