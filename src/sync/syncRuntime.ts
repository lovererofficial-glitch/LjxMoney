import { useAuthStore } from '../auth/authStore.ts';
import { getSupabaseClient, isSupabaseConfigured } from '../lib/supabase.ts';
import { registerSyncDeletionListener, useFinanceStore } from '../store/financeStore.ts';
import { isApplyingSyncSnapshot } from '../store/financeStoreCore.ts';
import { loadSyncMeta, saveSyncMeta, updateSyncMeta } from './syncMetaStorage.ts';
import { runSyncCycle } from './syncEngine.ts';
import { createSupabaseSyncRepository } from './syncRepository.ts';
import { useSyncStatusStore } from './syncStatusStore.ts';
import { classifySyncError, type SyncEntity, type SyncSnapshot } from './syncTypes.ts';

const DEBOUNCE_MS = 2000;
const RETRY_MS = 30_000;
const DELETION_SYNC_DELAY_MS = 1000;

let started = false;
/** All sync work is serialized here: cycles and tombstone writes never race. */
let queue: Promise<unknown> = Promise.resolve();
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

const enqueue = (task: () => Promise<void>) => {
  queue = queue.then(task, task).catch((error) => {
    console.error('Queued sync task failed.', error);
  });
};

const readSnapshot = (): SyncSnapshot => {
  const state = useFinanceStore.getState();
  return {
    transactions: state.transactions,
    categories: state.categories,
    wallets: state.wallets,
    budgets: state.budgets,
    goals: state.goals,
    goalContributions: state.goalContributions,
    streak: state.streak,
  };
};

const scheduleSync = (delay: number) => {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    enqueue(runCycle);
  }, delay);
};

const runCycle = async () => {
  const status = useSyncStatusStore.getState();
  const auth = useAuthStore.getState();
  const userId = auth.user?.id ?? null;

  if (auth.status !== 'authenticated' || !userId) {
    status.setPhase('signed-out');
    return;
  }
  if (!isSupabaseConfigured || !getSupabaseClient()) {
    status.setPhase('idle');
    return;
  }
  if (!useFinanceStore.getState().hasHydrated) {
    // Never read or apply finance state before local hydration finishes.
    scheduleSync(500);
    return;
  }

  status.setPhase('syncing');
  const client = getSupabaseClient();
  if (!client) {
    return;
  }
  try {
    const result = await runSyncCycle({
      repo: createSupabaseSyncRepository(client, userId),
      getUserId: () => userId,
      loadMeta: loadSyncMeta,
      saveMeta: saveSyncMeta,
      getSnapshot: readSnapshot,
      applySnapshot: (snapshot) => useFinanceStore.getState().applySyncSnapshot(snapshot),
    });
    if (result === 'blocked') {
      status.setPhase('blocked');
      return;
    }
    const meta = await loadSyncMeta();
    status.setPhase('synced');
    status.setLastSyncedAt(meta.lastSyncedAt);
  } catch (error) {
    const kind = classifySyncError(error);
    status.setPhase(kind === 'offline' ? 'offline' : 'failed');
    console.error('Sync cycle failed.', error);
    scheduleSync(RETRY_MS);
  }
};

const recordDeletion = (entity: SyncEntity, id: string) => {
  enqueue(async () => {
    const userId = useAuthStore.getState().user?.id ?? null;
    if (!userId) {
      return;
    }
    await updateSyncMeta((meta) => {
      // Only the owning account records deletions; before the first sync
      // (owner unset) the row never reached the cloud, so no tombstone is
      // needed and local data stays local.
      if (!meta.ownerUserId || meta.ownerUserId !== userId) {
        return null;
      }
      if (meta.tombstones.some((item) => item.entity === entity && item.id === id)) {
        return null;
      }
      return {
        ...meta,
        tombstones: [...meta.tombstones, { entity, id, deletedAt: new Date().toISOString() }],
      };
    });
  });
  scheduleSync(DELETION_SYNC_DELAY_MS);
};

export const startSyncRuntime = () => {
  if (started) {
    return;
  }
  started = true;
  try {
    // Fire-and-forget: auth restore and sync never block the startup UI.
    void useAuthStore.getState().initialize();

    useAuthStore.subscribe((state, previous) => {
      if (state.status === 'authenticated' && previous.status !== 'authenticated') {
        scheduleSync(0);
      }
      if (state.status !== 'authenticated') {
        useSyncStatusStore.getState().setPhase('signed-out');
      }
    });

    useFinanceStore.subscribe(() => {
      // Cloud reconciliation writes back through applySyncSnapshot; those are
      // not user edits and must not schedule another cycle (sync echo).
      if (isApplyingSyncSnapshot()) {
        return;
      }
      scheduleSync(DEBOUNCE_MS);
    });

    registerSyncDeletionListener(recordDeletion);
    scheduleSync(1000);
  } catch (error) {
    console.error('Sync runtime failed to start.', error);
  }
};

export const requestSyncNow = () => {
  enqueue(runCycle);
};
