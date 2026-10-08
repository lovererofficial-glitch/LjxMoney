import { addDays, format, parseISO } from 'date-fns';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { formatLocalizedDate } from '../src/i18n/formatting';
import { useI18n } from '../src/i18n';
import { calculateStreakSummary } from '../src/features/finance/financeEngine';
import { useFinanceStore } from '../src/store/financeStore';
import { colors, radius, spacing } from '../src/theme/theme';

const milestones = [1, 3, 7, 14, 30, 60, 100, 365];

export default function StreakScreen() {
  const insets = useSafeAreaInsets();
  const { language, t } = useI18n();
  const streak = useFinanceStore((state) => state.streak);
  const hasHydrated = useFinanceStore((state) => state.hasHydrated);
  const today = format(new Date(), 'yyyy-MM-dd');
  const summary = useMemo(() => calculateStreakSummary(streak), [streak]);
  const nextMilestone = milestones.find((milestone) => milestone > summary.currentStreak);
  const recentDates = useMemo(
    () => Array.from({ length: 30 }, (_, index) =>
      format(addDays(new Date(), index - 29), 'yyyy-MM-dd'),
    ),
    [],
  );

  if (!hasHydrated) {
    return (
      <View style={[styles.screen, styles.loading]}>
        <Text style={styles.metricLabel}>{t('streak.loading')}</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + spacing.xl },
      ]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}><Text style={styles.back}>{t('common.back')}</Text></Pressable>
        <Text style={styles.title}>{t('streak.title')}</Text>
        <View style={styles.backPlaceholder} />
      </View>
      <View style={styles.summaryCard}>
        <Text style={styles.eyebrow}>{t('streak.current')}</Text>
        <Text style={styles.current}>{summary.currentStreak}<Text style={styles.dayLabel}> {t('common.dayUnit')}</Text></Text>
        <View style={styles.statsRow}>
          <StreakMetric label={t('streak.longest')} value={t('common.days', { count: summary.longestStreak })} />
          <StreakMetric label={t('streak.lastCompleted')} value={summary.lastCompletedDate ? formatLocalizedDate(parseISO(summary.lastCompletedDate), 'dd MMM', language) : '—'} />
        </View>
        {summary.checkedToday ? <Text style={styles.completed}>{t('streak.todayCompleted')}</Text> : null}
      </View>
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>{t('streak.recentActivity')}</Text>
        <View style={styles.days}>
          {recentDates.map((date) => (
            <View
              accessibilityLabel={`${formatLocalizedDate(parseISO(date), 'PPPP', language)}, ${streak.completionDates.includes(date) ? t('streak.complete') : t('streak.incomplete')}`}
              key={date}
              style={[
                styles.day,
                streak.completionDates.includes(date) && styles.dayComplete,
                date === today && styles.dayToday,
              ]}
            >
              <Text style={[styles.dayText, date === today && styles.dayTextToday]}>
                {format(parseISO(date), 'd')}
              </Text>
            </View>
          ))}
        </View>
        <View style={styles.legend}>
          <View style={[styles.legendDot, styles.dayComplete]} />
          <Text style={styles.legendText}>{t('streak.completed')}</Text>
          <View style={[styles.legendDot, styles.dayToday]} />
          <Text style={styles.legendText}>{t('streak.today')}</Text>
        </View>
      </View>
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>{t('streak.milestones')}</Text>
        <View style={styles.milestones}>
          {milestones.map((milestone) => {
            const achieved = summary.longestStreak >= milestone;
            return (
              <View key={milestone} style={[styles.milestone, achieved && styles.milestoneAchieved]}>
                <Text style={[styles.milestoneDays, achieved && styles.milestoneText]}>{milestone}</Text>
                <Text style={[styles.milestoneLabel, achieved && styles.milestoneText]}>{t('common.dayUnit')}</Text>
              </View>
            );
          })}
        </View>
        {nextMilestone ? (
          <Text style={styles.nextMilestone}>
            {t('streak.toNext', { count: Math.max(0, nextMilestone - summary.currentStreak) })}
          </Text>
        ) : null}
      </View>
    </ScrollView>
  );
}

const StreakMetric = ({ label, value }: { label: string; value: string }) => (
  <View style={styles.metric}>
    <Text style={styles.metricLabel}>{label}</Text>
    <Text style={styles.metricValue}>{value}</Text>
  </View>
);

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: spacing.lg },
  header: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  back: { color: colors.accent, fontSize: 15, fontWeight: '600' },
  backPlaceholder: { width: 40 },
  title: { color: colors.text, fontSize: 18, fontWeight: '700' },
  summaryCard: { backgroundColor: colors.surface, borderRadius: radius.xl, padding: spacing.xl, marginBottom: spacing.md },
  eyebrow: { color: colors.textSecondary, fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  current: { color: colors.text, fontSize: 48, fontWeight: '800', marginTop: spacing.xs },
  dayLabel: { color: colors.textSecondary, fontSize: 17, fontWeight: '600' },
  statsRow: { flexDirection: 'row', gap: spacing.xl, marginTop: spacing.lg },
  metric: { flex: 1 },
  metricLabel: { color: colors.textSecondary, fontSize: 12 },
  metricValue: { color: colors.text, fontSize: 14, fontWeight: '700', marginTop: 5 },
  completed: { color: colors.income, fontSize: 14, fontWeight: '700', marginTop: spacing.lg },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.md },
  sectionTitle: { color: colors.text, fontSize: 17, fontWeight: '700', marginBottom: spacing.md },
  days: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  day: { width: '12%', aspectRatio: 1, maxWidth: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: colors.surfaceElevated },
  dayComplete: { backgroundColor: `${colors.income}55` },
  dayToday: { borderWidth: 1, borderColor: colors.accent },
  dayText: { color: colors.textSecondary, fontSize: 12, fontWeight: '600' },
  dayTextToday: { color: colors.accent },
  legend: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.md },
  legendDot: { width: 9, height: 9, borderRadius: 5 },
  legendText: { color: colors.textSecondary, fontSize: 12, marginRight: spacing.md },
  milestones: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  milestone: { width: '22%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, backgroundColor: colors.surfaceElevated },
  milestoneAchieved: { backgroundColor: `${colors.accent}30` },
  milestoneDays: { color: colors.textSecondary, fontSize: 18, fontWeight: '800' },
  milestoneLabel: { color: colors.textSecondary, fontSize: 11 },
  milestoneText: { color: colors.accent },
  nextMilestone: { color: colors.textSecondary, fontSize: 13, marginTop: spacing.md },
});
