import { format } from 'date-fns';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BalanceCard } from '../../src/components/BalanceCard';
import { TransactionRow } from '../../src/components/TransactionRow';
import {
  calculateBudgetSummary,
  calculateGoalSummary,
  calculateStreakSummary,
  calculateWalletBalance,
} from '../../src/features/finance/financeEngine';
import { formatLocalizedCurrency, formatLocalizedDate } from '../../src/i18n/formatting';
import { translateFinanceError, useI18n } from '../../src/i18n';
import { useFinanceStore } from '../../src/store/financeStore';
import { useAuthStore } from '../../src/auth/authStore';
import { Avatar } from '../../src/profile/Avatar';
import { useProfileAvatarStore } from '../../src/profile/avatarStore';
import { transactionDetailRoute } from '../../src/lib/transactionRoutes';
import { colors, radius, spacing, typography } from '../../src/theme/theme';

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { language, t } = useI18n();
  const transactions = useFinanceStore((state) => state.transactions);
  const wallets = useFinanceStore((state) => state.wallets);
  const budgets = useFinanceStore((state) => state.budgets);
  const goals = useFinanceStore((state) => state.goals);
  const contributions = useFinanceStore((state) => state.goalContributions);
  const streak = useFinanceStore((state) => state.streak);
  const hasHydrated = useFinanceStore((state) => state.hasHydrated);
  const hydrationError = useFinanceStore((state) => state.hydrationError);
  const checkToday = useFinanceStore((state) => state.checkToday);
  const authUser = useAuthStore((state) => state.user);
  const avatarUri = useProfileAvatarStore((state) => (authUser ? state.avatars[authUser.id] ?? null : null));
  const userEmail = authUser?.email ?? 'LjxMoney';
  const userDisplayName = authUser?.email ? authUser.email.split('@')[0] : 'LjxMoney';
  const today = format(new Date(), 'yyyy-MM-dd');
  const todayTransactions = useMemo(
    () => transactions.filter((transaction) => transaction.date === today),
    [today, transactions],
  );
  const todayIncome = todayTransactions
    .filter((transaction) => transaction.type === 'income')
    .reduce((total, transaction) => total + transaction.amount, 0);
  const todayExpense = todayTransactions
    .filter((transaction) => transaction.type === 'expense')
    .reduce((total, transaction) => total + transaction.amount, 0);
  const totalBalance = useMemo(
    () => wallets.reduce(
      (total, wallet) => total + calculateWalletBalance(wallet.id, transactions, wallets),
      0,
    ),
    [transactions, wallets],
  );
  const streakSummary = useMemo(
    () => calculateStreakSummary(streak),
    [streak],
  );
  const recentTransactions = useMemo(
    () => [...transactions]
      .sort((first, second) =>
        `${second.date}T${second.time}`.localeCompare(`${first.date}T${first.time}`),
      )
      .slice(0, 4),
    [transactions],
  );
  const compactBudgets = useMemo(
    () => budgets
      .filter((budget) => !budget.archivedAt)
      .slice(0, 2)
      .map((budget) => ({
        budget,
        summary: calculateBudgetSummary(budget, transactions),
      })),
    [budgets, transactions],
  );
  const compactGoals = useMemo(
    () => goals
      .filter((goal) => !goal.archivedAt)
      .slice(0, 1)
      .map((goal) => ({
        goal,
        summary: calculateGoalSummary(goal, contributions),
      })),
    [contributions, goals],
  );

  if (!hasHydrated) {
    return (
      <View style={[styles.loading, { paddingTop: insets.top }]}>
        <Text style={styles.loadingLabel}>{t('common.loading')}</Text>
      </View>
    );
  }

  const createTransaction = (type: 'expense' | 'income' | 'transfer') => {
    router.push({ pathname: '/transaction/new', params: { type } });
  };
  const handleCheckToday = () => {
    try {
      checkToday(today);
    } catch (error) {
      Alert.alert(t('dialog.checkInFailed'), translateFinanceError(error, t, 'dialog.tryAgain'));
    }
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + 96 },
      ]}
      showsVerticalScrollIndicator={false}
    >
      <Animated.View entering={FadeInDown.duration(360)} style={styles.headerRow}>
        <View style={styles.profileWrap}>
          <Avatar
            userEmail={userEmail}
            sourceName={userDisplayName}
            avatarUri={avatarUri}
            size={42}
          />
          <View>
            <Text style={styles.eyebrow}>{formatLocalizedDate(new Date(), 'EEEE, dd MMMM', language)}</Text>
            <Text style={styles.title}>LjxMoney</Text>
          </View>
        </View>
        <View style={styles.headerActions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('common.settings')}
            onPress={() => router.push('/tabs/settings')}
            style={({ pressed }) => [styles.settingsButton, pressed && styles.pressed]}
          >
            <Text style={styles.settingsLabel}>⚙</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/transaction/new')}
            style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}
          >
            <Text style={styles.addLabel}>+ {t('common.add')}</Text>
          </Pressable>
        </View>
      </Animated.View>

      {hydrationError ? (
        <Text accessibilityRole="alert" style={styles.errorBanner}>
          {t('home.dataLoadError')}
        </Text>
      ) : null}

      <Animated.View entering={FadeInDown.delay(80).duration(440)} style={styles.heroStack}>
        <BalanceCard balance={totalBalance} />
        <View style={styles.floatingMetrics}>
          <MetricPill label={t('home.income')} value={todayIncome} tone="income" language={language} />
          <MetricPill label={t('home.expense')} value={todayExpense} tone="expense" language={language} />
        </View>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(160).duration(420)} style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{t('home.today')}</Text>
          <Text style={styles.todayDate}>{formatLocalizedDate(new Date(), 'dd MMM', language)}</Text>
        </View>
        <View style={styles.summaryCard}>
          <SummaryItem label={t('home.income')} value={todayIncome} tone="income" language={language} />
          <SummaryItem label={t('home.expense')} value={todayExpense} tone="expense" language={language} />
          <SummaryItem label={t('home.net')} value={todayIncome - todayExpense} tone={todayIncome >= todayExpense ? 'income' : 'expense'} language={language} />
        </View>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(220).duration(420)} style={styles.quickActions}>
        <QuickAction label={t('home.addExpense')} onPress={() => createTransaction('expense')} variant="expense" />
        <QuickAction label={t('home.addIncome')} onPress={() => createTransaction('income')} variant="income" />
        <QuickAction label={t('home.transfer')} onPress={() => createTransaction('transfer')} variant="transfer" />
      </Animated.View>

      <View style={styles.streakCard}>
        <Pressable onPress={() => router.push('/streak')} style={styles.streakCopy}>
          <Text style={styles.streakEyebrow}>{t('home.streak')}</Text>
          <Text style={styles.streakValue}>{t('common.days', { count: streakSummary.currentStreak })}</Text>
          <Text style={styles.streakHint}>
            {streakSummary.checkedToday ? t('home.todayCompleted') : t('home.keepGoing')}
          </Text>
        </Pressable>
        {!streakSummary.checkedToday ? (
          <Pressable
            accessibilityRole="button"
            onPress={handleCheckToday}
            style={styles.checkButton}
          >
            <Text style={styles.checkLabel}>{t('home.checkToday')}</Text>
          </Pressable>
        ) : (
          <Text style={styles.checkDone}>✓</Text>
        )}
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{t('home.budgets')}</Text>
          <Pressable onPress={() => router.push('/budgets')}><Text style={styles.viewAll}>{t('common.viewAll')}</Text></Pressable>
        </View>
        {compactBudgets.length ? (
          compactBudgets.map(({ budget, summary }) => (
            <Pressable
              key={budget.id}
              onPress={() => router.push({ pathname: '/budget/[id]', params: { id: budget.id } })}
              style={styles.compactCard}
            >
              <View style={styles.metricHeader}>
                <Text style={styles.compactTitle}>{budget.name}</Text>
                <Text style={styles.compactValue}>{summary.percentage.toFixed(0)}%</Text>
              </View>
              <View style={styles.track}>
                <View style={[styles.fill, { width: `${Math.min(100, summary.percentage)}%`, backgroundColor: summary.status === 'safe' ? colors.income : summary.status === 'warning' ? colors.warning : colors.expense }]} />
              </View>
              <Text style={styles.compactMeta}>{formatLocalizedCurrency(summary.spent, language)} {t('common.of')} {formatLocalizedCurrency(budget.amount, language)}</Text>
            </Pressable>
          ))
        ) : (
          <Pressable onPress={() => router.push('/budgets')} style={styles.compactCard}>
            <Text style={styles.compactTitle}>{t('home.createBudget')}</Text>
            <Text style={styles.compactMeta}>{t('home.trackBudget')}</Text>
          </Pressable>
        )}
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{t('home.goals')}</Text>
          <Pressable onPress={() => router.push('/goals')}><Text style={styles.viewAll}>{t('common.viewAll')}</Text></Pressable>
        </View>
        {compactGoals.length ? (
          compactGoals.map(({ goal, summary }) => (
            <Pressable
              key={goal.id}
              onPress={() => router.push({ pathname: '/goal/[id]', params: { id: goal.id } })}
              style={styles.compactCard}
            >
              <View style={styles.metricHeader}>
                <Text style={styles.compactTitle}>{goal.name}</Text>
                <Text style={styles.compactValue}>{summary.progress.toFixed(0)}%</Text>
              </View>
              <View style={styles.track}>
                <View style={[styles.fill, { width: `${summary.progress}%`, backgroundColor: colors.accent }]} />
              </View>
              <Text style={styles.compactMeta}>{formatLocalizedCurrency(summary.currentAmount, language)} {t('common.of')} {formatLocalizedCurrency(goal.targetAmount, language)}</Text>
            </Pressable>
          ))
        ) : (
          <Pressable onPress={() => router.push('/goals')} style={styles.compactCard}>
            <Text style={styles.compactTitle}>{t('home.createGoal')}</Text>
            <Text style={styles.compactMeta}>{t('home.trackGoal')}</Text>
          </Pressable>
        )}
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{t('home.recentTransactions')}</Text>
          <Pressable onPress={() => router.push('/tabs/transactions')}>
            <Text style={styles.viewAll}>{t('common.viewAll')}</Text>
          </Pressable>
        </View>
        {recentTransactions.length ? recentTransactions.map((transaction) => (
          <TransactionRow
            key={transaction.id}
            transaction={transaction}
            onPress={() => router.push(transactionDetailRoute(transaction.id))}
          />
        )) : (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>{t('empty.noTransactions')}</Text>
            <Text style={styles.emptyCopy}>{t('empty.startTracking')}</Text>
            <Pressable onPress={() => createTransaction('expense')} style={styles.emptyButton}>
              <Text style={styles.emptyButtonLabel}>{t('empty.addTransaction')}</Text>
            </Pressable>
          </View>
        )}
      </View>
      <View style={styles.manageRow}>
        <Pressable onPress={() => router.push('/tabs/wallets')}><Text style={styles.manageLabel}>{t('wallet.wallets')}</Text></Pressable>
        <Pressable onPress={() => router.push('/categories')}><Text style={styles.manageLabel}>{t('category.categories')}</Text></Pressable>
        <Pressable onPress={() => router.push('/tabs/stats')}><Text style={styles.manageLabel}>{t('navigation.statistics')}</Text></Pressable>
      </View>
    </ScrollView>
  );
}

const QuickAction = ({ label, onPress, variant }: { label: string; onPress: () => void; variant: 'income' | 'expense' | 'transfer' }) => (
  <Pressable accessibilityRole="button" onPress={onPress} style={[styles.quickActionButton, variant === 'income' && styles.quickActionIncome, variant === 'expense' && styles.quickActionExpense, variant === 'transfer' && styles.quickActionTransfer]}>
    <Text style={[styles.quickActionLabel, variant === 'income' && styles.quickActionLabelIncome, variant === 'expense' && styles.quickActionLabelExpense, variant === 'transfer' && styles.quickActionLabelTransfer]}>{label}</Text>
  </Pressable>
);

const MetricPill = ({
  label,
  value,
  tone,
  language,
}: {
  label: string;
  value: number;
  tone: 'income' | 'expense';
  language: 'vi' | 'en';
}) => (
  <View style={[styles.metricPill, tone === 'income' ? styles.metricPillIncome : styles.metricPillExpense]}>
    <Text style={styles.metricPillLabel}>{label}</Text>
    <Text style={[styles.metricPillValue, tone === 'income' ? styles.income : styles.expense]}>{formatLocalizedCurrency(value, language)}</Text>
  </View>
);

const SummaryItem = ({
  label,
  value,
  tone,
  language,
}: {
  label: string;
  value: number;
  tone: 'income' | 'expense';
  language: 'vi' | 'en';
}) => (
  <View style={styles.summaryItem}>
    <Text style={styles.summaryLabel}>{label}</Text>
    <Text adjustsFontSizeToFit numberOfLines={1} style={[styles.summaryValue, tone === 'income' ? styles.income : styles.expense]}>
      {formatLocalizedCurrency(value, language)}
    </Text>
  </View>
);

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  loadingLabel: { color: colors.textSecondary, fontSize: 15 },
  content: { paddingHorizontal: spacing.lg },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.lg },
  profileWrap: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, flex: 1 },
  avatarBubble: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: 'rgba(215, 181, 109, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: colors.accent, fontWeight: '700', fontSize: 14 },
  eyebrow: { color: colors.textSecondary, fontSize: 12, marginBottom: 3, letterSpacing: 0.4 },
  title: { color: colors.text, fontSize: typography.title, fontWeight: '800', letterSpacing: -0.5 },
  addButton: { minHeight: 46, justifyContent: 'center', backgroundColor: colors.surfaceElevated, borderRadius: radius.md, paddingHorizontal: spacing.md },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  settingsButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, backgroundColor: colors.surface },
  settingsLabel: { color: colors.accent, fontSize: 22 },
  addLabel: { color: colors.accent, fontSize: 15, fontWeight: '700' },
  pressed: { opacity: 0.76 },
  errorBanner: { color: colors.expense, backgroundColor: colors.surface, borderRadius: radius.sm, padding: spacing.md, marginBottom: spacing.md },
  heroStack: { marginBottom: spacing.lg },
  floatingMetrics: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md, marginHorizontal: 2 },
  metricPill: {
    flex: 1,
    minHeight: 72,
    borderRadius: radius.lg,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
  },
  metricPillIncome: { backgroundColor: 'rgba(104, 242, 154, 0.06)' },
  metricPillExpense: { backgroundColor: 'rgba(255, 102, 114, 0.06)' },
  metricPillLabel: { color: colors.textSecondary, fontSize: 11, fontWeight: '700', letterSpacing: 0.7, textTransform: 'uppercase' },
  metricPillValue: { marginTop: spacing.xs, fontSize: 18, fontWeight: '700' },
  section: { marginTop: spacing.lg },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  sectionTitle: { color: colors.text, fontSize: 18, fontWeight: '700' },
  todayDate: { color: colors.textSecondary, fontSize: 14 },
  viewAll: { color: colors.accent, fontSize: 14, fontWeight: '600' },
  summaryCard: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' },
  summaryItem: { flex: 1, minWidth: 0, minHeight: 52, justifyContent: 'center' },
  summaryLabel: { color: colors.textSecondary, fontSize: 13, marginBottom: 5 },
  summaryValue: { color: colors.text, fontSize: 15, fontWeight: '700' },
  income: { color: colors.income },
  expense: { color: colors.expense },
  quickActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  quickActionButton: { flex: 1, minHeight: 46, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, borderWidth: 1, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 12, shadowOffset: { width: 0, height: 8 } },
  quickActionIncome: { backgroundColor: 'rgba(104, 242, 154, 0.08)', borderColor: 'rgba(104, 242, 154, 0.18)' },
  quickActionExpense: { backgroundColor: 'rgba(255, 102, 114, 0.08)', borderColor: 'rgba(255, 102, 114, 0.18)' },
  quickActionTransfer: { backgroundColor: 'rgba(215, 181, 109, 0.08)', borderColor: 'rgba(215, 181, 109, 0.18)' },
  quickActionLabel: { color: colors.text, fontSize: 14, fontWeight: '700' },
  quickActionLabelIncome: { color: colors.income },
  quickActionLabelExpense: { color: colors.expense },
  quickActionLabelTransfer: { color: colors.warning },
  streakCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, marginTop: spacing.lg },
  streakCopy: { flex: 1 },
  streakEyebrow: { color: colors.textSecondary, fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  streakValue: { color: colors.text, fontSize: 20, fontWeight: '800', marginTop: 3 },
  streakHint: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
  checkButton: { minHeight: 42, justifyContent: 'center', paddingHorizontal: spacing.md, borderRadius: radius.md, backgroundColor: colors.surfaceElevated },
  checkLabel: { color: colors.accent, fontSize: 13, fontWeight: '700' },
  checkDone: { color: colors.income, fontSize: 20, fontWeight: '800' },
  compactCard: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm },
  metricHeader: { flexDirection: 'row', justifyContent: 'space-between' },
  compactTitle: { color: colors.text, fontSize: 14, fontWeight: '700' },
  compactValue: { color: colors.accent, fontSize: 13, fontWeight: '700' },
  track: { height: 6, backgroundColor: colors.background, borderRadius: 5, overflow: 'hidden', marginTop: spacing.sm },
  fill: { height: '100%', borderRadius: 5 },
  compactMeta: { color: colors.textSecondary, fontSize: 12, marginTop: spacing.xs },
  emptyCard: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, alignItems: 'flex-start' },
  emptyTitle: { color: colors.text, fontSize: 16, fontWeight: '700' },
  emptyCopy: { color: colors.textSecondary, fontSize: 14, lineHeight: 21, marginTop: spacing.xs },
  emptyButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.md, borderRadius: radius.sm, backgroundColor: colors.surfaceElevated, marginTop: spacing.md },
  emptyButtonLabel: { color: colors.accent, fontSize: 14, fontWeight: '700' },
  manageRow: { flexDirection: 'row', justifyContent: 'center', gap: spacing.xl, paddingVertical: spacing.lg },
  manageLabel: { color: colors.textSecondary, fontSize: 13, fontWeight: '600' },
});
