import {
  addDays,
  addMonths,
  format,
  getDate,
  getDaysInMonth,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
  subMonths,
} from 'date-fns';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radius, spacing, typography } from '../../src/theme/theme';
import { useFinanceStore } from '../../src/store/financeStore';
import { formatLocalizedDate } from '../../src/i18n/formatting';
import { localizeShortWeekday, useI18n } from '../../src/i18n';

const weekDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export default function CalendarScreen() {
  const insets = useSafeAreaInsets();
  const { language, t } = useI18n();
  const transactions = useFinanceStore((state) => state.transactions);
  const hasHydrated = useFinanceStore((state) => state.hasHydrated);
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const days = useMemo(() => {
    const firstDay = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
    return Array.from({ length: 42 }, (_, index) => addDays(firstDay, index));
  }, [month]);
  const activityByDate = useMemo(() => {
    const result = new Map<string, { income: number; expense: number; transfer: boolean }>();
    for (const transaction of transactions) {
      const current = result.get(transaction.date) ?? { income: 0, expense: 0, transfer: false };
      if (transaction.type === 'income') current.income += transaction.amount;
      if (transaction.type === 'expense') current.expense += transaction.amount;
      if (transaction.type === 'transfer') current.transfer = true;
      result.set(transaction.date, current);
    }
    return result;
  }, [transactions]);

  const showMonth = (offset: number) => {
    const nextMonth = offset > 0 ? addMonths(month, 1) : subMonths(month, 1);
    const day = Math.min(getDate(selectedDate), getDaysInMonth(nextMonth));
    setMonth(startOfMonth(nextMonth));
    setSelectedDate(new Date(nextMonth.getFullYear(), nextMonth.getMonth(), day));
  };

  const openDay = (date: Date) => {
    setSelectedDate(date);
    router.push({ pathname: '/day/[date]', params: { date: format(date, 'yyyy-MM-dd') } });
  };

  if (!hasHydrated) {
    return (
      <View style={[styles.loading, { paddingTop: insets.top }]}>
        <Text style={styles.loadingLabel}>{t('common.loading')}</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + 96 },
      ]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <Text style={styles.title}>{t('calendar.title')}</Text>
        <Pressable onPress={() => openDay(new Date())} style={styles.todayButton}>
          <Text style={styles.todayLabel}>{t('calendar.today')}</Text>
        </Pressable>
      </View>

      <View style={styles.calendarCard}>
        <View style={styles.monthHeader}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('calendar.previousMonth')}
            onPress={() => showMonth(-1)}
            style={styles.monthArrow}
          >
            <Text style={styles.arrowText}>‹</Text>
          </Pressable>
          <Text style={styles.monthTitle}>{formatLocalizedDate(month, 'MMMM yyyy', language)}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('calendar.nextMonth')}
            onPress={() => showMonth(1)}
            style={styles.monthArrow}
          >
            <Text style={styles.arrowText}>›</Text>
          </Pressable>
        </View>

        <View style={styles.grid}>
          {weekDays.map((day) => (
            <View key={day} style={styles.weekdayCell}>
              <Text style={styles.weekdayLabel}>{localizeShortWeekday(day, t)}</Text>
            </View>
          ))}
          {days.map((date) => {
            const dateKey = format(date, 'yyyy-MM-dd');
            const activity = activityByDate.get(dateKey);
            const isToday = isSameDay(date, new Date());
            const isSelected = isSameDay(date, selectedDate);
            const inCurrentMonth = isSameMonth(date, month);
            const hasNet = Boolean(activity && activity.income !== activity.expense);

            return (
              <Pressable
                key={dateKey}
                accessibilityRole="button"
                accessibilityLabel={`${formatLocalizedDate(date, 'd MMMM yyyy', language)}${isToday ? `, ${t('calendar.todayAccessibility')}` : ''}`}
                accessibilityState={{ selected: isSelected }}
                onPress={() => openDay(date)}
                style={[
                  styles.dayCell,
                  isToday && styles.todayCell,
                  isSelected && styles.selectedCell,
                  !inCurrentMonth && styles.outsideMonthCell,
                ]}
              >
                <Text
                  style={[
                    styles.dayNumber,
                    isToday && styles.todayNumber,
                    isSelected && styles.selectedNumber,
                    !inCurrentMonth && styles.outsideMonthNumber,
                  ]}
                >
                  {getDate(date)}
                </Text>
                <View style={styles.indicators}>
                  {activity?.income ? <View style={[styles.dot, styles.incomeDot]} /> : null}
                  {activity?.expense ? <View style={[styles.dot, styles.expenseDot]} /> : null}
                  {activity?.transfer ? <View style={[styles.dot, styles.transferDot]} /> : null}
                  {hasNet ? (
                    <View
                      style={[
                        styles.dot,
                        activity && activity.income > activity.expense
                          ? styles.netPositiveDot
                          : styles.netNegativeDot,
                      ]}
                    />
                  ) : null}
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.legend}>
        <Legend color={colors.income} label={t('calendar.income')} />
        <Legend color={colors.expense} label={t('calendar.expense')} />
        <Legend color={colors.accent} label={t('calendar.netPositive')} />
        <Legend color={colors.text} label={t('calendar.transfer')} />
      </View>

      <Pressable
        accessibilityRole="button"
        onPress={() => router.push({ pathname: '/day/[date]', params: { date: format(selectedDate, 'yyyy-MM-dd') } })}
        style={({ pressed }) => [styles.selectedDayCard, pressed && styles.pressed]}
      >
        <View>
          <Text style={styles.selectedDayLabel}>{t('calendar.selectedDay')}</Text>
          <Text style={styles.selectedDayDate}>{formatLocalizedDate(selectedDate, 'EEEE, dd MMMM', language)}</Text>
        </View>
        <Text style={styles.openArrow}>›</Text>
      </Pressable>
    </ScrollView>
  );
}

const Legend = ({ color, label }: { color: string; label: string }) => (
  <View style={styles.legendItem}>
    <View style={[styles.legendDot, { backgroundColor: color }]} />
    <Text style={styles.legendLabel}>{label}</Text>
  </View>
);

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  loadingLabel: { color: colors.textSecondary, fontSize: 15 },
  content: { paddingHorizontal: spacing.lg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  title: { color: colors.text, fontSize: typography.title, fontWeight: '800' },
  todayButton: {
    minHeight: 42,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
  },
  todayLabel: { color: colors.accent, fontSize: 14, fontWeight: '700' },
  calendarCard: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md },
  monthHeader: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  monthArrow: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  arrowText: { color: colors.text, fontSize: 30, fontWeight: '400', marginTop: -4 },
  monthTitle: { color: colors.text, fontSize: 17, fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  weekdayCell: { width: `${100 / 7}%`, height: 36, alignItems: 'center', justifyContent: 'center' },
  weekdayLabel: { color: colors.textSecondary, fontSize: 13, fontWeight: '600' },
  dayCell: {
    width: `${100 / 7}%`,
    minHeight: 54,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
    marginBottom: spacing.xs,
  },
  todayCell: { borderWidth: 1, borderColor: colors.accent },
  selectedCell: { backgroundColor: colors.accent },
  outsideMonthCell: { opacity: 0.38 },
  dayNumber: { color: colors.text, fontSize: 14, fontWeight: '600' },
  todayNumber: { color: colors.accent, fontWeight: '800' },
  selectedNumber: { color: colors.background, fontWeight: '800' },
  outsideMonthNumber: { color: colors.textSecondary },
  indicators: { height: 8, flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 3 },
  dot: { width: 4, height: 4, borderRadius: 2 },
  incomeDot: { backgroundColor: colors.income },
  expenseDot: { backgroundColor: colors.expense },
  transferDot: { backgroundColor: colors.text },
  netPositiveDot: { backgroundColor: colors.accent },
  netNegativeDot: { backgroundColor: colors.textSecondary },
  legend: { flexDirection: 'row', justifyContent: 'center', gap: spacing.md, marginTop: spacing.md },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 6, height: 6, borderRadius: 3 },
  legendLabel: { color: colors.textSecondary, fontSize: 12 },
  selectedDayCard: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    marginTop: spacing.xl,
  },
  selectedDayLabel: { color: colors.textSecondary, fontSize: 13 },
  selectedDayDate: { color: colors.text, fontSize: 16, fontWeight: '700', marginTop: 4 },
  openArrow: { color: colors.accent, fontSize: 28 },
  pressed: { opacity: 0.75 },
});
