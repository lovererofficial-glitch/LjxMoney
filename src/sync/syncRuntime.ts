import { useAuthStore } from '../auth/authStore.ts';
import { getSupabaseClient, isSupabaseConfigured } from '../lib/supabase.ts';
import {
  registerSyncDeletionListener,
  useFinanceStore,
} from '../store/financeStore.ts';
import { isApplyingSyncSnapshot } from '../store/financeStoreCore.ts';
import { loadSyncMeta, saveSyncMeta, updateSyncMeta } from './syncMetaStorage.ts';
import { runSyncCycle } from './syncEngine.ts';
import { createSupabaseSyncRepository } from './syncRepository.ts';
import { useSyncStatusStore } from './syncStatusStore.ts';
import { classifySyncError, type SyncEntity, type SyncSnapshot } from './syncTypes.ts';
import {
  useWalletQrStore,
  walletQrNeedsRemoteRestore,
  walletQrWasRemovedRemotely,
} from '../wallets/walletQrStore.ts';
import {
  deleteWalletQrFromCloud,
  downloadWalletQr,
  isWalletQrFileAvailable,
  pruneWalletQrVersions,
  removeLocalWalletQr,
  uploadWalletQr,
} from '../wallets/walletQrAssets.ts';

const DEBOUNCE_MS = 2000;
const RETRY_MS = 30_000;
const DELETION_SYNC_DELAY_MS = 1000;

let started = false;
/** All sync work is serialized here: cycles and tombstone writes never race. */
let queue: Promise<unknown> = Promise.resolve();
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
/**
 * Monotonic sync generation. Every login/logout bumps it; a cycle captured
 * under user A that finishes after B logs in must not apply A's snapshot
 * (or A's meta) into B's state.
 */
let syncGeneration = 0;

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
  const generation = syncGeneration;
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    enqueue(() => runCycle(generation));
  }, delay);
};

/**
 * Keep the surfaced detail debuggable but free of credentials: Supabase
 * errors carry message/code/details/hint (already logged with context in
 * the repository layer). Session tokens are never part of that shape.
 */
const MAX_DETAIL_LENGTH = 500;

const toErrorDetail = (error: unknown): string => {
  const raw = error instanceof Error ? error.message : String(error);
  const cleaned = raw.replace(/\s+/g, ' ').trim();
  const safe = cleaned.length > MAX_DETAIL_LENGTH ? `${cleaned.slice(0, MAX_DETAIL_LENGTH)}…` : cleaned;
  return safe || 'Unknown sync error';
};

const syncWalletQrAssets = async (userId: string, isStale: () => boolean) => {
  const qrStore = useWalletQrStore.getState();
  const wallets = useFinanceStore.getState().wallets;
  let retryNeeded = false;

  for (const wallet of wallets) {
    if (isStale() || useAuthStore.getState().user?.id !== userId) {
      return false;
    }
    if (!(await qrStore.hasPendingQrDeletion(userId, wallet.id))) {
      continue;
    }
    try {
      await deleteWalletQrFromCloud(userId, wallet.id);
      if (!isStale() && useAuthStore.getState().user?.id === userId) {
        await qrStore.clearPendingQrDeletion(userId, wallet.id);
      }
    } catch {
      retryNeeded = true;
    }
  }

  for (const wallet of wallets) {
    if (isStale() || useAuthStore.getState().user?.id !== userId) {
      return false;
    }
    let localUri = await qrStore.hydrateWalletQr(userId, wallet.id);
    if (localUri && !isWalletQrFileAvailable(localUri)) {
      await qrStore.clearQrForWallet(userId, wallet.id);
      localUri = null;
    }
    let uploadPending = await qrStore.hasPendingQrUpload(userId, wallet.id);
    if (uploadPending && !localUri) {
      await qrStore.clearPendingQrUpload(userId, wallet.id);
      uploadPending = false;
    }

    let localCloudPath = await qrStore.getQrCloudPath(userId, wallet.id);
    if (walletQrWasRemovedRemotely(wallet.paymentQrPath, localCloudPath, uploadPending)) {
      if (localUri) {
        removeLocalWalletQr(userId, wallet.id, localUri);
      }
      await qrStore.clearQrForWallet(userId, wallet.id);
      localUri = null;
      localCloudPath = null;
    }
    if (walletQrNeedsRemoteRestore(wallet.paymentQrPath, localUri, localCloudPath, uploadPending)) {
      try {
        const downloadedUri = await downloadWalletQr(userId, wallet.id, wallet.paymentQrPath!);
        if (!isStale() && useAuthStore.getState().user?.id === userId) {
          await qrStore.setQrForWallet(userId, wallet.id, downloadedUri);
          await qrStore.setQrCloudPath(userId, wallet.id, wallet.paymentQrPath!);
          localCloudPath = wallet.paymentQrPath!;
          if (localUri && localUri !== downloadedUri) {
            removeLocalWalletQr(userId, wallet.id, localUri);
          }
          localUri = downloadedUri;
        }
      } catch {
        retryNeeded = true;
      }
    }

    if (localUri && (uploadPending || (!wallet.paymentQrPath && !localCloudPath))) {
      try {
        const paymentQrPath = await uploadWalletQr(userId, wallet.id, localUri);
        if (isStale() || useAuthStore.getState().user?.id !== userId) {
          return false;
        }
        const currentWallet = useFinanceStore.getState().wallets.find((item) => item.id === wallet.id);
        if (currentWallet && currentWallet.paymentQrPath !== paymentQrPath) {
          useFinanceStore.getState().updateWallet(wallet.id, { paymentQrPath });
        }
        await qrStore.setQrCloudPath(userId, wallet.id, paymentQrPath);
        await qrStore.clearPendingQrUpload(userId, wallet.id);
      } catch {
        retryNeeded = true;
      }
    }

    if (wallet.paymentQrPath && !uploadPending && localCloudPath === wallet.paymentQrPath) {
      try {
        await pruneWalletQrVersions(userId, wallet.id, wallet.paymentQrPath);
      } catch {
        retryNeeded = true;
      }
    }
  }

  return retryNeeded;
};

const runCycle = async (generation: number) => {
  const status = useSyncStatusStore.getState();
  const auth = useAuthStore.getState();
  const userId = auth.user?.id ?? null;

  const isStale = () => generation !== syncGeneration;

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
      loadMeta: () => loadSyncMeta(userId),
      saveMeta: (meta) => saveSyncMeta(meta, userId),
      getSnapshot: readSnapshot,
      applySnapshot: (snapshot) => {
        // Race guard: A's in-flight cycle must never write into B's memory.
        if (isStale()) {
          return;
        }
        const currentUserId = useAuthStore.getState().user?.id ?? null;
        if (currentUserId !== userId) {
          return;
        }
        useFinanceStore.getState().applySyncSnapshot(snapshot);
      },
    });
    if (isStale()) {
      return;
    }
    if (result === 'blocked') {
      status.setPhase('blocked');
      return;
    }
    const qrRetryNeeded = await syncWalletQrAssets(userId, isStale);
    if (isStale()) {
      return;
    }
    if (qrRetryNeeded) {
      scheduleSync(RETRY_MS);
    }
    const meta = await loadSyncMeta(userId);
    if (isStale()) {
      return;
    }
    status.setPhase('synced');
    status.setErrorDetail(null);
    status.setLastSyncedAt(meta.lastSyncedAt);
  } catch (error) {
    if (isStale()) {
      return;
    }
    const kind = classifySyncError(error);
    status.setPhase(kind === 'offline' ? 'offline' : 'failed');
    status.setErrorDetail(kind === 'failed' ? toErrorDetail(error) : null);
    console.error('Sync cycle failed.', error);
    scheduleSync(RETRY_MS);
  }
};

const recordDeletion = (entity: SyncEntity, id: string) => {
  const userId = useAuthStore.getState().user?.id ?? null;
  if (!userId) {
    return;
  }
  enqueue(async () => {
    // Owner is captured at delete time: A's offline delete must not write a
    // tombstone into B's metadata if the account switches before the flush.
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
    }, userId);
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
      const wasAuthenticated = previous.status === 'authenticated';
      const isAuthenticated = state.status === 'authenticated';
      const userChanged = state.user?.id !== previous.user?.id;
      if (isAuthenticated && (!wasAuthenticated || userChanged)) {
        // New account (or re-login): stale cycles/retries from the previous
        // owner are invalidated; the fresh generation re-syncs for this user.
        syncGeneration += 1;
        const status = useSyncStatusStore.getState();
        status.setErrorDetail(null);
        status.setLastSyncedAt(null);
        scheduleSync(0);
      }
      if (!isAuthenticated) {
        // Logout: invalidate anything in flight and drop the signed-out view.
        syncGeneration += 1;
        if (debounceTimer) {
          clearTimeout(debounceTimer);
          debounceTimer = null;
        }
        const status = useSyncStatusStore.getState();
        status.setErrorDetail(null);
        status.setLastSyncedAt(null);
        status.setPhase('signed-out');
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
  const generation = syncGeneration;
  enqueue(() => runCycle(generation));
};
