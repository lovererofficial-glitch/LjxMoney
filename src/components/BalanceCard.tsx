import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { formatLocalizedCurrency } from '../i18n/formatting';
import { useI18n } from '../i18n';
import { useSecurityStore } from '../security/securityStore';
import { colors, radius, spacing, typography } from '../theme/theme';

interface BalanceCardProps {
  balance: number;
}

export const BalanceCard = ({ balance }: BalanceCardProps) => {
  const { language, t } = useI18n();
  const isBalanceHidden = useSecurityStore((state) => state.isBalanceHidden);
  const toggleBalanceHidden = useSecurityStore((state) => state.toggleBalanceHidden);
  return (
    <View style={styles.card}>
      <View style={styles.labelRow}>
        <View style={styles.accent} />
        <Text style={styles.label}>{t('home.totalBalance')}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={isBalanceHidden ? 'Show balance' : 'Hide balance'}
          onPress={toggleBalanceHidden}
          style={styles.eyeButton}
        >
          <Text style={styles.eyeText}>{isBalanceHidden ? '◉' : '◌'}</Text>
        </Pressable>
      </View>
      <Animated.Text entering={FadeIn.duration(220)} style={styles.balance} numberOfLines={1} adjustsFontSizeToFit>
        {isBalanceHidden ? '••••••' : formatLocalizedCurrency(balance, language)}
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
    flex: 1,
  },
  eyeButton: {
    minWidth: 30,
    minHeight: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
  },
  eyeText: { color: colors.text, fontSize: 14, fontWeight: '700' },
  balance: {
    marginTop: spacing.sm,
    color: colors.text,
    fontSize: typography.display,
    fontWeight: '800',
    letterSpacing: -1,
  },
});
