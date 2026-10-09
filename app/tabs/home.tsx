import { format } from 'date-fns';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BalanceCard } from '../../src/components/BalanceCard';
import { StreakFlame } from '../../src/components/StreakFlame';
import { TransactionRow } from '../../src/components/TransactionRow';
import {
  calculateBudgetSummary,
  calculateGoalSummary,
  calculateStreakSummary,
  calculateWalletBalance,
} from '../../src/features/finance/financeEngine';
import { formatLocalizedCurrency, formatLocalizedDate } from '../../src/i18n/formatting';
import { useI18n } from '../../src/i18n';
import { useFinanceStore } from '../../src/store/financeStore';
import { useAuthStore } from '../../src/auth/authStore';
import { Avatar } from '../../src/profile/Avatar';
import { resolveProfileDisplayName, useProfileAvatarStore } from '../../src/profile/avatarStore';
import { transactionDetailRoute } from '../../src/lib/transactionRoutes';
import { colors, radius, spacing, typography } from '../../src/theme/theme';
import { getStreakColor } from '../../src/features/finance/streakPresentation';

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const prefersReducedMotion = useReducedMotion();
  const { language, t } = useI18n();
  const transactions = useFinanceStore((state) => state.transactions);
  const wallets = useFinanceStore((state) => state.wallets);
  const budgets = useFinanceStore((state) => state.budgets);
  const goals = useFinanceStore((state) => state.goals);
  const contributions = useFinanceStore((state) => state.goalContributions);
  const streak = useFinanceStore((state) => state.streak);
  const hasHydrated = useFinanceStore((state) => state.hasHydrated);
  const hydrationError = useFinanceStore((state) => state.hydrationError);
  const authUser = useAuthStore((state) => state.user);
  const avatarUri = useProfileAvatarStore((state) => (authUser ? state.avatars[authUser.id] ?? null : null));
  const storedDisplayName = useProfileAvatarStore((state) => (authUser ? state.displayNames[authUser.id] ?? null : null));
  const userEmail = authUser?.email ?? '';
  const userDisplayName = resolveProfileDisplayName(storedDisplayName, authUser?.email, t('profile.fallbackName'));
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
  const streakColor = getStreakColor(streakSummary.currentStreak);
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
  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + 96 },
      ]}
      showsVerticalScrollIndicator={false}
    >
      <Animated.View entering={prefersReducedMotion ? undefined : FadeInDown.duration(360)} style={styles.headerRow}>
        <View style={styles.profileWrap}>
          <Avatar
            userEmail={userEmail}
            sourceName={userDisplayName}
            avatarUri={avatarUri}
            size={42}
          />
          <View>
            <Text style={styles.eyebrow}>{formatLocalizedDate(new Date(), 'EEEE, dd MMMM', language)}</Text>
            <Text numberOfLines={1} adjustsFontSizeToFit style={styles.title}>{userDisplayName}</Text>
          </View>
        </View>
        <View
          accessible
          accessibilityLabel={t('common.days', { count: streakSummary.currentStreak })}
          style={styles.streakIndicator}
        >
          <StreakFlame size={24} color={streakColor} />
          <Text style={[styles.streakCount, { color: streakColor }]}>{streakSummary.currentStreak}</Text>
        </View>
      </Animated.View>

      {hydrationError ? (
        <Text accessibilityRole="alert" style={styles.errorBanner}>
          {t('home.dataLoadError')}
        </Text>
      ) : null}

      <Animated.View entering={prefersReducedMotion ? undefined : FadeInDown.delay(80).duration(400)} style={styles.heroStack}>
        <BalanceCard balance={totalBalance} />
      </Animated.View>

      <Animated.View entering={prefersReducedMotion ? undefined : FadeInDown.delay(160).duration(420)} style={styles.section}>
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

      <Animated.View entering={prefersReducedMotion ? undefined : FadeInDown.delay(220).duration(420)} style={styles.quickActions}>
        <QuickAction label={t('home.addExpense')} onPress={() => createTransaction('expense')} variant="expense" />
        <QuickAction label={t('home.addIncome')} onPress={() => createTransaction('income')} variant="income" />
        <QuickAction label={t('home.transfer')} onPress={() => createTransaction('transfer')} variant="transfer" />
      </Animated.View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{t('home.budgets')}</Text>
          <Pressable accessibilityRole="button" onPress={() => router.push('/budgets')} style={({ pressed }) => pressed && styles.viewAllPressed}><Text style={styles.viewAll}>{t('common.viewAll')}</Text></Pressable>
        </View>
        {compactBudgets.length ? (
          compactBudgets.map(({ budget, summary }) => (
            <Pressable
              accessibilityRole="button"
              key={budget.id}
              onPress={() => router.push({ pathname: '/budget/[id]', params: { id: budget.id } })}
              style={({ pressed }) => [styles.compactCard, pressed && styles.compactCardPressed]}
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
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/budgets')}
            style={({ pressed }) => [styles.compactCard, pressed && styles.compactCardPressed]}
          >
            <Text style={styles.compactTitle}>{t('home.createBudget')}</Text>
            <Text style={styles.compactMeta}>{t('home.trackBudget')}</Text>
          </Pressable>
        )}
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{t('home.goals')}</Text>
          <Pressable accessibilityRole="button" onPress={() => router.push('/goals')} style={({ pressed }) => pressed && styles.viewAllPressed}><Text style={styles.viewAll}>{t('common.viewAll')}</Text></Pressable>
        </View>
        {compactGoals.length ? (
          compactGoals.map(({ goal, summary }) => (
            <Pressable
              accessibilityRole="button"
              key={goal.id}
              onPress={() => router.push({ pathname: '/goal/[id]', params: { id: goal.id } })}
              style={({ pressed }) => [styles.compactCard, pressed && styles.compactCardPressed]}
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
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/goals')}
            style={({ pressed }) => [styles.compactCard, pressed && styles.compactCardPressed]}
          >
            <Text style={styles.compactTitle}>{t('home.createGoal')}</Text>
            <Text style={styles.compactMeta}>{t('home.trackGoal')}</Text>
          </Pressable>
        )}
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{t('home.recentTransactions')}</Text>
          <Pressable accessibilityRole="button" onPress={() => router.push('/tabs/transactions')} style={({ pressed }) => pressed && styles.viewAllPressed}>
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
            <Pressable accessibilityRole="button" onPress={() => createTransaction('expense')} style={styles.emptyButton}>
              <Text style={styles.emptyButtonLabel}>{t('empty.addTransaction')}</Text>
            </Pressable>
          </View>
        )}
      </View>
      <View style={styles.manageRow}>
        <Pressable accessibilityRole="button" onPress={() => router.push('/tabs/wallets')}><Text style={styles.manageLabel}>{t('wallet.wallets')}</Text></Pressable>
        <Pressable accessibilityRole="button" onPress={() => router.push('/categories')}><Text style={styles.manageLabel}>{t('category.categories')}</Text></Pressable>
        <Pressable accessibilityRole="button" onPress={() => router.push('/tabs/stats')}><Text style={styles.manageLabel}>{t('navigation.statistics')}</Text></Pressable>
      </View>
    </ScrollView>
  );
}

const QuickAction = ({ label, onPress, variant }: { label: string; onPress: () => void; variant: 'income' | 'expense' | 'transfer' }) => (
  <Pressable
    accessibilityRole="button"
    onPress={onPress}
    style={({ pressed }) => [
      styles.quickActionButton,
      variant === 'income' && styles.quickActionIncome,
      variant === 'expense' && styles.quickActionExpense,
      variant === 'transfer' && styles.quickActionTransfer,
      pressed && styles.quickActionPressed,
    ]}
  >
    <Text style={[styles.quickActionLabel, variant === 'income' && styles.quickActionLabelIncome, variant === 'expense' && styles.quickActionLabelExpense, variant === 'transfer' && styles.quickActionLabelTransfer]}>{label}</Text>
  </Pressable>
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
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, marginBottom: spacing.lg },
  profileWrap: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, flex: 1, minWidth: 0 },
  streakIndicator: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: spacing.xs, minWidth: 56 },
  streakCount: { fontSize: 17, fontWeight: '800', fontVariant: ['tabular-nums'] },
  eyebrow: { color: colors.textSecondary, fontSize: 12, marginBottom: 3, letterSpacing: 0.4 },
  title: { color: colors.text, fontSize: typography.headline, fontWeight: '800', maxWidth: 180 },
  errorBanner: { color: colors.expense, backgroundColor: colors.surface, borderRadius: radius.sm, padding: spacing.md, marginBottom: spacing.md },
  heroStack: { marginBottom: spacing.lg },
  section: { marginTop: spacing.lg },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  sectionTitle: { color: colors.text, fontSize: 18, fontWeight: '700' },
  todayDate: { color: colors.textSecondary, fontSize: 14 },
  viewAll: { color: colors.accent, fontSize: 14, fontWeight: '600' },
  viewAllPressed: { opacity: 0.75 },
  summaryCard: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.border },
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
  quickActionPressed: { opacity: 0.72 },
  quickActionLabel: { color: colors.text, fontSize: 14, fontWeight: '700' },
  quickActionLabelIncome: { color: colors.income },
  quickActionLabelExpense: { color: colors.expense },
  quickActionLabelTransfer: { color: colors.warning },
  compactCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  compactCardPressed: { opacity: 0.75 },
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
