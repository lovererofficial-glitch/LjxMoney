import { StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing } from '../theme/theme';

export interface FinanceChartPoint {
  label: string;
  value: number;
  secondaryValue?: number;
}

interface FinanceBarChartProps {
  title: string;
  points: FinanceChartPoint[];
  primaryColor?: string;
  secondaryColor?: string;
  primaryLabel?: string;
  secondaryLabel?: string;
  centerOnZero?: boolean;
  valueFormatter?: (value: number) => string;
}

export const FinanceBarChart = ({
  title,
  points,
  primaryColor = colors.accent,
  secondaryColor,
  primaryLabel,
  secondaryLabel,
  centerOnZero = false,
  valueFormatter,
}: FinanceBarChartProps) => {
  const maximum = Math.max(
    ...points.flatMap((point) => [Math.abs(point.value), Math.abs(point.secondaryValue ?? 0)]),
    1,
  );
  const chartHeight = 92;

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{title}</Text>
      {primaryLabel || secondaryLabel ? (
        <View style={styles.legend}>
          {primaryLabel ? (
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: primaryColor }]} />
              <Text style={styles.legendText}>{primaryLabel}</Text>
            </View>
          ) : null}
          {secondaryLabel && secondaryColor ? (
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: secondaryColor }]} />
              <Text style={styles.legendText}>{secondaryLabel}</Text>
            </View>
          ) : null}
        </View>
      ) : null}
      <View style={styles.chart}>
        {points.map((point, index) => {
          const primaryHeight =
            point.value === 0 ? 0 : Math.max(2, (Math.abs(point.value) / maximum) * chartHeight);
          const secondaryHeight =
            point.secondaryValue === undefined || point.secondaryValue === 0
              ? 0
              : Math.max(2, (Math.abs(point.secondaryValue) / maximum) * chartHeight);
          const barColor = point.value < 0 ? colors.expense : primaryColor;
          return (
            <View
              accessibilityLabel={`${point.label}: ${valueFormatter?.(point.value) ?? point.value}`}
              key={`${point.label}-${index}`}
              style={styles.column}
            >
              <View style={[styles.bars, { height: chartHeight }, centerOnZero && styles.zeroBars]}>
                {centerOnZero ? <View style={styles.zeroLine} /> : null}
                {centerOnZero ? (
                  <>
                    <View
                      style={[
                        styles.zeroBar,
                        {
                          height: Math.min(chartHeight / 2, primaryHeight),
                          top: point.value < 0 ? chartHeight / 2 : undefined,
                          bottom: point.value >= 0 ? chartHeight / 2 : undefined,
                          left: secondaryColor ? '14%' : '34%',
                          backgroundColor: barColor,
                        },
                      ]}
                    />
                    {secondaryColor ? (
                      <View
                        style={[
                          styles.zeroBar,
                          {
                            height: Math.min(chartHeight / 2, secondaryHeight),
                            top: (point.secondaryValue ?? 0) < 0 ? chartHeight / 2 : undefined,
                            bottom: (point.secondaryValue ?? 0) >= 0 ? chartHeight / 2 : undefined,
                            right: '14%',
                            backgroundColor: secondaryColor,
                          },
                        ]}
                      />
                    ) : null}
                  </>
                ) : (
                  <>
                    <View style={styles.barSlot}>
                  <View
                    style={[
                      styles.bar,
                      {
                        height: primaryHeight,
                        backgroundColor: barColor,
                      },
                    ]}
                  />
                </View>
                    {secondaryColor ? (
                      <View style={styles.barSlot}>
                        <View
                          style={[
                            styles.bar,
                            {
                              height: secondaryHeight,
                              backgroundColor: secondaryColor,
                            },
                          ]}
                        />
                      </View>
                    ) : null}
                  </>
                )}
              </View>
              <Text style={styles.label} numberOfLines={1}>{point.label}</Text>
            </View>
          );
        })}
      </View>
      {valueFormatter && points.length ? (
        <Text style={styles.rangeLabel}>
          {valueFormatter(Math.max(...points.map((point) => Math.abs(point.value))))}
        </Text>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  title: { color: colors.text, fontSize: 17, fontWeight: '700' },
  legend: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { color: colors.textSecondary, fontSize: 12 },
  chart: { height: 120, flexDirection: 'row', alignItems: 'flex-end', marginTop: spacing.md },
  column: { flex: 1, minWidth: 0, alignItems: 'center' },
  bars: { width: '100%', flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center' },
  zeroBars: { position: 'relative' },
  zeroLine: { position: 'absolute', top: '50%', left: 0, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  zeroBar: { position: 'absolute', width: '30%', borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  barSlot: { flex: 1, height: '100%', alignItems: 'center', justifyContent: 'flex-end' },
  bar: { width: '68%', minWidth: 2, borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  label: { color: colors.textSecondary, fontSize: 11, marginTop: 5 },
  rangeLabel: { color: colors.textSecondary, fontSize: 12, textAlign: 'right', marginTop: spacing.xs },
});
