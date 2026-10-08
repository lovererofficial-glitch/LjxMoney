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

export const migrateFinanceState = (persistedState: unknown): PersistedFinanceData => {
  const persisted =
    typeof persistedState === 'object' && persistedState !== null
      ? (persistedState as Partial<PersistedFinanceData>)
      : {};
  const previousStreak = persisted.streak;

  return {
    transactions: persisted.transactions ?? [],
    categories: persisted.categories?.map(normalizeCategory) ?? defaultCategories,
    wallets: persisted.wallets?.map(normalizeWallet) ?? defaultWallets,
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
