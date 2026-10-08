import assert from 'node:assert/strict';
import test from 'node:test';

import {
  addStreakCompletion,
  calculateBudgetSummary,
  calculateAdjustment,
  calculateDailyBalance,
  calculateExpense,
  calculateGoalSummary,
  calculateIncome,
  calculateOpeningBalanceForDate,
  calculateTransferTotal,
  calculateStreakSummary,
  calculateWalletBalance,
  calculateWalletBalances,
  getCategoryIncome,
  getCategorySpending,
  getDailyBalanceSeries,
  getDailyExpenseSeries,
  getDailyIncomeSeries,
  getExpenseByDateRange,
  getIncomeByDateRange,
  getNetCashFlowByDateRange,
  getPeriodComparison,
  getPeriodDateRange,
  getStatisticsSummary,
  getWalletExpenseSpending,
  getWalletSpending,
  getWeekdaySpending,
  recalculateBalances,
  syncStreakWithTransactions,
} from './financeEngine.ts';
import type {
  Budget,
  GoalContribution,
  SavingsGoal,
  StreakState,
  Transaction,
  Wallet,
} from './models.ts';
import { migrateFinanceState } from '../../store/financeMigration.ts';

const makeTransaction = (
  id: string,
  type: Transaction['type'],
  amount: number,
  date: string,
  walletId = 'cash',
  categoryId = type === 'income' ? 'salary' : 'food',
): Transaction => ({
  id,
  type,
  amount,
  categoryId,
  walletId,
  date,
  time: '12:00',
  note: '',
  createdAt: `${date}T12:00:00.000Z`,
  updatedAt: `${date}T12:00:00.000Z`,
});

const makeTransfer = (
  id: string,
  amount: number,
  date: string,
  sourceWalletId = 'cash',
  destinationWalletId = 'bank',
): Transaction => ({
  ...makeTransaction(id, 'transfer', amount, date, sourceWalletId, ''),
  sourceWalletId,
  destinationWalletId,
});

const wallets: Wallet[] = [
  { id: 'cash', name: 'Cash', type: 'cash', color: '#D7B56D', initialBalance: 10_000_000 },
  { id: 'bank', name: 'Bank', type: 'bank', color: '#68F29A', initialBalance: 5_000_000 },
];

test('wallet balances include opening amount, income, expense, and archived-wallet history', () => {
  const archivedWallets = wallets.map((wallet) =>
    wallet.id === 'cash' ? { ...wallet, archivedAt: '2026-10-03T00:00:00.000Z' } : wallet,
  );
  const transactions = [
    makeTransaction('in', 'income', 1_000_000, '2026-10-01'),
    makeTransaction('out', 'expense', 500_000, '2026-10-02'),
  ];

  assert.equal(calculateWalletBalance('cash', transactions, archivedWallets), 10_500_000);
  assert.equal(calculateWalletBalance('bank', transactions, archivedWallets), 5_000_000);
});

test('empty calendar dates carry opening wallet balance and all earlier cash flow forward', () => {
  const transactions = [
    makeTransaction('income', 'income', 500_000, '2026-10-01'),
    makeTransaction('expense', 'expense', 200_000, '2026-10-03'),
  ];

  assert.equal(calculateOpeningBalanceForDate('2026-10-02', transactions, wallets), 15_500_000);
  assert.equal(calculateOpeningBalanceForDate('2026-10-04', transactions, wallets), 15_300_000);
});

test('calendar day summary uses engine balances and reports transfers separately', () => {
  const day = '2026-10-08';
  const transactions = [
    makeTransaction('prior-adjustment', 'adjustment', 500_000, '2026-10-07'),
    makeTransfer('prior-transfer', 2_000_000, '2026-10-07'),
    makeTransaction('day-income', 'income', 2_000_000, day),
    makeTransaction('day-expense', 'expense', 500_000, day),
    makeTransfer('day-transfer', 1_000_000, day),
    { ...makeTransaction('day-adjustment', 'adjustment', 500_000, day), adjustmentDirection: 'decrease' as const },
  ];
  const dayTransactions = transactions.filter((transaction) => transaction.date === day);
  const daily = calculateDailyBalance(
    day,
    dayTransactions,
    calculateOpeningBalanceForDate(day, transactions, wallets),
  );

  assert.equal(daily.openingBalance, 15_500_000);
  assert.equal(daily.income, 2_000_000);
  assert.equal(daily.expense, 500_000);
  assert.equal(daily.adjustment, -500_000);
  assert.equal(calculateTransferTotal(dayTransactions), 1_000_000);
  assert.equal(daily.closingBalance, 16_500_000);
  assert.equal(calculateIncome(dayTransactions), 2_000_000);
  assert.equal(calculateExpense(dayTransactions), 500_000);
  assert.equal(calculateAdjustment(dayTransactions), -500_000);
});

test('transfer changes source and destination balances but preserves net worth and cash-flow totals', () => {
  const transfer = makeTransfer('transfer', 2_000_000, '2026-10-02');
  const transactions = [transfer];

  assert.equal(calculateWalletBalance('cash', transactions, wallets), 8_000_000);
  assert.equal(calculateWalletBalance('bank', transactions, wallets), 7_000_000);
  assert.equal(
    calculateWalletBalance('cash', transactions, wallets) +
      calculateWalletBalance('bank', transactions, wallets),
    15_000_000,
  );
  assert.equal(getIncomeByDateRange(transactions, '2026-10-02', '2026-10-02'), 0);
  assert.equal(getExpenseByDateRange(transactions, '2026-10-02', '2026-10-02'), 0);
  assert.equal(getNetCashFlowByDateRange(transactions, '2026-10-02', '2026-10-02'), 0);
  assert.deepEqual(getCategorySpending(transactions, [
    { id: 'food', name: 'Food', color: '#fff', type: 'expense' },
  ]), []);
  assert.deepEqual(getWalletExpenseSpending(transactions, wallets), []);
  assert.deepEqual(
    getWalletSpending(transactions).map(({ walletId, net }) => [walletId, net]),
    [['bank', 2_000_000], ['cash', -2_000_000]],
  );
});

test('statistics separate transfers and adjustments from income and expense', () => {
  const transactions = [
    makeTransaction('salary', 'income', 10_000_000, '2026-10-08', 'cash', 'salary'),
    makeTransaction('food', 'expense', 4_000_000, '2026-10-08', 'cash', 'food'),
    makeTransfer('internal', 3_000_000, '2026-10-08'),
    { ...makeTransaction('cash-count', 'adjustment', 500_000, '2026-10-08'), adjustmentDirection: 'decrease' as const },
  ];

  assert.deepEqual(getStatisticsSummary(transactions), {
    income: 10_000_000,
    expense: 4_000_000,
    net: 6_000_000,
    transactionCount: 4,
    transferTotal: 3_000_000,
    adjustmentTotal: -500_000,
  });
  assert.equal(calculateTransferTotal(transactions), 3_000_000);
  assert.deepEqual(getCategoryIncome(transactions, [
    { id: 'salary', name: 'Salary', color: '#0f0', type: 'income' },
    { id: 'food', name: 'Food', color: '#f00', type: 'expense' },
  ]).map(({ id, total }) => [id, total]), [['salary', 10_000_000]]);
});

test('statistics period ranges cover day, week, month, and year', () => {
  const anchor = new Date(2026, 9, 8, 12);
  const day = getPeriodDateRange('day', anchor);
  const week = getPeriodDateRange('week', anchor);
  const month = getPeriodDateRange('month', anchor);
  const year = getPeriodDateRange('year', anchor);

  assert.equal(day.start.getDate(), 8);
  assert.equal(day.end.getDate(), 8);
  assert.equal(week.start.getDate(), 5);
  assert.equal(week.end.getDate(), 11);
  assert.equal(month.start.getDate(), 1);
  assert.equal(month.end.getDate(), 31);
  assert.equal(year.start.getMonth(), 0);
  assert.equal(year.start.getDate(), 1);
  assert.equal(year.end.getMonth(), 11);
  assert.equal(year.end.getDate(), 31);
});

test('Net Worth derives from all wallet balances including archived wallet history', () => {
  const archivedWallets = wallets.map((wallet) =>
    wallet.id === 'bank' ? { ...wallet, archivedAt: '2026-10-04T00:00:00.000Z' } : wallet,
  );
  const transactions = [
    makeTransaction('income', 'income', 2_000_000, '2026-10-02', 'cash'),
    makeTransaction('expense', 'expense', 1_000_000, '2026-10-03', 'cash'),
    makeTransfer('transfer', 3_000_000, '2026-10-04'),
    { ...makeTransaction('adjust-up', 'adjustment', 1_000_000, '2026-10-05', 'bank'), adjustmentDirection: 'increase' as const },
    { ...makeTransaction('adjust-down', 'adjustment', 500_000, '2026-10-06', 'cash'), adjustmentDirection: 'decrease' as const },
  ];
  const balances = calculateWalletBalances(transactions, archivedWallets);
  const currentNetWorth = Object.values(balances).reduce((total, balance) => total + balance, 0);

  assert.equal(balances.cash, 7_500_000);
  assert.equal(balances.bank, 9_000_000);
  assert.equal(currentNetWorth, 16_500_000);
  assert.equal(
    Object.values(calculateWalletBalances([makeTransfer('net-neutral-transfer', 2_000_000, '2026-10-07')], archivedWallets))
      .reduce((total, balance) => total + balance, 0),
    15_000_000,
  );
});

test('historical Net Worth series follows daily transactions while transfers stay neutral', () => {
  const transactions = [
    makeTransaction('period-income', 'income', 2_000_000, '2026-10-02'),
    makeTransaction('period-expense', 'expense', 500_000, '2026-10-03'),
    makeTransfer('period-transfer', 1_000_000, '2026-10-04'),
    { ...makeTransaction('period-adjustment', 'adjustment', 1_000_000, '2026-10-04'), adjustmentDirection: 'increase' as const },
  ];
  const openingNetWorth = wallets.reduce((total, wallet) => total + wallet.initialBalance, 0);
  const series = getDailyBalanceSeries(transactions, '2026-10-01', '2026-10-04', openingNetWorth);
  const periodChange = (series.at(-1)?.closingBalance ?? openingNetWorth) -
    (series[0]?.openingBalance ?? openingNetWorth);

  assert.deepEqual(series.map((day) => day.closingBalance), [15_000_000, 17_000_000, 16_500_000, 17_500_000]);
  assert.equal(series[3]?.closingBalance, 17_500_000);
  assert.equal(periodChange, 2_500_000);
});

test('Net Worth period change remains an absolute value when beginning worth is zero', () => {
  const series = getDailyBalanceSeries(
    [makeTransaction('first-income', 'income', 500_000, '2026-10-01')],
    '2026-10-01',
    '2026-10-01',
    0,
  );
  const beginning = series[0]?.openingBalance ?? 0;
  const ending = series.at(-1)?.closingBalance ?? beginning;

  assert.equal(beginning, 0);
  assert.equal(ending, 500_000);
  assert.equal(ending - beginning, 500_000);
});

test('historical transfer add, edit, and delete recalculate balance chain without changing total', () => {
  const base = [
    makeTransaction('expense', 'expense', 100_000, '2026-10-01'),
    makeTransaction('income', 'income', 500_000, '2026-10-03'),
  ];
  const added = [...base, makeTransfer('transfer', 200_000, '2026-10-02')];
  const edited = added.map((item) =>
    item.id === 'transfer' ? { ...item, amount: 300_000, date: '2026-10-01' } : item,
  );
  const deleted = edited.filter((item) => item.id !== 'transfer');

  assert.deepEqual(recalculateBalances(added, 5_000_000).map((item) => item.closingBalance), [
    4_900_000, 4_900_000, 5_400_000,
  ]);
  assert.deepEqual(recalculateBalances(edited, 5_000_000).map((item) => item.closingBalance), [
    4_900_000, 4_900_000, 5_400_000,
  ]);
  assert.deepEqual(recalculateBalances(deleted, 5_000_000).map((item) => item.closingBalance), [
    4_900_000, 4_900_000, 5_400_000,
  ]);
});

test('date-range totals include the full local end date and exclude transfers', () => {
  const transactions = [
    makeTransaction('income-1', 'income', 100, '2026-10-01'),
    makeTransaction('income-2', 'income', 200, '2026-10-03'),
    makeTransaction('expense-2', 'expense', 50, '2026-10-03'),
    makeTransfer('transfer', 10_000, '2026-10-03'),
  ];

  assert.equal(getIncomeByDateRange(transactions, '2026-10-01', '2026-10-03'), 300);
  assert.equal(getExpenseByDateRange(transactions, '2026-10-01', '2026-10-03'), 50);
  assert.equal(getNetCashFlowByDateRange(transactions, '2026-10-01', '2026-10-03'), 250);
});

test('daily income, expense, and balance series preserve zero-activity days', () => {
  const transactions = [
    makeTransaction('income', 'income', 500, '2026-10-01'),
    makeTransaction('expense', 'expense', 100, '2026-10-03'),
  ];

  assert.deepEqual(getDailyIncomeSeries(transactions, '2026-10-01', '2026-10-03'), [
    { date: '2026-10-01', value: 500 },
    { date: '2026-10-02', value: 0 },
    { date: '2026-10-03', value: 0 },
  ]);
  assert.deepEqual(getDailyExpenseSeries(transactions, '2026-10-01', '2026-10-03'), [
    { date: '2026-10-01', value: 0 },
    { date: '2026-10-02', value: 0 },
    { date: '2026-10-03', value: 100 },
  ]);
  assert.deepEqual(
    getDailyBalanceSeries(transactions, '2026-10-01', '2026-10-03', 1_000).map(
      ({ openingBalance, closingBalance }) => [openingBalance, closingBalance],
    ),
    [[1_000, 1_500], [1_500, 1_500], [1_500, 1_400]],
  );
});

test('category, wallet, and weekday spending include expenses only', () => {
  const transactions = [
    makeTransaction('food', 'expense', 200, '2026-10-05', 'cash', 'food'),
    makeTransaction('bank-food', 'expense', 100, '2026-10-06', 'bank', 'food'),
    makeTransaction('income', 'income', 900, '2026-10-06'),
    makeTransfer('transfer', 700, '2026-10-06'),
  ];
  const categories = [{ id: 'food', name: 'Food', color: '#fff', type: 'expense' as const }];

  assert.equal(getCategorySpending(transactions, categories)[0]?.total, 300);
  assert.deepEqual(
    getWalletExpenseSpending(transactions, wallets).map(({ walletId, total }) => [walletId, total]),
    [['cash', 200], ['bank', 100]],
  );
  assert.deepEqual(
    getWeekdaySpending(transactions).map(({ day, total }) => [day, total]).filter(([, total]) => total),
    [['Monday', 200], ['Tuesday', 100]],
  );
});

test('period date ranges and comparisons are deterministic, including a zero previous period', () => {
  const range = getPeriodDateRange('week', new Date(2026, 9, 7, 12));
  assert.equal(range.start.getDay(), 1);
  assert.equal(range.start.getDate(), 5);
  assert.equal(range.end.getDate(), 11);

  const comparison = getPeriodComparison(
    [makeTransaction('current-income', 'income', 200, '2026-10-01')],
    [makeTransaction('previous-expense', 'expense', 100, '2026-09-01')],
  );
  assert.equal(comparison.net, 200);
  assert.equal(comparison.previousNet, -100);
  assert.equal(comparison.incomeDelta, null);
  assert.equal(comparison.expenseDelta, -100);
  assert.equal(comparison.netDelta, 300);
});

test('streak completion is idempotent, transaction-ready, and preserves longest through a missed day', () => {
  const dates = ['2026-10-01', '2026-10-02', '2026-10-03'];
  const state = dates.reduce<StreakState>(
    (current, date) => addStreakCompletion(current, date),
    { completionDates: [], manualCompletionDates: [], longestStreak: 0 },
  );
  const duplicate = addStreakCompletion(state, '2026-10-03');
  const missedDay = calculateStreakSummary(duplicate, new Date(2026, 9, 5, 12));

  assert.equal(duplicate.completionDates.length, 3);
  assert.equal(calculateStreakSummary(duplicate, new Date(2026, 9, 3, 12)).checkedToday, true);
  assert.equal(missedDay.currentStreak, 0);
  assert.equal(missedDay.longestStreak, 3);

  const manuallyChecked = addStreakCompletion(duplicate, '2026-10-04');
  assert.equal(calculateStreakSummary(manuallyChecked, new Date(2026, 9, 4, 12)).currentStreak, 4);
});

test('transaction completion follows actual transactions while manual check-ins and longest streak persist', () => {
  const completed = syncStreakWithTransactions(
    { completionDates: [], manualCompletionDates: [], longestStreak: 0 },
    [
      makeTransaction('one', 'expense', 100, '2026-10-01'),
      makeTransaction('two', 'income', 100, '2026-10-02'),
    ],
  );
  const manuallyChecked = addStreakCompletion(completed, '2026-10-03');
  const afterDelete = syncStreakWithTransactions(
    manuallyChecked,
    [makeTransaction('two', 'income', 100, '2026-10-02')],
  );

  assert.deepEqual(afterDelete.completionDates, ['2026-10-02', '2026-10-03']);
  assert.deepEqual(afterDelete.manualCompletionDates, ['2026-10-03']);
  assert.equal(afterDelete.longestStreak, 3);
  assert.equal(calculateStreakSummary(afterDelete, new Date(2026, 9, 3, 12)).currentStreak, 2);
});

const budget: Budget = {
  id: 'budget-food',
  name: 'Food',
  categoryId: 'food',
  amount: 1_000,
  period: 'monthly',
  startDate: '2026-10-01',
  endDate: '2026-10-31',
  archivedAt: null,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
};

test('budget summaries calculate real category expense, remaining, daily values, and statuses', () => {
  const transactions = [
    makeTransaction('expense', 'expense', 750, '2026-10-02'),
    makeTransaction('income', 'income', 10_000, '2026-10-02'),
    makeTransfer('transfer', 500, '2026-10-02'),
    { ...makeTransaction('adjustment', 'adjustment', 250, '2026-10-02'), categoryId: '' },
  ];
  const summary = calculateBudgetSummary(budget, transactions);

  assert.equal(summary.spent, 750);
  assert.equal(summary.remaining, 250);
  assert.equal(summary.percentage, 75);
  assert.equal(summary.status, 'warning');
  assert.equal(summary.dailySpending.length, 31);
  assert.equal(summary.dailySpending[1]?.amount, 750);
  assert.equal(calculateBudgetSummary({ ...budget, amount: 2_000 }, transactions).status, 'safe');
  assert.equal(calculateBudgetSummary({ ...budget, amount: 700 }, transactions).status, 'exceeded');
});

test('recurring budgets evaluate the active weekly, monthly, or yearly cycle within their active dates', () => {
  const recurringBudget = { ...budget, startDate: '2026-10-01', endDate: '2026-12-31' };
  const transactions = [
    makeTransaction('october', 'expense', 100, '2026-10-15'),
    makeTransaction('november', 'expense', 200, '2026-11-15'),
    makeTransaction('december', 'expense', 300, '2026-12-15'),
  ];

  const november = calculateBudgetSummary(
    recurringBudget,
    transactions,
    new Date(2026, 10, 20, 12),
  );
  assert.equal(november.spent, 200);
  assert.equal(november.startDate, '2026-11-01');
  assert.equal(november.endDate, '2026-11-30');
  assert.equal(november.dailySpending.length, 30);
});

test('goal summary derives progress from editable and deletable contribution history and clamps at target', () => {
  const goal: SavingsGoal = {
    id: 'goal',
    name: 'Trip',
    targetAmount: 1_000,
    deadline: null,
    note: '',
    archivedAt: null,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
  };
  const initial: GoalContribution[] = [
    { id: 'a', goalId: 'goal', amount: 300, date: '2026-10-01', note: '', createdAt: '', updatedAt: '' },
    { id: 'b', goalId: 'goal', amount: 400, date: '2026-10-02', note: '', createdAt: '', updatedAt: '' },
  ];
  const edited = initial.map((item) => item.id === 'b' ? { ...item, amount: 800 } : item);

  assert.deepEqual(calculateGoalSummary(goal, initial), {
    currentAmount: 700,
    remaining: 300,
    progress: 70,
  });
  assert.equal(calculateGoalSummary(goal, edited).progress, 100);
  assert.equal(calculateGoalSummary(goal, edited).remaining, 0);
  assert.equal(calculateGoalSummary(goal, edited.filter((item) => item.id !== 'b')).currentAmount, 300);
});

test('persisted Phase 1 data migrates without losing transactions or seeding over empty user data', () => {
  const savedTransaction = makeTransaction('saved-expense', 'expense', 250, '2026-10-02');
  const migrated = migrateFinanceState({
    transactions: [savedTransaction],
    wallets: [{ ...wallets[0], icon: undefined, archivedAt: undefined }],
    categories: [],
  });

  assert.deepEqual(migrated.transactions, [savedTransaction]);
  assert.equal(migrated.wallets[0]?.id, 'cash');
  assert.equal(migrated.wallets[0]?.initialBalance, wallets[0]?.initialBalance);
  assert.equal(migrated.wallets[0]?.archivedAt, null);
  assert.deepEqual(migrated.categories, []);
  assert.deepEqual(migrated.budgets, []);
  assert.deepEqual(migrated.goals, []);
  assert.deepEqual(migrated.goalContributions, []);
  assert.deepEqual(migrated.streak, {
    completionDates: [],
    manualCompletionDates: [],
    longestStreak: 0,
  });

  const emptyPersistedUserData = migrateFinanceState({
    transactions: [],
    wallets: [],
    categories: [],
  });
  assert.deepEqual(emptyPersistedUserData.transactions, []);
  assert.deepEqual(emptyPersistedUserData.wallets, []);
  assert.deepEqual(emptyPersistedUserData.categories, []);
});
