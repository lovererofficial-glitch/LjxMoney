import type { SupabaseClient } from '@supabase/supabase-js';

import type {
  Budget,
  Category,
  GoalContribution,
  SavingsGoal,
  StreakState,
  Transaction,
  Wallet,
} from '../features/finance/models';
import type { SyncCloudSnapshot, SyncEntity, SyncRepository } from './syncTypes';

const toNumber = (value: unknown): number => Number(value ?? 0);

const toOptionalString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined;

const walletFromRow = (row: Record<string, unknown>): Wallet => ({
  id: String(row.id),
  name: String(row.name ?? ''),
  color: String(row.color ?? '#D7B56D'),
  type: row.type as Wallet['type'],
  icon: toOptionalString(row.icon),
  initialBalance: toNumber(row.initial_balance),
  archivedAt: (row.archived_at as string | null) ?? null,
  createdAt: String(row.created_at ?? ''),
  updatedAt: String(row.updated_at ?? ''),
});

const walletToRow = (userId: string, wallet: Wallet) => ({
  user_id: userId,
  id: wallet.id,
  name: wallet.name,
  color: wallet.color,
  type: wallet.type,
  icon: wallet.icon ?? null,
  initial_balance: wallet.initialBalance,
  archived_at: wallet.archivedAt ?? null,
  created_at: wallet.createdAt ?? null,
  updated_at: wallet.updatedAt,
});

const categoryFromRow = (row: Record<string, unknown>): Category => ({
  id: String(row.id),
  name: String(row.name ?? ''),
  color: String(row.color ?? '#D7B56D'),
  type: row.type as Category['type'],
  icon: toOptionalString(row.icon),
  archivedAt: (row.archived_at as string | null) ?? null,
  createdAt: String(row.created_at ?? ''),
  updatedAt: String(row.updated_at ?? ''),
});

const categoryToRow = (userId: string, category: Category) => ({
  user_id: userId,
  id: category.id,
  name: category.name,
  color: category.color,
  type: category.type,
  icon: category.icon ?? null,
  archived_at: category.archivedAt ?? null,
  created_at: category.createdAt ?? null,
  updated_at: category.updatedAt,
});

const transactionFromRow = (row: Record<string, unknown>): Transaction => ({
  id: String(row.id),
  type: row.type as Transaction['type'],
  amount: toNumber(row.amount),
  categoryId: (row.category_id as string | null) ?? '',
  walletId: String(row.wallet_id ?? ''),
  sourceWalletId: toOptionalString(row.source_wallet_id),
  destinationWalletId: toOptionalString(row.destination_wallet_id),
  date: String(row.date ?? ''),
  time: String(row.time ?? ''),
  note: String(row.note ?? ''),
  createdAt: String(row.created_at ?? ''),
  updatedAt: String(row.updated_at ?? ''),
});

const transactionToRow = (userId: string, transaction: Transaction) => ({
  user_id: userId,
  id: transaction.id,
  type: transaction.type,
  amount: transaction.amount,
  category_id: transaction.categoryId || null,
  wallet_id: transaction.walletId,
  source_wallet_id: transaction.sourceWalletId ?? null,
  destination_wallet_id: transaction.destinationWalletId ?? null,
  date: transaction.date,
  time: transaction.time,
  note: transaction.note,
  created_at: transaction.createdAt ?? null,
  updated_at: transaction.updatedAt,
});

const budgetFromRow = (row: Record<string, unknown>): Budget => ({
  id: String(row.id),
  name: String(row.name ?? ''),
  categoryId: String(row.category_id ?? ''),
  amount: toNumber(row.amount),
  period: row.period as Budget['period'],
  startDate: String(row.start_date ?? ''),
  endDate: String(row.end_date ?? ''),
  archivedAt: (row.archived_at as string | null) ?? null,
  createdAt: String(row.created_at ?? ''),
  updatedAt: String(row.updated_at ?? ''),
});
const budgetToRow = (userId: string, budget: Budget) => ({
  user_id: userId,
  id: budget.id,
  name: budget.name,
  category_id: budget.categoryId,
  amount: budget.amount,
  period: budget.period,
  start_date: budget.startDate,
  end_date: budget.endDate,
  archived_at: budget.archivedAt ?? null,
  created_at: budget.createdAt ?? null,
  updated_at: budget.updatedAt,
});
const goalFromRow = (row: Record<string, unknown>): SavingsGoal => ({
  id: String(row.id),
  name: String(row.name ?? ''),
  targetAmount: toNumber(row.target_amount),
  deadline: (row.deadline as string | null) ?? null,
  note: String(row.note ?? ''),
  archivedAt: (row.archived_at as string | null) ?? null,
  createdAt: String(row.created_at ?? ''),
  updatedAt: String(row.updated_at ?? ''),
});
const goalToRow = (userId: string, goal: SavingsGoal) => ({
  user_id: userId,
  id: goal.id,
  name: goal.name,
  target_amount: goal.targetAmount,
  deadline: goal.deadline ?? null,
  note: goal.note,
  archived_at: goal.archivedAt ?? null,
  created_at: goal.createdAt ?? null,
  updated_at: goal.updatedAt,
});
const contributionFromRow = (row: Record<string, unknown>): GoalContribution => ({
  id: String(row.id),
  goalId: String(row.goal_id ?? ''),
  amount: toNumber(row.amount),
  date: String(row.date ?? ''),
  note: String(row.note ?? ''),
  createdAt: String(row.created_at ?? ''),
  updatedAt: String(row.updated_at ?? ''),
});
const contributionToRow = (userId: string, contribution: GoalContribution) => ({
  user_id: userId,
  id: contribution.id,
  goal_id: contribution.goalId,
  amount: contribution.amount,
  date: contribution.date,
  note: contribution.note,
  created_at: contribution.createdAt ?? null,
  updated_at: contribution.updatedAt,
});
const streakFromRow = (row: Record<string, unknown> | null): SyncCloudSnapshot['streak'] => {
  if (!row) {
    return null;
  }
  return {
    completionDates: (row.completion_dates as string[] | null) ?? [],
    manualCompletionDates: (row.manual_completion_dates as string[] | null) ?? [],
    longestStreak: toNumber(row.longest_streak),
    updatedAt: String(row.updated_at ?? ''),
  };
};

const TABLES: Record<SyncEntity, string> = {
  wallets: 'wallets',
  categories: 'categories',
  transactions: 'transactions',
  budgets: 'budgets',
  goals: 'savings_goals',
  goalContributions: 'goal_contributions',
};

const throwOnPostgrestError = (
  error: {
    message: string;
    code?: string;
    details?: string;
    hint?: string;
  } | null,
  context: string,
): void => {
  if (!error) {
    return;
  }

  const parts = [
    `[${context}] ${error.message}`,
    error.code ? `code=${error.code}` : '',
    error.details ? `details=${error.details}` : '',
    error.hint ? `hint=${error.hint}` : '',
  ].filter(Boolean);

  console.error('[LjxMoney Sync]', parts.join(' | '));

  throw new Error(parts.join(' | '));
};

export const createSupabaseSyncRepository = (
  client: SupabaseClient,
  userId: string,
): SyncRepository => ({
  fetchAll: async (): Promise<SyncCloudSnapshot> => {
    const [wallets, categories, transactions, budgets, goals, contributions, streak] =
      await Promise.all([
        client.from('wallets').select('*').eq('user_id', userId),
        client.from('categories').select('*').eq('user_id', userId),
        client.from('transactions').select('*').eq('user_id', userId),
        client.from('budgets').select('*').eq('user_id', userId),
        client.from('savings_goals').select('*').eq('user_id', userId),
        client.from('goal_contributions').select('*').eq('user_id', userId),
        client.from('streaks').select('*').eq('user_id', userId).maybeSingle(),
      ]);
    throwOnPostgrestError(wallets.error, 'wallets');
    throwOnPostgrestError(categories.error, 'categories');
    throwOnPostgrestError(transactions.error, 'transactions');
    throwOnPostgrestError(budgets.error, 'budgets');
    throwOnPostgrestError(goals.error, 'savings_goals');
    throwOnPostgrestError(contributions.error, 'goal_contributions');
    throwOnPostgrestError(streak.error, 'streaks');
    return {
      wallets: (wallets.data ?? []).map(walletFromRow),
      categories: (categories.data ?? []).map(categoryFromRow),
      transactions: (transactions.data ?? []).map(transactionFromRow),
      budgets: (budgets.data ?? []).map(budgetFromRow),
      goals: (goals.data ?? []).map(goalFromRow),
      goalContributions: (contributions.data ?? []).map(contributionFromRow),
      streak: streakFromRow(streak.data as Record<string, unknown> | null),
    };
  },
  upsert: async (entity, rows) => {
    if (!rows.length) {
      return;
    }
    const payload = (rows as unknown[]).map((row) => {
      switch (entity) {
        case 'wallets':
          return walletToRow(userId, row as Wallet);
        case 'categories':
          return categoryToRow(userId, row as Category);
        case 'transactions':
          return transactionToRow(userId, row as Transaction);
        case 'budgets':
          return budgetToRow(userId, row as Budget);
        case 'goals':
          return goalToRow(userId, row as SavingsGoal);
        case 'goalContributions':
          return contributionToRow(userId, row as GoalContribution);
      }
    });
    const { error } = await client
      .from(TABLES[entity])
      .upsert(payload, { onConflict: 'user_id,id' });
    throwOnPostgrestError(error, TABLES[entity]);
  },
  remove: async (entity, ids) => {
    if (!ids.length) {
      return;
    }
    const { error } = await client.from(TABLES[entity]).delete().eq('user_id', userId).in('id', ids);
    throwOnPostgrestError(error, TABLES[entity]);
  },
  upsertStreak: async (streak: StreakState) => {
    const { error } = await client.from('streaks').upsert(
      {
        user_id: userId,
        completion_dates: streak.completionDates ?? [],
        manual_completion_dates: streak.manualCompletionDates ?? [],
        longest_streak: streak.longestStreak ?? 0,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    );
    throwOnPostgrestError(error, 'streaks');
  },
});
