import { defaultCategories, defaultWallets } from '../data/catalogs.ts';
import type {
  Budget,
  Category,
  GoalContribution,
  SavingsGoal,
  StreakState,
  Transaction,
  Wallet,
} from '../features/finance/models';

export interface PersistedFinanceData {
  transactions: Transaction[];
  categories: Category[];
  wallets: Wallet[];
  budgets: Budget[];
  goals: SavingsGoal[];
  goalContributions: GoalContribution[];
  streak: StreakState;
}

export const normalizeWallet = (wallet: Wallet): Wallet => ({
  ...wallet,
  id: wallet.id || `wallet-${Date.now()}`,
  name: wallet.name || 'Wallet',
  color: wallet.color || '#D7B56D',
  type: wallet.type || 'cash',
  initialBalance: Number.isSafeInteger(wallet.initialBalance) ? wallet.initialBalance : 0,
  icon: wallet.icon ?? 'wallet',
  paymentQrPath: wallet.paymentQrPath ?? null,
  archivedAt: wallet.archivedAt ?? null,
  createdAt: wallet.createdAt ?? new Date().toISOString(),
  updatedAt: wallet.updatedAt ?? new Date().toISOString(),
});

export const normalizeCategory = (category: Category): Category => ({
  ...category,
  id: category.id || `category-${Date.now()}`,
  name: category.name || 'Category',
  color: category.color || '#D7B56D',
  type: category.type || 'expense',
  icon: category.icon ?? 'tag',
  archivedAt: category.archivedAt ?? null,
  createdAt: category.createdAt ?? new Date().toISOString(),
  updatedAt: category.updatedAt ?? new Date().toISOString(),
});

export const pruneEmptyLegacyWalletSeeds = (rawSnapshot: string): string => {
  try {
    const parsed: unknown = JSON.parse(rawSnapshot);
    if (typeof parsed !== 'object' || parsed === null) {
      return rawSnapshot;
    }
    const envelope = parsed as Record<string, unknown>;
    const hasEnvelopeState = typeof envelope.state === 'object' && envelope.state !== null;
    const state = (hasEnvelopeState ? envelope.state : envelope) as Record<string, unknown>;
    if (!Array.isArray(state.wallets)) {
      return rawSnapshot;
    }
    const transactions = Array.isArray(state.transactions) ? state.transactions : [];
    const seedIds = new Set(defaultWallets.map((wallet) => wallet.id));
    const wallets = state.wallets.filter((value) => {
      if (typeof value !== 'object' || value === null) {
        return true;
      }
      const wallet = value as Record<string, unknown>;
      const id = typeof wallet.id === 'string' ? wallet.id : '';
      if (!seedIds.has(id)) {
        return true;
      }
      const referenced = transactions.some((item) => {
        if (typeof item !== 'object' || item === null) {
          return false;
        }
        const transaction = item as Record<string, unknown>;
        return transaction.walletId === id ||
          transaction.sourceWalletId === id ||
          transaction.destinationWalletId === id;
      });
      const hasQr = typeof wallet.paymentQrPath === 'string' && wallet.paymentQrPath.length > 0;
      return referenced || wallet.initialBalance !== 0 || hasQr;
    });
    const nextState = { ...state, wallets };
    return JSON.stringify(hasEnvelopeState ? { ...envelope, state: nextState } : nextState);
  } catch {
    return rawSnapshot;
  }
};

export const migrateFinanceState = (persistedState: unknown): PersistedFinanceData => {
  const persisted =
    typeof persistedState === 'object' && persistedState !== null
      ? (persistedState as Partial<PersistedFinanceData>)
      : {};
  const previousStreak = persisted.streak;

  return {
    transactions: persisted.transactions ?? [],
    categories: persisted.categories?.map(normalizeCategory) ?? defaultCategories,
    wallets: persisted.wallets?.map(normalizeWallet) ?? [],
    budgets: persisted.budgets ?? [],
    goals: persisted.goals ?? [],
    goalContributions: persisted.goalContributions ?? [],
    streak: previousStreak
      ? {
          completionDates: previousStreak.completionDates ?? [],
          manualCompletionDates:
            previousStreak.manualCompletionDates ?? previousStreak.completionDates ?? [],
          longestStreak: previousStreak.longestStreak ?? 0,
        }
      : { completionDates: [], manualCompletionDates: [], longestStreak: 0 },
  };
};
