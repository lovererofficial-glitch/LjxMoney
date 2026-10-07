import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useI18n } from '../src/i18n';
import { useLanguageStore } from '../src/i18n/runtime';
import type { Language } from '../src/i18n/types';
import { colors, radius, spacing, typography } from '../src/theme/theme';

const languageOptions: Language[] = ['vi', 'en'];

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { language, setLanguage, t } = useI18n();
  const hydrationError = useLanguageStore((state) => state.hydrationError);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.xl },
      ]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.back}>{t('common.back')}</Text>
        </Pressable>
        <Text style={styles.title}>{t('common.settings')}</Text>
        <View style={styles.backButton} />
      </View>

      <Text style={styles.sectionHeading}>{t('settings.general')}</Text>
      <View style={styles.card}>
        <View style={styles.rowHeading}>
          <View>
            <Text style={styles.rowTitle}>{t('settings.language')}</Text>
            <Text style={styles.rowHint}>{t('settings.languageHint')}</Text>
          </View>
          <Text style={styles.currentLanguage}>
            {language === 'vi' ? t('settings.vietnamese') : t('settings.english')}
          </Text>
        </View>
        <View style={styles.divider} />
        {languageOptions.map((option) => (
          <Pressable
            accessibilityRole="radio"
            accessibilityState={{ selected: language === option }}
            key={option}
            onPress={() => setLanguage(option)}
            style={styles.option}
          >
            <Text style={styles.optionLabel}>
              {option === 'vi' ? t('settings.vietnamese') : t('settings.english')}
            </Text>
            <View style={[styles.radio, language === option && styles.radioSelected]}>
              {language === option ? <Text style={styles.checkmark}>✓</Text> : null}
            </View>
          </Pressable>
        ))}
      </View>
      {hydrationError ? <Text accessibilityRole="alert" style={styles.error}>{t('settings.preferenceLoadError')}</Text> : null}
      <View style={[styles.card, styles.accountCard]}>
        <Pressable accessibilityRole="button" onPress={() => router.push('/account')}>
          <View style={styles.rowHeading}>
            <View>
              <Text style={styles.rowTitle}>{t('settings.account')}</Text>
              <Text style={styles.rowHint}>{t('settings.accountHint')}</Text>
            </View>
            <Text style={styles.currentLanguage}>›</Text>
          </View>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.lg },
  header: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xl,
  },
  backButton: { minWidth: 64 },
  back: { color: colors.accent, fontSize: 15, fontWeight: '600' },
  title: { color: colors.text, fontSize: typography.title, fontWeight: '800' },
  sectionHeading: { color: colors.textSecondary, fontSize: 14, fontWeight: '700', marginBottom: spacing.sm },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, paddingHorizontal: spacing.lg },
  rowHeading: { minHeight: 76, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  rowTitle: { color: colors.text, fontSize: 16, fontWeight: '700' },
  rowHint: { color: colors.textSecondary, fontSize: 12, marginTop: 4 },
  currentLanguage: { color: colors.accent, fontSize: 14, fontWeight: '700' },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  option: { minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  optionLabel: { color: colors.text, fontSize: 15, fontWeight: '600' },
  radio: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center', borderRadius: 12, borderWidth: 1, borderColor: colors.border },
  radioSelected: { borderColor: colors.accent, backgroundColor: colors.accent },
  checkmark: { color: colors.background, fontSize: 15, fontWeight: '900' },
  error: { color: colors.expense, fontSize: 13, lineHeight: 19, marginTop: spacing.md },
  accountCard: { marginTop: spacing.md },
});
