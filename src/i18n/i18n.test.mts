import assert from 'node:assert/strict';
import test from 'node:test';
import type { StateStorage } from 'zustand/middleware';

import { translate } from './translate.ts';
import { createLanguageStore } from './languageStore.ts';
import { formatLocalizedCurrency, formatLocalizedDate } from './formatting.ts';
import { createFinanceStore } from '../store/financeStoreCore.ts';
import type { Language } from './types.ts';
import { formatVndInput } from '../lib/formatters.ts';
import { parseISO } from 'date-fns';

const createMemoryStorage = () => {
  const values = new Map<string, string>();
  const storage: StateStorage = {
    getItem: (name) => values.get(name) ?? null,
    setItem: (name, value) => {
      values.set(name, value);
    },
    removeItem: (name) => {
      values.delete(name);
    },
  };
  return { storage, values };
};

test('language defaults to Vietnamese and can switch in memory', () => {
  const { storage } = createMemoryStorage();
  const store = createLanguageStore(storage);
  assert.equal(store.getState().language, 'vi');
  assert.equal(store.getState().hasHydrated, true);

  store.getState().setLanguage('en');
  assert.equal(store.getState().language, 'en');
  store.getState().setLanguage('vi');
  assert.equal(store.getState().language, 'vi');
});

test('translation dictionaries provide both languages and interpolate variables', () => {
  assert.equal(translate('vi', 'home.today'), 'Hôm nay');
  assert.equal(translate('en', 'home.today'), 'Today');
  assert.equal(translate('vi', 'common.days', { count: 4 }), '4 ngày');
  assert.equal(translate('en', 'common.days', { count: 4 }), '4 days');
  assert.throws(() => translate('en', 'common.days'), /Missing "count" interpolation/);
});

test('currency, numeric input, and date presentation follow the selected language', () => {
  assert.equal(formatLocalizedCurrency(1_250_000, 'vi').replace(/\s/g, ''), '1.250.000₫');
  assert.equal(formatLocalizedCurrency(1_250_000, 'en').replace(/\s/g, ''), '₫1,250,000');
  assert.equal(formatVndInput(1_250_000, 'vi'), '1.250.000');
  assert.equal(formatVndInput(1_250_000, 'en'), '1,250,000');
  const date = parseISO('2026-10-06');
  assert.equal(formatLocalizedDate(date, 'dd/MM/yyyy', 'vi'), '06/10/2026');
  assert.equal(formatLocalizedDate(date, 'MMM d, yyyy', 'en'), 'Oct 6, 2026');
});

test('selected language hydrates from the dedicated local storage key', () => {
  const { storage, values } = createMemoryStorage();
  const store = createLanguageStore(storage);
  store.getState().setLanguage('en');

  const persisted = values.get('ljxmoney.language');
  assert.ok(persisted);
  assert.equal(JSON.parse(persisted).state.language, 'en');

  const restoredStore = createLanguageStore(storage);
  assert.equal(restoredStore.getState().language, 'en');
  restoredStore.getState().setLanguage('vi');
  assert.equal(createLanguageStore(storage).getState().language, 'vi');
});

test('language changes do not alter persisted finance data', () => {
  const { storage } = createMemoryStorage();
  const finance = createFinanceStore(storage);
  const languages = createLanguageStore(storage);
  const now = '2026-10-06T12:00:00.000Z';
  finance.getState().addTransaction({
    id: 'kept-transaction',
    type: 'income',
    amount: 100,
    categoryId: 'salary',
    walletId: 'cash',
    date: '2026-10-06',
    time: '12:00',
    note: '',
    createdAt: now,
    updatedAt: now,
  });
  languages.getState().setLanguage('en');

  const restoredFinance = createFinanceStore(storage);
  assert.equal(restoredFinance.getState().transactions.length, 1);
  assert.equal(restoredFinance.getState().transactions[0]?.id, 'kept-transaction');
  assert.equal(languages.getState().language satisfies Language, 'en');
});
