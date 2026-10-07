import { create } from 'zustand';

export type SyncPhase =
  | 'signed-out'
  | 'idle'
  | 'syncing'
  | 'synced'
  | 'offline'
  | 'failed'
  | 'blocked';

interface SyncStatusState {
  phase: SyncPhase;
  lastSyncedAt: string | null;
  setPhase: (phase: SyncPhase) => void;
  setLastSyncedAt: (lastSyncedAt: string | null) => void;
}

export const useSyncStatusStore = create<SyncStatusState>((set) => ({
  phase: 'signed-out',
  lastSyncedAt: null,
  setPhase: (phase) => set({ phase }),
  setLastSyncedAt: (lastSyncedAt) => set({ lastSyncedAt }),
}));
