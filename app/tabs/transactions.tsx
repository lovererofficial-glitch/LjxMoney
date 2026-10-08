import { parseISO } from 'date-fns';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TransactionRow } from '../../src/components/TransactionRow';
import { formatLocalizedDate } from '../../src/i18n/formatting';
import { localizeCategoryName, localizeWalletName, useI18n } from '../../src/i18n';
import { useFinanceStore } from '../../src/store/financeStore';
import { transactionDetailRoute } from '../../src/lib/transactionRoutes';
import {
  filterAndSortTransactions,
  getTransactionDateRange,
  type TransactionDateFilter,
  type TransactionSortOrder,
  type TransactionTypeFilter,
} from '../../src/lib/transactionSearch';
import type { TranslationKey } from '../../src/i18n';
import { colors, radius, spacing, typography } from '../../src/theme/theme';

export default function TransactionsScreen() {
  const insets = useSafeAreaInsets();
  const { language, t } = useI18n();
  const transactions = useFinanceStore((state) => state.transactions);
  const wallets = useFinanceStore((state) => state.wallets);
  const categories = useFinanceStore((state) => state.categories);
  const hasHydrated = useFinanceStore((state) => state.hasHydrated);
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<TransactionTypeFilter>('all');
  const [walletFilter, setWalletFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [dateFilter, setDateFilter] = useState<TransactionDateFilter>('all');
  const [sortOrder, setSortOrder] = useState<TransactionSortOrder>('newest');
  const [filtersExpanded, setFiltersExpanded] = useState(false);

  const walletNames = useMemo(
    () => new Map(wallets.map((wallet) => [wallet.id, localizeWalletName(wallet.id, wallet.name, t)])),
    [wallets, t],
  );
  const categoryNames = useMemo(
    () => new Map(categories.map((category) => [category.id, localizeCategoryName(category.id, category.name, t)])),
    [categories, t],
  );
  const dateRange = useMemo(() => getTransactionDateRange(dateFilter), [dateFilter]);
  const visibleTransactions = useMemo(
    () => filterAndSortTransactions(
      transactions,
      { query, type: typeFilter, walletId: walletFilter, categoryId: categoryFilter, dateRange, sortOrder },
      walletNames,
      categoryNames,
    ),
    [transactions, query, typeFilter, walletFilter, categoryFilter, dateRange, sortOrder, walletNames, categoryNames],
  );
  const activeFilterCount = [
    query.trim().length > 0,
    typeFilter !== 'all',
    walletFilter.length > 0,
    categoryFilter.length > 0,
    dateFilter !== 'all',
    sortOrder !== 'newest',
  ].filter(Boolean).length;
  const clearFilters = () => {
    setQuery('');
    setTypeFilter('all');
    setWalletFilter('');
    setCategoryFilter('');
    setDateFilter('all');
    setSortOrder('newest');
  };
  const typeOptions: { value: TransactionTypeFilter; label: TranslationKey }[] = [
    { value: 'all', label: 'common.all' },
    { value: 'expense', label: 'transaction.expense' },
    { value: 'income', label: 'transaction.income' },
    { value: 'transfer', label: 'transaction.transfer' },
    { value: 'adjustment', label: 'transaction.adjustment' },
  ];
  const categoryOptions = categories.filter((category) =>
    (typeFilter === 'income' || typeFilter === 'expense')
      ? category.type === typeFilter
      : typeFilter === 'all',
  );

  if (!hasHydrated) {
    return (
      <View style={[styles.screen, styles.centered, { paddingTop: insets.top }]}>
        <Text style={styles.muted}>{t('common.loading')}</Text>
      </View>
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.lg }]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>{t('transaction.activity')}</Text>
          <Text style={styles.subtitle}>
            {t('common.transactions', { count: visibleTransactions.length })}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/transaction/new')}
          style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}
        >
          <Text style={styles.addLabel}>+ {t('common.add')}</Text>
        </Pressable>
      </View>

      <View style={styles.searchField}>
        <Text style={styles.searchIcon}>⌕</Text>
        <TextInput
          accessibilityLabel={t('search.searchTransactions')}
          value={query}
          onChangeText={setQuery}
          placeholder={t('search.searchTransactions')}
          placeholderTextColor={colors.textSecondary}
          returnKeyType="search"
          clearButtonMode="while-editing"
          style={styles.searchInput}
        />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.typeFilters}>
        {typeOptions.map((option) => (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityState={{ selected: typeFilter === option.value }}
            onPress={() => {
              setTypeFilter(option.value);
              const categoryType = categories.find((category) => category.id === categoryFilter)?.type;
              if (
                option.value === 'transfer' ||
                option.value === 'adjustment' ||
                ((option.value === 'income' || option.value === 'expense') && categoryType && categoryType !== option.value)
              ) {
                setCategoryFilter('');
              }
            }}
            style={[styles.typeFilter, typeFilter === option.value && styles.typeFilterActive]}
          >
            <Text style={[styles.typeFilterLabel, typeFilter === option.value && styles.typeFilterLabelActive]}>
              {t(option.label)}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      <View style={styles.filterBar}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: filtersExpanded }}
          onPress={() => setFiltersExpanded((expanded) => !expanded)}
          style={styles.filterToggle}
        >
          <Text style={styles.filterToggleLabel}>
            {t('search.filters')}{activeFilterCount ? ` · ${t('search.activeFilters', { count: activeFilterCount })}` : ''}
          </Text>
        </Pressable>
        {activeFilterCount ? (
          <Pressable accessibilityRole="button" onPress={clearFilters}>
            <Text style={styles.clearLabel}>{t('search.clearFilters')}</Text>
          </Pressable>
        ) : null}
      </View>

      {filtersExpanded ? (
        <ScrollView style={styles.filterPanel} contentContainerStyle={styles.filterPanelContent}>
          <FilterGroup label={t('search.wallet')}>
            <FilterChip label={t('search.allWallets')} selected={!walletFilter} onPress={() => setWalletFilter('')} />
            {wallets.map((wallet) => (
              <FilterChip
                key={wallet.id}
                label={localizeWalletName(wallet.id, wallet.name, t)}
                selected={walletFilter === wallet.id}
                onPress={() => setWalletFilter(wallet.id)}
              />
            ))}
          </FilterGroup>

          {typeFilter !== 'transfer' && typeFilter !== 'adjustment' ? (
            <FilterGroup label={t('search.category')}>
              <FilterChip label={t('search.allCategories')} selected={!categoryFilter} onPress={() => setCategoryFilter('')} />
              {categoryOptions.map((category) => (
                <FilterChip
                  key={category.id}
                  label={localizeCategoryName(category.id, category.name, t)}
                  selected={categoryFilter === category.id}
                  onPress={() => setCategoryFilter(category.id)}
                />
              ))}
            </FilterGroup>
          ) : null}

          <FilterGroup label={t('search.date')}>
            {([
              ['all', 'search.allDates'],
              ['today', 'search.today'],
              ['last7Days', 'search.last7Days'],
              ['thisMonth', 'search.thisMonth'],
            ] as const).map(([value, label]) => (
              <FilterChip key={value} label={t(label)} selected={dateFilter === value} onPress={() => setDateFilter(value)} />
            ))}
          </FilterGroup>

          <FilterGroup label={t('search.sort')}>
            <FilterChip label={t('search.newest')} selected={sortOrder === 'newest'} onPress={() => setSortOrder('newest')} />
            <FilterChip label={t('search.oldest')} selected={sortOrder === 'oldest'} onPress={() => setSortOrder('oldest')} />
          </FilterGroup>
        </ScrollView>
      ) : null}

      {transactions.length > 0 && visibleTransactions.length > 0 ? (
        <FlatList
          data={visibleTransactions}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 96 }]}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <View style={styles.transactionWrap}>
              <Text style={styles.dateTag}>{formatLocalizedDate(parseISO(item.date), 'dd MMM yyyy', language)}</Text>
              <TransactionRow
                transaction={item}
                onPress={() => router.push(transactionDetailRoute(item.id))}
                showDate={false}
              />
            </View>
          )}
        />
      ) : transactions.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>{t('empty.noTransactions')}</Text>
          <Text style={styles.emptyCopy}>{t('empty.incomeExpenseAppear')}</Text>
          <Pressable onPress={() => router.push('/transaction/new')} style={styles.emptyButton}>
            <Text style={styles.emptyButtonLabel}>{t('empty.addTransaction')}</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>{t('search.noMatchingTransactions')}</Text>
          <Pressable onPress={clearFilters} style={styles.emptyButton}>
            <Text style={styles.emptyButtonLabel}>{t('search.clearFilters')}</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, paddingHorizontal: spacing.lg },
  centered: { alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  title: { color: colors.text, fontSize: typography.title, fontWeight: '800' },
  subtitle: { color: colors.textSecondary, fontSize: 14, marginTop: 3 },
  searchField: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  searchIcon: { color: colors.textSecondary, fontSize: 22, marginRight: spacing.sm },
  searchInput: { flex: 1, color: colors.text, fontSize: 15, paddingVertical: spacing.sm },
  typeFilters: { gap: spacing.xs, paddingVertical: spacing.xs },
  typeFilter: {
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: 999,
    backgroundColor: colors.surface,
  },
  typeFilterActive: { backgroundColor: colors.accent },
  typeFilterLabel: { color: colors.textSecondary, fontSize: 13, fontWeight: '600' },
  typeFilterLabelActive: { color: colors.background },
  filterBar: {
    minHeight: 42,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  filterToggle: { minHeight: 40, justifyContent: 'center', paddingRight: spacing.md },
  filterToggleLabel: { color: colors.accent, fontSize: 14, fontWeight: '700' },
  clearLabel: { color: colors.textSecondary, fontSize: 13 },
  filterPanel: { maxHeight: 240, marginBottom: spacing.sm },
  filterPanelContent: { gap: spacing.sm, paddingVertical: spacing.xs },
  filterGroup: { gap: spacing.xs },
  filterGroupLabel: { color: colors.textSecondary, fontSize: 12, fontWeight: '700', marginBottom: 2 },
  filterOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  filterChip: {
    minHeight: 34,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
  },
  filterChipActive: { borderColor: colors.accent, backgroundColor: colors.primarySoft },
  filterChipLabel: { color: colors.textSecondary, fontSize: 12 },
  filterChipLabelActive: { color: colors.accent, fontWeight: '700' },
  addButton: {
    minHeight: 46,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceElevated,
  },
  addLabel: { color: colors.accent, fontSize: 15, fontWeight: '700' },
  listContent: { flexGrow: 1 },
  transactionWrap: { marginBottom: spacing.xs },
  dateTag: { color: colors.textSecondary, fontSize: 13, marginBottom: spacing.xs, marginLeft: 3 },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xl * 2,
  },
  emptyTitle: { color: colors.text, fontSize: 19, fontWeight: '700' },
  emptyCopy: { color: colors.textSecondary, fontSize: 15, textAlign: 'center', lineHeight: 22, marginTop: spacing.sm },
  emptyButton: {
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
    marginTop: spacing.lg,
  },
  emptyButtonLabel: { color: colors.background, fontSize: 15, fontWeight: '800' },
  muted: { color: colors.textSecondary, fontSize: 15 },
  pressed: { opacity: 0.75 },
});

const FilterGroup = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <View style={styles.filterGroup}>
    <Text style={styles.filterGroupLabel}>{label}</Text>
    <View style={styles.filterOptions}>{children}</View>
  </View>
);

const FilterChip = ({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) => (
  <Pressable
    accessibilityRole="button"
    accessibilityState={{ selected }}
    onPress={onPress}
    style={[styles.filterChip, selected && styles.filterChipActive]}
  >
    <Text style={[styles.filterChipLabel, selected && styles.filterChipLabelActive]}>{label}</Text>
  </Pressable>
);
