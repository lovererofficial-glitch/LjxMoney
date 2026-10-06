export type TransactionType = 'income' | 'expense' | 'transfer' | 'adjustment';
export type CategoryType = 'income' | 'expense';
export type WalletType = 'cash' | 'bank' | 'ewallet' | 'card' | 'savings' | 'other';

export interface Transaction {
  id: string;
  type: TransactionType;
  amount: number;
  categoryId: string;
  walletId: string;
  sourceWalletId?: string;
  destinationWalletId?: string;
  date: string;
  time: string;
  note: string;
  createdAt: string;
  updatedAt: string;
}

export interface Category {
  id: string;
  name: string;
  color: string;
  type: CategoryType;
  icon?: string;
  archivedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface Wallet {
  id: string;
  name: string;
  color: string;
  type: WalletType;
  icon?: string;
  initialBalance: number;
  archivedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface DailyBalance {
  date: string;
  openingBalance: number;
  income: number;
  expense: number;
  adjustment: number;
  closingBalance: number;
}

export type BudgetPeriod = 'weekly' | 'monthly' | 'yearly' | 'custom';
export type BudgetStatus = 'safe' | 'warning' | 'exceeded';

export interface Budget {
  id: string;
  name: string;
  categoryId: string;
  amount: number;
  period: BudgetPeriod;
  startDate: string;
  endDate: string;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SavingsGoal {
  id: string;
  name: string;
  targetAmount: number;
  deadline: string | null;
  note: string;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GoalContribution {
  id: string;
  goalId: string;
  amount: number;
  date: string;
  note: string;
  createdAt: string;
  updatedAt: string;
}

export interface StreakState {
  completionDates: string[];
  manualCompletionDates: string[];
  longestStreak: number;
}

export interface StreakSummary {
  currentStreak: number;
  longestStreak: number;
  lastCompletedDate: string | null;
  checkedToday: boolean;
}

export interface BudgetSummary {
  spent: number;
  remaining: number;
  percentage: number;
  status: BudgetStatus;
  startDate: string;
  endDate: string;
  dailySpending: { date: string; amount: number }[];
  transactions: Transaction[];
}

export interface GoalSummary {
  currentAmount: number;
  remaining: number;
  progress: number;
}

export type StatisticsPeriod = 'day' | 'week' | 'month' | 'year';

export interface DateRange {
  start: Date;
  end: Date;
}
