import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { formatLocalizedCurrency } from '../i18n/formatting';
import { useI18n } from '../i18n';
import { colors, radius, spacing, typography } from '../theme/theme';

interface BalanceCardProps {
  balance: number;
}

export const BalanceCard = ({ balance }: BalanceCardProps) => {
  const { language, t } = useI18n();
  return (
    <View style={styles.card}>
      <View style={styles.labelRow}>
        <View style={styles.accent} />
        <Text style={styles.label}>{t('home.totalBalance')}</Text>
      </View>
      <Animated.Text entering={FadeIn.duration(220)} style={styles.balance} numberOfLines={1} adjustsFontSizeToFit>
        {formatLocalizedCurrency(balance, language)}
      </Animated.Text>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.lg,
    padding: spacing.lg,
    minHeight: 130,
    justifyContent: 'center',
  },
  labelRow: { flexDirection: 'row', alignItems: 'center' },
  accent: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.accent, marginRight: spacing.sm },
  label: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1,
  },
  balance: {
    marginTop: spacing.sm,
    color: colors.text,
    fontSize: typography.display,
    fontWeight: '800',
    letterSpacing: -1,
  },
});
