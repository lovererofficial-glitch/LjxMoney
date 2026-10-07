import type {
  Budget,
  Category,
  GoalContribution,
  SavingsGoal,
  StreakState,
  Transaction,
  Wallet,
} from '../features/finance/models';

/** Entities synced by id with last-write-wins (streak is merged separately). */
export type SyncEntity =
  | 'wallets'
  | 'categories'
  | 'transactions'
  | 'budgets'
  | 'goals'
  | 'goalContributions';

export const SYNC_ENTITIES: SyncEntity[] = [
  'wallets',
  'categories',
  'transactions',
  'budgets',
  'goals',
  'goalContributions',
];

/** Push order respects foreign keys: parents before children. */
export const SYNC_PUSH_ORDER: SyncEntity[] = [
  'wallets',
  'categories',
  'transactions',
  'budgets',
  'goals',
  'goalContributions',
];

export interface SyncSnapshot {
  wallets: Wallet[];
  categories: Category[];
  transactions: Transaction[];
  budgets: Budget[];
  goals: SavingsGoal[];
  goalContributions: GoalContribution[];
  streak: StreakState;
}

export interface SyncCloudSnapshot {
  wallets: Wallet[];
  categories: Category[];
  transactions: Transaction[];
  budgets: Budget[];
  goals: SavingsGoal[];
  goalContributions: GoalContribution[];
  streak: (StreakState & { updatedAt: string }) | null;
}

export interface SyncTombstone {
  entity: SyncEntity;
  id: string;
  deletedAt: string;
}

export interface SyncMeta {
  version: 1;
  /** Local data becomes bound to the first account that syncs it. */
  ownerUserId: string | null;
  lastSyncedAt: string | null;
  /** entity -> id -> updatedAt last observed on the cloud. */
  synced: Record<SyncEntity, Record<string, string>>;
  tombstones: SyncTombstone[];
}

export interface SyncRepository {
  fetchAll(): Promise<SyncCloudSnapshot>;
  upsert<E extends SyncEntity>(entity: E, rows: SyncSnapshot[E]): Promise<void>;
  remove(entity: SyncEntity, ids: string[]): Promise<void>;
  upsertStreak(streak: StreakState): Promise<void>;
}

export const createEmptySynced = (): Record<SyncEntity, Record<string, string>> => ({
  wallets: {},
  categories: {},
  transactions: {},
  budgets: {},
  goals: {},
  goalContributions: {},
});

export const createEmptySyncMeta = (): SyncMeta => ({
  version: 1,
  ownerUserId: null,
  lastSyncedAt: null,
  synced: createEmptySynced(),
  tombstones: [],
});

export type SyncCycleResult = 'synced' | 'blocked';
export type SyncErrorKind = 'offline' | 'failed';

export const isNetworkError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error);
  return /network request failed|fetch failed|failed to fetch|load failed|timed? ?out|socket/i.test(
    message,
  );
};

export const classifySyncError = (error: unknown): SyncErrorKind =>
  isNetworkError(error) ? 'offline' : 'failed';
