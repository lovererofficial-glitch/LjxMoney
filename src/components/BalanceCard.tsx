import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, useReducedMotion } from 'react-native-reanimated';

import { formatLocalizedCurrency } from '../i18n/formatting';
import { useI18n } from '../i18n';
import { useSecurityStore } from '../security/securityStore';
import { useFinanceStore } from '../store/financeStore';
import { colors, radius, spacing } from '../theme/theme';

interface BalanceCardProps {
  balance: number;
}

export const BalanceCard = ({ balance }: BalanceCardProps) => {
  const { language, t } = useI18n();
  const isBalanceHidden = useSecurityStore((state) => state.isBalanceHidden);
  const toggleBalanceHidden = useSecurityStore((state) => state.toggleBalanceHidden);
  const walletCount = useFinanceStore((state) => state.wallets.filter((wallet) => !wallet.archivedAt).length);
  const prefersReducedMotion = useReducedMotion();

  return (
    <Animated.View entering={prefersReducedMotion ? undefined : FadeInDown.duration(360)} style={styles.card}>
      <View style={styles.glow} />
      <View style={styles.labelRow}>
        <View style={styles.accent} />
        <Text style={styles.label}>{t('home.totalBalance')}</Text>
        <Pressable
          accessibilityRole="switch"
          accessibilityLabel={isBalanceHidden ? t('common.showBalance') : t('common.hideBalance')}
          accessibilityState={{ checked: !isBalanceHidden }}
          onPress={toggleBalanceHidden}
          style={({ pressed }) => [styles.eyeButton, pressed && styles.eyeButtonPressed]}
        >
          <Text style={styles.eyeText}>{isBalanceHidden ? '◉' : '◌'}</Text>
        </Pressable>
      </View>
      <Animated.Text
        entering={prefersReducedMotion ? undefined : FadeInDown.delay(80).duration(320)}
        style={styles.balance}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {isBalanceHidden ? '••••••' : formatLocalizedCurrency(balance, language)}
      </Animated.Text>
      <View style={styles.metaRow}>
        <View style={styles.liveDot} />
        <Text style={styles.metaLabel} numberOfLines={1}>
          {t('home.acrossWallets', { count: walletCount })}
        </Text>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  card: {
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.lg,
    minHeight: 156,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(215, 181, 109, 0.16)',
    shadowColor: '#000',
    shadowOpacity: 0.28,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 12 },
  },
  glow: {
    position: 'absolute',
    right: -36,
    top: -44,
    width: 170,
    height: 170,
    borderRadius: 85,
    backgroundColor: colors.glow,
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
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    flex: 1,
    textTransform: 'uppercase',
  },
  eyeButtonPressed: { opacity: 0.75 },
  eyeButton: {
    minWidth: 32,
    minHeight: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  eyeText: { color: colors.text, fontSize: 14, fontWeight: '700' },
  balance: {
    position: 'relative',
    zIndex: 1,
    marginTop: spacing.md,
    color: colors.text,
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: -1.2,
  },
  metaRow: {
    position: 'relative',
    zIndex: 1,
    marginTop: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.income,
  },
  metaLabel: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    flexShrink: 1,
  },
});
