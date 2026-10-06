import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { localizeCategoryName, translateFinanceError, useI18n } from '../src/i18n';
import { useFinanceStore } from '../src/store/financeStore';
import { colors, radius, spacing, typography } from '../src/theme/theme';

const categoryTypes = ['expense', 'income'] as const;

export default function CategoriesScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  const categories = useFinanceStore((state) => state.categories);
  const hasHydrated = useFinanceStore((state) => state.hasHydrated);
  const addCategory = useFinanceStore((state) => state.addCategory);
  const updateCategory = useFinanceStore((state) => state.updateCategory);
  const archiveCategory = useFinanceStore((state) => state.archiveCategory);
  const [name, setName] = useState('');
  const [type, setType] = useState<(typeof categoryTypes)[number]>('expense');
  const [editingCategory, setEditingCategory] = useState<(typeof categories)[number] | null>(null);
  const [error, setError] = useState('');

  const visibleCategories = useMemo(
    () => categories.filter((category) => !category.archivedAt),
    [categories],
  );
  const archivedCategories = categories.filter((category) => category.archivedAt);

  if (!hasHydrated) {
    return (
      <View style={[styles.screen, styles.loading]}>
        <Text style={styles.categoryName}>{t('category.loading')}</Text>
      </View>
    );
  }

  const handleSave = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError(t('validation.categoryName'));
      return;
    }
    try {
      if (editingCategory) {
        updateCategory(editingCategory.id, { name: trimmed, type });
        setEditingCategory(null);
      } else {
        addCategory({
          id: `category-${Date.now()}`,
          name: trimmed,
          color: type === 'income' ? '#68F29A' : '#FF6672',
          type,
          icon: type === 'income' ? 'cash' : 'tag',
          archivedAt: null,
        });
      }
    } catch (saveError) {
      setError(translateFinanceError(saveError, t, 'validation.categorySaveFailed'));
      return;
    }
    setName('');
    setType('expense');
    setError('');
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.md }]}>
      <View style={styles.headerRow}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backLabel}>{t('common.back')}</Text>
        </Pressable>
        <Text style={styles.title}>{t('category.categories')}</Text>
        <View style={styles.backButton} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{editingCategory ? t('category.editCategory') : t('category.newCategory')}</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder={t('category.name')}
            placeholderTextColor={colors.textSecondary}
            style={styles.input}
          />

          <Text style={styles.sectionLabel}>{t('category.type')}</Text>
          <View style={styles.typeRow}>
            {categoryTypes.map((option) => (
              <Pressable
                key={option}
                onPress={() => setType(option)}
                style={[styles.typeButton, option === type && styles.typeButtonActive]}
              >
                <Text style={[styles.typeLabel, option === type && styles.typeLabelActive]}>
                  {t(`transaction.${option}`)}
                </Text>
              </Pressable>
            ))}
          </View>

          {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
          <Pressable onPress={handleSave} style={styles.primaryButton}>
            <Text style={styles.primaryLabel}>{editingCategory ? t('common.saveChanges') : t('common.add')}</Text>
          </Pressable>
          {editingCategory ? (
            <Pressable
              onPress={() => {
                setEditingCategory(null);
                setName('');
                setType('expense');
                setError('');
              }}
              style={styles.cancelButton}
            >
              <Text style={styles.cancelLabel}>{t('common.cancel')}</Text>
            </Pressable>
          ) : null}
        </View>

        <View style={styles.listWrap}>
          <Text style={styles.sectionTitle}>{t('category.active')}</Text>
          {visibleCategories.map((category) => (
            <View key={category.id} style={styles.categoryRow}>
              <View style={styles.categoryMeta}>
                <View style={[styles.dot, { backgroundColor: category.color }]} />
                <Text style={styles.categoryName}>{localizeCategoryName(category.id, category.name, t)}</Text>
              </View>
              <Pressable
                onPress={() => {
                  setEditingCategory(category);
                  setName(category.name);
                  setType(category.type);
                  setError('');
                }}
                style={styles.archiveButton}
              >
                <Text style={styles.editText}>{t('common.edit')}</Text>
              </Pressable>
              <Pressable onPress={() => archiveCategory(category.id)} style={styles.archiveButton}>
                <Text style={styles.archiveText}>{t('common.archive')}</Text>
              </Pressable>
            </View>
          ))}
        </View>

        {archivedCategories.length ? (
          <View style={styles.listWrap}>
            <Text style={styles.sectionTitle}>{t('common.archived')}</Text>
            {archivedCategories.map((category) => (
              <View key={category.id} style={styles.categoryRowMuted}>
                <Text style={styles.categoryName}>{localizeCategoryName(category.id, category.name, t)}</Text>
                <Pressable onPress={() => updateCategory(category.id, { archivedAt: null })} style={styles.restoreButton}>
                  <Text style={styles.restoreText}>{t('common.restore')}</Text>
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  loading: { alignItems: 'center', justifyContent: 'center' },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  backButton: { minWidth: 60 },
  backLabel: { color: colors.accent, fontSize: 15 },
  title: { color: colors.text, fontSize: typography.title, fontWeight: '800' },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  cardTitle: { color: colors.text, fontSize: 18, fontWeight: '700', marginBottom: spacing.md },
  sectionLabel: { color: colors.textSecondary, fontSize: 13, fontWeight: '600', marginTop: spacing.md },
  input: {
    minHeight: 52,
    borderRadius: radius.md,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    paddingHorizontal: spacing.md,
    marginTop: spacing.sm,
  },
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  typeButton: {
    paddingHorizontal: spacing.md,
    minHeight: 40,
    borderRadius: radius.sm,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
  },
  typeButtonActive: { backgroundColor: `${colors.accent}22`, borderColor: colors.accent },
  typeLabel: { color: colors.textSecondary, fontSize: 13, fontWeight: '700' },
  typeLabelActive: { color: colors.accent },
  primaryButton: {
    minHeight: 54,
    marginTop: spacing.lg,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
  },
  primaryLabel: { color: colors.background, fontSize: 15, fontWeight: '800' },
  error: { color: colors.expense, fontSize: 13, marginTop: spacing.md },
  cancelButton: { minHeight: 44, justifyContent: 'center', alignItems: 'center', marginTop: spacing.xs },
  cancelLabel: { color: colors.textSecondary, fontSize: 14, fontWeight: '600' },
  listWrap: { marginBottom: spacing.lg },
  sectionTitle: { color: colors.text, fontSize: 18, fontWeight: '700', marginBottom: spacing.md },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  categoryRowMuted: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    opacity: 0.7,
    marginBottom: spacing.sm,
  },
  categoryMeta: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  dot: { width: 10, height: 10, borderRadius: 5, marginRight: spacing.sm },
  categoryName: { color: colors.text, fontSize: 15, fontWeight: '700' },
  archiveButton: { marginLeft: spacing.sm },
  editText: { color: colors.accent, fontSize: 12, fontWeight: '700' },
  archiveText: { color: colors.expense, fontSize: 12, fontWeight: '700' },
  restoreButton: { marginLeft: spacing.sm },
  restoreText: { color: colors.income, fontSize: 12, fontWeight: '700' },
});
