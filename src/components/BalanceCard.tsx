import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { formatLocalizedCurrency } from '../i18n/formatting';
import { useI18n } from '../i18n';
import { useSecurityStore } from '../security/securityStore';
import { colors, radius, spacing } from '../theme/theme';

interface BalanceCardProps {
  balance: number;
}

export const BalanceCard = ({ balance }: BalanceCardProps) => {
  const { language, t } = useI18n();
  const isBalanceHidden = useSecurityStore((state) => state.isBalanceHidden);
  const toggleBalanceHidden = useSecurityStore((state) => state.toggleBalanceHidden);

  return (
    <Animated.View entering={FadeIn.duration(350)} style={styles.card}>
      <View style={styles.glow} />
      <View style={styles.mesh} />
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
      <Animated.Text entering={FadeIn.duration(350)} style={styles.balance} numberOfLines={1} adjustsFontSizeToFit>
        {isBalanceHidden ? '••••••' : formatLocalizedCurrency(balance, language)}
      </Animated.Text>
      <View style={styles.metaRow}>
        <View style={styles.metaPill}>
          <Text style={styles.metaText}>Live</Text>
        </View>
        <Text style={styles.metaLabel}>Portfolio balance</Text>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  card: {
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: '#111111',
    borderRadius: radius.xl,
    padding: spacing.lg,
    minHeight: 180,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
  },
  glow: {
    position: 'absolute',
    right: -36,
    top: -48,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: colors.glow,
  },
  mesh: {
    position: 'absolute',
    inset: 0,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.03)',
    backgroundColor: 'rgba(255,255,255,0.01)',
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    position: 'relative',
    zIndex: 1,
  },
  accent: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.accent, marginRight: spacing.sm },
  label: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1,
    flex: 1,
    textTransform: 'uppercase',
  },
  eyeButton: {
    minWidth: 32,
    minHeight: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  eyeText: { color: colors.text, fontSize: 14, fontWeight: '700' },
  balance: {
    position: 'relative',
    zIndex: 1,
    marginTop: spacing.md,
    color: colors.text,
    fontSize: 36,
    fontWeight: '800',
    letterSpacing: -1.4,
  },
  metaRow: {
    position: 'relative',
    zIndex: 1,
    marginTop: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  metaPill: {
    backgroundColor: 'rgba(104, 242, 154, 0.12)',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
  },
  metaText: {
    color: colors.income,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  metaLabel: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
});
