import {
  addDays,
  eachDayOfInterval,
  endOfDay,
  endOfMonth,
  endOfWeek,
  endOfYear,
  format,
  isValid,
  parseISO,
  startOfDay,
  startOfMonth,
  startOfWeek,
  startOfYear,
} from 'date-fns';

import type {
  Budget,
  BudgetSummary,
  DailyBalance,
  DateRange,
  GoalContribution,
  GoalSummary,
  SavingsGoal,
  StatisticsPeriod,
  StreakState,
  StreakSummary,
  Transaction,
  TransactionType,
  Wallet,
} from './models';

export type { DailyBalance, Transaction, TransactionType } from './models';

const sumByType = (transactions: Transaction[], type: TransactionType) =>
  transactions
    .filter((transaction) => transaction.type === type)
    .reduce((total, transaction) => total + transaction.amount, 0);

export const calculateIncome = (transactions: Transaction[]) => sumByType(transactions, 'income');

export const calculateExpense = (transactions: Transaction[]) => sumByType(transactions, 'expense');

export const getSignedAdjustmentAmount = (
  transaction: Pick<Transaction, 'amount' | 'adjustmentDirection'>,
) => transaction.adjustmentDirection === 'decrease' ? -transaction.amount : transaction.amount;

export const calculateBalanceAdjustment = (currentBalance: number, targetBalance: number) => {
  if (
    !Number.isSafeInteger(currentBalance) ||
    !Number.isSafeInteger(targetBalance) ||
    targetBalance < 0
  ) {
    throw new RangeError('Target balance must be a non-negative safe whole number.');
  }
  const difference = targetBalance - currentBalance;
  if (difference === 0) {
    return null;
  }
  if (!Number.isSafeInteger(difference)) {
    throw new RangeError('The balance difference is too large.');
  }
  return {
    amount: Math.abs(difference),
    adjustmentDirection: difference > 0 ? 'increase' as const : 'decrease' as const,
  };
};

export const calculateAdjustment = (transactions: Transaction[]) =>
  transactions
    .filter((transaction) => transaction.type === 'adjustment')
    .reduce((total, transaction) => total + getSignedAdjustmentAmount(transaction), 0);

export const calculateNetCashFlow = (transactions: Transaction[]) =>
  calculateIncome(transactions) - calculateExpense(transactions) + calculateAdjustment(transactions);

export const getOpeningBalance = (balances: DailyBalance[], date: string) => {
  const matchingBalance = balances.find((balance) => balance.date === date);
  return matchingBalance?.openingBalance ?? 0;
};

export const getClosingBalance = (balances: DailyBalance[], date: string) => {
  const matchingBalance = balances.find((balance) => balance.date === date);
  return matchingBalance?.closingBalance ?? 0;
};

export const calculateWalletBalance = (
  walletId: string,
  transactions: Transaction[],
  wallets: Wallet[] = [],
) => {
  const wallet = wallets.find((item) => item.id === walletId);
  const initialBalance = wallet?.initialBalance ?? 0;

  return transactions.reduce((balance, transaction) => {
    if (transaction.type === 'transfer') {
      const sourceWalletId = transaction.sourceWalletId ?? transaction.walletId;
      if (sourceWalletId === walletId) {
        return balance - transaction.amount;
      }
      return transaction.destinationWalletId === walletId
        ? balance + transaction.amount
        : balance;
    }
    if (transaction.walletId !== walletId) {
      return balance;
    }
    if (transaction.type === 'adjustment') {
      return balance + getSignedAdjustmentAmount(transaction);
    }
    if (transaction.type === 'income') {
      return balance + transaction.amount;
    }
    return transaction.type === 'expense' ? balance - transaction.amount : balance;
  }, initialBalance);
};

export const calculateWalletBalanceAt = (
  walletId: string,
  transactions: Transaction[],
  wallets: Wallet[],
  date: string,
  time: string,
  excludeTransactionId?: string,
) => calculateWalletBalance(
  walletId,
  transactions.filter((transaction) =>
    transaction.id !== excludeTransactionId &&
    (transaction.date < date || (transaction.date === date && transaction.time <= time)),
  ),
  wallets,
);

export const calculateWalletBalances = (transactions: Transaction[], wallets: Wallet[]) =>
  Object.fromEntries(
    wallets.map((wallet) => [wallet.id, calculateWalletBalance(wallet.id, transactions, wallets)]),
  );

export const getIncomeByDateRange = (
  transactions: Transaction[],
  start: Date | string,
  end: Date | string,
) => {
  return getTransactionsInDateRange(transactions, start, end)
    .filter((transaction) => transaction.type === 'income')
    .reduce((total, transaction) => total + transaction.amount, 0);
};

export const getExpenseByDateRange = (
  transactions: Transaction[],
  start: Date | string,
  end: Date | string,
) => {
  return getTransactionsInDateRange(transactions, start, end)
    .filter((transaction) => transaction.type === 'expense')
    .reduce((total, transaction) => total + transaction.amount, 0);
};

export const getNetCashFlowByDateRange = (
  transactions: Transaction[],
  start: Date | string,
  end: Date | string,
) => getIncomeByDateRange(transactions, start, end) - getExpenseByDateRange(transactions, start, end);

const toLocalDate = (value: Date | string) => value instanceof Date ? new Date(value) : parseISO(value);

export const getTransactionsInDateRange = (
  transactions: Transaction[],
  start: Date | string,
  end: Date | string,
) => {
  const startDate = toLocalDate(start);
  const endDate = toLocalDate(end);
  if (!isValid(startDate) || !isValid(endDate) || startDate > endDate) {
    return [];
  }

  const from = format(startOfDay(startDate), 'yyyy-MM-dd');
  const through = format(endOfDay(endDate), 'yyyy-MM-dd');
  return transactions.filter(
    (transaction) =>
      transaction.date >= from &&
      transaction.date <= through,
  );
};

const sumByDate = (transactions: Transaction[], type: 'income' | 'expense') => {
  const totals = new Map<string, number>();
  for (const transaction of transactions) {
    if (transaction.type === type) {
      totals.set(transaction.date, (totals.get(transaction.date) ?? 0) + transaction.amount);
    }
  }
  return totals;
};

const summarizeTransactionsByDate = (transactions: Transaction[]) => {
  const dailyTotals = new Map<string, { income: number; expense: number; adjustment: number }>();
  for (const transaction of transactions) {
    if (
      transaction.type !== 'income' &&
      transaction.type !== 'expense' &&
      transaction.type !== 'adjustment'
    ) {
      continue;
    }
    const totals = dailyTotals.get(transaction.date) ?? { income: 0, expense: 0, adjustment: 0 };
    if (transaction.type === 'income') totals.income += transaction.amount;
    if (transaction.type === 'expense') totals.expense += transaction.amount;
    if (transaction.type === 'adjustment') totals.adjustment += getSignedAdjustmentAmount(transaction);
    dailyTotals.set(transaction.date, totals);
  }
  return dailyTotals;
};

export const getPeriodDateRange = (
  period: StatisticsPeriod,
  date: Date = new Date(),
): DateRange => {
  const localDate = new Date(date);
  if (!isValid(localDate)) {
    throw new RangeError('A valid local date is required.');
  }

  switch (period) {
    case 'day':
      return { start: startOfDay(localDate), end: endOfDay(localDate) };
    case 'week':
      return {
        start: startOfWeek(localDate, { weekStartsOn: 1 }),
        end: endOfWeek(localDate, { weekStartsOn: 1 }),
      };
    case 'month':
      return { start: startOfMonth(localDate), end: endOfMonth(localDate) };
    case 'year':
      return { start: startOfYear(localDate), end: endOfYear(localDate) };
  }
};

export const getDailyBalanceSeries = (
  transactions: Transaction[],
  start: Date | string,
  end: Date | string,
  startingBalance = 0,
): DailyBalance[] => {
  const startDate = startOfDay(toLocalDate(start));
  const endDate = startOfDay(toLocalDate(end));
  if (!isValid(startDate) || !isValid(endDate) || endDate < startDate) {
    return [];
  }
  const days = eachDayOfInterval({ start: startDate, end: endDate });

  let previousClosingBalance = startingBalance;
  const dailyTotals = summarizeTransactionsByDate(transactions);
  return days.map((day) => {
    const date = format(day, 'yyyy-MM-dd');
    const activity = dailyTotals.get(date) ?? { income: 0, expense: 0, adjustment: 0 };
    const closingBalance =
      previousClosingBalance + activity.income - activity.expense + activity.adjustment;
    const balance: DailyBalance = {
      date,
      openingBalance: previousClosingBalance,
      income: activity.income,
      expense: activity.expense,
      adjustment: activity.adjustment,
      closingBalance,
    };
    previousClosingBalance = closingBalance;
    return balance;
  });
};

export const getDailyIncomeSeries = (transactions: Transaction[], start: Date | string, end: Date | string) => {
  const startDate = startOfDay(toLocalDate(start));
  const endDate = startOfDay(toLocalDate(end));
  if (!isValid(startDate) || !isValid(endDate) || endDate < startDate) {
    return [];
  }
  const days = eachDayOfInterval({ start: startDate, end: endDate });
  const totals = sumByDate(transactions, 'income');

  return days.map((day) => {
    const date = format(day, 'yyyy-MM-dd');
    return { date, value: totals.get(date) ?? 0 };
  });
};

export const getDailyExpenseSeries = (transactions: Transaction[], start: Date | string, end: Date | string) => {
  const startDate = startOfDay(toLocalDate(start));
  const endDate = startOfDay(toLocalDate(end));
  if (!isValid(startDate) || !isValid(endDate) || endDate < startDate) {
    return [];
  }
  const days = eachDayOfInterval({ start: startDate, end: endDate });
  const totals = sumByDate(transactions, 'expense');

  return days.map((day) => {
    const date = format(day, 'yyyy-MM-dd');
    return { date, value: totals.get(date) ?? 0 };
  });
};

export const getCategorySpending = (
  transactions: Transaction[],
  categories: { id: string; name: string; type: 'income' | 'expense'; color: string }[],
  start?: Date | string,
  end?: Date | string,
) => {
  const filteredCategories = categories.filter((category) => category.type === 'expense');
  const filteredTransactions = start === undefined || end === undefined
    ? transactions
    : getTransactionsInDateRange(transactions, start, end);

  return filteredCategories
    .map((category) => ({
      ...category,
      total: filteredTransactions
        .filter(
          (transaction) =>
            transaction.type === 'expense' &&
            transaction.categoryId === category.id &&
            transaction.categoryId !== '',
        )
        .reduce((sum, transaction) => sum + transaction.amount, 0),
    }))
    .filter((category) => category.total > 0)
    .sort((first, second) => second.total - first.total);
};

export const getWalletSpending = (
  transactions: Transaction[],
  start?: Date | string,
  end?: Date | string,
) => {
  const byWallet = new Map<string, { walletId: string; inflow: number; outflow: number; net: number; }>();

  const filteredTransactions = start === undefined || end === undefined
    ? transactions
    : getTransactionsInDateRange(transactions, start, end);

  for (const transaction of filteredTransactions) {
    if (transaction.type === 'transfer') {
      const sourceWalletId = transaction.sourceWalletId ?? transaction.walletId;
      const destinationWalletId = transaction.destinationWalletId ?? transaction.walletId;

      const source = byWallet.get(sourceWalletId) ?? { walletId: sourceWalletId, inflow: 0, outflow: 0, net: 0 };
      source.outflow += transaction.amount;
      source.net -= transaction.amount;
      byWallet.set(sourceWalletId, source);

      const destination = byWallet.get(destinationWalletId) ?? {
        walletId: destinationWalletId,
        inflow: 0,
        outflow: 0,
        net: 0,
      };
      destination.inflow += transaction.amount;
      destination.net += transaction.amount;
      byWallet.set(destinationWalletId, destination);
      continue;
    }

    if (transaction.type === 'income') {
      const wallet = byWallet.get(transaction.walletId) ?? {
        walletId: transaction.walletId,
        inflow: 0,
        outflow: 0,
        net: 0,
      };
      wallet.inflow += transaction.amount;
      wallet.net += transaction.amount;
      byWallet.set(transaction.walletId, wallet);
    }

    if (transaction.type === 'adjustment') {
      const wallet = byWallet.get(transaction.walletId) ?? {
        walletId: transaction.walletId,
        inflow: 0,
        outflow: 0,
        net: 0,
      };
      wallet.net += getSignedAdjustmentAmount(transaction);
      byWallet.set(transaction.walletId, wallet);
    }

    if (transaction.type === 'expense') {
      const wallet = byWallet.get(transaction.walletId) ?? {
        walletId: transaction.walletId,
        inflow: 0,
        outflow: 0,
        net: 0,
      };
      wallet.outflow += transaction.amount;
      wallet.net -= transaction.amount;
      byWallet.set(transaction.walletId, wallet);
    }
  }

  return [...byWallet.values()].sort((first, second) => second.net - first.net);
};

export const getWalletExpenseSpending = (
  transactions: Transaction[],
  wallets: Wallet[],
  start?: Date | string,
  end?: Date | string,
) => {
  const filteredTransactions =
    start === undefined || end === undefined
      ? transactions
      : getTransactionsInDateRange(transactions, start, end);

  return wallets
    .map((wallet) => ({
      walletId: wallet.id,
      name: wallet.name,
      color: wallet.color,
      total: filteredTransactions
        .filter(
          (transaction) =>
            transaction.type === 'expense' && transaction.walletId === wallet.id,
        )
        .reduce((total, transaction) => total + transaction.amount, 0),
    }))
    .filter((wallet) => wallet.total > 0)
    .sort((first, second) => second.total - first.total);
};

export const getWeekdaySpending = (
  transactions: Transaction[],
  start?: Date | string,
  end?: Date | string,
) => {
  const weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const totals = weekdays.map((day) => ({ day, total: 0 }));

  const filteredTransactions = start === undefined || end === undefined
    ? transactions
    : getTransactionsInDateRange(transactions, start, end);

  for (const transaction of filteredTransactions) {
    if (transaction.type !== 'expense') {
      continue;
    }

    const date = parseISO(transaction.date);
    if (Number.isNaN(date.getTime())) {
      continue;
    }

    const index = (date.getDay() + 6) % 7;
    totals[index].total += transaction.amount;
  }

  return totals;
};

export const getPeriodComparison = (
  currentTransactions: Transaction[],
  previousTransactions: Transaction[],
) => {
  const currentIncome = calculateIncome(currentTransactions);
  const currentExpense = calculateExpense(currentTransactions);
  const previousIncome = calculateIncome(previousTransactions);
  const previousExpense = calculateExpense(previousTransactions);

  const currentNet = currentIncome - currentExpense;
  const previousNet = previousIncome - previousExpense;
  const percentageChange = (current: number, previous: number) =>
    previous === 0 ? (current === 0 ? 0 : null) : ((current - previous) / Math.abs(previous)) * 100;

  return {
    income: currentIncome,
    expense: currentExpense,
    net: currentNet,
    previousIncome,
    previousExpense,
    previousNet,
    incomeDelta: percentageChange(currentIncome, previousIncome),
    expenseDelta: percentageChange(currentExpense, previousExpense),
    netDelta: percentageChange(currentNet, previousNet),
  };
};

export const calculateMonthlySummary = (transactions: Transaction[], monthDate = new Date()) => {
  const monthStart = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0, 23, 59, 59, 999);

  const filtered = transactions.filter((transaction) => {
    const visitDate = parseISO(transaction.date);
    return visitDate >= monthStart && visitDate <= monthEnd;
  });

  return {
    income: calculateIncome(filtered),
    expense: calculateExpense(filtered),
    net: calculateNetCashFlow(filtered),
    transactionCount: filtered.length,
  };
};

export const calculateCategorySummary = (transactions: Transaction[], categories: { id: string; name: string; type: 'income' | 'expense'; color: string }[]) => {
  return categories
    .filter((category) => category.type === 'expense')
    .map((category) => ({
      ...category,
      total: transactions
        .filter(
          (transaction) =>
            transaction.type === 'expense' && transaction.categoryId === category.id,
        )
        .reduce((total, transaction) => total + transaction.amount, 0),
    }))
    .filter((category) => category.total > 0)
    .sort((first, second) => second.total - first.total);
};

export const calculateDailyBalance = (
  date: string,
  transactions: Transaction[],
  previousClosingBalance = 0,
): DailyBalance => {
  const dailyTransactions = transactions.filter((transaction) => transaction.date === date);

  const income = calculateIncome(dailyTransactions);
  const expense = calculateExpense(dailyTransactions);
  const adjustment = calculateAdjustment(dailyTransactions);
  const openingBalance = previousClosingBalance;
  const closingBalance = openingBalance + income - expense + adjustment;

  return {
    date,
    openingBalance,
    income,
    expense,
    adjustment,
    closingBalance,
  };
};

export const calculateOpeningBalanceForDate = (
  date: string,
  transactions: Transaction[],
  wallets: Wallet[],
) =>
  wallets.reduce((total, wallet) => total + wallet.initialBalance, 0) +
  calculateNetCashFlow(transactions.filter((transaction) => transaction.date < date));

export const recalculateBalances = (
  transactions: Transaction[],
  startingBalance = 0,
): DailyBalance[] => {
  if (!transactions.length) {
    return [];
  }

  const uniqueDates = [...new Set(transactions.map((transaction) => transaction.date))].sort();
  const firstDate = parseISO(uniqueDates[0]);
  const lastDate = parseISO(uniqueDates[uniqueDates.length - 1]);
  if (Number.isNaN(firstDate.getTime()) || Number.isNaN(lastDate.getTime())) {
    throw new RangeError('Transactions must use valid ISO dates (yyyy-MM-dd).');
  }
  const days = eachDayOfInterval({ start: firstDate, end: lastDate });

  let previousClosingBalance = startingBalance;
  const dailyTotals = summarizeTransactionsByDate(transactions);

  return days.map((day) => {
    const date = format(day, 'yyyy-MM-dd');
    const activity = dailyTotals.get(date) ?? { income: 0, expense: 0, adjustment: 0 };
    const closingBalance =
      previousClosingBalance + activity.income - activity.expense + activity.adjustment;
    const balance: DailyBalance = {
      date,
      openingBalance: previousClosingBalance,
      income: activity.income,
      expense: activity.expense,
      adjustment: activity.adjustment,
      closingBalance,
    };
    previousClosingBalance = closingBalance;
    return balance;
  });
};

export const calculateBudgetSummary = (
  budget: Budget,
  transactions: Transaction[],
  asOfDate: Date | string = new Date(),
): BudgetSummary => {
  const asOf = toLocalDate(asOfDate);
  const isActive =
    isValid(asOf) &&
    format(asOf, 'yyyy-MM-dd') >= budget.startDate &&
    format(asOf, 'yyyy-MM-dd') <= budget.endDate;
  const cycleRange =
    budget.period === 'custom' || !isActive
      ? { start: budget.startDate, end: budget.endDate }
      : getPeriodDateRange(
          budget.period === 'weekly' ? 'week' : budget.period === 'yearly' ? 'year' : 'month',
          asOf,
        );
  const cycleStart = format(startOfDay(toLocalDate(cycleRange.start)), 'yyyy-MM-dd');
  const cycleEnd = format(startOfDay(toLocalDate(cycleRange.end)), 'yyyy-MM-dd');
  const startDate = cycleStart < budget.startDate ? budget.startDate : cycleStart;
  const endDate = cycleEnd > budget.endDate ? budget.endDate : cycleEnd;
  const matchingTransactions = (isActive
    ? getTransactionsInDateRange(transactions, startDate, endDate)
    : []
  ).filter(
    (transaction) =>
      transaction.type === 'expense' && transaction.categoryId === budget.categoryId,
  );
  const spent = matchingTransactions.reduce((total, transaction) => total + transaction.amount, 0);
  const percentage = budget.amount > 0 ? (spent / budget.amount) * 100 : 0;
  const start = startOfDay(parseISO(startDate));
  const end = startOfDay(parseISO(endDate));
  const dailyTotals = new Map<string, number>();

  for (const transaction of matchingTransactions) {
    dailyTotals.set(
      transaction.date,
      (dailyTotals.get(transaction.date) ?? 0) + transaction.amount,
    );
  }

  const dailySpending =
    isValid(start) && isValid(end) && end >= start
      ? eachDayOfInterval({ start, end }).map((day) => {
          const date = format(day, 'yyyy-MM-dd');
          return { date, amount: dailyTotals.get(date) ?? 0 };
        })
      : [];

  return {
    spent,
    remaining: Math.max(0, budget.amount - spent),
    percentage,
    status: percentage >= 100 ? 'exceeded' : percentage >= 70 ? 'warning' : 'safe',
    startDate,
    endDate,
    dailySpending,
    transactions: matchingTransactions,
  };
};

export const calculateGoalSummary = (
  goal: SavingsGoal,
  contributions: GoalContribution[],
): GoalSummary => {
  const currentAmount = contributions
    .filter((contribution) => contribution.goalId === goal.id)
    .reduce((total, contribution) => total + contribution.amount, 0);
  return {
    currentAmount,
    remaining: Math.max(0, goal.targetAmount - currentAmount),
    progress: goal.targetAmount > 0
      ? Math.min(100, (currentAmount / goal.targetAmount) * 100)
      : 0,
  };
};

const calculateLongestStreak = (completionDates: string[]) => {
  let longest = 0;
  let current = 0;
  let previous: Date | null = null;

  for (const date of completionDates) {
    const day = parseISO(date);
    if (!isValid(day)) {
      continue;
    }
    current =
      previous && format(addDays(previous, 1), 'yyyy-MM-dd') === date
        ? current + 1
        : 1;
    longest = Math.max(longest, current);
    previous = day;
  }
  return longest;
};

export const addStreakCompletion = (state: StreakState, date: string): StreakState => {
  const manualCompletionDates = [...new Set([...state.manualCompletionDates, date])]
    .filter((item) => /^\d{4}-\d{2}-\d{2}$/.test(item) && isValid(parseISO(item)))
    .sort();
  const completionDates = [...new Set([...state.completionDates, ...manualCompletionDates])]
    .filter((item) => /^\d{4}-\d{2}-\d{2}$/.test(item) && isValid(parseISO(item)))
    .sort();
  return {
    completionDates,
    manualCompletionDates,
    longestStreak: Math.max(state.longestStreak, calculateLongestStreak(completionDates)),
  };
};

export const syncStreakWithTransactions = (
  state: StreakState,
  transactions: Transaction[],
): StreakState => {
  const manualCompletionDates = [...new Set(state.manualCompletionDates)].sort();
  const transactionDates = transactions
    .map((transaction) => transaction.date)
    .filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date) && isValid(parseISO(date)));
  const completionDates = [...new Set([...manualCompletionDates, ...transactionDates])].sort();
  return {
    completionDates,
    manualCompletionDates,
    longestStreak: Math.max(state.longestStreak, calculateLongestStreak(completionDates)),
  };
};

export const calculateStreakSummary = (
  state: StreakState,
  asOfDate: Date = new Date(),
): StreakSummary => {
  const today = format(startOfDay(asOfDate), 'yyyy-MM-dd');
  const yesterday = format(addDays(startOfDay(asOfDate), -1), 'yyyy-MM-dd');
  const completionDates = [...new Set(state.completionDates)].sort();
  const lastCompletedDate = completionDates.at(-1) ?? null;
  const checkedToday = completionDates.includes(today);
  let currentStreak = 0;

  if (lastCompletedDate === today || lastCompletedDate === yesterday) {
    let date = lastCompletedDate;
    while (date && completionDates.includes(date)) {
      currentStreak += 1;
      date = format(addDays(parseISO(date), -1), 'yyyy-MM-dd');
    }
  }

  return {
    currentStreak,
    longestStreak: Math.max(state.longestStreak, calculateLongestStreak(completionDates)),
    lastCompletedDate,
    checkedToday,
  };
};
