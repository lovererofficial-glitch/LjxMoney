import { format, isValid, parseISO } from 'date-fns';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { StateStorage } from 'zustand/middleware';

import {
  defaultCategories,
  defaultWallets,
  legacyCategories,
  legacyWallets,
} from '../data/catalogs.ts';
import {
  migrateFinanceState,
  normalizeCategory,
  normalizeWallet,
} from './financeMigration.ts';
import {
  addStreakCompletion,
  calculateExpense,
  calculateIncome,
  calculateWalletBalanceAt,
  recalculateBalances,
  syncStreakWithTransactions,
} from '../features/finance/financeEngine.ts';
import type {
  Budget,
  Category,
  DailyBalance,
  GoalContribution,
  SavingsGoal,
  StreakState,
  Transaction,
  Wallet,
} from '../features/finance/models';
import type { SyncSnapshot } from '../sync/syncTypes';

export type SyncDeletionListener = (entity: 'transactions' | 'goalContributions', id: string) => void;

const syncDeletionListeners = new Set<SyncDeletionListener>();

let applyingSyncSnapshot = false;

/** True while applySyncSnapshot writes; lets sync runtime skip re-scheduling. */
export const isApplyingSyncSnapshot = (): boolean => applyingSyncSnapshot;

/** Sync runtime observes hard deletions so cloud rows are removed too. */
export const registerSyncDeletionListener = (listener: SyncDeletionListener): (() => void) => {
  syncDeletionListeners.add(listener);
  return () => {
    syncDeletionListeners.delete(listener);
  };
};

const notifySyncDeletion = (entity: 'transactions' | 'goalContributions', id: string) => {
  for (const listener of syncDeletionListeners) {
    try {
      listener(entity, id);
    } catch (error) {
      console.error('Sync deletion listener failed.', error);
    }
  }
};

const emptyStreak: StreakState = {
  completionDates: [],
  manualCompletionDates: [],
  longestStreak: 0,
};

interface FinanceState {
  transactions: Transaction[];
  balances: DailyBalance[];
  categories: Category[];
  wallets: Wallet[];
  budgets: Budget[];
  goals: SavingsGoal[];
  goalContributions: GoalContribution[];
  streak: StreakState;
  hasHydrated: boolean;
  hydrationError: string | null;
  addTransaction: (transaction: Transaction) => void;
  updateTransaction: (transactionId: string, updates: Partial<Transaction>) => void;
  deleteTransaction: (transactionId: string) => void;
  addWallet: (wallet: Wallet) => void;
  updateWallet: (walletId: string, updates: Partial<Wallet>) => void;
  archiveWallet: (walletId: string) => void;
  restoreWallet: (walletId: string) => void;
  addCategory: (category: Category) => void;
  updateCategory: (categoryId: string, updates: Partial<Category>) => void;
  archiveCategory: (categoryId: string) => void;
  addBudget: (budget: Budget) => void;
  updateBudget: (budgetId: string, updates: Partial<Budget>) => void;
  archiveBudget: (budgetId: string) => void;
  addGoal: (goal: SavingsGoal) => void;
  updateGoal: (goalId: string, updates: Partial<SavingsGoal>) => void;
  archiveGoal: (goalId: string) => void;
  addGoalContribution: (contribution: GoalContribution) => void;
  updateGoalContribution: (contributionId: string, updates: Partial<GoalContribution>) => void;
  deleteGoalContribution: (contributionId: string) => void;
  checkToday: (date?: string) => void;
  setHydrationResult: (error: unknown) => void;
  /** Replace state with a reconciled cloud snapshot (no-op when unchanged). */
  applySyncSnapshot: (snapshot: SyncSnapshot) => void;
  /**
   * Drop the active owner's rows from memory for account switching/logout.
   * Persisted per-owner data is untouched; only the live view resets.
   */
  resetForOwnerSwitch: () => void;
}

const isValidTransactionDate = (date: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return false;
  }

  const parsed = parseISO(date);
  return isValid(parsed) && format(parsed, 'yyyy-MM-dd') === date;
};

const validateTransaction = (
  transaction: Transaction,
  categories: Category[],
  wallets: Wallet[],
  transactions: Transaction[],
  allowArchivedWallets = false,
) => {
  if (!Number.isSafeInteger(transaction.amount) || transaction.amount <= 0) {
    throw new Error('Amount must be a positive whole number of VND.');
  }
  if (!isValidTransactionDate(transaction.date)) {
    throw new Error('Enter a valid transaction date.');
  }
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(transaction.time)) {
    throw new Error('Enter a valid transaction time.');
  }

  if (transaction.type === 'transfer') {
    const sourceWallet = wallets.find((wallet) => wallet.id === transaction.sourceWalletId);
    const destinationWallet = wallets.find((wallet) => wallet.id === transaction.destinationWalletId);
    if (
      !sourceWallet ||
      !destinationWallet ||
      sourceWallet.archivedAt ||
      destinationWallet.archivedAt
    ) {
      throw new Error('Choose valid source and destination wallets for the transfer.');
    }
    if (transaction.sourceWalletId === transaction.destinationWalletId) {
      throw new Error('Transfer source and destination must be different wallets.');
    }
    if (
      transaction.amount >
      calculateWalletBalanceAt(
        sourceWallet.id,
        transactions,
        wallets,
        transaction.date,
        transaction.time,
      )
    ) {
      throw new Error('Insufficient balance in source wallet.');
    }
    return;
  }

  const wallet = wallets.find((item) => item.id === transaction.walletId);
  if (!wallet || (!allowArchivedWallets && wallet.archivedAt)) {
    throw new Error('Choose a valid wallet.');
  }
  if (transaction.type === 'adjustment') {
    if (
      transaction.adjustmentDirection !== undefined &&
      transaction.adjustmentDirection !== 'increase' &&
      transaction.adjustmentDirection !== 'decrease'
    ) {
      throw new Error('Choose a valid balance adjustment direction.');
    }
    return;
  }
  const category = categories.find((item) => item.id === transaction.categoryId);
  if (!category) {
    throw new Error('Choose a valid category.');
  }
  if (
    (transaction.type === 'income' || transaction.type === 'expense') &&
    category.type !== transaction.type
  ) {
    throw new Error('Choose a category that matches the transaction type.');
  }
};

const calculateBalances = (transactions: Transaction[], wallets: Wallet[]) =>
  recalculateBalances(
    transactions,
    wallets.reduce((total, wallet) => total + wallet.initialBalance, 0),
  );

const validateWalletName = (name: string, wallets: Wallet[], excludedId?: string) => {
  const normalizedName = name.trim().toLocaleLowerCase();
  if (!normalizedName) {
    throw new Error('Enter a wallet name.');
  }
  if (wallets.some((wallet) => wallet.id !== excludedId && wallet.name.trim().toLocaleLowerCase() === normalizedName)) {
    throw new Error('A wallet with this name already exists.');
  }
};

const normalizeWalletTimestamp = (timestamp: string | undefined, fallback: string) => {
  if (!timestamp || !Number.isFinite(Date.parse(timestamp))) {
    return fallback;
  }
  return new Date(timestamp).toISOString();
};

const validateBudget = (budget: Budget, categories: Category[]) => {
  if (!budget.name.trim()) {
    throw new Error('Enter a budget name.');
  }
  if (!Number.isSafeInteger(budget.amount) || budget.amount <= 0) {
    throw new Error('Budget amount must be a positive whole number of VND.');
  }
  const category = categories.find((item) => item.id === budget.categoryId);
  if (!category || category.type !== 'expense') {
    throw new Error('Choose a valid expense category for this budget.');
  }
  if (!isValidTransactionDate(budget.startDate) || !isValidTransactionDate(budget.endDate)) {
    throw new Error('Choose valid budget dates.');
  }
  if (budget.endDate < budget.startDate) {
    throw new Error('Budget end date must be on or after its start date.');
  }
};

const validateGoal = (goal: SavingsGoal) => {
  if (!goal.name.trim()) {
    throw new Error('Enter a goal name.');
  }
  if (!Number.isSafeInteger(goal.targetAmount) || goal.targetAmount <= 0) {
    throw new Error('Goal target must be a positive whole number of VND.');
  }
  if (goal.deadline && !isValidTransactionDate(goal.deadline)) {
    throw new Error('Enter a valid goal deadline.');
  }
};

const validateContribution = (contribution: GoalContribution) => {
  if (!Number.isSafeInteger(contribution.amount) || contribution.amount < 0) {
    throw new Error('Contribution must be a non-negative whole number of VND.');
  }
  if (!isValidTransactionDate(contribution.date)) {
    throw new Error('Enter a valid contribution date.');
  }
};

export const createFinanceStore = (storage: StateStorage) =>
  create<FinanceState>()(
  persist(
    (set, get) => ({
      transactions: [],
      balances: [],
      categories: defaultCategories,
      wallets: defaultWallets,
      budgets: [],
      goals: [],
      goalContributions: [],
      streak: emptyStreak,
      hasHydrated: false,
      hydrationError: null,
      addTransaction: (transaction) => {
        const state = get();
        validateTransaction(transaction, state.categories, state.wallets, state.transactions);
        if (state.transactions.some((item) => item.id === transaction.id)) {
          throw new Error('A transaction with this ID already exists.');
        }
        const transactions = [...state.transactions, transaction];
        set({
          transactions,
          balances: calculateBalances(transactions, state.wallets),
          streak: syncStreakWithTransactions(state.streak, transactions),
        });
      },
      updateTransaction: (transactionId, updates) => {
        const state = get();
        const existing = state.transactions.find((item) => item.id === transactionId);
        if (!existing) {
          throw new Error('This transaction no longer exists.');
        }

        const updated: Transaction = {
          ...existing,
          ...updates,
          id: existing.id,
          createdAt: existing.createdAt,
          updatedAt: new Date().toISOString(),
        };
        validateTransaction(
          updated,
          state.categories,
          state.wallets,
          state.transactions.filter((item) => item.id !== existing.id),
          true,
        );
        const transactions = state.transactions.map((item) =>
          item.id === transactionId ? updated : item,
        );
        set({
          transactions,
          balances: calculateBalances(transactions, state.wallets),
          streak: syncStreakWithTransactions(state.streak, transactions),
        });
      },
      deleteTransaction: (transactionId) => {
        const state = get();
        if (!state.transactions.some((item) => item.id === transactionId)) {
          throw new Error('This transaction no longer exists.');
        }
        const transactions = state.transactions.filter((item) => item.id !== transactionId);
        set({
          transactions,
          balances: calculateBalances(transactions, state.wallets),
          streak: syncStreakWithTransactions(state.streak, transactions),
        });
        notifySyncDeletion('transactions', transactionId);
      },
      addWallet: (wallet) => {
        const state = get();
        const now = new Date().toISOString();
        validateWalletName(wallet.name, state.wallets);
        const normalized = normalizeWallet({
          ...wallet,
          name: wallet.name.trim(),
          createdAt: normalizeWalletTimestamp(wallet.createdAt, now),
          updatedAt: normalizeWalletTimestamp(wallet.updatedAt, now),
        });
        if (state.wallets.some((item) => item.id === normalized.id)) {
          throw new Error('A wallet with this ID already exists.');
        }
        const wallets = [...state.wallets, normalized];
        set({ wallets, balances: calculateBalances(state.transactions, wallets) });
      },
      updateWallet: (walletId, updates) => {
        const state = get();
        const existing = state.wallets.find((wallet) => wallet.id === walletId);
        if (!existing) {
          throw new Error('This wallet no longer exists.');
        }
        const name = updates.name === undefined ? existing.name : updates.name.trim();
        validateWalletName(name, state.wallets, walletId);
        const updated = normalizeWallet({
          ...existing,
          ...updates,
          name,
          createdAt: normalizeWalletTimestamp(existing.createdAt, new Date().toISOString()),
          updatedAt: new Date().toISOString(),
        });
        const wallets = state.wallets.map((wallet) => (wallet.id === walletId ? updated : wallet));
        set({ wallets, balances: calculateBalances(state.transactions, wallets) });
      },
      archiveWallet: (walletId) => {
        const state = get();
        const existing = state.wallets.find((wallet) => wallet.id === walletId);
        if (!existing) {
          throw new Error('This wallet no longer exists.');
        }
        const now = new Date().toISOString();
        set({
          wallets: state.wallets.map((wallet) =>
            wallet.id === walletId
              ? { ...wallet, archivedAt: now, updatedAt: now }
              : wallet,
          ),
          balances: calculateBalances(state.transactions, state.wallets),
        });
      },
      restoreWallet: (walletId) => {
        const state = get();
        const existing = state.wallets.find((wallet) => wallet.id === walletId);
        if (!existing) {
          throw new Error('This wallet no longer exists.');
        }
        const now = new Date().toISOString();
        set({
          wallets: state.wallets.map((wallet) =>
            wallet.id === walletId ? { ...wallet, archivedAt: null, updatedAt: now } : wallet,
          ),
        });
      },
      addCategory: (category) => {
        const state = get();
        const normalized = normalizeCategory(category);
        if (state.categories.some((item) => item.id === normalized.id)) {
          throw new Error('A category with this ID already exists.');
        }
        set({ categories: [...state.categories, normalized] });
      },
      updateCategory: (categoryId, updates) => {
        const state = get();
        const existing = state.categories.find((category) => category.id === categoryId);
        if (!existing) {
          throw new Error('This category no longer exists.');
        }
        if (
          updates.type &&
          updates.type !== existing.type &&
          state.transactions.some((transaction) => transaction.categoryId === categoryId)
        ) {
          throw new Error('A category used by transactions cannot change its type.');
        }
        const updated = normalizeCategory({
          ...existing,
          ...updates,
          updatedAt: new Date().toISOString(),
        });
        set({
          categories: state.categories.map((category) =>
            category.id === categoryId ? updated : category,
          ),
        });
      },
      archiveCategory: (categoryId) => {
        const state = get();
        const existing = state.categories.find((category) => category.id === categoryId);
        if (!existing) {
          throw new Error('This category no longer exists.');
        }
        set({
          categories: state.categories.map((category) =>
            category.id === categoryId
              ? { ...category, archivedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
              : category,
          ),
        });
      },
      addBudget: (budget) => {
        const state = get();
        const normalized: Budget = {
          ...budget,
          name: budget.name.trim(),
          archivedAt: budget.archivedAt ?? null,
          createdAt: budget.createdAt ?? new Date().toISOString(),
          updatedAt: budget.updatedAt ?? new Date().toISOString(),
        };
        validateBudget(normalized, state.categories);
        if (state.budgets.some((item) => item.id === normalized.id)) {
          throw new Error('A budget with this ID already exists.');
        }
        set({ budgets: [...state.budgets, normalized] });
      },
      updateBudget: (budgetId, updates) => {
        const state = get();
        const existing = state.budgets.find((budget) => budget.id === budgetId);
        if (!existing) {
          throw new Error('This budget no longer exists.');
        }
        const updated = {
          ...existing,
          ...updates,
          id: existing.id,
          createdAt: existing.createdAt,
          updatedAt: new Date().toISOString(),
        };
        validateBudget(updated, state.categories);
        set({
          budgets: state.budgets.map((budget) => (budget.id === budgetId ? updated : budget)),
        });
      },
      archiveBudget: (budgetId) => {
        const state = get();
        if (!state.budgets.some((budget) => budget.id === budgetId)) {
          throw new Error('This budget no longer exists.');
        }
        const archivedAt = new Date().toISOString();
        set({
          budgets: state.budgets.map((budget) =>
            budget.id === budgetId ? { ...budget, archivedAt, updatedAt: archivedAt } : budget,
          ),
        });
      },
      addGoal: (goal) => {
        const state = get();
        const normalized: SavingsGoal = {
          ...goal,
          name: goal.name.trim(),
          note: goal.note ?? '',
          deadline: goal.deadline ?? null,
          archivedAt: goal.archivedAt ?? null,
          createdAt: goal.createdAt ?? new Date().toISOString(),
          updatedAt: goal.updatedAt ?? new Date().toISOString(),
        };
        validateGoal(normalized);
        if (state.goals.some((item) => item.id === normalized.id)) {
          throw new Error('A goal with this ID already exists.');
        }
        set({ goals: [...state.goals, normalized] });
      },
      updateGoal: (goalId, updates) => {
        const state = get();
        const existing = state.goals.find((goal) => goal.id === goalId);
        if (!existing) {
          throw new Error('This goal no longer exists.');
        }
        const updated = {
          ...existing,
          ...updates,
          id: existing.id,
          createdAt: existing.createdAt,
          updatedAt: new Date().toISOString(),
        };
        validateGoal(updated);
        set({ goals: state.goals.map((goal) => (goal.id === goalId ? updated : goal)) });
      },
      archiveGoal: (goalId) => {
        const state = get();
        if (!state.goals.some((goal) => goal.id === goalId)) {
          throw new Error('This goal no longer exists.');
        }
        const archivedAt = new Date().toISOString();
        set({
          goals: state.goals.map((goal) =>
            goal.id === goalId ? { ...goal, archivedAt, updatedAt: archivedAt } : goal,
          ),
        });
      },
      addGoalContribution: (contribution) => {
        const state = get();
        if (!state.goals.some((goal) => goal.id === contribution.goalId)) {
          throw new Error('Choose a valid savings goal.');
        }
        validateContribution(contribution);
        if (state.goalContributions.some((item) => item.id === contribution.id)) {
          throw new Error('A contribution with this ID already exists.');
        }
        set({
          goalContributions: [
            ...state.goalContributions,
            { ...contribution, note: contribution.note.trim() },
          ],
        });
      },
      updateGoalContribution: (contributionId, updates) => {
        const state = get();
        const existing = state.goalContributions.find((item) => item.id === contributionId);
        if (!existing) {
          throw new Error('This contribution no longer exists.');
        }
        const updated = {
          ...existing,
          ...updates,
          id: existing.id,
          goalId: existing.goalId,
          createdAt: existing.createdAt,
          updatedAt: new Date().toISOString(),
        };
        validateContribution(updated);
        set({
          goalContributions: state.goalContributions.map((item) =>
            item.id === contributionId ? { ...updated, note: updated.note.trim() } : item,
          ),
        });
      },
      deleteGoalContribution: (contributionId) => {
        const state = get();
        if (!state.goalContributions.some((item) => item.id === contributionId)) {
          throw new Error('This contribution no longer exists.');
        }
        set({
          goalContributions: state.goalContributions.filter((item) => item.id !== contributionId),
        });
        notifySyncDeletion('goalContributions', contributionId);
      },
      checkToday: (date = format(new Date(), 'yyyy-MM-dd')) => {
        if (!isValidTransactionDate(date)) {
          throw new Error('Choose a valid check-in date.');
        }
        set((state) => ({ streak: addStreakCompletion(state.streak, date) }));
      },
      applySyncSnapshot: (snapshot) => {
        const state = get();
        const nextStreak = syncStreakWithTransactions(snapshot.streak, snapshot.transactions);
        const unchanged =
          state.transactions === snapshot.transactions ||
          (JSON.stringify(state.transactions) === JSON.stringify(snapshot.transactions) &&
            JSON.stringify(state.categories) === JSON.stringify(snapshot.categories) &&
            JSON.stringify(state.wallets) === JSON.stringify(snapshot.wallets) &&
            JSON.stringify(state.budgets) === JSON.stringify(snapshot.budgets) &&
            JSON.stringify(state.goals) === JSON.stringify(snapshot.goals) &&
            JSON.stringify(state.goalContributions) === JSON.stringify(snapshot.goalContributions) &&
            JSON.stringify(state.streak) === JSON.stringify(nextStreak));
        if (unchanged) {
          return;
        }
        // Throws on invalid data: the sync cycle must abort before persisting
        // sync markers, otherwise un-applied cloud rows would be skipped.
        applyingSyncSnapshot = true;
        try {
          set({
            transactions: snapshot.transactions,
            categories: snapshot.categories,
            wallets: snapshot.wallets,
            budgets: snapshot.budgets,
            goals: snapshot.goals,
            goalContributions: snapshot.goalContributions,
            streak: nextStreak,
            balances: calculateBalances(snapshot.transactions, snapshot.wallets),
          });
        } finally {
          applyingSyncSnapshot = false;
        }
      },
      resetForOwnerSwitch: () => {
        set({
          transactions: [],
          balances: [],
          categories: defaultCategories,
          wallets: defaultWallets,
          budgets: [],
          goals: [],
          goalContributions: [],
          streak: { ...emptyStreak, completionDates: [], manualCompletionDates: [] },
          hydrationError: null,
        });
      },
      setHydrationResult: (error) => {
        if (error) {
          set({
            hasHydrated: true,
            hydrationError:
              error instanceof Error ? error.message : 'Local data could not be loaded.',
          });
          return;
        }

        const state = get();
        const transactions = state.transactions;
        const categories = [
          ...state.categories,
          ...legacyCategories.filter(
            (category) =>
              transactions.some((transaction) => transaction.categoryId === category.id) &&
              !state.categories.some((item) => item.id === category.id),
          ),
        ];
        const wallets = [
          ...state.wallets,
          ...legacyWallets.filter(
            (wallet) =>
              transactions.some(
                (transaction) =>
                  transaction.walletId === wallet.id ||
                  transaction.sourceWalletId === wallet.id ||
                  transaction.destinationWalletId === wallet.id,
              ) && !state.wallets.some((item) => item.id === wallet.id),
          ),
        ];
        try {
          const streak = syncStreakWithTransactions(state.streak ?? emptyStreak, transactions);
          set({
            hasHydrated: true,
            hydrationError: null,
            categories,
            wallets,
            balances: calculateBalances(transactions, wallets),
            budgets: state.budgets ?? [],
            goals: state.goals ?? [],
            goalContributions: state.goalContributions ?? [],
            streak,
          });
        } catch (recalculationError) {
          set({
            hasHydrated: true,
            hydrationError:
              recalculationError instanceof Error
                ? `Stored transactions could not be recalculated: ${recalculationError.message}`
                : 'Stored transactions could not be recalculated.',
          });
        }
      },
    }),
    {
      name: 'ljxmoney-finance-store',
      storage: createJSONStorage(() => storage),
      version: 2,
      migrate: migrateFinanceState,
      partialize: (state) => ({
        transactions: state.transactions,
        categories: state.categories,
        wallets: state.wallets,
        budgets: state.budgets,
        goals: state.goals,
        goalContributions: state.goalContributions,
        streak: state.streak,
      }),
      onRehydrateStorage: () => (state, error) => {
        state?.setHydrationResult(error);
      },
    },
    ),
  );

export const getTotalsForRange = (transactions: Transaction[], days: number) => {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days + 1);

  const filtered = transactions.filter((transaction) => {
    const transactionDate = new Date(`${transaction.date}T00:00:00`);
    return transactionDate >= cutoff;
  });

  return {
    income: calculateIncome(filtered),
    expense: calculateExpense(filtered),
    net: calculateIncome(filtered) - calculateExpense(filtered),
  };
};
